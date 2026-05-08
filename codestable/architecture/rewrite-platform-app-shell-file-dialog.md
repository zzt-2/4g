---
doc_type: architecture
type: rewrite-platform-app-shell-file-dialog
status: draft
date: 2026-04-30
summary: Foundation boundary design for platform, preload, main, app shell, and feature-owned file/path/dialog/window-control responsibilities before frame/settings/storage implementation continues. This document fixes capability ownership and validation gates without defining API schemas.
tags:
  - rewrite
  - platform
  - app-shell
  - file-dialog
  - boundary
  - frame
  - settings
  - storage
---

# Rewrite platform app shell file dialog boundary

## 1. Scope

本轮是东方红上位机重写的 Lane B foundation boundary design。本文只锁定 platform / preload / main / renderer / app shell / feature 在 file、path、dialog、window controls 上的职责边界，不写业务代码，不修改 `rewrite/src` 实现，不定义 preload/main/renderer API schema。

Direct contract:

- `AGENTS.md`
- `codestable/compound/2026-04-28-rewrite-execution-charter.md`
- `codestable/compound/2026-04-28-rewrite-scope-default-preserve.md`
- `codestable/architecture/rewrite-target-structure.md`
- `codestable/architecture/rewrite-system-architecture.md`
- `codestable/architecture/rewrite-feature-boundaries.md`
- `codestable/architecture/rewrite-feature-interaction-matrix.md`
- `codestable/architecture/rewrite-shared-tooling-audit-plan.md`
- `codestable/architecture/rewrite-pre-design-gate-and-sequencing.md`
- `codestable/architecture/rewrite-platform-api-surface-reduction.md`
- `codestable/architecture/rewrite-shared-tooling-app-shell-ownership.md`
- `codestable/features/rewrite-frame/rewrite-frame-design.md`
- `codestable/features/rewrite-frame/rewrite-frame-checklist.yaml`
- `codestable/features/rewrite-settings/rewrite-settings-design.md`
- `codestable/features/rewrite-settings/rewrite-settings-checklist.yaml`
- `codestable/features/rewrite-storage-local-baseline/rewrite-storage-local-baseline-design.md`
- `codestable/features/rewrite-storage-local-baseline/rewrite-storage-local-baseline-checklist.yaml`
- `codestable/quality/rewrite-quality-rules.md`
- `codestable/quality/rewrite-review-checklist.md`
- 当前 rewrite scaffold 相关文件：`rewrite/quasar.config.ts`、`rewrite/src-electron/main`、`rewrite/src-electron/preload`、`rewrite/src/platform`、`rewrite/src/shared`

Boundary guards:

- `rewrite/` 是新的独立应用根。
- renderer 只能通过 `rewrite/src/platform` facade 访问桌面能力。
- preload 只暴露 typed bridge，不暴露裸 `invoke/send/on`。
- main 只做平台资源、生命周期、必要系统能力，不承载 frame/settings/storage 业务语义。
- platform 只拥有 file/path/dialog/window 等能力类别，不拥有 frame JSON 语义、settings 配置语义、history/CSV/report/northbound delivery 语义。
- 不冻结具体 API 字段、方法签名、channel 名、错误码。
- 不声明 packaged data path、HTTP/FTP、northbound、硬件或客户闭环完成。

Non-goals:

- 不设计 frame/settings/storage 内部字段、文件格式、schema、枚举或错误码。
- 不进入 receive/send/task/SCOE/result/report/northbound 设计。
- 不把 history/CSV/local export 等同 report 或 northbound delivery。
- 不把旧 `src/api/common`、旧 `window.electron`、旧 preload 聚合或旧 main handlers 迁移成目标架构。

## 2. Evidence summary

旧系统事实只作为 evidence、oracle 候选和迁移风险，不升级为目标架构。

Evidence:

