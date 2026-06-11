---
doc_type: architecture
type: rewrite-target-structure
status: draft
date: 2026-04-28
summary: Batch 0 architecture baseline, target source structure, and dependency rules for the full rewrite. This document translates existing architecture boundary memos into a practical directory and dependency map without defining schemas or implementation batches.
tags:
  - rewrite
  - target-structure
  - directory
  - boundary
  - electron
---

# Rewrite target structure

## 1. Purpose

本文定义全面重写时的目标目录结构、职责归口和依赖方向。

本文不做以下事情：

- 不定义字段 schema。
- 不写接口契约。
- 不制定迁移批次。
- 不要求一次性创建所有空目录。
- 不把旧代码热点直接翻译成新目录。

本文继承当前范围口径：旧功能默认保留，重写重点是代码质量、模块边界、状态归口和 Electron 边界。`codestable/compound/2026-04-28-rewrite-scope-default-preserve.md`

## Batch 0 Architecture Baseline

本文是 Batch 0 的整体架构基线。后续每个功能域进入 `cs-feat-design` 前，都必须把本文列为直接合同或边界护栏，并说明本批如何遵守本文的目录、依赖、状态和平台边界。

Batch 0 只固定后续功能必须遵守的架构骨架：

- 顶层目录固定为 `app / platform / shared / features / runtime / pages / widgets`。
- feature 内部通用分层固定为 `core / services / state / adapters / composables / components / fixtures`，按实际职责创建，不为了填满模板而建空层。
- feature public API 只是跨 feature 访问边界，不是必须新增的接口层；外部不得 import 其他 feature 的内部 `state`、`adapters`、内部 composable、内部 service 实现或私有 helper。
- `runtime/` 只在应用生命周期、平台资源装配或跨 feature 编排确有需要时出现，不是新的全局业务中心。
- renderer、platform、preload、main 的边界按本文和质量规则执行；现有 main 业务化只作为迁移风险处理，不作为新架构目标。
- 状态必须分清静态资产、运行事实、统计 read model 和 UI snapshot；运行统计不得写回 frame definition、字段定义或其他静态资产。
- 高频数据按 batch、delta、队列、节流、snapshot 和背压处理，页面不直接消费底层逐包事件。
- 跨 feature 通信只允许公开 service、runtime 编排、显式事件或边界输入输出，不允许互相 import 内部 state。
- pages、widgets、feature components 只承担各自 UI 边界，不拥有协议语义、任务推进、平台访问或跨域流程。
- 测试、fixture 和 oracle 必须放在可复用、可审查的位置，优先归入对应 feature 的 `fixtures/` 或 `core` 测试材料。

Batch 0 不固定以下内容：

- 不写字段 schema、接口签名、事件 payload 或 northbound 字段。
- 不设计 receive、send、task、SCOE、result、report、northbound 的内部算法和流程细节。
- 不给高频链路写具体队列深度、窗口大小或延迟阈值；这些参数必须在对应 feature design 中结合目标硬件、runtime 证据或压测计划确定。
- 不为每个 feature 预先创建 public API 清单；只有出现外部消费者或跨 feature 协作时，才在对应 `cs-feat-design` 中定义允许入口。

## 2. Existing Boundary Inputs

Evidence:

