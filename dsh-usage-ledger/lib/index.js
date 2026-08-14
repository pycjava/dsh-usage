/**
 * dsh-usage-ledger: cross-session LLM token-usage accounting.
 *
 * The service observes the `llm/stream` waterfall — the single seam every
 * model call in this process crosses (agent loop, subagents, session titles,
 * compaction summaries) — and records one ledger entry per call that reports
 * provider usage. Entries persist in the plugin's own SQLite file at
 * `$DSH_HOME/storages/usage-ledger.sqlite` (node:sqlite, WAL), so totals
 * survive restarts and span every session, model, and provider in every
 * profile shape (web, headless, TUI). If the store cannot open, the ledger
 * degrades to an in-memory record for the process lifetime.
 *
 * Provider-reported usage is always preferred; with `estimateFallback`
 * enabled, calls that report no usage chunk are priced by the token-meter's
 * fixed heuristic and stamped `estimated`, so reported and estimated figures
 * never mix silently.
 *
 * Surfaces:
 *   - `/usage` command: text report + JSON/CSV export
 *   - `usageLedger` service: query API (the `usage_stats` tool consumes it)
 *
 * Token counts only — no pricing, no currency.
 *
 * @module dsh-usage-ledger
 */

import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import { USAGE, parseCommandArgs } from './args.js'
import { DAY_MS, aggregate, entryFromCall, parsePeriod } from './ledger.js'
import { renderCsv, renderJson, renderTextReport } from './report.js'
import { openLedgerStore } from './store.js'

export const name = 'usage-ledger'

/** Ledger plugin configuration; edited through this row's config in a patch layer. */
export const Config = z.object({
  /**
   * When a call reports no provider usage, record a heuristic estimate
   * (token-meter density: chars/4 + structural overhead) stamped `estimated`.
   */
  estimateFallback: z.boolean().default(false),
  /** Drop entries older than this many days (0 = keep forever). */
  retentionDays: z.natural().default(0),
  /** Flush the in-memory buffer to SQLite at most this often. */
  flushIntervalMs: z.natural().min(1000).default(5000),
  /** Flush as soon as this many entries are buffered (before the timer). */
  flushEveryEntries: z.natural().min(1).default(32),
  /** Cap for the in-memory fallback ledger (when the store cannot open). */
  maxMemoryEntries: z.natural().min(1).default(200_000),
})

export class UsageLedgerService extends Service {
  static Config = Config
  static inject = ['dshHomePath']

  /** Durable entries (id -> entry), mirrored from the SQLite store. */
  records = new Map()
  /** Entries captured in this process but not yet flushed. */
  pending = new Map()
  /** The opened ledger store, or undefined while unavailable. */
  store = undefined
  /** The in-flight flush promise (one writer). */
  flushing = undefined
  /** One-shot flush timer handle. */
  flushTimer = undefined
  /** Entries dropped by the in-memory cap (reported, never silent). */
  memoryDropped = 0
  /** The token-meter service, when available (estimate fallback). */
  tokenMeter = undefined

  constructor(ctx, config) {
    super(ctx, 'usageLedger')
    this.config = config
  }

  async [Service.init]() {
    // The capture seam is registered first: rows load in dependency order, and
    // every llm/stream dispatch from now on must cross this listener.
    this.ctx.on('llm/stream', (options, next) => this.wrapStream(options, next))

    // The token meter (base layer, every profile) prices estimates with the
    // same heuristic the context meter uses.
    this.ctx.inject(['tokenMeter'], (meterCtx) => {
      this.tokenMeter = meterCtx.tokenMeter
    })

    // Open the store synchronously so no entry captured during loading can
    // slip past durability. A failed open (missing node:sqlite, unwritable
    // home) degrades to the in-memory ledger instead of failing the tree.
    try {
      const path = this.ctx.dshHomePath('storages', 'usage-ledger.sqlite')
      this.store = openLedgerStore(path)
      this.records = this.store.loadAll()
      this.ctx.logger.info(`usage-ledger: durable store attached at ${path} (${this.records.size} stored entries)`)
      this.ctx.effect(() => () => this.closeStore(), 'usage-ledger: store lifecycle')
    } catch (error) {
      this.ctx.logger.warn(`usage-ledger: store unavailable, running in-memory: ${error instanceof Error ? error.message : String(error)}`)
    }

    // The /usage command; the commands registry is part of the base layer.
    this.ctx.inject(['commands'], (cmdCtx) => {
      cmdCtx.effect(() => cmdCtx.commands.register({
        name: 'usage',
        description: 'Token usage report across sessions (this month by default)',
        input: { hint: '[period] [--by model|provider|day|session] [--json file] [--csv file]' },
        handler: (invocation) => this.runCommand(invocation),
      }), 'usage-ledger: /usage command')
    })

    this.ctx.logger.info('usage-ledger: recording all llm/stream calls')
  }

