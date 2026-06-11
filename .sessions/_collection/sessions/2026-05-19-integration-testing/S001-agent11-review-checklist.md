# [S001] Agent11 - Review Checklist 验证层级提取报告

> 2026-05-19 | 分析 | 完成

## 目标

从 `rewrite-review-checklist.md` 的 §8、§9、§14 提取验证层级要求，对照新系统代码现状，回答三个具体问题。

## 记录

### 问题 1：§14 的 10 级验证 taxonomy 中，rewrite 项目当前覆盖到了哪几级？

来源：`codestable/quality/rewrite-review-checklist.md` §14 + `codestable/quality/rewrite-validation-fixture-oracle-baseline.md` §5-6

10 级 taxonomy（全部列出）：

| # | Level | 当前覆盖状态 | 证据 |
|---|-------|-------------|------|
| 1 | `static scan` | **有覆盖** | `pnpm -C rewrite lint` 可执行；各 feature checklist 中引用 static scan；实际 code review 过程中有结构检查。但无自动化 static scan 脚本（无专门的 scan CI job） |
| 2 | `Vitest unit` | **有覆盖** | `rewrite/` 下有 54+ spec 文件，覆盖 frame、receive、send、task、connection、storage、display、status、settings、command-ingress、expression、report、runtime 等模块的 core/service/selector/adapter。`rewrite/package.json` 有 `vitest run`。 |
| 3 | `fixture test` | **有覆盖** | 11 个 feature 有 `fixtures/` 目录：frame、receive、send、task、connection、storage、display、status、settings、command-ingress。fixture 作为测试输入在 spec 中引用。 |
| 4 | `oracle comparison` | **极少覆盖** | 仅 `storage-core-oracle.spec.ts` 一个文件有 oracle 字样；frame fixtures 中有 legacy sample 但无独立 `oracles/` 目录。rewrite 全局无统一 oracle comparison scaffold。 |
| 5 | `fake adapter test` | **有覆盖** | connection（`connection-fake-adapter.spec.ts`）、storage（`storage-fake-adapter.spec.ts`）有 fake adapter 测试。send 有 `fake-frame-snapshot-provider.ts`、`fake-connection-writer.ts`、`fake-variable-provider.ts`。receive 有 `fake-input-source.ts`。这些在 spec 中被引用。 |
| 6 | `manual checklist` | **无实质覆盖** | 代码仓库中未找到任何 manual checklist 文件或模板。各 feature design/checklist 中有文字提及需要 manual checklist，但无已执行的 checklist 记录或截图。 |
| 7 | `runtime validation` | **无覆盖** | 代码中无 runtime validation 记录、运行日志或 checklist。开发态 Electron 应用运行行为未留下可检索证据。 |
| 8 | `hardware validation` | **无覆盖** | 无真实串口/TCP/UDP/SCOE 设备验证记录。validation-baseline.md §13 明确标注"真实串口、TCP、UDP、SCOE、高速数据链路和长期吞吐无本轮验证证据"。 |
| 9 | `package validation` | **无覆盖** | 无打包态验证记录。validation-baseline.md §13 标注"打包态 data path、权限、备份、清理和长期写入无本轮验证证据"。 |
| 10 | `customer validation` | **无覆盖** | 无甲方 schema 联调、HTTP/FTP delivery、回执确认等证据。甲方闭环 4 接口仍为设计态（参见 northbound decisions session）。 |

**结论**：当前覆盖 Level 1-3（static scan / Vitest unit / fixture test）较为充分；Level 4（oracle comparison）极少；Level 5（fake adapter test）有初步覆盖；Level 6-10（manual checklist / runtime / hardware / package / customer）无实质覆盖证据。

---

### 问题 2：§8 高频数据 checklist 中的每一项，是否需要真 TCP 集成测试？

来源：`codestable/quality/rewrite-review-checklist.md` §8

逐项分析：

