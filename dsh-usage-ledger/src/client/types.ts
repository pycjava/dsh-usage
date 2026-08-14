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

/** One day of the stacked-by-model trend series. */
export interface DashboardDay {
  day: string
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
}

/** Envelope returned by Connection RPC calls. */
export type RpcResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { code: string; message: string } }

/** The injected face the registration hands to the section component. */
export interface UsageSectionInjected {
  /** Query the host ledger over the plugin's private RPC channel. */
  query: (payload: { period: string }) => Promise<RpcResult<DashboardReport>>
  /** Active locale id ('zh' | 'en'), for number/date formatting. */
  localeId: string
}

/** Locale seat delivered to entries whose registration declares `locale:`. */
export interface LocaleSeat {
  t: (key: string, params?: Record<string, string | number>) => string
}

/** Owner share of a settings.section entry (the shell passes `close`). */
export interface SettingsSectionOwnerProps {
  close: () => void
}
