/**
 * The 供应商额度 (provider allowance) block of the 数据与统计 settings section.
 *
 * It renders what each configured provider route reports about its own
 * remaining allowance: Coding Plan windows with reset countdowns (智谱 GLM,
 * Kimi, OpenAI Codex), and DeepSeek's pay-as-you-go balance in its own
 * currency. Nothing here is computed from token counts — these are live
 * vendor numbers, kept deliberately separate from the ledger above.
 *
 * The block owns its request: quota reads cross the network, so they load,
 * fail, and refresh independently of the usage dashboard beside them.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { currencySymbol, formatAmount, horizonSeconds, remainingPercentOf } from '../../lib/quota-view.js'
import type {
  LocaleSeat, QuotaData, QuotaReading, QuotaReport, QuotaWindow, RpcResult,
} from './types.ts'
import css from './UsageSection.module.css'

/** Full props: the injected query face, the section's refresh signal, locale. */
export interface QuotaBlockProps extends LocaleSeat {
  queryQuotas: (payload?: { force?: boolean }) => Promise<RpcResult<QuotaReport>>
  localeId: () => string
  /** The section's refresh counter; >0 means "refresh now, bypass the cache". */
  refreshToken: number
}

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly quotas: QuotaReading[] }

/** Below this share the window bar turns into the warning color. */
const LOW_PERCENT = 20

/** Display names for the probe families (the route id follows as a chip). */
const PROBE_KEYS: Record<string, string> = {
  zhipu: 'quota.probe.zhipu',
  kimi: 'quota.probe.kimi',
  codex: 'quota.probe.codex',
  deepseek: 'quota.probe.deepseek',
}

/**
 * Render the provider-allowance block.
 * Renders nothing at all when the deployment configures no probeable route —
 * the block is additive, never an empty box.
 */
export function QuotaBlock({ queryQuotas, localeId, refreshToken, t }: QuotaBlockProps): ReactNode {
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let current = true
    setState({ status: 'loading' })
    // The first mount reads through the host's TTL cache; an explicit refresh
    // (the section's button) or a retry forces a live probe.
    const force = refreshToken > 0 || retry > 0
    void queryQuotas({ force }).then(
      (result) => {
        if (!current) return
        if (result.ok) setState({ status: 'ready', quotas: result.value.quotas })
        else setState({ status: 'error' })
      },
      () => {
        if (current) setState({ status: 'error' })
      },
    )
    return () => { current = false }
  }, [queryQuotas, refreshToken, retry])

  const zh = localeId().startsWith('zh')
  const quotas = state.status === 'ready' ? state.quotas : []
  if (state.status === 'ready' && quotas.length === 0) return null

  const okReadings = quotas.filter((reading) => reading.ok)
  const stamp = okReadings.reduce<number | undefined>(
    (newest, reading) => (reading.fetchedAt === undefined ? newest : Math.max(newest ?? 0, reading.fetchedAt)),
    undefined,
  )
  const anyStale = okReadings.some((reading) => reading.stale === true)
  const updatedAt = stamp === undefined
    ? null
    : new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date(stamp))

  return (
    <div className={css.block}>
      <div className={css.blockHead}>
        <h3 className={css.blockTitle}>{t('quota.title')}</h3>
        <span className={css.quotaMeta}>
          {updatedAt === null ? null : t('quota.updated', { time: updatedAt })}
          {anyStale ? <span className={css.quotaStale}>{t('quota.cached')}</span> : null}
        </span>
      </div>

      {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css.failure}>
          <p role="alert">{t('quota.error')}</p>
          <button type="button" onClick={() => { setRetry((value) => value + 1) }}>{t('retry')}</button>
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <>
          <div className={css.quotaGrid}>
            {quotas.map((reading) => (
              <QuotaCard key={reading.route} reading={reading} zh={zh} t={t} />
            ))}
          </div>
          <p className={css.meta}>{t('quota.hint')}</p>
        </>
      ) : null}
    </div>
  )
}

