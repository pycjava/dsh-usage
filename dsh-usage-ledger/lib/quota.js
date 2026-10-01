/**
 * Provider quota probes: how much allowance the configured LLM routes have
 * left, as the providers themselves report it.
 *
 * Nine probe families, normalized behind one small wire shape:
 *
 *   - `zhipu`     智谱 GLM Coding Plan — 5-hour and weekly windows, plan, MCP
 *   - `kimi`      Kimi Coding Plan — 5-hour and weekly windows, membership
 *   - `codex`     OpenAI Codex — ChatGPT OAuth windows, credits, reset credits
 *   - `deepseek`  pay-as-you-go balance — currency, granted, topped up
 *   - `moonshot`  Moonshot AI open platform — pay-as-you-go balance (CNY/USD)
 *   - `openrouter` marketplace credit — total credits and usage (USD)
 *   - `minimax`   MiniMax Coding Plan — interval and weekly windows (global/CN)
 *   - `baseten`   month-to-date credit spend (no remaining is published)
 *   - `anthropic` Claude Pro/Max OAuth — 5-hour and weekly windows
 *
 * The routes to probe are NOT hard-coded: `index.js` reads whichever provider
 * routes the deployment configures (the settings tree's `llm-pi-ai` profiles
 * plus the built-in `llm-deepseek` route) and hands them in as plain targets,
 * so this module imports no harness and stays exercisable from the smoke test.
 *
 * Quotas are LIVE reads. They are never written to the ledger, never
 * aggregated, and never mixed with token accounting — the ledger stays
 * token-only.
 *
 * @module dsh-usage-ledger/quota
 */

import { createHash } from 'node:crypto'
import { createGunzip } from 'node:zlib'

/** Per-request network timeout for one probe. */
export const DEFAULT_TIMEOUT_MS = 15_000

/** How long one reading is served before the next probe. */
export const DEFAULT_TTL_MS = 300_000

/**
 * Hard cap on one probe response, applied twice — to the downloaded bytes
 * and again to whatever a middlebox's gzip expands to. Vendor payloads are a
 * few KB, so 2 MiB leaves orders of magnitude of slack while a hostile or
 * compromised endpoint cannot exhaust host memory with an oversized (or
 * gzip-bomb) body.
 */
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

/** Provider-specific endpoints (the community-verified console APIs). */
export const PROBE_URLS = {
  zhipu: 'https://open.bigmodel.cn/api/monitor/usage/quota/limit',
  kimi: 'https://api.kimi.com/coding/v1/usages',
  codex: 'https://chatgpt.com/backend-api/wham/usage',
  deepseek: 'https://api.deepseek.com/user/balance',
  moonshot: 'https://api.moonshot.cn/v1/users/me/balance',
  openrouter: 'https://openrouter.ai/api/v1/credits',
  minimax: 'https://api.minimax.io/v1/token_plan/remains',
  baseten: 'https://api.baseten.co/v1/billing/usage_summary',
  anthropic: 'https://api.anthropic.com/api/oauth/usage',
}

/** Region/international variants derived per route (override.url always wins). */
export const MOONSHOT_INTL_URL = 'https://api.moonshot.ai/v1/users/me/balance'
export const ZHIPU_INTL_URL = 'https://api.z.ai/api/monitor/usage/quota/limit'
export const MINIMAX_CN_URL = 'https://api.minimaxi.com/v1/token_plan/remains'

/** Probe families this plugin knows how to read. */
export const PROBE_IDS = ['zhipu', 'kimi', 'codex', 'deepseek', 'moonshot', 'openrouter', 'minimax', 'baseten', 'anthropic']

/** Human labels per probe (the panel localizes; these serve logs/tools). */
export const PROBE_LABELS = {
  zhipu: '智谱 GLM',
  kimi: 'Kimi',
  codex: 'OpenAI Codex',
  deepseek: 'DeepSeek',
  moonshot: 'Moonshot',
  openrouter: 'OpenRouter',
  minimax: 'MiniMax',
  baseten: 'Baseten',
  anthropic: 'Anthropic',
}

/** Route id the base layer mounts the official DeepSeek adapter under. */
export const DEEPSEEK_ROUTE = 'deepseek-official'

