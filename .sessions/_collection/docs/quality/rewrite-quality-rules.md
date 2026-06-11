---
doc_type: quality
type: rewrite-quality-rules
status: draft
date: 2026-04-28
summary: Quality rules for the full rewrite. These rules preserve legacy-visible capabilities by default while preventing old coupling, global state leakage, and Electron boundary drift from reappearing.
tags:
  - rewrite
  - quality
  - boundary
  - electron
  - review
---

# Rewrite quality rules

## 1. Purpose

本文定义全面重写阶段的质量红线。

这些规则服务于一个目标：旧功能默认保留，但旧代码组织、旧全局状态穿透、旧模块耦合和旧 Electron 暴露方式不保留。

本文不定义字段 schema，不写接口契约，不制定迁移批次，也不裁剪旧功能范围。功能范围以前置范围文档为准：`codestable/compound/2026-04-28-rewrite-scope-default-preserve.md`。

## 2. Source Documents

必须继承：

- `codestable/compound/2026-04-28-rewrite-scope-default-preserve.md`
- `codestable/architecture/rewrite-target-structure.md`
- `codestable/quality/rewrite-validation-fixture-oracle-baseline.md`
- `easysdd/compound/2026-04-27-legacy-feature-inventory-and-oracle-map.md`

可作为证据来源：

- `codestable/architecture/boundary-runtime-state-ownership.md`
- `codestable/architecture/topology-receive-send-mainlines.md`
- `codestable/architecture/domain-task-system-ownership.md`
- `codestable/architecture/domain-scoe-position.md`
- `codestable/architecture/boundary-northbound-collaboration-delivery.md`
- `codestable/compound/2026-04-24-project-quality-conventions-system-analysis.md`

## 3. Rule Status

| Status | Meaning |
| --- | --- |
| MUST | 违反后不得合入重写主线。 |
| SHOULD | 默认遵守；若例外，必须写明理由和替代验证。 |
| MAY | 可选做法，不作为门禁。 |

## 4. Hard Rules

### R1. Preserve behavior, replace structure

MUST:

- 默认保留旧系统用户可见能力。
- 只在明确低价值、高成本、冲突或旧占位时，才把功能列入排除候选。
- 将旧功能重写到新的边界中，而不是把旧目录、旧 store 和旧 IPC 复制一遍。

MUST NOT:

- 因为质量规则而顺手砍旧功能。
- 把“旧代码很脏”理解成“旧行为不重要”。
- 把未讨论的功能降级成 future work。

### R2. Feature ownership must be explicit

MUST:

- 按 `features/frame`、`connection`、`receive`、`send`、`task`、`scoe`、`storage`、`settings`、`status`、`result`、`report`、`northbound` 归口业务能力。
- 每个 feature 只能直接修改自己的状态。
- 跨 feature 流程必须通过公开 service、runtime 编排、显式事件或边界输入输出发生。
- 每个 feature 的外部入口必须明确；外部只能通过 public API 调用，不直接依赖内部实现。

MUST NOT:

- feature A 直接 import feature B 的内部 `state` 并修改。
- feature A 直接 import feature B 的内部 service、adapter、composable 或私有 helper。
- 用一个大 store 同时承载主状态、展示态、缓存态、任务调度和多下游副作用。
- 让页面组件长期持有运行主状态或任务生命周期事实。

### R3. Core logic must be testable TypeScript

MUST:

- 将 receive 解析、send 构帧、SCOE 协议、task 状态推进、storage 迁移、result/report 生成等核心规则放在可测试的 TypeScript 层。
- `features/*/core` 不依赖 Vue、Pinia、Electron、`window.electron`、`ipcRenderer`、`fs`、`serialport`。
- 核心逻辑通过明确输入和输出表达行为。

MUST NOT:

- 把解析、构帧、协议校验、任务推进写在 Vue 组件里。
- 在 core 逻辑里读取全局 store 补上下文。
- 在 core 逻辑里直接访问平台能力。

### R4. UI is not the business workflow owner

MUST:

- 页面和组件只负责用户交互、表单状态、展示和调用公开入口。
- 复杂流程由 feature service 或 runtime 编排承接。
- composable 只做 UI-facing 组合，例如表单状态、对话框状态、生命周期订阅、selector 组合和调用公开 service。

MUST NOT:

- UI 组件直接创建并启动任务状态机。
- UI 组件直接读写文件、串口、网络 socket。
- UI 组件直接修改其他 feature 的内部状态。
- UI 组件承担导入校验、任务策略分支、实例引用检查等完整业务流程。
- composable 承载协议解析、任务状态机、统计累加、跨域业务流程或跨 feature 写状态。

### R5. Electron capability boundary must stay narrow

MUST:

```ts
nodeIntegration: false
contextIsolation: true
sandbox: false
```

MUST:

- renderer 只通过 `rewrite/src/platform` facade 访问桌面能力。
- preload 只暴露 typed API。
- main 只承接平台资源访问和生命周期。
- main 可以承接与平台资源绑定且性能压力明显的高频数据缓冲、批处理、聚合、节流、队列和背压。
- 文件、串口、网络、定时器、窗口能力都要有明确 platform API。

MUST NOT:

- 暴露裸 `invoke/send/on`。
- 在 renderer 直接使用 `ipcRenderer`、`fs`、`path`、`net`、`serialport`。
- 把领域业务规则放进 main 进程。
- 把业务运算、协议语义、任务状态推进、报告语义或 northbound 领域规则搬进 main 进程。
- 允许任意路径读写成为常规业务 API。

### R6. IPC must be coarse-grained and intentional

MUST:

- 以业务能力为单位设计 typed platform API。
- 对高频串口/网络数据使用批量、缓冲、聚合或节流策略。
- 明确哪些数据在 main 处理、哪些结果进入 renderer。
- 性能处理优先使用数据流设计、队列、背压、采样和事件压缩，不用主进程业务化换取表面简单。

MUST NOT:

- 为每个组件动作散落一堆小 IPC。
- 高频字节流逐包无节制穿透到页面和全局 store。
- 让 IPC 通道名成为业务流程本身。

### R7. Runtime state must have one owner

MUST:

- 区分主状态、派生态、展示态、记录态、缓存态。
- 主状态单点写入。
- 派生态、展示态、记录态、缓存态只能消费或展示事实，不得反向塑造主状态语义。
- store 只承载本 feature 的状态、read model、selector 和很薄的本域 action。

MUST NOT:

- 用接收缓存、页面监控状态、历史记录状态、测试工具状态替代运行主状态。
- 让 receive/send/SCOE/status/report 各自宣布系统当前生命周期。
- 让本地发送 task 直接等同甲方中心 task。
- 把 store 当作 service locator、跨域编排器或平台能力入口。
- store A 直接修改 store B 的内部 state。

### R8. Receive and send chains must remain explicit

MUST:

- receive 主链只承接输入、解析、归一和输出明确接收结果。
- send 主链只承接发送请求、构帧、目标落地和输出发送结果。
- receive/send 与 task、SCOE、storage、status、result 通过显式输入输出交互。

MUST NOT:

- receive 主链直接决定任务生命周期。
- send 主链硬编码 SCOE、northbound 或 report 语义。
- 把显示、历史、触发、SCOE、统计继续作为 receive 解析尾部同步副作用堆在一起。

### R9. SCOE must be a declared domain exception

MUST:

- 将 SCOE 作为领域模块或领域例外处理。
- 固定来源、固定目标、命令语义、完成条件、反馈语义、测试工具记录都应归在 SCOE 边界内。
- SCOE 进入 receive/send/task 时，必须通过显式领域入口、显式发送请求或显式任务请求。

MUST NOT:

- 把 SCOE 固定 source/target 硬编码在通用 receive/send 主链里。
- 让 SCOE 通过共享状态回读定义任务是否完成。
- 把 SCOE 测试工具记录抬成统一运行主状态。

### R10. Northbound must be a boundary, not a feature shortcut

MUST:

- `northbound` 独立承接中心协同接入、对外投影、对外交付和外部错误语义。
- 外部任务、状态、心跳、结果、报告、文件回传都必须经过 northbound 边界转换。
- northbound 从 task/status/result/report/storage 读取内部事实或素材，但不得直接定义这些内部事实。

