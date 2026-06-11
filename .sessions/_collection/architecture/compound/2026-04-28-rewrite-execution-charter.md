---
doc_type: compound
type: rewrite-execution-charter
status: draft
date: 2026-04-28
summary: Execution charter for the full rewrite. This document is the compact entry point for later rewrite discussions and implementation handoff. It consolidates scope, architecture, quality, northbound gap handling, validation posture, and next-step order without defining schemas or implementation details.
tags:
  - rewrite
  - execution
  - charter
  - quality
  - northbound-gap
---

# Rewrite execution charter

## 1. Purpose

本文是后续全面重写讨论和实施交接的总入口。

它只固定已经确认的工作口径：

- 旧系统可观测业务行为默认保留。
- 旧代码组织、全局状态穿透、模块耦合和 Electron 暴露方式不保留。
- 页面入口原则上保留，但页面内部逻辑可以重建。
- 甲方 northbound / result / report / file delivery 作为 gap 和 overlap 处理，不当作旧系统已有能力。
- 后续实现必须先遵守目录边界、质量规则、oracle 规划和 runtime validation 边界。

本文不做以下事情：

- 不定义接口字段 schema。
- 不设计具体 API。
- 不画目标架构细节。
- 不制定逐文件迁移批次。
- 不把旧行为自动写成新系统必须逐字照搬。

## 2. Source Stack

后续新对话优先读取本文，再按需要读取下列源文档。

| Role | Document | Use |
| --- | --- | --- |
| 旧系统事实和 oracle 候选 | `easysdd/compound/2026-04-27-legacy-feature-inventory-and-oracle-map.md` | 静态 baseline，不能替代 runtime oracle。 |
| 重写范围总口径 | `codestable/compound/2026-04-28-rewrite-scope-default-preserve.md` | 固定“默认保留可观测行为，不继承旧结构”。 |
| 目标目录和依赖边界 | `codestable/architecture/rewrite-target-structure.md` | 固定 `app/platform/shared/features/runtime/pages/widgets` 和 feature 归口。 |
| 质量红线 | `codestable/quality/rewrite-quality-rules.md` | 固定 Electron、状态、receive/send、SCOE、northbound、result/report 等硬规则。 |
| 重写审查清单 | `codestable/quality/rewrite-review-checklist.md` | 每轮实现后用来判定 pass、pass-with-known-gaps、revise-required 或 blocked。 |
| 甲方 overlap/gap | `codestable/compound/2026-04-28-northbound-overlap-and-gap-map.md` | 固定 northbound 与旧功能的可复用材料、gap 和危险误等价。 |

`refactor/docs` 和 `easysdd` 是历史输入、甲方材料和 baseline 来源；新增重写主线文档默认放到 `codestable`。

重写代码落点固定为仓库根目录 `rewrite/`。`rewrite/` 是新的独立应用根目录，不只是源码目录；新 renderer 源码根为 `rewrite/src/`，新 Electron 边界从 `rewrite/src-electron/main/` 与 `rewrite/src-electron/preload/` 开始。旧 `src/`、`src-electron/`、`public/` 只作为 evidence、oracle 或 migration input。

## 3. Hard Decisions

### 3.1 Scope

- 旧功能尽量保留，除非明确高成本低价值、只是旧占位、与新需求冲突，或会污染新模型。
- frame asset 是独立业务对象；收藏可以保留；不要求兼容旧 JSON 内部格式。
- 旧 JSON 通过迁移脚本或导入适配进入新模型，不污染新核心类型。
- 定时发送是已使用能力，必须保留。
- 旧 task 的其他形态默认作为兼容候选，不作为新系统中心模型。
- SCOE 保留为专项能力和复用材料，但不直接并入当前甲方 northbound 身份。

### 3.2 Architecture

- 目标目录按职责组织，不按旧文件热点组织。
- `features/frame`、`connection`、`receive`、`send`、`task`、`scoe`、`storage`、`settings`、`status`、`result`、`report`、`northbound` 是当前功能归口。
- `runtime` 只做应用级装配、跨域编排和边界例外登记，不承载领域算法。
- 页面和组件只负责交互、展示和调用公开入口，不直接拥有复杂业务流程。
- receive/send/task/SCOE/storage/status/result/report/northbound 之间必须通过显式输入输出、service、command、event 或 runtime 编排交互。

### 3.3 Electron

重写口径固定为：

```ts
nodeIntegration: false
contextIsolation: true
sandbox: false
```