- 旧 preload 通过 `contextBridge.exposeInMainWorld('electron', api)` 暴露 `window.electron` 大包；聚合能力包含 window、menu、path、files、dataStorage、historyData、highSpeedStorage 等。
- 旧 renderer wrapper 基本围绕 `src/api/common/*Api.ts` 访问 `window.electron`，形成 renderer 侧平台兼容层。
- 旧 `src/composables/window/useWindowControls.ts` 直接读取 `window.electron.window`，窗口控制未经过目标 platform facade。
- 旧 file/path/dialog 链路并行存在多条入口：`src/utils/common/fileDialogManager.ts`、`src/layouts/useFileDialog.ts`、`src/components/common/FileListDialog.vue`、`src/composables/common/useFileDialog.ts`、`src/utils/common/dialogUtils.ts`。
- 旧文件能力混合了平台 I/O 和业务语义：`fileMetadataHandlers` 提供文件元信息和 JSON 读写；`dataStorageHandlers` 混合 data key、路径映射、导入导出；`historyDataHandlers` 混合 history、CSV、清理和 native dialog；`highSpeedStorageHandlers` 混合文件流、规则匹配和统计含义。
- 旧 path 能力存在开发态/打包态路径计算和 `public` 目录耦合证据，不能直接升级为长期 data path 策略。
- 旧 settings 页面有“选择文件夹”“导出设置”“导入设置”入口，但当前是占位提示；不能在重写中误报为已完成能力。
- 旧 frame 导入导出、storage local history/CSV 和 settings 路径偏好都依赖 file/path/dialog 能力，但各自的 JSON、配置、history、CSV 语义分别归 feature。
- 当前 `rewrite` scaffold 已收缩到 metadata-only bridge：main 创建窗口并挂 preload；preload 只注入 bridge metadata；renderer platform facade 只读取 bridge info；shared bridge capability 类型当前为空。

Inference:

- 目标边界需要保留 file/path/dialog/window 这些平台能力类别，但必须删除大包、裸 IPC、任意路径读写和业务化 main handler。
- app shell 需要统一用户可见的文件对话框和窗口控制入口；feature 只表达导入、导出、选择目录、保存等业务意图和结果语义。
- `frame`、`settings`、`storage` 后续可以使用 fake adapter、fixture 和 manual checklist 推进核心设计，但 packaged data path 和真实 Electron dialog 行为必须等 runtime/package validation。

## 3. Owner split

| Owner | Owns | Does not own |
| --- | --- | --- |
| platform | renderer 侧桌面能力 facade；file/path/dialog/window capability category；能力可用性、桥接存在性和受控技术结果的抽象；feature adapter 可替换入口。 | frame JSON 语义、settings 配置语义、history/CSV 语义、report/northbound delivery 语义、业务校验、状态推进、字段 schema。 |
| preload | 最小 typed bridge；只暴露已批准的 capability category；隔离 renderer 与 Electron/Node；把 platform facade 能调用的技术能力接到 main。 | 裸 `invoke/send/on`、任意 channel、`window.electron` 大包、业务动作集合、frame/settings/storage 语义、错误码合同。 |
| main | BrowserWindow 生命周期、窗口系统操作、native dialog、受控文件 I/O、目录准备、受控路径解析、packaged/runtime 状态判断、必要的系统权限调用。 | 解析 frame JSON、决定 settings 默认值、生成 history/CSV 业务内容、定义 report/TestReport、判断 northbound delivery success、承载 receive/send/task/SCOE/result/report 规则。 |
| app shell | 应用壳、布局、全局文件对话框挂载、窗口控制 UI、用户可见 dialog flow、页面级 intent 到 feature/runtime 的连接。 | 文件内容业务解释、导入导出校验、持久化策略、history/CSV 字段选择、report/northbound 交付闭环、跨 feature 业务规则。 |
| feature | 领域语义、导入导出内容解释、校验、迁移、序列化、持久化策略、用户可见业务结果；通过 adapter 使用 platform/app shell 能力。 | 直接访问 Electron/Node/`window.electron`/裸 IPC；拥有其他 feature 的运行事实；把平台技术失败升级成 northbound/report 语义。 |
| runtime | 启动/销毁顺序、跨 feature 装配、settings/frame/storage 加载次序、边界例外登记、packaged path 和高频路径的验证登记。 | 领域内部规则、文件内容 schema、UI 展示态、平台资源细节、main/preload API schema、report/northbound 外部语义。 |

