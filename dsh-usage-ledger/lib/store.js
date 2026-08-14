/**
 * Own SQLite ledger store (node:sqlite) — no storage hub dependency, so the
 * ledger persists identically in web, headless, and TUI profiles.
 *
 * One table: entries(id TEXT PRIMARY KEY, time INTEGER, json TEXT).
 * WAL mode keeps short write bursts cheap and lets a second reader coexist.
 *
 * @module dsh-usage-ledger/store
 */

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Open (or create) the ledger database at `path`.
 * @param path - absolute database file path.
 * @returns a synchronous store handle; the caller owns its lifecycle.
 */
export function openLedgerStore(path) {
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, time INTEGER NOT NULL, json TEXT NOT NULL)')
  db.exec('CREATE INDEX IF NOT EXISTS entries_time ON entries (time)')
  const insert = db.prepare('INSERT OR REPLACE INTO entries (id, time, json) VALUES (?, ?, ?)')
  const remove = db.prepare('DELETE FROM entries WHERE id = ?')
  const prune = db.prepare('DELETE FROM entries WHERE time < ?')
  const selectAll = db.prepare('SELECT id, json FROM entries')
  return {
    /** Insert or replace one entry. */
    put(id, time, entry) {
      insert.run(id, time, JSON.stringify(entry))
    },
    /** Delete one entry by id (retention). */
    delete(id) {
      remove.run(id)
    },
    /** Delete every entry older than `cutoff`; returns the deleted count. */
    pruneBefore(cutoff) {
      return prune.run(cutoff).changes
    },
    /** Load every stored entry into a fresh Map (id -> entry). */
    loadAll() {
      const records = new Map()
      for (const row of selectAll.all()) {
        records.set(row.id, JSON.parse(row.json))
      }
      return records
    },
    close() {
      db.close()
    },
  }
}
