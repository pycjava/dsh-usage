/**
 * Wire types for the /usage-ledger RPC channel (self-declared: the third-party
 * client bundle cannot import the harness's type packages).
 */

/** Period summary for the dashboard cards. */
export interface DashboardTotals {
  calls: number
  inputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  outputTokens: number
  totalTokens: number
  reportedTokens: number
  estimatedTokens: number
}

/** One day of the per-model trend series. */
export interface DashboardDay {
  day: string
  tokens: number
  values: Record<string, number>
}

/** One hour of today's per-model series (the 今日 view). */
export interface DashboardHour {
  hour: number
  tokens: number
  values: Record<string, number>
}

/** Value half of the channel's dashboard response. */
export interface DashboardReport {
  label: string
  totals: DashboardTotals
  sessions: number
  activeDays: number
  streakDays: number
  topModel: { label: string; tokens: number; share: number } | null
  /** Model legend order (descending total tokens). */
  models: string[]
  series: DashboardDay[]
  /** All-time daily token totals (heatmap cells + streak evidence). */
  dailyTotals: Record<string, number>
  /** Today's per-hour buckets, 00:00 through the current hour (the 今日
   * line view; future hours are omitted). Optional on the wire: a host
   * older than 0.6.0 does not send it, and the panel must degrade instead
   * of crash. */
  todayHours?: { day: string; hours: DashboardHour[] }
}

/** Envelope returned by Connection RPC calls. */
export type RpcResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string; readonly details: Record<string, unknown> } }

/** One window of a Coding Plan allowance (percentages and/or raw units). */
export interface QuotaWindow {
  usedPercent?: number
  remainingPercent?: number
  limit?: number
  used?: number
  remaining?: number
  resetAt?: string
  resetIn?: number
}

/** A vendor's allowance numbers (discriminated by the probe's shape). */
export type QuotaData =
  | {
    kind: 'windows'
    plan?: string
    membership?: string
    parallelLimit?: number
    mcp?: { remaining?: number }
    credits?: { hasCredits: boolean; unlimited: boolean; balance?: number }
    rateLimitResets?: number
    fiveHour?: QuotaWindow
    weekly?: QuotaWindow
    monthly?: QuotaWindow
    codeReviewWeekly?: QuotaWindow
    /** Codex named per-model budgets, each with its own windows. */
    additionalLimits?: Array<{
      name?: string
      fiveHour?: QuotaWindow
      weekly?: QuotaWindow
      monthly?: QuotaWindow
    }>
  }
  | {
    kind: 'balance'
    currency: string
    available: number
    granted: number
    toppedUp: number
    sufficient: boolean
  }

/** One configured provider route's quota reading (failures included). */
export interface QuotaReading {
  /** Provider route id from the settings tree (e.g. `zai-coding-cn`). */
  route: string
  /** Probe family that answered: `zhipu` | `kimi` | `codex` | `deepseek`. */
  probe: string
  /** The route's configured display name, when it has one. */
  label?: string
  ok: boolean
  /** Failure class when `ok` is false: unconfigured | unsupported | error. */
  reason?: string
  /** Technical failure detail (usually vendor-neutral English). */
  error?: string
  /** Epoch millis of the vendor read (present when ok). */
  fetchedAt?: number
  /** Served from the last good read after a failed refresh (present when ok). */
  stale?: boolean
  /** The vendor's own numbers (present when ok). */
  data?: QuotaData
}

/** Value half of the channel's quotas response. */
export interface QuotaReport {
  quotas: QuotaReading[]
}

/** The injected face the registration hands to the section component. */
export interface UsageSectionInjected {
  /** Query the host ledger over the plugin's private RPC channel. */
  query: (payload: { period: string }) => Promise<RpcResult<DashboardReport>>
  /** Read live provider quotas (the block's own, independent request). */
  queryQuotas: (payload?: { force?: boolean }) => Promise<RpcResult<QuotaReport>>
  /**
   * Read the active locale id ('zh' | 'en') at RENDER time. The slot
   * framework caches this injected face once, so a plain string would go
   * stale after the user switches language; the thunk keeps number/date
   * formatting in sync with the locale seat's re-render.
   */
  localeId: () => string
}

/** Locale seat delivered to entries whose registration declares `locale:`. */
export interface LocaleSeat {
  t: (key: string, params?: Record<string, string | number>) => string
}

/** Owner share of a settings.section entry (the shell passes `close`). */
export interface SettingsSectionOwnerProps {
  close: () => void
}