/** A failed HTTP response, carrying the status for auth-retry decisions. */
export class HttpError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}: ${body}`)
    this.name = 'HttpError'
    this.status = status
    this.body = body
  }
}

/**
 * Stream one response body into a Buffer, aborting the download as soon as
 * it passes `maxBytes` (the reader is cancelled so the rest is not fetched).
 * @param response - the fetch response.
 * @param maxBytes - download bound.
 * @returns the bounded body bytes.
 */
async function readBody(response, maxBytes) {
  const body = response.body
  // A null body (a bodyless Response) reads as empty. Any real undici body is
  // a web stream, so the bounded reader below is the only path that buffers:
  // there is deliberately no arrayBuffer() fallback, which would load the
  // whole body before the cap could apply (an illusory bound).
  if (body === null || body === undefined) return Buffer.alloc(0)
  if (typeof body.getReader !== 'function') {
    throw new Error('response body is not a readable web stream; the download cannot be bounded')
  }
  const reader = body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done === true) break
    const chunk = Buffer.from(value)
    total += chunk.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new Error(`response body exceeds ${maxBytes} bytes`)
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/**
 * Gunzip with an output bound: a small compressed body can still expand to
 * gigabytes (ratios past 1000:1), so the pump is destroyed the moment the
 * decompressed size passes `maxBytes` instead of ever buffering it whole.
 */
function gunzipBounded(buffer, maxBytes) {
  return new Promise((resolve, reject) => {
    const stream = createGunzip()
    const chunks = []
    let total = 0
    stream.on('data', (chunk) => {
      total += chunk.length
      if (total > maxBytes) {
        stream.destroy(new Error(`decompressed body exceeds ${maxBytes} bytes`))
        return
      }
      chunks.push(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.end(buffer)
  })
}

/**
 * Decode one response body to text. Gzip is recognized by its magic bytes,
 * not the Content-Encoding header: a proxy egress can deliver a gzipped
 * body with the header stripped, and undici then serves the raw bytes
 * (observed through an undici ProxyAgent tunnel to open.bigmodel.cn).
 * Both the compressed input and the decompressed output are bounded.
 * @param body - the raw response bytes (already download-bounded).
 * @param maxBytes - decompression bound.
 * @returns the decoded text.
 */
async function decodeBody(body, maxBytes = MAX_RESPONSE_BYTES) {
  const buffer = Buffer.from(body)
  if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return (await gunzipBounded(buffer, maxBytes)).toString('utf8')
  }
  return buffer.toString('utf8')
}

/**
 * Bounded JSON fetch: aborts after `timeoutMs`, bounds the body (download
 * and decompression) at `maxResponseBytes`, rejects non-2xx with the status
 * and a short body excerpt, and rejects non-JSON bodies. Asks for identity
 * encoding first (no compression to mis-handle in transit); a middlebox
 * that compresses anyway is caught by decodeBody's magic sniff.
 * @param url - absolute request URL.
 * @param init - fetch init plus { timeoutMs, maxResponseBytes }.
 * @returns the parsed JSON body.
 */
export async function fetchJson(url, init = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, maxResponseBytes = MAX_RESPONSE_BYTES, ...rest } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers = { 'accept-encoding': 'identity', ...(rest.headers ?? {}) }
    const response = await fetch(url, { ...rest, headers, signal: controller.signal })
    const text = await decodeBody(await readBody(response, maxResponseBytes), maxResponseBytes)
    if (!response.ok) throw new HttpError(response.status, text.slice(0, 300))
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`response is not valid JSON: ${text.slice(0, 200)}`)
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`request timed out after ${timeoutMs}ms: ${url}`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/** Clamp a percentage into 0..100. */
export function clampPercent(value) {
  return Math.min(100, Math.max(0, value))
}

/** Longest vendor-supplied text allowed into a reading's `error` field. */
export const MAX_DETAIL_CHARS = 160

/**
 * Neutralize text before it rides a quota reading into logs, the settings
 * panel, or the agent-facing report: vendor responses (their error bodies
 * and status messages) are untrusted input, so strip control characters,
 * collapse whitespace, and truncate. A compromised endpoint must not get a
 * free-form channel into the model context or a terminal.
 * @param text - anything (vendor body excerpt, Error message, config value).
 * @returns the sanitized one-line excerpt.
 */
export function sanitizeDetail(text) {
  return String(text)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DETAIL_CHARS)
}

/**
 * Sanitize the free-text fields of a *successful* reading. Plan tiers,
 * membership levels, and named per-model budget names are vendor input
 * exactly like error bodies, and they reach the settings panel and the
 * agent-facing report. The parsers produce a fresh object per probe, so
 * mutating it here at the choke point is safe. Numbers, booleans, and our
 * own ISO reset stamps pass through untouched.
 * @param data - one probe family's parsed data.
 * @returns the same object, with its free-text fields sanitized.
 */
function sanitizeReadingText(data) {
  if (data === null || typeof data !== 'object') return data
  if (typeof data.plan === 'string') data.plan = sanitizeDetail(data.plan)
  if (typeof data.membership === 'string') data.membership = sanitizeDetail(data.membership)
  if (Array.isArray(data.additionalLimits)) {
    for (const limit of data.additionalLimits) {
      if (limit !== null && typeof limit === 'object' && typeof limit.name === 'string') {
        limit.name = sanitizeDetail(limit.name)
      }
    }
  }
  return data
}

/**
 * Normalize every vendor's reset timestamp into an ISO string.
 * Numeric (or numeric-string) values are epochs — seconds below 1e12, else
 * milliseconds; anything else is kept verbatim as an ISO-ish string.
 * @param value - vendor reset field.
 * @returns ISO timestamp, or undefined when absent/unusable.
 */
export function normalizeResetAt(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined
    return new Date(value < 1e12 ? value * 1000 : value).toISOString()
  }
  if (typeof value !== 'string' || value === '') return undefined
  if (/^\d+$/.test(value)) return normalizeResetAt(Number(value))
  return value
}

function toNumber(value) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}

// ---- DeepSeek: pay-as-you-go balance --------------------------------------

/**
 * Parse `GET /user/balance`.
 * @param raw - the response body.
 * @returns { currency, available, granted, toppedUp, sufficient }.
 */
export function parseDeepseek(raw) {
  const infos = Array.isArray(raw?.balance_infos) ? raw.balance_infos : []
  if (infos.length === 0) throw new Error('DeepSeek returned no balance information')
  const info = infos.find((entry) => entry?.currency === 'CNY') ?? infos[0]
  return {
    currency: info.currency ?? 'CNY',
    available: toNumber(info.total_balance),
    granted: toNumber(info.granted_balance),
    toppedUp: toNumber(info.topped_up_balance),
    sufficient: raw?.is_available ?? true,
  }
}

async function probeDeepseek(apiKey, url, timeoutMs) {
  const raw = await fetchJson(url, { headers: { Authorization: `Bearer ${apiKey}` }, timeoutMs })
  return { kind: 'balance', ...parseDeepseek(raw) }
}

// ---- Moonshot AI open platform: pay-as-you-go balance ---------------------

/**
 * Parse `GET /v1/users/me/balance`. The open platform answers with
 * `{ code, smsg, data: { available_balance, cash_balance, voucher_balance } }`;
 * the balance is decimal money in the endpoint's own currency (CNY on
 * api.moonshot.cn, USD on api.moonshot.ai — the response itself names no
 * currency, so the probe derives it from the URL it read).
 * @param raw - the response body.
 * @param currency - 'CNY' | 'USD', derived from the probed endpoint.
 * @returns { currency, available, granted, toppedUp }.
 */
export function parseMoonshot(raw, currency = 'CNY') {
  if (raw?.code !== 0) throw new Error(`Moonshot API error: ${raw?.smsg ?? `code=${raw?.code}`}`)
  const data = raw?.data
  if (data === null || typeof data !== 'object') throw new Error('Moonshot returned no balance information')
  return {
    currency,
    available: toNumber(data.available_balance),
    granted: toNumber(data.voucher_balance),
    toppedUp: toNumber(data.cash_balance),
    sufficient: toNumber(data.available_balance) > 0,
  }
}

async function probeMoonshot(apiKey, url, timeoutMs) {
  const raw = await fetchJson(url, { headers: { Authorization: `Bearer ${apiKey}` }, timeoutMs })
  const currency = new URL(url).host.endsWith('.moonshot.ai') ? 'USD' : 'CNY'
  return { kind: 'balance', ...parseMoonshot(raw, currency) }
}

// ---- OpenRouter marketplace: credits --------------------------------------

/**
 * Parse `GET /api/v1/credits` (documented): `{ data: { total_credits,
 * total_usage } }`, decimal USD — credits purchased on the account versus
 * what model spend has consumed. The card shows the difference as the money
 * left.
 * @param raw - the response body.
 * @returns { currency, available, granted, toppedUp }.
 */
export function parseOpenRouter(raw) {
  const data = raw?.data
  if (data === null || typeof data !== 'object') throw new Error('OpenRouter returned no credit information')
  const total = toNumber(data.total_credits)
  const usage = toNumber(data.total_usage)
  return {
    currency: 'USD',
    available: Math.max(0, total - usage),
    granted: 0,
    toppedUp: total,
    sufficient: total - usage > 0,
  }
}

async function probeOpenRouter(apiKey, url, timeoutMs) {
  const raw = await fetchJson(url, { headers: { Authorization: `Bearer ${apiKey}` }, timeoutMs })
  return { kind: 'balance', ...parseOpenRouter(raw) }
}

// ---- Anthropic: Claude Pro/Max OAuth windows --------------------------------

/**
 * Normalize a utilization fraction-or-percent into a used percentage.
 * Claude's OAuth usage endpoint reports `utilization` as a 0–1 fraction.
 */
function anthropicPercent(value) {
  const parsed = toFiniteNumber(value)
  if (parsed === undefined) return undefined
  return parsed >= 0 && parsed <= 1 ? parsed * 100 : parsed
}

/**
 * Parse `GET /api/oauth/usage` (Claude Pro/Max subscription, OAuth bearer):
 * `{ five_hour: { utilization, resets_at }, seven_day: { … }, extra_usage? }`.
 * @param raw - the response body.
 * @returns { fiveHour, weekly } windows with used percentages and resets.
 */
export function parseAnthropic(raw) {
  if (raw?.error !== undefined) throw new Error(`Anthropic API error: ${raw?.error?.message ?? 'unknown'}`)
  const fiveHourPercent = anthropicPercent(raw?.five_hour?.utilization)
  const weeklyPercent = anthropicPercent(raw?.seven_day?.utilization)
  if (fiveHourPercent === undefined && weeklyPercent === undefined) {
    throw new Error('Anthropic returned no usage windows')
  }
  const resetOf = (window) => (typeof window?.resets_at === 'string' && window.resets_at !== ''
    ? { resetAt: new Date(window.resets_at).toISOString() }
    : {})
  return {
    fiveHour: fiveHourPercent === undefined ? {} : { usedPercent: fiveHourPercent, ...resetOf(raw?.five_hour) },
    weekly: weeklyPercent === undefined ? {} : { usedPercent: weeklyPercent, ...resetOf(raw?.seven_day) },
  }
}

async function probeAnthropic(token, url, timeoutMs) {
  const raw = await fetchJson(url, {
    headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' },
    timeoutMs,
  })
  return { kind: 'windows', ...parseAnthropic(raw) }
}

// ---- MiniMax Coding Plan: interval and weekly windows -----------------------

/** Epoch seconds/millis, ISO string, or countdown seconds → ISO timestamp. */
function isoFromEpochLike(value, now = Date.now()) {
  const parsed = toFiniteNumber(value)
  if (parsed !== undefined) {
    if (parsed < 1e9) return new Date(now + parsed * 1000).toISOString() // countdown seconds
    return new Date(parsed < 1e12 ? parsed * 1000 : parsed).toISOString()
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const time = Date.parse(value)
    if (!Number.isNaN(time)) return new Date(time).toISOString()
  }
  return undefined
}

/** Remaining-percent (0–100, integer 100 means 100%) → used percent. */
function usedFromRemainingPercent(value) {
  const parsed = toFiniteNumber(value)
  return parsed === undefined ? undefined : 100 - Math.min(100, Math.max(0, parsed))
}

/**
 * Parse `GET /v1/token_plan/remains` (MiniMax Coding Plan, API-key bearer).
 * Windows come from `services[]` (percent + window_type) and/or
 * `model_remains[]` (per-model interval and weekly counts); the interval
 * window plays the five-hour slot. A payload status of 2062 means the key has
 * no active Token Plan (credits-only accounts) — surfaced as an error card
 * instead of a fabricated percentage.
 * @param raw - the response body.
 * @returns { fiveHour, weekly } with used percentages and reset timestamps.
 */
export function parseMiniMax(raw) {
  const data = raw?.data ?? raw
  const baseResponse = data?.base_resp ?? data?.baseResp ?? raw?.base_resp ?? raw?.baseResp
  const status = toFiniteNumber(baseResponse?.status_code ?? baseResponse?.statusCode)
  if (status !== undefined && status !== 0) {
    const message = baseResponse?.status_msg ?? baseResponse?.statusMessage
    throw new Error(status === 2062
      ? 'no active MiniMax Token Plan (credits-only account; see the console)'
      : `MiniMax API error: ${typeof message === 'string' && message !== '' ? message : `code=${status}`}`)
  }
  if (data === null || typeof data !== 'object') throw new Error('MiniMax returned no usage information')
  const interval = []
  const weekly = []
  const pushWindow = (bucket, percent, resetAt) => {
    if (percent !== undefined) bucket.push({ percent, ...(resetAt === undefined ? {} : { resetAt }) })
  }
  if (Array.isArray(data.services)) {
    for (const service of data.services) {
      const percent = toFiniteNumber(service?.percent)
      if (percent === undefined) continue
      const weeklyWindow = String(service?.window_type ?? '').toLowerCase().includes('week')
      const resetAt = isoFromEpochLike(service?.resets_at ?? service?.reset_time ?? service?.end_time)
      pushWindow(weeklyWindow ? weekly : interval, percent, resetAt)
    }
  }
  if (Array.isArray(data.model_remains ?? data.modelRemains)) {
    for (const model of data.model_remains ?? data.modelRemains) {
      const intervalUsed = usedFromRemainingPercent(
        model?.current_interval_remaining_percent ?? model?.currentIntervalRemainingPercent)
        ?? (() => {
          const total = toFiniteNumber(model?.current_interval_total_count ?? model?.currentIntervalTotalCount)
          const used = toFiniteNumber(model?.current_interval_usage_count ?? model?.currentIntervalUsageCount)
          return total !== undefined && total > 0 && used !== undefined ? (used / total) * 100 : undefined
        })()
      if (intervalUsed !== undefined) {
        pushWindow(interval, intervalUsed, isoFromEpochLike(
          model?.current_resets_at ?? model?.end_time ?? model?.endTime ?? model?.remains_time ?? model?.remainsTime))
      }
      const weeklyUsed = usedFromRemainingPercent(
        model?.current_weekly_remaining_percent ?? model?.currentWeeklyRemainingPercent)
        ?? (() => {
          const total = toFiniteNumber(model?.current_weekly_total_count ?? model?.currentWeeklyTotalCount)
          const used = toFiniteNumber(model?.current_weekly_usage_count ?? model?.currentWeeklyUsageCount)
          return total !== undefined && total > 0 && used !== undefined ? (used / total) * 100 : undefined
        })()
      if (weeklyUsed !== undefined) {
        pushWindow(weekly, weeklyUsed, isoFromEpochLike(
          model?.weekly_resets_at ?? model?.weekly_end_time ?? model?.weeklyEndTime ?? model?.weekly_remains_time ?? model?.weeklyRemainsTime))
      }
    }
  }
  const highest = (windows) => windows.reduce((left, right) => (left === undefined || right.percent > left.percent ? right : left), undefined)
  const fiveHour = highest(interval)
  const week = highest(weekly)
  if (fiveHour === undefined && week === undefined) {
    throw new Error('MiniMax returned no usage windows (credits-only account; see the console)')
  }
  return {
    ...(fiveHour === undefined ? {} : { fiveHour: { usedPercent: fiveHour.percent, ...(fiveHour.resetAt === undefined ? {} : { resetAt: fiveHour.resetAt }) } }),
    ...(week === undefined ? {} : { weekly: { usedPercent: week.percent, ...(week.resetAt === undefined ? {} : { resetAt: week.resetAt }) } }),
  }
}

async function probeMiniMax(apiKey, url, timeoutMs) {
  // The modern endpoint first, then the legacy path it replaced.
  const legacy = url.replace('/v1/token_plan/remains', '/v1/api/openplatform/coding_plan/remains')
  let lastError
  for (const candidate of legacy === url ? [url] : [url, legacy]) {
    try {
      const raw = await fetchJson(candidate, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, timeoutMs })
      return { kind: 'windows', ...parseMiniMax(raw) }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

// ---- Baseten: month-to-date credit spend ------------------------------------

/**
 * Parse `GET /v1/billing/usage_summary` (documented): `{ dedicated_usage,
 * training_usage, model_apis_usage }`, each carrying `credits_used`. Baseten
 * publishes no remaining balance, so the card reports spend honestly.
 * @param raw - the response body.
 * @returns { unit, used } — credits consumed in the queried month.
 */
export function parseBaseten(raw) {
  if (raw === null || typeof raw !== 'object') throw new Error('Baseten returned no usage information')
  const sections = [raw.dedicated_usage, raw.training_usage, raw.model_apis_usage]
  const used = sections.map((section) => toFiniteNumber(section?.credits_used)).filter((value) => value !== undefined)
  if (used.length === 0) throw new Error('Baseten returned no credit usage')
  return { unit: 'credits', used: used.reduce((sum, value) => sum + value, 0) }
}

async function probeBaseten(apiKey, url, timeoutMs) {
  // The summary requires a UTC date range (≤31 days); the card shows the
  // current calendar month to date.
  const now = new Date()
  const range = new URL(url)
  range.searchParams.set('start_date', new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString())
  range.searchParams.set('end_date', now.toISOString())
  const raw = await fetchJson(range.toString(), { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, timeoutMs })
  return { kind: 'spend', ...parseBaseten(raw) }
}

// ---- OpenAI Codex: ChatGPT subscription windows ----------------------------

const FIVE_HOURS_SECONDS = 5 * 3600
const WEEK_SECONDS = 7 * 86400
const MONTH_MIN_SECONDS = 28 * 86400
const MONTH_MAX_SECONDS = 31 * 86400

function toFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/** Classify Codex windows by their own duration, never by primary/secondary. */
function codexWindowKind(value) {
  const seconds = toFiniteNumber(value?.limit_window_seconds ?? value?.limitWindowSeconds)
  if (seconds === undefined) return undefined
  if (Math.abs(seconds - FIVE_HOURS_SECONDS) <= 60) return 'fiveHour'
  if (Math.abs(seconds - WEEK_SECONDS) <= 60) return 'weekly'
  if (seconds >= MONTH_MIN_SECONDS && seconds <= MONTH_MAX_SECONDS) return 'monthly'
  return undefined
}

function codexWindow(value) {
  if (value === undefined || value === null) return undefined
  const used = toFiniteNumber(value.used_percent ?? value.usedPercent)
  if (used === undefined) return undefined
  const usedPercent = clampPercent(used)
  const window = { usedPercent, remainingPercent: clampPercent(100 - usedPercent) }
  const resetAt = normalizeResetAt(value.reset_at ?? value.resetAt)
  if (resetAt !== undefined) window.resetAt = resetAt
  else {
    // Some payloads carry a relative countdown instead of an absolute stamp.
    const resetAfter = toFiniteNumber(value.reset_after_seconds)
    if (resetAfter !== undefined && resetAfter >= 0) window.resetIn = resetAfter
  }
  return window
}

function codexWindows(raw) {
  const found = new Map()
  for (const value of [raw?.primary_window, raw?.secondary_window, raw?.primary, raw?.secondary]) {
    const kind = codexWindowKind(value)
    const window = codexWindow(value)
    if (kind !== undefined && window !== undefined && !found.has(kind)) found.set(kind, window)
  }
  return found
}

/**
 * Parse `GET /backend-api/wham/usage`. The slot names are transport details:
 * their reported durations decide whether a window is 5-hour, weekly, or
 * monthly, so a provider-side reorder can never silently swap the labels.
 *
 * Besides the main `rate_limit`, the payload may carry named per-model
 * budgets (`additional_rate_limits`, each with its own two windows), a
 * separate 7-day `code_review_rate_limit`, purchased credits, and on-demand
 * rate-limit resets.
 */
export function parseCodex(raw) {
  const windows = codexWindows(raw?.rate_limit)
  const codeReview = codexWindows(raw?.code_review_rate_limit)
  const data = {}
  const fiveHour = windows.get('fiveHour')
  if (fiveHour !== undefined) data.fiveHour = fiveHour
  const weekly = windows.get('weekly')
  if (weekly !== undefined) data.weekly = weekly
  const monthly = windows.get('monthly')
  if (monthly !== undefined) data.monthly = monthly
  const codeReviewWeekly = codeReview.get('weekly')
  if (codeReviewWeekly !== undefined) data.codeReviewWeekly = codeReviewWeekly
  if (Array.isArray(raw?.additional_rate_limits)) {
    const additional = []
    for (const entry of raw.additional_rate_limits) {
      if (entry === null || typeof entry !== 'object') continue
      const entryWindows = codexWindows(entry.rate_limit)
      if (entryWindows.size === 0) continue
      const limit = {
        name: typeof entry.limit_name === 'string' ? entry.limit_name : '',
      }
      for (const [kind, window] of entryWindows) limit[kind] = window
      additional.push(limit)
    }
    if (additional.length > 0) data.additionalLimits = additional
  }
  if (typeof raw?.plan_type === 'string' && raw.plan_type !== '') data.plan = raw.plan_type

  const credits = raw?.credits
  if (credits !== undefined && credits !== null && typeof credits === 'object') {
    const balance = toFiniteNumber(credits.balance)
    data.credits = {
      hasCredits: credits.has_credits === true,
      unlimited: credits.unlimited === true,
      ...(balance === undefined ? {} : { balance }),
    }
  }
  const resets = toFiniteNumber(raw?.rate_limit_reset_credits?.available_count)
  if (resets !== undefined) data.rateLimitResets = resets

  const windowCount = [...windows.values(), ...codeReview.values()].length
    + (data.additionalLimits ?? []).length
  if (windowCount === 0 && data.credits === undefined && data.rateLimitResets === undefined) {
    throw new Error('Codex returned no quota information')
  }
  return data
}

async function probeCodex(accessToken, url, timeoutMs, target) {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', originator: 'pi' }
  if (typeof target?.accountId === 'string' && target.accountId !== '') {
    headers['ChatGPT-Account-Id'] = target.accountId
  }
  const raw = await fetchJson(url, { headers, timeoutMs })
  return { kind: 'windows', ...parseCodex(raw) }
}

/** Extract the ChatGPT account id from the OpenAI access-token claim. */
function codexAccountId(accessToken) {
  if (typeof accessToken !== 'string') return undefined
  try {
    const parts = accessToken.split('.')
    if (parts.length !== 3) return undefined
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    const accountId = payload?.['https://api.openai.com/auth']?.chatgpt_account_id
    return typeof accountId === 'string' && accountId !== '' ? accountId : undefined
  } catch {
    return undefined
  }
}

// ---- Kimi: Coding Plan windows --------------------------------------------

function timeUnitToSeconds(unit) {
  // Live responses spell this as an enum ("TIME_UNIT_MINUTE"); bare forms too.
  const normalized = String(unit ?? '').toUpperCase().replace(/^TIME_UNIT_/, '').replace(/S$/, '')
  switch (normalized) {
    case 'SECOND': return 1
    case 'MINUTE': return 60
    case 'HOUR': return 3600
    case 'DAY': return 86400
    case 'WEEK': return 604800
    default: return undefined
  }
}

function kimiWindowSeconds(limit) {
  const window = limit?.window ?? { duration: limit?.duration, timeUnit: limit?.timeUnit }
  const unit = timeUnitToSeconds(window?.timeUnit)
  if (window?.duration === undefined || unit === undefined) return undefined
  return window.duration * unit
}

function kimiResetAt(detail) {
  return normalizeResetAt(detail?.reset_at ?? detail?.resetAt ?? detail?.reset_time ?? detail?.resetTime)
}

function kimiHorizonSeconds(detail) {
  const resetIn = toFiniteNumber(detail?.reset_in) ?? toFiniteNumber(detail?.resetIn) ?? toFiniteNumber(detail?.ttl)
  if (resetIn !== undefined) return resetIn
  const at = kimiResetAt(detail)
  if (at === undefined) return undefined
  const time = Date.parse(at)
  if (Number.isNaN(time)) return undefined
  return Math.max(0, (time - Date.now()) / 1000)
}

function kimiKindByLabel(label) {
  const lower = String(label ?? '').toLowerCase()
  if (/week|周/.test(lower)) return 'weekly'
  if (/5\s*-?\s*(h|hour|hr)|5小时|五小时/.test(lower)) return 'fiveHour'
  return undefined
}

/** A window's own size identifies it exactly (with slack for clock wording). */
function kimiKindByWindowSeconds(seconds) {
  if (Math.abs(seconds - FIVE_HOURS_SECONDS) <= 1800) return 'fiveHour'
  if (Math.abs(seconds - WEEK_SECONDS) <= 86400) return 'weekly'
  return undefined
}

/** The horizon ("time until reset") only orders by magnitude. */
function kimiKindByResetSeconds(seconds) {
  if (seconds <= FIVE_HOURS_SECONDS * 1.2) return 'fiveHour'
  if (seconds <= WEEK_SECONDS * 1.2) return 'weekly'
  return undefined
}

function kimiWindow(detail) {
  const limit = toFiniteNumber(detail?.limit)
  const remainingRaw = toFiniteNumber(detail?.remaining)
  const used = toFiniteNumber(detail?.used) ?? (limit !== undefined && remainingRaw !== undefined ? limit - remainingRaw : undefined)
  const remaining = remainingRaw ?? (limit !== undefined && used !== undefined ? limit - used : undefined)
  const window = {}
  if (limit !== undefined) window.limit = limit
  if (used !== undefined) window.used = used
  if (remaining !== undefined) window.remaining = remaining
  if (limit !== undefined && remaining !== undefined && limit > 0) {
    window.remainingPercent = clampPercent((remaining / limit) * 100)
  }
  const resetIn = toFiniteNumber(detail?.reset_in) ?? toFiniteNumber(detail?.resetIn) ?? toFiniteNumber(detail?.ttl)
  if (resetIn !== undefined) window.resetIn = resetIn
  const resetAt = kimiResetAt(detail)
  if (resetAt !== undefined) window.resetAt = resetAt
  return window
}

function kimiKind(limit) {
  const label = [limit?.name, limit?.title, limit?.scope].filter(Boolean).join(' ')
  const byDuration = kimiWindowSeconds(limit)
  const horizon = limit?.detail !== undefined ? kimiHorizonSeconds(limit.detail) : undefined
  return kimiKindByLabel(label)
    ?? (byDuration !== undefined ? kimiKindByWindowSeconds(byDuration) : undefined)
    ?? (horizon !== undefined ? kimiKindByResetSeconds(horizon) : undefined)
}

/**
 * Parse `GET /coding/v1/usages`. Every numeric field may arrive as a string;
 * windows are identified by label, then by their own duration, then by the
 * magnitude of their reset horizon.
 * @param raw - the response body.
 * @returns { fiveHour, weekly, membership?, parallelLimit? }.
 */
export function parseKimi(raw) {
  const found = new Map()
  const assign = (kind, window) => {
    if (kind === undefined || found.has(kind)) return
    if (window.remainingPercent === undefined && window.remaining === undefined) return
    found.set(kind, window)
  }
  for (const limit of Array.isArray(raw?.limits) ? raw.limits : []) {
    assign(kimiKind(limit), kimiWindow(limit?.detail ?? {}))
  }
  if (raw?.usage !== undefined && raw.usage !== null) {
    const usage = raw.usage
    const label = usage.name ?? usage.title ?? ''
    const horizon = kimiHorizonSeconds(usage)
    const kind = kimiKindByLabel(label) ?? (horizon !== undefined ? kimiKindByResetSeconds(horizon) : undefined)
    assign(kind, kimiWindow(usage))
  }
  const quota = { fiveHour: found.get('fiveHour') ?? {}, weekly: found.get('weekly') ?? {} }
  const membership = raw?.user?.membership?.level
  if (typeof membership === 'string' && membership !== '') quota.membership = membership
  const parallelLimit = toFiniteNumber(raw?.parallel?.limit)
  if (parallelLimit !== undefined) quota.parallelLimit = parallelLimit
  return quota
}

async function probeKimi(apiKey, url, timeoutMs) {
  const raw = await fetchJson(url, { headers: { Authorization: `Bearer ${apiKey}` }, timeoutMs })
  return { kind: 'windows', ...parseKimi(raw) }
}

// ---- Zhipu GLM: Coding Plan windows ---------------------------------------

function zhipuResetToMillis(value) {
  if (value === undefined || value === null) return Number.MAX_SAFE_INTEGER
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value
  const time = Date.parse(value)
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time
}

function zhipuWindow(limit) {
  if (limit === undefined) return {}
  const window = {}
  if (typeof limit.percentage === 'number' && Number.isFinite(limit.percentage)) {
    window.usedPercent = limit.percentage
    window.remainingPercent = clampPercent(100 - limit.percentage)
  }
  const resetAt = normalizeResetAt(limit.nextResetTime)
  if (resetAt !== undefined) window.resetAt = resetAt
  return window
}

/**
 * Parse `GET /api/monitor/usage/quota/limit`. Each TOKENS_LIMIT row names its
 * own window size (`unit` 3 counts hours — the 5-hour window — and `unit` 6 is
 * the weekly window; the community-decoded console enum also has 1 = days and
 * 5 = minutes). Those names decide the labels; reset-time order is only the
 * fallback for rows carrying no unit, because in the tail of a week the
 * rolling weekly window resets sooner than the 5-hour one, and the 5-hour row
 * sometimes arrives with no reset time at all (openusage issue #242).
 * @param raw - the response body.
 * @returns { plan, fiveHour, weekly, mcp? }.
 */
export function parseZhipu(raw) {
  if (raw?.success === false || (raw?.code !== undefined && raw.code !== 200)) {
    throw new Error(`Zhipu API error: ${raw?.msg ?? `code=${raw?.code}`}`)
  }
  const limits = Array.isArray(raw?.data?.limits) ? raw.data.limits : []
  // CREDIT_LIMIT (the Coding Plan's credit-based lite tiers) reports the same
  // unit/percentage/nextResetTime shape as TOKENS_LIMIT; both name the windows.
  const tokenLimits = limits.filter((limit) => limit?.type === 'TOKENS_LIMIT' || limit?.type === 'CREDIT_LIMIT')
  const byUnit = new Map()
  for (const limit of tokenLimits) {
    const unit = toFiniteNumber(limit?.unit)
    const kind = unit === 6 ? 'weekly' : unit === 3 ? 'fiveHour' : undefined
    if (kind !== undefined && !byUnit.has(kind)) byUnit.set(kind, limit)
  }
  const claimed = new Set(byUnit.values())
  const ordered = tokenLimits
    .filter((limit) => !claimed.has(limit))
    .sort((left, right) => zhipuResetToMillis(left.nextResetTime) - zhipuResetToMillis(right.nextResetTime))
  let fallbackIndex = 0
  const takeFallback = () => ordered[fallbackIndex++]
  const timeLimit = limits.find((limit) => limit?.type === 'TIME_LIMIT')
  const quota = {
    plan: raw?.data?.level ?? 'unknown',
    fiveHour: zhipuWindow(byUnit.get('fiveHour') ?? takeFallback()),
    weekly: zhipuWindow(byUnit.get('weekly') ?? takeFallback()),
  }
  if (timeLimit?.remaining !== undefined) quota.mcp = { remaining: timeLimit.remaining }
  return quota
}

async function probeZhipu(apiKey, url, timeoutMs) {
  try {
    const raw = await fetchJson(url, { headers: { Authorization: apiKey }, timeoutMs })
    return { kind: 'windows', ...parseZhipu(raw) }
  } catch (error) {
    // The console API accepts the bare key; a 401 retries the Bearer spelling.
    if (error instanceof HttpError && error.status === 401) {
      const raw = await fetchJson(url, { headers: { Authorization: `Bearer ${apiKey}` }, timeoutMs })
      return { kind: 'windows', ...parseZhipu(raw) }
    }
    throw error
  }
}

/** Probe registry: URL, request, and parse per family. */
export const PROBES = {
  zhipu: { url: PROBE_URLS.zhipu, fetch: probeZhipu },
  kimi: { url: PROBE_URLS.kimi, fetch: probeKimi },
  codex: { url: PROBE_URLS.codex, fetch: probeCodex },
  deepseek: { url: PROBE_URLS.deepseek, fetch: probeDeepseek },
  moonshot: { url: PROBE_URLS.moonshot, fetch: probeMoonshot },
  openrouter: { url: PROBE_URLS.openrouter, fetch: probeOpenRouter },
  minimax: { url: PROBE_URLS.minimax, fetch: probeMiniMax },
  baseten: { url: PROBE_URLS.baseten, fetch: probeBaseten },
  anthropic: { url: PROBE_URLS.anthropic, fetch: probeAnthropic },
}

// ---- route classification --------------------------------------------------

/** Hostnames that identify a vendor's endpoint, in probe order. */
const HOST_RULES = [
  { probe: 'zhipu', hosts: ['bigmodel.cn', 'z.ai'] },
  { probe: 'kimi', hosts: ['kimi.com'] },
  { probe: 'codex', hosts: ['chatgpt.com'] },
  { probe: 'deepseek', hosts: ['deepseek.com'] },
  { probe: 'moonshot', hosts: ['moonshot.cn', 'moonshot.ai'] },
  { probe: 'openrouter', hosts: ['openrouter.ai'] },
  { probe: 'minimax', hosts: ['minimax.io', 'minimaxi.com'] },
  { probe: 'baseten', hosts: ['baseten.co'] },
]

/** Route-id keywords, for a route that names no endpoint at all. */
const ID_RULES = [
  { probe: 'zhipu', words: ['zai', 'zhipu', 'glm', 'bigmodel'] },
  { probe: 'kimi', words: ['kimi'] },
  { probe: 'deepseek', words: ['deepseek'] },
  { probe: 'moonshot', words: ['moonshot'] },
  { probe: 'openrouter', words: ['openrouter'] },
  { probe: 'minimax', words: ['minimax'] },
  { probe: 'baseten', words: ['baseten'] },
]

function hostOf(url) {
  if (typeof url !== 'string' || url === '') return ''
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Which probe can answer for one configured route.
 * The endpoint host decides first (a route id is free-form); the id's
 * keywords speak only when the route names no endpoint at all.
 *
 * A route whose endpoint names a host no probe knows — a local gateway, a
 * corporate proxy, an OpenAI API endpoint — is skipped outright: its
 * credential was issued for that host, and shipping it to a vendor's console
 * endpoint would leak it cross-service (a `glm`-named proxy's key does not
 * belong at bigmodel.cn; a platform API key does not belong at the ChatGPT
 * console). Forcing a probe for such a route is an explicit opt-in through
 * `quota.providers` overrides.
 * @param route - provider route id from the settings tree.
 * @param baseURL - the route's configured endpoint, when it has one.
 * @returns probe id, or undefined when no probe fits (route is then skipped).
 */
export function detectProbe(route, baseURL) {
  const host = hostOf(baseURL)
  if (host !== '') {
    for (const rule of HOST_RULES) {
      if (rule.hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`))) return rule.probe
    }
    return undefined
  }
  const id = String(route ?? '').toLowerCase()
  if (id === 'openai-codex') return 'codex'
  // The Claude OAuth usage endpoint answers a Pro/Max subscription grant, not
  // a console API key — like Codex, only the catalog route id auto-selects it.
  if (id === 'anthropic') return 'anthropic'
  for (const rule of ID_RULES) {
    if (rule.words.some((word) => id.includes(word))) return rule.probe
  }
  return undefined
}

