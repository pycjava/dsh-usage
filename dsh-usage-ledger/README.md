# dsh-usage-ledger

Cross-session LLM **token-usage accounting** for DeepSeek Harness. It fills
the gap the base harness deliberately leaves open: **how many tokens did I
use — across every session, model, and provider?** No pricing, no currency —
just an honest token ledger.

- **Records every model call in the process** through the `llm/stream`
  waterfall — agent turns, subagents, session titles, compaction summaries.
  One ledger entry per call that reports provider usage
  (`inputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `outputTokens`,
  `reasoningTokens`), stamped with provider, model, session id, and purpose.
- **Reported first, estimates flagged**: provider-reported usage is recorded
  as-is. With `estimateFallback` enabled, usage-less calls are priced with
  the token-meter's fixed heuristic and stamped `estimated` — reported and
  estimated figures are always shown separately.
- **Durable across restarts and sessions**: entries persist in the plugin's
  own SQLite file (`node:sqlite`, WAL mode) at
  `$DSH_HOME/storages/usage-ledger.sqlite`. No storage-hub dependency, so the
  ledger works identically in web, headless, and TUI profiles. If the store
  cannot open, the ledger degrades to an in-process record.
- **`/usage` command** — a one-line summary plus a monospace report: totals,
  reported/estimated split, by-model / by-provider / by-day / by-session
  breakdowns, and JSON/CSV export.
- **`usage_stats` agent tool** — the model can answer "how many tokens did we
  use this month?" from the same durable ledger.

## Install

```sh
dsh plugin --profile web add ./dsh-usage-ledger-0.1.0.tgz
# optional: also for one-shot runs
dsh plugin --profile headless add ./dsh-usage-ledger-0.1.0.tgz
```

The bundle declares `dsh.bundle.patch`, so `dsh` appends it to the profile's
bundle list automatically. Verify with `dsh --profile web --dump-config`,
then restart the running app (host plugins load at boot).

## Usage

```
/usage                          this month: totals + by-model table
/usage 7d                       last 7 days
/usage 2026-07                  one calendar month
/usage 2026-06..2026-08         a month range (inclusive)
/usage all --by day             everything, daily rows
/usage --by provider            by provider instead of model
/usage --by session             which sessions used the most tokens
/usage --json usage.json        export raw entries (JSON)
/usage --csv usage.csv          export the breakdown (CSV)
/usage --include-replayed       also count replayed (cached) calls
```

Exports are written into the current session's workspace directory (or the
process cwd outside a session).

## Configuration

Edit the `usage-ledger` row's config in a patch layer — for example the
profile's `cordis.patch.yml` at `$DSH_HOME/profiles/web/cordis.patch.yml`:

```yaml
- id: usage-ledger
  config:
    estimateFallback: true   # heuristic tokens for calls without provider usage
    retentionDays: 0         # 0 = keep forever; N = drop entries older than N days
    flushIntervalMs: 5000    # durability latency for buffered entries
    flushEveryEntries: 32    # flush early once this many entries are buffered
```

## How it works

1. The `usage-ledger` row loads a `Service` (`ctx.usageLedger`) that
   registers on the `llm/stream` waterfall. Every model call in the process
   crosses it; the wrapper passes chunks through untouched and records an
   entry when the stream reports a `usage` chunk. Failed calls (no usage
   chunk) never inflate the ledger; `finish.replayState` marks replayed
   responses, excluded from totals unless `--include-replayed`.
2. At load the service opens (or creates) its SQLite database at
   `$DSH_HOME/storages/usage-ledger.sqlite` and loads stored entries.
   Entries buffer in memory and flush on a timer, on a batch threshold, and
   on shutdown. A failed flush keeps the batch buffered and retries — no
   silent loss.
3. The `/usage` command and the `usage_stats` tool aggregate the durable +
   pending entries for the requested period.

## Requirements

- Node ≥ 22.5 at runtime (`node:sqlite`; every harness profile already
  carries an `node:sqlite` consumer, so the runtime is guaranteed).
- A harness whose base layer exposes the `llm/stream` waterfall and the
  `tokenMeter` service (0.1.0-rc.5-era releases).
- The harness packages the plugin imports (`@deepseek-ai/cordis`,
  `@deepseek-ai/schemastery`, `@deepseek-ai/dsh-tools`) resolve through the
  profile's node_modules fallback links, which the harness heals at boot.

## Limitations

- Calls made in **worker threads or separate processes** (e.g. workflow
  worker threads, other `dsh` instances) are outside this process's
  `llm/stream` waterfall. One host process = one ledger file; multiple
  harness instances should use separate `$DSH_HOME`s or share the ledger via
  a network store.
- **Replayed responses** (provider-side cache replays, e.g. pi-ai replay
  state) are excluded from totals by default because their billable original
  was recorded when it first ran. If the original ran before this plugin was
  installed, the tokens exist only on the replayed copies — pass
  `--include-replayed` to surface them.
- Estimates are heuristics (chars/4 density), never provider numbers; they
  stay marked `estimated` in every surface.
