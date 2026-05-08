---
doc_type: compound
type: rewrite-scope-default-preserve
status: draft
date: 2026-04-28
summary: Default-preserve rewrite scope memo. The rewrite keeps legacy-visible capabilities by default while replacing the old code organization, state coupling, and Electron boundary with cleaner project-specific rules.
tags:
  - rewrite
  - scope
  - default-preserve
  - quality
  - northbound-gap
---

# Rewrite scope: default preserve, quality-first rewrite

## 1. Purpose

本 memo 固定当前重写范围口径：

- 重写目标不是大幅砍旧功能，而是在尽量保留旧功能的前提下重做代码组织、状态边界和 Electron 平台边界。
- 旧系统可观测业务能力默认保留；只有实现成本明显高、实际价值低、或与甲方新需求冲突的功能才进入排除候选。
- 旧代码组织、旧全局状态穿透、旧模块耦合方式、旧 IPC 暴露方式不作为迁移对象。
- 后续目录结构、质量规则和 review checklist 应以本 memo 为范围前提，不再逐项把旧功能裁到很窄。

## 2. Inputs

Evidence:

- 旧系统功能总账是 `static-code-v1.2` baseline，可作为静态范围事实和 oracle 输入，但不是 runtime oracle。`easysdd/compound/2026-04-27-legacy-feature-inventory-and-oracle-map.md:16-21`
- 旧系统用户可见入口包括连接管理、SCOE、配置/帧编辑、发送、接收、存储、历史和设置。`easysdd/compound/2026-04-27-legacy-feature-inventory-and-oracle-map.md:51-55`
- v1.2 已将 frame、connection、receive、send、send task/timer、SCOE、storage/history、settings/status、Platform API、northbound gap 分为主要功能域。`easysdd/compound/2026-04-27-legacy-feature-inventory-and-oracle-map.md:74-88`
- 本轮补充判断：旧功能尽量保留，主要目标是优化代码质量；不希望因为过度范围裁剪导致重写后还要重新补一遍旧能力或甲方需求。

## 3. Scope Principle

### 3.1 Default preserve

默认保留旧系统的用户可见能力和关键运行行为：

- 页面入口默认保留。
- 连接、接收、发送、定时发送、帧资产、SCOE、存储、历史、设置、状态指示等旧能力默认保留。
- 旧系统中能作为用户操作、运行结果、历史数据、发送/接收效果、状态显示、文件结果的可观测行为，默认进入重写范围。

### 3.2 Not inherited

默认不继承旧实现方式：

- 不继承旧目录结构。
- 不继承跨 store / 跨 composable 的状态穿透方式。
- 不继承 UI 组件直接承载复杂业务流程的写法。
- 不继承 receive/send/task/SCOE/storage 混在同一运行路径里的耦合方式。
- 不继承宽口径 preload 暴露、裸 IPC 或任意路径文件能力。
- 不为旧 JSON 格式扭曲新核心模型；旧 JSON 后续可通过迁移脚本进入新模型。

### 3.3 Drop only by exception

功能只有在满足以下条件之一时，才进入 `candidate to drop`：

- 实现成本明显高，但用户侧没有实际使用价值。
- 旧行为只是历史占位、待实现按钮、contract drift 或内部副作用。
- 与甲方新需求或重写后的核心业务口径冲突。
- 保留它会显著污染新模型，而迁移脚本、兼容工具或后置工具能更低成本覆盖实际需要。

## 4. Default Preserved Functional Surface