MUST NOT:

- 把旧 send task 当作 `setTestTask/controlTestTask`。
- 把 history/CSV 当作 TestReport 交付闭环。
- 把 serial/network target 当作 northbound device/deviceId。
- 把外部成功/失败/拒绝/不可执行语义散落到 task/send/report/storage 内部。

### R11. Result, report, delivery must stay separate

MUST:

- `result` 归口内部结果事实。
- `report` 归口报告对象和报告文件生成。
- `northbound` 归口对外交付、回执和错误语义转换。

MUST NOT:

- 因为报告交付失败而反向改写内部结果事实。
- 在 task/send/receive 中直接拼外部报告。
- 把报告对象生成和 FTP/HTTP 上传写成同一个职责。

### R12. Legacy JSON compatibility must not pollute new models

MUST:

- 旧 JSON 通过迁移脚本或导入适配进入新模型。
- 新核心类型和存储结构按重写后的业务边界设计。

MUST NOT:

- 为兼容旧 `framesConfig` 或旧路径常量扭曲新领域模型。
- 在新核心逻辑里到处判断旧 JSON 形态。
- 把旧 data path 直接固化为新长期存储设计。

### R13. Statistics must not pollute source models

MUST:

- 将静态资产、运行事实、统计 read model 和 UI snapshot 分开。
- 帧定义、字段定义、表达式和展示配置等静态对象只表达配置事实。
- 接收命中数、最近值、错误计数、速率、发送结果等统计由对应 feature 的 read model 按稳定 key 增量维护。
- 高频统计更新使用 batch、delta、队列、节流或 snapshot，避免全量替换大对象。
- 每个统计项必须有明确 owner、reader、reset 时机、生命周期、是否持久化和验证方式。

MUST NOT:

- 把运行统计写回 frame list、字段定义、配置对象或其他静态资产对象。
- 为了页面展示把多个 feature 的状态揉成一个可写全局对象。
- 让页面组件订阅底层高频事件并参与统计累加。
- 通过全局事件总线隐式修改其他 feature 的内部 state。
- 用全量刷新 frame array 或大 store 对象响应每次接收/发送事件。

### R14. Services and dependency wiring must stay explicit

MUST:

- feature service 作为业务用例入口，负责调用 core、写入本 feature store、调用 adapter 或通过公开接口协作。
- `runtime/` 作为组合根，负责 service、adapter 和上下文的创建、显式注入和释放。
- 依赖通过构造函数、工厂函数或明确 runtime context 传入，以便测试替换。
- 组件和页面通过 feature composable 或 runtime 页面级 API 调用公开入口。

MUST NOT:

- 使用全局 singleton service 到处 import。
- 在 store 中创建 service、保存 platform adapter 或访问 Electron/Node 能力。
- 组件直接 import service 内部实现并绕过 composable / runtime 入口。
- 为了“解耦”引入无明确生命周期、测试收益或跨域装配收益的复杂 DI 容器。
- 让 service 绕过公开接口直接修改其他 feature 的内部 state。

### R15. Contracts and gate outcomes must be explicit

MUST:

- 每轮实现和审查必须列出 `Direct contract` 与 `Boundary guards`。
- 直接合同缺失、用户决策缺失、甲方口径缺失、关键 baseline 缺失时，结论必须是 `blocked`。
- 边界违规、跨 feature 内部写入、runtime/store/composable 业务化、main 业务化时，结论必须是 `revise-required`。
- `pass-with-known-gaps` 只用于语义已锁定但 runtime/hardware/customer 环境验证尚未完成的情况。

MUST NOT:

- 用 handoff、摘要、临时 prompt 或边界护栏替代正式直接合同。
- 用 `pass-with-known-gaps` 掩盖 northbound 语义、schema/枚举、task/case、deviceId、stop 状态、result/report/delivery 口径缺失。
- 用 build/lint 通过替代合同完整性、边界合规性或 runtime/hardware 证据。

### R16. Rewrite infrastructure must stay minimal and explicit

MUST:

- 将 `rewrite/` 作为新的独立应用根目录，而不是只把源码挪到一个子目录。
- 新 renderer 源码落在 `rewrite/src/`，新 Electron 边界落在 `rewrite/src-electron/main/` 和 `rewrite/src-electron/preload/`。
- 从旧配置复用依赖类别和构建能力前，重新收缩 package scripts、Quasar entry/boot、Electron entry、public/extraResources、tsconfig、ESLint、UnoCSS、Vitest 和 auto-import 配置。
- 使用 Vitest 作为 `core`、`services`、`adapters`、`selectors` 的默认单测栈。
- 页面交互先以 manual checklist 验证；Electron runtime、package、hardware 和 customer validation 单独登记。

MUST NOT:

- 把旧 Quasar boot、旧 `src/api/common`、旧 `window.electron`、旧 preload 聚合、旧 main business handlers 或旧 `public` 数据目录策略原样搬入 `rewrite/`。
- 用 Vitest 声明 Electron runtime、打包态 package、真实串口/TCP/UDP/SCOE 硬件或 customer closure 已完成。
- 用 auto-import 隐藏业务依赖；若引入 auto-import，只允许 Vue、Vue Router、Pinia 等基础框架 API，禁止自动导入 feature service、platform facade、runtime、store、feature public API、adapter 或带业务 owner 的 helper。

### R17. Expression conditions must evaluate to boolean `true`

MUST:

- Expression condition 表达式必须求值为 `boolean true`（`=== true` 严格比较）。
- 所有 expression condition 必须是显式比较表达式（`>`、`<`、`==`、`>=`、`<=`、`!=`）或布尔字面量 `'true'`/`'false'`。

MUST NOT:

- 裸数字作为 condition（`'1'` 求值为数字 1，不触发分支）。
- 裸变量作为 condition（`'x'` 求值为变量值，非布尔时不触发）。

WHY: `evaluateConditional` 使用 `condValue === true` 严格比较。`'1'`、`'x'`（x 为正数）等 truthy 值不触发条件分支。此行为同时影响 receive expression-pass 和 send frame-resolver，是表达式消费方最容易犯的错误。

### R18. Config layer merging must not silently drop safety constraints

MUST:

- 配置分层合并（卫星覆盖基础、实例覆盖模板、子 scope 覆盖父 scope）时，子层省略的安全约束字段必须显式继承自父层。
- 若子层确认需要降级或去掉某个安全约束（如去掉 checksum），必须在配置中显式标记（如 `checksumOverride: 'none'`），不允许靠"省略字段"隐式跳过。

MUST NOT:

- 靠子配置省略字段来静默跳过父配置的校验和、范围检查、方向校验等安全约束。
- 在合并逻辑中用"有子配置就用子配置、否则用父配置"的简单覆盖策略处理安全相关字段。

WHY: SCOE adapter 的 `getCommandConfigs()` 合并卫星配置 + 基础配置时，卫星版同名 command 覆盖基础版。如果卫星 `send_frame` 没配 checksums，基础版带 checksum 的 `send_frame` 就被静默替换，校验和验证消失。任何"子配置覆盖父配置"的场景都有此风险。

## 5. Boundary Exceptions

边界例外允许存在，但必须登记。

每个例外至少写明：

- 例外名称。
- 所属 feature。
- 为什么不能表达为通用输入 / 输出。
- 正式入口。
- 正式输出。
- 消费者。
- 自动 fixture、手工 checklist 或 runtime validation 方式。

已知例外候选：

- SCOE 固定来源进入 receive。
- SCOE 固定目标进入 send。
- SCOE 领域完成条件。
- 高速存储命中后短路普通 receive/display/trigger 链。
- northbound 外部拒绝、不可执行、失败语义转换。

## 6. Anti-Patterns

以下模式在重写代码中默认判为质量问题：

