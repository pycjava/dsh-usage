/**
 * Standalone smoke test for the pure ledger modules (no harness needed):
 * entry construction, period parsing, aggregation, the text report, the
 * SQLite store round-trip, and the provider-quota probes (parsers, route
 * classification, TTL cache) — no network is touched: every probe check either
 * uses a canned probe or exercises the unconfigured path.
 * Run with: node test/smoke.mjs
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { buildDashboard, dayKey } from '../lib/dashboard.js'
import { aggregate, entryFromCall, parsePeriod, requeueUnwritten } from '../lib/ledger.js'
import { heatLevel } from '../lib/heat-level.js'
import { createQuotaCache, detectProbe, discoverTargets, fetchJson, parseCodex, parseDeepseek, parseKimi, parseZhipu, probeTarget, resolveTargetAuth } from '../lib/quota.js'
import { formatCompactDuration, horizonSeconds, remainingPercentOf } from '../lib/quota-view.js'
import { formatCompact, formatNumber, renderQuotaSection, renderTextReport } from '../lib/report.js'
import { envelopeFetchHandler, runDashboardQuery, runQuotaQuery } from '../lib/rpc.js'
import { openLedgerStore } from '../lib/store.js'
import { consumeInner, markDelegated } from '../lib/nesting.js'

// ---- entry construction ---------------------------------------------------
const entry = entryFromCall({
  id: 'e1',
  time: new Date(2026, 7, 10, 12).getTime(),
  options: { provider: 'deepseek-official', model: 'deepseek-chat', sessionId: 'session-1', purpose: 'session-title' },
  usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 300, reasoningTokens: 40 },
})
assert.equal(entry.provider, 'deepseek-official')
assert.equal(entry.inputTokens, 1000)
assert.deepEqual(entryFromCall({
  id: 'e2', time: 0, options: {}, usage: { inputTokens: -5, outputTokens: 2 },
}).outputTokens, 2)
assert.deepEqual(entryFromCall({
  id: 'e3', time: 0, options: {}, usage: { inputTokens: 1, outputTokens: 0 }, estimated: true,
}).estimated, true)

// ---- period parsing -------------------------------------------------------
// Periods are LOCAL-time (the report is for a human's calendar), so expected
// values use local-time constructors too.
const now = new Date(2026, 7, 20, 15).getTime()
const augStart = new Date(2026, 7, 1).getTime()
const sepStart = new Date(2026, 8, 1).getTime()
const julStart = new Date(2026, 6, 1).getTime()
const junStart = new Date(2026, 5, 1).getTime()
assert.deepEqual(parsePeriod('', now), { ok: true, from: augStart, to: now + 1, label: 'August 2026' })
assert.equal(parsePeriod('2026-07', now).from, julStart)
assert.equal(parsePeriod('2026-07', now).to, augStart)
assert.equal(parsePeriod('2026-06..2026-08', now).from, junStart)
assert.equal(parsePeriod('2026-06..2026-08', now).to, now + 1)
assert.equal(parsePeriod('7d', now).from, new Date(2026, 7, 14).getTime()) // local calendar days: Aug 14..20
assert.equal(parsePeriod('all', now).from, 0)
assert.equal(parsePeriod('nonsense', now).ok, false)
assert.equal(parsePeriod('2026-13', now).ok, false)
assert.equal(parsePeriod('2027-01', now).ok, false)

// ---- aggregation + rendering ---------------------------------------------
const entries = [
  entryFromCall({ id: 'a', time: new Date(2026, 7, 2, 10).getTime(), options: { provider: 'deepseek-official', model: 'deepseek-chat', sessionId: 's1' }, usage: { inputTokens: 2_000_000, outputTokens: 500_000 } }),
  entryFromCall({ id: 'b', time: new Date(2026, 7, 2, 11).getTime(), options: { provider: 'deepseek-official', model: 'deepseek-chat', sessionId: 's1' }, usage: { inputTokens: 0, outputTokens: 100_000, cacheReadTokens: 1_000_000 } }),
  entryFromCall({ id: 'c', time: new Date(2026, 7, 3, 9).getTime(), options: { provider: 'deepseek-official', model: 'deepseek-v4-pro', sessionId: 's2' }, usage: { inputTokens: 500_000, outputTokens: 100_000 }, estimated: true }),
]
const result = aggregate(entries, 'model')
assert.equal(result.totals.calls, 3)
assert.equal(result.totals.estimatedCalls, 1)
assert.equal(result.totals.inputTokens, 2_500_000)
assert.equal(result.totals.cacheReadTokens, 1_000_000)
assert.equal(result.totals.outputTokens, 700_000)
assert.equal(result.rows.length, 2)

assert.equal(formatNumber(1234567), '1,234,567')
assert.equal(formatCompact(1234567), '1.23M')
assert.equal(formatCompact(999), '999')

const totalsWithSplit = {
  ...result.totals,
  reportedCalls: 2,
  reportedTokens: 3_600_000,
  estimatedTokens: 600_000,
}
const text = renderTextReport({ ...result, totals: totalsWithSplit, dimension: 'model', label: 'August 2026' })
assert.ok(text.includes('Usage · August 2026 · 4.2M tokens · 3 calls'))
assert.ok(text.includes('reported'))
assert.ok(text.includes('estimated'))
assert.ok(text.includes('deepseek-official/deepseek-chat'))

// by-day rows keep chronological order (formatted labels sort badly: Aug 2 < Aug 10 < Aug 20)
const dayRows = aggregate([
  entryFromCall({ id: 'day-20', time: new Date(2026, 7, 20).getTime(), options: { provider: 'p', model: 'm' }, usage: { inputTokens: 1, outputTokens: 0 } }),
  entryFromCall({ id: 'day-02', time: new Date(2026, 7, 2).getTime(), options: { provider: 'p', model: 'm' }, usage: { inputTokens: 1, outputTokens: 0 } }),
  entryFromCall({ id: 'day-10', time: new Date(2026, 7, 10).getTime(), options: { provider: 'p', model: 'm' }, usage: { inputTokens: 1, outputTokens: 0 } }),
], 'day').rows.map((row) => row.key)
assert.deepEqual(dayRows, ['2026-08-02', '2026-08-10', '2026-08-20'])

// failed flush recovery: already-written ids stay durable, unwritten ids return to pending
{
  const pending = new Map()
  const batch = [['a', { id: 'a' }], ['b', { id: 'b' }], ['c', { id: 'c' }]]
  requeueUnwritten(batch, pending, new Set(['b']))
  assert.deepEqual([...pending.keys()], ['a', 'c'])
  requeueUnwritten(batch, pending, new Set(['a', 'b', 'c']))
  assert.deepEqual([...pending.keys()], ['a', 'c'])     // idempotent against existing pending entries
}

// ---- sqlite store round-trip ----------------------------------------------
{
  const dir = mkdtempSync(join(tmpdir(), 'usage-ledger-test-'))
  try {
    const store = openLedgerStore(join(dir, 'ledger.sqlite'))
    store.put('e1', 100, { id: 'e1', time: 100, provider: 'p', model: 'm', inputTokens: 1, outputTokens: 2 })
    store.put('e2', 200, { id: 'e2', time: 200, provider: 'p', model: 'm', inputTokens: 3, outputTokens: 4 })
    let loaded = store.loadAll()
    assert.equal(loaded.corrupt, 0)
    assert.equal(loaded.records.size, 2)
    assert.deepEqual(loaded.records.get('e1'), { id: 'e1', time: 100, provider: 'p', model: 'm', inputTokens: 1, outputTokens: 2 })
    // insert-or-replace
    store.put('e1', 150, { id: 'e1', time: 150, provider: 'p', model: 'm', inputTokens: 9, outputTokens: 0 })
    assert.equal(store.loadAll().records.get('e1').inputTokens, 9)
    // prune
    assert.equal(store.pruneBefore(151), 1)
    loaded = store.loadAll()
    assert.equal(loaded.records.size, 1)
    assert.ok(loaded.records.has('e2'))
    // delete + reopen persistence
    store.delete('e2')
    assert.equal(store.loadAll().records.size, 0)
    store.close()
    const reopened = openLedgerStore(join(dir, 'ledger.sqlite'))
    assert.equal(reopened.loadAll().records.size, 0)
    reopened.close()
    // one corrupt row must not hide every other readable entry
    const corruptDb = new DatabaseSync(join(dir, 'ledger.sqlite'))
    corruptDb.exec('INSERT OR REPLACE INTO entries (id, time, json) VALUES (\'bad\', 300, \'{not-json\')')
    corruptDb.close()
    const tolerant = openLedgerStore(join(dir, 'ledger.sqlite'))
    const tolerantLoad = tolerant.loadAll()
    assert.equal(tolerantLoad.corrupt, 1)
    assert.equal(tolerantLoad.records.size, 0)
    tolerant.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ---- heatmap shading -------------------------------------------------------
// One huge day must not flatten every other active day into level 1: the
// log scale keeps a 8.8M-token day clearly visible next to a 64M max.
assert.equal(heatLevel(0, 64_000_000), 0)
assert.equal(heatLevel(1, 64_000_000), 1)
assert.equal(heatLevel(1_000, 64_000_000), 2)
assert.equal(heatLevel(1_000_000, 64_000_000), 3)
assert.equal(heatLevel(8_832_794, 64_000_000), 3)
assert.equal(heatLevel(64_000_000, 64_000_000), 4)
assert.equal(heatLevel(1, 1), 4)

// ---- dashboard aggregation (settings panel) --------------------------------
{
  const at = (month, day, hour) => new Date(2026, month - 1, day, hour).getTime()
  const now2 = at(8, 15, 15)
  const mk = (id, time, provider, model, sessionId, input, output, extra = {}) =>
    entryFromCall({ id, time, options: { provider, model, sessionId }, usage: { inputTokens: input, outputTokens: output, ...extra } })
  const periodEntries = [
    mk('d1', at(8, 13, 10), 'p1', 'mA', 's1', 10_000, 2_000, { cacheReadTokens: 90_000 }),
    mk('d2', at(8, 14, 11), 'p1', 'mA', 's2', 20_000, 1_000),
    mk('d3', at(8, 15, 9), 'p2', 'mB', 's1', 5_000, 500),
    mk('d4', at(8, 15, 12), 'p2', 'mB', undefined, 1, 1),
  ]
  const older = [mk('d0', at(8, 1, 10), 'p1', 'mA', 's9', 100, 100)]
  const dash = buildDashboard(periodEntries, {
    from: at(8, 12, 0), to: at(8, 16, 0), now: now2,
    allTimeEntries: [...older, ...periodEntries],
  })
  assert.equal(dash.totals.calls, 4)
  assert.equal(dash.totals.totalTokens, 102_000 + 21_000 + 5_500 + 2)
  assert.equal(dash.sessions, 2)                       // undefined sessionId not counted
  assert.equal(dash.activeDays, 3)
  assert.equal(dash.streakDays, 3)                     // 8/13..8/15 consecutive (today active)
  assert.equal(dash.topModel.label, 'p1/mA')
  assert.equal(Math.round(dash.topModel.share * 100), 96)
  assert.equal(dash.series.length, 4)                  // 4 days ending today
  assert.equal(dash.series[3].day, dayKey(at(8, 15, 0)))
  assert.equal(dash.series[3].values['p2/mB'], 5_502)
  assert.equal(dash.series[0].tokens, 0)               // inactive day filled with zero
  assert.equal(dash.dailyTotals[dayKey(at(8, 1, 10))], 200)

  // today's hourly buckets: 00:00..current hour, only today's entries
  assert.equal(dash.todayHours.day, dayKey(now2))
  assert.equal(dash.todayHours.hours.length, 16)        // 00:00..15:00 (now is 15:15)
  assert.equal(dash.todayHours.hours[9].tokens, 5_500)  // d3 at 09:00
  assert.equal(dash.todayHours.hours[9].values['p2/mB'], 5_500)
  assert.equal(dash.todayHours.hours[12].tokens, 2)     // d4 at 12:00
  assert.equal(dash.todayHours.hours[10].tokens, 0)     // d1 is Aug 13, not today
  assert.equal(dash.todayHours.hours[15].tokens, 0)     // current hour, nothing yet

  // streak breaks when neither today nor yesterday is active
  const cold = buildDashboard(older, {
    from: at(8, 12, 0), to: at(8, 16, 0), now: now2, allTimeEntries: older,
  })
  assert.equal(cold.streakDays, 0)
  assert.equal(cold.topModel.label, 'p1/mA')

  // an empty window yields no top model at all
  const none = buildDashboard([], { from: at(8, 12, 0), to: at(8, 16, 0), now: now2, allTimeEntries: older })
  assert.equal(none.topModel, null)
  assert.equal(none.series.length, 4)

  // a PAST month's series anchors to that month, not to "today"
  const julyEntry = mk('july', at(7, 2, 10), 'p1', 'mA', 's9', 10, 1)
  const july = buildDashboard([julyEntry], {
    from: at(7, 1, 0), to: at(8, 1, 0), now: now2, allTimeEntries: [julyEntry],
  })
  assert.equal(july.series.length, 31)
  assert.equal(july.series[0].day, '2026-07-01')
  assert.equal(july.series[1].tokens, 11)
  assert.equal(july.series.at(-1).day, '2026-07-31')

  // this-month before noon keeps the first calendar day of the month
  const earlyNow = at(8, 20, 5)
  const monthFirst = mk('month-first', at(8, 1, 0), 'p1', 'mA', 's9', 5, 1)
  const earlyMonth = buildDashboard([monthFirst], {
    from: at(8, 1, 0), to: earlyNow + 1, now: earlyNow, allTimeEntries: [monthFirst],
  })
  assert.equal(earlyMonth.series.length, 20)
  assert.equal(earlyMonth.series[0].day, '2026-08-01')
  assert.equal(earlyMonth.series[0].tokens, 6)

  // rpc dashboard endpoint: period default + value shape
  const rpcQuery = (options) => ({ entries: options.from === 0 ? [...older, ...periodEntries] : periodEntries, totals: {}, rows: [] })
  const rpc = runDashboardQuery({}, rpcQuery, now2)
  assert.equal(rpc.ok, true)
  assert.equal(rpc.value.label, 'last 30 days')
  assert.equal(rpc.value.totals.calls, 4)
  const badPeriod = runDashboardQuery({ period: 'nonsense' }, rpcQuery, now2)
  assert.equal(badPeriod.error.code, 'bad-request')
  assert.deepEqual(badPeriod.error.details, { issues: [] })
}

// ---- innermost-delegation tracking (wrapper providers count once) --------
{
  // Replicates lib/index.js wrapStream's structure without the harness: the
  // waterfall listener (markDelegated + consumeInner) plus a wrapper adapter
  // that re-enters dispatch() for a real upstream — exactly the modlens
  // `(modlens vision)` shape.
  const runChain = async (chain) => {
    const recorded = []
    const wrap = (options, next) => {
      markDelegated()
      const inner = next()
      return (async function* () {
        let usage
        for await (const chunk of consumeInner(inner, (store) => {
          if (store.delegated) return
          if (usage !== undefined) recorded.push({ provider: options.provider, model: options.model, tokens: usage })
        })) {
          if (chunk?.type === 'usage' && usage === undefined) usage = chunk.tokens
          yield chunk
        }
      })()
    }
    const dispatch = (options, index) => wrap(options, () => adapter(options, index))
    const adapter = (options, index) => {
      if (index === chain.length - 1) {
        return (async function* () {
          yield { type: 'usage', tokens: 100 }
          yield { type: 'finish' }
        })()
      }
      // delegating wrapper: forward to the next provider in the chain
      return (async function* () {
        yield* dispatch({ ...options, provider: chain[index + 1].provider }, index + 1)
      })()
    }
    const chunks = []
    for await (const chunk of dispatch({ provider: chain[0].provider, model: chain[0].model }, 0)) chunks.push(chunk)
    return { recorded, chunks }
  }

  // Plain (non-delegating) call: recorded once.
  const plain = await runChain([{ provider: 'volce', model: 'deepseek-v4-flash' }])
  assert.deepEqual(plain.recorded, [{ provider: 'volce', model: 'deepseek-v4-flash', tokens: 100 }])

  // modlens-style facade over the same upstream: the physical call is the
  // INNER (real provider) one; the facade must NOT be recorded again.
  const wrapped = await runChain([
    { provider: 'modlens-volce', model: 'deepseek-v4-flash' },
    { provider: 'volce', model: 'deepseek-v4-flash' },
  ])
  assert.deepEqual(wrapped.recorded, [{ provider: 'volce', model: 'deepseek-v4-flash', tokens: 100 }])
  // the usage chunk still reaches the caller exactly once
  assert.equal(wrapped.chunks.filter((c) => c?.type === 'usage').length, 1)

  // A deeper chain (facade -> facade -> real) records only the real call.
  const deep = await runChain([
    { provider: 'modlens-a', model: 'm' },
    { provider: 'modlens-b', model: 'm' },
    { provider: 'zai', model: 'm' },
  ])
  assert.deepEqual(deep.recorded, [{ provider: 'zai', model: 'm', tokens: 100 }])

  // Concurrency: a delegating call running in parallel must not flip the
  // flag of an unrelated top-level call (AsyncLocalStorage scoping).
  const [a, b] = await Promise.all([
    runChain([{ provider: 'volce', model: 'm' }]),
    runChain([{ provider: 'modlens-zai', model: 'm' }, { provider: 'zai', model: 'm' }]),
  ])
  assert.deepEqual(a.recorded, [{ provider: 'volce', model: 'm', tokens: 100 }])
  assert.deepEqual(b.recorded, [{ provider: 'zai', model: 'm', tokens: 100 }])

  // Estimate fallback: the facade's estimate is skipped; the inner (real,
  // usage-less) call records the estimate exactly once.
  const estimateRun = async (chain) => {
    const recorded = []
    const wrap = (options, next) => {
      markDelegated()
      const inner = next()
      return (async function* () {
        for await (const chunk of consumeInner(inner, (store) => {
          if (store.delegated) return
          recorded.push({ provider: options.provider, model: options.model, estimated: true })
        })) {
          yield chunk
        }
      })()
    }
    const dispatch = (options, index) => wrap(options, () => adapter(options, index))
    const adapter = (options, index) => {
      if (index === chain.length - 1) return (async function* () { yield { type: 'finish' } })()
      return (async function* () { yield* dispatch({ ...options, provider: chain[index + 1].provider }, index + 1) })()
    }
    for await (const chunk of dispatch({ provider: chain[0].provider, model: chain[0].model }, 0)) { void chunk }
    return recorded
  }
  const est = await estimateRun([
    { provider: 'modlens-volce', model: 'deepseek-v4-flash' },
    { provider: 'volce', model: 'deepseek-v4-flash' },
  ])
  assert.deepEqual(est, [{ provider: 'volce', model: 'deepseek-v4-flash', estimated: true }])
}
// ---- provider quota parsers (fixtures from the TokenMeter CLI) --------------
{
  // DeepSeek: CNY wins over other currencies; a missing balance list is an error
  assert.deepEqual(parseDeepseek({
    is_available: true,
    balance_infos: [{ currency: 'CNY', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' }],
  }), { currency: 'CNY', available: 110, granted: 10, toppedUp: 100, sufficient: true })
  const mixed = parseDeepseek({
    is_available: false,
    balance_infos: [
      { currency: 'USD', total_balance: '5.00', granted_balance: '0.00', topped_up_balance: '5.00' },
      { currency: 'CNY', total_balance: '0.50', granted_balance: '0.50', topped_up_balance: '0.00' },
    ],
  })
  assert.equal(mixed.currency, 'CNY')
  assert.equal(mixed.available, 0.5)
  assert.equal(mixed.sufficient, false)
  assert.throws(() => parseDeepseek({ balance_infos: [] }), /no balance/)

  // Kimi: labels, window durations, string numbers, horizon-only classification
  const byLabel = parseKimi({
    usage: { limit: 400, used: 40, remaining: 360, reset_in: 400_000 },
    limits: [
      { name: '5h window', detail: { limit: 100, used: 20, remaining: 80, reset_in: 12_000 } },
      { name: 'weekly quota', detail: { limit: 400, used: 40, remaining: 360, reset_in: 400_000 } },
    ],
  })
  assert.equal(Math.round(byLabel.fiveHour.remainingPercent), 80)
  assert.equal(byLabel.fiveHour.resetIn, 12_000)
  assert.equal(Math.round(byLabel.weekly.remainingPercent), 90)

  const byDuration = parseKimi({
    limits: [
      { duration: 300, timeUnit: 'MINUTE', detail: { limit: 50, used: 10, remaining: 40 } },
      { window: { duration: 7, timeUnit: 'DAY' }, detail: { limit: 500, used: 100, remaining: 400 } },
    ],
  })
  assert.equal(Math.round(byDuration.fiveHour.remainingPercent), 80)
  assert.equal(Math.round(byDuration.weekly.remainingPercent), 80)
  assert.equal(parseKimi({ usage: { limit: 400, remaining: 300, reset_in: 500_000 } }).weekly.remainingPercent, 75)
  assert.equal(parseKimi({ limits: [{ name: 'weekly', detail: { limit: 200, remaining: 50 } }] }).weekly.used, 150)
  assert.deepEqual(parseKimi({}), { fiveHour: {}, weekly: {} })

  const realistic = parseKimi({
    user: { membership: { level: 'LEVEL_INTERMEDIATE' } },
    usage: { limit: '100', used: '9', remaining: '91', resetTime: new Date(Date.now() + 5 * 86_400_000).toISOString() },
    limits: [{ window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' }, detail: { limit: '100', used: '1', remaining: '99', resetTime: new Date(Date.now() + 3 * 3_600_000).toISOString() } }],
    parallel: { limit: '20' },
  })
  assert.equal(realistic.membership, 'LEVEL_INTERMEDIATE')
  assert.equal(realistic.parallelLimit, 20)
  assert.equal(Math.round(realistic.weekly.remainingPercent), 91)
  assert.equal(Math.round(realistic.fiveHour.remainingPercent), 99)

  // Zhipu: reset order splits the windows; TIME_LIMIT carries the MCP balance
  const zhipuRaw = {
    code: 200,
    success: true,
    data: {
      level: 'pro',
      limits: [
        { type: 'TIME_LIMIT', percentage: 13, remaining: 870 },
        { type: 'TOKENS_LIMIT', percentage: 18.5, nextResetTime: 1_757_490_000_000 },
        { type: 'TOKENS_LIMIT', percentage: 4.2, nextResetTime: 1_757_900_000_000 },
      ],
    },
  }
  const zhipu = parseZhipu(zhipuRaw)
  assert.equal(zhipu.plan, 'pro')
  assert.equal(zhipu.fiveHour.usedPercent, 18.5)
  assert.equal(zhipu.fiveHour.remainingPercent, 81.5)
  assert.equal(Math.round(zhipu.weekly.remainingPercent * 10) / 10, 95.8)
  assert.equal(zhipu.fiveHour.resetAt, new Date(1_757_490_000_000).toISOString())
  assert.equal(zhipu.mcp.remaining, 870)
  assert.equal(parseZhipu({ success: true, data: { level: 'max', limits: [{ type: 'TOKENS_LIMIT', percentage: 120 }] } }).fiveHour.remainingPercent, 0)
  assert.throws(() => parseZhipu({ success: false, code: 401, msg: 'token invalid' }), /token invalid/)

  // Zhipu: the console API names each window's size itself (`unit` 3 counts
  // hours, `unit` 6 is the weekly window); reset-time order is only a fallback.
  // In the tail of a week the rolling weekly window resets sooner than the
  // 5-hour one, and the 5-hour row sometimes arrives with no reset time at
  // all (openusage issue #242 payload) — both shapes used to swap the windows.
  const weekTail = parseZhipu({
    code: 200,
    success: true,
    data: {
      level: 'pro',
      limits: [
        { type: 'TIME_LIMIT', unit: 5, number: 1, usage: 1000, currentValue: 204, remaining: 796, percentage: 20 },
        { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 40, nextResetTime: Date.now() + 4.5 * 3_600_000 },
        { type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 77, nextResetTime: Date.now() + 2 * 3_600_000 },
      ],
    },
  })
  assert.equal(weekTail.fiveHour.usedPercent, 40)
  assert.equal(weekTail.weekly.usedPercent, 77)

  const noResetOnFiveHour = parseZhipu({
    success: true,
    data: {
      level: 'lite',
      limits: [
        { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 36 },
        { type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 77, nextResetTime: Date.now() + 3 * 86_400_000 },
      ],
    },
  })
  assert.equal(noResetOnFiveHour.fiveHour.usedPercent, 36)
  assert.equal(noResetOnFiveHour.weekly.usedPercent, 77)

  const weeklyOnly = parseZhipu({
    success: true,
    data: { level: 'pro', limits: [{ type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 9 }] },
  })
  assert.equal(weeklyOnly.fiveHour.usedPercent, undefined)
  assert.equal(weeklyOnly.weekly.remainingPercent, 91)

  // OpenAI Codex: classify by each window's duration rather than relying on
  // primary/secondary order; retain plan, credits, resets, and code review.
  const codex = parseCodex({
    plan_type: 'plus',
    rate_limit: {
      primary_window: { used_percent: 23, limit_window_seconds: 604_800, reset_at: 1_800_000_000 },
      secondary_window: { used_percent: '6', limit_window_seconds: '18000', reset_at: '1800000100' },
    },
    code_review_rate_limit: {
      primary_window: { used_percent: 2, limit_window_seconds: 604_800, reset_at: 1_800_000_200 },
    },
    credits: { has_credits: true, unlimited: false, balance: '820.6969' },
    rate_limit_reset_credits: { available_count: 1 },
  })
  assert.equal(codex.plan, 'plus')
  assert.equal(codex.fiveHour.usedPercent, 6)
  assert.equal(codex.fiveHour.remainingPercent, 94)
  assert.equal(codex.weekly.usedPercent, 23)
  assert.equal(codex.weekly.resetAt, new Date(1_800_000_000_000).toISOString())
  assert.equal(codex.codeReviewWeekly.remainingPercent, 98)
  assert.deepEqual(codex.credits, { hasCredits: true, unlimited: false, balance: 820.6969 })
  assert.equal(codex.rateLimitResets, 1)
  const codexMonthly = parseCodex({ rate_limit: { primary_window: {
    used_percent: 120, limit_window_seconds: 30 * 86_400, reset_at: 1_800_000_000,
  } } })
  assert.equal(codexMonthly.monthly.remainingPercent, 0)
  // Named per-model budgets ride in additional_rate_limits; windows may use a
  // relative countdown (reset_after_seconds) and null slots.
  const codexAdditional = parseCodex({
    rate_limit: { primary_window: { used_percent: 5, limit_window_seconds: 18_000, reset_after_seconds: 7_200 } },
    additional_rate_limits: [
      { limit_name: 'GPT-5.2-Codex-Sonic', rate_limit: {
        primary_window: { used_percent: 41, limit_window_seconds: 18_000, reset_after_seconds: 900 },
        secondary_window: { used_percent: '13', limit_window_seconds: 604_800, reset_at: 1_800_000_300 },
      } },
      { limit_name: 'broken', rate_limit: { primary_window: null, secondary_window: {} } },
      'not-an-object',
    ],
  })
  assert.equal(codexAdditional.fiveHour.resetIn, 7_200)
  assert.equal(codexAdditional.additionalLimits.length, 1)
  assert.equal(codexAdditional.additionalLimits[0].name, 'GPT-5.2-Codex-Sonic')
  assert.equal(codexAdditional.additionalLimits[0].fiveHour.usedPercent, 41)
  assert.equal(codexAdditional.additionalLimits[0].weekly.remainingPercent, 87)
  assert.equal(parseCodex({ additional_rate_limits: [{ limit_name: 'x', rate_limit: {
    primary_window: { used_percent: 1, limit_window_seconds: 18_000 },
  } }] }).additionalLimits[0].fiveHour.usedPercent, 1)
  assert.throws(() => parseCodex({ plan_type: 'plus' }), /no quota information/)

  // display math: remaining share, reset horizon, compact phrasing
  assert.equal(remainingPercentOf({ limit: 200, remaining: 50 }), 25)
  assert.equal(remainingPercentOf({ usedPercent: 30 }), 70)
  assert.equal(remainingPercentOf(undefined), undefined)
  assert.equal(horizonSeconds({ resetIn: 120 }, 0), 120)
  assert.equal(Math.round(horizonSeconds({ resetAt: new Date(60_000).toISOString() }, 0)), 60)
  assert.equal(formatCompactDuration(120), '2m')
  assert.equal(formatCompactDuration(7_800), '2h 10m')
  assert.equal(formatCompactDuration(273_600), '3d 4h')
}

// ---- quota route discovery --------------------------------------------------
{
  // endpoint host decides first, then the route id's keywords
  assert.equal(detectProbe('zai-coding-cn', 'https://open.bigmodel.cn/api/coding/paas/v4'), 'zhipu')
  assert.equal(detectProbe('kimi-proof', 'https://api.deepseek.com'), 'deepseek')   // host beats the id
  assert.equal(detectProbe('glm-proxy', undefined), 'zhipu')                       // id fallback: no baseURL
  assert.equal(detectProbe('glm-proxy', 'https://gateway.example/v1'), 'zhipu')    // id fallback: unknown host
  assert.equal(detectProbe('kimi-coding', 'https://api.kimi.com/coding/v1'), 'kimi')
  assert.equal(detectProbe('openai-codex', 'https://chatgpt.com/backend-api'), 'codex')
  assert.equal(detectProbe('openai-codex', ''), 'codex') // exact pi-ai catalog route id
  // An OpenAI API-key endpoint is denied before the id fallback: whatever the
  // route is named, its platform key must never travel to the ChatGPT console.
  assert.equal(detectProbe('openai-codex', 'https://api.openai.com/v1'), undefined)
  assert.equal(detectProbe('codex-proxy', 'https://gateway.example/v1'), undefined) // override-only
  assert.equal(detectProbe('openai', 'https://api.openai.com/v1'), undefined) // API key PAYG is not ChatGPT Coding Plan
  assert.equal(detectProbe('deepseek-official', 'https://api.deepseek.com'), 'deepseek')
  assert.equal(detectProbe('some-local-llama', 'http://127.0.0.1:11434/v1'), undefined)

  const targets = discoverTargets({
    piAi: {
      providers: {
        'zai-coding-cn': { apiKeyEnv: 'ZAI_CODING_CN_API_KEY' },
        'kimi-coding': { apiKeyEnv: 'KIMI_CODING_API_KEY', baseURL: 'https://api.kimi.com/coding/v1' },
        'openai-codex': { baseURL: 'https://chatgpt.com/backend-api' },
        'local-proxy': { apiKeyEnv: 'LOCAL_KEY', baseURL: 'http://127.0.0.1:11434/v1' },
      },
    },
    deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: 'https://api.deepseek.com' },
  })
  assert.deepEqual(targets.map((target) => [target.route, target.probe]), [
    ['zai-coding-cn', 'zhipu'],
    ['kimi-coding', 'kimi'],
    ['openai-codex', 'codex'],
    ['deepseek-official', 'deepseek'],
  ])
  assert.equal(targets[0].credentialRef, 'ZAI_CODING_CN_API_KEY')
  assert.equal(targets[2].credentialKey, 'llm-pi-ai/openai-codex')

  // an override can force a family, move the endpoint, or rename the credential
  const overridden = discoverTargets({
    piAi: { providers: { 'local-proxy': { apiKeyEnv: 'LOCAL_KEY', baseURL: 'http://127.0.0.1:11434/v1' } } },
    overrides: { 'local-proxy': { probe: 'zhipu', url: 'https://open.bigmodel.cn/x', credentialRef: 'OTHER_KEY' } },
  })
  assert.deepEqual(overridden, [{ route: 'local-proxy', probe: 'zhipu', credentialRef: 'OTHER_KEY', url: 'https://open.bigmodel.cn/x' }])
  // An API-key route named like the catalog Codex provider yields no target:
  // nothing is probed and no key is sent anywhere.
  assert.deepEqual(discoverTargets({ piAi: { providers: {
    'openai-codex': { apiKeyEnv: 'OPENAI_API_KEY', baseURL: 'https://api.openai.com/v1' },
  } } }), [])
  assert.deepEqual(discoverTargets({}), [])

  // OAuth records live in a separate credentials keyspace from API-key refs.
  const jwt = `x.${Buffer.from(JSON.stringify({
    'https://api.openai.com/auth': { chatgpt_account_id: 'acct-from-jwt' },
  })).toString('base64url')}.x`
  const credentials = {
    resolve: async (ref) => ({ value: ref === 'KIMI_KEY' ? 'kimi-secret' : undefined }),
    readRecord: async (key) => key === 'llm-pi-ai/openai-codex'
      ? { kind: 'grant', payload: { type: 'oauth', access: jwt, expires: 2_000_000 } }
      : undefined,
  }
  const refAuth = await resolveTargetAuth({ route: 'kimi', probe: 'kimi', credentialRef: 'KIMI_KEY' }, credentials, 1_000_000)
  assert.equal(refAuth.apiKey, 'kimi-secret')
  const oauthAuth = await resolveTargetAuth({ route: 'openai-codex', probe: 'codex', credentialKey: 'llm-pi-ai/openai-codex' }, credentials, 1_000_000)
  assert.equal(oauthAuth.apiKey, jwt)
  assert.equal(oauthAuth.accountId, 'acct-from-jwt')
  const expired = await resolveTargetAuth({ route: 'openai-codex', probe: 'codex', credentialKey: 'llm-pi-ai/openai-codex' }, credentials, 3_000_000)
  assert.match(expired.authError, /expired/)
  assert.equal(expired.apiKey, undefined)
  const missing = await resolveTargetAuth({ route: 'other-codex', probe: 'codex', credentialKey: 'llm-pi-ai/other-codex' }, credentials, 1_000_000)
  assert.match(missing.authError, /no OAuth grant/)
}

// ---- quota probing + TTL cache ---------------------------------------------
{
  // A route with no credential is a reading, not an exception — and no fetch.
  const unconfigured = await probeTarget({ route: 'kimi-coding', probe: 'kimi', credentialRef: 'KIMI_CODING_API_KEY' })
  assert.equal(unconfigured.ok, false)
  assert.equal(unconfigured.reason, 'unconfigured')
  assert.match(unconfigured.error, /KIMI_CODING_API_KEY/)
  assert.equal((await probeTarget({ route: 'x', probe: 'nope' })).reason, 'unsupported')

  let clock = 1_000_000
  const seen = []
  const cache = createQuotaCache({
    ttlMs: 60_000,
    now: () => clock,
    probe: async (target) => {
      seen.push(target.route)
      if (target.route === 'flaky') return { route: 'flaky', probe: 'kimi', ok: false, reason: 'error', error: 'HTTP 500' }
      return { route: target.route, probe: target.probe, ok: true, fetchedAt: clock, stale: false, data: { kind: 'windows', fiveHour: { remainingPercent: 80 } } }
    },
  })
  const targets = [{ route: 'steady', probe: 'kimi' }, { route: 'flaky', probe: 'kimi' }]

  const first = await cache.load(targets)
  assert.deepEqual(seen, ['steady', 'flaky'])
  assert.equal(first.quotas.length, 2)
  assert.equal(first.quotas[0].ok, true)

  // inside the TTL nothing is re-probed
  clock += 30_000
  await cache.load(targets)
  assert.deepEqual(seen, ['steady', 'flaky'])

  // an explicit refresh (the panel's button) probes regardless of age
  clock += 1_000
  await cache.load(targets, { force: true })
  assert.deepEqual(seen, ['steady', 'flaky', 'steady', 'flaky'])

  // once the TTL lapses the next read probes again
  clock += 60_001
  await cache.load(targets)
  assert.equal(seen.length, 6)

  // a failed refresh serves the previous good reading flagged `stale`
  let degradedCalls = 0
  const degraded = createQuotaCache({
    ttlMs: 0,
    now: () => clock,
    probe: async (target) => {
      degradedCalls += 1
      if (degradedCalls > 1) return { route: target.route, probe: 'kimi', ok: false, reason: 'error', error: 'HTTP 503' }
      return { route: target.route, probe: 'kimi', ok: true, fetchedAt: clock, stale: false, data: { kind: 'windows', weekly: { remainingPercent: 12 } } }
    },
  })
  const good = await degraded.load([{ route: 'steady', probe: 'kimi' }])
  assert.equal(good.quotas[0].ok, true)
  const stale = await degraded.load([{ route: 'steady', probe: 'kimi' }])
  assert.equal(stale.quotas[0].ok, true)
  assert.equal(stale.quotas[0].stale, true)
  assert.equal(stale.quotas[0].data.weekly.remainingPercent, 12)
  assert.equal(stale.quotas[0].error, 'HTTP 503')
  degraded.clear()

  // the cache is keyed by credential identity too: switching the account or
  // key on the same route re-probes, never serves the old credential's
  // numbers, and never degrades across identities.
  const idSeen = []
  const identityCache = createQuotaCache({
    now: () => clock,
    probe: async (target) => {
      idSeen.push(target.apiKey)
      if (target.apiKey === 'key-b') return { route: target.route, probe: 'codex', ok: false, reason: 'error', error: 'HTTP 503' }
      return { route: target.route, probe: 'codex', ok: true, fetchedAt: clock, stale: false, data: { kind: 'windows', weekly: { remainingPercent: 10 } } }
    },
  })
  const keyA = await identityCache.load([{ route: 'openai-codex', probe: 'codex', apiKey: 'key-a' }])
  assert.equal(keyA.quotas[0].data.weekly.remainingPercent, 10)
  const keyB = await identityCache.load([{ route: 'openai-codex', probe: 'codex', apiKey: 'key-b' }])
  assert.deepEqual(idSeen, ['key-a', 'key-b']) // same route, new identity: probed
  assert.equal(keyB.quotas[0].ok, false) // first failure under this identity: no stale fallback to key-a
  assert.equal(keyB.quotas[0].data, undefined)

  // rpc envelope: a successful read and a thrown loader both answer cleanly
  const rpcOk = await runQuotaQuery({ force: true }, async (options) => ({ quotas: [], forced: options.force }))
  assert.deepEqual(rpcOk, { ok: true, value: { quotas: [], forced: true } })
  const rpcBad = await runQuotaQuery({}, async () => { throw new Error('boom') })
  assert.equal(rpcBad.ok, false)
  assert.equal(rpcBad.error.code, 'bad-request')
  assert.match(rpcBad.error.message, /boom/)

  // envelope fetch handler: unwraps client-request envelopes, replies in kind
  const post = (body) => new Request('http://x/api/usage-ledger/dashboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  const echo = envelopeFetchHandler(async (payload) => ({ ok: true, value: { echoed: payload } }))
  const goodWire = await echo(post({ type: 'client-request', rpcId: 'r1', method: 'usage-ledger/dashboard', payload: { period: '7d' } }))
  assert.equal(goodWire.status, 200)
  assert.deepEqual(await goodWire.json(), { type: 'server-response', rpcId: 'r1', result: { ok: true, value: { echoed: { period: '7d' } } } })
  const notEnvelope = await (await echo(post({ hello: 1 }))).json()
  assert.equal(notEnvelope.rpcId, 'invalid-request')
  assert.equal(notEnvelope.result.ok, false)
  assert.equal((await echo(post('not json'))).status, 400)
  const throwing = envelopeFetchHandler(async () => { throw new Error('kaput') })
  assert.equal((await throwing(post({ type: 'client-request', rpcId: 'r2', method: 'm', payload: null }))).status, 500)

  // fetchJson: a gzipped body with no Content-Encoding (proxy-egress shape)
  // still parses, via the gzip magic sniff.
  {
    const { gzipSync } = await import('node:zlib')
    const { createServer } = await import('node:http')
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(gzipSync(JSON.stringify({ ok: true, via: req.url })))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const parsed = await fetchJson(`http://127.0.0.1:${server.address().port}/quota`, { timeoutMs: 5000 })
      assert.deepEqual(parsed, { ok: true, via: '/quota' })
    } finally {
      server.close()
    }
  }

  // Codex probe sends the OAuth bearer and account id only from the host.
  {
    const { createServer } = await import('node:http')
    let received
    const server = createServer((req, res) => {
      received = { authorization: req.headers.authorization, accountId: req.headers['chatgpt-account-id'], originator: req.headers.originator }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        plan_type: 'pro',
        rate_limit: { primary_window: { used_percent: 10, limit_window_seconds: 18_000 } },
      }))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const reading = await probeTarget({
        route: 'openai-codex', probe: 'codex', apiKey: 'oauth-access', accountId: 'acct-123',
        url: `http://127.0.0.1:${server.address().port}/usage`,
      }, 5000)
      assert.equal(reading.ok, true)
      assert.equal(reading.data.fiveHour.remainingPercent, 90)
      assert.deepEqual(received, { authorization: 'Bearer oauth-access', accountId: 'acct-123', originator: 'pi' })
    } finally {
      server.close()
    }
  }
}

// ---- quota report section ---------------------------------------------------
{
  const section = renderQuotaSection([
    { route: 'zai-coding-cn', probe: 'zhipu', ok: true, fetchedAt: 0, stale: false, data: { kind: 'windows', plan: 'pro', fiveHour: { remainingPercent: 81.5, resetIn: 7_800 }, weekly: { remainingPercent: 95.8, resetAt: new Date(Date.now() + 3 * 86_400_000).toISOString() }, mcp: { remaining: 870 } } },
    { route: 'kimi-coding', probe: 'kimi', ok: false, reason: 'unconfigured', error: 'no value for KIMI_CODING_API_KEY' },
    { route: 'openai-codex', probe: 'codex', ok: true, data: { kind: 'windows', plan: 'plus', fiveHour: { remainingPercent: 94 }, weekly: { remainingPercent: 77 }, codeReviewWeekly: { remainingPercent: 98 }, additionalLimits: [{ name: 'Sonic', fiveHour: { remainingPercent: 59 } }], credits: { hasCredits: true, unlimited: false, balance: 820.7 }, rateLimitResets: 1 } },
    { route: 'deepseek-official', probe: 'deepseek', ok: true, stale: true, data: { kind: 'balance', currency: 'CNY', available: 110, granted: 10, toppedUp: 100, sufficient: true } },
  ], Date.now())
  assert.match(section, /provider quotas/)
  assert.match(section, /智谱 GLM \(zai-coding-cn\) {2}plan pro/)
  assert.match(section, /82% left {3}resets in 2h 10m/)
  assert.match(section, /MCP calls {5}870 left/)
  assert.match(section, /Kimi \(kimi-coding\) — no credential configured/)
  assert.match(section, /OpenAI Codex \(openai-codex\) {2}plan plus/)
  assert.match(section, /code review\s+98% left/)
  assert.match(section, /Sonic 5h\s+59% left/)
  assert.match(section, /Codex credits\s+820\.7 left/)
  assert.match(section, /quota resets\s+1 available/)
  assert.match(section, /balance\s+¥110\.00, granted ¥10\.00, topped up ¥100\.00/)
  assert.match(section, /\[cached\]/)
  assert.equal(renderQuotaSection([]), '')
}

console.log('smoke: all assertions passed')
console.log()
console.log(text)
