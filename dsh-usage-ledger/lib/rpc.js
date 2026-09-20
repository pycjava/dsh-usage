/**
 * Pure payload handling for the /usage-ledger RPC channel (the browser
 * panel's data path). No harness imports — testable standalone.
 *
 * @module dsh-usage-ledger/rpc
 */

import { buildDashboard } from './dashboard.js'
import { parsePeriod } from './ledger.js'

/**
 * Business-failure branch of the Connection RPC envelope. The host wire
 * schema requires `details` on every RpcError and only admits codes from its
 * closed table; `bad-request` carries the (possibly empty) issue list.
 */
export function badRequest(message) {
  return { ok: false, error: { code: 'bad-request', message, details: { issues: [] } } }
}

/**
 * Build the dashboard payload (the settings panel's sole request): period
 * summary + activity heatmap + daily stacked-by-model trend. Entries come
 * from the ledger query; the all-time window feeds the streak and heatmap.
 * @param payload - { period? } from the browser (default '30d').
 * @param query - the ledger query (UsageLedgerService#query).
 * @param now - current epoch millis (injectable for tests).
 * @returns { ok: true, value } or { ok: false, error: { code, message } }.
 */
export function runDashboardQuery(payload, query, now = Date.now()) {
  const period = parsePeriod(typeof payload?.period === 'string' ? payload.period : '30d', now)
  if (!period.ok) return badRequest(period.error)
  const periodEntries = query({ from: period.from, to: period.to, by: 'model' }).entries
  const allTimeEntries = query({ from: 0, to: period.to, by: 'model' }).entries
  const value = {
    label: period.label,
    ...buildDashboard(periodEntries, { from: period.from, to: period.to, now, allTimeEntries }),
  }
  return { ok: true, value }
}

/**
 * Build the provider-quota payload — the panel's second, independent request.
 *
 * Quota reads are live (they may cross the network) and that is exactly why
 * they get their own endpoint: a slow or broken vendor must never delay or
 * fail the usage dashboard rendered beside them. Individual vendors fail
 * inside the payload (`ok: false`) rather than as a channel error, so one
 * broken route cannot blank out the others.
 * @param payload - { force? } from the browser (the panel's refresh button).
 * @param loadQuotas - the ledger service's quota read.
 * @returns { ok: true, value: { quotas } } or a bad-request envelope.
 */
export async function runQuotaQuery(payload, loadQuotas) {
  try {
    return { ok: true, value: await loadQuotas({ force: payload?.force === true }) }
  } catch (error) {
    return badRequest(`quota read failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