- 页面组件里直接写串口、网络、文件、SCOE 协议或任务状态机。
- store 互相 import、互相修改内部状态。
- `receive` 逻辑直接调用 `send/task/storage/status` 的内部状态。
- `send` 逻辑硬编码 SCOE target 或 northbound 语义。
- `scoe` 逻辑散落在 receive/send/task 多处。
- main 进程写领域业务规则。
- preload 暴露裸 IPC 或大而全 `window.electron` 能力包。
- 高频数据逐包穿过 main -> renderer -> store -> 多 store 副作用链。
- 高频统计写回帧列表或静态配置对象，导致页面全量刷新。
- 页面组件直接订阅底层高频事件并累加统计。
- 用一个可写全局 store 同时承载静态资产、运行事实、统计和 UI 展示态。
- store 变成跨域 service locator 或平台能力入口。
- composable 变成隐藏业务 service。
- 组件直接 import service 内部实现并绕过公开入口。
- 为旧 JSON 兼容把新模型设计扭歪。
- 为了架构感堆 manager/event/command，但没有明确生命周期、跨域流程或验证收益。

## 7. Required Review Evidence

每个重写功能域合入前，至少提供：

- 合同说明：`Direct contract` 和 `Boundary guards` 分别是什么。
- 行为范围说明：保留了哪些旧可观测能力。
- 边界说明：代码落在哪些 feature，依赖方向是否符合 `rewrite-target-structure.md`。
- 状态说明：主状态、派生态、展示态、记录态、缓存态分别在哪里。
- 统计说明：统计 read model 的 owner、key、reset 时机、生命周期、UI snapshot 更新策略。
- 分层说明：core、store、service、adapter、composable、page/component 各自承担什么。
- 注入说明：service / adapter / runtime context 如何创建和替换，是否存在全局 singleton。
- Electron 说明：是否通过 `platform` facade，是否新增 preload/main API。
- validation 说明：按 `rewrite-validation-fixture-oracle-baseline.md` 区分 static scan、Vitest unit、fixture test、oracle comparison、fake adapter test、manual checklist、runtime validation、hardware validation、package validation、customer validation 分别覆盖什么。
- evidence 说明：触达旧行为时，登记 observable behavior、evidence source、owner feature、`preserve` / `candidate drop` / `deferred` / `not touched`、validation level 和 blocker。
- oracle 说明：fixture、legacy sample、golden output、截图、硬件观测或客户口径的来源、owner 和使用边界。
- 例外说明：是否存在 SCOE、高速存储、northbound 或其他边界例外。
- 涉及旧行为时，说明触达的旧可观测行为是 `preserve`、`candidate drop`、`deferred` 还是 `not touched`。

不得以“能跑”替代上述说明。

## 8. Minimum Test Expectations

后续实现时，以下能力应优先形成独立测试或 fixture：

- frame asset 校验和迁移输入输出。
- receive bytes -> match -> fields -> expression/result。
- send frame build -> target request -> result。
- timed send / task state transition。
- SCOE command parse / checksum / completion condition。
- storage/history/CSV/legacy JSON migration。
- status mapping。
- result/report object generation。
- northbound request/response mapping。

Vitest 是 core/service/adapter/selector 的默认单测栈。页面交互先走 manual checklist。真实串口、TCP/UDP、SCOE 设备、Electron runtime、打包态 package data path、HTTP/FTP 交付和 customer closure 仍需要 runtime、hardware、package 或 customer validation，不能只靠 Vitest 或 fixture 宣称完成。

每个 feature 的 design 和 checklist 必须预留测试项：

- feature 内 fixture、oracle 和 expected output 的放置位置。
- 自动验证项对应 static scan、Vitest unit、fixture test、oracle comparison 或 fake adapter test 的哪一层。
- 页面入口、文件对话框、设置、状态显示等 manual checklist 项。
- Electron runtime、打包态 data path、真实串口/TCP/UDP/SCOE、高速链路、HTTP/FTP、northbound 和 customer closure 是否涉及，以及未验证时的 blocker。
- completion claim 中必须明确哪些验证已完成、哪些没有声明完成。

### 集成测试编写规范

测试必须测真实的东西，不测运行时的内部调度：

