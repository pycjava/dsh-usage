/**
 * The 数据与统计 settings section: dashboard layout — six summary cards, the
 * provider-allowance block, a GitHub-style activity heatmap, and the token
 * trend as per-model colored lines under a neutral total line. Pure read
 * surface; data arrives over the plugin's private RPC channel (the quota
 * block over its own endpoint, so a slow vendor cannot delay the usage
 * numbers).
 *
 * The report is always queried for 30 days; the 7-day view is a client-side
 * slice of that series and 今日 draws the report's hourly buckets, so the
 * period toggle swaps instantly with no second round-trip. The toggle lives
 * in the trend block's header (the only charts it affects) and the cards
 * stay fixed to the 30-day window.
 */

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { heatLevel } from '../../lib/heat-level.js'
import { QuotaBlock } from './QuotaBlock.tsx'
import { buildTrendPoints, type TrendPoint } from './trend-points.ts'
import type {
  DashboardReport, LocaleSeat, SettingsSectionOwnerProps, UsageSectionInjected,
} from './types.ts'
import css from './UsageSection.module.css'

/** Full component props assembled by the settings slot renderer. */
export type UsageSectionProps =
  & SettingsSectionOwnerProps
  & UsageSectionInjected
  & LocaleSeat

const PERIODS = ['today', '7d', '30d'] as const
type Period = (typeof PERIODS)[number]

/** The one and only period requested from the ledger; `period.30d` labels
 * everything that comes straight from the report (cards, meta line). */
const QUERY_PERIOD = '30d'

/** How long the opening animation choreography runs before the one-shot
 * animation classes are dropped (longest chain: model-line cascade ≈1.3s). */
const PLAY_ONCE_MS = 1400

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly report: DashboardReport }

/** One heatmap cell: local day key, all-time tokens, color level, past today. */
type HeatColumn = { readonly key: string; readonly tokens: number; readonly level: number; readonly future: boolean }

/** One line in the chart's percentage coordinate space. */
type TrendLine = {
  readonly key: string
  readonly color: string
  readonly points: readonly { readonly x: number; readonly y: number }[]
}

/** Categorical colors for the model lines (mid-tone, legible on both themes). */
const MODEL_COLORS = ['#4d93f8', '#22c55e', '#f7ad31', '#a78bfa', '#f87171', '#7f8287', '#b7c8fe']

/** Heatmap grid: weeks shown, ending at the current week. A full year keeps
 * the cells small when the grid stretches to the panel width. */
const HEAT_WEEKS = 53

/** Model-share donut geometry (SVG viewBox 120x120, center 60,60). */
const RING_RADIUS = 40
const RING_STROKE = 14
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/** Most named rows before the tail collapses into Other (the rest still
 * sums into its own slice, so the donut always covers 100%). */
const SHARE_MAX_NAMED = 5

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

/** Catmull-Rom spline through the points, emitted as cubic Béziers. The
 * curve interpolates every point (markers stay glued), and control points
 * are clamped to the chart box so a spike never pulls the line past the
 * baseline or above the frame. */
function smoothLinePath(points: readonly { readonly x: number; readonly y: number }[]): string {
  if (points.length === 0) return ''
  const fmt = (value: number): string => value.toFixed(2)
  const clampY = (value: number): number => Math.min(100, Math.max(0, value))
  let d = `M${fmt(points[0].x)} ${fmt(points[0].y)}`
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[index - 1] ?? points[index]
    const p1 = points[index]
    const p2 = points[index + 1]
    const p3 = points[index + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c1y = clampY(p1.y + (p2.y - p0.y) / 6)
    const c2y = clampY(p2.y - (p3.y - p1.y) / 6)
    d += ` C${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2.x)} ${fmt(p2.y)}`
  }
  return d
}

/** Points of one series in the frame's percentage space: x sits on the
 * column centers (same formula as the ticks), y maps value/trendMax to the
 * chart height. */
