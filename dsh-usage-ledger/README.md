# dsh-usage-ledger

Cross-session LLM **token-usage accounting** for DeepSeek Harness, as a
**dual-face plugin package**: a host half (Node) that keeps the ledger, and
a browser half that adds a 数据与统计 (Data & Usage) section to the web
client's Settings panel. It fills the gap the base harness deliberately
leaves open: **how many tokens did I use — across every session, model, and
provider?** No pricing, no currency conversion — just an honest token ledger,
beside the allowance each provider reports for itself.

## What it does

- **Records every model call in the process** through the `llm/stream`
  waterfall — agent turns, subagents, session titles, compaction summaries.
  One ledger entry per call that reports provider usage
  (`inputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `outputTokens`,
  `reasoningTokens`), stamped with provider, model, session id, and purpose.
- **Reports live provider allowance** (供应商额度): for every provider route
  the deployment has configured, the panel shows what that vendor says is
  left — 智谱 GLM, Kimi, and OpenAI Codex Coding Plan windows with reset
  countdowns (plus Codex credits/reset credits), and DeepSeek's pay-as-you-go
  balance in its own currency. Zero configuration: routes come from the
  settings tree and credentials from the store the Models page writes. Quotas
  are live reads — never
  ledger entries, never aggregated, never converted into money.
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
  use this month?" from the same durable ledger (monospace text report), and
  "how much allowance is left?" by passing `includeQuotas: true` (that read
  crosses the network).
- **数据与统计 settings panel** — a dashboard section in the web client's
  Settings (App GUI): a time-range toggle (last 7d / last 30d) with a manual
  refresh button, six summary cards (tokens used, sessions, calls, active
  days, current streak, top model with its share), a provider-allowance block
  (one card per configured route: window bars, reset countdowns, plan badge,
  balance), a GitHub-style activity heatmap (last 53 weeks, cells shaded by
  daily tokens), a daily token trend chart with stacked per-model bars, and a
  model-usage share donut (per-model tokens + percentage, long tail folded
  into Other). Zero harness changes: the panel
  registers into the open `settings.section` slot and pulls aggregates over
  the plugin's own loopback RPC channel.

## Package layout

```
cordis.patch.yml      bundle patch: two rows (usage-ledger, usage-ledger-tool)
                      plus a connection-row inject override (see RPC channel)
lib/                  host half (plain ESM, no build) + the prebuilt client bundle
  index.js            UsageLedgerService: capture, store, quota discovery, RPC
  ledger.js           entries, periods, aggregation (pure)
  dashboard.js        panel aggregates (pure)
  rpc.js              pure payload handling for the /usage-ledger channel
  quota.js            provider quota probes: fetch + parse + route matching + TTL cache
  quota-view.js       display math shared by the panel and the report (pure)
  report.js           monospace report + the quota section (host)
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
  the panel calls it with `ctx.connection.rpc.call`. Two endpoints:
  `dashboard`, which takes `{ period }` and returns dashboard aggregates only
  (the raw entry list never leaves the host), and `quotas`, which takes
  `{ force }` and returns live provider allowance readings. They are separate
  on purpose — a quota read crosses the network, and a slow or broken vendor
  must never delay or fail the usage numbers beside it. Individual vendors
  fail *inside* the payload (`ok: false`) so one bad route cannot blank out
  the others. Headless/TUI profiles never register the channel and are
  otherwise unaffected.
- `rpc.handle` quirk (dsh build 2026-09): channel registration resolves
  `webServer` from the connection *service fiber's* context, and that fiber
  only injects `webRuntime` — so every plugin channel registration fails
  silently with `cannot get property "webServer" without inject` and the
  panel's POST falls through to the SPA fallback (HTTP 405). The bundle
  patch therefore re-states the `connection` row with
  `inject: [webRuntime, webServer]` (config passes through untouched;
  profiles without the row warn-and-skip). Drop the override once a dsh
  build resolves `webServer` from the caller's fiber.

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
calls, active days, current streak, top model), a 供应商额度 block (one card
per configured provider route), an activity heatmap, a daily token trend
stacked by model, and a model-usage share donut (per-model tokens +
percentage). The panel's refresh button refreshes both halves: usage
totals and a live allowance read.

From a conversation, the `usage_stats` agent tool answers questions directly:

```
"这个月用了多少 token?"          → this-month totals + by-model report
"最近 7 天按天看看用量"           → last 7 days, daily rows
"按提供方统计一下"                → by-provider breakdown
"智谱、Kimi 和 Codex 额度还剩多少?" → the same report + includeQuotas: true
```

Tool parameters: `period` (this-month | today | 7d | 30d | Nd | YYYY-MM |
YYYY-MM..YYYY-MM | all), `by` (model | provider | day | session), and
`includeQuotas` (default false — the allowance section is only read when the
question asks for it, because that read crosses the network).

## Provider allowance (供应商额度)

Which routes are probed is **discovered, never configured**: the plugin reads
the resolved settings tree — the `llm-pi-ai` provider profiles plus the
built-in `llm-deepseek` route — and probes each route whose family it knows.
API-key routes use their own `apiKeyEnv` reference through the credentials
seam. The native `openai-codex` route instead reads the OAuth grant that the
Models page stores at `llm-pi-ai/openai-codex`; its access token and account id
stay host-side. Add a provider on the Models page and its card appears; remove
it and the card goes.