  /**
   * llm/stream middleware: pass every chunk through untouched and record one
   * entry when the stream reports provider usage. Recording happens on stream
   * end (or abort), so a failed call without a usage chunk never inflates the
   * ledger, and the `finish` chunk's replayState marks replayed responses.
   * With `estimateFallback`, a usage-less stream is instead heuristically
   * priced from the request and the accumulated output deltas.
   * @param options - the GenerateOptions the caller assembled.
   * @param next - the inner stream (already wrapped by earlier middleware).
   * @returns the observed stream.
   */
  wrapStream(options, next) {
    const inner = next()
    const ledger = this
    return (async function* () {
      let usage
      let replayed = false
      let outputChars = 0
      let outputOverhead = 0
      try {
        for await (const chunk of inner) {
          if (chunk !== null && typeof chunk === 'object') {
            if (chunk.type === 'usage' && usage === undefined) usage = chunk.usage
            else if (chunk.type === 'finish' && chunk.replayState !== undefined) replayed = true
            else if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') outputChars += typeof chunk.text === 'string' ? chunk.text.length : 0
            else if (chunk.type === 'tool-call-delta') outputChars += (typeof chunk.argumentsDelta === 'string' ? chunk.argumentsDelta.length : 0) + (typeof chunk.name === 'string' ? chunk.name.length : 0)
            else if (chunk.type === 'block-end') outputOverhead += 4
          }
          yield chunk
        }
      } finally {
        if (usage !== undefined) {
          ledger.record({ options, usage, replayed, time: Date.now() })
        } else if (ledger.config.estimateFallback) {
          ledger.record({
            options,
            usage: ledger.estimateUsage(options, outputChars, outputOverhead),
            replayed,
            estimated: true,
            time: Date.now(),
          })
        }
      }
    })()
  }

  /**
   * Heuristic price for a usage-less call: the token meter's fixed density
   * (chars/4 + structural overhead) over the request, plus the same density
   * over the output deltas already observed.
   * @returns { inputTokens, outputTokens } — always stamped `estimated`.
   */
  estimateUsage(options, outputChars, outputOverhead) {
    let input = 0
    if (typeof options?.system === 'string' && options.system !== '') input += Math.ceil(options.system.length / 4)
    const messages = options?.messages
    const meter = this.tokenMeter
    if (Array.isArray(messages)) {
      for (const message of messages) {
        input += meter !== undefined ? meter.estimateMessage(message) : roughEstimateMessage(message)
      }
    }
    return { inputTokens: input, outputTokens: Math.ceil(outputChars / 4) + outputOverhead }
  }

  /** Buffer one captured call; flush eagerly when the batch fills. */
  record(raw) {
    const entry = entryFromCall({ ...raw, id: crypto.randomUUID() })
    this.pending.set(entry.id, entry)
    if (this.store === undefined) {
      if (this.pending.size > this.config.maxMemoryEntries) {
        const oldest = this.pending.keys().next().value
        if (oldest !== undefined) this.pending.delete(oldest)
        this.memoryDropped += 1
      }
      return
    }
    this.scheduleFlush()
    if (this.pending.size >= this.config.flushEveryEntries) {
      void this.flush().catch((error) => this.warnFlush(error))
    }
  }

  /** Write every buffered entry into the SQLite store (single writer chain). */
  flush() {
    if (this.store === undefined || this.pending.size === 0) return Promise.resolve()
    if (this.flushing !== undefined) return this.flushing
    const store = this.store
    const batch = [...this.pending.entries()]
    this.pending.clear()
    this.flushing = (async () => {
      for (const [id, entry] of batch) {
        store.put(id, entry.time, entry)
        this.records.set(id, entry)
      }
      this.prune()
      this.ctx.logger.debug(`usage-ledger: flushed ${batch.length} entries (${this.records.size} durable)`)
    })().catch((error) => {
      for (const [id, entry] of batch) if (!this.pending.has(id)) this.pending.set(id, entry)
      this.scheduleFlush()
      throw error
    }).finally(() => {
      this.flushing = undefined
    })
    return this.flushing
  }

  warnFlush(error) {
    this.ctx.logger.warn(`usage-ledger: flush failed (${this.pending.size} entries retained): ${error instanceof Error ? error.message : String(error)}`)
  }

