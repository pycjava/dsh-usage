/**
 * Standalone smoke test for the pure ledger modules (no harness needed):
 * entry construction, period parsing, aggregation, the text report, and
 * the SQLite store round-trip.
 * Run with: node test/smoke.mjs
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { buildDashboard, dayKey } from '../lib/dashboard.js'
import { aggregate, entryFromCall, parsePeriod, requeueUnwritten } from '../lib/ledger.js'
import { formatCompact, formatNumber, renderTextReport } from '../lib/report.js'
import { runDashboardQuery } from '../lib/rpc.js'
import { openLedgerStore } from '../lib/store.js'

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

console.log('smoke: all assertions passed')
console.log()
console.log(text)
