/**
 * Report rendering for the usage ledger: the monospace text report served
 * to the usage_stats agent tool (the settings panel renders its own UI from
 * the aggregate rows over RPC).
 *
 * Token counts only — the ledger deliberately carries no pricing.
 *
 * @module dsh-usage-ledger/report
 */

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