Runtime owns / does not own:

- runtime owns 应用启动时 frame/settings/storage 的加载顺序和依赖注入位置。
- runtime owns 使用 packaged data path、高速文件写入、future HTTP/FTP transport 等例外的登记和验证要求。
- runtime does not own frame JSON migration、settings default merge、history/CSV local export semantics、report object generation 或 northbound delivery closure。

## 4. Allowed capability categories

本文只允许写能力类别，不写 API schema。

| Capability category | Allowed owner path | Allowed use | Must stay out |
| --- | --- | --- | --- |
| window controls | app shell -> platform -> preload -> main | 窗口最小化、最大化、关闭、窗口状态读取等系统窗口控制类别。 | 页面/feature 直连 Electron；settings 拥有窗口行为；业务状态进入 window bridge。 |
| menu visibility | app shell -> platform -> preload -> main | 菜单显示状态作为 shell capability 候选；无明确 UX 需求时 deferred。 | menu 业务路由、feature action registry、任意菜单事件总线。 |
| native dialog | app shell or feature adapter -> platform -> preload -> main | 文件选择、保存位置选择、目录选择、取消/失败等技术结果。 | frame/settings/storage 的 JSON、配置、history、CSV 语义。 |
| app-shell file dialog flow | pages/features -> app shell -> feature service/adapter | 统一用户可见文件选择/保存流程和 dialog UI 状态。 | EventBus 泛化为 runtime bus；widget 直接访问 platform/files/path。 |
| bounded file I/O | feature adapter -> platform -> preload -> main | 受控读取、写入、列表、删除、元信息、目录准备等文件能力类别。 | 任意路径读写；业务 JSON CRUD；history/CSV/report delivery 语义。 |
| bounded path category | feature adapter or runtime -> platform -> preload -> main | 开发态/打包态路径类别、应用数据根、packaged state、受控路径组合类别。 | raw path resolver 作为业务工具；旧 `public` data path 作为长期策略。 |
| capability health metadata | app/platform -> preload/main | 桥接是否存在、平台能力是否可用、版本/能力健康信息。 | 以健康信息替代 feature 业务状态或验收证据。 |

Allowed categories do not imply final method names, channel names, payloads, return fields or error codes.

## 5. Forbidden surfaces

Forbidden:

- 禁止 `window.electron` 大包。
- 禁止裸 IPC，包括 renderer 可见的裸 `invoke/send/on` 和任意 channel 订阅。
- 禁止 renderer 直接访问 `fs`、`path`、Electron、`ipcRenderer`、Node、`net`、`serialport`。
- 禁止 feature/page/widget 直接访问 preload bridge 细节；正式入口只能是 `rewrite/src/platform` facade 或 feature/app shell 公开入口。
- 禁止 platform 解释业务 JSON、settings 配置、history、CSV、report、northbound delivery。
- 禁止 main 承载 frame/settings/storage 业务语义，除非仅保留平台 I/O 或性能侧处理，并登记 runtime boundary exception。
- 禁止从旧 `src/api/common`、旧 preload API、旧 main IPC handler 按文件名平移到 `rewrite/src/platform`。
- 禁止把 history/CSV/local export 作为 TestReport、file delivery 或 northbound HTTP/FTP 闭环完成证据。

Review stance:

- 任何重新引入大包、裸 IPC、renderer 直连 Node/Electron、业务化 platform/main 的实现，应判为 `revise-required`。
- 如果 feature implementation 触达 file/path/dialog/window 但没有把本文列为 direct contract 或 boundary guard，应判为 `blocked`。

