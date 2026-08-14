# dsh-usage

> 跨会话、跨模型/提供方聚合的 DSH 用量记账与成本统计插件。

一句话目标：让「我这个月用了多少 token、花了多少钱、按模型分布如何」成为一条命令就能回答的问题——而且是**本地、持久、跨会话、跨模型/提供方**的真实答案，不是猜的。

---

## 为什么这是 DSH 真正空缺的一块

先盘点 DSH 现状，说明这个插件不是在重复造轮子，而是补一个真实缺口：

| 现有能力 | 位置 | 能做什么 | 缺什么 |
| --- | --- | --- | --- |
| `@deepseek-ai/dsh-token-meter` | 内置 | 启发式 token **估算**（固定密度 chars/4 + 结构开销） | 服务于上下文水位、compaction、context breakdown；**不是提供方实报用量，不算钱** |
| `@deepseek-ai/dsh-session-stats` | 内置 | 单会话投影：turns / steps / llmMs / ttft / decodeMs / **decodeTokens** | 只统计 output tokens、只到会话粒度；**无输入 tokens、无跨会话聚合、无钱** |
| `@deepseek-ai/dsh-session-telemetry-otel` | 内置（默认 DISABLED） | 可选地把会话事件以 OTLP 分享出去 | 是**外发遥测**，不是本地记账；关掉就什么都没有 |
| 会话事件日志 | 内置 | append-only 规范日志；`assistant/message` 事件携带提供方实报 `usage`，消息记录带 provider/model | 只按会话存取；没有任何消费方把它聚合成账本 |
| `dsh-session-query-sqlite` / `dsh-storage-sqlite` | 内置 | 跨会话的 SQLite 读模型（FTS 检索） | 面向搜索，**没有用量/成本维度** |
| 成本、价格、花费 | 全库 | 不存在 | `dsh-llm-pi-ai` 源码注释直言 "no consumer reports spend"——**整个 DSH 没有一处消费方报告花费** |

结论：DSH 拥有完整的会话事件基础设施，但**没有一张「账」**——没有跨会话的用量账本、没有价格簿、没有成本聚合、没有「按模型/按提供方/按时间」的花费视图。这就是 `dsh-usage` 要填的洞。

---

## 这是什么形态

一个标准的 **DSH 插件**（cordis 插件 / profile bundle），不 fork 核心、不改 DSH 源码：

- 以 npm 包形式存在，通过 `dsh plugin --profile <name> add <package>` 装进 profile；
- 配置走 profile 配置树（schemastery schema）；
- 账本数据放在 `$DSH_HOME` 下**跨 profile 共享**的位置（`web` / `tui` / `headless` 用同一本账）；
- 只读消费 DSH 已有的会话事件流，对核心零侵入。

---

## 核心能力

### 1. 用量记账（账本，Ledger）

- 捕获**每次 LLM 调用**：provider、model、实报 usage（input / output / cached tokens）、发生时间、所属会话与步骤；
- **实报优先**：`assistant/message` 事件携带提供方实报的 usage，直接入账；
- **估算兜底**：提供方不报 usage 时，用 `dsh-token-meter` 的启发式估算入账，并打上 `estimate` 标记——账目永远能区分「实报」与「估算」；
- **append-only**：账本只追加、不修改，与 DSH 会话日志同构；
- **幂等**：账本行携带事件 `seq` 唯一键，会话重放/冷启动补扫不会重复记账。

### 2. 价格簿（Price Book）

- 按 `provider × model` 配置单价：input、cached input、output 分别计价；
- 内置主流提供方预设（价格会变，只作示例，以官方为准），支持自定义覆盖；
- 多币种：金额以美元（API 计价基准）存储，显示层按配置汇率换算（如 CNY）；
- 金额用分单位整数/十进制字符串存储，杜绝浮点误差。

### 3. 聚合查询（Answers）

任意时间范围（今天 / 本月 / 自定义区间）× 任意维度（按模型、按提供方、按会话、按 profile）：

- 总 token（input / output / cached 分开）、总调用次数、总花费；
- 分布视图：按模型的 token 与花费占比（谁吃掉了我的钱）；
- 实报 vs 估算占比（估算占比高说明账单可信度低）。

### 4. 展示面

- **命令**：向 web / tui 的命令面板注册一个 `usage` 命令（对齐 `dsh-command-*` 插件的注册方式）；
- **报表**：输出 markdown 报表（可贴、可存）；
- **后续**：客户端 UI 面板（侧边栏/设置页嵌入）。

---

## 架构

