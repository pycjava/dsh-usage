/**
 * Pure ledger logic: entry construction from an observed LLM call, period
 * parsing, filtering, and aggregation over dimensions.
 *
 * One entry = one completed provider call. Entries are keyed by a unique id;
 * the service keeps durable (stored) and pending (not yet flushed) maps with
 * the same shape. Token counts only — no pricing.
 *
 * @module dsh-usage-ledger/ledger
 */

/** Millis per day, for retention math. */
export const DAY_MS = 86_400_000

/** Local calendar midnight of one instant. */
function startOfLocalDay(ms) {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * Requeue only the entries a failed flush attempt did NOT write. The ledger
 * query reads durable `records` plus `pending`; re-adding already-written
 * entries would count them twice until the next successful flush.
 * @param batch - the batch the failed attempt tried to write ([id, entry]).
 * @param pending - the service's pending map.
 * @param written - ids whose store.put succeeded during this attempt.
 */
export function requeueUnwritten(batch, pending, written) {
  for (const [id, entry] of batch) {
    if (written.has(id) || pending.has(id)) continue
    pending.set(id, entry)
  }
}

/**
 * Build the ledger entry for one observed LLM call.
 * @param raw - observed call facts: request options plus the usage chunk.
 * @returns the frozen entry record.
 */
export function entryFromCall(raw) {
  const options = raw.options
  const usage = raw.usage
  return {
    id: raw.id,
    time: raw.time,
    provider: typeof options?.provider === 'string' && options.provider !== '' ? options.provider : 'unknown',
    model: typeof options?.model === 'string' && options.model !== '' ? options.model : 'unknown',
    ...(typeof options?.sessionId === 'string' && options.sessionId !== '' ? { sessionId: options.sessionId } : {}),
    ...(typeof options?.purpose === 'string' && options.purpose !== '' ? { purpose: options.purpose } : {}),
    inputTokens: Number.isFinite(usage?.inputTokens) ? Math.max(0, usage.inputTokens) : 0,
    outputTokens: Number.isFinite(usage?.outputTokens) ? Math.max(0, usage.outputTokens) : 0,
    ...(Number.isFinite(usage?.cacheReadTokens) && usage.cacheReadTokens > 0 ? { cacheReadTokens: usage.cacheReadTokens } : {}),
    ...(Number.isFinite(usage?.cacheWriteTokens) && usage.cacheWriteTokens > 0 ? { cacheWriteTokens: usage.cacheWriteTokens } : {}),
    ...(Number.isFinite(usage?.reasoningTokens) && usage.reasoningTokens > 0 ? { reasoningTokens: usage.reasoningTokens } : {}),
    ...(raw.estimated === true ? { estimated: true } : {}),
  }
}

/** Parse one `YYYY-MM` period token into its [start, endExclusive) month range. */
function monthRange(token, now) {
  const match = /^(\d{4})-(\d{2})$/.exec(token)
  if (match === null) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isSafeInteger(year) || year < 1970 || year > 9999) return undefined
  if (!Number.isInteger(month) || month < 1 || month > 12) return undefined
  const start = new Date(year, month - 1, 1).getTime()
  const end = new Date(year, month, 1).getTime()
  if (start > now) return undefined
  return { start, end }
}

/**
 * Parse a period argument into an inclusive [from, to) time range.
 * @param raw - period token: '' | 'this-month' | 'today' | '7d' | '30d' |
 *   'Nd' | 'all' | 'YYYY-MM' | 'YYYY-MM..YYYY-MM'.
 * @param now - current epoch millis.
 * @returns { ok: true, from, to, label } or { ok: false, error }.
 */