/**
 * Whether a hostname names this machine (loopback literals only). The host
 * harness keeps its own predicate (a 3-literal list); this mirror is
 * deliberate — the plugin stays harness-free — and intentionally accepts the
 * full 127/8. The divergence is safe-direction: a miss rejects, never widens.
 */
function isLoopbackHostname(hostname) {
  const bare = hostname.replace(/^\[/, '').replace(/\]$/, '')
  if (bare === 'localhost' || bare === '::1') return true
  const parts = bare.split('.')
  return parts.length === 4 && parts[0] === '127' && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/**
 * Reject a `quota.providers` override URL that would ship a credential
 * somewhere it must not go: only `https:` qualifies, plus plain `http:` on
 * the local loopback (a dev-only mock endpoint never leaves the machine).
 * The caller logs the reason and the override's `url` is then ignored in
 * favor of the family default.
 * @param override - one per-route override from the plugin config.
 * @returns a human-readable reason when the url must be ignored, else undefined.
 */
export function overrideUrlIssue(override) {
  const url = typeof override?.url === 'string' ? override.url : ''
  if (url === '') return undefined
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return `url ${JSON.stringify(url)} does not parse`
  }
  if (parsed.protocol === 'https:') return undefined
  if (parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname)) return undefined
  return `url ${JSON.stringify(url)} must be https (plain http is allowed only on the loopback)`
}