/** One provider route: title, badge, and what that vendor reported. */
function QuotaCard({ reading, zh, t }: { reading: QuotaReading; zh: boolean; t: LocaleSeat['t'] }): ReactNode {
  const nameKey = PROBE_KEYS[reading.probe]
  const name = nameKey === undefined ? (reading.label ?? reading.probe) : t(nameKey)
  return (
    <div className={css.quotaCard}>
      <div className={css.quotaHead}>
        <span className={css.quotaTitle} title={reading.label ?? reading.probe}>{name}</span>
        {reading.ok ? <QuotaBadge data={reading.data} t={t} /> : null}
        {reading.stale === true ? <span className={css.quotaStale}>{t('quota.cached')}</span> : null}
      </div>
      <span className={css.quotaRoute}>{reading.route}</span>
      {reading.ok ? <QuotaBody data={reading.data} zh={zh} t={t} /> : <QuotaFailure reading={reading} t={t} />}
    </div>
  )
}

/** The plan/membership badge both window vendors report. */
function QuotaBadge({ data, t }: { data: QuotaData | undefined; t: LocaleSeat['t'] }): ReactNode {
  if (data === undefined || data.kind !== 'windows') return null
  const text = data.plan !== undefined && data.plan !== 'unknown'
    ? data.plan
    : data.membership
  if (text === undefined || text === '') return null
  return <span className={css.quotaBadge} title={text}>{text}</span>
}

/** The vendor's numbers for one route. */
function QuotaBody({ data, zh, t }: { data: QuotaData | undefined; zh: boolean; t: LocaleSeat['t'] }): ReactNode {
  const now = Date.now()
  if (data === undefined) return <p className={css.quotaError}>{t('quota.unavailable')}</p>
  if (data.kind === 'balance') {
    const granted = data.granted > 0 ? t('quota.granted', { amount: `${currencySymbol(data.currency)}${formatAmount(data.granted)}` }) : null
    const toppedUp = data.toppedUp > 0 ? t('quota.toppedUp', { amount: `${currencySymbol(data.currency)}${formatAmount(data.toppedUp)}` }) : null
    return (
      <>
        <div className={css.quotaBalance}>
          <span className={css.quotaBalanceValue}>{currencySymbol(data.currency)}{formatAmount(data.available)}</span>
          <span className={data.sufficient ? css.quotaOk : css.quotaWarn}>
            {data.sufficient ? t('quota.sufficient') : t('quota.insufficient')}
          </span>
        </div>
        {granted === null && toppedUp === null ? null : (
          <span className={css.quotaSub}>{[granted, toppedUp].filter(Boolean).join(' · ')}</span>
        )}
      </>
    )
  }
  return (
    <>
      {data.fiveHour === undefined ? null : (
        <WindowRow label={t('quota.fiveHour')} window={data.fiveHour} zh={zh} now={now} t={t} />
      )}
      {data.weekly === undefined ? null : (
        <WindowRow label={t('quota.weekly')} window={data.weekly} zh={zh} now={now} t={t} />
      )}
      {data.monthly === undefined ? null : (
        <WindowRow label={t('quota.monthly')} window={data.monthly} zh={zh} now={now} t={t} />
      )}
      {data.codeReviewWeekly === undefined ? null : (
        <WindowRow label={t('quota.codeReviewWeekly')} window={data.codeReviewWeekly} zh={zh} now={now} t={t} />
      )}
      {(data.additionalLimits ?? []).flatMap((limit) => {
        const name = limit.name !== undefined && limit.name !== '' ? limit.name : t('quota.additional')
        return [
          ...(limit.fiveHour === undefined ? [] : [{ label: `${name} · ${t('quota.fiveHour')}`, window: limit.fiveHour }]),
          ...(limit.weekly === undefined ? [] : [{ label: `${name} · ${t('quota.weekly')}`, window: limit.weekly }]),
          ...(limit.monthly === undefined ? [] : [{ label: `${name} · ${t('quota.monthly')}`, window: limit.monthly }]),
        ]
      }).map((row) => (
        <WindowRow key={row.label} label={row.label} window={row.window} zh={zh} now={now} t={t} />
      ))}
      {data.mcp?.remaining === undefined ? null : (
        <span className={css.quotaSub}>{t('quota.mcp', { n: String(data.mcp.remaining) })}</span>
      )}
      {data.parallelLimit === undefined ? null : (
        <span className={css.quotaSub}>{t('quota.parallel', { n: String(data.parallelLimit) })}</span>
      )}
      {data.credits === undefined ? null : (
        <span className={css.quotaSub}>
          {data.credits.unlimited
            ? t('quota.creditsUnlimited')
            : !data.credits.hasCredits
              ? t('quota.creditsNone')
              : data.credits.balance === undefined
                ? t('quota.creditsUnknown')
                : t('quota.credits', {
                  n: new Intl.NumberFormat(zh ? 'zh-CN' : 'en-US', { maximumFractionDigits: 2 }).format(data.credits.balance),
                })}
        </span>
      )}
      {data.rateLimitResets === undefined ? null : (
        <span className={css.quotaSub}>{t('quota.resets', { n: String(data.rateLimitResets) })}</span>
      )}
    </>
  )
}

