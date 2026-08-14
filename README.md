# dsh-usage

> 跨会话、跨模型/提供方聚合的 DSH 用量记账插件。**只做 token,不做钱。**

一句话目标:让「我这个月用了多少 token、按模型分布如何」在设置面板里一眼可见、agent 一问即答——而且是**本地、持久、跨会话、跨模型/提供方**的真实答案,不是猜的。

实现位于 `dsh-usage-ledger/`(npm 包 `dsh-usage-ledger@0.3.0`,**双面包**:宿主半边 + 浏览器半边),详见其 [README](dsh-usage-ledger/README.md)。

---

## 为什么这是 DSH 真正空缺的一块

| 现有能力 | 位置 | 能做什么 | 缺什么 |
| --- | --- | --- | --- |
| `@deepseek-ai/dsh-token-meter` | 内置 | 启发式 token **估算**(固定密度 chars/4 + 结构开销) | 服务于上下文水位、compaction、context breakdown;**不是提供方实报用量** |
| `@deepseek-ai/dsh-session-stats` | 内置 | 单会话投影:turns / steps / llmMs / ttft / decodeMs / **decodeTokens** | 只统计 output tokens、只到会话粒度;**无输入 tokens、无跨会话聚合** |
| `@deepseek-ai/dsh-session-telemetry-otel` | 内置(默认 DISABLED) | 可选地把会话事件以 OTLP 分享出去 | 是**外发遥测**,不是本地记账;关掉就什么都没有 |
| 会话事件日志 | 内置 | append-only 规范日志;`assistant/message` 事件携带提供方实报 `usage` | 只按会话存取;没有任何消费方把它聚合成账本 |

结论:DSH 拥有完整的会话事件基础设施,但**没有一张「账」**——没有跨会话的用量账本、没有「按模型/按提供方/按时间」的用量视图。这就是 `dsh-usage` 填的洞。

---

## 形态

一个标准的 **DSH 插件**(cordis 插件 / profile bundle),**双面包**(同一个 npm 包,宿主半边跑在 Node、浏览器半边跑在 App 客户端),不 fork 核心、不改 DSH 源码:

- npm 包,经 `dsh plugin --profile <name> add <包>` 装进 profile;包内 `cordis.patch.yml` 声明为 `dsh.bundle.patch`,`dsh` 自动追加到 profile 的 bundle 层列表;
- 插件以**两行**载入(见 `dsh-usage-ledger/cordis.patch.yml`):
  - **`usage-ledger`** → `UsageLedgerService`(服务名 `ctx.usageLedger`):监听 `llm/stream` 记账 + SQLite 持久化 + `/usage-ledger` RPC 通道;这一行的 `name` 是裸包名,客户端模块系统据此把**浏览器半边**(`package.json` 声明 `dsh.client` + `exports["./client"]`)扫进启动图,经 `/plugins/dsh-usage-ledger/client.js` 提供;
  - **`usage-ledger-tool`**(入口 `dsh-usage-ledger/tool`,inject `usageLedger`)→ 面向模型的 `usage_stats` 工具;**删掉这一行即可对 agent 隐藏工具**,账本与面板照常工作;
- 浏览器半边在设置页注册**「数据与统计」section**(`settings.section` 开放 list slot,零壳改动),经插件私有的 loopback RPC 通道拉取聚合;
- 配置走 profile 配置树(schemastery schema),改 `usage-ledger` 行的 `config`;
- 账本放在 `$DSH_HOME/storages/usage-ledger.sqlite`,自带 `node:sqlite`、**不依赖 storage hub**,web / tui / headless 通用,**跨 profile 共享同一本账**;
- 捕获点选择 `llm/stream` waterfall:进程内每一次模型调用都经过它(agent 轮次、子代理、会话标题、压缩摘要),比只订阅会话事件更完整(标题/压缩调用不进事件日志);
- 存储打不开时(如目录不可写)自动**降级为进程内内存账本**(带上限、丢最旧并计数、打日志),不拖垮整棵插件树;无 connection 服务的 profile(headless/TUI)只是不注册 RPC 通道,记账照常。

---

## 核心能力(已实现)

### 1. 用量记账(Ledger)

- 捕获**每次 LLM 调用**:provider、model、实报 usage(input / output / cache read / cache write / reasoning tokens)、时间、会话 id、用途(purpose);
- **实报优先**:提供方实报的 `usage` chunk 直接入账;失败调用(没有 usage chunk)不入账,不虚增;
- **估算兜底**(可选,`estimateFallback`,**默认关**):开启后无实报 usage 的调用用 token-meter 同一套启发式(密度 chars/4 + 块开销)入账,并打 `estimated` 标记——实报与估算永远分开展示;
- **幂等**:每次调用一条记录(uuid 键,`INSERT OR REPLACE`),重试不会重复记账;
- **失败调用不入账**:没有 usage chunk 的调用、以及 usage 全零的调用(错误路径的完成)都不入账——没消耗就不计数;
- **`finish.replayState` 刻意忽略**:它是 pi-ai 每次成功完成都会携带的溯源元数据(供后续请求重建历史用),**不是**"缓存重放"信号,不能作为排除依据;
- **持久**:自带 `node:sqlite` 数据库(WAL);条目先进内存缓冲,批量落盘(定时 5s / 满 32 条 / 关停),单写者链串行化,失败整批保留并重试,不静默丢数据。