- 桌面能力需要统一收口；页面、组件、Store、composables 不应直接把 Electron 原生对象当正式业务入口。`codestable/architecture/boundary-desktop-capability-access.md:49-53`, `codestable/architecture/boundary-desktop-capability-access.md:165-167`
- 运行主状态必须区分主状态、派生态、展示态、记录态和缓存态，主状态不得多点写入，下游不得用共享状态回读替代明确边界输入。`codestable/architecture/boundary-runtime-state-ownership.md:124-126`, `codestable/architecture/boundary-runtime-state-ownership.md:148-150`, `codestable/architecture/boundary-runtime-state-ownership.md:223-224`
- 接收主链和发送主链都只能处理显式输入 / 输出，不能成为统一运行主状态或中心任务本体。`codestable/architecture/topology-receive-send-mainlines.md:179-181`, `codestable/architecture/topology-receive-send-mainlines.md:302-304`, `codestable/architecture/topology-receive-send-mainlines.md:524-525`
- 任务系统是通用执行引擎，接收执行计划（step 序列）按顺序执行、处理错误、追踪进度；触发来源（用户 UI、定时器、receive 触发、SCOE 命令、northbound 外部命令）通过入口适配区分，执行逻辑统一。任务系统不等于页面工作台或本地发送对象。`codestable/architecture/domain-task-system-ownership.md:93-99`, `codestable/architecture/domain-task-system-ownership.md:192-223`
- SCOE 更适合被视为领域模块，必须通过显式边界接入，不得作为通用接收链或发送链内部长期特判。`codestable/architecture/domain-scoe-position.md:562-575`, `codestable/architecture/topology-receive-send-mainlines.md:386-394`
- 北向协同应由独立边界层统一承接接入、投影和交付，不能直接落到任务系统、统一运行主状态或收发主链上。`codestable/architecture/boundary-northbound-collaboration-delivery.md:91-117`, `codestable/architecture/boundary-northbound-collaboration-delivery.md:509-516`

Update:

