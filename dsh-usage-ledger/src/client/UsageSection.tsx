/**
 * The 数据与统计 settings section: dashboard layout — period toggle, six
 * summary cards, a GitHub-style activity heatmap, and the daily token trend
 * stacked by model. Pure read surface; data arrives over the plugin's
 * private RPC channel.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { heatLevel } from '../../lib/heat-level.js'
import type {
  DashboardReport, LocaleSeat, SettingsSectionOwnerProps, UsageSectionInjected,
} from './types.ts'
import css from './UsageSection.module.css'

/** Full component props assembled by the settings slot renderer. */
export type UsageSectionProps =
  & SettingsSectionOwnerProps
  & UsageSectionInjected
  & LocaleSeat

const PERIODS = ['7d', '30d'] as const
type Period = (typeof PERIODS)[number]

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly report: DashboardReport }

/** One heatmap cell: local day key, all-time tokens, color level, past today. */
type HeatColumn = { readonly key: string; readonly tokens: number; readonly level: number; readonly future: boolean }

/** Categorical colors for the trend legend (mid-tone, legible on both themes). */
const MODEL_COLORS = ['#4d93f8', '#22c55e', '#f7ad31', '#a78bfa', '#f87171', '#7f8287', '#b7c8fe']

/** Heatmap grid: weeks shown, ending at the current week. A full year keeps
 * the cells small when the grid stretches to the panel width. */
const HEAT_WEEKS = 53

/** Trend column cap + gap (px). Must mirror .trendColumn/.trend CSS: the
 * frame width formula keeps ticks and tooltip on the columns' coordinate
 * system. The cap is high enough that the 7d chart fills the block (wide
 * bars, one date label per bar) while 30d still stretches edge to edge. */
const TREND_COLUMN_MAX = 110
const TREND_GAP = 2

/** Minimum gap (px) between adjacent tick centers: the 11px "M/D" date
 * labels stay ~30px wide, so 44px keeps them from crowding. */
const TREND_TICK_GAP = 44

/** Local YYYY-MM-DD key (mirrors the host's day convention). */
function dayKeyOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 89795000 -> "8979.5万" (zh) / "89.8M" (en). */
function formatTokens(value: number, zh: boolean): string {
  if (zh) {
    if (value >= 100_000_000) return `${trim(value / 100_000_000)}亿`
    if (value >= 10_000) return `${trim(value / 10_000)}万`
    return String(value)
  }
  if (value >= 1_000_000_000) return `${trim(value / 1_000_000_000)}G`
  if (value >= 1_000_000) return `${trim(value / 1_000_000)}M`
  if (value >= 1_000) return `${trim(value / 1_000)}K`
  return String(value)
}