### 2. 聚合查询(Answers)

宿主侧唯一查询入口 `ctx.usageLedger.query({ from, to, by, includeReplayed })`,工具、RPC 通道共用。任意时间范围(今天 / 本月 / 7d / Nd / YYYY-MM / YYYY-MM..YYYY-MM / 全部)× 任意维度(按模型、按提供方、按天、按会话):

- 总 token(input / cache read / cache write / output 分开)、总调用次数;
- 实报 vs 估算拆分(估算占比高说明账目可信度低);
- 分布视图:每个模型/提供方/会话吃掉了多少 token。

### 3. 展示面(两个,同一本账)

- **工具**:`usage_stats` agent 工具(注册进 tools registry,由独立的 `usage-ledger-tool` 行挂载),模型可直接回答「这个月用了多少 token」,返回 monospace 报表;
- **设置面板**:App 客户端设置页的**「数据与统计」** dashboard——时间范围切换(最近 7 天 / 最近 30 天)、六张统计卡(tokens 用量、会话数量、调用次数、活跃天数、当前连续天数、最常用模型及占比)、GitHub 风格**活跃热力图**(近 16 周,按日 token 强度着色)、**按天 Token 趋势**堆叠柱状图(按模型分色);数字按语言本地化(zh 万/亿,en K/M/G),样式走客户端主题 token(`--dsw-alias-*`),深浅色自适应。

### 工具报表示例(usage_stats 返回文本,实际输出)

```
Usage · August 2026 · 5.2M tokens · 3 calls

calls                         3
input                      3.5M
cache read                   1M
output                     700K
total                      5.2M tokens
reported              2 calls ·       3.6M tokens
estimated             1 calls ·       600K tokens (heuristic)

by model (provider/model):
model                                calls       input      output       total
------------------------------------------------------------------------------
deepseek-official/deepseek-chat          2          3M        600K        3.6M
deepseek-official/deepseek-v4-pro        1        500K        100K        600K
```

---

## 安装与使用

```bash
# 构建(仓库内置浏览器半边源码 src/client/,产物 lib/client.js 必须预构建后进包):
cd dsh-usage-ledger
npm install
npm run build        # tsdown → lib/client.js(+ map)
npm pack             # → dsh-usage-ledger-0.3.0.tgz

# 安装(装完重启 App 客户端——宿主插件与客户端模块都只在启动时加载):
dsh plugin --profile web add /path/to/dsh-usage-ledger-0.3.0.tgz

# 验证:
dsh --profile web --dump-config      # 应看到 # == dsh-usage-ledger 层(两行)

# 使用:
设置 → 数据与统计                       # 面板:周期 × 维度自由切换
usage_stats 工具                        # 对话中让 agent 查询(如「这个月用了多少 token」)
```

配置(profile 的 `cordis.patch.yml`,全部选项与默认值):

```yaml
- id: usage-ledger
  config:
    estimateFallback: false  # 默认关;开启后无实报 usage 的调用按启发式估算入账(标记 estimated)
    retentionDays: 0         # 0 = 永久保留;N = 丢弃 N 天前的条目(每次落盘后清理)
    flushIntervalMs: 5000    # 缓冲条目最短落盘间隔(下限 1000ms)
    flushEveryEntries: 32    # 缓冲满 N 条立即落盘
    maxMemoryEntries: 200000 # 存储不可用时内存账本上限(超出丢最旧并计数,绝不静默)
```

---

## 架构

```
bundle 补丁两行:usage-ledger(双面:宿主服务 + 浏览器 bundle)· usage-ledger-tool(usage_stats 工具)

宿主(Node)
  进程内所有 LLM 调用 (llm/stream waterfall)
          │  监听(透传 chunk,零侵入;实报优先 / 估算兜底)
          ▼
  ┌─────────────────┐  批量落盘(定时 5s / 满 32 条 / 关停;单写者,失败重缓冲重试)  ┌───────────────────────────┐
  │ Usage Collector  │ ─────────────────────────────────────────────▶ │ usage-ledger.sqlite (WAL)  │
  │ (pending 缓冲)   │ ◀──────────── 启动时同步全量加载(内存镜像 records)─────── │ $DSH_HOME/storages/        │
  └─────────────────┘                                                 └───────────────────────────┘
          │
          │  ctx.usageLedger.query()          ctx.connection.rpc.handle('/usage-ledger', loopback)
          ▼                                              │
  usage_stats 工具(monospace 报表)                       │
                                                         │  POST /usage-ledger/query { period, by, includeReplayed }
浏览器(App 客户端)                                       │
  /plugins/dsh-usage-ledger/client.js ──────────────────┘
          │  settings.section slot(id: usage, label: 数据与统计)
          ▼
  设置面板:汇总卡 + 实报/估算拆分 + 四色分段条明细表
```