- 早期桌面能力文档讨论过受控开启 `nodeIntegration` 的备选。当前重写口径已经收紧为 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: false`。本文以后者为准，同时继承“桌面能力统一收口”这个核心原则。

## 3. Rewrite root placement

本轮固定新重写工程落点：

- 仓库根目录下的 `rewrite/` 是新的独立应用根目录，不只是源码目录。
- 新 renderer 源码根是 `rewrite/src/`。
- 新 Electron 边界从 `rewrite/src-electron/main/` 和 `rewrite/src-electron/preload/` 开始。
- 旧 `src/`、`src-electron/`、`public/` 只作为旧系统 evidence、oracle 或 migration input，不作为新代码落点。
- 旧 `src/api/common`、旧 `window.electron` 大包、旧 preload 聚合和旧 main business handlers 不搬入 `rewrite/`。

独立应用根目录允许承载自己的基础设施文件，例如 `package.json`、`quasar.config.ts`、`tsconfig.json`、`eslint.config.js`、`uno.config.ts` 和测试配置。当前仓库根配置只能作为可复用依赖和配置思路的 evidence，不能原样升级为新工程基线。

## 4. Target Top-Level Structure

目标结构：

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
      command-ingress/
      storage/
      storage-highspeed/
      settings/
      status/
      display/
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

这些目录是职责边界，不是必须一次性填满的脚手架。实现时只在对应能力真正开始重写时创建必要子目录。

下文表格中的 `app/`、`platform/`、`shared/`、`features/`、`runtime/`、`pages/`、`widgets/` 默认指 `rewrite/src/` 下的相对目录；显式写 `src/` 的旧路径只表示 legacy evidence。

## 5. Top-Level Responsibilities

| Directory | Responsibility | Must not own |
| --- | --- | --- |
| `app/` | 应用启动、路由、布局壳、全局 provider、应用生命周期装配 | 业务规则、串口/网络/文件细节、领域状态事实 |
| `platform/` | renderer 侧平台 facade；唯一正式访问 Electron / Node 能力的入口 | 业务规则、状态机、解析规则、报告语义 |
| `shared/` | 纯类型、通用工具、协议常量、无副作用 helper | Vue、Electron、Pinia、平台能力调用 |
| `features/` | 按业务能力归口领域规则、应用服务、状态和领域内 UI | 跨域总编排、裸平台调用、北向协议直出 |
| `runtime/` | 应用级编排、启动/销毁顺序、跨域事件、边界例外登记、主流程协调 | 领域内部规则、页面展示态、平台资源细节 |
| `pages/` | 路由页面、页面级布局、把用户操作连接到 runtime / feature API | 复杂业务流程、直接修改其他域状态、平台直连 |
| `widgets/` | 跨页面 UI 组件和纯展示组件 | 运行主状态、任务生命周期、平台能力 |

## 6. Feature Domains

| Feature | Owns | Must not own |
| --- | --- | --- |
| `frame/` | 帧资产、字段编辑、校验、序列化、导入导出和旧 JSON 迁移入口 | 接收运行状态、发送执行状态、SCOE 命令流程 |
| `connection/` | 串口/TCP/UDP 连接模型、连接实例、连接状态、target 路由 | 字节解析、业务结果、报告、任务生命周期 |
| `receive/` | 输入字节流承接、帧匹配、字段解析、表达式输入、接收结果输出 | 任务是否开始、SCOE 完整领域执行、历史落盘编排 |
| `send/` | 单帧发送（SendRequest→构帧→target 路由→transport write→SendResult）、发送队列、target 落地、发送统计 read model | 任务编排/step 序列执行、SCOE 成功条件、报告交付、northbound 回执语义 |
| `task/` | 通用执行引擎（step 序列执行、错误处理、进度追踪）、多态 step（send/wait-condition/delay）、多触发来源入口适配（用户 UI、定时器、receive 触发、SCOE 命令、northbound 外部命令）、调度、取消/停止/暂停/恢复语义 | 页面工作台状态、发送链局部细节、对外回执协议、SCOE 领域规则、receive 解析 |
| `scoe/` | SCOE 协议、命令解析（指令码→step 定义映射）、完成条件定义、确认帧配置、SCOE 领域状态、SCOE 静态资产（卫星配置、SCOE 帧实例）、测试工具记录 | 通用执行引擎（task owns）、单帧发送（send owns）、通用 receive/send 主链定义权、统一运行主状态定义权 |
| `storage/` | 本地持久化、历史记录、CSV、高速存储、迁移脚本输入输出 | 北向文件回传协议、任务结果事实定义 |
| `settings/` | 设置模型、默认值、持久化、设置页可见配置 | 领域运行事实、跨域调度 |
| `status/` | 状态指示、健康状态、状态视图和内部状态摘要 | 心跳协议本身、任务主状态事实 |
| `display/` | 展示偏好、表格/图表/星座图 projection、实时/历史 UI-safe snapshot | receive 运行事实、connection facts、settings persistence、status health、report/northbound |
| `result/` | 内部结果事实（case result truth、task result truth）、结果归因和聚合规则、执行摘要、结果 read model | 报告文件交付、外部响应语义、外部 schema/枚举/错误码 |
| `report/` | 报告对象生成、报告素材归集、报告文件准备 | HTTP/FTP 交付动作、外部成功/失败回执 |
| `northbound/` | 中心协同接入、对外投影、对外交付、外部错误语义转换 | 内部运行主状态定义、收发主链内部规则 |

## 7. Recommended Internal Feature Layout

不是每个 feature 都必须完整拥有以下子目录。只有当职责确实存在时才创建。

```text
features/<feature>/
  core/          # 纯 TS 规则、类型、算法；不得依赖 Vue/Electron/Pinia
  services/      # feature 内应用服务和用例入口
  state/         # feature 自己的状态归口，通常由 Pinia 或明确状态容器承载
  adapters/      # 调用 platform 或外部能力的适配层
  composables/   # 面向页面/组件的 Vue 组合层；不得拥有领域规则
  components/    # feature 内复用 UI；页面仍放 pages/
  fixtures/      # 领域测试样例、oracle 输入输出
