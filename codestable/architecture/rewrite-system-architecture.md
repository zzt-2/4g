---
doc_type: architecture
type: rewrite-system-architecture
status: draft
date: 2026-04-29
summary: Global pre-design architecture blueprint for the Dongfanghong rewrite. This document synthesizes the Batch 0 target structure, quality rules, review gate, domain order, and read-only legacy-code findings without defining schemas or feature internals.
tags:
  - rewrite
  - system-architecture
  - batch-0
  - blueprint
  - boundary
---

# Rewrite system architecture

## 1. Research findings summary

本节只记录本轮只读调研事实和由事实支撑的架构风险。旧代码事实可以作为迁移输入、oracle 候选和风险证据，不能直接升级为新系统架构。

Evidence:

- 当前 renderer 入口是单根路由、主布局和页面入口结构。`src/App.vue` 只承载路由视图，`src/router/routes.ts` 统一列出 `/connect`、`/frames/list`、`/frames/editor`、`/frames/send`、`/frames/receive`、`/settings`、`/storage`、`/history`、`/scoe` 等页面入口。
- 当前 `src` 下存在 `pages`、`components`、`composables`、`stores`、`utils`、`api/common`、`layouts` 等目录，但没有目标架构中的 `app`、`platform`、`shared`、`features`、`runtime`、`widgets` 目录。
- 现有页面和组件已有业务域雏形，例如 `components/frames`、`components/connect`、`components/storage`、`components/scoe`、`composables/frames`、`stores/frames`，可作为重写归口时的旧入口映射依据。
- 现有跨域运行链路耦合明显：`serialStore` 和 `netWorkStore` 接收数据后直接调用 `receiveFramesStore.handleReceivedData`；`receiveFramesStore`、`sendTasksStore`、`useSendTaskExecutor`、`useSendTaskTriggerListener`、`scoeStore`、`statusIndicators`、`globalStatsStore` 等形成多点读写和副作用链。
- 现有平台能力已有三段式雏形：`src-electron/main/ipc/*` 注册 handler，`src-electron/preload/api/index.ts` 聚合 preload API，`src/api/common/*Api.ts` 在 renderer 侧包装 `window.electron`。这说明能力分域可以作为 evidence，但当前正式目标必须收口到 `rewrite/src/platform` facade。
- Electron 当前窗口配置已符合重写方向：`nodeIntegration: false`、`contextIsolation: true`、`sandbox: false`。但 `src/api/common/*`、`src/composables/window/useWindowControls.ts` 仍直接访问 `window.electron`，`src/utils/common/ipcUtils.ts` 在 renderer 树下 import `electron.ipcMain`，说明平台边界尚未按目标架构隔离。
- 现有 main 进程中有业务化风险：`receiveHandlers`、`dataStorageHandlers`、`historyDataHandlers`、`highSpeedStorageHandlers`、`networkHandlers` 等不只是平台桥接，还包含接收、存储、历史、高速数据或状态语义相关处理。它们是迁移风险，不是目标职责。
- 高频数据当前存在即时推送路径：串口、网络和定时器事件从 main/preload/API/store 进入 renderer，最后推动多个 store、统计和 UI 展示。现有路径可作为性能风险证据，不能照搬为目标数据流。
- 共享能力现状是 `utils`、`composables/common`、`components/common` 分散承载。文件对话能力在 `layouts/useFileDialog.ts`、`composables/common/useFileDialog.ts`、`utils/common/fileDialogManager.ts`、`utils/common/dialogUtils.ts` 中重复实现；`ImportExportActions`、`UniversalChart`、`UniversalChartSettingsDialog` 已呈现跨页面 widget 倾向；`frames/sendFrame/*` 和 `scoe/*` 仍有强业务语义，不能抽成纯 shared 工具。

Inference:

- 新架构应保留旧系统页面入口和可观测能力，但不能保留旧 store、composable、main handler 的耦合关系。
- `api/common`、preload 聚合和 main IPC 分域提供了迁移参照，但正式边界必须是 renderer 通过 `platform` facade 访问 typed preload API，main 只保留平台资源和必要的平台侧高频处理。
- `shared` 和 `widgets` 只能收敛真正跨 feature、语义稳定、无业务 owner 的能力；带有 frame、send、receive、task、SCOE、storage 语义的能力默认留在 feature 内。

## 2. Architecture judgement

本轮架构判断：