## 6. Feature usage boundary

### 6.1 Frame

Frame 只能通过 app shell 或 platform-facing adapter 使用 file/path/dialog 能力。

Frame owns:

- frame asset 导入内容识别。
- frame JSON 校验、迁移、兼容警告和失败口径。
- frame 导出内容的序列化和 round-trip fixture。
- frame 页面上的导入/导出业务结果展示。

Frame does not own:

- native dialog 实现、路径解析、真实文件写入。
- storage data path 策略。
- receive/send/task/SCOE/result/report/northbound 语义。

Validation:

- frame JSON migration、导入失败和导出 round-trip 可用 fixture/fake adapter 验证。
- 页面入口、导入导出 dialog 和错误提示需要 manual checklist。
- 真实 Electron 文件读写、开发态/打包态路径和导入后消费者刷新需要 runtime/package validation。

### 6.2 Settings

Settings 只能在设置持久化、设置导入导出或目录选择用户流程被明确确认后使用 file/path/dialog 能力。本轮不把旧占位按钮升级为已完成能力。

Settings owns:

- 用户可见配置、默认值、持久化配置事实、只读 snapshot。
- settings import/export 若未来确认，其配置内容语义和兼容规则归 settings。
- 目录选择若未来确认，其用户偏好事实归 settings；目录是否存在、可写和打包态可用性归 platform/storage/runtime validation。

Settings does not own:

- 文件系统实现、raw path 拼接、native dialog。
- storage history/CSV、recording runtime、status 当前颜色、connection 运行状态。
- app shell window/menu/autolaunch 能力本身。

Validation:

- 默认值合并、旧 key 输入、reset 行为可用 fixture/fake adapter。
- 设置页表单、占位按钮、目录选择可见流程需要 manual checklist。
- 启动加载顺序、设置变更后消费者重新应用、打包态设置存储位置需要 runtime/package validation。

### 6.3 Storage local baseline

Storage 可以为 local persistence、history、CSV local export、legacy material import/export 和 cleanup 使用 file/path/dialog 能力。Storage 是本地持久化语义 owner，不是 platform owner。

Storage owns:

- local record、history、CSV local export、cleanup、legacy material classification。
- 使用 settings snapshot 作为保存间隔、默认导出目录等输入时的 storage-side application。
- history/CSV/local export 作为 local material 的语义和用户可见状态。

Storage does not own:

- native file/path/dialog implementation。
- frame JSON 语义、settings 配置 truth、receive/send/task/SCOE/result/report 内部 truth。
- TestReport、HTTP/FTP、northbound delivery success。

Validation:

- history hour file、CSV escaping/order、cleanup、损坏文件、取消/失败等可用 fixture/fake adapter。
- storage/history 页面、时间选择器、CSV dialog、文件对话框需要 manual checklist。
- packaged data path、长期写入、备份、清理、权限和路径迁移必须 runtime/package validation。

## 7. Validation layers

| Layer | Can prove | Cannot prove | Required for |
| --- | --- | --- | --- |
| fake adapter | feature service/core 在取消、失败、不可用、只读、路径无效等技术结果下的分支；不触达真实 Electron/文件系统。 | native dialog 是否弹出、真实权限、打包路径、用户文件系统行为。 | frame import/export service、settings load/save/import-export candidate、storage load/save/export/cleanup services。 |
| fixture | 旧 JSON、旧 settings key、history hour file、CSV expected output、路径错误样本、损坏文件样本的确定性输入输出。 | 真实 app 运行、native dialog、OS 权限、packaged path、硬件链路、customer closure。 | frame migration、settings default merge、storage history/CSV/local export。 |
| manual checklist | 用户可见入口、窗口控制、dialog flow、取消/确认、错误提示、设置页占位行为、导入导出可见路径。 | 核心规则正确性、长期写入稳定性、打包态路径、外部交付。 | app shell file dialog、window controls、frame/settings/storage 页面交互。 |
| runtime validation | Electron bridge 挂载、preload/main 真实调用、应用启动加载顺序、真实文件读写、设置变更后消费者应用。 | 打包态长期路径和权限、HTTP/FTP、真实硬件、客户接收确认。 | platform/preload/main 能力实现、frame/settings/storage 运行态 smoke。 |
| package validation | packaged app 下数据根、asar/resources/userData 行为、权限、长期写入、备份、清理、路径迁移。 | 业务 schema 完整性、硬件吞吐、HTTP/FTP/customer closure。 | packaged data path、storage persistence acceptance、report material file path before future report delivery。 |