```

Rules:

- `core/` 必须可单测，不依赖 UI、Electron 和全局 store。
- `state/` 只维护本 feature 的状态、read model、selector 和很薄的本域 action；不得直接修改其他 feature 的内部状态。
- `services/` 是业务用例入口，可以协调本 feature 内部对象；跨 feature 流程优先进入 `runtime/`。
- `adapters/` 可以调用 `platform/` facade，但不得把平台 API 继续向 `core/` 泄漏。
- `composables/` 只做 UI-facing 组合，例如表单状态、对话框状态、生命周期订阅、selector 组合和调用公开 service；不得承载协议解析、任务状态机、统计累加或跨域业务流程。
- `components/` 只服务本 feature 的局部 UI，不承担跨域流程编排。

Top-level `rewrite/src/composables` 不作为重写默认归口。确需跨页面复用的 Vue 组合逻辑，必须先判断归属：属于某 feature 的放入该 feature，属于应用壳或全局 UI 行为的放入 `app/` 或 `widgets/` 对应边界；没有明确归属时不得新建万能 composable。

### Fixture, oracle, and test placement

测试材料跟随业务归口，不建立脱离 feature 的第二套事实来源。

Rules:

- feature 自己的输入样本、期望输出、失败样本、边界样本和旧系统 oracle 映射，优先放入 `features/<feature>/fixtures/` 或该 feature 对应测试目录。
- `core/` 测试只依赖明确输入输出，不依赖 Vue、Pinia、Electron、platform facade、真实文件系统或真实串口网络。
- 跨 feature 的 runtime 编排测试可以放在 `runtime/` 对应测试材料中，但测试断言必须通过 feature public API 和显式事件观察结果。
- 旧 JSON、历史文件、CSV、甲方材料和硬件采样可以作为 fixture 输入或 oracle 来源；进入新核心模型前必须经过 feature design 确认，不得直接污染核心类型。
- 每个 feature design 必须列出自动 fixture、手工 checklist、runtime / hardware validation 三类验证材料；没有运行证据时只能声明静态或 fixture 通过。

### Feature public API

feature public API 是跨 feature 访问边界，不是必须新增的接口层、文件模板或 schema。只有当外部 feature、page、widget 或 runtime 需要访问该 feature 时，才需要在对应 feature design 中说明允许入口。

允许入口可以是已有 store/composable/service 中被明确认可的调用面，也可以是后续新增的 service、只读 selector、runtime 页面级入口或显式事件/command。Batch 0 不要求每个 feature 都创建 `public.ts`，不要求统一 event bus / command bus，也不要求没有外部消费者的 feature 预先定义 public API。

Rules:

- 外部 feature、page、widget 不得 import 其他 feature 的 `state/`、`adapters/`、内部 composable、内部 service 实现文件或私有 helper。
- feature 内部可以自由组织实现细节；同一 feature 内部不需要通过 public API 绕行。
- 如果存在外部消费者，feature design 或实现说明必须写清楚外部可用入口和禁止绕过的内部状态。
- 通过 public API 暴露的数据不得授予外部写入本 feature 内部 state 的能力。
- 有跨 feature 写入或流程推进时，必须说明 owner、调用方、输入输出边界、错误或拒绝语义和验证方式；没有跨 feature 消费时可以明确记录为不需要额外 public API。
- 事件/command 只在确实有异步广播、跨域解耦或多消费者收益时使用；使用时必须列出生产者、消费者、owner、触发时机和失败处理口径。
- 只读 selector 可以面向页面或其他 feature 暴露 read model / UI snapshot，但不得暴露可变引用，也不得让调用方回写主状态。

### Pages, widgets, and feature components

UI 代码按用户入口和复用范围归口，不按视觉相似度随意放置。

Rules:

- `pages/` 放路由页面、页面级布局和页面动作连接；页面可以调用 runtime 页面级 API 或 feature public API，但不拥有业务规则。
- `features/<feature>/components/` 放只服务该 feature 的组件，可以调用本 feature composable / selector / public service，不编排其他 feature 内部状态。
- `widgets/` 放跨页面复用、纯展示或全局 UI 行为组件；它只能消费明确传入的 props、只读 snapshot 或公开 selector，不直接订阅运行主状态。
- UI snapshot 是页面展示投影，不是事实源；页面可以筛选、分页、虚拟滚动和节流展示，但不得反向定义运行事实。
- 当一个组件同时需要多个 feature 的事实时，优先由 `runtime/` 或页面层组合只读输入，再传给组件；组件不得自己 import 多个 feature 内部 state 拼业务流程。

## 8. Dependency Direction

默认依赖方向：

```text
pages/widgets
  -> feature composables or runtime page APIs
  -> features/<feature>/services or state selectors
  -> features/<feature>/core
  -> shared

features/<feature>/adapters
  -> platform