```
DSH 会话事件流 (assistant/message + usage, step/start 的 provider/model)
        │  订阅/投影
        ▼
┌─────────────────┐   append-only   ┌─────────────────────┐
│  Usage Collector │ ──────────────▶ │  ledger.jsonl       │
│  (幂等, 估算兜底)  │                 │  ($DSH_HOME/usage/) │
└─────────────────┘                 └──────────┬──────────┘
                                               │ 增量索引
                                               ▼
┌─────────────────┐   ┌─────────────────────────────────────┐
│  Price Book      │ ─▶│  Aggregation Service (SQLite 读模型) │
│  (配置/价格文件)   │   │  按月/模型/提供方/会话聚合             │
└─────────────────┘   └──────────────────┬──────────────────┘
                                         ▼
                              usage 命令 / markdown 报表 / (UI 面板)
```

### 数据模型（草案）

- `usage_record`：`{ seq, ts, provider, model, sessionId, stepId, inputTokens, outputTokens, cachedTokens, source: "reported" | "estimate" }`
- `price_book`：`{ provider, model, inputPerM, cachedInputPerM, outputPerM, currency, updatedAt }`
- `aggregates`：由账本增量折叠的按日/按月小计（`dsh-session-stats` 同款投影思路，但键是「模型 × 天」而不是「会话」）

### 设计原则

1. **账本是事实，聚合是视图**：任何聚合都能从账本重算，聚合索引坏了可以重建；
2. **估算透明**：估算金额永远单独标记、可单独过滤，绝不冒充实报；
3. **全本地**：数据不出机器，与遥测（OTLP）无关；
4. **时区与月份边界**：按本地时区切日/月，跨时区旅行不产生幽灵账目；
5. **低开销**：记账只做一次事件折叠（O(1) 每事件），聚合增量维护，查询不扫全账本。

---

## 与 DSH 集成

### 安装

```bash
# 开发期（本仓库链接进 profile）
dsh plugin --profile tui add /path/to/dsh-usage

# 发布后
dsh plugin --profile tui add <发布名>
```

### 配置示例（profile 配置树）

```yaml
usage:
  ledgerPath: ~/.dsh/usage/ledger.jsonl   # 默认 $DSH_HOME/usage/ledger.jsonl
  priceBook:
    - provider: deepseek
      model: deepseek-chat
      inputPerM: 0.27      # 单位: USD / 1M tokens,仅示例,以官方价格为准
      cachedInputPerM: 0.07
      outputPerM: 1.10
  currency:
    display: CNY
    usdRate: 7.2
  estimateFallback: true   # 提供方不报 usage 时启用启发式估算兜底
```

### 依赖的既有包（只消费、不修改）

- `@deepseek-ai/dsh-session` —— 事件日志与 surface/usage 语义
- `@deepseek-ai/dsh-token-meter` —— 估算兜底
- `@deepseek-ai/dsh-session-stats` —— 投影折叠的范式参考
- `@deepseek-ai/dsh-storage-sqlite` / `@deepseek-ai/dsh-session-query-sqlite` —— 读模型范式参考

---

## 仓库结构（规划）

```
dsh-usage/
├── src/
│   ├── collector/      # 事件订阅、幂等入账、估算兜底
│   ├── ledger/         # append-only 账本读写
│   ├── price-book/     # 价格簿解析与校验
│   ├── aggregates/     # SQLite 读模型与增量折叠
│   ├── report/         # markdown 报表
│   └── command/        # usage 命令注册
├── schema/             # schemastery 配置 schema
├── test/
│   ├── fixtures/       # 会话日志 fixture(含/不含 usage 的样本)
│   └── replay/         # 幂等与重放测试
├── docs/
│   └── design/         # 设计决策记录
└── package.json
```

---

## 开发指南

1. `pnpm install`；
2. 用 `test/fixtures/` 里的会话日志样本做 **replay 测试**：喂入事件流 → 断言账本行、断言重放不重复记账、断言估算标记；
3. 本地联调：`dsh plugin --profile tui add .` 后跑 `dsh --profile tui`，制造真实调用后检查 `$DSH_HOME/usage/ledger.jsonl`；
4. 对齐 DSH 的既有约定：`dsh-command-*` 插件的命令注册方式、schemastery schema、投影单位的注册 seam（`ctx.sessionProjections`）。

---

## 路线图

- [ ] **M0 记账内核**：事件订阅 + append-only 账本 + 幂等 + 估算兜底
- [ ] **M1 价格簿**：schema 校验、内置预设、多币种显示换算
- [ ] **M2 聚合与报表**：SQLite 读模型、按时间/模型/提供方/会话聚合、markdown 报表
- [ ] **M3 命令与 UI**：`usage` 命令接入 web/tui；后续客户端面板
- [ ] **M4 增强**（可选）：预算/额度预警、按会话标签分组、OTLP 导出（自选）

## 非目标

- ❌ 不做代理计费（不拦截、不改写任何 LLM 请求）；
- ❌ 不做云同步/多机合并；
- ❌ 不做遥测分享（与 DSH telemetry 保持独立，默认全本地）；
- ❌ 不声称估算等于实报（永远标注来源）。

---

## License

MIT
