/**
 * Pure payload handling for the panel's data path (the browser 数据与统计
 * section). No harness imports — testable standalone.
 *
 * The browser calls arrive as Connection RPC envelopes over exact Fetch
 * routes under `/api/usage-ledger/*` (inside the shared channel's
 * authentication fence); `envelopeFetchHandler` adapts one payload handler
 * to that wire shape.
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
 * Adapt one payload handler to a Connection exact-Fetch-route handler: the
 * browser's `rpc.call('/api', endpoint)` POSTs a client-request envelope to
 * the route path, so the route must unwrap the envelope, run the handler,
 * and reply with the matching server-response envelope (HTTP stays 200;
 * business failures ride the envelope, mirroring rpcFetchHandler).
 * @param run - (payload) => result envelope or a promise of one.
 * @returns Fetch handler for `connection.fetch.register`.
 */
export function envelopeFetchHandler(run) {
  return async (request) => {
    let message
    try {
      message = await request.json()
    } catch {
      return new Response('body is not JSON', { status: 400 })
    }
    const rpcId = typeof message?.rpcId === 'string' ? message.rpcId : 'invalid-request'
    const reply = (result) => Response.json({ type: 'server-response', rpcId, result })
    if (message?.type !== 'client-request') {
      return reply({ ok: false, error: { code: 'bad-request', message: 'invalid client-request message', details: { issues: [] } } })
    }
    try {
      return reply(await run(message.payload))
    } catch (error) {
      return new Response(`handler failure: ${String(error)}`, { status: 500 })
    }
  }
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