1. `codestable/architecture/rewrite-target-structure.md` 仍是目录、依赖方向和 feature 归口的 canonical 基线。本文只把它收敛成后续 feature design 更易引用的整体蓝图，不另起第二套规则。
2. 目标架构按业务能力和平台边界重建，不按旧文件热点、旧 store、旧 composable 或旧 main handler 迁移。
3. `features/*` 是领域规则、状态和领域内 UI 的归口；`runtime/` 是按需装配和跨 feature 编排层，不是新的全局业务中心。
4. renderer 平台能力只能经 `rewrite/src/platform` facade 访问 typed preload API；main process 只承接平台资源、生命周期和必要的平台侧高频缓冲，不承载领域规则。
5. 状态必须分层：静态资产、运行事实、统计 read model、UI snapshot 分别有 owner 和写入权。统计不得写回 frame definition、字段定义或配置对象。
6. 高频链路按 batch、delta、queue、throttle、snapshot、backpressure 设计，页面和组件不直接消费底层逐包事件。
7. feature public API 只是跨 feature 访问边界。没有外部消费者时不强制 `public.ts`，不强制 event bus、command bus 或复杂 DI 容器。
8. 后续 feature design 必须先回答架构前置问题，再进入实现；遇到 northbound、SCOE、高速存储、真实串口、TCP/UDP、打包态 data path、HTTP/FTP 时，必须显式登记 runtime 或 hardware validation。

## 3. Direct contract and boundary guards

Direct contract:

- `AGENTS.md`
- `codestable/architecture/rewrite-target-structure.md`
- `codestable/quality/rewrite-quality-rules.md`
- `codestable/quality/rewrite-review-checklist.md`
- `codestable/compound/2026-04-28-rewrite-execution-charter.md`
- `codestable/compound/2026-04-29-rewrite-domain-order-and-first-batches.md`

Boundary guards:

- `codestable/compound/2026-04-28-rewrite-scope-default-preserve.md`
- `codestable/compound/2026-04-28-northbound-overlap-and-gap-map.md`
- 现有 `src`、`src-electron` 和 `public` 代码，只作为旧系统事实、oracle 候选和迁移风险证据。

本文不替代质量规则、review checklist、northbound gap map 或后续 feature design。若本文与上述直接合同冲突，以直接合同中更具体的规则为准。

## 4. Goals and non-goals

Goals:

- 固定后续所有 feature design 共同遵守的系统级架构蓝图。
- 保留旧系统可观测业务行为和页面入口，同时替换旧代码组织、全局状态穿透、跨模块耦合和旧 Electron 暴露方式。
- 明确 `app / platform / shared / features / runtime / pages / widgets` 的职责边界、禁止事项和依赖方向。
- 明确 feature owner、runtime 使用条件、feature public API 轻量规则、状态分层、高频数据流原则、Electron 边界、UI 边界和验证策略。
- 给后续 `feature boundaries`、`interaction matrix`、`shared/tooling plan`、`pre-design gate` 对话提供统一入口。

Non-goals:

- 不写业务代码。
- 不设计 receive、send、task、SCOE、result、report、northbound 的内部流程。
- 不写字段 schema、事件 payload、接口签名、northbound 字段、枚举或错误码。
- 不为每个 feature 预设 `public.ts`。
- 不创建复杂 runtime、DI、event bus 或 command bus 方案。
- 不把旧代码目录、旧 store、旧 IPC、旧 main handler 组织照搬成新架构。
- 不把 `refactor/docs`、旧代码或本轮调研摘要当成新的长期接口合同。

## 5. Root placement and target source structure

Root placement:

- `rewrite/` 是新的独立应用根目录，不只是源码目录。
- 新 renderer 源码根为 `rewrite/src/`。
- 新 Electron 边界从 `rewrite/src-electron/main/` 与 `rewrite/src-electron/preload/` 开始。
- 旧 `src/`、`src-electron/`、`public/` 只作为旧系统 evidence、oracle 或 migration input，不作为新代码落点。
- 当前项目根 `package.json`、`quasar.config.ts`、`tsconfig.json`、`eslint.config.js`、`uno.config.ts` 可作为依赖和配置 evidence；`rewrite/` 下的配置必须重新收缩，不能原样搬旧 Quasar boot、旧 public data path、旧 preload 聚合、旧 main handler 或旧 `src/api/common`。

目标结构以 `rewrite-target-structure.md` 为准：

```text
rewrite/
  src/
    app/
    platform/
    shared/
    features/
      frame/
      connection/
      receive/
      send/
      task/
      scoe/
      storage/
      settings/
      status/
      result/
      report/
      northbound/
    runtime/
    pages/
    widgets/

  src-electron/
    main/
    preload/
```

