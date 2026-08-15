# dsh-usage

> 跨会话、跨模型/提供方聚合的 DSH 用量记账插件——「我这个月用了多少 token、按模型分布如何」,设置面板一眼可见、agent 一问即答。**只做 token,不做钱。**

## 这是什么

`dsh-usage` 是一个标准的 DSH 插件:单个 npm 包 `dsh-usage-ledger`(**双面包**——宿主半边跑在 Node、浏览器半边跑在 App 客户端),不 fork 核心、不改 DSH 源码。它在 `llm/stream` waterfall 上为进程内每一次模型调用记账,落成本地 SQLite 账本,并以两种方式呈现:设置页的「数据与统计」面板 + 面向模型的 `usage_stats` 工具。

答案是**本地、持久、跨会话、跨模型/提供方**的真实数字——提供方实报的 token;估算只作可选的兜底,并永远单独标记。实现位于 `dsh-usage-ledger/`,详见其 [README](dsh-usage-ledger/README.md)。

## 为什么 DSH 缺这一块

DSH 拥有完整的会话事件基础设施,但**没有一张「账」**——没有跨会话的用量账本、没有「按模型/按提供方/按时间」的用量视图:

| 现有能力 | 位置 | 能做什么 | 缺什么 |
| --- | --- | --- | --- |
| `@deepseek-ai/dsh-token-meter` | 内置 | 启发式 token **估算**(chars/4 + 结构开销) | 服务于上下文水位、compaction;**不是提供方实报用量** |
| `@deepseek-ai/dsh-session-stats` | 内置 | 单会话投影:turns / steps / decodeTokens | 只统计 output tokens、只到会话粒度;**无 input、无跨会话聚合** |
| `@deepseek-ai/dsh-session-telemetry-otel` | 内置(默认 DISABLED) | 可选地把会话事件以 OTLP 分享出去 | 是**外发遥测**,不是本地记账 |
| 会话事件日志 | 内置 | append-only 规范日志;`assistant/message` 携带提供方实报 `usage` | 只按会话存取;**没有任何消费方聚合成账本** |

这就是 `dsh-usage` 填的洞。

## 特性

- **跨会话记账**:捕获每次 LLM 调用的 provider、model、实报 usage(input / output / cache read / cache write / reasoning tokens)、时间、会话 id、用途;捕获点选 `llm/stream` waterfall——agent 轮次、子代理、会话标题、压缩摘要都经过它,比会话事件日志更完整(标题/压缩调用不进事件日志);
- **实报优先,估算兜底**:提供方实报的 usage 直接入账;失败调用(无 usage chunk 或全零)不入账,不虚增;`estimateFallback`(**默认关**)开启后,无实报的调用用与 token-meter 同一套启发式(chars/4)入账并打 `estimated` 标记——实报与估算永远分开展示;
- **幂等**:每次调用一条记录(uuid 键,`INSERT OR REPLACE`),重试不会重复记账;`finish.replayState` 刻意忽略——它是 pi-ai 的溯源元数据,不是「缓存重放」信号,不能作为排除依据;
- **持久**:自带 `node:sqlite` 数据库(WAL),账本在 `$DSH_HOME/storages/usage-ledger.sqlite`,不依赖 storage hub,web / tui / headless 通用,跨 profile 共享同一本账;条目先进内存缓冲、批量落盘(定时 5s / 满 32 条 / 关停),单写者链串行化,失败整批保留并重试,不静默丢数据;
- **双展示面,同一本账**:`usage_stats` agent 工具返回 monospace 报表;设置页「数据与统计」dashboard——时间范围切换(7 天 / 30 天)+ 手动刷新、六张统计卡(tokens 用量、会话数、调用次数、活跃天数、连续天数、最常用模型)、GitHub 风格活跃热力图(近 53 周)、按天 Token 趋势堆叠柱状图;数字按语言本地化(zh 万/亿,en K/M/G),样式走客户端主题 token,深浅色自适应;
- **全本地**:数据不出机器,与遥测(OTLP)无关;RPC 通道 `authority: loopback`,仅本机页面可查;
- **降级不崩溃**:存储打不开时自动退化为内存账本(带上限、丢最旧并计数、打日志);无 connection 服务的 profile(headless/TUI)只是不注册 RPC 通道,记账照常。

## 工作原理

| 环节 | 说明 |
| --- | --- |
| 挂载 | `cordis.patch.yml` 两行:`usage-ledger`(双面:宿主服务 + 浏览器 bundle)+ `usage-ledger-tool`(入口 `dsh-usage-ledger/tool`,挂 `usage_stats` 工具;整行摘除即可对 agent 隐藏工具,账本与面板照常工作);配置走 profile 配置树 |
| 捕获 | 监听 `llm/stream` waterfall,透传 chunk 零侵入;实报优先 / 估算兜底;每次调用一条幂等记录 |
| 存储 | 内存缓冲 → 批量落盘 `usage-ledger.sqlite`(WAL);启动时全量加载为内存镜像,查询在镜像上聚合,本地时区切日/月 |
| 查询 | 唯一入口 `ctx.usageLedger.query({ from, to, by })`:任意时间范围(今天 / 本月 / 7d / Nd / YYYY-MM / 全部)× 任意维度(模型 / 提供方 / 天 / 会话);工具、RPC 通道共用;返回总 token(input / cache read / cache write / output 分开)、调用次数、实报 vs 估算拆分、分布视图 |
| 展示 | 宿主:`usage_stats` 工具(monospace 报表);浏览器:`/plugins/dsh-usage-ledger/client.js` 经 `settings.section` list slot 注册「数据与统计」section(零壳改动),经私有 loopback RPC(`/usage-ledger` → `dashboard`)拉取聚合 |