  /** Arm the one-shot flush timer for the durable ledger. */
  scheduleFlush() {
    if (this.flushTimer !== undefined || this.store === undefined) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined
      if (this.pending.size > 0) void this.flush().catch((error) => this.warnFlush(error))
    }, this.config.flushIntervalMs)
    if (typeof this.flushTimer.unref === 'function') this.flushTimer.unref()
  }

  /** Best-effort retention: drop durable entries older than retentionDays. */
  prune() {
    if (!(this.config.retentionDays > 0) || this.store === undefined) return
    const cutoff = Date.now() - this.config.retentionDays * DAY_MS
    for (const [id, entry] of this.records) if (entry.time < cutoff) this.records.delete(id)
    for (const [id, entry] of this.pending) if (entry.time < cutoff) this.pending.delete(id)
    const removed = this.store.pruneBefore(cutoff)
    if (removed > 0) this.ctx.logger.debug(`usage-ledger: retention removed ${removed} entries`)
  }

  /** Drain buffered entries and close the store on teardown. */
  async closeStore() {
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer)
      this.flushTimer = undefined
    }
    await this.flush()
    const store = this.store
    this.store = undefined
    if (store !== undefined) store.close()
  }

  /**
   * Query the ledger (durable + pending) for one period and dimension.
   * @param options - { from, to, by?, includeReplayed? }
   * @returns aggregation plus the raw entry list and report metadata.
   */
  query(options) {
    const { from, to } = options
    const by = options.by ?? 'model'
    const includeReplayed = options.includeReplayed === true
    let replayedExcluded = 0
    const entries = []
    const accept = (entry) => {
      if (entry.time < from || entry.time >= to) return
      if (entry.replayed === true && !includeReplayed) {
        replayedExcluded += 1
        return
      }
      entries.push(entry)
    }
    for (const entry of this.records.values()) accept(entry)
    for (const entry of this.pending.values()) accept(entry)
    const aggregated = aggregate(entries, by)
    // Reported vs estimated split: the trust budget of the report.
    let reportedCalls = 0
    let reportedTokens = 0
    let estimatedTokens = 0
    for (const entry of entries) {
      const tokens = entry.inputTokens + (entry.cacheReadTokens ?? 0) + (entry.cacheWriteTokens ?? 0) + entry.outputTokens
      if (entry.estimated === true) estimatedTokens += tokens
      else {
        reportedCalls += 1
        reportedTokens += tokens
      }
    }
    aggregated.totals.reportedCalls = reportedCalls
    aggregated.totals.reportedTokens = reportedTokens
    aggregated.totals.estimatedTokens = estimatedTokens
    return {
      ...aggregated,
      replayedExcluded,
      entries,
      from,
      to,
      dimension: by,
    }
  }

  /** /usage handler: parse args, aggregate, render, and export on request. */
  async runCommand(invocation) {
    const parsed = parseCommandArgs(invocation.rawInput)
    if (parsed.error !== undefined) return { kind: 'error', text: `${parsed.error}\n\n${USAGE}` }
    if (parsed.help) return { kind: 'success', text: USAGE }
    const period = parsePeriod(parsed.period, Date.now())
    if (!period.ok) return { kind: 'error', text: `${period.error}\n\n${USAGE}` }
    const result = this.query({
      from: period.from,
      to: period.to,
      by: parsed.by,
      includeReplayed: parsed.includeReplayed,
    })
    let text = renderTextReport({ ...result, label: period.label })
    const baseDir = invocation.agent?.session?.header?.cwd ?? process.cwd()
    if (parsed.json !== undefined) {
      const target = parsed.json ?? defaultExportName('json', period)
      try {
        const file = await this.writeExport(baseDir, target, renderJson(result.entries, {
          period: period.label,
          from: period.from,
          to: period.to,
        }))
        text += `\n\nJSON report written to ${file}`
      } catch (error) {
        return { kind: 'error', text: `could not write JSON report: ${error instanceof Error ? error.message : String(error)}` }
      }
    }
    if (parsed.csv !== undefined) {
      const target = parsed.csv ?? defaultExportName('csv', period)
      try {
        const file = await this.writeExport(baseDir, target, renderCsv(result.rows))
        text += `\n\nCSV report written to ${file}`
      } catch (error) {
        return { kind: 'error', text: `could not write CSV report: ${error instanceof Error ? error.message : String(error)}` }
      }
    }
    return { kind: 'success', text }
  }

  /** Write one export file under the session workspace (or the cwd). */
  async writeExport(baseDir, target, content) {
    const file = isAbsolute(target) ? target : resolve(baseDir, target)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, content, 'utf8')
    return file
  }
}

/** Fixed-density fallback matching the token meter's published heuristic. */
function roughEstimateMessage(message) {
  let tokens = 4
  for (const block of message?.content ?? []) tokens += roughEstimateBlock(block)
  return tokens
}

function roughEstimateBlock(block) {
  switch (block?.type) {
    case 'text':
    case 'reasoning':
      return Math.ceil((block.text ?? '').length / 4) + 4
    case 'tool-call':
      return Math.ceil((block.name ?? '').length / 4) + Math.ceil((block.arguments ?? '').length / 4) + 4
    case 'tool-result': {
      let tokens = 4
      for (const inner of block.content ?? []) tokens += roughEstimateBlock(inner)
      return tokens
    }
    default:
      return 4 + Math.ceil(JSON.stringify(block).length / 4)
  }
}

function defaultExportName(kind, period) {
  const stamp = (ms) => {
    const date = new Date(ms)
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  }
  return `usage-${stamp(period.from)}..${stamp(Math.min(period.to, Date.now()))}.${kind}`
}

export default UsageLedgerService