export function parsePeriod(raw, now) {
  const token = (raw ?? '').trim().toLowerCase()
  const today = new Date(now)
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  if (token === '' || token === 'this-month' || token === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1).getTime()
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 1).getTime()
    return { ok: true, from: start, to: Math.min(end, now + 1), label: labelOfMonth(today) }
  }
  if (token === 'today') return { ok: true, from: startOfToday, to: now + 1, label: 'today' }
  if (token === 'all' || token === 'ever') return { ok: true, from: 0, to: now + 1, label: 'all time' }
  const days = /^(\d+)d$/.exec(token)
  if (days !== null) {
    const count = Number(days[1])
    if (!Number.isSafeInteger(count) || count < 1 || count > 3660) {
      return { ok: false, error: `period "${raw}": day counts must be 1..3660` }
    }
    // "last N days" is N LOCAL calendar days ending today, so the trend
    // series (one bucket per local day) and the entry window agree exactly.
    const first = new Date(startOfToday)
    first.setDate(first.getDate() - (count - 1))
    return { ok: true, from: first.getTime(), to: now + 1, label: `last ${count} days` }
  }
  const range = /^(\d{4}-\d{2})\.\.(\d{4}-\d{2})$/.exec(token)
  if (range !== null) {
    const first = monthRange(range[1], now)
    const last = monthRange(range[2], now)
    if (first === undefined || last === undefined) return { ok: false, error: `period "${raw}": expected YYYY-MM..YYYY-MM` }
    if (first.start > last.start) return { ok: false, error: `period "${raw}": range start is after range end` }
    return { ok: true, from: first.start, to: Math.min(last.end, now + 1), label: `${range[1]} .. ${range[2]}` }
  }
  const single = monthRange(token, now)
  if (single !== undefined) return { ok: true, from: single.start, to: Math.min(single.end, now + 1), label: labelOfMonth(new Date(single.start)) }
  return { ok: false, error: `period "${raw}": expected this-month, today, 7d/30d/Nd, all, YYYY-MM, or YYYY-MM..YYYY-MM` }
}

function labelOfMonth(date) {
  const name = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date)
  return name
}

/**
 * Aggregate entries over one breakdown dimension (token counts only).
 * @param entries - entries inside the period (zero-usage calls already
 *   filtered).
 * @param dimension - 'model' | 'provider' | 'day' | 'session'.
 * @param locale - locale for day labels.
 * @returns { totals, rows } with per-row token aggregates.
 */
export function aggregate(entries, dimension, locale = 'en-US') {
  const buckets = new Map()
  for (const entry of entries) {
    const key = keyOf(entry, dimension, locale)
    let bucket = buckets.get(key)
    if (bucket === undefined) {
      bucket = { key, label: key, calls: 0, estimatedCalls: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 }
      buckets.set(key, bucket)
    }
    bucket.calls += 1
    if (entry.estimated === true) bucket.estimatedCalls += 1
    bucket.inputTokens += entry.inputTokens ?? 0
    bucket.cacheReadTokens += entry.cacheReadTokens ?? 0
    bucket.cacheWriteTokens += entry.cacheWriteTokens ?? 0
    bucket.outputTokens += entry.outputTokens ?? 0
    bucket.reasoningTokens += entry.reasoningTokens ?? 0
  }
  // Sort by the raw bucket key: day keys (YYYY-MM-DD) stay chronological,
  // and model/provider/session labels are equal to their keys anyway.
  const rows = [...buckets.values()]
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
    .map((bucket) => ({ ...bucket, label: bucketLabel(bucket, dimension, locale) }))
  const totals = rows.reduce((sum, row) => {
    sum.calls += row.calls
    sum.estimatedCalls += row.estimatedCalls
    sum.inputTokens += row.inputTokens
    sum.cacheReadTokens += row.cacheReadTokens
    sum.cacheWriteTokens += row.cacheWriteTokens
    sum.outputTokens += row.outputTokens
    sum.reasoningTokens += row.reasoningTokens
    return sum
  }, { calls: 0, estimatedCalls: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 })
  return { totals, rows }
}

function keyOf(entry, dimension, locale) {
  switch (dimension) {
    case 'provider': return entry.provider
    case 'day': return dayKey(new Date(entry.time), locale)
    case 'session': return entry.sessionId ?? 'unknown-session'
    case 'model':
    default: return `${entry.provider}/${entry.model}`
  }
}

function dayKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function bucketLabel(bucket, dimension, locale) {
  if (dimension === 'day') {
    const [year, month, day] = bucket.key.split('-').map(Number)
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(year, month - 1, day))
  }
  return bucket.key
}
