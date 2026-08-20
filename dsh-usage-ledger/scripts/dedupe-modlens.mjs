#!/usr/bin/env node
/**
 * One-time cleanup: drop the duplicated `modlens-*` / `deepseek-modlens`
 * facade entries left in the ledger by pre-fix double-recording.
 *
 * Why this exists
 * ---------------
 * Before dsh-usage-ledger tracked innermost delegation (see lib/nesting.js),
 * every call through a modlens `(modlens vision)` wrapper was recorded TWICE:
 * once under the facade provider (e.g. `modlens-volce`) and once under the
 * real upstream provider (e.g. `volce`) — the same physical call, the same
 * usage chunk, ~0 ms apart. That inflated every total in 数据与统计.
 *
 * This script deletes the facade rows and keeps the real upstream rows, so
 * the ledger shows each physical call exactly once. It never touches plain
 * (non-modlens) rows.
 *
 * Usage
 * -----
 *   node scripts/dedupe-modlens.mjs                    # dedupe this machine's ledger
 *   node scripts/dedupe-modlens.mjs <db-path>          # dedupe an explicit ledger file
 *   node scripts/dedupe-modlens.mjs --dry-run          # preview only, change nothing
 *   node scripts/dedupe-modlens.mjs --delete-unmatched # also drop facades with no twin
 *   node scripts/dedupe-modlens.mjs --help
 *
 * Safety
 * ------
 * - A timestamped backup of the SQLite file is written beside it before any
 *   change (passive WAL checkpoint first, so the backup is complete).
 * - Best run while DSH is stopped, so the WAL is quiescent and the snapshot
 *   is consistent.
 * - Facade rows without a matching upstream twin are reported and KEPT by
 *   default; pass `--delete-unmatched` to remove them too.
 */

import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

/** Facade provider ids the modlens wrapper mints (auto-discovery + legacy). */
const FACADE = /^(deepseek-modlens$|modlens-)/
/** Twin facade/upstream rows are recorded ~0 ms apart; 1 s is plenty and tight. */
const TIME_TOLERANCE_MS = 1000

const args = process.argv.slice(2)
let dbArg
const opts = { dryRun: false, deleteUnmatched: false }
for (const arg of args) {
  if (arg === '--dry-run') opts.dryRun = true
  else if (arg === '--delete-unmatched') opts.deleteUnmatched = true
  else if (arg === '--help' || arg === '-h') { printUsage(); process.exit(0) }
  else if (arg.startsWith('-')) { console.error(`unknown option: ${arg}`); printUsage(); process.exit(2) }
  else dbArg = arg
}

function printUsage() {
  console.log(`dedupe-modlens: drop duplicated modlens facade rows from the usage ledger.

Usage:
  node scripts/dedupe-modlens.mjs [db-path] [options]

Options:
  --dry-run            preview what would be deleted; change nothing
  --delete-unmatched   also delete facade rows that have no upstream twin
  --help               show this help

Default db-path: $DSH_HOME/storages/usage-ledger.sqlite
                 (or ~/.dsh/storages/usage-ledger.sqlite).

A timestamped backup is written beside the db before any change.`)
}

function defaultLedgerPath() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'storages', 'usage-ledger.sqlite')
}

function main() {
  const dbPath = resolve(dbArg ?? defaultLedgerPath())
  if (!existsSync(dbPath)) {
    console.error(`ledger not found: ${dbPath}`)
    process.exit(1)
  }

  let db
  try {
    db = new DatabaseSync(dbPath)
    db.exec('PRAGMA busy_timeout = 5000')
    // Fold the WAL into the main file so the backup and the reads see everything.
    db.exec('PRAGMA wal_checkpoint(PASSIVE)')

    const all = db.prepare('SELECT id, time, json FROM entries').all()
    const parse = (row) => { try { return JSON.parse(row.json) } catch { return null } }
    const tokensOf = (e) => (e.inputTokens ?? 0) + (e.cacheReadTokens ?? 0)
      + (e.cacheWriteTokens ?? 0) + (e.outputTokens ?? 0) + (e.reasoningTokens ?? 0)

    const facade = []
    const plain = []
    for (const row of all) {
      const e = parse(row)
      if (e === null) continue
      ;(FACADE.test(e.provider ?? '') ? facade : plain).push({ row, e })
    }

    // Index upstream (plain) rows by sessionId|model|totalTokens so each
    // facade can be paired with its real upstream twin.
    const plainIndex = new Map()
    for (const p of plain) {
      const key = `${p.e.sessionId ?? '-'}|${p.e.model ?? '-'}|${tokensOf(p.e)}`
      if (!plainIndex.has(key)) plainIndex.set(key, [])
      plainIndex.get(key).push(p)
    }

    const toDelete = []
    const unmatched = []
    const claimed = new Set()
    for (const f of facade) {
      const key = `${f.e.sessionId ?? '-'}|${f.e.model ?? '-'}|${tokensOf(f.e)}`
      const twin = (plainIndex.get(key) ?? []).find(
        (p) => !claimed.has(p.row.id) && Math.abs(p.row.time - f.row.time) <= TIME_TOLERANCE_MS,
      )
      if (twin) {
        claimed.add(twin.row.id)
        toDelete.push(f.row.id)
      } else {
        unmatched.push(f)
      }
    }

    const tokensUnder = (list) => list.reduce((sum, f) => sum + tokensOf(f.e), 0)
    console.log(`ledger: ${dbPath}`)
    console.log(`rows total: ${all.length} | facade (modlens-*): ${facade.length} | upstream: ${plain.length}`)
    console.log(`facade rows with an upstream twin (will delete): ${toDelete.length}`)
    console.log(`facade rows without a twin (${opts.deleteUnmatched ? 'will delete' : 'KEPT'}): ${unmatched.length}`)
    if (unmatched.length > 0) {
      for (const f of unmatched.slice(0, 10)) {
        console.log(`  ! ${new Date(f.row.time).toISOString()} ${f.e.provider} ${f.e.model ?? ''} tokens=${tokensOf(f.e)} session=${f.e.sessionId ?? '-'}`)
      }
      if (unmatched.length > 10) console.log(`  … and ${unmatched.length - 10} more`)
    }
    console.log(`tokens under facade rows: ${tokensUnder(facade)}`)

    if (opts.dryRun) {
      console.log('dry-run: no changes made.')
      return
    }
    if (toDelete.length === 0 && unmatched.length === 0) {
      console.log('nothing to clean.')
      return
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = join(dirname(dbPath), `${basename(dbPath)}.bak-${stamp}`)
    copyFileSync(dbPath, backupPath)
    console.log(`backup: ${backupPath}`)

    const remove = db.prepare('DELETE FROM entries WHERE id = ?')
    let removed = 0
    for (const id of toDelete) { remove.run(id); removed++ }
    if (opts.deleteUnmatched) {
      for (const f of unmatched) { remove.run(f.row.id); removed++ }
    }
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')

    const remaining = db.prepare('SELECT COUNT(*) AS n FROM entries').get().n
    console.log(`deleted ${removed} facade row(s); ${remaining} rows remain.`)
    console.log('restart DSH (web profile) so the in-memory ledger picks up the change.')
  } catch (error) {
    if (db !== undefined) { try { db.close() } catch {} }
    console.error('无法清理账本:' + (error instanceof Error ? error.message : String(error)))
    console.error('最常见原因是 DSH(DeepSeek Harness)仍在运行并占用该 SQLite 文件。')
    console.error('请先完全退出 DSH,再重新运行本脚本。')
    process.exit(1)
  } finally {
    if (db !== undefined) { try { db.close() } catch {} }
  }
}

main()
