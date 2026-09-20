/**
 * Display math shared by the two quota surfaces — the monospace report the
 * `usage_stats` tool returns and the 供应商额度 block in the settings panel.
 *
 * Pure functions over one quota reading: no network, no harness, no locale.
 * Wording stays with each surface (the panel localizes, the report does not),
 * so exactly one definition exists for "what share is left" and "when does it
 * reset".
 *
 * @module dsh-usage-ledger/quota-view
 */

/** Percent of the window still available, or undefined when unknowable. */
export function remainingPercentOf(window) {
  if (window === undefined || window === null) return undefined
  if (Number.isFinite(window.remainingPercent)) return clamp(window.remainingPercent)
  if (Number.isFinite(window.usedPercent)) return clamp(100 - window.usedPercent)
  if (Number.isFinite(window.limit) && Number.isFinite(window.remaining) && window.limit > 0) {
    return clamp((window.remaining / window.limit) * 100)
  }
  return undefined
}

/** Percent of the window already consumed, or undefined when unknowable. */
export function usedPercentOf(window) {
  const remaining = remainingPercentOf(window)
  return remaining === undefined ? undefined : clamp(100 - remaining)
}

/**
 * Seconds until the window resets: the reported countdown when the vendor
 * gives one, else derived from its reset timestamp.
 * @param window - one window reading.
 * @param now - current epoch millis.
 * @returns seconds, or undefined when the vendor said nothing usable.
 */
export function horizonSeconds(window, now = Date.now()) {
  if (window === undefined || window === null) return undefined
  if (Number.isFinite(window.resetIn) && window.resetIn >= 0) return window.resetIn
  if (typeof window.resetAt !== 'string') return undefined
  const time = Date.parse(window.resetAt)
  if (Number.isNaN(time)) return undefined
  return Math.max(0, (time - now) / 1000)
}

/**
 * Language-neutral compact duration: "45m", "2h 10m", "3d 4h".
 * The panel phrases its own localized sentence from the raw seconds; the
 * monospace report uses this spelling.
 */
export function formatCompactDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return undefined
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

/** Currency glyph for a balance reading; unknown codes keep their code. */
export function currencySymbol(currency) {
  if (currency === 'CNY') return '¥'
  if (currency === 'USD') return '$'
  if (currency === 'EUR') return '€'
  return `${currency ?? ''} `
}

/** Two-decimal money amount (provider balances are decimal strings). */
export function formatAmount(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '—'
}

function clamp(value) {
  return Math.min(100, Math.max(0, value))
}