/** One allowance window: remaining bar, share, and the reset countdown. */
function WindowRow({
  label, window, zh, now, t,
}: { label: string; window: QuotaWindow | undefined; zh: boolean; now: number; t: LocaleSeat['t'] }): ReactNode {
  const remaining = remainingPercentOf(window)
  const horizon = horizonText(window, now, zh, t)
  return (
    <div className={css.quotaRow}>
      <div className={css.quotaRowHead}>
        <span className={css.quotaRowLabel}>{label}</span>
        <span className={css.quotaValue}>{remaining === undefined ? '—' : `${String(Math.round(remaining))}%`}</span>
      </div>
      <div className={css.quotaBar} role="img" aria-label={`${label} ${remaining === undefined ? '' : `${String(Math.round(remaining))}%`}`}>
        <span
          className={remaining !== undefined && remaining < LOW_PERCENT ? css.quotaBarFillLow : css.quotaBarFill}
          style={{ width: `${remaining ?? 0}%` }}
        />
      </div>
      <div className={css.quotaRowFoot}>
        <span>{remaining === undefined ? t('quota.unknown') : t('quota.left')}</span>
        {horizon === null ? null : <span>{horizon}</span>}
      </div>
    </div>
  )
}

/** A route that could not be read: no credential, or the vendor refused. */
function QuotaFailure({ reading, t }: { reading: QuotaReading; t: LocaleSeat['t'] }): ReactNode {
  const unconfigured = reading.reason === 'unconfigured'
  return (
    <>
      <p className={css.quotaError}>{unconfigured ? t('quota.unconfigured') : t('quota.unavailable')}</p>
      {reading.error === undefined ? null : (
        <span className={css.quotaSub} title={reading.error}>{reading.error}</span>
      )}
    </>
  )
}

/** "resets in 2 hours" in the user's language, or null when unknown. */
function horizonText(window: QuotaWindow | undefined, now: number, zh: boolean, t: LocaleSeat['t']): string | null {
  const seconds = horizonSeconds(window, now)
  if (seconds === undefined) return null
  const format = new Intl.RelativeTimeFormat(zh ? 'zh-CN' : 'en-US', { numeric: 'auto', style: 'narrow' })
  const when = seconds < 3600
    ? format.format(Math.max(1, Math.round(seconds / 60)), 'minute')
    : seconds < 86_400
      ? format.format(Math.round(seconds / 3600), 'hour')
      : format.format(Math.round(seconds / 86_400), 'day')
  return t('quota.resetsIn', { when })
}