这些目录是职责边界，不是一次性脚手架。只有当对应能力进入 feature design 或实现时，才创建必要目录和文件。

feature 内部通用分层仍按 `rewrite-target-structure.md` 执行：

```text
features/<feature>/
  core/
  services/
  state/
  adapters/
  composables/
  components/
  fixtures/
```

按实际职责创建，不为了填满模板而建空层。

Infrastructure baseline:

- 可复用 Vue/Quasar/Pinia/Router/UnoCSS/Electron/serialport/TypeScript/ESLint 等依赖类别和安全窗口配置。
- 禁止直接搬旧 Quasar boot、旧 `src/api/common`、旧 `window.electron`、旧 preload 聚合、旧 main business handlers、旧 `public` 数据目录策略。
- 必须重新收缩 package scripts、Quasar source files 和 boot、Electron main/preload entry、builder files/extraResources、tsconfig、ESLint、UnoCSS、Vitest 和 auto-import 配置。

Auto-import baseline:

- 默认保持显式 import。
- 若后续引入 auto-import，只允许 Vue、Vue Router、Pinia 等基础框架 API 白名单。
- 禁止自动导入 feature service、platform facade、runtime、store、feature public API、adapter 或带业务 owner 的 helper。

## 6. Top-level responsibilities

| Directory | Owns | Must not own |
| --- | --- | --- |
| `app/` | 应用启动、路由、布局壳、全局 provider、应用生命周期装配 | 领域规则、平台资源细节、运行事实 |
| `platform/` | renderer 侧桌面能力 facade，访问 typed preload API 的唯一正式入口 | 领域规则、状态机、协议解析、报告语义 |
| `shared/` | 纯类型、通用工具、协议常量、无副作用 helper | Vue/Pinia/Electron/platform 调用、带业务 owner 的规则 |
| `features/` | 领域规则、应用服务、状态、领域内 UI、fixture/oracle 材料 | 跨域总编排、裸平台调用、northbound 直出 |
| `runtime/` | 应用级生命周期、平台资源装配、跨 feature 编排、边界例外登记 | 领域内部算法、状态事实定义、协议判断、报告语义 |
| `pages/` | 路由页面、页面级布局、页面动作连接到 runtime 或 feature 入口 | 复杂业务流程、平台直连、跨 feature 内部状态写入 |
| `widgets/` | 跨页面复用 UI、纯展示组件、全局 UI 行为组件 | 运行主状态、任务生命周期、平台能力、领域语义 |

Default dependency direction:

```text
pages
  -> feature composables or runtime page APIs
  -> feature public service/selectors
  -> features/<feature>/core
  -> shared

widgets
  -> props / emits / read-only snapshots / public selectors
  -> shared

features/<feature>/adapters
  -> platform
  -> typed preload API
  -> main platform resources
```

## 7. Feature list and owner boundaries

本节只固定职责边界，不进入内部流程。

| Feature | Responsibility boundary | Must not become |
| --- | --- | --- |
| `frame` | 帧资产、字段编辑、校验、序列化、导入导出、旧 JSON 迁移入口 | 接收运行状态、发送执行状态、统计事实 |
| `connection` | 串口/TCP/UDP 连接模型、连接实例、连接状态、target 路由 | 字节解析、任务生命周期、业务结果 |
| `receive` | 输入字节流承接、帧匹配、字段解析、表达式输入、接收结果输出 | 任务生命周期 owner、SCOE 完整执行、历史落盘编排 |
| `send` | 单帧发送（SendRequest→构帧→target 路由→transport write→SendResult）、发送队列、target 落地、发送统计 read model | 任务编排/step 序列执行、SCOE 成功条件、报告交付、northbound 回执语义 |
| `task` | 通用执行引擎（step 序列执行、错误处理、进度追踪）、多态 step（send/wait-condition/delay）、多触发来源入口适配、调度、取消/停止/暂停/恢复语义 | 页面工作台状态、发送链局部状态、northbound 回执协议、SCOE 领域规则、receive 解析 |
| `scoe` | SCOE 协议、命令解析（指令码→step 定义）、完成条件定义、确认帧配置、SCOE 领域状态、SCOE 静态资产、测试工具记录 | 通用执行引擎（task owns）、单帧发送（send owns）、通用 receive/send 主链定义权、统一运行主状态 |
| `storage` | 本地持久化、历史记录、CSV、高速存储、迁移输入输出 | northbound 文件回传协议、任务结果事实定义 |
| `settings` | 设置模型、默认值、持久化、设置页可见配置 | 领域运行事实、跨域调度 |
| `status` | 状态指示、健康状态、状态视图、内部状态摘要 | 心跳协议本身、任务主状态事实 |
| `result` | 内部结果事实（case result、task result summary）、结果归因和聚合规则、执行摘要、结果 read model | 报告文件交付、外部响应语义、外部 schema/枚举/错误码 |
| `report` | 报告对象生成、报告素材归集、报告文件准备 | HTTP/FTP 交付动作、外部回执 |
| `northbound` | 中心协同接入、对外投影、对外交付、外部错误语义转换 | 内部运行主状态、收发主链内部规则 |

