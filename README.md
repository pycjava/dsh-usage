# dsh-usage

> 跨会话、跨模型/提供方聚合的 DSH 用量记账插件。**只做 token,不做钱。**

一句话目标:让「我这个月用了多少 token、按模型分布如何」成为一条命令就能回答的问题——而且是**本地、持久、跨会话、跨模型/提供方**的真实答案,不是猜的。

实现位于 `dsh-usage-ledger/`,可安装产物为 `dsh-usage-ledger-0.1.0.tgz`。**已安装**到本机 web / headless 两个 profile。

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

一个标准的 **DSH 插件**(cordis 插件 / profile bundle),不 fork 核心、不改 DSH 源码:

- npm 包,经 `dsh plugin --profile <name> add <包>` 装进 profile;
- 配置走 profile 配置树(schemastery schema);
- 账本放在 `$DSH_HOME/storages/usage-ledger.sqlite`,**跨 profile 共享**(web / tui / headless 同一本账);
- 捕获点选择 `llm/stream` waterfall:进程内每一次模型调用都经过它(agent 轮次、子代理、会话标题、压缩摘要),比只订阅会话事件更完整(标题/压缩调用不进事件日志)。

---

## 核心能力(已实现)

### 1. 用量记账(Ledger)

- 捕获**每次 LLM 调用**:provider、model、实报 usage(input / output / cache read / cache write / reasoning tokens)、时间、会话 id、用途(purpose);
- **实报优先**:提供方实报的 `usage` chunk 直接入账;
- **估算兜底**(可选,`estimateFallback: true`):提供方不报 usage 时,用 token-meter 同一套启发式(密度 chars/4 + 块开销)入账,并打 `estimated` 标记——实报与估算永远分开展示;
- **append-only + 幂等**:每次调用一条记录(uuid 键),重试、重放不会重复记账;
- **重放语义**:`finish.replayState` 标记提供方缓存重放(如 pi-ai replay),默认排除在合计外(`--include-replayed` 可含),因为其计费原始调用早已入账;
- **持久**:自带 `node:sqlite` 数据库(WAL),批量落盘(定时 5s / 满 32 条 / 关停),失败保留重试,不依赖 storage hub,web/headless/TUI 全通用。

### 2. 聚合查询(Answers)

任意时间范围(今天 / 本月 / 7d / Nd / YYYY-MM / YYYY-MM..YYYY-MM / 全部)× 任意维度(按模型、按提供方、按天、按会话):

- 总 token(input / cache read / cache write / output 分开)、总调用次数;
- 实报 vs 估算拆分(估算占比高说明账目可信度低);
- 分布视图:每个模型/提供方/会话吃掉了多少 token。

### 3. 展示面

- **命令**:`/usage`(对齐 `dsh-command-*` 的注册方式),monospace 报表 + JSON/CSV 导出;
- **工具**:`usage_stats` agent 工具,模型可直接回答「这个月用了多少 token」;
- 后续可加:客户端 UI 面板(侧边栏/设置页嵌入)。

### 报表示例

```
Usage · August 2026 · 4.2M tokens · 3 calls

calls                         3
input                      2.5M
cache read                   1M
output                     700K
total                      4.2M tokens
reported                      2 calls ·      3.6M tokens
estimated                     1 call  ·      600K tokens (heuristic)
replayed                      1 call excluded (pass --include-replayed)

by model (provider/model):
model                                calls       input      output       total
------------------------------------------------------------------------------
deepseek-official/deepseek-chat          2          3M        600K        3.6M
deepseek-official/deepseek-v4-pro        1        500K        100K        600K
```

---

## 安装与使用

```bash
# 开发/本机(已执行):
dsh plugin --profile web      add /path/to/dsh-usage-ledger-0.1.0.tgz
dsh plugin --profile headless add /path/to/dsh-usage-ledger-0.1.0.tgz

# 验证组合:
dsh --profile web --dump-config      # 应看到 # == dsh-usage-ledger 层

# 使用(重启 GUI 后):
/usage                                # 本月合计 + 按模型
/usage 7d --by day                    # 近 7 天按天
/usage all --by session               # 全部按会话
/usage --json usage.json              # 导出原始条目
```

配置(profile 的 `cordis.patch.yml`):

```yaml
- id: usage-ledger
  config:
    estimateFallback: true   # 无实报 usage 时启发式估算入账(标记 estimated)
    retentionDays: 0         # 0 = 永久保留;N = 丢弃 N 天前的条目
    flushIntervalMs: 5000
    flushEveryEntries: 32
```

---

## 架构

```
进程内所有 LLM 调用 (llm/stream waterfall)
        │  监听(透传 chunk,零侵入)
        ▼
┌─────────────────┐   批量落盘(WAL)   ┌──────────────────────────────┐
│  Usage Collector │ ───────────────▶ │ usage-ledger.sqlite           │
│  (实报优先/估算兜底) │                 │ $DSH_HOME/storages/           │
└─────────────────┘                  └──────────────┬───────────────┘
                                                     │ 内存镜像 + pending 缓冲
                                                     ▼
                                    usage 命令 / usage_stats 工具
                                    (按时间 × 模型/提供方/天/会话聚合)
```

### 数据模型

- 条目:`{ id, time, provider, model, sessionId?, purpose?, inputTokens, cacheReadTokens?, cacheWriteTokens?, outputTokens, reasoningTokens?, replayed?, estimated? }`
- 存储:`entries(id TEXT PRIMARY KEY, time INTEGER, json TEXT)` + time 索引

### 设计原则

1. **账本是事实,聚合是视图**:任何聚合都能从账本重算;
2. **估算透明**:估算条目永远单独标记、可单独过滤,绝不冒充实报;
3. **全本地**:数据不出机器,与遥测(OTLP)无关;
4. **本地时区切日/月**;
5. **低开销**:捕获只做 O(1) 记录,批量落盘,查询在内存镜像上聚合。

---

## 路线图

- [x] **M0 记账内核**:llm/stream 捕获 + SQLite 账本 + 幂等 + 估算兜底 + 重放标记
- [x] **M1 聚合与报表**:按时间/模型/提供方/天/会话聚合、monospace 报表、JSON/CSV 导出
- [x] **M2 命令与工具**:`/usage` 命令 + `usage_stats` agent 工具
- [ ] **M3 客户端 UI**:侧边栏/设置页面板(需要客户端插件行)
- [ ] **M4 增强**(可选):预算/额度预警(纯 token 阈值)、多机合并、OTLP 导出(自选)

## 非目标

- ❌ **不做成本/计价**(用户决策:只做用了多少 token);
- ❌ 不做代理计费(不拦截、不改写任何 LLM 请求);
- ❌ 不做云同步/多机合并;
- ❌ 不做遥测分享(与 DSH telemetry 保持独立,默认全本地);
- ❌ 不声称估算等于实报(永远标注来源)。

---

## License

MIT