| Domain | Default scope | Notes |
| --- | --- | --- |
| UI shell / pages | 保留所有旧页面入口 | 页面入口保留不代表复刻旧 UI 结构。 |
| frame template / frame asset / frame editor | 保留独立帧资产业务对象、列表、编辑、新建、删除、复制、收藏、导入导出 | 不要求兼容旧 `framesConfig` 内部格式；旧 JSON 迁移另行脚本化。 |
| connection / serial / network / targets | 保留串口、TCP、TCP server、UDP remote host、target 可用性语义 | 不继承旧 store/index/cache 组织。 |
| receive pipeline | 保留 bytes -> 匹配帧 -> 字段解析 -> 当前值/表达式/统计/trigger 等可观测结果 | 不继承旧 receive store 聚合 SCOE/task 的实现方式。 |
| send pipeline | 保留手工发送、发送实例、target 路由、发送成功/失败结果、统计副作用 | 不继承旧 unified sender 的跨 store 更新和专项硬编码。 |
| send task / timer | 保留实际使用过的定时发送能力；其他旧 task 形态默认保留为兼容候选而非首要模型中心 | 旧 send task 不能直接等同甲方 task。 |
| SCOE | 保留页面入口和旧专项能力作为 integration candidate | 需要结合甲方新需求确认哪些进入主链，哪些作为专项工具能力。 |
| storage / history / import-export / files | 保留本地存储、历史、CSV、高速存储、导入导出等用户可见能力 | 文件/报告北向交付另列 gap。 |
| settings / status indicators | 保留真实运行设置、状态指示灯能力和用户入口 | 待实现按钮可单列 candidate to drop。 |
| Platform API / Electron boundary | 保留平台能力需求，不保留旧暴露方式 | 新边界应服务简单、集中、可测试，不以裸 Node 访问换取表面省事。 |
| northbound / result-report | 全部进入总范围，但作为 gap map 处理 | 不能把旧 history/CSV/send task 当作已有北向闭环。 |

## 5. Quality-Driven Rewrite Targets

本轮复核后的旧代码反模式可作为后续 `codestable/quality/rewrite-quality-rules.md` 的证据来源。

Evidence:

- `receiveFramesStore` 已承接接收、SCOE 处理和触发发送任务链路，职责边界偏宽。`src/stores/frames/receiveFramesStore.ts:116-130`, `src/stores/frames/receiveFramesStore.ts:911-1040`, `src/stores/frames/receiveFramesStore.ts:1155-1166`
- 串口和网络高频数据存在主进程/renderer/store 逐包穿透路径。`src/stores/serialStore.ts:392-417`, `src-electron/main/ipc/networkHandlers.ts:480-520`, `src/stores/netWorkStore.ts:207-213`
- preload 将聚合能力暴露为 `window.electron`，文件/path API 存在路径边界控制不足风险。`src-electron/preload/index.ts:1-31`, `src-electron/preload/api/files.ts:1-43`, `src-electron/main/ipc/fileMetadataHandlers.ts:8-119`, `src-electron/preload/api/path.ts:16`
- `networkHandlers` 在网络接收主路径中内嵌高速存储分流，命中后不再广播给 renderer。`src-electron/main/ipc/networkHandlers.ts:505-516`
- `scoeStore` 同时承担配置持久化、状态、TCP/UDP 连接生命周期、发送调度和测试工具状态。`src/stores/scoeStore.ts:1-24`, `src/stores/scoeStore.ts:78-110`, `src/stores/scoeStore.ts:252-310`
- `useUnifiedSender` 发送成功后跨 store 更新统计，并硬编码 SCOE UDP target 特例。`src/composables/frames/sendFrame/useUnifiedSender.ts:149-165`
- 发送相关 UI 组件直接创建并启动 task。`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:260-274`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:645-754`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:359-362`

Candidate rule:

- 重写必须用质量边界解决这些问题，而不是只把旧代码换一层目录。
- receive、send、task、SCOE、storage 的核心规则应尽量成为可测试的 TypeScript 逻辑，不绑定页面和 Electron。
- UI 只负责用户交互和 view model，不直接承担复杂任务编排。
- 高频数据路径必须有批量、缓冲、聚合或节流策略；不允许把逐包处理压力散落到页面和全局 store。

## 6. Electron Boundary Decision

当前重写口径：

```ts
nodeIntegration: false
contextIsolation: true
sandbox: false
```

Candidate rule:

- renderer 不直接访问 Node、Electron、`ipcRenderer`、`fs`、`serialport`。
- preload 不暴露裸 `invoke/send/on`，只暴露少量 typed API。
- renderer 通过 `platform/*` facade 访问串口、网络、文件、路径、窗口等平台能力。
- main 负责平台资源访问和生命周期，不承载可测试的领域业务规则。
- IPC 以粗粒度能力为主，避免按组件或细碎动作散落通道。
- 安全不是本轮唯一理由；主要理由是降低长期复杂度、防止平台能力污染页面、store 和领域逻辑。

