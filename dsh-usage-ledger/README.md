# dsh-usage-ledger

Cross-session LLM **token-usage accounting** for DeepSeek Harness, as a
**dual-face plugin package**: a host half (Node) that keeps the ledger, and
a browser half that adds a 数据与统计 (Data & Usage) section to the web
client's Settings panel. It fills the gap the base harness deliberately
leaves open: **how many tokens did I use — across every session, model, and
provider?** No pricing, no currency — just an honest token ledger.

## What it does

- **Records every model call in the process** through the `llm/stream`
  waterfall — agent turns, subagents, session titles, compaction summaries.
  One ledger entry per call that reports provider usage
  (`inputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `outputTokens`,
  `reasoningTokens`), stamped with provider, model, session id, and purpose.
- **Reported first, estimates flagged**: provider-reported usage is recorded
  as-is. With `estimateFallback` enabled (off by default), usage-less calls
  are priced with the token-meter's fixed heuristic and stamped `estimated`
  — reported and estimated figures are always shown separately.
- **Durable across restarts and sessions**: entries persist in the plugin's
  own SQLite file (`node:sqlite`, WAL mode) at
  `$DSH_HOME/storages/usage-ledger.sqlite`. No storage-hub dependency, so the
  ledger works identically in web, headless, and TUI profiles. If the store
  cannot open, the ledger degrades to an in-process record.
- **`usage_stats` agent tool** — the model can answer "how many tokens did we
  use this month?" from the same durable ledger (monospace text report).
- **数据与统计 settings panel** — a dashboard section in the web client's
  Settings (App GUI): a time-range toggle (last 7d / last 30d) with a manual
  refresh button, six summary cards (tokens used, sessions, calls, active
  days, current streak, top model with its share), a GitHub-style activity
  heatmap (last 53 weeks, cells shaded by daily tokens), and a daily token
  trend chart with stacked per-model bars. Zero harness changes: the panel
  registers into the open `settings.section` slot and pulls aggregates over
  the plugin's own loopback RPC channel.

## Package layout

```
cordis.patch.yml      bundle patch: two rows (usage-ledger, usage-ledger-tool)
lib/                  host half (plain ESM, no build) + the prebuilt client bundle
  index.js            UsageLedgerService: capture, store, RPC channel
  rpc.js              pure payload handling for the /usage-ledger channel
  tool.js             the usage_stats agent tool (host)
  client.js(.map)     browser half, built from src/client (see Build)
src/client/           browser-half sources (TS/TSX + CSS Modules)
tsdown.config.ts      client-bundle build (mirrors the harness preset)
test/smoke.mjs        standalone smoke test for the pure modules
```

## How the two halves load

- The bundle patch inserts two rows. `usage-ledger` (bare package name)
  carries the host half — and is exactly the loader entry the harness
  client-module system scans: because `package.json` declares
  `dsh.client: { platform: 'web', inject: [...] }` and exports
  `"./client" → ./lib/client.js`, the prebuilt browser bundle joins
  `window.__DSH_BOOT__` automatically and is served at
  `/plugins/dsh-usage-ledger/client.js`.
- `usage-ledger-tool` (subpath row) mounts the `usage_stats` tool; delete
  that row to hide the tool from agents — the ledger and the settings panel
  are unaffected.
- The browser half's `apply(ctx)` registers its `zh`/`en` dictionaries and
  one entry in the `settings.section` list slot (id `usage`, label
  数据与统计), carrying the section's own line-chart nav glyph through the
  `icon` registration option. The settings shell renders a registrant-supplied
  `icon` ahead of its id→glyph map, so the icon ships with the plugin instead
  of living in the shell.
- Data path: the host half (when a `connection` service exists — web
  profiles) registers a private RPC channel with
  `ctx.connection.rpc.handle('/usage-ledger', …, { authority: 'loopback' })`;
  the panel calls it with `ctx.connection.rpc.call`. The sole endpoint
  `dashboard` takes `{ period }` and returns dashboard aggregates only (the
  raw entry list never leaves the host). Headless/TUI profiles never register
  the channel and are otherwise unaffected.

## Build

The host half ships as plain source (no build step). The browser half must
be **prebuilt** before packing:

```sh
npm install       # dev deps: tsdown, lightningcss, react (types/external)
npm run build     # tsdown → lib/client.js + lib/client.js.map
npm test          # standalone smoke test (pure modules, no harness needed)
npm pack          # → dsh-usage-ledger-<version>.tgz
```

The tsdown config mirrors the harness preset
(`packages/client/tsdown.client.ts`): a closure-factory CJS artifact that
hands itself to `window.__ModuleLoader__.load({ id, factory })`, externals
limited to the frozen platform-module table (react and friends), and CSS
Modules compiled by lightningcss into injected `<style data-plugin>` tags.

## Install

```sh
dsh plugin --profile web add ./dsh-usage-ledger-<version>.tgz
# optional: also for one-shot runs
dsh plugin --profile headless add ./dsh-usage-ledger-<version>.tgz
```

The bundle declares `dsh.bundle.patch`, so `dsh` appends it to the profile's
bundle list automatically. Verify with `dsh --profile web --dump-config`,
then restart the running app — host plugins and client modules load at
boot.

## The settings nav icon (为什么别人装上也应显示折线图)

The 「数据与统计」nav glyph is registered by the plugin itself: the
`settings.section` entry carries `icon` (a line-chart element, see
`src/client/index.ts`). Whether that glyph actually renders depends on the
harness shell:

- **Harness that supports the `icon` option (upstream feature, see
  `docs/settings-section-icon-upstream.md`)** — the shell renders the
  registrant's icon ahead of its id map, so **every install shows the
  line-chart glyph automatically**. This is the durable fix: submit that
  small change upstream so a DSH release ships it; then nothing else is
  needed on any machine.
- **Older prebuilt harness (e.g. 0.1.0-rc.6)** — the shell maps icons by
  `id` and drops unknown registration options, so the gear shows. For those
  installs the stopgap is a one-time shell patch:

  ```sh
  node node_modules/dsh-usage-ledger/scripts/patch-settings-icon.mjs
  ```

  It inserts the `usage` → line-chart branch into the installed shell's
  `navIcon()` (idempotent; a marker makes re-runs a no-op). It is a
  **stopgap**: it edits the installed harness's own files, depends on the
  harness's bundle shape, and is lost on harness updates — prefer shipping
  the upstream feature over relying on it.

## Usage

In the App client: **Settings → 数据与统计** — a usage dashboard with a
time-range toggle (last 7d / last 30d), summary cards (tokens, sessions,
calls, active days, current streak, top model), an activity heatmap, and a
daily token trend stacked by model.

From a conversation, the `usage_stats` agent tool answers questions directly:

```
"这个月用了多少 token?"          → this-month totals + by-model report
"最近 7 天按天看看用量"           → last 7 days, daily rows
"按提供方统计一下"                → by-provider breakdown
```

Tool parameters: `period` (this-month | today | 7d | 30d | Nd | YYYY-MM |
YYYY-MM..YYYY-MM | all) and `by` (model | provider | day | session).

## Configuration

Edit the `usage-ledger` row's config in a patch layer — for example the
profile's `cordis.patch.yml` at `$DSH_HOME/profiles/web/cordis.patch.yml`:

```yaml
- id: usage-ledger
  config:
    estimateFallback: false  # heuristic tokens for calls without provider usage
    retentionDays: 0         # 0 = keep forever; N = drop entries older than N days
    flushIntervalMs: 5000    # durability latency for buffered entries
    flushEveryEntries: 32    # flush early once this many entries are buffered
    maxMemoryEntries: 200000 # in-memory cap when the store cannot open
```

## How it works

1. The `usage-ledger` row loads a `Service` (`ctx.usageLedger`) that
   registers on the `llm/stream` waterfall. Every model call in the process
   crosses it; the wrapper passes chunks through untouched and records an
   entry when the stream reports a `usage` chunk with at least one nonzero
   token count. Failed calls (no usage chunk, or an all-zero usage from the
   error path) never inflate the ledger. The finish chunk's `replayState` is
   deliberately ignored: it is provenance metadata present on every pi-ai
   completion, not a replay signal.
2. At load the service opens (or creates) its SQLite database at
   `$DSH_HOME/storages/usage-ledger.sqlite` and loads stored entries.
   Entries buffer in memory and flush on a timer, on a batch threshold, and
   on shutdown. A failed flush keeps the batch buffered and retries — no
   silent loss.
3. The `usage_stats` tool aggregates the durable + pending entries for the
   requested period. The settings panel does the same over the
   `/usage-ledger` RPC channel.

## Requirements

- Node ≥ 22.5 at runtime (`node:sqlite`; every harness profile already
  carries an `node:sqlite` consumer, so the runtime is guaranteed).
- A harness whose base layer exposes the `llm/stream` waterfall and the
  `tokenMeter` service (0.1.0-rc.5-era releases).
- The settings panel needs a web profile (the App client); other profiles
  simply skip the browser half and the RPC channel.
- The harness packages the plugin imports (`@deepseek-ai/cordis`,
  `@deepseek-ai/schemastery`, `@deepseek-ai/dsh-tools`) resolve through the
  profile's node_modules fallback links, which the harness heals at boot.

## Limitations

- Calls made in **worker threads or separate processes** (e.g. workflow
  worker threads, other `dsh` instances) are outside this process's
  `llm/stream` waterfall. One host process = one ledger file; multiple
  harness instances should use separate `$DSH_HOME`s or share the ledger via
  a network store.
- **All-zero usage calls** (error-path completions) are not recorded, and
  query-time filtering drops any legacy zero rows, so call counts and token
  totals always agree on what is billable.
- Estimates are heuristics (chars/4 density), never provider numbers; they
  stay marked `estimated` in every surface.
- The Settings nav entry registers its own line-chart glyph through the
  `icon` option on the `settings.section` registration, so the icon is owned
  by the plugin (it ships in the tarball). The harness shell must render a
  registrant-supplied `icon` ahead of its id map — the small shell feature
  `settings.section` gains once the `icon` slot option and nav rendering are
  merged upstream; shells without it fall back to the gear glyph.
- This is the **first third-party `dsh.client` package**: the scan-over-all-
  entries mechanism is verified against the harness sources, but expect to
  be off the beaten path.
