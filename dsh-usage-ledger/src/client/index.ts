/**
 * Browser half of dsh-usage-ledger: the 数据与统计 settings section.
 *
 * Loaded by the harness client module system (this package declares
 * `dsh.client` and ships a prebuilt `lib/client.js`). Registers one entry
 * into the open `settings.section` list slot; the panel pulls aggregates
 * from the host ledger over the plugin's private loopback RPC channel.
 *
 * @module dsh-usage-ledger/client
 */

import { createElement } from 'react'
import { UsageNavIcon, UsageSection } from './UsageSection.tsx'
import { en, zh } from './locales.ts'
import type { DashboardReport, RpcResult } from './types.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'usage-ledger.settings'

/** Stable nav glyph for the 数据与统计 settings section. The shell renders a
 * registrant-supplied `icon` ahead of its id→glyph map (unknown ids would
 * otherwise fall back to the settings gear). Built once at module scope so
 * the shell's row snapshot keeps a stable element reference. */
const NAV_ICON = createElement(UsageNavIcon, { size: 16 })

/** Minimal client-context face this plugin uses (self-declared). */
interface ClientContext {
  effect(setup: () => unknown, reason?: string): unknown
  locale: {
    register(ns: string, dicts: { zh: Record<string, string>; en: Record<string, string> }): unknown
    bind(ns: string): (key: string, params?: Record<string, string | number>) => string
    getSnapshot(): { active: string }
  }
  connection: {
    rpc: {
      call(channel: string, endpoint: string, payload?: unknown): Promise<RpcResult<DashboardReport>>
    }
  }
  slots: {
    inject(name: string, register: () => unknown): unknown
    register(options: Record<string, unknown>, component: unknown): unknown
  }
}

/** Services required by the settings-section registration. */
export const inject = ['slots', 'locale', 'connection']

/** Contribute the 数据与统计 section to the Settings panel. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'usage-ledger: dictionaries')

  const t = ctx.locale.bind(NS)
  const query = (payload: { period: string }) =>
    ctx.connection.rpc.call('/usage-ledger', 'dashboard', payload)
  const localeId = (): string => ctx.locale.getSnapshot().active

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'usage',
    order: 30, // 排在 agent-presets(order 20) 之后
    label: () => t('nav'),
    icon: NAV_ICON,
    locale: NS,
    inject: () => ({ query, localeId }),
  }, UsageSection))
}