## 7. Northbound and Legacy Overlap

Northbound 需求全部进入总范围，但必须和旧功能区分层级。

High-confidence conclusions:

- 甲方主线可概括为任务下发、执行控制、结果/文件/报告回传链路。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/04-任务主链.md:145`, `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/04-任务主链.md:166`, `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-结果、文件与报告回传.md:1-108`
- 旧 `send task` 可提供内部执行材料，但不是甲方 `setTestTask/controlTestTask`。`src/stores/frames/sendTasksStore.ts:15-30`, `src/composables/frames/sendFrame/useSendTaskController.ts:26-117`
- 心跳、状态查询、报告、文件回传、设备对象更偏 northbound gap，不是旧系统已有闭环。
- 旧 receive/history/CSV/serial/network 可作为内部事实来源或 oracle，但不能自动等同对外交付协议。
- SCOE 是旧系统明确专项能力，但在甲方文档中不是明确一级对外接口；当前标记为 `unknown / internal capability / integration candidate`。

Required distinction:

| Topic | Legacy material | Northbound status |
| --- | --- | --- |
| task | 旧本地发送/定时/触发执行 | 可对齐内部执行能力，但不是同一层模型 |
| status | 连接状态、状态灯、SCOE 状态 | 可提供内部事实，心跳/状态查询是 gap |
| result | 接收当前值、表达式、统计、发送结果、SCOE 命令结果 | 可作为结果来源，字段口径和上报时机是 gap |
| report | history、CSV、本地文件 | 可作为素材，JSON TestReport 和交付链路是 gap |
| file return | 本地文件 API、导入导出、高速存储文件 | FTP/HTTP 回传和完成通知是 gap |
| device | serial/network target | 可作底层连接材料，不能替代 device/deviceId |
| SCOE | 旧专项协议和工具能力 | 是否属于甲方需求需确认 |

## 8. Candidate Exclusions

当前只记录少量排除候选，不扩大裁剪范围：

- 当前仅显示待实现提示、且没有明确用户价值的设置导入/导出、选择目录等按钮。
- 已确认或疑似无主进程发射点支撑的事件订阅 contract drift。
- 仅为旧实现副作用、统计占位、UI 展示差异而存在的行为。
- 旧 JSON 格式兼容逻辑进入迁移脚本，不进入新核心模型。

这些候选必须等用户确认或质量文档落地后再进入正式 drop list。

## 9. Runtime and Oracle Position

本 memo 不替代 runtime oracle。后续 oracle 规划应遵守：

- 旧系统静态 baseline 只提供功能范围和行为候选。
- 自动 fixture 优先覆盖 frame asset、receive parse、send build/result、timer send、SCOE 协议、storage/history 迁移。
- 手工 checklist 覆盖页面入口、连接操作、文件导入导出、设置、状态显示、SCOE 工具操作。
- 真实串口、TCP/UDP、SCOE 设备、打包态 data path、northbound HTTP/FTP 必须运行态验证。
- 不用旧 UI 布局、旧 store 结构、旧 IPC 组织作为 oracle。

## 10. Document Placement

当前文档主线转向 `codestable/`：

- `codestable/compound/2026-04-28-rewrite-scope-default-preserve.md`: 本 memo，固定默认保留范围。
- `codestable/architecture/rewrite-target-structure.md`: 后续记录目标目录结构、依赖方向和职责归口。
- `codestable/quality/rewrite-quality-rules.md`: 后续记录重写质量红线。
- `codestable/quality/rewrite-review-checklist.md`: 后续记录每轮实现后的复核清单。

`easysdd/compound` 和 `refactor/docs` 保留为历史输入、baseline、甲方文档和证据来源，不作为新增重写主线文档落点。

## 11. Next Decisions

下一步只需要继续讨论三件事：

1. `codestable/architecture/rewrite-target-structure.md` 的目录结构和依赖方向。
2. `codestable/quality/rewrite-quality-rules.md` 的硬规则和反模式清单。
3. `codestable/quality/rewrite-review-checklist.md` 的每轮验收证据要求。

不再继续按很窄切片逐项砍旧功能。
