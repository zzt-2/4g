---
doc_type: quality
type: rewrite-review-checklist
status: draft
date: 2026-04-28
summary: Review checklist for rewrite changes. This checklist verifies that a rewrite slice preserves legacy-visible behavior while respecting target structure, quality rules, Electron boundary, oracle evidence, and runtime validation limits.
tags:
  - rewrite
  - review
  - checklist
  - quality-gate
---

# Rewrite review checklist

## 1. Purpose

本文用于每轮重写实现完成后的审查。

它回答三个问题：

1. 旧系统可观测能力是否按默认保留口径处理。
2. 新代码是否遵守目标目录结构和质量红线。
3. 验证证据是否足够，哪些内容仍需 runtime / hardware validation。

本文不是实现计划，不定义字段 schema，不规定迁移批次。

## 2. Required Inputs

审查前必须读取：

- `codestable/compound/2026-04-28-rewrite-execution-charter.md`
- `codestable/compound/2026-04-28-rewrite-scope-default-preserve.md`
- `codestable/architecture/rewrite-target-structure.md`
- `codestable/quality/rewrite-quality-rules.md`
- `codestable/quality/rewrite-validation-fixture-oracle-baseline.md`
- `easysdd/compound/2026-04-27-legacy-feature-inventory-and-oracle-map.md`

如果本轮涉及甲方需求、SCOE 或 northbound，还必须读取对应材料：

- `codestable/architecture/domain-scoe-position.md`
- `codestable/architecture/boundary-northbound-collaboration-delivery.md`
- `refactor/docs/甲方文档/`

## 3. Review Outcome

每轮审查只给以下结论之一：

| Outcome | Meaning |
| --- | --- |
| `pass` | 范围、边界和验证证据均满足当前轮目标。 |
| `pass-with-known-gaps` | 语义和边界已锁定，代码可继续推进，但 runtime/hardware/package/customer 环境证据尚未完成并已明确登记。 |
| `revise-required` | 存在边界、功能范围或验证证据问题，需要修改后再过。 |
| `blocked` | 缺少用户决策、硬件条件、甲方口径或关键 baseline，不能继续声明完成。 |

不得用“看起来能跑”替代上述结论。

Outcome gate:

- 缺少 `Direct contract`、用户决策、甲方口径、关键 baseline、northbound 语义、阻断性 schema/枚举时，必须是 `blocked`。
- 存在边界违规、跨 feature 内部写入、runtime/store/composable 业务化、main 业务化时，必须是 `revise-required`。
- 只有语义已锁定但真实硬件、打包态、HTTP/FTP 或客户环境证据未完成，且每个 gap 都登记 validation level、owner、blocker 和后续验证方式时，才允许 `pass-with-known-gaps`。
- 缺少本轮触达旧行为的 evidence source、owner feature、strategy 和 validation level 时，必须是 `revise-required`；关键 oracle 或 evidence 缺失导致范围无法判断时，必须是 `blocked`。
- 用 static scan、Vitest unit、fixture test、oracle comparison、fake adapter test、build 或 lint 通过宣称 hardware、package、HTTP/FTP、northbound 或 customer closure 完成时，必须是 `revise-required`。

每轮 review 开头必须列：

- `Direct contract:` 当前轮正式合同。
- `Boundary guards:` 辅助边界材料。

## 4. Scope Preservation Checklist

必须检查：

- 本轮是否明确列出覆盖的旧功能域。
- 本轮是否说明保留了哪些旧系统用户可见行为。
- 本轮是否没有顺手删除页面入口、操作入口、历史能力或状态显示。
- 本轮触达的旧可观测行为是否按 `preserve`、`candidate drop`、`deferred`、`not touched` 做了最小登记。
- 如果某旧行为被排除，是否满足 `candidate to drop` 条件并有用户确认或明确证据。
- 如果旧 JSON 不兼容，是否说明迁移脚本或导入适配位置，而不是污染新核心模型。
- 如果甲方新需求与旧功能有 overlap，是否说明哪些是内部事实来源，哪些是 northbound gap。
- 第一批业务 feature design 是否填写 Legacy observable behavior ledger；ledger 至少登记旧可观测行为、owner feature、`preserve` / `candidate drop` / `deferred` / `not touched`、证据来源和 validation level。

Ledger rule:

- Legacy observable behavior ledger 只是设计和审查入口，用来防止默认保留口径依赖临时 prompt；它不是字段 schema，不是业务模型，也不定义接口 payload。

Red flags:

- 因为实现麻烦而把旧行为默默降级。
- 把“旧代码质量差”写成“旧功能不需要”。
- 把旧 history / CSV / file export 误写成已经完成 northbound report delivery。

## 5. Structure and Dependency Checklist

