/**
 * Report rendering for the usage ledger: the monospace text report served
 * to the usage_stats agent tool (the settings panel renders its own UI from
 * the aggregate rows over RPC).
 *
 * Token counts only — the ledger deliberately carries no pricing. The quota
 * section appended on request repeats what the vendors themselves report
 * (window percentages, and DeepSeek's pay-as-you-go balance in its own
 * currency); nothing here converts tokens into money.
 *
 * @module dsh-usage-ledger/report
 */

import { PROBE_LABELS } from './quota.js'
import { currencySymbol, formatAmount, formatCompactDuration, horizonSeconds, remainingPercentOf } from './quota-view.js'

const numberFormat = new Intl.NumberFormat('en-US')

/** 1234567 -> "1,234,567" */
export function formatNumber(value) {
  return numberFormat.format(value)
}

/** 1234567 -> "1.23M"; 1234 -> "1.2K"; 999 -> "999" */
export function formatCompact(value) {
  if (value >= 1_000_000_000) return `${trim(value / 1_000_000_000)}G`
  if (value >= 1_000_000) return `${trim(value / 1_000_000)}M`
  if (value >= 1_000) return `${trim(value / 1_000)}K`
  return String(value)
}

function trim(value) {
  return value >= 100 ? String(Math.round(value)) : value >= 10 ? String(Math.round(value * 10) / 10) : String(Math.round(value * 100) / 100)
}

function totalTokens(bucket) {
  return bucket.inputTokens + bucket.cacheReadTokens + bucket.cacheWriteTokens + bucket.outputTokens
}

/**
 * Render the monospace text report.
 * The first line is the one-line summary; the rest is the body.
 * @param data - { label, totals, rows, dimension }
 */
export function renderTextReport(data) {
  const { totals, rows, dimension, label } = data
  const lines = []
  const tokens = totalTokens(totals)
  lines.push(`Usage · ${label} · ${formatCompact(tokens)} tokens · ${formatNumber(totals.calls)} calls`)

  const right = (text, width) => String(text).padStart(width)
  const left = (text, width) => String(text).padEnd(width)

  const section = []
  section.push('')
  section.push('calls            ' + right(formatNumber(totals.calls), 14))
  section.push('input            ' + right(formatCompact(totals.inputTokens), 14))
  if (totals.cacheReadTokens > 0) section.push('cache read       ' + right(formatCompact(totals.cacheReadTokens), 14))
  if (totals.cacheWriteTokens > 0) section.push('cache write      ' + right(formatCompact(totals.cacheWriteTokens), 14))
  section.push('output           ' + right(formatCompact(totals.outputTokens), 14))
  section.push('total            ' + right(formatCompact(tokens), 14) + ' tokens')
  if (totals.reportedCalls !== undefined) {
    const call = (value) => right(formatNumber(value), 6)
    const tok = (value) => right(formatCompact(value), 10)
    section.push('reported         ' + call(totals.reportedCalls) + ' calls · ' + tok(totals.reportedTokens) + ' tokens')
    if (totals.estimatedCalls > 0) section.push('estimated        ' + call(totals.estimatedCalls) + ' calls · ' + tok(totals.estimatedTokens) + ' tokens (heuristic)')
  }
  lines.push(...section)

  if (rows.length > 0) {
    lines.push('')
    lines.push(`by ${dimension === 'model' ? 'model (provider/model)' : dimension}:`)
    const header = `${left(dimension === 'model' ? 'model' : dimension, 34)}${right('calls', 8)}${right('input', 12)}${right('output', 12)}${right('total', 12)}`
    lines.push(header)
    lines.push('-'.repeat(header.length))
    for (const row of rows) {
      lines.push(`${left(truncate(row.label, 34), 34)}${right(formatNumber(row.calls), 8)}${right(formatCompact(row.inputTokens + row.cacheReadTokens + row.cacheWriteTokens), 12)}${right(formatCompact(row.outputTokens), 12)}${right(formatCompact(totalTokens(row)), 12)}`)
    }
  }
  return lines.join('\n')
}

function truncate(text, width) {
  return text.length <= width ? text : `${text.slice(0, width - 1)}…`
}

/** One window's line: "5h window        82% left   resets in 2h 10m". */
function windowLine(name, window, now) {
  const remaining = remainingPercentOf(window)
  const percent = remaining === undefined ? '  —  ' : `${String(Math.round(remaining)).padStart(3)}%`
  const parts = [`${percent} left`]
  if (remaining === undefined && Number.isFinite(window?.remaining)) parts.push(`${formatCompact(window.remaining)} units left`)
  const horizon = formatCompactDuration(horizonSeconds(window, now))
  if (horizon !== undefined) parts.push(`resets in ${horizon}`)
  else if (typeof window?.resetAt === 'string') parts.push(`resets ${window.resetAt}`)
  return `    ${name.padEnd(14)}${parts.join('   ')}`
}

/**
 * Render the live provider-quota section appended to the usage report.
 *
 * Text-only and vendor-honest: each route reports what its own API said, a
 * route without a credential says so, and a failed route reports its error
 * without hiding the routes beside it.
 * @param quotas - the service's quota readings.
 * @param now - current epoch millis (injectable for tests).
 * @returns the section text, or '' when there is nothing to report.
 */
export function renderQuotaSection(quotas, now = Date.now()) {
  if (!Array.isArray(quotas) || quotas.length === 0) return ''
  const lines = ['', 'provider quotas (live, as the vendor reports them):']
  for (const quota of quotas) {
    const name = PROBE_LABELS[quota.probe] ?? quota.probe
    if (quota.ok !== true) {
      const head = `  ${name} (${quota.route})`
      if (quota.reason === 'unconfigured') {
        lines.push(`${head} — no credential configured (${quota.error})`)
      } else {
        lines.push(`${head} — unavailable: ${quota.error}`)
      }
      continue
    }
    const data = quota.data ?? {}
    const stale = quota.stale === true ? '  [cached]' : ''
    if (data.kind === 'balance') {
      lines.push(`  ${name} (${quota.route})${stale}`)
      const granted = data.granted > 0 ? `, granted ${currencySymbol(data.currency)}${formatAmount(data.granted)}` : ''
      const toppedUp = data.toppedUp > 0 ? `, topped up ${currencySymbol(data.currency)}${formatAmount(data.toppedUp)}` : ''
      lines.push(`    balance         ${currencySymbol(data.currency)}${formatAmount(data.available)}${granted}${toppedUp}${data.sufficient === false ? '   (insufficient)' : ''}`)
      continue
    }
    const badge = [data.plan === undefined || data.plan === 'unknown' ? undefined : `plan ${data.plan}`, data.membership]
      .filter((part) => part !== undefined)
      .join(' · ')
    lines.push(`  ${name} (${quota.route})${badge === '' ? '' : `  ${badge}`}${stale}`)
    if (data.fiveHour !== undefined) lines.push(windowLine('5h window', data.fiveHour, now))
    if (data.weekly !== undefined) lines.push(windowLine('weekly', data.weekly, now))
    if (data.mcp?.remaining !== undefined) lines.push(`    ${'MCP calls'.padEnd(14)}${formatNumber(data.mcp.remaining)} left`)
    if (data.parallelLimit !== undefined) lines.push(`    ${'parallel'.padEnd(14)}${formatNumber(data.parallelLimit)} requests`)
  }
  return lines.join('\n')
}
