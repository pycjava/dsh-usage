/**
 * Provider quota probes: how much allowance the configured LLM routes have
 * left, as the providers themselves report it.
 *
 * Three probe families, ported from the standalone TokenMeter CLI (its
 * parsers are pure and were fixture-tested against real responses):
 *
 *   - `zhipu`     智谱 GLM Coding Plan — 5-hour and weekly windows, plan, MCP
 *   - `kimi`      Kimi Coding Plan — 5-hour and weekly windows, membership
 *   - `deepseek`  pay-as-you-go balance — currency, granted, topped up
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

/** Per-request network timeout for one probe. */
export const DEFAULT_TIMEOUT_MS = 15_000

/** How long one reading is served before the next probe. */
export const DEFAULT_TTL_MS = 300_000

/** Provider-specific endpoints (the community-verified console APIs). */
export const PROBE_URLS = {
  zhipu: 'https://open.bigmodel.cn/api/monitor/usage/quota/limit',
  kimi: 'https://api.kimi.com/coding/v1/usages',
  deepseek: 'https://api.deepseek.com/user/balance',
}

/** Probe families this plugin knows how to read. */
export const PROBE_IDS = ['zhipu', 'kimi', 'deepseek']

/** Human labels per probe (the panel localizes; these serve logs/tools). */
export const PROBE_LABELS = {
  zhipu: '智谱 GLM',
  kimi: 'Kimi',
  deepseek: 'DeepSeek',
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
 * Bounded JSON fetch: aborts after `timeoutMs`, rejects non-2xx with the
 * status and a short body excerpt, and rejects non-JSON bodies.
 * @param url - absolute request URL.
 * @param init - fetch init plus { timeoutMs }.
 * @returns the parsed JSON body.
 */
export async function fetchJson(url, init = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...rest, signal: controller.signal })
    const text = await response.text()
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

// ---- Kimi: Coding Plan windows --------------------------------------------

const FIVE_HOURS_SECONDS = 5 * 3600
const WEEK_SECONDS = 7 * 86400

function toFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

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
 * Parse `GET /api/monitor/usage/quota/limit`. Token-limit rows are ordered by
 * their reset time: the earlier one is the 5-hour window, the later the weekly.
 * @param raw - the response body.
 * @returns { plan, fiveHour, weekly, mcp? }.
 */
export function parseZhipu(raw) {
  if (raw?.success === false || (raw?.code !== undefined && raw.code !== 200)) {
    throw new Error(`Zhipu API error: ${raw?.msg ?? `code=${raw?.code}`}`)
  }
  const limits = Array.isArray(raw?.data?.limits) ? raw.data.limits : []
  const tokenLimits = limits.filter((limit) => limit?.type === 'TOKENS_LIMIT')
  const sorted = [...tokenLimits].sort((left, right) => zhipuResetToMillis(left.nextResetTime) - zhipuResetToMillis(right.nextResetTime))
  const timeLimit = limits.find((limit) => limit?.type === 'TIME_LIMIT')
  const quota = {
    plan: raw?.data?.level ?? 'unknown',
    fiveHour: zhipuWindow(sorted[0]),
    weekly: zhipuWindow(sorted[1]),
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
  deepseek: { url: PROBE_URLS.deepseek, fetch: probeDeepseek },
}

// ---- route classification --------------------------------------------------

/** Hostnames that identify a vendor's endpoint, in probe order. */
const HOST_RULES = [
  { probe: 'zhipu', hosts: ['bigmodel.cn', 'z.ai'] },
  { probe: 'kimi', hosts: ['kimi.com'] },
  { probe: 'deepseek', hosts: ['deepseek.com'] },
]

/** Route-id keywords, for a route whose baseURL names no known host. */
const ID_RULES = [
  { probe: 'zhipu', words: ['zai', 'zhipu', 'glm', 'bigmodel'] },
  { probe: 'kimi', words: ['kimi'] },
  { probe: 'deepseek', words: ['deepseek'] },
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
 * The endpoint host decides first (a route id is free-form), then the id's
 * keywords — so `zai-coding-cn` with a `bigmodel.cn` baseURL and a gateway
 * aliased `glm-proxy` both land on the Zhipu probe.
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
  }
  const id = String(route ?? '').toLowerCase()
  for (const rule of ID_RULES) {
    if (rule.words.some((word) => id.includes(word))) return rule.probe
  }
  return undefined
}

/**
 * Turn the deployment's configured routes into quota targets.
 * @param sources - { piAi, deepseek, overrides }: the resolved `llm-pi-ai`
 *   settings section (its `providers` dict), the resolved `llm-deepseek`
 *   section, and per-route config overrides.
 * @returns [{ route, probe, credentialRef?, label? }] — routes no probe can
 *   answer for, and routes already covered, are omitted.
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
    targets.push({
      route,
      probe,
      ...(typeof credentialRef === 'string' && credentialRef !== '' ? { credentialRef } : {}),
      ...(label === undefined ? {} : { label }),
      ...(typeof override.url === 'string' && override.url !== '' ? { url: override.url } : {}),
    })
  }
  for (const [route, profile] of Object.entries(sources.piAi?.providers ?? {})) add(route, profile)
  // The official DeepSeek route is mounted by the base layer, so it appears
  // only once its settings namespace resolves — a deployment that replaced
  // that adapter shows no card for it rather than an unconfigured one.
  if (sources.deepseek !== undefined) add(DEEPSEEK_ROUTE, sources.deepseek)
  return targets
}

// ---- probing + TTL cache ---------------------------------------------------

/**
 * Read one target, never throwing: a missing credential, a provider failure,
 * and a parser complaint all become an `ok: false` reading that names the
 * route, so one broken vendor cannot hide the others.
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
      error: target.credentialRef === undefined ? 'no credential reference on this route' : `no value for ${target.credentialRef}`,
    }
  }
  try {
    const data = await probe.fetch(target.apiKey, target.url ?? probe.url, timeoutMs)
    return { ...base, ok: true, fetchedAt: Date.now(), stale: false, data }
  } catch (error) {
    return { ...base, ok: false, reason: 'error', error: error instanceof Error ? error.message : String(error) }
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
 * @param options - { ttlMs, timeoutMs, now, probe } (the last two injectable).
 * @returns { load(targets, { force }), clear() }.
 */
export function createQuotaCache(options = {}) {
  const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : DEFAULT_TTL_MS
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS
  const now = typeof options.now === 'function' ? options.now : Date.now
  const probe = typeof options.probe === 'function' ? options.probe : probeTarget
  const cached = new Map()

  const refresh = async (target) => {
    const previous = cached.get(target.route)
    const result = await probe(target, timeoutMs)
    cached.set(target.route, { at: now(), result: degradeToStale(result, previous?.result) })
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
        const entry = cached.get(target.route)
        return entry === undefined || now() - entry.at >= ttlMs
      })
      await Promise.all(due.map(refresh))
      const quotas = []
      for (const target of targets) {
        const entry = cached.get(target.route)
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