必须检查：

- 新代码是否落在 `rewrite/` 独立应用根目录内，而不是旧 `src/`、`src-electron/` 或 `public/`。
- 新 renderer 源码是否落在 `rewrite/src/`，新 Electron main/preload 是否落在 `rewrite/src-electron/main/` 和 `rewrite/src-electron/preload/`。
- 新文件是否落在 `app / platform / shared / features / runtime / pages / widgets` 的正确职责范围。
- feature 内是否按 `core / services / state / adapters / composables / components / fixtures / oracles / __tests__` 的实际职责放置。
- `core` 是否保持纯 TS，不依赖 Vue、Pinia、Electron、platform facade 或全局 store。
- `state` / store 是否只承载本 feature 的状态、read model、selector 和很薄的本域 action。
- `services` 是否作为业务用例入口，而不是把流程塞进 store、composable 或组件。
- `composables` 是否只做 UI-facing 组合，没有承载协议语义、任务状态机、统计累加或跨域流程。
- `pages` 和 `widgets` 是否只做交互、展示和调用公开入口。
- `runtime` 是否只做应用级装配和跨域编排，没有吞掉领域内部规则。
- `runtime` 是否只表达生命周期、调用顺序、路由和边界输入输出，没有承载协议判断、任务状态推进、统计含义、结果归因或 northbound 语义转换。
- `platform` 是否只做 renderer 侧桌面能力 facade，没有业务规则。
- 外部是否只通过 feature public API 访问该 feature。

禁止项：

- feature A 直接 import feature B 的内部 state 并修改。
- feature A 直接 import feature B 的内部 service、adapter、composable 或私有 helper。
- UI 组件直接访问 Electron、Node、串口、文件系统或 socket。
- store 创建 service、保存 platform adapter 或访问 Electron/Node 能力。
- composable 变成隐藏 service。
- 组件直接 import service 内部实现并绕过 feature composable 或 runtime 入口。
- `shared` 中出现 Vue/Electron/Pinia 依赖。
- `runtime` 变成所有 feature 依赖的杂物箱。

依赖注入必须检查：

- `runtime` 是否是 service、adapter 和上下文的组合根。
- service 依赖是否通过构造函数、工厂函数或明确 context 传入，便于测试替换。
- 是否没有全局 singleton service 到处 import。
- 跨 feature 协作是否通过公开 service 接口、runtime 编排、显式事件或边界输入输出。
- 是否没有为了形式化而引入无明确生命周期、测试收益或装配收益的复杂 DI 容器。

## 6. State Ownership Checklist

必须检查：

- 本轮是否说明主状态、派生态、展示态、记录态、缓存态各自归口。
- 主状态是否单点写入。
- 派生态、展示态、记录态、缓存态是否没有反向定义运行事实。
- 本地发送 task 是否没有被误当成甲方中心 task。
- 状态指示灯、历史记录、SCOE 测试工具记录是否没有被抬成运行主状态。

Red flags:

- 使用共享 store 回读来决定任务生命周期。
- receive/send/SCOE/status/report 各自宣布系统生命周期。
- 页面监控状态、接收缓存或历史记录成为事实源。

统计和 UI 投影必须检查：

- 静态资产、运行事实、统计 read model、UI snapshot 是否分开。
- frame list、字段定义、配置对象是否没有写入接收命中数、最近值、错误计数、速率等运行统计。
- 统计是否由对应 feature 按 `frameId`、`fieldId`、`targetId`、`taskId` 等稳定 key 增量维护。
- 高频统计是否使用 batch、delta、队列、节流或 snapshot，而不是全量替换大数组或大 store 对象。
- 页面和组件是否只消费只读投影，没有直接订阅底层高频事件并参与统计累加。
- 每个统计项是否说明 owner、reader、reset 时机、生命周期、是否持久化和验证方式。

统计 red flags:

- 统计字段写回 frame definition 或其他静态资产。
- 每次接收/发送事件触发 frame array 或页面主列表全量刷新。
- 用一个可写全局 store 同时承载静态资产、运行事实、统计和展示态。
- 通过全局事件总线隐式修改其他 feature 的内部 state。

## 7. Electron and Platform Checklist

必须检查：

- `nodeIntegration: false`。
- `contextIsolation: true`。
- `sandbox: false` 当前可接受，但不得借此打开 renderer Node 访问。
- renderer 是否只调用 `rewrite/src/platform` facade。
- preload 是否只暴露 typed API。
- 是否没有新增裸 `invoke/send/on`。
- main 是否只承接平台资源访问和生命周期。
- main 中如有高频数据处理，是否仅限平台侧缓冲、批处理、聚合、节流、队列或背压。
- 业务运算、协议语义、任务状态推进、报告语义和 northbound 领域规则是否仍留在可测试 TypeScript 层。
- 文件 API 是否有路径边界或 capability 限制。