架构:

```
bundle 补丁两行:usage-ledger(双面)· usage-ledger-tool(usage_stats 工具)

宿主(Node)                      llm/stream waterfall(进程内所有 LLM 调用)
                                          │ 监听(透传 chunk,零侵入)
                                          ▼
                          ┌─────────────────────┐  批量落盘(5s / 32 条 / 关停;单写者,失败重缓冲重试)
                          │  Usage Collector    │ ───────────────────────────────▶ ┌───────────────────────────┐
                          │  (pending 缓冲)     │ ◀── 启动时同步全量加载(内存镜像) ── │ usage-ledger.sqlite (WAL) │
                          └─────────────────────┘                                  │ $DSH_HOME/storages/        │
                                          │                                        └───────────────────────────┘
                                          │  ctx.usageLedger.query()   ctx.connection.rpc.handle('/usage-ledger', loopback)
                                          ▼                                        │
                          usage_stats 工具(monospace 报表)                         │ POST /usage-ledger/dashboard { period }
                                                                                   ▼
浏览器(App 客户端)       /plugins/dsh-usage-ledger/client.js ◀─────────────────────┘
                                          │  settings.section slot(id: usage, label: 数据与统计)
                                          ▼
                          设置面板:汇总卡 + 热力图 + 按天趋势(实报/估算在汇总与脚注分开展示)
```

数据模型:条目 `{ id, time, provider, model, sessionId?, purpose?, inputTokens, cacheReadTokens?, cacheWriteTokens?, outputTokens, reasoningTokens?, estimated? }`,存储为 `entries(id TEXT PRIMARY KEY, time INTEGER, json TEXT)` + time 索引;原始条目列表不出宿主,面板只拿聚合。

## 安装与使用

```bash
# 构建(浏览器半边源码 src/client/,产物 lib/client.js 必须预构建后进包):
cd dsh-usage-ledger
npm install
npm run build        # tsdown → lib/client.js(+ map)
npm pack             # → dsh-usage-ledger-0.4.2.tgz

# 安装(装完重启 App 客户端——宿主插件与客户端模块都只在启动时加载):
dsh plugin --profile web add /path/to/dsh-usage-ledger-0.4.2.tgz

# 验证:
dsh --profile web --dump-config      # 应看到 # == dsh-usage-ledger 层(两行)

# 使用:
设置 → 数据与统计        # 面板:最近 7 天 / 30 天切换 + 刷新
usage_stats 工具          # 对话中让 agent 查询(如「这个月用了多少 token」)
```

## 可配置字段

`cordis.patch.yml` 的 `usage-ledger` 行,全部选项与默认值:

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `estimateFallback` | `false` | 开启后,无实报 usage 的调用按启发式估算入账(标记 `estimated`) |
| `retentionDays` | `0` | `0` = 永久保留;N = 丢弃 N 天前的条目(每次落盘后清理) |
| `flushIntervalMs` | `5000` | 缓冲条目最短落盘间隔(下限 1000ms) |
| `flushEveryEntries` | `32` | 缓冲满 N 条立即落盘 |
| `maxMemoryEntries` | `200000` | 存储不可用时内存账本上限(超出丢最旧并计数,绝不静默) |

## 开发与限制

- `npm run build` 用 tsdown 产出宿主与浏览器半边产物(客户端构建配置复制自宿主 `packages/client/tsdown.client.ts`,产出闭包工厂格式,外部依赖只限平台模块表);
- 运行要求:Node ≥ 22.5(`node:sqlite`)、宿主 base 层暴露 `llm/stream` waterfall 与 `tokenMeter` 服务(0.1.0-rc.5 世代);设置面板需要 web profile(App 客户端),headless/TUI 下浏览器半边不加载、RPC 通道不注册,其余能力不受影响;
- 限制一:worker 线程或独立进程里的调用(如 workflow worker、其他 dsh 实例)不经过本进程的 waterfall——一个宿主进程 = 一本账,多实例请分开 `$DSH_HOME`;
- 限制二:估算永远是启发式(chars/4),不是提供方数字;所有展示面都会带 `estimated` 标记;
- 限制三:usage 全零的调用(错误路径完成)不入账,查询时同样过滤历史遗留的全零条目,次数与 token 口径一致;
- 限制四:插件集变更(装 / 卸 / 升级)需重启客户端生效——本插件是**第一个第三方 `dsh.client` 包**,机制已在宿主源码逐行核实。

## 路线图

- [x] **M0 记账内核**:llm/stream 捕获 + SQLite 账本 + 幂等 + 估算兜底 + 失败调用过滤(replayState 已证伪移除:溯源元数据而非重放信号)
- [x] **M1 聚合与报表**:按时间/模型/提供方/天/会话聚合、monospace 报表(usage_stats 工具返回)
- [x] **M2 agent 工具**:`usage_stats` 工具(两行架构,工具行可独立摘除)
- [x] **M3 客户端 UI**:设置页「数据与统计」section(双面包 + 私有 loopback RPC,零宿主改动)
- [ ] **M4 增强**(可选):面板数据导出(JSON/CSV)、预算/额度预警(纯 token 阈值)、多机合并、OTLP 导出(自选)

## 非目标

- ❌ **不做成本/计价**(用户决策:只做用了多少 token);
- ❌ 不做代理计费(不拦截、不改写任何 LLM 请求);
- ❌ 不做云同步/多机合并;
- ❌ 不做遥测分享(与 DSH telemetry 保持独立,默认全本地);
- ❌ 不声称估算等于实报(永远标注来源)。

## License

MIT