- renderer 不直接访问 Node、Electron、`ipcRenderer`、`fs`、`serialport`。
- preload 只暴露 typed API，不暴露裸 `invoke/send/on`。
- renderer 通过 `rewrite/src/platform` facade 访问串口、网络、文件、路径、窗口等平台能力。
- main 只承接平台资源访问和生命周期，不承载 receive/send/SCOE/task/report 领域规则。
- IPC 可以粗粒度、少通道、按能力组织，但不能用打开 Node 能力换取表面简单。

### 3.4 Northbound

- 当前系统按完整二级子系统定位，不是单个设备，也不是单纯执行节点。
- `deviceId` 是业务设备身份，不是串口/网口 target。
- `setTestTask` 是甲方外部任务下发，不是旧本地 send task。
- task 和 case 是不同概念；task 包含 case，一个 task 可以只有一个 case。
- `startTestCaseList` 当前按 task start 理解，后续需要甲方确认粒度。
- 当前阶段只支持 `stop`；stop 后任务状态应为 `stopped`，不能沿用旧 `stop -> completed/removeTask` 语义。
- result、report、delivery 必须分开：内部结果事实、报告对象生成、HTTP/FTP 对外交付分别归口。
- 旧 history、CSV、本地文件导出只能作为报告素材、本地记录或 oracle 材料，不能等同为 TestReport 或 file delivery 闭环。
- 心跳、状态查询、自检、告警、JSON TestReport、FTP 上传、完成通知、外部错误码和拒绝语义都是 northbound gap，不是旧系统已有闭环。

## 4. Execution Posture

本次重写不按“很窄切片、小修小补”推进。目标是全面重建代码组织和核心链路，让代码更干净、边界更清晰、验证更容易。

但全面重写不等于同时改所有东西。推进方式应是：

- 先锁业务语义和质量边界。
- 再锁目录归口和运行主状态归属。
- 再按功能域批量重写，避免旧耦合被逐步搬进新系统。
- 每个功能域完成后必须留下 oracle、fixture、manual checklist 或 runtime validation 证据。

不再继续做的事情：

- 不继续泛泛裁剪旧功能。
- 不继续把“不要做的事”扩成长清单压住实现。
- 不用旧代码文件结构推导新目录。
- 不为还没确认的甲方 schema 写长期契约。
- 不把 refactor 文档、easysdd 文档和 codestable 文档并列扩写成三套主线。

## 5. Recommended Work Order

### 5.1 Before implementation

先完成两类讨论：

1. 一期 northbound 最小业务闭环确认。
2. 功能域重写顺序确认。

一期 northbound 只讨论语义，不写 schema：

- 接收任务。
- 启动任务。
- stop 控制。
- 状态查询。
- 用例结果。
- 任务结果。
- JSON 报告。
- 文件上传或回传。
- 完成通知。
- 明确不做或仅保留概念的设备管理、用例资产、参数协同、告警、升级、重启等完整二级子系统能力。

功能域重写顺序建议：

1. `frame / storage / settings`: 先固定资产、持久化、迁移输入输出和基础设置。
2. `platform / connection`: 再固定 Electron 边界、串口、TCP、TCP server、UDP 和 target 可用性。
3. `receive / send / task`: 再固定接收解析、发送构帧、发送结果、定时发送和任务状态推进。
4. `scoe`: 单独纳入专项能力，显式接入 receive/send/task，不混进通用链路。
5. `status / result / report / northbound`: 最后对接甲方闭环和对外交付。

### 5.2 During implementation

每个功能域开始前必须回答：

- 这个域保留哪些旧系统可观测行为？
- 旧系统哪些材料可作为自动 fixture？
- 哪些行为只能手工 checklist？
- 哪些必须 runtime / hardware validation？
- 涉及哪些 target structure 边界？
- 是否涉及 SCOE、高速存储或 northbound 例外？
- 是否需要先问用户或甲方？

每个功能域完成前必须提供：

- 行为范围说明。
- 状态归属说明。
- Electron / platform 说明。
- oracle 和 validation 说明。
- 未验证项和 deferred 项。

## 6. New Conversation Routing

后续可以拆成这些新对话，不要混在同一轮里同时解决：