function toGeometry(values: readonly number[], trendMax: number): TrendLine['points'] {
  const n = Math.max(1, values.length)
  return values.map((value, index) => ({
    x: ((index + 0.5) / n) * 100,
    y: 100 - (value / trendMax) * 100,
  }))
}

/** Render the usage dashboard section. */
export function UsageSection({ query, queryQuotas, localeId, t }: UsageSectionProps): ReactNode {
  const [period, setPeriod] = useState<Period>('30d')
  const [request, setRequest] = useState(0)
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  /** True until the opening choreography has played once (page open only:
   * period switches and refreshes swap data in place, with no replay). */
  const [playOnce, setPlayOnce] = useState(true)
  /** Trend column under the pointer; drives the markers + floating tooltip. */
  const [hovered, setHovered] = useState<number | null>(null)
  /** Model-share donut slice under the pointer (dims the others). */
  const [shareHover, setShareHover] = useState<number | null>(null)

  useEffect(() => {
    let current = true
    setState({ status: 'loading' })
    void query({ period: QUERY_PERIOD }).then(
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
  }, [query, request])

  // Drop the one-shot animation classes once the opening run is over, so a
  // refresh (which remounts the charts through the loading state) renders
  // them statically.
  useEffect(() => {
    if (state.status !== 'ready' || !playOnce) return
    const timer = window.setTimeout(() => { setPlayOnce(false) }, PLAY_ONCE_MS)
    return () => { window.clearTimeout(timer) }
  }, [state.status, playOnce])

  const zh = localeId().startsWith('zh')
  const report = state.status === 'ready' ? state.report : undefined

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

  /** Full provider/model label -> legend display name. Several providers can
   * serve the same model name, so we keep the bare model name only while it is
   * unique across the report; on a collision the full provider/model key is
   * shown so the rows (and the donut slices) stay distinguishable. */
  const modelDisplay = useMemo(() => {
    const models = report?.models ?? []
    const counts = new Map<string, number>()
    for (const label of models) {
      const short = modelShortName(label)
      counts.set(short, (counts.get(short) ?? 0) + 1)
    }
    const map = new Map<string, string>()
    for (const label of models) {
      map.set(label, (counts.get(modelShortName(label)) ?? 0) > 1 ? label : modelShortName(label))
    }
    return map
  }, [report])
  const labelOf = (label: string): string => modelDisplay.get(label) ?? label

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

  /** The window the trend chart and donut actually show: 7d is a tail slice
   * of the 30-day series and 今日 draws the hourly buckets, so toggling
   * never needs a round-trip. (The window math lives in trend-points.ts —
   * pure, unit-tested, and tolerant of a stale host without `todayHours`.) */
  const trendPoints = useMemo(
    (): TrendPoint[] => (report === undefined ? [] : buildTrendPoints(report, period, dateLabel, heatLabel)),
    // dateLabel/heatLabel close over the locale; zh captures both.
    [report, period, zh],
  )

  const trendMax = useMemo(
    () => Math.max(1, ...trendPoints.map((point) => point.tokens)),
    [trendPoints],
  )

  /** Models with any usage inside the visible window, in the report's
   * legend order — a model whose line would sit flat on the baseline is
   * noise, so neither its line nor its legend row is drawn. */
  const windowModels = useMemo(() => {
    const models = report?.models ?? []
    return models.filter((model) => trendPoints.some((point) => (point.values[model] ?? 0) > 0))
  }, [report, trendPoints])

  /** Per-model lines plus the neutral total line, all in percentage space. */
  const modelLines = useMemo((): TrendLine[] => {
    const models = report?.models ?? []
    return windowModels.map((model) => ({
      key: model,
      color: MODEL_COLORS[models.indexOf(model) % MODEL_COLORS.length],
      points: toGeometry(trendPoints.map((point) => point.values[model] ?? 0), trendMax),
    }))
  }, [report, windowModels, trendPoints, trendMax])
  const totalPoints = useMemo(
    () => toGeometry(trendPoints.map((point) => point.tokens), trendMax),
    [trendPoints, trendMax],
  )

  /** Tick indexes: at most 7, always including the last slot. */
  const trendTicks = useMemo(() => {
    const count = trendPoints.length
    if (count < 2) return count === 1 ? [0] : []
    const step = Math.ceil((count - 1) / 6)
    const ticks: number[] = []
    for (let index = 0; index < count - 1; index += step) ticks.push(index)
    ticks.push(count - 1)
    return ticks
  }, [trendPoints])

  /** Token total of the visible window (the donut's center number and the
   * denominator of its shares). */
  const windowTokens = useMemo(
    () => trendPoints.reduce((sum, point) => sum + point.tokens, 0),
    [trendPoints],
  )

  /** Visible-window model shares for the donut, derived from the same
   * points as the trend chart. Long tails collapse into a single Other row;
   * sorted descending. */
  const modelShares = useMemo(() => {
    const entries = (report?.models ?? [])
      .map((model) => {
        let tokens = 0
        for (const point of trendPoints) tokens += point.values[model] ?? 0
        return { label: model, tokens, share: windowTokens > 0 ? tokens / windowTokens : 0 }
      })
      .filter((row) => row.tokens > 0)
    if (entries.length <= SHARE_MAX_NAMED) return entries
    const named = entries.slice(0, SHARE_MAX_NAMED)
    const rest = entries.slice(SHARE_MAX_NAMED)
    const restTokens = rest.reduce((sum, row) => sum + row.tokens, 0)
    return [...named, { label: t('share.other'), tokens: restTokens, share: windowTokens > 0 ? restTokens / windowTokens : 0 }]
  }, [report, trendPoints, windowTokens, t])

  /** Donut slices with cumulative start angles (degrees, clockwise). */
  const shareSlices = useMemo(() => {
    let angle = 0
    return modelShares.map((row) => {
      const slice = { ...row, offset: angle }
      angle += row.share * 360
      return slice
    })
  }, [modelShares])

  // Tooltip inputs, guarded against a hover outliving a period switch.
  const inRange = hovered !== null && hovered < trendPoints.length
  const hoveredPoint = inRange ? trendPoints[hovered!] : undefined
  const hoveredRows = inRange
    ? (report?.models ?? [])
        .map((model, index) => ({ model, color: MODEL_COLORS[index % MODEL_COLORS.length], value: hoveredPoint!.values[model] ?? 0 }))
        .filter((row) => row.value > 0)
        .sort((a, b) => b.value - a.value)
    : []
  const hoveredLeft = inRange ? ((hovered! + 0.5) / trendPoints.length) * 100 : 50
  const hoveredShift = hoveredLeft < 12 ? '0%' : hoveredLeft > 88 ? '-100%' : '-50%'

  /** One-shot animation class suffix; absent after the opening run (and for
   * prefers-reduced-motion users, where the CSS media query ignores it). */
  const anim = (base: string): string => (playOnce ? `${base} ${css.anim}` : base)

  return (
    <div className={css.section} aria-busy={state.status === 'loading'}>
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
                {report!.topModel === null ? '—' : labelOf(report!.topModel.label)}
              </span>
              {report!.topModel !== null ? (
                <span className={css.cardSub}>{t('stat.share', { p: `${Math.round(report!.topModel.share * 100)}%` })}</span>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {/* Live vendor allowance: independent of the ledger, so it renders even
          before the first token is recorded, and never blocks the cards. */}
      <QuotaBlock
        queryQuotas={queryQuotas}
        localeId={localeId}
        refreshToken={request}
        t={t}
      />

      {state.status === 'ready' && report!.totals.calls > 0 ? (
        <>
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
              {heat.columns.map((column, weekIndex) => column.map((cell) => (
                <span
                  key={cell.key}
                  className={`${cell.future ? css.heatCellOff : css[`heatCellL${cell.level}`]}${playOnce ? ` ${css.anim}` : ''}`}
                  style={playOnce ? { animationDelay: `${weekIndex * 4}ms` } : undefined}
                  title={cell.future ? undefined : `${heatLabel(cell.key)} · ${formatTokens(cell.tokens, zh)}`}
                />
              )))}
            </div>
          </div>

          <div className={css.block}>
            <div className={css.blockHead}>
              <h3 className={css.blockTitle}>{period === 'today' ? t('trend.hourly') : t('trend')}</h3>
              <div className={css.trendTools}>
                <div className={css.seg} role="group" aria-label={t('range')}>
                  {PERIODS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={css.segButton}
                      aria-pressed={period === value}
                      onClick={() => { setPeriod(value) }}
                    >
                      {t(`period.short.${value}`)}
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
            <div className={css.trendFrame}>
              {/* Stale host (pre-0.6.0, no todayHours): explain instead of
                  showing an empty frame — and never crash. */}
              {period === 'today' && trendPoints.length === 0 ? (
                <p className={css.status}>{t('today.stale')}</p>
              ) : null}
              <div className={css.trend} onMouseLeave={() => setHovered(null)}>
                {/* Dashed horizontal gridlines give the lines a magnitude
                    reference (ZCode-style); purely decorative. */}
                {[25, 50, 75].map((y) => (
                  <span key={y} className={css.gridLine} style={{ top: `${y}%` }} aria-hidden="true" />
                ))}
                {/* Transparent bands: hover targets + the column highlight;
                    the chart itself is pure lines in the overlay. */}
                {trendPoints.map((point, index) => (
                  <div
                    className={css.trendColumn}
                    key={point.key}
                    aria-label={`${point.tip} · ${formatTokens(point.tokens, zh)}`}
                    onMouseEnter={() => setHovered(index)}
                  />
                ))}
                {trendPoints.length > 0 ? (
                  <div className={css.trendOverlay} aria-hidden="true">
                    {trendPoints.length > 1 ? (
                      <svg className={css.trendSvg} viewBox="0 0 100 100" preserveAspectRatio="none">
                        {modelLines.map((line, lineIndex) => (
                          <path
                            key={line.key}
                            d={smoothLinePath(line.points)}
                            pathLength={1}
                            vectorEffect="non-scaling-stroke"
                            stroke={line.color}
                            className={anim(css.trendLineModel)}
                            style={playOnce ? { animationDelay: `${150 + lineIndex * 70}ms` } : undefined}
                          />
                        ))}
                        <path
                          d={smoothLinePath(totalPoints)}
                          pathLength={1}
                          vectorEffect="non-scaling-stroke"
                          className={anim(css.trendLine)}
                        />
                      </svg>
                    ) : null}
                    {totalPoints.map((point, index) => (
                      <span
                        key={trendPoints[index].key}
                        className={anim(css.trendDot)}
                        style={{
                          left: `${point.x}%`,
                          top: `${point.y}%`,
                          animationDelay: playOnce
                            ? `${Math.round((index / Math.max(1, totalPoints.length - 1)) * 700)}ms`
                            : undefined,
                        }}
                      />
                    ))}
                    {hoveredPoint !== undefined ? (
                      <>
                        {modelLines.map((line) => {
                          const value = hoveredPoint.values[line.key] ?? 0
                          if (value === 0) return null
                          return (
                            <span
                              key={line.key}
                              className={css.hoverDot}
                              style={{ left: `${hoveredLeft}%`, top: `${100 - (value / trendMax) * 100}%`, background: line.color }}
                            />
                          )
                        })}
                        <span
                          className={css.hoverDotTotal}
                          style={{ left: `${hoveredLeft}%`, top: `${100 - (hoveredPoint.tokens / trendMax) * 100}%` }}
                        />
                      </>
                    ) : null}
                  </div>
                ) : null}
                {hoveredPoint !== undefined ? (
                  <div
                    className={css.tooltip}
                    style={{ left: `${hoveredLeft}%`, transform: `translateX(${hoveredShift})` }}
                    role="status"
                  >
                    {/* ZCode-style header: "date · compact total" on one
                        line, then per-model rows with exact counts. */}
                    <span className={css.tooltipDate}>
                      {hoveredPoint.tip} · {formatTokens(hoveredPoint.tokens, zh)}
                    </span>
                    {hoveredRows.map((row) => (
                      <div className={css.tooltipRow} key={row.model}>
                        <span className={css.legendDot} style={{ background: row.color }} />
                        <span className={css.tooltipName}>{labelOf(row.model)}</span>
                        <span className={css.tooltipValue}>{formatNumber(row.value)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className={css.ticks} aria-hidden="true">
                {trendTicks.map((index) => (
                  <span key={index} style={{ left: `${((index + 0.5) / trendPoints.length) * 100}%` }}>
                    {trendPoints[index].tick}
                  </span>
                ))}
              </div>
            </div>
            <div className={css.legend}>
              <span className={css.legendItem}>
                <span className={css.legendLine} />
                {t('trend.total')}
              </span>
              {windowModels.map((model) => (
                <span className={css.legendItem} key={model} title={model}>
                  <span
                    className={css.legendDot}
                    style={{ background: MODEL_COLORS[(report?.models.indexOf(model) ?? 0) % MODEL_COLORS.length] }}
                  />
                  {labelOf(model)}
                </span>
              ))}
            </div>
          </div>

          <div className={css.block}>
            <div className={css.blockHead}>
              <h3 className={css.blockTitle}>{t('share')}</h3>
            </div>
            <div className={css.shareLayout}>
              <div className={css.donutWrap} onMouseLeave={() => setShareHover(null)}>
                <svg className={css.donut} viewBox="0 0 120 120" role="img" aria-label={t('share')}>
                  {shareSlices.map((slice, index) => (slice.share > 0 ? (
                    <circle
                      key={slice.label}
                      cx="60" cy="60" r={RING_RADIUS}
                      fill="none"
                      strokeWidth={RING_STROKE}
                      stroke={MODEL_COLORS[index % MODEL_COLORS.length]}
                      strokeDasharray={`${slice.share * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
                      transform={`rotate(${slice.offset} 60 60)`}
                      opacity={shareHover === null || shareHover === index ? 1 : 0.35}
                      onMouseEnter={() => setShareHover(index)}
                      className={playOnce ? css.anim : undefined}
                      style={playOnce ? ({
                        '--arc': `${slice.share * RING_CIRCUMFERENCE}`,
                        '--circ': `${RING_CIRCUMFERENCE}`,
                        animationDelay: `${index * 90}ms`,
                      }) as CSSProperties : undefined}
                    />
                  ) : null))}
                </svg>
                <div className={css.donutCenter}>
                  <span className={css.donutTotal}>{formatTokens(windowTokens, zh)}</span>
                  <span className={css.donutUnit}>{t('unit.tokens')}</span>
                </div>
              </div>
              <ul className={css.shareLegend}>
                {shareSlices.map((slice, index) => (
                  <li
                    key={slice.label}
                    className={css.shareRow}
                    onMouseEnter={() => setShareHover(index)}
                    onMouseLeave={() => setShareHover(null)}
                  >
                    {/* ZCode-style ranked row: name + big share on the top
                        line, exact-ish token count dimmed underneath. */}
                    <span className={css.legendDot} style={{ background: MODEL_COLORS[index % MODEL_COLORS.length] }} />
                    <span className={css.shareBody}>
                      <span className={css.shareTop}>
                        <span className={css.shareName} title={slice.label}>{labelOf(slice.label)}</span>
                        <span className={css.sharePct}>{Math.round(slice.share * 100)}%</span>
                      </span>
                      <span className={css.shareSub}>{formatTokens(slice.tokens, zh)} {t('unit.tokens')}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className={css.meta}>
            {t(`period.${QUERY_PERIOD}`)}
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

/** Short model name of one provider/model pair (text after the first '/').
 * Collision-aware display happens in UsageSection via `labelOf`. */
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