这些 feature 都可以拥有自己的 `core/services/state/adapters/composables/components/fixtures`，但只有真实需要时才创建对应子层。

## 8. Runtime usage conditions

`runtime/` 只在以下条件至少满足一项时出现：

- 应用启动、销毁、恢复、资源释放需要统一顺序。
- 平台资源、feature service、adapter 或上下文需要组合根创建和释放。
- 一个用户动作需要跨多个 feature 的公开入口，且页面不应拥有该流程。
- 多消费者异步解耦确有收益，需要显式事件路由或 command 调度。
- 存在 SCOE、高速存储、northbound 或其他边界例外，需要登记正式入口、输出、消费者和验证方式。

`runtime/` 的边界：

- 可以表达装配、调用顺序、生命周期、事件路由和边界输入输出。
- 不承载 receive 解析、send 构帧、task 状态推进、SCOE 协议、统计含义、结果归因、报告生成或 northbound 语义转换。
- 不直接访问 Electron、Node、`ipcRenderer`、`fs`、`serialport` 或 socket。
- 不为了“架构感”引入全局 singleton、复杂 DI 容器、万能 event bus 或 command bus。
- 如果某 feature 没有跨域流程和生命周期装配需求，应在 design 中说明“不需要 runtime 编排”，而不是强行增加一层。

## 9. Feature public API rules

feature public API 是跨 feature 访问边界，不是文件模板。

Rules:

- 只有存在外部消费者时，才需要在 feature design 中声明允许入口。
- 允许入口可以是公开 service、只读 selector、feature composable、runtime 页面级 API、显式事件或 command。
- 不强制每个 feature 新增 `public.ts`。
- 不强制统一 event bus 或 command bus。
- feature 内部不需要绕 public API 调用自己。
- 外部 feature、page、widget 不得 import 其他 feature 的内部 `state`、`adapters`、内部 composable、内部 service 实现或私有 helper。
- public API 不得暴露可变 state 引用，不得允许外部直接写入本 feature 内部状态。
- 跨 feature 写入或流程推进必须说明 owner、调用方、输入输出边界、错误或拒绝语义和验证方式。

## 10. State layering

状态分层固定为四类：

| Layer | Owner | Write rule | Reader |
| --- | --- | --- | --- |
| 静态资产 | `frame` 等资产 owner | 低频编辑或迁移写入 | receive/send/task/report 等通过明确输入读取 |
| 运行事实 | 对应 feature owner | 单点写入 | 其他 feature 通过公开入口或 runtime 编排读取 |
| 统计 read model | 统计 owner feature | 基于显式结果或事件增量维护 | pages/widgets/status/report 等读取只读投影 |
| UI snapshot | 页面、feature composable 或 widget 边界 | 只做展示投影、筛选、分页、虚拟滚动、节流 | UI 组件消费 |

Hard rules:

- frame definition、field definition、表达式、展示配置等静态资产不得承载接收命中数、最近值、错误计数、速率、发送结果等运行统计。
- 统计不得写回 frame list、字段定义、配置对象或其他静态资产。
- 运行事实必须有明确 owner 和单点写入权。
- 统计 read model 必须在 feature design 中说明 owner、reader、稳定 key、reset 时机、生命周期、是否持久化和验证方式。
- UI snapshot 不是事实源，不能反向定义运行事实。
- 页面、组件、widgets 不参与底层高频统计累加。

## 11. High-frequency data principles

高频数据流按数据流设计解决，不靠 main 业务化或 UI 逐包消费。

Target flow:

```text
platform-side input
  -> batch / queue / throttle / backpressure
  -> typed preload event or request result
  -> rewrite/src/platform facade
  -> feature service/core batch handling
  -> delta update to read model
  -> throttled UI snapshot
  -> pages/widgets display
```

Rules:

- main 可以做平台侧缓冲、批处理、聚合、节流、队列和背压。
- main 不定义接收分类、字段语义、任务推进、SCOE 完成条件、结果归因、报告语义或 northbound 错误语义。
- renderer 不应让底层逐包事件直接推动多个 store、页面列表或静态资产全量刷新。
- feature design 需要根据硬件、runtime 证据或压测计划再确定队列深度、窗口、采样、延迟和溢出策略；本文不写具体参数。
- 高频链路涉及真实串口、TCP/UDP、高速存储、SCOE 或 HTTP/FTP 时，静态验证只能声明静态或 fixture 通过，不能宣称硬件链路或甲方闭环完成。

## 12. Platform, preload, main, renderer boundary

目标配置固定：

```ts
nodeIntegration: false
contextIsolation: true
sandbox: false
```

Renderer:

- 不直接访问 Node、Electron、`ipcRenderer`、`fs`、`path`、`net`、`serialport`。
- 不直接使用 `window.electron` 作为业务入口。
- 只通过 `rewrite/src/platform` facade 访问桌面能力。

Platform facade:

- 位于 renderer 侧，封装桌面能力访问。
- 对 feature 暴露能力级 API，不泄漏 Electron/preload 细节。
- 不承载业务规则、协议语义、任务状态推进或报告语义。

Preload:

- 只暴露 typed API。
- 不暴露裸 `invoke/send/on`。
- 不暴露大而全、任意访问的能力包。

Main process:

- 负责串口、网络 socket、文件、路径、窗口、系统对话框、应用生命周期、HTTP/FTP 传输等平台资源。
- 可以承接与平台资源绑定且性能压力明显的高频缓冲、批处理、聚合、节流、队列和背压。
- 不承载 receive/send/task/SCOE/result/report/northbound 的领域规则。
- 如确有 main 边界例外，feature design 必须说明为什么 renderer/TypeScript core 无法合理承载、main 中只保留哪些平台侧处理、业务语义最终在哪里归口、如何测试或手工验证。

Existing-code note:

- 现有 `src/api/common/*`、`src-electron/preload/api/*` 和 `src-electron/main/ipc/*` 只作为迁移 evidence 和风险参照。
- 现有 main 业务化路径只登记为风险，不能作为目标职责，也不能复制到 `rewrite/src-electron/main/`。

## 13. Shared extraction principles

默认先留在 feature 内。只有同时满足以下条件，才进入 `shared/`：

- 至少两个 feature 真实复用。
- 语义稳定，不随单个业务域变化。
- 没有明确业务 owner。
- 不依赖 Vue、Pinia、Electron、platform facade 或全局 store。
- 无副作用，或副作用被清楚限制在通用工具边界内。

Shared should not contain:

- receive 解析、send 构帧、task 推进、SCOE 协议、result/report 生成、northbound 转换。
- 只是文件形似但语义归属不同的抽象。
- 为旧 JSON 或旧 store 兼容而扭曲的新模型。

Current candidates from read-only findings:

- `useDragSort` 这类跨两个以上 UI 场景复用、无领域 owner 的能力，可作为 shared 候选。
- 文件对话和导入导出需要先判断：平台能力归 `platform`，全局展示归 `widgets` 或 `app`，具体导入导出语义归对应 feature。
- `UniversalChart`、`UniversalChartSettingsDialog`、`ImportExportActions` 更接近 widgets 候选。
- `frames/sendFrame/*`、`scoe/*`、接收/发送/任务相关 composable 默认保留在对应 feature 内，不能抽成 shared。

`src/utils` audit gate:

- `src/utils` 是 legacy mixed zone，不是天然 shared 来源。
- 后续 shared/tooling 对话必须逐文件判定 `src/utils` 内容归属：`shared`、feature core、feature helper、`platform`、`widgets`、删除或合并重复实现。
- 没有完成归属判定前，不把 `src/utils` 下的能力直接迁入 `shared/`。
- 任何带 receive/send/task/SCOE/frame/storage/status 等业务 owner 的 helper，默认回到对应 feature，而不是进入 shared。

## 14. Pages, widgets, and feature components

Pages:

- 放路由页面、页面级布局和页面动作连接。
- 可以调用 runtime 页面级 API 或 feature public API。
- 不拥有协议语义、任务推进、统计累加、文件/串口/网络访问或跨 feature 内部状态修改。

Feature components:

- 放在 `features/<feature>/components/`。
- 只服务本 feature 的局部 UI。
- 可以调用本 feature composable、selector 或公开 service。
- 不编排其他 feature 内部状态。