Red flags:

- renderer 直接使用 `ipcRenderer`、`fs`、`path`、`net`、`serialport`。
- preload 暴露大而全 `window.electron` 能力包。
- main 进程开始承载 receive/send/SCOE/task/report 领域规则。
- 以性能为理由把业务运算或协议语义迁入 main 进程。
- 以减少 IPC 为理由把平台能力散落到页面或 store。
- 把旧 `src/api/common`、旧 preload 聚合、旧 `window.electron` 大包或旧 main business handlers 直接搬入 `rewrite/`。

## 8. High-Frequency Data Checklist

涉及串口、TCP、UDP、高速存储、SCOE 数据流时必须检查：

- 高频数据是否有批量、缓冲、聚合或节流策略。
- 涉及高频通道时，是否说明队列上限、溢出策略、合并窗口、延迟观察方式或替代验证理由。
- 哪些数据在 main 处理，哪些结果进入 renderer 是否明确。
- 是否避免逐包穿过 main -> renderer -> store -> 多 store 副作用链。
- 是否避免高频事件直接推动页面列表或静态资产全量刷新。
- UI snapshot 的刷新频率、分页、虚拟滚动或按需组合策略是否明确。
- 高速存储命中后是否明确记录是否短路普通 receive/display/trigger 链。
- 性能相关行为是否有 fixture、压测脚本、手工 checklist 或 runtime validation 计划。

Red flags:

- 高频字节流直接推动多个 store 副作用。
- UI 层参与逐包解析或高频存储判断。
- 统计更新写回 frame list 等静态资产导致全量刷新。
- main 根据业务规则决定接收数据的归类、短路、成功失败或报告语义。
- 高速存储规则被藏在普通 network handler 内而没有边界说明。

## 9. Receive and Send Checklist

Receive 必须检查：

- 输入、解析、归一、结果输出是否分开。
- 接收结果是否通过显式输出进入 task/status/result/storage/SCOE。
- receive core 是否可单测。
- 表达式、统计、trigger、状态指示灯等旧可观测副作用是否有 oracle 说明。

Send 必须检查：

- 构帧、发送请求、目标落地、发送结果是否分开。
- 发送结果是否不直接定义任务生命周期或报告结果。
- send core 是否可单测。
- 发送链是否没有硬编码 SCOE target、northbound 或 report 语义。

Red flags:

- receive 直接启动任务或写入任务完成状态。
- send 成功直接写 report 或 northbound response。
- SCOE 特例沉积在通用 receive/send 主链里。

## 10. Task Checklist

必须检查：

- 定时发送能力是否保留。
- 甲方任务/用例上下文与本地发送执行对象是否区分。
- pause / resume / stop / abort / completed 等语义是否没有沿用旧 send task 的局限。
- task 是否通过公开入口调用 send，而不是直接修改 send 内部状态。
- 任务状态推进是否可测试。

Red flags:

- 旧 `stop -> completed/removeTask` 被当成甲方 stop/abort 语义。
- 页面组件直接创建和启动任务状态机。
- task 从 receive cache 或 status view 回读事实补语义。

## 11. SCOE Checklist

涉及 SCOE 时必须检查：

- 是否声明 SCOE 是领域模块或边界例外。
- 固定 source、固定 target、命令语义、完成条件、反馈语义是否留在 SCOE 边界内。
- SCOE 进入 receive 是否通过显式领域入口。
- SCOE 进入 send 是否先翻译成显式发送请求。
- SCOE 进入 task 是否通过显式任务请求或运行输入。
- SCOE 测试工具记录是否没有被抬成运行主状态。
- 是否列出真实设备/协议时序的 runtime validation 项。

Red flags:

- 通用 receive/send 内部长期保留 SCOE hardcode。
- SCOE 通过共享状态回读判断任务完成。
- 未连接真实 SCOE 设备却宣称协议行为完成。

## 12. Storage, History, Import/Export Checklist

必须检查：

- 本地 JSON、history、CSV、高速存储、导入导出能力是否按默认保留口径处理。
- 旧 JSON 是否通过迁移脚本或导入适配进入新模型。
- 新核心模型是否没有为旧 JSON 格式让路。
- 打包态 data path、长期写入、备份和清理是否标注 runtime validation。
- history/CSV 是否只作为本地记录或 report 素材，不等同 northbound report delivery。

Red flags:

- 旧路径常量散落在业务页面。
- 旧 JSON 兼容判断进入核心领域类型。
- 文件读写缺少路径边界。

## 13. Result, Report, Northbound Checklist

必须检查：