| Conversation | Goal | Main inputs |
| --- | --- | --- |
| northbound phase-one loop | 锁一期甲方闭环语义和不做项 | 本文 + `northbound-overlap-and-gap-map.md` + 甲方材料 |
| rewrite domain order | 锁功能域重写顺序和批次 | 本文 + `rewrite-scope-default-preserve.md` + `rewrite-target-structure.md` |
| frame/storage/settings rewrite | 锁资产、持久化、迁移和设置归口 | 本文 + v1.2 baseline + 旧 JSON 样例 |
| platform/connection rewrite | 锁 Electron、串口、网络和 target 运行边界 | 本文 + target structure + quality rules |
| receive/send/task rewrite | 锁核心收发链、定时发送、任务状态和 oracle | 本文 + v1.2 baseline + quality checklist |
| SCOE rewrite | 锁 SCOE 专项能力和边界例外 | 本文 + SCOE 架构文档 + v1.2 baseline |
| result/report/northbound rewrite | 锁内部结果、报告生成、对外交付和 gap | 本文 + northbound gap map + 甲方确认结果 |

如果某轮需要大规模旧代码检索，应先产出只读检索 prompt，让独立对话或子 agent 输出证据文档，再回到主线合并判断。

## 7. Validation Policy

静态文档不能替代运行验证。

自动 fixture 优先覆盖：

- frame asset 校验和 legacy JSON 迁移。
- receive bytes -> frame match -> fields -> expression/result。
- send build -> target request -> send result。
- timed send / task state transition。
- SCOE command parse / checksum / completion condition。
- storage/history/CSV/export。
- status mapping。
- result/report object generation。
- northbound request/response mapping。

手工 checklist 优先覆盖：

- 页面入口是否仍可达。
- 连接操作流程。
- 文件导入导出。
- 设置读写。
- 状态指示展示。
- SCOE 工具操作。
- 报告和历史的用户可见结果。

runtime / hardware validation 必须覆盖：

- 真实串口枚举、连接、断开、收发和事件顺序。
- TCP/UDP 断线、重连、高频数据、远端变化。
- SCOE 真实设备、timeout、状态循环和完成条件。
- 打包态 data path 写入、备份、清理。
- northbound HTTP/FTP 交付、失败补偿和客户侧接收确认。

没有 runtime 证据时，只能声明“静态分析通过”或“fixture 通过”，不能声明硬件链路、打包链路或甲方闭环完成。

## 8. User / Customer Decisions Still Needed

用户侧后续需要先确认：

- 一期 northbound 是否只做 task -> start -> stop -> result -> report -> delivery 主闭环。
- 旧 task 除定时发送外，哪些形态必须保留为用户可见能力。
- SCOE 在首版中作为专项工具保留，还是也进入主业务闭环。
- 哪些待实现按钮或占位能力可以进入 drop list。
- 是否有全套旧 JSON 样例可以作为迁移 fixture 输入。

甲方侧后续需要确认。

以下词语来自甲方材料或当前沟通记录，只用于描述待确认问题；本文不冻结 schema、API 命名、字段名或枚举值：

- `subSysId`、`subSysType`、`deviceId`、设备类型和地址编码来源。
- `startTestCaseList` 是否确认为 task start，还是可能代表部分 case list start。
- phase one 是否只支持 `stop`，以及收到 `pause/continue/abort` 时如何响应。
- stop 后外部状态名到底是 `stopped`、`terminated`、`cancelled` 还是其他官方值。
- case result、task result、exception code、handleCode、拒绝执行枚举。
- JSON TestReport 的层级、必填字段、文件命名和样例。
- FTP 目录、覆盖、重试、保留、失败补偿和 HTTP 完成通知规则。
- heartbeat 是否需要 response、间隔、超时和失败口径。

## 9. Quality Gate For Handoff

任何进入实现的新对话或子任务，必须带上以下约束：

- 默认保留旧系统可观测行为。
- 不继承旧代码组织和耦合方式。
- 遵守 `rewrite-target-structure.md`。
- 遵守 `rewrite-quality-rules.md`。
- 完成后按 `rewrite-review-checklist.md` 自查并交给独立 verifier / reviewer。
- 涉及 northbound 时读取 `northbound-overlap-and-gap-map.md`。
- 涉及 SCOE 时显式登记边界例外。
- 涉及硬件、打包、HTTP/FTP 时必须标记 runtime validation，不用静态测试冒充完成。

## 10. Immediate Next Step

下一步建议先开一个窄讨论：

**Northbound phase-one loop confirmation**

讨论顺序：

1. 是否把一期最小闭环固定为 task receive -> start -> stop -> case result -> task result -> JSON report -> file/report delivery notice。
2. 是否明确排除或仅概念保留 device management、use-case asset management、parameter cooperation、alarm、upgrade、restart。
3. 是否确认 `startTestCaseList` 暂按 task start 处理。
4. 是否确认只支持 `stop`，并把停止后状态记为 `stopped`。
5. 是否列出需要问甲方的字段、枚举、样例和环境材料。

这一步完成后，再进入功能域重写顺序和实现计划。