| Probe | What it reports | Source |
| --- | --- | --- |
| `zhipu` | Coding Plan 5-hour / weekly windows, plan, MCP calls left | `open.bigmodel.cn/api/monitor/usage/quota/limit` (console API, not a public contract) |
| `kimi` | Coding Plan 5-hour / weekly windows, membership, parallel limit | `api.kimi.com/coding/v1/usages` (needs a Kimi Code `sk-kimi-` key) |
| `codex` | ChatGPT Coding Plan 5-hour / weekly / monthly windows, plan, code review, named per-model limits, credits and reset credits | `chatgpt.com/backend-api/wham/usage` (ChatGPT OAuth; not an OpenAI API-key balance) |
| `deepseek` | Pay-as-you-go balance: available, granted, topped up, sufficiency | `api.deepseek.com/user/balance` (official) |

A route is matched to a family by its endpoint host first (`*.bigmodel.cn` /
`*.z.ai`, `*.kimi.com`, `chatgpt.com`, `*.deepseek.com`), then by keywords in
the route id (`zai`, `zhipu`, `glm`, `bigmodel`, `kimi`, `deepseek`). Codex is
narrower on purpose: only a `chatgpt.com` endpoint or the exact route id
`openai-codex` auto-selects it, and OpenAI API endpoints (`api.openai.com`)
are explicitly excluded before any id matching — a platform API key must never
travel to the ChatGPT console endpoint. Other routes can still force the probe
through `quota.providers`. Routes
matching nothing are skipped silently — a local llama.cpp route shows no quota
card rather than a broken one. The 智谱, Kimi, and Codex endpoints are
community-verified console APIs, not public contracts: if a vendor changes its
response shape, that one card reports "读取失败" and everything else keeps working.

Readings are cached host-side for `ttlMs` (5 minutes by default) and shared
between the panel and the tool, so opening the settings page repeatedly does
not hammer a vendor. A refresh that fails serves the last good reading marked
`cached` instead of blanking the card. Keys never leave the host process: the
RPC payload carries numbers only.

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
    quota:                   # live provider-allowance probes (all optional)
      enabled: true          # false = no quota block, no quota network traffic
      ttlMs: 300000          # serve one reading this long before probing again
      timeoutMs: 15000       # network bound for one route's probe
      providers:             # per-route repair, keyed by provider route id
        zai-coding-cn:       # e.g. force a family, or follow a moved endpoint
          probe: zhipu
          url: https://open.bigmodel.cn/api/monitor/usage/quota/limit
          credentialRef: ZAI_CODING_CN_API_KEY
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
  **Only the innermost call of a delegation chain is recorded.** A delegating
  wrapper provider (modlens' `(modlens vision)` facade, ...) forwards to a
  real upstream by re-entering `ctx.llm.stream(...)`, so the same physical
  call crosses this waterfall twice; the ledger tracks nesting on the async
  stack and records the inner (real) call once, skipping the facade — see
  `lib/nesting.js`.
2. At load the service opens (or creates) its SQLite database at
   `$DSH_HOME/storages/usage-ledger.sqlite` and loads stored entries.
   Entries buffer in memory and flush on a timer, on a batch threshold, and
   on shutdown. A failed flush keeps the batch buffered and retries — no
   silent loss.
3. The `usage_stats` tool aggregates the durable + pending entries for the
   requested period. The settings panel does the same over the
   `/usage-ledger` RPC channel.
4. Provider allowance is read on demand — never on the ledger's path. The
   service asks the settings tree which routes exist, resolves each route's
   key through the credentials seam, and probes the vendors' quota endpoints
   (`lib/quota.js`), caching the readings for `ttlMs`. The panel gets them
   from the `quotas` endpoint and the tool from `usage_stats` with
   `includeQuotas: true`.

## 清理历史重复记录(一次性)

修复前经 modlens `(modlens vision)` 包装的调用会在账本里记两笔(门面 + 真实上游)。
脚本会删掉门面记录、只保留真实上游那笔,并在删除前自动备份:

```
node scripts/dedupe-modlens.mjs --dry-run   # 先预览,不改动
node scripts/dedupe-modlens.mjs             # 实际清理(建议先退出 DSH)
```

## Requirements

- Node ≥ 22.5 at runtime (`node:sqlite`; every harness profile already
  carries an `node:sqlite` consumer, so the runtime is guaranteed).
- A harness whose base layer exposes the `llm/stream` waterfall and the
  `tokenMeter` service (0.1.0-rc.5-era releases).
- The settings panel needs a web profile (the App client); other profiles
  simply skip the browser half and the RPC channel.
- Provider allowance additionally needs the `settings` and `credentials`
  services (mounted by the standard base layer). Without them the ledger and
  the usage dashboard behave exactly as before — the quota block just does
  not render.
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
- Allowance probes speak the vendors' **console** APIs for 智谱, Kimi, and
  OpenAI Codex. Those are not public contracts: a shape change or an endpoint
  move shows up as one failed card (repairable per route through
  `quota.providers`). The ledger reads Codex's current OAuth grant but does not
  own or refresh it; if it has expired, make one Codex model call (which lets
  `llm-pi-ai` refresh its grant) and refresh the panel. A route
  whose key has no quota API — a plain pay-as-you-go Moonshot key, a local
  gateway — is skipped rather than guessed at.
- Allowance numbers are **live vendor readings**, not ledger aggregates: they
  cover the vendor's own account, which may span more than this harness
  instance, and they never influence the token totals.
- The Settings nav entry supplies its own chart-line glyph through the
  `settings.section` registration's `icon` option. Shells that predate the
  registrant-supplied `icon` option ignore it and fall back to their
  id-derived nav glyph (a gear for unknown ids).
- This is the **first third-party `dsh.client` package**: the scan-over-all-
  entries mechanism is verified against the harness sources, but expect to
  be off the beaten path.