- `result` 是否归口内部结果事实。
- `report` 是否归口报告对象和报告文件生成。
- `northbound` 是否归口对外接入、投影、交付、回执和错误语义转换。
- 外部任务、状态、心跳、结果、报告、文件回传是否没有直接进入内部主状态对象。
- 内部错误是否没有原样外泄为外部响应。

Red flags:

- 把旧 send task 当作 `setTestTask/controlTestTask`。
- 把 serial/network target 当作 northbound device/deviceId。
- 把 history/CSV 当作 TestReport 闭环。
- 把 report object 和 FTP/HTTP delivery 写成同一职责。

## 14. Oracle and Validation Checklist

每轮必须说明：

- static scan 覆盖什么。
- Vitest unit 覆盖什么。
- fixture test 覆盖什么。
- oracle comparison 覆盖什么。
- fake adapter test 覆盖什么。
- manual checklist 覆盖什么。
- runtime validation 覆盖什么。
- hardware validation 覆盖什么。
- package validation 覆盖什么。
- customer validation 覆盖什么。
- 哪些未验证项不能宣称完成。

Evidence registry 必须检查：

- 每个触达旧行为是否登记 observable behavior、evidence source、owner feature、`preserve` / `candidate drop` / `deferred` / `not touched`、validation level 和 blocker。
- 旧 JSON、history、CSV、截图、硬件观测和客户口径是否只作为 evidence/oracle/migration input，不被写成新架构 schema。
- feature design 是否预留 fixture/oracle 路径、expected output 或 golden comparison 策略。
- checklist item 的 `validation` 字段是否能映射到 `rewrite-validation-fixture-oracle-baseline.md` 的 taxonomy。

优先 fixture：

- frame asset 校验和迁移输入输出。
- receive bytes -> match -> fields -> expression/result。
- send frame build -> target request -> result。
- timed send / task state transition。
- SCOE command parse / checksum / completion condition。
- storage/history/CSV/legacy JSON migration。
- status mapping。
- result/report object generation。
- northbound request/response mapping。

必须 runtime 或 hardware validation：

- 真实串口枚举、连接、断开和事件顺序。
- TCP/UDP 断线、重连、高频数据和远端变化。
- SCOE 真实设备、timeout、状态循环和完成条件。

必须 package validation：

- packaged data path 是否可写、可备份、可清理。
- 打包态 extraResources、安装路径、长期写入、重启后恢复、权限和清理策略。

必须 customer validation：

- 甲方 schema、字段、枚举、状态、错误/拒绝语义。
- JSON TestReport、HTTP/FTP file delivery、回执、失败补偿和客户接收确认。

测试基线必须检查：

- Vitest 是否作为 core/service/adapter/selector 的默认单测栈。
- 页面交互是否列入 manual checklist，而不是只靠 Vitest。
- Electron runtime、package、hardware、customer validation 是否单独登记，且未被 Vitest 替代。

Auto-import 必须检查：

- 默认是否保持显式 import。
- 如引入 auto-import，是否只白名单 Vue、Vue Router、Pinia 等基础框架 API。
- 是否禁止自动导入 feature service、platform facade、runtime、store、feature public API、adapter 或带业务 owner 的 helper。

## 15. Review Report Template

每轮 review 建议按以下格式输出：

```text
Outcome: pass | pass-with-known-gaps | revise-required | blocked

Contract:
- Direct contract:
- Boundary guards:

Scope:
- Covered domains:
- Preserved legacy-visible behavior:
- Legacy behavior ledger:
- Candidate drops:

Boundary:
- Files by top-level area:
- Cross-feature interactions:
- Boundary exceptions:

State:
- Main state owner:
- Derived/display/record/cache states:

Electron/platform:
- New platform APIs:
- Preload/main changes:
- IPC pattern:

Validation:
- Static scan:
- Vitest unit:
- Automated fixtures:
- Oracle comparison:
- Fake adapter tests:
- Manual checklist:
- Runtime validation:
- Hardware validation:
- Package validation:
- Customer validation:
- Not verified:

Findings:
- High:
- Medium:
- Low:
```

## 16. Fast Path

为了不把审查流程写得过重，小改动可以走 fast path。

Fast path 条件：

- 只影响一个 feature。
- 不新增 Electron/preload/main API。
- 不新增跨 feature 状态写入。
- 不涉及 northbound、SCOE、高速数据、旧 JSON 迁移或 report delivery。
- 有明确自动测试或手工验证证据。
- 已显式否定 public API、runtime 编排、统计 read model、旧行为 oracle 的影响。

Fast path 仍必须说明：

- 覆盖的旧行为。
- 文件归口。
- 验证证据。
- build/lint 状态；纯文档或规则修改未运行时，必须说明原因。

不满足任一条件时，回到完整 checklist。
