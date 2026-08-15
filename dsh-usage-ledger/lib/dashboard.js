/**
 * Pure dashboard aggregation for the settings panel: summary cards (tokens,
 * sessions, calls, active days, current streak, top model), the activity
 * heatmap series, and the daily stacked-by-model trend. Computed from
 * period-filtered ledger entries; no harness imports — testable standalone.
 *
 * @module dsh-usage-ledger/dashboard
 */

import { DAY_MS } from './ledger.js'

/** Local YYYY-MM-DD day key (same convention as the ledger's by-day key). */
export function dayKey(ms) {
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function startOfLocalDay(ms) {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Add whole LOCAL calendar days (DST-safe: local dates advance one per step). */
function addCalendarDays(ms, days) {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime()
}

/** Whole local calendar days from `start`'s date through `end`'s date, inclusive. */
function calendarDaysBetween(start, end) {
  const left = new Date(start)
  const right = new Date(end)
  const leftUtc = Date.UTC(left.getFullYear(), left.getMonth(), left.getDate())
  const rightUtc = Date.UTC(right.getFullYear(), right.getMonth(), right.getDate())
  return Math.round((rightUtc - leftUtc) / DAY_MS) + 1
}

/** Tokens carried by one entry (same sum as the reports: input + caches + output). */
function entryTokens(entry) {
  return entry.inputTokens + (entry.cacheReadTokens ?? 0) + (entry.cacheWriteTokens ?? 0) + entry.outputTokens
}

/**
 * Build the dashboard payload.
 * @param entries - ledger entries inside [from, to) (zero-usage rows already
 *   filtered by the caller).
 * @param options - { from, to, now, allTimeEntries } — allTimeEntries feeds
 *   the streak and the heatmap (both look beyond the selected window).
 * @returns dashboard value for the RPC response.
 */
export function buildDashboard(entries, options) {
  const { from, to, now } = options
  const allTimeEntries = options.allTimeEntries ?? entries

  let calls = 0
  let inputTokens = 0
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  let outputTokens = 0
  let reportedTokens = 0
  let estimatedTokens = 0
  const sessions = new Set()
  const activeDayKeys = new Set()
  const byModel = new Map()
  const byDay = new Map()
  for (const entry of entries) {
    calls += 1
    inputTokens += entry.inputTokens ?? 0
    cacheReadTokens += entry.cacheReadTokens ?? 0
    cacheWriteTokens += entry.cacheWriteTokens ?? 0
    outputTokens += entry.outputTokens ?? 0
    if (entry.sessionId !== undefined) sessions.add(entry.sessionId)
    const day = dayKey(entry.time)
    activeDayKeys.add(day)
    const model = `${entry.provider}/${entry.model}`
    const tokens = entryTokens(entry)
    if (entry.estimated === true) estimatedTokens += tokens
    else reportedTokens += tokens
    byModel.set(model, (byModel.get(model) ?? 0) + tokens)
    let dayModels = byDay.get(day)
    if (dayModels === undefined) {
      dayModels = new Map()
      byDay.set(day, dayModels)
    }
    dayModels.set(model, (dayModels.get(model) ?? 0) + tokens)
  }
  const totalTokens = inputTokens + cacheReadTokens + cacheWriteTokens + outputTokens

  // Daily stacked series: one bucket per LOCAL calendar day inside [from, to),
  // anchored to the period's own end (which may be a past month/range), not
  // to "today". Current windows end at today by construction.
  const seriesEnd = Math.min(startOfLocalDay(to - 1), startOfLocalDay(now))
  const seriesStart = startOfLocalDay(from)
  const count = Math.max(1, Math.min(400, calendarDaysBetween(seriesStart, seriesEnd)))
  const models = [...byModel.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label)
  const series = []
  for (let index = count - 1; index >= 0; index--) {
    const day = dayKey(addCalendarDays(seriesEnd, -index))
    const dayModels = byDay.get(day)
    const values = {}
    let tokens = 0
    for (const model of models) {
      const value = dayModels?.get(model) ?? 0
      values[model] = value
      tokens += value
    }
    series.push({ day, tokens, values })
  }

  // Top model by total tokens, with its share of the period total.
  let topModel = null
  for (const [label, tokens] of byModel) {
    if (topModel === null || tokens > topModel.tokens) topModel = { label, tokens }
  }
  if (topModel !== null) {
    topModel = { ...topModel, share: totalTokens > 0 ? topModel.tokens / totalTokens : 0 }
  }

  // All-time daily totals feed the heatmap cells beyond the selected window.
  const dailyTotals = {}
  for (const entry of allTimeEntries) {
    const day = dayKey(entry.time)
    dailyTotals[day] = (dailyTotals[day] ?? 0) + entryTokens(entry)
  }

  // Current streak: consecutive active days ending at the most recent active
  // day — a streak stays alive while today or yesterday has activity.
  const todayStart = startOfLocalDay(now)
  let streakDays = 0
  if (dailyTotals[dayKey(now)] !== undefined || dailyTotals[dayKey(addCalendarDays(now, -1))] !== undefined) {
    let cursor = dailyTotals[dayKey(now)] !== undefined ? todayStart : addCalendarDays(todayStart, -1)
    while (dailyTotals[dayKey(cursor)] !== undefined) {
      streakDays += 1
      cursor = addCalendarDays(cursor, -1)
    }
  }

  return {
    totals: { calls, inputTokens, cacheReadTokens, cacheWriteTokens, outputTokens, totalTokens, reportedTokens, estimatedTokens },
    sessions: sessions.size,
    activeDays: activeDayKeys.size,
    streakDays,
    topModel,
    models,
    series,
    dailyTotals,
  }
}
