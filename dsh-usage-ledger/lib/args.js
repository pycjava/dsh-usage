/**
 * Argument parsing for the /usage command (pure — no harness imports).
 *
 * @module dsh-usage-ledger/args
 */

const DIMENSIONS = new Set(['model', 'provider', 'day', 'session'])

export const USAGE = `Usage: /usage [period] [options]
  period                            this-month (default) | today | 7d | 30d | Nd | YYYY-MM | YYYY-MM..YYYY-MM | all
  --by model|provider|day|session   breakdown dimension (default: model)
  --include-replayed                include replayed (cached) calls in totals
  --json [file]                     export the period's raw entries as JSON
  --csv [file]                      export the breakdown as CSV`

/**
 * Parse the /usage argument line into one options record.
 * `json`/`csv` are `undefined` when the flag is absent, `null` when present
 * without a path, and the path string otherwise.
 * @param raw - the raw command input after "/usage".
 * @returns { period, by, includeReplayed, json, csv, help, error }
 */
export function parseCommandArgs(raw) {
  const tokens = (raw ?? '').trim().split(/\s+/).filter((token) => token !== '')
  const result = { period: '', by: 'model', includeReplayed: false, json: undefined, csv: undefined, help: false, error: undefined }
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (token === '--help' || token === '-h') {
      result.help = true
      continue
    }
    if (token === '--include-replayed') {
      result.includeReplayed = true
      continue
    }
    if (token === '--by') {
      const value = tokens[++index]
      if (value === undefined || !DIMENSIONS.has(value)) {
        result.error = '--by needs one of: model, provider, day, session'
        return result
      }
      result.by = value
      continue
    }
    if (token === '--json' || token === '--csv') {
      const next = tokens[index + 1]
      const value = next !== undefined && !next.startsWith('--') ? tokens[++index] : null
      result[token.slice(2)] = value
      continue
    }
    if (token.startsWith('--')) {
      result.error = `unknown flag "${token}"`
      return result
    }
    if (result.period === '') {
      result.period = token
    } else {
      result.error = `unexpected argument "${token}" (period already set to "${result.period}")`
      return result
    }
  }
  return result
}
