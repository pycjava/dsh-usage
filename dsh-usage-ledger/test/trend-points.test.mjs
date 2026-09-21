/**
 * Regression test for the 今日 blank-page bug: the browser client can be
 * newer than the plugin host (host code loads only at app boot, the client
 * bundle is served per page load), so a pre-0.6.0 host answers the dashboard
 * RPC without `todayHours`. The 今日 view must degrade to an empty chart —
 * never throw during render and blank the whole settings page.
 *
 * Run with: node test/trend-points.test.mjs   (Node ≥24 strips the types of
 * the imported .ts module natively)
 */

import assert from 'node:assert/strict'
import { buildTrendPoints } from '../src/client/trend-points.ts'

const fmtTick = (day) => day
const fmtTip = (day) => day

// 0.6.0-shape report: hourly buckets drive the 今日 view
const fresh = {
  todayHours: {
    day: '2026-09-21',
    hours: [
      { hour: 0, tokens: 0, values: {} },
      { hour: 1, tokens: 120, values: { 'p/m': 120 } },
    ],
  },
  series: [
    { day: '2026-09-20', tokens: 10, values: { 'p/m': 10 } },
    { day: '2026-09-21', tokens: 120, values: { 'p/m': 120 } },
  ],
}

const today = buildTrendPoints(fresh, 'today', fmtTick, fmtTip)
assert.equal(today.length, 2)
assert.equal(today[0].key, 'h0')
assert.equal(today[1].tick, '1:00')
assert.equal(today[1].tip, '2026-09-21 1:00')
assert.equal(today[1].tokens, 120)

// 7d/30d slice the daily series
assert.equal(buildTrendPoints(fresh, '7d', fmtTick, fmtTip).length, 2)
assert.equal(buildTrendPoints(fresh, '30d', fmtTick, fmtTip)[0].key, '2026-09-20')

// The blank-page regression: a stale host sends no `todayHours`; 今日 must
// return an empty window instead of throwing "Cannot read properties of
// undefined (reading 'hours')" mid-render.
const stale = { series: fresh.series }
let points
assert.doesNotThrow(() => { points = buildTrendPoints(stale, 'today', fmtTick, fmtTip) })
assert.deepEqual(points, [])

console.log('trend-points: all assertions passed')