/**
 * Turn the deployment's configured routes into quota targets.
 * @param sources - { piAi, deepseek, overrides }: the resolved `llm-pi-ai`
 *   settings section (its `providers` dict), the resolved `llm-deepseek`
 *   section, and per-route config overrides. An override `url` that is not
 *   https (loopback http aside) is ignored here — see `overrideUrlIssue`.
 * @returns [{ route, probe, credentialRef?, credentialKey?, label? }] — routes
 *   no probe can answer for, and routes already covered, are omitted.
 */
export function discoverTargets(sources = {}) {
  const overrides = sources.overrides ?? {}
  const targets = []
  const seen = new Set()
  const add = (route, profile) => {
    if (typeof route !== 'string' || route === '' || seen.has(route)) return
    const override = overrides[route] ?? {}
    const probe = PROBES[override.probe] !== undefined ? override.probe : detectProbe(route, profile?.baseURL)
    if (probe === undefined) return
    seen.add(route)
    const label = typeof profile?.displayName === 'string' && profile.displayName !== '' ? profile.displayName : undefined
    const credentialRef = typeof override.credentialRef === 'string' && override.credentialRef !== ''
      ? override.credentialRef
      : profile?.apiKeyEnv
    // Native Codex authentication is an OAuth grant owned by llm-pi-ai, not
    // an environment-style credential ref. Only infer the record when no
    // explicit ref overrides it; custom bearer-token routes still work.
    // Native Codex, Claude, and Kimi-Code subscription logins are OAuth grants
    // owned by llm-pi-ai, not environment-style credential refs. Only infer the
    // record when no explicit ref overrides it; custom routes keep working.
    const oauthGrants = {
      codex: 'openai-codex',
      anthropic: 'anthropic',
      kimi: 'kimi-coding',
    }
    const grantRoute = probe === 'codex' && /^[a-z][a-z0-9-]*$/.test(route) ? route : oauthGrants[probe]
    const credentialKey = grantRoute !== undefined
      && !(typeof credentialRef === 'string' && credentialRef !== '')
      ? `llm-pi-ai/${grantRoute}`
      : undefined
    // Region routing for families that serve two domains: follow the route's
    // own endpoint when it names one, else the catalog's route id (the CN
    // flavor carries a `-cn` suffix). An explicit override.url always wins.
    const host = hostOf(profile?.baseURL)
    const derivedUrl = probe === 'moonshot' && (host.endsWith('.moonshot.ai') || route === 'moonshotai')
      ? MOONSHOT_INTL_URL
      : probe === 'zhipu' && (host === 'z.ai' || host.endsWith('.z.ai') || route === 'zai')
        ? ZHIPU_INTL_URL
        : probe === 'minimax' && (host.endsWith('.minimaxi.com') || route === 'minimax-cn')
          ? MINIMAX_CN_URL
          : undefined
    const url = typeof override.url === 'string' && override.url !== '' && overrideUrlIssue(override) === undefined
      ? override.url
      : derivedUrl
    targets.push({
      route,
      probe,
      ...(typeof credentialRef === 'string' && credentialRef !== '' ? { credentialRef } : {}),
      ...(credentialKey === undefined ? {} : { credentialKey }),
      ...(label === undefined ? {} : { label }),
      ...(typeof url === 'string' && url !== '' ? { url } : {}),
    })
  }
  for (const [route, profile] of Object.entries(sources.piAi?.providers ?? {})) add(route, profile)
  // The official DeepSeek route is mounted by the base layer, so it appears
  // only once its settings namespace resolves — a deployment that replaced
  // that adapter shows no card for it rather than an unconfigured one.
  if (sources.deepseek !== undefined) add(DEEPSEEK_ROUTE, sources.deepseek)
  return targets
}

