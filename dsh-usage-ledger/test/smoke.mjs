/**
 * Standalone smoke test for the pure ledger modules (no harness needed):
 * entry construction, period parsing, aggregation, the three report
 * renderers, and the SQLite store round-trip.
 * Run with: node test/smoke.mjs
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseCommandArgs } from '../lib/args.js'
import { aggregate, entryFromCall, parsePeriod } from '../lib/ledger.js'
import { formatCompact, formatNumber, renderCsv, renderJson, renderTextReport } from '../lib/report.js'
import { openLedgerStore } from '../lib/store.js'

// ---- entry construction ---------------------------------------------------
const entry = entryFromCall({
  id: 'e1',
  time: new Date(2026, 7, 10, 12).getTime(),
  options: { provider: 'deepseek-official', model: 'deepseek-chat', sessionId: 'session-1', purpose: 'session-title' },
  usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 300, reasoningTokens: 40 },
  replayed: false,
})
assert.equal(entry.provider, 'deepseek-official')
assert.equal(entry.inputTokens, 1000)
assert.equal(entry.replayed, undefined)
assert.deepEqual(entryFromCall({
  id: 'e2', time: 0, options: {}, usage: { inputTokens: -5, outputTokens: 2 }, replayed: true,
}).replayed, true)
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
assert.equal(parsePeriod('7d', now).from, now - 7 * 86_400_000)
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
const text = renderTextReport({ ...result, totals: totalsWithSplit, dimension: 'model', label: 'August 2026', replayedExcluded: 1 })
assert.ok(text.includes('Usage · August 2026 · 4.2M tokens · 3 calls'))
assert.ok(text.includes('reported'))
assert.ok(text.includes('estimated'))
assert.ok(text.includes('replayed'))
assert.ok(text.includes('deepseek-official/deepseek-chat'))

const json = renderJson(entries, { period: 'August 2026' })
assert.ok(JSON.parse(json).entries.length === 3)
const csv = renderCsv(result.rows)
assert.ok(csv.startsWith('dimension,calls,input_tokens,cache_read_tokens,cache_write_tokens,output_tokens,total_tokens'))

// ---- command args ---------------------------------------------------------
assert.deepEqual(parseCommandArgs(''), { period: '', by: 'model', includeReplayed: false, json: undefined, csv: undefined, help: false, error: undefined })
assert.equal(parseCommandArgs('7d --by day').period, '7d')
assert.equal(parseCommandArgs('7d --by day').by, 'day')
assert.equal(parseCommandArgs('--json out.json').json, 'out.json')
assert.equal(parseCommandArgs('--json').json, null)
assert.ok(parseCommandArgs('--bogus').error !== undefined)
assert.ok(parseCommandArgs('--by nope').error !== undefined)
assert.equal(parseCommandArgs('a b').error !== undefined, true)

// ---- sqlite store round-trip ----------------------------------------------
{
  const dir = mkdtempSync(join(tmpdir(), 'usage-ledger-test-'))
  try {
    const store = openLedgerStore(join(dir, 'ledger.sqlite'))
    store.put('e1', 100, { id: 'e1', time: 100, provider: 'p', model: 'm', inputTokens: 1, outputTokens: 2 })
    store.put('e2', 200, { id: 'e2', time: 200, provider: 'p', model: 'm', inputTokens: 3, outputTokens: 4 })
    let loaded = store.loadAll()
    assert.equal(loaded.size, 2)
    assert.deepEqual(loaded.get('e1'), { id: 'e1', time: 100, provider: 'p', model: 'm', inputTokens: 1, outputTokens: 2 })
    // insert-or-replace
    store.put('e1', 150, { id: 'e1', time: 150, provider: 'p', model: 'm', inputTokens: 9, outputTokens: 0 })
    assert.equal(store.loadAll().get('e1').inputTokens, 9)
    // prune
    assert.equal(store.pruneBefore(151), 1)
    loaded = store.loadAll()
    assert.equal(loaded.size, 1)
    assert.ok(loaded.has('e2'))
    // delete + reopen persistence
    store.delete('e2')
    assert.equal(store.loadAll().size, 0)
    store.close()
    const reopened = openLedgerStore(join(dir, 'ledger.sqlite'))
    assert.equal(reopened.loadAll().size, 0)
    reopened.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log('smoke: all assertions passed')
console.log()
console.log(text)