| # | §8 检查项 | 需要真 TCP 集成测试？ | 理由 |
|---|-----------|---------------------|------|
| 1 | 高频数据是否有批量、缓冲、聚合或节流策略 | **部分需要** | 策略的设计和单元逻辑可用 Vitest + fake adapter 验证；但批量/节流在真实高频 TCP 流下的行为（时序、丢包、背压）需要 runtime + hardware validation |
| 2 | 涉及高频通道时，是否说明队列上限、溢出策略、合并窗口、延迟观察方式 | **部分需要** | 上限/溢出策略的声明和逻辑可静态审查；但队列在真实 TCP 速率下的表现（是否真的不溢出、合并窗口是否有效）需要 hardware validation |
| 3 | 哪些数据在 main 处理，哪些结果进入 renderer 是否明确 | **不需要** | 这是架构分层声明，可通过 static scan + code review 验证。当前代码明确：connection adapters 在 main 侧（真实 serial/network adapter），receive core 在 renderer 侧纯 TS |
| 4 | 是否避免逐包穿过 main -> renderer -> store -> 多 store 副作用链 | **不需要** | 可通过代码结构审查验证。当前 routing-tick.ts 采用 drain-batch 模式：connection drain 批量取事件 -> receive 批量处理 -> fan out 到 display/storage。非逐包模式 |
| 5 | 是否避免高频事件直接推动页面列表或静态资产全量刷新 | **不需要** | 可通过代码审查 + Vitest 验证。receive core 的 statsDelta 是增量结构，不触发全量刷新。display service 有独立 ingest。但实际 UI 性能表现需要 runtime validation 补充确认 |
| 6 | UI snapshot 的刷新频率、分页、虚拟滚动或按需组合策略是否明确 | **不需要真 TCP，但需要 runtime validation** | 这是 UI 层行为，不依赖 TCP。但需要在运行态 Electron 应用中验证实际刷新表现，属于 runtime validation 范畴 |
| 7 | 高速存储命中后是否明确记录是否短路普通 receive/display/trigger 链 | **部分需要** | 短路逻辑可单元测试；但高速存储（当前为 deferred）未实现，无法验证。若后续实现高速存储，真实高速数据流下的短路时序需 hardware validation |
| 8 | 性能相关行为是否有 fixture、压测脚本、手工 checklist 或 runtime validation 计划 | **需要** | 当前无压测脚本、无手工 checklist、无 runtime validation 计划。§14 明确要求"必须 runtime 或 hardware validation：TCP/UDP 断线、重连、高频数据和远端变化" |

**结论**：8 项中 3 项不需要真 TCP 集成测试（纯架构/代码审查可验证），4 项部分需要（逻辑可单测但真实行为需 hardware validation），1 项需要（性能验证相关行为必须有 runtime/hardware 证据）。但关键点：当前项目**没有任何真 TCP 集成测试或 hardware validation 记录**，这是 §14 明确标注的 blocker。

---

### 问题 3：§9 Receive/Send checklist 中的 red flags，新系统是否真正避免了每一个？

来源：`codestable/quality/rewrite-review-checklist.md` §9

#### §9 Red flags 逐项审查

**Red flag 1："receive 直接启动任务或写入任务完成状态"**

**已避免。** 证据：

- `rewrite/src/features/receive/core/processor.ts` 的全部产出是 `ReceiveBatchOutcome`（纯数据对象），不调用任何 task 方法。
- `rewrite/src/features/receive/services/receive-service.ts` 只产出 `ReceiveServiceOutcome`（含 outcomes、snapshot、issues），不 import task 模块。
- receive 的 import 链中完全没有 task、report、northbound、result 模块（Grep 搜索确认：receive 目录下无任何 `import.*task|import.*report|import.*northbound|import.*result`）。
- runtime 层通过 `routing-tick.ts` 将 receive matched outcomes 转化为 `ConditionMatchInput`，再通过 `ReceiveEventSourceBridge` 传递给 task service。这是显式的 runtime 编排，不是 receive 内部直接调用。

**Red flag 2："send 成功直接写 report 或 northbound response"**

**已避免。** 证据：

