/**
 * Pure trend-window logic for the 数据与统计 panel: pick the x-slots the
 * trend chart and donut show for a period — 7d/30d slice the daily series,
 * 今日 draws the report's hourly buckets. Extracted from UsageSection (no
 * JSX here) so the wire-shape edge cases are unit-testable under plain Node.
 *
 * @module dsh-usage-ledger/client/trend-points
 */

import type { DashboardReport } from './types.ts'

/** One x-slot of the trend chart: a day (7d/30d) or an hour (今日). */
export interface TrendPoint {
  readonly key: string
  readonly tokens: number
  readonly values: Record<string, number>
  /** Axis tick label ("M/D" for days, "H:00" for hours). */
  readonly tick: string
  /** Tooltip header (date for days, date + hour for hours). */
  readonly tip: string
}

export type TrendPeriod = 'today' | '7d' | '30d'

/** Build the visible window for one period. */
export function buildTrendPoints(
  report: DashboardReport,
  period: TrendPeriod,
  formatTick: (day: string) => string,
  formatTip: (day: string) => string,
): TrendPoint[] {
  if (period === 'today') {
    // A pre-0.6.0 host sends no `todayHours` (the client bundle is served
    // per page load, but host plugin code only loads at app boot). Degrade
    // to an empty chart — never throw mid-render and blank the settings
    // page (the 今日 blank-page bug).
    const today = report.todayHours
    if (today === undefined) return []
    return today.hours.map((bucket) => ({
      key: `h${bucket.hour}`,
      tokens: bucket.tokens,
      values: bucket.values,
      tick: `${bucket.hour}:00`,
      tip: `${formatTip(today.day)} ${bucket.hour}:00`,
    }))
  }
  const days = period === '7d' ? report.series.slice(-7) : report.series
  return days.map((day) => ({
    key: day.day,
    tokens: day.tokens,
    values: day.values,
    tick: formatTick(day.day),
    tip: formatTip(day.day),
  }))
}
