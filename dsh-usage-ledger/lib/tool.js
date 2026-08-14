/**
 * The model-facing `usage_stats` tool over the usageLedger service, so an
 * agent can answer "how many tokens did we use this month" directly from the
 * durable ledger.
 *
 * Mounted by the `usage-ledger-tool` row (`dsh-usage-ledger/tool`).
 *
 * @module dsh-usage-ledger/tool
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { parsePeriod } from './ledger.js'
import { renderTextReport } from './report.js'

export const name = 'usage-ledger-tool'
export const inject = ['tools', 'usageLedger']

const TEXT_OUTPUT = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: value }],
}

export function apply(ctx) {
  const tool = defineTool({
    name: 'usage_stats',
    description:
      'Read aggregated LLM token usage for this machine across all sessions: totals and a '
      + 'breakdown by model, provider, day, or session for a given period. Provider-reported '
      + 'usage is preferred; heuristic estimates (if enabled) are marked separately.',
    parameters: {
      period: {
        type: 'string',
        description:
          "Period to report: 'this-month' (default), 'today', '7d', '30d', 'Nd', "
          + "'YYYY-MM', 'YYYY-MM..YYYY-MM', or 'all'.",
      },
      by: {
        type: 'string',
        enum: ['model', 'provider', 'day', 'session'],
        description: 'Breakdown dimension. Default: model.',
      },
      include_replayed: {
        type: 'boolean',
        description: 'Include replayed (cached) calls in totals. Default: false.',
      },
    },
    output: TEXT_OUTPUT,
    execute: (args) => {
      const period = parsePeriod(args.period ?? 'this-month', Date.now())
      if (!period.ok) throw new Error(period.error)
      const result = ctx.usageLedger.query({
        from: period.from,
        to: period.to,
        by: args.by ?? 'model',
        includeReplayed: args.include_replayed === true,
      })
      return renderTextReport({ ...result, label: period.label })
    },
  })
  ctx.effect(() => ctx.tools.register(tool), 'usage-ledger: usage_stats tool')
}