- `rewrite/src/features/send/services/send-service.ts` 的 `execute()` 方法完整流程：validate -> resolve frame -> build bytes -> patch -> resolve target -> transport write -> return `SendResult`。
- send service 的 import 中无 report、northbound、result 模块（Grep 搜索确认：send 目录下 `import.*task|import.*report|import.*northbound|import.*result` 无匹配）。
- send 有 `SendResultEmitter` adapter port（可选），但仅用于通知发送结果本身，不承载 report/northbound 语义。
- `SendResult` 类型只有 `sent / build-error / target-unavailable / transport-error / timeout / cancelled`，无 report 或 northbound 状态。

**Red flag 3："SCOE 特例沉积在通用 receive/send 主链里"**

**已避免。** 证据：

- receive core（`processor.ts`、`frame-matcher.ts`、`field-parser.ts`、`expression-pass.ts`）是通用字节处理管线，无 SCOE 硬编码、无特殊分支。
- send core（`encode.ts`、`checksum.ts`、`frame-resolver.ts`）是通用构帧管线，无 SCOE 特例。`SendSource` 类型中 `'scoe'` 只是 source 标识之一，不触发特殊逻辑。
- SCOE 相关代码集中在 `rewrite/src/features/command-ingress/` 下（scoe-protocol-adapter.spec.ts 确认），是独立 feature。
- runtime 层 `feature-wiring.ts` 中 commandIngressService 独立创建（L4 层），不侵入 receive/send 主链。

#### §9 正向检查项补充确认

| 检查项 | 状态 | 证据 |
|--------|------|------|
| Receive: 输入、解析、归一、结果输出是否分开 | **是** | `bytes.ts`(归一)、`frame-matcher.ts`(匹配)、`field-parser.ts`(解析)、`processor.ts`(编排+输出) 职责分离 |
| Receive: 接收结果是否通过显式输出进入 task/status/result/storage/SCOE | **是** | routing-tick.ts 中 receive outcomes 通过 fanOutToDisplay、fanOutToStorage、ReceiveEventSourceBridge 分别路由到各消费方 |
| Receive: receive core 是否可单测 | **是** | `receive-core.spec.ts`、`receive-fake-input.spec.ts`、`receive-state-service-selector.spec.ts`、`expression-pass.spec.ts` 均存在 |
| Receive: 表达式、统计、trigger 等旧副作用是否有 oracle 说明 | **待确认** | expression-pass 有 spec 覆盖；统计用 statsDelta 增量结构。但无独立 oracle comparison 文件 |
| Send: 构帧、发送请求、目标落地、发送结果是否分开 | **是** | `encode.ts`(构帧)、`frame-resolver.ts`(字段解析)、`send-service.ts`(发送流程编排，含 validate -> build -> patch -> resolve target -> transport write) |
| Send: 发送结果是否不直接定义任务生命周期或报告结果 | **是** | SendResult 是纯数据快照，task 通过 SendService 公开 API 调用 send，task 自己管理生命周期 |
| Send: send core 是否可单测 | **是** | `send-core.spec.ts`、`send-checksum-patch.spec.ts`、`send-frame-resolver.spec.ts`、`send-integration.spec.ts`、`send-service-state-selector.spec.ts` |
| Send: 发送链是否没有硬编码 SCOE target、northbound 或 report 语义 | **是** | send core 无 SCOE/northbound/report import。target 通过 `SendTargetResolver` adapter port 注入，由 runtime 层 `ConnectionBackedTargetResolver` 实现 |

## 后续

1. **Oracle comparison 空白**是当前验证体系最大的结构性缺口。建议后续 feature 至少对 receive bytes -> match -> fields 链路建立 golden output oracle。
2. **Level 6-10 验证全无实质证据**。这不是设计缺陷（validation-baseline 已明确定义这些层级），而是项目当前阶段未到达硬件/打包/客户联调阶段。需在后续 roadmap 中为每一级明确 owner、时机和 blocker。
3. §8 高频数据项中"性能相关行为是否有压测/检查清单/运行时验证计划"这一项目前完全空白，需要在 receive-real 或 connection-real 进入实施时同步建立。