Widgets:

- 放跨页面复用、纯展示或全局 UI 行为组件。
- 只能消费明确传入的 props、只读 snapshot 或公开 selector。
- 不直接订阅运行主状态，不访问平台能力，不定义业务流程。

Multi-feature UI:

- 当一个界面同时需要多个 feature 事实时，优先由 page 或 runtime 组合只读输入，再传给 widget 或 page section。
- 组件不得自行 import 多个 feature 内部 state 拼流程。

## 15. Testing, fixture, oracle, and validation strategy

Testing placement:

- Vitest 是 `core`、`services`、`adapters`、`selectors` 的默认单测栈。
- feature 自己的输入样本、期望输出、失败样本、边界样本和旧系统 oracle 映射，优先放入该 feature 的 `fixtures/` 或对应测试目录。
- `features/*/core` 测试只依赖明确输入输出，不依赖 Vue、Pinia、Electron、platform facade、真实文件系统、真实串口或真实网络。
- runtime 编排测试可以放在 `runtime/` 对应测试材料中，但必须通过 feature public API、只读 selector 或显式事件观察结果。

Oracle policy:

- 旧 JSON、历史文件、CSV、旧任务形态、SCOE 记录和硬件采样可以作为 fixture 输入或 oracle 候选。
- 旧 UI 布局、旧 store 结构、旧 IPC 组织、旧 main 业务化路径不能作为新架构 oracle。
- legacy static baseline 只能证明旧功能范围和行为候选，不能替代 runtime oracle。

Validation levels:

- 自动 fixture：优先覆盖 frame asset 校验和迁移、receive 输入输出、send 构帧、timed send/task 状态推进、SCOE 命令与完成条件、storage/history/CSV、status mapping、result/report 生成、northbound 映射。
- manual checklist：覆盖页面入口、连接操作、文件导入导出、设置读写、状态展示、SCOE 工具操作、报告和历史用户可见结果。
- Electron runtime / package / hardware / customer validation：覆盖真实串口、TCP/UDP、SCOE 设备、打包态 data path、HTTP/FTP northbound 交付、客户侧接收确认；不能由 Vitest 代替。

Completion rule:

- 没有验证证据，不宣称完成。
- 没有 runtime/hardware/customer 证据时，只能声明静态分析或 fixture 通过。

## 16. Later conversation handoff

后续对话建议按以下顺序接续，避免在单个 feature design 中临场扩大架构边界。

### 16.1 Feature boundaries

Goal:

- 为每个 feature 固定 owner、输入、输出、状态事实、旧可观测行为范围和 public API 是否需要。

Expected output:

- feature 边界表。
- 每个 feature 的 `preserve / candidate drop / deferred / not touched` 初筛。
- 需要用户、甲方、runtime 或 hardware 决策的 blocking list。

### 16.2 Interaction matrix

Goal:

- 固定 feature 之间只到边界级别的交互矩阵。

Expected output:

- producer、consumer、owner、输入输出、状态写入方、是否需要 runtime、是否需要事件或 command。
- 不写 payload、schema、接口签名。

### 16.3 Shared and tooling plan

Goal:

- 收敛 `shared`、`widgets`、`platform`、`app` 的候选迁移清单。

Expected output:

- 只列候选、owner、进入条件和暂不抽取原因。
- `src/utils` 逐文件 audit 清单，判定 shared / feature core / feature helper / platform / widgets / delete-or-merge duplicate。
- 文件对话、图表、导入导出、拖拽排序、timer wrapper 等重复能力的归口建议。
- 不做代码移动，不定义最终 API。

### 16.4 Pre-design gate

每个 feature 进入 `cs-feat-design` 前至少回答：

- Direct contract 是什么，Boundary guards 是什么。
- 本 feature 保留哪些旧系统可观测行为。
- 本 feature owner、运行事实 owner、统计 read model owner 是谁。
- 是否有外部消费者；如果有，允许入口是什么；如果没有，是否明确不需要额外 public API。
- 是否需要 runtime 编排；如果需要，runtime 只负责什么。
- 是否新增或调整 platform/preload/main API。
- 是否触达 northbound、SCOE、高速存储、真实串口、TCP/UDP、打包态 data path、HTTP/FTP。
- 哪些行为可自动 fixture，哪些只能手工 checklist，哪些必须 runtime/hardware/customer validation。

如果上述问题缺失，后续实现阶段不得临场扩大边界；应回到 feature design 或 roadmap update。