### 数据模型

- 条目:`{ id, time, provider, model, sessionId?, purpose?, inputTokens, cacheReadTokens?, cacheWriteTokens?, outputTokens, reasoningTokens?, estimated? }`
- 存储:`entries(id TEXT PRIMARY KEY, time INTEGER, json TEXT)` + time 索引
- RPC 线协议:`/usage-ledger` 通道唯一 endpoint `dashboard`,请求 `{ period }`,响应 `{ ok: true, value: { label, totals, sessions, activeDays, streakDays, topModel, models, series, dailyTotals } }`(原始条目列表不出宿主,面板只拿聚合;热力图与连续天数用全时段日聚合)

### 浏览器半边如何进客户端(机制,零宿主改动)

1. 客户端模块系统扫描**所有** loader entry(含插件 patch 层):包声明 `dsh.client: { platform: 'web', inject: [...] }` 且 `exports["./client"]` 指向预构建 bundle → 自动进 `window.__DSH_BOOT__` 启动图;
2. bundle 是闭包工厂格式(`window.__ModuleLoader__.load({ id, factory })`),外部依赖只限平台模块表(react 等),由 tsdown 预设产出(构建配置复制自宿主 `packages/client/tsdown.client.ts`);
3. 浏览器半边 `apply(ctx)` 注册 locale 字典(zh 为源)并向 `settings.section` list slot 注册 `id: 'usage'` 的 section——设置壳从 slot 账本投影导航,**加设置项永远不用改壳**;
4. 面板数据经 `ctx.connection.rpc.call('/usage-ledger', 'query', ...)` 拉取——通用 Connection RPC 通道是面向插件开放的数据通路(typed remotes 由上游组装,第三方不可挂载)。

### 运行要求

- Node ≥ 22.5(`node:sqlite`;各 profile 均已有 node:sqlite 消费方,运行时可保证);
- 宿主 base 层暴露 `llm/stream` waterfall 与 `tokenMeter` 服务(0.1.0-rc.5 世代);
- 设置面板需要 web profile(App 客户端);headless/TUI 下浏览器半边不加载,RPC 通道不注册,其余能力不受影响;
- 插件导入的宿主包(`@deepseek-ai/cordis` / `schemastery` / `dsh-tools`)经 profile 的 node_modules fallback 链解析,宿主启动时自愈。

### 设计原则

1. **账本是事实,聚合是视图**:任何聚合都能从账本重算;
2. **估算透明**:估算条目永远单独标记、可单独过滤,绝不冒充实报;
3. **全本地**:数据不出机器,与遥测(OTLP)无关;RPC 通道 `authority: loopback`,仅本机页面可查;
4. **本地时区切日/月**;
5. **低开销**:捕获只做 O(1) 记录,批量落盘,查询在内存镜像上聚合;
6. **降级不崩溃**:存储故障退化为内存账本(带上限、可观测),connection 缺失只是少一个数据面,绝不阻断模型调用或插件树。

### 已知限制

- worker 线程或独立进程里的调用(如 workflow worker、其他 dsh 实例)不经过本进程的 `llm/stream` waterfall;一个宿主进程 = 一本账,多实例请分开 `$DSH_HOME`;
- usage 全零的调用(错误路径完成)不入账;查询时同样过滤历史遗留的全零条目,次数与 token 口径一致;
- 估算永远是启发式(chars/4),不是提供方数字;所有展示面都会带 `estimated` 标记;
- 设置导航里新 section 的图标回退为齿轮(壳的 `navIcon()` 只硬编码三个 id;自定义图标需上游小 PR);
- 插件集变更(装/卸/升级)需重启客户端生效——设计如此;本插件是**第一个第三方 `dsh.client` 包**,机制已在宿主源码逐行核实。

---

## 路线图

- [x] **M0 记账内核**:llm/stream 捕获 + SQLite 账本 + 幂等 + 估算兜底 + 失败调用过滤(重放标记已证伪移除:replayState 是溯源元数据而非重放信号)
- [x] **M1 聚合与报表**:按时间/模型/提供方/天/会话聚合、monospace 报表(usage_stats 工具返回)
- [x] **M2 agent 工具**:`usage_stats` 工具(两行架构,工具行可独立摘除;`/usage` 命令曾在此后存在,已按用户决策移除,展示面收敛为工具 + 面板)
- [x] **M3 客户端 UI**:设置页「数据与统计」section(双面包 + 私有 loopback RPC,零宿主改动)
- [ ] **M4 增强**(可选):面板数据导出(JSON/CSV)、预算/额度预警(纯 token 阈值)、多机合并、OTLP 导出(自选)

## 非目标

- ❌ **不做成本/计价**(用户决策:只做用了多少 token);
- ❌ 不做代理计费(不拦截、不改写任何 LLM 请求);
- ❌ 不做云同步/多机合并;
- ❌ 不做遥测分享(与 DSH telemetry 保持独立,默认全本地);
- ❌ 不声称估算等于实报(永远标注来源)。

---

## License

MIT
