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
import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Best-effort permission tightening: the ledger is one user's usage metadata
 * (which models, when, how much, which sessions), so the store is readable
 * by its owner alone. Filesystems that reject chmod (some network mounts)
 * must not take the store down with them, hence the swallowed error.
 */
function restrict(path, mode) {
  try { chmodSync(path, mode) } catch {}
}

/**
 * Open (or create) the ledger database at `path`.
 * @param path - absolute database file path.
 * @returns a synchronous store handle; the caller owns its lifecycle.
 */
export function openLedgerStore(path) {
  const directory = dirname(path)
  const directoryCreated = !existsSync(directory)
  mkdirSync(directory, { recursive: true })
  // A directory this store created is private to this user; one it merely
  // shares (the harness's own storages tree) keeps whatever its owner chose.
  if (directoryCreated) restrict(directory, 0o700)
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, time INTEGER NOT NULL, json TEXT NOT NULL)')
  db.exec('CREATE INDEX IF NOT EXISTS entries_time ON entries (time)')
  restrict(path, 0o600)
  const insert = db.prepare('INSERT OR REPLACE INTO entries (id, time, json) VALUES (?, ?, ?)')
  const remove = db.prepare('DELETE FROM entries WHERE id = ?')
  const prune = db.prepare('DELETE FROM entries WHERE time < ?')
  const selectAll = db.prepare('SELECT id, json FROM entries')
  // SQLite may create -wal/-shm at open (the WAL pragma does) or lazily on
  // first write, and can recreate them after a checkpoint or close. They
  // carry ledger rows too, so chmod best-effort at open AND on every put —
  // two cheap syscalls next to the insert, and no recreation window sits at
  // umask permissions.
  const restrictSidecars = () => {
    restrict(`${path}-wal`, 0o600)
    restrict(`${path}-shm`, 0o600)
  }
  restrictSidecars()
  return {
    /** Insert or replace one entry. */
    put(id, time, entry) {
      insert.run(id, time, JSON.stringify(entry))
      restrictSidecars()
    },
    /** Delete one entry by id (retention). */
    delete(id) {
      remove.run(id)
    },
    /** Delete every entry older than `cutoff`; returns the deleted count. */
    pruneBefore(cutoff) {
      return prune.run(cutoff).changes
    },
    /** Load every readable stored entry into a fresh Map, skipping (and counting) corrupt rows. */
    loadAll() {
      const records = new Map()
      let corrupt = 0
      for (const row of selectAll.all()) {
        try {
          records.set(row.id, JSON.parse(row.json))
        } catch {
          corrupt += 1
        }
      }
      return { records, corrupt }
    },
    close() {
      db.close()
    },
  }
}