function trim(value: number): string {
  if (value >= 100) return String(Math.round(value))
  if (value >= 10) return String(Math.round(value * 10) / 10)
  return String(Math.round(value * 100) / 100)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

/** Render the usage dashboard section. */
export function UsageSection({ query, localeId, t }: UsageSectionProps): ReactNode {
  const [period, setPeriod] = useState<Period>('30d')
  const [request, setRequest] = useState(0)
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  /** Trend column under the pointer; drives the floating tooltip. */
  const [hovered, setHovered] = useState<number | null>(null)

  useEffect(() => {
    let current = true
    setState({ status: 'loading' })
    void query({ period }).then(
      (result) => {
        if (!current) return
        if (result.ok) setState({ status: 'ready', report: result.value })
        else setState({ status: 'error' })
      },
      () => {
        if (current) setState({ status: 'error' })
      },
    )
    return () => { current = false }
  }, [query, period, request])

  const zh = localeId().startsWith('zh')
  const report = state.status === 'ready' ? state.report : undefined

  const heat = useMemo(() => {
    if (report === undefined) return { columns: [] as HeatColumn[][], months: [] as (string | null)[] }
    const max = Math.max(1, ...Object.values(report.dailyTotals))
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    const first = todayStart - ((HEAT_WEEKS - 1) * 7 + new Date(todayStart).getDay()) * 86_400_000
    const columns: HeatColumn[][] = []
    for (let week = 0; week < HEAT_WEEKS; week++) {
      const column: HeatColumn[] = []
      for (let row = 0; row < 7; row++) {
        const ms = first + (week * 7 + row) * 86_400_000
        const future = ms > todayStart
        const tokens = future ? 0 : (report.dailyTotals[dayKeyOf(new Date(ms))] ?? 0)
        const level = future ? 0 : heatLevel(tokens, max)
        column.push({ key: dayKeyOf(new Date(ms)), tokens, level, future })
      }
      columns.push(column)
    }
    // One label slot per week, filled only where the month changes.
    const monthFormatter = new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-US', { month: 'short' })
    const months = columns.map((column, index) => {
      if (index > 0 && column[0].key.slice(0, 7) === columns[index - 1][0].key.slice(0, 7)) return null
      const [year, month, date] = column[0].key.split('-').map(Number)
      return monthFormatter.format(new Date(year, month - 1, date))
    })
    return { columns, months }
  }, [report, zh])

  const trendMax = useMemo(
    () => (report === undefined ? 1 : Math.max(1, ...report.series.map((day) => day.tokens))),
    [report],
  )
  const trendTicks = useMemo(() => {
    if (report === undefined) return []
    const count = report.series.length
    if (count < 2) return [0]
    // Nominal tick-strip width (mirrors the inline frame formula): pick the
    // largest even step whose ticks stay ≥TREND_TICK_GAP apart. 7d labels
    // every bar, 30d roughly weekly, never more than 7 ticks.
    const frame = Math.min(720, count * (TREND_COLUMN_MAX + TREND_GAP) - TREND_GAP)
    const maxTicks = Math.min(7, Math.max(2, Math.floor(frame / TREND_TICK_GAP) + 1))
    const step = Math.ceil((count - 1) / (maxTicks - 1))
    const ticks: number[] = []
    for (let index = 0; index < count - 1; index += step) ticks.push(index)
    ticks.push(count - 1)
    return ticks
  }, [report])

  // Tooltip inputs, guarded against a hover outliving a period switch.
  const inRange = hovered !== null && report !== undefined && hovered < report.series.length
  const hoveredDay = inRange ? report!.series[hovered!] : undefined
  const hoveredRows = inRange
    ? report!.models
      .map((model, index) => ({ model, color: MODEL_COLORS[index % MODEL_COLORS.length], value: hoveredDay!.values[model] ?? 0 }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
    : []
  const hoveredLeft = inRange ? ((hovered! + 0.5) / report!.series.length) * 100 : 50
  const hoveredShift = hoveredLeft < 12 ? '0%' : hoveredLeft > 88 ? '-100%' : '-50%'

  const dateLabel = (day: string): string => {
    const [year, month, date] = day.split('-').map(Number)
    return new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric' })
      .format(new Date(year, month - 1, date))
  }
  const heatLabel = (day: string): string => {
    const [year, month, date] = day.split('-').map(Number)
    return new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })
      .format(new Date(year, month - 1, date))
  }

  return (
    <div className={css.section} aria-busy={state.status === 'loading'}>
      <div className={css.header}>
        <span className={css.rangeLabel}>{t('range')}</span>
        <div className={css.headerActions}>
          <div className={css.seg} role="group" aria-label={t('range')}>
            {PERIODS.map((value) => (
              <button
                key={value}
                type="button"
                className={css.segButton}
                aria-pressed={period === value}
                onClick={() => { setPeriod(value) }}
              >
                {t(`period.${value}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={css.refresh}
            aria-label={t('refresh')}
            onClick={() => { setRequest((value) => value + 1) }}
          >
            {t('refresh')}
          </button>
        </div>
      </div>

      {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css.failure}>
          <p role="alert">{t('error')}</p>
          <button type="button" onClick={() => { setRequest((value) => value + 1) }}>{t('retry')}</button>
        </div>
      ) : null}
      {state.status === 'ready' && report!.totals.calls === 0 ? (
        <p className={css.status}>{t('empty')}</p>
      ) : null}

      {state.status === 'ready' && report!.totals.calls > 0 ? (
        <>
          <div className={css.cards}>
            <div className={css.card}>
              <span className={css.cardLabel}><IconFlame />{t('stat.tokens')}</span>
              <span className={css.cardValue}>{formatTokens(report!.totals.totalTokens, zh)}</span>
            </div>
            <div className={css.card}>
              <span className={css.cardLabel}><IconChat />{t('stat.sessions')}</span>
              <span className={css.cardValue}>{formatNumber(report!.sessions)}</span>
            </div>
            <div className={css.card}>
              <span className={css.cardLabel}><IconMessage />{t('stat.calls')}</span>
              <span className={css.cardValue}>{formatNumber(report!.totals.calls)}</span>
            </div>
            <div className={css.card}>
              <span className={css.cardLabel}><IconCalendar />{t('stat.activeDays')}</span>
              <span className={css.cardValue}>{formatNumber(report!.activeDays)}</span>
            </div>
            <div className={css.card}>
              <span className={css.cardLabel}><IconBolt />{t('stat.streak')}</span>
              <span className={css.cardValue}>{formatNumber(report!.streakDays)}</span>
            </div>
            <div className={css.card}>
              <span className={css.cardLabel}><IconSparkle />{t('stat.topModel')}</span>
              <span className={css.cardValueSmall} title={report!.topModel?.label ?? ''}>
                {report!.topModel === null ? '—' : modelShortName(report!.topModel.label)}
              </span>
              {report!.topModel !== null ? (
                <span className={css.cardSub}>{t('stat.share', { p: `${Math.round(report!.topModel.share * 100)}%` })}</span>
              ) : null}
            </div>
          </div>

          <div className={css.block}>
            <div className={css.blockHead}>
              <h3 className={css.blockTitle}>{t('heatmap')}</h3>
              <span className={css.heatLegend} aria-hidden="true">
                {t('less')}
                <span className={css.heatCellL0} />
                <span className={css.heatCellL1} />
                <span className={css.heatCellL2} />
                <span className={css.heatCellL3} />
                <span className={css.heatCellL4} />
                {t('more')}
              </span>
            </div>
            <div className={css.heatMonths} aria-hidden="true">
              {heat.months.map((label, index) => (
                <span key={heat.columns[index][0].key}>{label}</span>
              ))}
            </div>
            <div
              className={css.heat}
              role="img"
              aria-label={t('heatmap')}
              style={{ aspectRatio: `${HEAT_WEEKS} / 7` }}
            >
              {heat.columns.map((column) => column.map((cell) => (
                <span
                  key={cell.key}
                  className={cell.future ? css.heatCellOff : css[`heatCellL${cell.level}`]}
                  title={cell.future ? undefined : `${heatLabel(cell.key)} · ${formatTokens(cell.tokens, zh)}`}
                />
              )))}
            </div>
          </div>

          <div className={css.block}>
            <div className={css.blockHead}>
              <h3 className={css.blockTitle}>{t('trend')}</h3>
            </div>
            <div
              className={css.trendFrame}
              style={{ width: `min(100%, ${report!.series.length * (TREND_COLUMN_MAX + TREND_GAP) - TREND_GAP}px)` }}
            >
              <div className={css.trend} onMouseLeave={() => setHovered(null)}>
                {report!.series.map((day, index) => (
                  <div
                    className={css.trendColumn}
                    key={day.day}
                    aria-label={`${heatLabel(day.day)} · ${formatTokens(day.tokens, zh)}`}
                    onMouseEnter={() => setHovered(index)}
                  >
                    <div className={css.trendBar}>
                      {[...report!.models].reverse().map((model) => {
                        const value = day.values[model] ?? 0
                        if (value === 0) return null
                        return (
                          <span
                            key={model}
                            className={css.trendSegment}
                            style={{
                              height: `${Math.max(1.5, (value / trendMax) * 100)}%`,
                              background: MODEL_COLORS[report!.models.indexOf(model) % MODEL_COLORS.length],
                            }}
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
                {hoveredDay !== undefined ? (
                  <div
                    className={css.tooltip}
                    style={{ left: `${hoveredLeft}%`, transform: `translateX(${hoveredShift})` }}
                    role="status"
                  >
                    <span className={css.tooltipDate}>{heatLabel(hoveredDay.day)}</span>
                    <div className={css.tooltipTotal}>
                      <span className={css.tooltipName}>{t('tooltip.total')}</span>
                      <span className={css.tooltipValue}>{formatTokens(hoveredDay.tokens, zh)}</span>
                    </div>
                    {hoveredRows.map((row) => (
                      <div className={css.tooltipRow} key={row.model}>
                        <span className={css.legendDot} style={{ background: row.color }} />
                        <span className={css.tooltipName}>{modelShortName(row.model)}</span>
                        <span className={css.tooltipValue}>{formatTokens(row.value, zh)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className={css.ticks} aria-hidden="true">
                {trendTicks.map((index) => (
                  <span key={index} style={{ left: `${((index + 0.5) / report!.series.length) * 100}%` }}>
                    {dateLabel(report!.series[index].day)}
                  </span>
                ))}
              </div>
            </div>
            {report!.models.length > 0 ? (
              <div className={css.legend}>
                {report!.models.map((model, index) => (
                  <span className={css.legendItem} key={model} title={model}>
                    <span
                      className={css.legendDot}
                      style={{ background: MODEL_COLORS[index % MODEL_COLORS.length] }}
                    />
                    {modelShortName(model)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <p className={css.meta}>
            {period === '7d' ? t('period.7d') : t('period.30d')}
            {report!.totals.reportedTokens !== undefined ? (
              <>
                {' · '}
                {formatTokens(report!.totals.reportedTokens, zh)} {t('reported')}
                {report!.totals.estimatedTokens !== undefined && report!.totals.estimatedTokens > 0 ? (
                  <>
                    {' · '}
                    {formatTokens(report!.totals.estimatedTokens, zh)} {t('estimated')}
                  </>
                ) : null}
              </>
            ) : null}
          </p>
          {report!.totals.estimatedTokens !== undefined && report!.totals.estimatedTokens > 0 ? (
            <p className={css.meta}>{t('estimatedHint')}</p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

/** Short display name of one provider/model pair (legend + top-model card). */
function modelShortName(label: string): string {
  const slash = label.indexOf('/')
  return slash < 0 ? label : label.slice(slash + 1)
}

/** 14px inline glyph shared by the summary cards. */
function Glyph({ path }: { path: string }): ReactNode {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d={path} fill="currentColor" />
    </svg>
  )
}

function IconFlame(): ReactNode {
  return <Glyph path="M7.2 0.8c0.9 2.4 2.9 3.9 2.9 6.4a3.1 3.1 0 1 1-6.2 0c0-0.9 0.4-1.8 0.9-2.5 0.5 1.4 1 2.3 1.7 3C6.3 5.5 6.1 3.4 7.2 0.8z" />
}
function IconChat(): ReactNode {
  return <Glyph path="M2 1.5h7a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 9 8.5H5.5L3 10.8V8.5H2A1.5 1.5 0 0 1 0.5 7V3A1.5 1.5 0 0 1 2 1.5zm9.5 7.5V6.8a3 3 0 0 1 1 2.2v1.4a1.5 1.5 0 0 1-1.5 1.5H9.4v-1.4h1.6a0.5 0.5 0 0 0 0.5-0.5V9z" />
}
function IconMessage(): ReactNode {
  return <Glyph path="M2 2h10a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 12 11H6l-3.2 2.4V11H2a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 2 2z" />
}
function IconCalendar(): ReactNode {
  return <Glyph path="M3.5 1v2h-1A1.5 1.5 0 0 0 1 4.5v7A1.5 1.5 0 0 0 2.5 13h9a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 11.5 3h-1V1h-1.4v2H4.9V1H3.5zM2.4 5.6h9.2v5.9a0.1 0.1 0 0 1-0.1 0.1H2.5a0.1 0.1 0 0 1-0.1-0.1V5.6z" />
}
function IconBolt(): ReactNode {
  return <Glyph path="M8.2 0.5L2.6 8h3l-1.4 5.5L9.8 6h-3l1.4-5.5z" />
}
function IconSparkle(): ReactNode {
  return <Glyph path="M7 0.5l1.5 4.4 4.4 1.6-4.4 1.6L7 12.5 5.5 8.1 1.1 6.5l4.4-1.6L7 0.5zM11.5 9.5l0.7 1.8 1.8 0.7-1.8 0.7-0.7 1.8-0.7-1.8-1.8-0.7 1.8-0.7 0.7-1.8z" />
}

/** 16px line-chart glyph registered as the settings-section nav icon (see
 * `index.ts` — passed via the `icon` registration option the shell renders
 * ahead of its id→glyph map). Matches the DSH Outline16 family: thin strokes,
 * `currentColor`, so it follows the nav theme. */
export function UsageNavIcon({ size = 16, className }: { size?: number; className?: string }): ReactNode {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2 13.5V2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M2 13.5H14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M3.5 11L6 7.5L8.5 9L11 4.5L13.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="3.5" cy="11" r="1.1" fill="currentColor" />
      <circle cx="6" cy="7.5" r="1.1" fill="currentColor" />
      <circle cx="8.5" cy="9" r="1.1" fill="currentColor" />
      <circle cx="11" cy="4.5" r="1.1" fill="currentColor" />
      <circle cx="13.5" cy="2.5" r="1.1" fill="currentColor" />
    </svg>
  )
}