/**
 * Resolve a target's secret host-side. API-key routes use the credential-ref
 * namespace; native OpenAI Codex uses llm-pi-ai's opaque OAuth record. This
 * helper deliberately does not refresh that foreign grant — llm-pi-ai owns
 * its format and refresh lifecycle — but gives an expired record an actionable
 * per-route error instead of letting it break every quota card.
 */
export async function resolveTargetAuth(target, credentials, now = Date.now()) {
  if (credentials === undefined) return { ...target, authError: 'credentials service is unavailable' }
  try {
    if (target.credentialRef !== undefined) {
      const apiKey = (await credentials.resolve(target.credentialRef))?.value
      return { ...target, ...(typeof apiKey === 'string' && apiKey !== '' ? { apiKey } : {}) }
    }
    if (target.credentialKey !== undefined) {
      const record = await credentials.readRecord(target.credentialKey)
      const grant = record?.kind === 'grant' ? record.payload : undefined
      if (grant?.type !== 'oauth' || typeof grant.access !== 'string' || grant.access === '') {
        return { ...target, authError: `no OAuth grant for ${target.credentialKey}` }
      }
      if (Number.isFinite(grant.expires) && grant.expires <= now + 30_000) {
        return { ...target, authError: 'stored OAuth grant is expired; use the route once to refresh it' }
      }
      const accountId = typeof grant.accountId === 'string' && grant.accountId !== ''
        ? grant.accountId
        : codexAccountId(grant.access)
      return {
        ...target,
        apiKey: grant.access,
        ...(accountId === undefined ? {} : { accountId }),
      }
    }
    return target
  } catch (error) {
    return { ...target, authError: error instanceof Error ? error.message : String(error) }
  }
}

