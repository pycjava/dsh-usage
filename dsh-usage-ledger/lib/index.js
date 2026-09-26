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
 *   - `usageLedger` service: query API (the `usage_stats` tool consumes it)
 *   - `/api/usage-ledger/*` Fetch routes: aggregates for the browser half (the
 *     数据与统计 settings section, served from lib/client.js) plus live
 *     provider quotas (`quotas`), read from the routes the deployment
 *     configures and reported as the vendors themselves state them
 *
 * Token counts only — no pricing, no currency conversion. Provider quotas are
 * live reads of what the vendor reports (a pay-as-you-go balance included);
 * they are never ledger entries, never aggregated, and never derived from
 * token counts.
 *
 * @module dsh-usage-ledger
 */

import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { DAY_MS, aggregate, entryFromCall, parsePeriod, requeueUnwritten } from './ledger.js'
import { createQuotaCache, discoverTargets, resolveTargetAuth } from './quota.js'
import { openLedgerStore } from './store.js'
import { envelopeFetchHandler, runDashboardQuery, runQuotaQuery } from './rpc.js'
import { consumeInner, markDelegated } from './nesting.js'

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
  /**
   * Provider quota probes: what the configured LLM routes have left, read
   * live from the vendors' own quota APIs. Route discovery is zero-config —
   * the settings tree already names every route and its credential — so these
   * keys only tune behavior or repair a vendor whose endpoint moved.
   */
  quota: z.object({
    /** Probe configured routes at all (off = no quota block, no network). */
    enabled: z.boolean().default(true),
    /** Serve one reading for this long before probing again. */
    ttlMs: z.natural().min(1000).default(300_000),
    /** Network bound for one route's probe. */
    timeoutMs: z.natural().min(1000).default(15_000),
    /**
     * Per-route overrides keyed by provider route id: force a probe family,
     * point at a moved endpoint, or name a different credential reference.
     */
    providers: z.dict(z.object({
      probe: z.string().default(''),
      url: z.string().default(''),
      credentialRef: z.string().default(''),
    })).default({}),
  }),
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
  /** The settings service, when available (quota route discovery). */
  settings = undefined
  /** The credentials service, when available (quota keys). */
  credentials = undefined
  /** TTL cache shared by the panel and the tool. */
  quotaCache = undefined

  constructor(ctx, config) {
    super(ctx, 'usageLedger')
    this.config = config
    const quota = config?.quota ?? {}
    this.quotaCache = createQuotaCache({
      ttlMs: Number.isFinite(quota.ttlMs) ? quota.ttlMs : undefined,
      timeoutMs: Number.isFinite(quota.timeoutMs) ? quota.timeoutMs : undefined,
    })
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

    // Provider quotas need two seams that a deployment may or may not mount:
    // the settings tree (which routes exist, and under which credential
    // reference) and the credentials store (the keys themselves). Both
    // optional — a profile without them simply shows no quota block, and the
    // ledger keeps working unchanged.
    this.ctx.inject(['settings'], (settingsCtx) => {
      this.settings = settingsCtx.settings
    })
    this.ctx.inject(['credentials'], (credentialsCtx) => {
      this.credentials = credentialsCtx.credentials
    })

    // Open the store synchronously so no entry captured during loading can
    // slip past durability. A failed open (missing node:sqlite, unwritable
    // home) degrades to the in-memory ledger instead of failing the tree.
    let opened = undefined
    try {
      const path = this.ctx.dshHomePath('storages', 'usage-ledger.sqlite')
      opened = openLedgerStore(path)
      const loaded = opened.loadAll()
      this.store = opened
      this.records = loaded.records
      if (loaded.corrupt > 0) {
        this.ctx.logger.warn(`usage-ledger: skipped ${loaded.corrupt} unreadable stored entr${loaded.corrupt === 1 ? 'y' : 'ies'}`)
      }
      this.ctx.logger.info(`usage-ledger: durable store attached at ${path} (${this.records.size} stored entries)`)
    } catch (error) {
      if (opened !== undefined) {
        try { opened.close() } catch {}
      }
      this.store = undefined
      this.records = new Map()
      this.ctx.logger.warn(`usage-ledger: store unavailable, running in-memory: ${error instanceof Error ? error.message : String(error)}`)
    }
    this.ctx.effect(() => () => this.closeStore(), 'usage-ledger: store lifecycle')

    this.ctx.logger.info('usage-ledger: recording all llm/stream calls')

    // The browser half (the 数据与统计 settings section) pulls aggregates
    // through exact Fetch routes under the shared `/api` channel — inside
    // Connection's authentication fence, and the one registration style this
    // runtime resolves from a plugin fiber (rpc.handle reaches for webServer
    // through the caller's context, which a third-party plugin cannot
    // satisfy). Profiles without a connection service (headless, TUI) never
    // fire this optional injection, and the ledger keeps working unchanged.
    this.ctx.inject(['connection'], (connCtx) => {
      const endpoints = {
        '/api/usage-ledger/dashboard': (payload) => runDashboardQuery(payload, (options) => this.query(options)),
        '/api/usage-ledger/quotas': (payload) => runQuotaQuery(payload, (options) => this.quotas(options)),
      }
      for (const [path, run] of Object.entries(endpoints)) {
        connCtx.connection.fetch.register({
          path,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: envelopeFetchHandler(run),
        })
      }
    })
  }

  /**
   * llm/stream middleware: pass every chunk through untouched and record one
   * entry when the stream reports provider usage. Recording happens on stream
   * end (or abort), so a failed call without a usage chunk never inflates the
   * ledger, and an all-zero usage (error-path completions) is skipped too —
   * nothing was consumed, nothing is billable. The finish chunk's
   * `replayState` is provenance metadata present on every pi-ai completion
   * (it feeds later history reconstruction), NOT a replay marker, so it is
   * deliberately ignored. With `estimateFallback`, a usage-less stream is
   * instead heuristically priced from the request and the accumulated output
   * deltas.
   *
   * Only the innermost call of a delegation chain is recorded. A delegating
   * wrapper (e.g. modlens' `(modlens vision)` facade) forwards to a real
   * upstream by re-entering `ctx.llm.stream(...)`, so the same physical call
   * crosses this waterfall twice and would be counted twice. `markDelegated()`
   * flags the enclosing dispatch when such a delegation happens, and the
   * record decision skips any dispatch marked `delegated` — the inner (real)
   * call is the one that records.
   * @param options - the GenerateOptions the caller assembled.
   * @param next - the inner stream (already wrapped by earlier middleware).
   * @returns the observed stream.
   */
  wrapStream(options, next) {
    // A dispatch created while another dispatch is being consumed is a
    // delegation: it flips the enclosing dispatch's flag, so the enclosing
    // (facade) call does not also record the same upstream usage.
    markDelegated()
    const inner = next()
    const ledger = this
    return (async function* () {
      let usage
      let outputChars = 0
      let outputOverhead = 0
      for await (const chunk of consumeInner(inner, (store) => {
        if (store.delegated) return
        if (usage !== undefined) {
          if (usageHasTokens(usage)) ledger.record({ options, usage, time: Date.now() })
        } else if (ledger.config.estimateFallback) {
          ledger.record({
            options,
            usage: ledger.estimateUsage(options, outputChars, outputOverhead),
            estimated: true,
            time: Date.now(),
          })
        }
      })) {
        if (chunk !== null && typeof chunk === 'object') {
          if (chunk.type === 'usage' && usage === undefined) usage = chunk.usage
          else if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') outputChars += typeof chunk.text === 'string' ? chunk.text.length : 0
          else if (chunk.type === 'tool-call-delta') outputChars += (typeof chunk.argumentsDelta === 'string' ? chunk.argumentsDelta.length : 0) + (typeof chunk.name === 'string' ? chunk.name.length : 0)
          else if (chunk.type === 'block-end') outputOverhead += 4
        }
        yield chunk
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
        if (this.memoryDropped === 1 || this.memoryDropped % 1000 === 0) {
          this.ctx.logger.warn(`usage-ledger: in-memory ledger full, dropping oldest entries (${this.memoryDropped} dropped so far)`)
        }
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
    const written = new Set()
    this.pending.clear()
    this.flushing = (async () => {
      for (const [id, entry] of batch) {
        store.put(id, entry.time, entry)
        this.records.set(id, entry)
        written.add(id)
      }
      this.prune()
      this.ctx.logger.debug(`usage-ledger: flushed ${batch.length} entries (${this.records.size} durable)`)
    })().catch((error) => {
      // Only entries this attempt did NOT write go back: ones already in
      // `records` are durable and must not be counted again by the query.
      requeueUnwritten(batch, this.pending, written)
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
   * The configured LLM routes a quota probe can answer for.
   *
   * Zero-config on purpose: the settings tree already declares every route and
   * the credential reference its key lives under, so a provider added (or
   * removed) on the Models page changes this list with no plugin config.
   * @returns [{ route, probe, credentialRef?, credentialKey?, label? }].
   */
  quotaTargets() {
    const quota = this.config.quota ?? {}
    if (quota.enabled === false || this.settings === undefined) return []
    let piAi
    let deepseek
    try {
      piAi = this.settings.get('llm-pi-ai')
      deepseek = this.settings.get('llm-deepseek')
    } catch (error) {
      this.ctx.logger.warn(`usage-ledger: cannot read the settings tree for quota routes: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
    return discoverTargets({ piAi, deepseek, overrides: quota.providers ?? {} })
  }

  /**
   * Resolve each target's API key or OAuth grant through the harness
   * credentials seam (the same store the Models page writes), so quota reads
   * and model calls share one source. Secrets stay host-side: only readings
   * cross the wire.
   */
  async resolveQuotaKeys(targets) {
    return Promise.all(targets.map(async (target) => {
      const resolved = await resolveTargetAuth(target, this.credentials)
      if (resolved.authError !== undefined) {
        const credential = target.credentialRef ?? target.credentialKey ?? target.route
        this.ctx.logger.warn(`usage-ledger: cannot resolve quota credential ${credential}: ${resolved.authError}`)
      }
      return resolved
    }))
  }

  /**
   * Read the provider quotas for every configured route (TTL-cached).
   * @param options - { force } — the panel's refresh button skips the cache.
   * @returns { quotas } — one reading per route; failures are readings too.
   */
  async quotas(options = {}) {
    const targets = this.quotaTargets()
    if (targets.length === 0) return { quotas: [] }
    return this.quotaCache.load(await this.resolveQuotaKeys(targets), { force: options.force === true })
  }

  /**
   * Query the ledger (durable + pending) for one period and dimension.
   * @param options - { from, to, by? }
   * @returns aggregation plus the raw entry list and report metadata.
   */
  query(options) {
    const { from, to } = options
    const by = options.by ?? 'model'
    const entries = []
    const accept = (entry) => {
      if (entry.time < from || entry.time >= to) return
      // Legacy rows recorded before the zero-usage skip: drop them here too,
      // so historical call counts stay consistent with what is billable.
      if (!usageHasTokens(entry)) return
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
      entries,
      from,
      to,
      dimension: by,
    }
  }
}

/** Whether a reported usage carries any tokens at all (zeros = error-path call, not billable). */
function usageHasTokens(usage) {
  const sum = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0)
    + (usage?.cacheReadTokens ?? 0) + (usage?.cacheWriteTokens ?? 0) + (usage?.reasoningTokens ?? 0)
  return sum > 0
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

export default UsageLedgerService