- **禁止复制生产代码到测试文件**。如果测试需要访问某个未导出的类或函数，优先从生产代码中 `export` 它（可标注 `@internal`），不要在测试文件里抄一份。复制品不会随生产代码同步更新，等于没测。
- **禁止用 setTimeout(0)、Promise 竞争、advanceTimersByTime(0) 等手段测试调用顺序**。调用顺序依赖 V8 microtask 队列的内部调度，在 CI 环境不稳定。改为用因果链验证：A 失败时 B 是否仍被调用、A 成功时 B 是否收到正确输入。
- **测试中发现的一行可修 bug，当场修掉并更新测试期望**。不要把生产 bug freeze 成 `expect().rejects.toThrow()` 或"known behavior"就放过。修法包括：加 null check、补 await、移除 `!` non-null assertion。修完后测试期望从"会崩"改为"正确处理"。
- **ConditionTerm 的 AND/OR 组合是左结合、无优先级**。`A AND B OR C` 的实际求值是 `(A AND B) OR C`，不是 `A AND (B OR C)`。多条件混合 AND/OR 时，必须在设计文档和 checklist 中显式标注期望的求值顺序，不允许依赖"C 风格优先级"的直觉。

## 9. Quality Gate

进入实现前：

- 必须确认目标功能域和目录归口。
- 必须确认是否涉及 northbound gap 或 SCOE 例外。
- 必须确认旧行为 oracle 来源。
- 必须确认直接合同和边界护栏。
- 必须确认本 feature 的 validation level、fixture/oracle 位置、fake adapter 计划、manual checklist、runtime/hardware/package/customer blocker。

实现过程中：

- 不新增裸 IPC。
- 不新增跨 feature 内部状态写入。
- 不绕过 feature public API 访问内部实现。
- 不把平台能力引入 core。
- 不把运行统计写回静态资产或全局大对象。
- 不把 store、composable 或组件扩成业务 service。
- 不把未讨论的字段/schema 写成长期契约。

完成前：

- 必须提供验证证据。
- 必须按 `rewrite-validation-fixture-oracle-baseline.md` 的 completion template 说明 static scan、Vitest unit、fixture test、oracle comparison、fake adapter test、manual checklist、runtime validation、hardware validation、package validation、customer validation 的结果或未运行原因。
- 必须说明未验证的 runtime/hardware/package/customer 项。
- 必须说明是否有 candidate to drop 或 deferred 项。
- 没有验证证据，不宣称完成。
- 不得用 Vitest、fixture、fake adapter、build 或 lint 通过宣称真实硬件、打包态、HTTP/FTP、northbound 或 customer closure 完成。

## 10. Current Evidence Notes

以下旧代码事实支撑本文规则：

- `receiveFramesStore` 已承接接收、SCOE 处理和触发发送任务链路，职责边界偏宽。`src/stores/frames/receiveFramesStore.ts:116-130`, `src/stores/frames/receiveFramesStore.ts:911-1040`, `src/stores/frames/receiveFramesStore.ts:1155-1166`
- 串口和网络高频数据存在主进程/renderer/store 逐包穿透路径。`src/stores/serialStore.ts:392-417`, `src-electron/main/ipc/networkHandlers.ts:480-520`, `src/stores/netWorkStore.ts:207-213`
- preload 暴露面和文件/path API 边界需要收口。`src-electron/preload/index.ts:1-31`, `src-electron/preload/api/files.ts:1-43`, `src-electron/main/ipc/fileMetadataHandlers.ts:8-119`, `src-electron/preload/api/path.ts:16`
- `networkHandlers` 在网络接收主路径中内嵌高速存储分流。`src-electron/main/ipc/networkHandlers.ts:505-516`
- `scoeStore` 同时承担配置持久化、状态、TCP/UDP 连接生命周期、发送调度和测试工具状态。`src/stores/scoeStore.ts:1-24`, `src/stores/scoeStore.ts:78-110`, `src/stores/scoeStore.ts:252-310`
- `useUnifiedSender` 发送成功后跨 store 更新统计，并硬编码 SCOE UDP target 特例。`src/composables/frames/sendFrame/useUnifiedSender.ts:149-165`
- 发送相关 UI 组件直接创建并启动 task。`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:260-274`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:645-754`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:359-362`

这些证据用于说明旧实现问题，不用于否定旧功能价值。