```

Allowed:

- `pages` 调用 runtime 提供的页面级操作入口。
- `runtime` 调用多个 feature 的公开服务，完成应用级流程。
- feature 内部从 `services` 调用 `core`、`state`、`adapters`。
- composable 可以读取本 feature 的 store selector、管理 UI 生命周期并调用公开 service。
- `adapters` 调用 `platform` facade。
- `platform` 调用 preload 暴露的 typed API。

Not allowed:

- `core` 依赖 Vue、Pinia、Electron、`window.electron`、`ipcRenderer`、`fs`、`serialport`。
- feature A 直接 import feature B 的内部 `state` 并修改它。
- feature A 绕过 feature B 的 public API，直接 import B 的内部 service、adapter、composable 或私有 helper。
- 页面组件直接创建任务状态机、直接发串口/网络、直接读写本地文件。
- composable 变成隐藏 service，承载协议语义、任务推进、统计累加或跨 feature 写状态。
- store 变成 service locator，负责创建 service、保存 adapter 或访问 platform。
- `receive` 通过共享状态回读决定任务生命周期。
- `send` 为 SCOE 或 northbound 写硬编码特例。
- `northbound` 直接改写内部运行主状态或收发主链内部对象。

## 9. Runtime Layer

`runtime/` 不是新的大而全业务域。它只负责应用级装配和跨域编排。

Recommended responsibilities:

- 应用启动和销毁顺序。
- 确有跨 feature 或平台装配需要时，负责 manager / service 的创建、显式依赖注入和释放。
- 确有多消费者、异步解耦或跨域流程收益时，提供事件 broker 或 command dispatcher；它只表达路由、调用顺序和边界输入输出。
- 运行主状态归口层的装配。
- 边界例外清单和显式例外入口。
- 页面动作到 feature service 的路由。

Must not:

- 承载 receive 解析算法。
- 承载 SCOE 协议细节。
- 承载 report 字段生成规则。
- 承载协议判断、任务状态推进、统计含义、结果归因或 northbound 语义转换。
- 直接访问 Electron/Node 原生能力。
- 变成所有 feature 都依赖的全局杂物箱。

### Service wiring and dependency injection

重写默认采用轻量、按需的依赖装配，而不是全局 singleton 或重型 DI 框架。只有当生命周期、测试替换、平台资源装配或跨域编排有实际收益时，`runtime/` 才作为组合根创建 feature service、adapter 和必要上下文。

Rules:

- service 的依赖应通过构造函数、工厂函数或明确 context 传入，便于测试时替换 fake adapter、fake store 或 fake service。
- Pinia store 不是 service locator，不负责创建 service，不保存 Electron/platform 原生对象。
- 组件和页面不直接 import service 内部实现；单 feature 页面优先通过本 feature composable / store 调用，跨 feature 页面动作才考虑 runtime 页面级 API。
- 跨 feature 调用只通过明确认可的入口、runtime 编排、显式事件或边界输入输出发生。
- 不为“架构感”引入复杂容器；只有在生命周期、测试替换或跨域装配有实际收益时才增加抽象。

### Runtime state and statistics read models

重写后不得用一个全局大 store 承载所有运行事实、统计数据和页面展示态。全局编排可以存在，但事实源和写入权必须留在明确的 feature 边界内。

Layering:

- 静态资产：帧定义、字段定义、表达式和 frame-owned 展示元数据等低频可编辑对象，归 `features/frame`；运行中的展示偏好、表格/图表/星座图 projection 和 UI-safe snapshot 归 `features/display`。
- 运行事实：连接状态、接收结果、发送结果、任务状态、SCOE 状态等，由对应 feature 单点写入。
- 统计 read model：由对应 feature 基于显式事件或结果增量维护，按 `frameId`、`fieldId`、`targetId`、`taskId` 等稳定 key 索引。
- UI snapshot：面向页面的只读展示投影，可以节流、分页、虚拟滚动或按需组合，不反向写入主事实。

Rules:

- 帧列表和其他静态资产对象不得承载高频运行统计；接收命中数、最近值、错误计数、速率等统计不得写回 frame definition。
- 高频链路应以 batch / delta 推进：平台侧批量输入，领域 core 处理批次，统计 read model 增量更新，页面消费节流后的 snapshot。
- 页面和组件不得直接订阅底层高频事件，不参与统计累加，只调用公开入口和展示只读投影。
- 事件只能作为 feature 边界输出或 runtime 编排输入；事件类型和消费者必须明确，禁止把事件总线变成隐式跨 feature 写状态的通道。
- 每个统计项必须说明 owner、reader、reset 时机、生命周期、是否持久化以及验证方式。
- main 可以做平台侧缓冲、批处理、聚合、节流、队列和背压，但业务统计含义仍归口到可测试 TypeScript 层。

## 10. Electron Boundary

重写目标配置：

```ts
nodeIntegration: false
contextIsolation: true
sandbox: false
```

Directory implications:

```text
rewrite/src/platform/          # renderer facade
rewrite/src-electron/preload/  # typed bridge
rewrite/src-electron/main/     # platform resources
```

Rules:

- `platform/` 是 renderer 业务代码访问桌面能力的唯一正式入口。
- preload 只暴露 typed API，不暴露裸 `invoke/send/on`。
- main 负责串口、网络 socket、文件系统、系统对话框、窗口控制、定时器等平台资源。
- main 不承载 receive/send/SCOE/task/report 的领域规则。
- main 可以承接与平台资源绑定且性能压力明显的高频数据缓冲、批处理、聚合、节流、队列和背压；业务运算、协议语义、任务状态推进、报告语义仍归口到可测试 TypeScript 层。
- 高频串口/网络数据不得逐包无节制穿透到页面和全局 store；需要批量、缓冲、聚合或节流策略。

## 11. Boundary Exception Registry

领域例外可以存在，但必须显式登记，不能隐式沉积在通用链路里。

Exception record should include:

- 例外名称。
- 所属 feature。
- 为什么不能表达为通用输入 / 输出。
- 正式入口。
- 正式输出。
- 谁消费它。
- 如何测试或手工验证。

Known candidates:

- SCOE 固定 TCP server 入站字节流 bypass receive 主链，直接从 connection transport event 到 SCOE adapter。
- SCOE 出站通过 task→send 路径（非直接调 send），targetId 由 ScoeCommand.frameInstances[0].targetId 声明。
- SCOE 领域完成条件翻译为 task wait-condition-step 的 WaitCondition，由 task/core 执行匹配。
- 高速存储命中后短路普通 receive/display/trigger 链。
- northbound 外部拒绝 / 不可执行 / 失败语义转换。

## 12. Northbound Placement

`northbound/` 是独立边界 feature，不是 task、status、report 的别名。

Responsibilities:

- 接收中心侧任务、控制、查询、保活、文件请求。
- 把外部请求转换为内部显式输入。
- 从内部 task/status/result/report 读取投影。
- 统一转换对外成功、失败、拒绝、不可执行、异常语义。
- 承接对外回执、结果上报、报告交付和文件回传。

Must not:

- 直接占有任务系统定义权。
- 直接把外部字段写成内部主状态字段。
- 直接把 history/CSV 文件当作 report 交付闭环。
- 把外部响应语义散落到 task/send/report/storage 各处。

Implementation status (MVP):

- `features/northbound/core/types.ts` — CustomerRequest discriminated union, SetTestTaskRequest with ExecutionPlanLayer, TestCaseInfo, TestCaseStep, ControlTestTaskRequest, HeartbeatRequest, GetSubSysStateRequest, TestCaseResultReport, MsgReport, StepInfo, CustomerResponse.
- `features/northbound/core/inbound-translator.ts` — `translateTestCaseToTaskDefinition()` pure function, maps send/wait-condition steps to TaskDefinition.
- `features/northbound/core/outbound-translator.ts` — `translateTaskResult()` / `translateStepResult()` pure functions, verdict mapping (passed→success, failed→fail, stopped→tbd).
- `features/northbound/state/northbound-state.ts` — NorthboundStateContainer with bidirectional testCaseId↔instanceId Map.
- `features/northbound/services/northbound-service.ts` — URL routing, executionPlan processing (parallel Promise.all, sequential individual await), outbound helpers (postToCustomer, reportTaskResult, handleStepResult).
- `platform/http.ts` — HttpFacade interface + createHttpFacade factory, same level as TransportFacade.
- `src-electron/main/http-handlers.ts` — Main process HTTP server/client IPC handlers using Node native `http`. Incoming requests forwarded to renderer via `http:incoming-request` IPC event.
- `src-electron/preload/index.ts` — HttpBridge IPC implementation added alongside existing TransportBridge/FileBridge/StorageBridge.
- `runtime/feature-wiring.ts` — Late-binding pattern (`stepResultHolder`) resolves task↔northbound circular dependency. Northbound wired at L5 after task, result, and platform facades.
- 43 tests across 4 test files covering translators, state, and service.

Known gaps (not blocking MVP):

- ConditionTerm.frameId uses empty string placeholder (customer WaitConditionDef lacks frameId).
- stepStartTime/stepEndTime left empty (TaskStepResult lacks timestamps).
- Customer schema based on V1.0.1 interface doc; awaiting formal confirmation.

## 13. Result, Report, Delivery Split

三者必须分开：

| Layer | Owns | Does not own |
| --- | --- | --- |
| `result/` | 内部结果事实、用例结果、执行摘要 | 报告文件格式、对外交付动作 |
| `report/` | 报告对象和报告文件生成 | HTTP/FTP 上传、外部回执 |
| `northbound/` | 对外结果上报、报告交付、文件回传、错误语义转换 | 内部结果事实定义 |

Reason:

- 结果事实需要先在内部归口。
- 报告对象可以由内部结果和历史材料生成。
- 交付动作属于外部协议边界，成功或失败不能反向改写内部事实本身。

## 14. Placement Examples

| Need | Target |
| --- | --- |
| 解析接收字节并匹配帧 | `features/receive/core/` |
| 接收结果进入任务触发候选 | `features/receive/services/` 输出显式事件，`runtime/` 或 `task/` 消费 |
| 构造发送字节 | `features/send/core/` |
| 实际写串口 / socket | `platform/` facade -> preload -> main |
| 定时发送 | `features/task/`，调用 `features/send/` 公开 service；task 是通用执行引擎，定时发送是 triggerSource=user-ui 的一种调度模式 |
| SCOE 命令识别和完成条件 | `features/scoe/core/`（命令解析、完成条件定义、确认帧配置）；SCOE 翻译命令为 TaskDefinition 交由 `features/task/` 执行 |
| SCOE 发帧 | `features/scoe/` 翻译命令为 TaskDefinition（triggerSource=scoe-command），交由 `features/task/` 执行；task 通过 `features/send/` 公开 service 发帧 |
| 历史记录和 CSV | `features/storage/` |
| 报告 JSON 生成 | `features/report/` |
| HTTP server/client facade | `platform/http.ts` → preload HttpBridge → main `http-handlers.ts` |
| 甲方 HTTPS 任务接入 | `features/northbound/` inbound translator + `platform/` HttpFacade |
| 甲方结果上报 | `features/northbound/` outbound translator → `platform/` HttpFacade sendRequest |
| FTP/HTTP 回传和完成通知 | `features/northbound/` + `platform/` |
| 状态灯颜色映射 | `features/status/` |
| 表格/图表/星座图展示投影 | `features/display/` |
| 实时/历史展示偏好和 UI-safe snapshot | `features/display/` |
| 设置页表单 | `pages/` + `features/settings/` |

## 15. Architecture Entry Conditions For Later Batches

每个后续 Batch 进入 `cs-feat-design` 前，必须先补齐本节检查项；缺失项必须在 design 中标为 blocking、deferred 或只读调查范围，不能在实现阶段临场扩大边界。

Required before design:

- 明确本批涉及哪些 feature 归口，以及哪些旧系统可观测行为属于 `preserve`、`candidate drop`、`deferred` 或 `not touched`。
- 若本批存在外部消费者或跨 feature 协作，明确允许入口；若没有，说明不需要额外 public API。
- 明确本批是否需要 `runtime/` 编排；若需要，说明 runtime 只负责装配、调用顺序、事件路由和生命周期，不承载领域规则；若不需要，不为形式感新增 runtime 层。
- 明确是否新增或调整 platform / preload / main API；若涉及 main 高频处理，说明哪些只是平台侧缓冲、批处理、聚合、节流、队列或背压；若触达现有 main 业务化路径，必须把它登记为迁移风险或边界例外。
- 明确静态资产、运行事实、统计 read model、UI snapshot 的 owner、reader、写入权、reset 时机、生命周期和是否持久化。
- 明确跨 feature 通信方式，禁止以内部 state import、全局 store 回读或隐式事件总线替代公开接口。
- 明确 pages、widgets、feature components 的放置和职责，不让 UI 承载任务机、协议语义、统计累加、文件/串口/网络访问。
- 明确自动 fixture、手工 checklist、runtime / hardware validation 的边界和未验证项。
- 涉及 SCOE、高速存储、真实串口、TCP/UDP、打包态 data path、HTTP/FTP 或 northbound 时，必须读取对应边界材料并登记例外或 runtime validation。

## 16. Infrastructure Baseline

最小基础设施搬运原则：

- 可复用：Vue 3、Quasar、Pinia、Vue Router、UnoCSS、Electron、serialport、TypeScript、ESLint/Prettier 等经确认仍需要的依赖类别；窗口安全配置；Quasar/Electron/Vite 的必要构建能力；现有主题 token 和样式经验中无业务耦合的部分。
- 禁止直接搬：旧 Quasar boot 业务初始化、旧 `src/api/common`、旧 `window.electron`、旧 preload all-in-one 聚合、旧 main IPC business handlers、旧 `public` data path 读写策略、旧 root package scripts 中对 `src*/**` 和 `src-electron` 的路径假设。
- 必须重新收缩：`package.json` scripts 和依赖；Quasar `sourceFiles`、Electron main/preload entry、boot 列表、public/extraResources 策略、builder files 规则；`tsconfig` include/path alias；ESLint scope 与 globals；UnoCSS preset、safelist 和 shortcuts；Vitest config 与 coverage/test include；auto-import 配置若引入也必须白名单化。

`rewrite/` 的基础设施调整必须先服务最小可运行应用壳和测试基线，不能以“复用配置”为理由把旧业务初始化、旧数据目录、旧 API 包或旧 main handler 带入新工程。

## 17. Test Baseline and Validation Layers

默认测试基线：

- 使用 Vitest 作为 `core`、`services`、`adapters`、`selectors` 的默认单测栈。
- 页面交互先以 manual checklist 验证，不用 Vitest 代替真实用户路径确认。
- Electron runtime、打包态 package、真实串口/TCP/UDP/SCOE 硬件和 customer validation 不能由 Vitest 代替。
- `pnpm build`、`pnpm lint` 是实现轮默认静态验证，但不能替代单测、manual、runtime、hardware 或 customer 层级证据。

## 18. Auto-Import Decision

当前基线默认保持显式 import；这能让 feature service、platform facade、runtime、store 和 public API 的依赖方向在 review 中可见。

若后续为了 Vue/Quasar 工程体验引入 auto-import，只允许白名单导入 Vue、Vue Router、Pinia 等基础框架 API。禁止自动导入 feature service、platform facade、runtime、store、feature public API、adapter 或任何带业务 owner 的 helper。auto-import 不能成为隐藏业务依赖、跨 feature 调用或绕过 `rewrite/src/platform` facade 的机制。

## 19. Review Questions

新增或移动文件时，先回答：

1. 这段逻辑属于用户交互、领域规则、平台能力、跨域编排，还是对外交付？
2. 它是否需要单测？如果需要，是否被放在不依赖 Vue/Electron 的位置？
3. 它是否直接读取或修改了其他 feature 的内部状态？
4. 它是否把展示态、记录态、缓存态当成运行主事实？
5. 它是否把 SCOE、northbound 或高速存储特例塞进了通用 receive/send 链？
6. 它是否绕过 `rewrite/src/platform` 直接访问 Electron / Node？
7. 它是否把报告生成和报告交付混成一个职责？
8. 它是否需要登记为边界例外？

## 20. Next Documents

本文应配套后续两份质量文档：

- `codestable/quality/rewrite-quality-rules.md`
- `codestable/quality/rewrite-review-checklist.md`

质量规则文档应把本文的依赖方向和边界规则转成可执行的评审检查项。