Hardware/customer validation:

- 真实串口、TCP/UDP、SCOE 设备、高速吞吐、HTTP/FTP、northbound、TestReport 和客户接收确认不由本文完成。
- 涉及这些项的后续 feature 只能声明 fixture/manual/runtime/package 对应层级，不得跨层宣称完成。

## 8. Implementation gate

后续进入 implementation 前必须同时满足：

1. 当前 feature 重新列出 Direct contract / Boundary guards，并把本文列入涉及 file/path/dialog/window 的合同或护栏。
2. 明确该改动只需要 app shell、platform、preload、main、feature、runtime 中哪些 owner 参与。
3. 明确使用的能力类别，且只写 capability category，不先冻结 API schema、channel、字段、错误码。
4. 明确 feature adapter 如何用 fake adapter/fixture 先验证业务语义。
5. 明确哪些行为进入 manual checklist，哪些需要 runtime validation，哪些阻塞 package validation。
6. 若 main 需要保留平台侧批处理、文件流、路径、权限或 dialog 行为，必须说明业务语义最终归哪个 feature。
7. 若使用 packaged data path、长期写入、高速存储、HTTP/FTP 或其他例外，必须登记 runtime boundary exception。
8. 确认没有从旧 `src/api/common`、旧 `window.electron`、旧 preload 聚合、旧 main business handler 复制目标架构。

不能进入 implementation 的情况：

- 需要 final platform API schema 才能判断范围。
- 需要 frame/settings/storage 内部字段才能写 platform/preload/main。
- 需要 northbound/report/file delivery 语义才能判断 local history/CSV 行为。
- 需要真实打包态 data path 证据却未登记 package validation blocker。

## 9. Deferred and blockers

Deferred:

- final platform/preload/main/renderer API schema、method names、channel names、payload fields、错误码。
- app shell 最终采用 native dialog、custom file dialog 或混合方式的交互细节。
- settings “选择文件夹”“导入设置”“导出设置”是否成为真实能力。
- menu visibility、autoLaunch 等系统能力是否成为用户可见设置。
- path category 的最终命名、存储根选择和迁移策略。
- frame/settings/storage 内部字段、文件格式和迁移兼容范围。
- high-speed storage short-circuit、receive/display/trigger 影响和高吞吐背压策略。
- report object、TestReport、HTTP/FTP、northbound delivery、完成通知、外部错误/拒绝语义。

Blockers:

- 没有 packaged app data path validation，不能声明 packaged persistence、备份、清理或长期写入验收完成。
- 没有 runtime evidence，不能声明真实 native dialog、preload/main bridge 或 Electron 文件能力完成。
- 没有旧样本/fixture，不能声明 frame migration、settings compatibility、history/CSV local export 语义完整。
- 没有 northbound/customer materials，不能声明 report/file delivery/customer closure。
- 没有真实串口/TCP/UDP/SCOE/high-speed evidence，不能声明硬件链路或高吞吐链路完成。

## 10. Handoff note

本文是 `frame/settings/storage` 正式继续 implementation 前的 file/path/dialog/window boundary gate。后续 feature design/checklist 可以引用本文来判断 platform/app shell 使用是否合法；本文本身不替代 `rewrite-platform-api-surface-reduction.md`、`rewrite-shared-tooling-app-shell-ownership.md`、各 feature design 或质量规则。