// ---- probing + TTL cache ---------------------------------------------------

/**
 * Read one target, never throwing: a missing credential, a provider failure,
 * and a parser complaint all become an `ok: false` reading that names the
 * route, so one broken vendor cannot hide the others. Error text is vendor
 * input and is sanitized (`sanitizeDetail`) before it travels anywhere.
 * @param target - one discoverTargets entry plus its resolved `apiKey`.
 * @param timeoutMs - per-request network bound.
 * @returns one quota reading for the wire.
 */
export async function probeTarget(target, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const base = {
    route: target.route,
    probe: target.probe,
    ...(target.label === undefined ? {} : { label: target.label }),
  }
  const probe = PROBES[target.probe]
  if (probe === undefined) {
    return { ...base, ok: false, reason: 'unsupported', error: `no quota probe for "${target.probe}"` }
  }
  if (typeof target.apiKey !== 'string' || target.apiKey === '') {
    return {
      ...base,
      ok: false,
      reason: 'unconfigured',
      error: sanitizeDetail(target.authError
        ?? (target.credentialRef !== undefined
          ? `no value for ${target.credentialRef}`
          : target.credentialKey !== undefined
            ? `no OAuth grant for ${target.credentialKey}`
            : 'no credential reference on this route')),
    }
  }
  try {
    const data = await probe.fetch(target.apiKey, target.url ?? probe.url, timeoutMs, target)
    return { ...base, ok: true, fetchedAt: Date.now(), stale: false, data: sanitizeReadingText(data) }
  } catch (error) {
    return { ...base, ok: false, reason: 'error', error: sanitizeDetail(error instanceof Error ? error.message : String(error)) }
  }
}

/**
 * A failed refresh must not blank out a reading that a moment ago was good:
 * the previous success is served instead, flagged `stale` and carrying the
 * failure text. A first-ever failure has nothing to fall back on.
 */
function degradeToStale(result, previous) {
  if (result.ok || previous === undefined || previous.ok !== true || previous.data === undefined) return result
  return { ...previous, stale: true, error: result.error, reason: result.reason }
}

/**
 * TTL cache over the probes, with per-route last-good retention.
 *
 * Readings are shared across the settings panel and the `usage_stats` tool,
 * so a burst of readers costs one network round per route. `force` skips the
 * TTL (the panel's refresh button); a forced refresh that fails degrades to
 * the last good reading rather than an error card.
 *
 * The key is the route plus a non-reversible credential identity (account id,
 * or a truncated key digest) and the probe target: switching the ChatGPT
 * account or a vendor key on the same route must never serve — nor degrade
 * to — the previous credential's numbers.
 * @param options - { ttlMs, timeoutMs, now, probe } (the last two injectable).
 * @returns { load(targets, { force }), clear() }.
 */
export function createQuotaCache(options = {}) {
  const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : DEFAULT_TTL_MS
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS
  const now = typeof options.now === 'function' ? options.now : Date.now
  const probe = typeof options.probe === 'function' ? options.probe : probeTarget
  const cached = new Map()

  const cacheKeyOf = (target) => {
    const keyFingerprint = typeof target.apiKey === 'string' && target.apiKey !== ''
      ? createHash('sha256').update(target.apiKey).digest('hex').slice(0, 16)
      : ''
    return [
      target.route,
      target.probe,
      target.url ?? '',
      target.accountId ?? '',
      target.credentialKey ?? '',
      keyFingerprint,
    ].join('|')
  }

  const refresh = async (target) => {
    const cacheKey = cacheKeyOf(target)
    const previous = cached.get(cacheKey)
    const result = await probe(target, timeoutMs)
    cached.set(cacheKey, { at: now(), result: degradeToStale(result, previous?.result) })
  }

  return {
    /**
     * Read every target, probing only those whose reading has aged out.
     * @param targets - discoverTargets entries with resolved `apiKey`s.
     * @param options - { force } bypasses the TTL for every target.
     * @returns { quotas } — one reading per target, in target order.
     */
    async load(targets, loadOptions = {}) {
      const force = loadOptions.force === true
      const due = targets.filter((target) => {
        if (force) return true
        const entry = cached.get(cacheKeyOf(target))
        return entry === undefined || now() - entry.at >= ttlMs
      })
      await Promise.all(due.map(refresh))
      const quotas = []
      for (const target of targets) {
        const entry = cached.get(cacheKeyOf(target))
        if (entry !== undefined) quotas.push(entry.result)
      }
      return { quotas, ttlMs, forced: force }
    },
    /** Drop every cached reading (tests, and a config change that moves routes). */
    clear() {
      cached.clear()
    },
  }
}
