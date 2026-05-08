---
doc_type: explore
type: legacy-feature-inventory
status: current
date: 2026-04-27
scope: old-system factual inventory and oracle map
baseline: static-code-v1.2
---

# Legacy Feature Inventory and Oracle Map

## 1. Scope and method

### 本轮范围

- **Evidence**: 本文只记录当前旧系统的功能与运行行为事实，用于后续整应用重写前的 oracle、migration、scope 判断。
- **Evidence**: 本文是 `static-code-v1.2` baseline，可作为旧系统功能范围和静态行为总账；不是经过硬件、网络、SCOE 设备、中心系统、FTP 或打包态验证的 runtime oracle。
- **Evidence**: 本轮没有写新系统设计、没有定义字段 schema、没有生成新目录结构、没有修改业务代码。
- **Evidence**: 代码扫描范围以 `src`、`src-electron`、`package.json`、现有 `refactor/docs`、`codestable/compound` 中与功能边界有关的文档为主。
- **Evidence**: 前端自动生成类型文件不作为证据来源；需要确认类型含义时，以业务 store、composable、Electron IPC、文档和 DTO/接口说明为依据。
- **Unknown**: 本轮未连接真实串口设备、TCP/UDP 设备、SCOE 外部设备、中心系统、FTP 服务，也未运行打包安装态。因此涉及硬件时序、外部网络交互、打包后可写路径的结论均只到代码事实和可推断风险为止；打包态 data path 仍需验证，相关代码见 `src-electron/preload/api/path.ts:3-15`。

### skill 与协作方式

- **Evidence**: 仓库内未发现用户指定的 `.agent/skills/easysdd-explore/SKILL.md`。
- **Evidence**: 本轮 fallback 使用 `.agent/skills/cs-explore/SKILL.md` 的事实优先扫描方式，并只参考 decision 类文档结构，不写 architecture decision。
- **Evidence**: 本轮按功能域开启了 8 个 explore/analyst 子 agent 分片：UI/pages/navigation、connection/serial/network/targets、receive pipeline、send pipeline/task/timer、SCOE、storage/history/files、Platform API/Electron boundary、northbound/result-report gap。
- **Evidence**: 主线程负责合并、去重、补查交叉链路和裁决迁移类别，不把最终判断权交给子 agent。

### 证据标准

- **Evidence**: 重要判断尽量给出 `文件:行号`。
- **Inference**: 仅当多个证据之间存在明确调用链或同一行为在不同层反复出现时，才写为推断。
- **Unknown**: 运行态、硬件态、外部系统态无法从代码确认的内容，标记为 Unknown。
- **Candidate migration category**: 迁移建议类别只表达后续讨论候选，不表示新系统必须照搬旧实现。

## 2. Executive summary

### 旧系统功能总貌

- **Evidence**: 当前系统是 Quasar + Vue + Pinia + Electron 的本地上位机工具，`package.json` 的产品名是“激光链路标准测试设备上位机”，运行脚本以 Electron 模式启动和构建，见 `package.json:5`、`package.json:13`、`package.json:15`、`package.json:22-38`。
- **Evidence**: 路由包含首页、连接、帧列表/编辑、发送、接收、设置、存储、历史、SCOE 和 404 fallback，见 `src/router/routes.ts:3-54`。
- **Evidence**: 左侧导航暴露首页、连接、SCOE、配置、发送、接收、存储、历史、设置，点击后直接 `router.push`，见 `src/components/layout/SidePanel.vue:32-47`。
- **Evidence**: 帧列表/编辑是独立资产入口，路由包含 `/frames/list` 和 `/frames/editor`，见 `src/router/routes.ts:14-19`；帧模板 store 负责加载、创建、更新、删除并持久化 `framesConfig`，见 `src/stores/frames/frameTemplateStore.ts:26-96`。
- **Evidence**: App mount 时会加载帧配置、发送实例、接收配置、串口、连接目标、统计、SCOE、历史数据采集和自动记录；unmount 时会停止记录、停止数据采集、清理统计并清空接收数据项当前值后保存配置，见 `src/layouts/useAppLifecycle.ts:45-89`。
- **Inference**: 旧系统的核心不是单一“任务系统”，而是本地工具式组合：连接目标管理、接收解析、发送/任务/定时触发、SCOE、文件/历史存储、Electron 平台能力。
- **Inference**: 本文可进入 rewrite scope 讨论，但不能直接封口为最终 runtime oracle；硬件时序、外部协议、packaged 文件可写性和部分事件契约仍需要运行态验证。

### 用户可见功能

- **Evidence**: 用户可见入口主要包括连接管理、SCOE、配置/帧编辑、发送、接收、存储、历史和设置，见 `src/components/layout/SidePanel.vue:32-42`。
- **Evidence**: 历史页面提供时间范围、数据类型、CSV 导出等操作，见 `src/pages/HistoryAnalysisPage.vue:39-46`、`src/pages/HistoryAnalysisPage.vue:217-230`、`src/pages/HistoryAnalysisPage.vue:276-309`。
- **Evidence**: 高速存储页面和面板提供启用状态、规则、统计和验证提示，见 `src/pages/storage/HighSpeedStoragePage.vue:11-13`、`src/components/storage/HighSpeedStoragePanel.vue:33-152`、`src/components/storage/HighSpeedStoragePanel.vue:272-285`。
- **Evidence**: SCOE 有配置表单、状态面板、测试工具等页面组件，见 `src/components/scoe/ConfigForm.vue:1-300`、`src/components/scoe/StatusPanel.vue:1-220`、`src/components/scoe/TestTool.vue:1-210`。
- **Evidence**: 设置页暴露自动开始记录、历史数据保存间隔、CSV 默认导出路径、状态指示灯开关/配置、重置设置、导出/导入设置按钮，见 `src/pages/settings/Index.vue:31-185`。

### 隐性运行行为

- **Evidence**: 接收管线使用锁和队列串行化处理并发进入的数据，见 `src/stores/frames/receiveFramesStore.ts:805-904`。
- **Evidence**: 接收成功后会更新当前值、表达式、统计、星座图数据，并触发发送任务条件检查，见 `src/stores/frames/receiveFramesStore.ts:1060-1181`、`src/stores/frames/receiveFramesStore.ts:1215-1293`。
- **Evidence**: 高速存储规则命中后，网络数据会异步写入存储并直接返回，不再广播给 renderer 的 `network:data`，见 `src-electron/main/ipc/networkHandlers.ts:498-520`。
- **Evidence**: send task 的 pause/resume 在控制器层主要改状态，实际 timer 恢复被标记为需要 task-specific 逻辑，见 `src/composables/frames/sendFrame/useSendTaskController.ts:70-117`。
- **Evidence**: Electron preload 统一暴露多类平台 API，BrowserWindow 开启 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: false`，见 `src-electron/preload/api/index.ts:1-31`、`src-electron/main/window.ts:10-40`。
- **Evidence**: 状态指示灯从 receiveFramesStore 的分组数据项当前值计算颜色，并每秒检查数据变化，见 `src/stores/statusIndicators.ts:69-88`、`src/stores/statusIndicators.ts:90-128`。

### 最适合作为 rewrite oracle 的旧行为

- **Candidate migration category: must preserve / compatible**: 接收 bytes 到 frame match、field process、当前值、表达式、统计、trigger 的行为链适合作为 fixture 和 checklist oracle，证据见 `src/stores/frames/receiveFramesStore.ts:1186-1205`、`src-electron/main/ipc/receiveHandlers.ts:54-111`。
- **Candidate migration category: must preserve / compatible**: 串口/TCP/UDP target 的可用性、target path 解析和统一发送结果语义适合作为接口兼容 oracle，证据见 `src/stores/connectionTargetsStore.ts:34-133`、`src/composables/frames/sendFrame/useUnifiedSender.ts:31-167`。
- **Candidate migration category: compatible**: 发送任务的 `running / paused / waiting-trigger / completed / error` 行为和 trigger 条件判断适合作为运行态 checklist，不适合直接等同于新系统中心任务语义，证据见 `src/stores/frames/sendTasksStore.ts:15-30`、`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:70-158`。
- **Candidate migration category: must preserve / compatible**: SCOE 对固定 source/target、命令处理、状态循环和测试工具记录的行为适合作为专项 oracle，证据见 `src/stores/frames/receiveFramesStore.ts:911-1004`、`src/stores/scoeStore.ts:216-340`。
- **Candidate migration category: can redesign**: Electron API 暴露和 fallback 机制是旧系统运行事实，可作为风险清单和兼容 checklist，不应自动作为新系统边界设计，证据见 `src/api/common/systemApi.ts:7-22`、`src/api/common/networkApi.ts:16-101`。

## 3. Feature domain map

| Domain | 用户入口或调用入口 | 旧系统事实摘要 | 代表证据 |
| --- | --- | --- | --- |
| UI shell / pages | 左侧导航、router | 本地工具式页面集合，路由覆盖连接、帧配置、发送、接收、存储、历史、SCOE | `src/router/routes.ts:3-54`, `src/components/layout/SidePanel.vue:32-47` |
| frame template / frame asset / frame editor | 帧列表页、帧编辑页、导入导出 | 帧定义是独立配置资产，提供列表、选择、新建/编辑、复制、删除、导入导出，并持久化到 framesConfig | `src/router/routes.ts:14-19`, `src/pages/frames/FrameList.vue:240-391`, `src/stores/frames/frameTemplateStore.ts:26-96` |
| connection / serial / network / targets | 连接页、app lifecycle、send target | 串口、TCP、TCP server、UDP remote host 汇聚为可用 target | `src/stores/serialStore.ts:134-193`, `src/stores/netWorkStore.ts:50-75`, `src/stores/connectionTargetsStore.ts:34-133` |
| receive pipeline | 串口/network/SCOE data event | 数据入队、SCOE 特判、receive IPC 解析、当前值/表达式/统计/触发 | `src/stores/frames/receiveFramesStore.ts:882-1205` |
| send pipeline | 手动发送、任务发送、SCOE 命令发送 | 统一发送器处理表达式、target parse、serial/network send、统计 | `src/composables/frames/sendFrame/useUnifiedSender.ts:69-167` |
| send task / timer / trigger | 发送任务、timer manager、receive trigger | task 状态机、定时、触发监听、暂停/恢复/停止 | `src/stores/frames/sendTasksStore.ts:15-122`, `src/composables/common/useTimerManager.ts:29-190` |
| SCOE | SCOE 页面、SCOE TCP server data、命令工具 | 固定 SCOE source、命令校验执行、状态循环、测试工具记录 | `src/stores/frames/receiveFramesStore.ts:911-1030`, `src/stores/scoeStore.ts:216-340` |
| storage / history / import-export / files | 存储页、历史页、配置导入导出 | JSON 配置、本地文件、历史批量记录、CSV 导出、高速存储 | `src-electron/main/ipc/dataStorageHandlers.ts:146-194`, `src-electron/main/ipc/historyDataHandlers.ts:101-143`, `src-electron/main/ipc/highSpeedStorageHandlers.ts:104-145` |
| settings / status indicators | 设置页、StatusIndicators 组件、receive 当前值 | 设置项持久化自动记录和 CSV 配置；状态指示灯按接收数据项当前值映射颜色并定时更新 | `src/pages/settings/Index.vue:31-185`, `src/stores/settingsStore.ts:8-22`, `src/stores/statusIndicators.ts:17-128` |
| Platform API / Electron boundary | renderer common API -> preload -> main IPC | 多平台能力集中暴露，部分 wrapper 有 fallback/noop，主进程注册 IPC handler | `src-electron/preload/api/index.ts:1-31`, `src-electron/main/ipc/index.ts:12-23`, `src/api/common/index.ts:6-34` |
| result/report/northbound gap | 甲方文档、对接清单 | 文档需要任务、控制、结果、报告、文件回传；当前代码未形成北向接入闭环 | `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/04-任务主链.md:14-22`, `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-结果、文件与报告回传.md:12-16` |

## 4. Per-domain inventory

### 4.1 UI shell / pages

- **功能名称**: 主壳、页面路由、左侧导航、全局文件弹窗、应用生命周期初始化。
- **用户入口或调用入口**: 左侧导航、router、MainLayout mount/unmount。
- **关键文件**: `src/router/routes.ts`、`src/components/layout/SidePanel.vue`、`src/layouts/MainLayout.vue`、`src/layouts/useAppLifecycle.ts`、`src/boot/taskManager.ts`。
- **运行行为 - Evidence**: 路由树配置首页、连接、帧列表/编辑、发送、接收、设置、存储、历史、SCOE，见 `src/router/routes.ts:3-54`。
- **运行行为 - Evidence**: 左侧导航项固定映射到 router path，点击后进入页面，见 `src/components/layout/SidePanel.vue:32-47`。
- **运行行为 - Evidence**: MainLayout 包含 `router-view` 和全局文件对话框，并在 setup 中调用 layout drawer、file dialog、app lifecycle composable，见 `src/layouts/MainLayout.vue:17-28`、`src/layouts/MainLayout.vue:40-47`。
- **运行行为 - Evidence**: App mount 会批量加载配置、刷新连接、初始化统计、初始化 SCOE、启动历史数据采集和自动记录，见 `src/layouts/useAppLifecycle.ts:45-68`。
- **隐性副作用 - Evidence**: App unmount 会停止记录、停止数据采集、清理统计、清空接收字段当前值并保存配置，见 `src/layouts/useAppLifecycle.ts:28-41`、`src/layouts/useAppLifecycle.ts:74-89`。
- **隐性副作用 - Evidence**: `beforeunload` 会尝试清理发送任务 timer、移除网络监听并断开网络连接；task timer 是否真正覆盖主进程字符串 timer ID 仍需单独确认，见 `src/boot/taskManager.ts:18-48`、`src/stores/frames/sendTasksStore.ts:112-117`。
- **数据读写 - Evidence**: lifecycle 触发 frame/send instance/receive config 的 load/save，不直接定义业务数据结构，见 `src/layouts/useAppLifecycle.ts:45-89`。
- **依赖硬件/运行环境 - Evidence**: UI 壳本身依赖 Electron/Quasar runtime；真实连接、接收、SCOE 页面功能依赖后续 domain 的硬件和 IPC。
- **现有验证方式 - Evidence**: `package.json` 的 test 脚本为无测试占位；本轮未发现该 domain 的自动化验收信号，见 `package.json:12`。
- **是否应作为 oracle**: 是，作为页面入口、初始化副作用和退出清理 checklist；不作为新 UI 视觉设计 oracle。
- **Candidate migration category**: `compatible`。可保留用户入口语义与初始化/清理行为，页面布局和交互组织可重新讨论。

### 4.2 frame template / frame asset / frame editor

- **功能名称**: 帧模板资产、帧列表、帧编辑、新建、更新、复制、删除、导入导出、framesConfig 持久化。
- **用户入口或调用入口**: `/frames/list`、`/frames/editor`、配置导航、FrameList 操作按钮、FrameEditor 保存。
- **关键文件**: `src/router/routes.ts`、`src/pages/frames/FrameList.vue`、`src/composables/frames/useFrameTemplates.ts`、`src/composables/frames/useFrameEditor.ts`、`src/stores/frames/frameTemplateStore.ts`、`src/stores/frames/receiveFramesStore.ts`、`src/config/configDefaults.ts`。
- **运行行为 - Evidence**: router 明确提供帧列表和帧编辑页，见 `src/router/routes.ts:14-19`。
- **运行行为 - Evidence**: FrameList 的新建和编辑会跳转到 `/frames/editor`，并通过 query 区分新建或指定 id，见 `src/pages/frames/FrameList.vue:240-246`。
- **运行行为 - Evidence**: FrameList 支持选择、编辑、复制、删除、收藏等 action，见 `src/pages/frames/FrameList.vue:248-270`。
- **运行行为 - Evidence**: 复制帧会调用 frame template composable，成功后提示“帧已复制”，见 `src/pages/frames/FrameList.vue:272-290`；composable 会复制原帧、移除 id、重命名为“副本”并创建新帧，见 `src/composables/frames/useFrameTemplates.ts:60-88`。
- **运行行为 - Evidence**: 删除帧会调用 template composable 并提示“帧已删除”，见 `src/pages/frames/FrameList.vue:292-310`。
- **运行行为 - Evidence**: 导出帧配置会把 `templateStore.frames` 通过 fileDialogManager 写到 data path 下的帧配置目录，见 `src/pages/frames/FrameList.vue:312-348`。
- **运行行为 - Evidence**: 导入帧配置要求导入数据为数组，随后调用 `dataStorageAPI.framesConfig.saveAll` 并重新加载帧列表，见 `src/pages/frames/FrameList.vue:350-391`。
- **运行行为 - Evidence**: frameTemplateStore 从 `dataStorageAPI.framesConfig.list` 加载帧，create/update 保存全量 frames，delete 按 id 删除并在删除当前选中帧时清空 selectedFrameId，见 `src/stores/frames/frameTemplateStore.ts:26-96`。
- **运行行为 - Evidence**: FrameEditor 保存时会校验、设置 timestamp；create 模式创建新帧，edit 模式更新旧帧，若 id 变化会删除 lastId，见 `src/composables/frames/useFrameEditor.ts:82-125`。
- **运行行为 - Evidence**: receive store watch `frameTemplateStore.frames`，帧模板变化时调用 `debouncedSyncCache` 同步主进程缓存，见 `src/stores/frames/receiveFramesStore.ts:257-264`。
- **数据读写 - Evidence**: `framesConfig` 的默认持久化路径为 `data/templates/framesConfig`，见 `src/config/configDefaults.ts:5-12`。
- **隐性副作用 - Evidence**: 帧模板资产变化会外溢到 receive 主进程配置缓存，不只是 UI 或本地文件变化，见 `src/stores/frames/receiveFramesStore.ts:257-264`。
- **隐性副作用 - Inference**: 帧模板资产是 receive 配置、send instance、SCOE frame/command 等能力的上游定义资产；如果迁移时只按 UI 或 receive 扫描，容易漏掉 frame asset 生命周期。
- **数据读写 - Evidence**: 读写 `framesConfig`，导入导出帧数组，维护 selectedFrameId、isLoading、error。
- **依赖硬件/运行环境 - Evidence**: 帧资产 CRUD 本身不依赖硬件；后续接收、发送、SCOE 执行依赖这些定义。
- **现有验证方式 - Evidence**: UI notify、列表刷新、持久化 reload 是运行态信号；未见自动化 frame asset CRUD 测试。
- **是否应作为 oracle**: 是。帧资产 CRUD、导入导出、id 变更删除 lastId、selected frame 清理应进入 fixture/checklist。
- **Candidate migration category**: `must preserve` 用于帧资产可观测生命周期和持久化结果；`compatible` 用于导入导出格式和目录；`can redesign` 用于编辑器内部状态和列表过滤 UI。

### 4.3 connection / serial / network / targets

- **功能名称**: 串口扫描/连接/断开、网络连接、连接 target 聚合、target 可用性校验。
- **用户入口或调用入口**: 连接页、app lifecycle `refreshPorts/refreshTargets`、统一发送器、接收 data event。
- **关键文件**: `src/stores/serialStore.ts`、`src/stores/netWorkStore.ts`、`src/stores/connectionTargetsStore.ts`、`src/composables/frames/sendFrame/useUnifiedSender.ts`、`src-electron/main/ipc/serialHandlers.ts`、`src-electron/main/ipc/networkHandlers.ts`、`src-electron/preload/api/network.ts`。
- **运行行为 - Evidence**: serial store 刷新串口列表和状态，连接时调用 serial API open、setup listeners 并更新连接状态，见 `src/stores/serialStore.ts:134-193`。
- **运行行为 - Evidence**: serial store disconnectAll 会关闭全部串口并清理监听/状态，见 `src/stores/serialStore.ts:249-275`。
- **运行行为 - Evidence**: serial data event 会缓存接收消息并调用 receive store，见 `src/stores/serialStore.ts:392-420`；sent event 会缓存发送消息，见 `src/stores/serialStore.ts:423-445`。
- **运行行为 - Evidence**: network store 提供 connect/disconnect/status 入口，见 `src/stores/netWorkStore.ts:50-75`。
- **运行行为 - Evidence**: network data 和 connectionEvent listener 更新 store，`network:data` 进入 receive store；statusChange listener 在 renderer/preload 存在，但当前静态扫描未发现 main 同名发射点，见 `src/stores/netWorkStore.ts:200-256`、`src-electron/preload/api/network.ts:115-123`、`src-electron/main/ipc/networkHandlers.ts:582-607`。
- **运行行为 - Evidence**: connection target store 从串口、TCP、TCP server、UDP remote hosts 汇聚可选 target；UDP remote host 只有 enabled 时才进入 target，见 `src/stores/connectionTargetsStore.ts:34-133`。
- **运行行为 - Evidence**: `getValidatedTargetPath` 把 serial path、TCP connectionId、UDP `connectionId:address` 解析为发送目标；`isTargetAvailable` 判断 target status connected，见 `src/stores/connectionTargetsStore.ts:172-235`。
- **隐性副作用 - Evidence**: 网络主进程接收数据时先更新统计和高速存储规则；规则命中会写入高速存储并返回，不再广播 renderer，因此该网络包不进入普通 receive/display/trigger/status-indicator 链，见 `src-electron/main/ipc/networkHandlers.ts:498-520`、`src/stores/netWorkStore.ts:207-213`。
- **隐性副作用 - Evidence**: network 主进程会向所有 webContents 广播 connection event 和 data，见 `src-electron/main/ipc/networkHandlers.ts:582-607`。
- **数据读写 - Evidence**: serial/network store 维护连接状态、消息缓存、目标列表；network main 对高频数据可能写高速存储文件，见 `src-electron/main/ipc/networkHandlers.ts:498-520`。
- **依赖硬件/运行环境 - Evidence**: 串口依赖 OS 串口和 `serialport`；网络依赖 TCP/UDP endpoint；Electron 主进程负责实际连接能力。
- **现有验证方式 - Evidence**: 连接状态可通过 UI、store 状态、main IPC 返回值观察；没有发现独立自动化测试。
- **是否应作为 oracle**: 是。target 列表、可用性、发送 target path、断开副作用适合作为迁移 oracle。
- **Candidate migration category**: `must preserve` 用于外部可观测连接语义；`compatible` 用于 target ID 格式；`can redesign` 用于内部 store/index/cache 组织。

### 4.4 receive pipeline

- **功能名称**: 接收配置、数据入口、SCOE 特判、帧匹配、字段解析、当前值、表达式、统计、trigger 检查。
- **用户入口或调用入口**: serial/network data event、SCOE TCP server source、接收配置页面、app lifecycle。
- **关键文件**: `src/stores/frames/receiveFramesStore.ts`、`src-electron/main/ipc/receiveHandlers.ts`、`src-electron/main/ipc/receiveConfigCache.ts`、`src/utils/receive/dataProcessor.ts`、`src/utils/receive/frameMatchers.ts`、`src/composables/frames/useFrameExpressionManager.ts`。
- **运行行为 - Evidence**: receive store 维护 processing lock 和 pending queue，`handleReceivedData` 串行化并发数据处理，见 `src/stores/frames/receiveFramesStore.ts:805-904`。
- **运行行为 - Evidence**: `processDataInternal` 先记录 inbound 包统计，再尝试 SCOE 处理，未命中后调用 receive IPC 解析，最后进入失败或成功处理，见 `src/stores/frames/receiveFramesStore.ts:1186-1205`。
- **运行行为 - Evidence**: 只有 sourceId 为 `scoe-tcp-server` 的数据会进入 SCOE TCP server path，见 `src/stores/frames/receiveFramesStore.ts:1021-1030`。
- **运行行为 - Evidence**: receive IPC 从缓存读取配置并匹配数据到帧，无法匹配或处理失败时返回失败结果，见 `src-electron/main/ipc/receiveHandlers.ts:54-105`。
- **运行行为 - Evidence**: receive 成功会更新 frame data cache、当前组数据项、表达式、星座图数据、frameStats，并触发发送任务条件检查，见 `src/stores/frames/receiveFramesStore.ts:1060-1181`。
- **运行行为 - Evidence**: trigger 检查把更新字段转换为 DataItem 形式并调用 sendTasksStore `handleFrameReceived`，见 `src/stores/frames/receiveFramesStore.ts:1252-1293`。
- **运行行为 - Evidence**: 表达式字段在当前值回填时被跳过，由表达式 manager 计算，见 `src/stores/frames/receiveFramesStore.ts:1089-1118`、`src/composables/frames/useFrameExpressionManager.ts:332-507`。
- **隐性副作用 - Evidence**: unmatched、parse error、success 都会更新统计和 recent packet，见 `src/stores/frames/receiveFramesStore.ts:1040-1068`。
- **隐性副作用 - Evidence**: 接收配置存在主进程 cache，同步/更新 handler 会维护缓存，见 `src-electron/main/ipc/receiveConfigCache.ts:22-31`、`src-electron/main/ipc/receiveConfigCache.ts:43-76`、`src-electron/main/ipc/receiveHandlers.ts:184-246`。
- **数据读写 - Evidence**: 读取 receive config cache，写 store 当前值、frame data cache、统计、星座图数据，可能通过 trigger 影响发送任务。
- **依赖硬件/运行环境 - Evidence**: 依赖 serial/network/SCOE data event；真实解析正确性依赖实际字节流、帧配置和表达式。
- **现有验证方式 - Evidence**: 代码内有统计、recent packet、parse error 作为运行态信号；本轮未发现自动化解析 fixture 测试。
- **是否应作为 oracle**: 是，优先级最高。bytes -> match -> field -> expression -> display/stat/trigger 是旧系统核心行为链。
- **Candidate migration category**: `must preserve` 用于匹配/解析/当前值/统计的可观测结果；`compatible` 用于触发链和表达式语义；`can redesign` 用于内部缓存、队列实现。

### 4.5 send pipeline / unified sender

- **功能名称**: 手工发送、发送实例执行、统一 target 发送、发送结果、发送统计。
- **用户入口或调用入口**: 发送页面、发送任务 executor、SCOE 命令、统一发送器。
- **关键文件**: `src/composables/frames/sendFrame/useUnifiedSender.ts`、`src/composables/frames/sendFrame/useSendTaskExecutor.ts`、`src/stores/connectionTargetsStore.ts`、`src/stores/serialStore.ts`、`src/stores/netWorkStore.ts`。
- **运行行为 - Evidence**: UnifiedSendResult 统一返回 success、bytesSent、timestamp、error、data、targetInfo，见 `src/composables/frames/sendFrame/useUnifiedSender.ts:16-24`。
- **运行行为 - Evidence**: target id 只支持 `serial` 和 `network` 两大类型，见 `src/composables/frames/sendFrame/useUnifiedSender.ts:31-50`。
- **运行行为 - Evidence**: 发送 frame instance 前会应用发送表达式和因子、构造 buffer、解析 target，见 `src/composables/frames/sendFrame/useUnifiedSender.ts:69-102`。
- **运行行为 - Evidence**: serial/network 分支根据 target 类型分别路由；UDP remote host 使用 `connectionId:remoteAddress` target path，见 `src/composables/frames/sendFrame/useUnifiedSender.ts:105-136`。
- **运行行为 - Evidence**: serial 发送调用 serialAPI `sendData`，network 发送调用 networkAPI `send`，见 `src/composables/frames/sendFrame/useUnifiedSender.ts:187-260`。
- **运行行为 - Evidence**: 成功后异步更新发送统计和全局统计；`network:scoe-udp:scoe-udp-remote` 会额外写入 SCOE store 发送数据记录，见 `src/composables/frames/sendFrame/useUnifiedSender.ts:146-167`。
- **隐性副作用 - Evidence**: 发送实例内字段可能因表达式/因子计算被更新为实际发送值，见 `src/composables/frames/sendFrame/useUnifiedSender.ts:69-102`。
- **隐性副作用 - Evidence**: target 不可用可导致发送失败并影响任务状态，见 `src/composables/frames/sendFrame/useUnifiedSender.ts:267-270`、`src/composables/frames/sendFrame/useSendTaskExecutor.ts:222-247`。
- **数据读写 - Evidence**: 读取 frame instance、target、连接状态；写统计、发送消息缓存、SCOE 记录。
- **依赖硬件/运行环境 - Evidence**: 串口、TCP、UDP endpoint；Electron preload/main 提供实际发送能力。
- **现有验证方式 - Evidence**: 发送返回结果、统计、消息记录是主要运行态验证信号；未见自动化发送 fixture。
- **是否应作为 oracle**: 是。target 路由、返回结果、统计副作用适合作为 rewrite oracle。
- **Candidate migration category**: `must preserve` 用于外部发送成功/失败语义；`compatible` 用于 target id/path 格式；`can redesign` 用于内部发送器组织。

### 4.6 send task / timer / trigger

- **功能名称**: 发送任务、周期任务、触发任务、任务状态、pause/resume/stop/completed、timer manager。
- **用户入口或调用入口**: 发送页面任务操作、receive trigger、Electron timer IPC。
- **关键文件**: `src/stores/frames/sendTasksStore.ts`、`src/composables/frames/sendFrame/useSendTaskController.ts`、`src/composables/frames/sendFrame/useSendTaskExecutor.ts`、`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts`、`src/composables/common/useTimerManager.ts`、`src-electron/main/ipc/timerManagerHandlers.ts`。
- **运行行为 - Evidence**: task 类型包括 single、sequence、loop、timed、scheduled、triggered；状态包括 idle、running、paused、completed、error、waiting-trigger、waiting-schedule，见 `src/stores/frames/sendTasksStore.ts:15-30`。
- **运行行为 - Evidence**: trigger task config 包含 sourceId、triggerFrameId、conditions、responseDelay、continueListening 和 recurring 时间配置，见 `src/stores/frames/sendTasksStore.ts:91-104`。
- **运行行为 - Evidence**: activeTasks 包括 running、paused、waiting-trigger、waiting-schedule，见 `src/stores/frames/sendTasksStore.ts:160-184`。
- **运行行为 - Evidence**: updateTaskStatus 对 completed/error/paused 强制同步 cache；completed 会调用 removeTask，见 `src/stores/frames/sendTasksStore.ts:401-434`。
- **运行行为 - Evidence**: stopTask 对 running/paused/waiting-trigger 任务清理 timer/listener 后将状态更新为 completed，见 `src/composables/frames/sendFrame/useSendTaskController.ts:26-65`。
- **运行行为 - Evidence**: pauseTask 和 resumeTask 主要更新状态；resume 明确提示实际 timer 恢复需要任务特定逻辑，见 `src/composables/frames/sendFrame/useSendTaskController.ts:70-117`。
- **运行行为 - Evidence**: trigger listener 遍历 active listeners，匹配 frameId/sourceId，仅处理 waiting-trigger 状态并评估 conditions，见 `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:70-158`。
- **运行行为 - Evidence**: trigger 执行支持 responseDelay；如果 `continueListening` 为 false，执行后 unregister 并设置 completed，见 `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:223-305`。
- **运行行为 - Evidence**: timer composable 注册 timeout/interval/delayed timer，支持 pause/resume/unregister/cleanup，见 `src/composables/common/useTimerManager.ts:29-190`、`src/composables/common/useTimerManager.ts:226-252`。
- **运行行为 - Evidence**: main timer manager 支持自校准 interval，pause 会停止 timer，resume 只支持 interval，tick 通过 BrowserWindow 第一个窗口发事件，见 `src-electron/main/ipc/timerManagerHandlers.ts:48-190`。
- **隐性副作用 - Evidence**: `beforeunload` 会尝试对 task.timers 调用 `clearTimeout/clearInterval` 并清理网络连接，见 `src/boot/taskManager.ts:28-42`；但 task.timers 注释为主进程字符串 ID，主进程 timer 是否被该路径真正清理仍需单独确认，见 `src/stores/frames/sendTasksStore.ts:112-117`。
- **隐性副作用 - Evidence**: target unavailable 时 executor 会把 task 置为 paused，并记录“连接已断开”类错误，见 `src/composables/frames/sendFrame/useSendTaskExecutor.ts:222-247`。
- **数据读写 - Evidence**: task store 维护 memory map、cache 同步、status index；timer 注册跨 renderer/main。
- **依赖硬件/运行环境 - Evidence**: 发送任务依赖连接 target、Electron timer IPC、receive trigger 数据源。
- **现有验证方式 - Evidence**: task status、progress、errorInfo、send result、timer tick 是运行态信号；未见自动化 task/timer 测试。
- **是否应作为 oracle**: 是，但以 checklist 和运行态 fixture 为主。不能把旧系统 task 语义直接等同于北向测试任务语义。
- **Candidate migration category**: `compatible` 用于用户可见 task 行为；`must preserve` 用于 trigger 条件可观测结果；`can redesign` 用于 timer 实现；`unknown` 用于 pause/resume 的真实定时恢复语义。

### 4.7 SCOE

- **功能名称**: SCOE 配置、TCP/UDP 连接、固定 source/target、命令处理、状态定时器、测试工具记录。
- **用户入口或调用入口**: SCOE 页面、SCOE TCP server receive、SCOE 命令 executor、SCOE test tool。
- **关键文件**: `src/stores/scoeStore.ts`、`src/stores/frames/receiveFramesStore.ts`、`src/utils/receive/scoeFrame.ts`、`src/composables/scoe/useScoeCommandExecutor.ts`、`src/composables/scoe/commands/readFileAndSend.ts`、`src/composables/scoe/commands/sendFrame.ts`、`src/composables/scoe/useScoeTestTool.ts`、`src/components/scoe/*`。
- **运行行为 - Evidence**: receive store 初始化 SCOE 后会检查 frame、统计接收/错误、校验 checksum、执行命令并记录 receive data，见 `src/stores/frames/receiveFramesStore.ts:911-1004`。
- **运行行为 - Evidence**: SCOE TCP server data 只有 sourceId `scoe-tcp-server` 才进入 SCOE 分支，见 `src/stores/frames/receiveFramesStore.ts:1021-1030`。
- **运行行为 - Evidence**: scoeStore 根据配置和帧加载状态管理 TCP/UDP 连接生命周期，见 `src/stores/scoeStore.ts:216-273`。
- **运行行为 - Evidence**: SCOE status timer 每秒更新状态，并触发状态/发送检查循环；未加载时会清空 counters/status，见 `src/stores/scoeStore.ts:293-340`。
- **运行行为 - Evidence**: SCOE frame 校验在未加载时允许特定加载命令进入，否则执行完整结构、ID、field、checksum 验证，见 `src/utils/receive/scoeFrame.ts:167-290`。
- **运行行为 - Evidence**: SCOE command executor 通过 command map dispatch，命令成功会更新 lastCommandCode、lastCommandSuccessTime，并等待完成条件，见 `src/composables/scoe/useScoeCommandExecutor.ts:77-187`。
- **运行行为 - Evidence**: readFileAndSend 命令包含目录/文件参数解析、文件读取和循环发送行为，见 `src/composables/scoe/commands/readFileAndSend.ts:44-149`。
- **运行行为 - Evidence**: SCOE test tool 记录测试工具数据，见 `src/composables/scoe/useScoeTestTool.ts:144-178`。
- **隐性副作用 - Evidence**: SCOE 接收会绕过普通 receive IPC 的解析链，直接在 receive store 内早返回，见 `src/stores/frames/receiveFramesStore.ts:1186-1205`。
- **隐性副作用 - Evidence**: 特定 SCOE UDP target 的发送成功会写入 SCOE store 发送数据记录，见 `src/composables/frames/sendFrame/useUnifiedSender.ts:146-167`。
- **数据读写 - Evidence**: 读取 SCOE 配置、帧加载状态、命令参数；写状态、统计、命令状态、测试工具记录、发送/接收记录。
- **依赖硬件/运行环境 - Evidence**: 依赖 SCOE TCP server、UDP remote host、固定 source/target 命名、真实 SCOE 协议字节流。
- **现有验证方式 - Evidence**: 状态面板、命令执行结果、测试工具记录、接收/发送统计是主要运行态信号；未见自动化 SCOE 协议 fixture 测试。
- **是否应作为 oracle**: 是。SCOE 是专项协议能力，固定 source/target 和命令处理应提取 fixture 与手工 checklist。
- **Candidate migration category**: `must preserve` 用于外部协议和用户可见命令结果；`compatible` 用于状态循环和测试工具记录；`can redesign` 用于 store 内部组织；`unknown` 用于未连接设备的时序边界。

### 4.8 storage / history / import-export / files

- **功能名称**: 本地 JSON 配置、文件列表/读写/删除、导入导出、历史数据记录、CSV 导出、高速存储、数据保留。
- **用户入口或调用入口**: 存储页、历史页、通用 FileListDialog、ImportExportActions、app lifecycle recording。
- **关键文件**: `src/api/common/filesApi.ts`、`src-electron/preload/api/files.ts`、`src-electron/preload/api/path.ts`、`src-electron/main/ipc/fileMetadataHandlers.ts`、`src-electron/main/ipc/dataStorageHandlers.ts`、`src/config/configDefaults.ts`、`src/stores/frames/dataDisplayStore.ts`、`src-electron/main/ipc/historyDataHandlers.ts`、`src-electron/main/ipc/highSpeedStorageHandlers.ts`、`src/components/storage/*`、`src/stores/historyAnalysis.ts`。
- **运行行为 - Evidence**: files API 提供 list/get full path/ensure dir/save JSON/load JSON/delete/read text wrapper，见 `src/api/common/filesApi.ts:9-81`。
- **运行行为 - Evidence**: preload path API 把 data path 定位为 rootPath 下的 `public`，rootPath 在 packaged 和 dev 下不同，见 `src-electron/preload/api/path.ts:3-15`。
- **运行行为 - Evidence**: file metadata handler 只列 `.json` 文件，支持 ensure directory、save/load JSON、delete、read text，并注册 IPC handler，见 `src-electron/main/ipc/fileMetadataHandlers.ts:8-124`。
- **运行行为 - Evidence**: data storage manager load 失败时返回空数组，add/update 按 id 覆盖，delete 按 id 删除，默认 validator 要求数组，见 `src-electron/main/ipc/dataStorageHandlers.ts:50-143`。
- **运行行为 - Evidence**: DATA_PATH_MAP 对每类数据注册 list/save/delete/saveAll/export/import handler，见 `src-electron/main/ipc/dataStorageHandlers.ts:146-194`、`src/config/configDefaults.ts:5-12`。
- **运行行为 - Evidence**: dataDisplayStore 在 recording 状态下按小时 metadata 收集当前数据，小时切换时异步 flush 上一批，见 `src/stores/frames/dataDisplayStore.ts:359-523`。
- **运行行为 - Evidence**: start/stop recording 会设置保存 interval，停止时 flush 当前批次并清理 timer，见 `src/stores/frames/dataDisplayStore.ts:701-730`。
- **运行行为 - Evidence**: history handler 按日期/小时文件组织历史数据，支持 append batch、按文件/时间加载、CSV 导出和 cleanup old data，默认 CSV export directory 为 `getDataPath()/exports/csv`，见 `src-electron/main/ipc/historyDataHandlers.ts:33-77`、`src-electron/main/ipc/historyDataHandlers.ts:101-176`、`src-electron/main/ipc/historyDataHandlers.ts:304-466`、`src-electron/main/ipc/historyDataHandlers.ts:513-553`。
- **运行行为 - Evidence**: highSpeedStorage 支持规则判断、原始数据写业务 txt、文件统计、轮转删除旧文件和规则校验，见 `src-electron/main/ipc/highSpeedStorageHandlers.ts:104-145`、`src-electron/main/ipc/highSpeedStorageHandlers.ts:181-237`、`src-electron/main/ipc/highSpeedStorageHandlers.ts:248-267`、`src-electron/main/ipc/highSpeedStorageHandlers.ts:394-428`。
- **隐性副作用 - Evidence**: history 批量保存成功后会清空 memory batch，见 `src/stores/frames/dataDisplayStore.ts:945-997`。
- **隐性副作用 - Evidence**: 高速存储规则命中会影响 network:data 是否上送 renderer，见 `src-electron/main/ipc/networkHandlers.ts:498-520`。
- **隐性副作用 - Evidence**: CSV UI 在未设置默认路径时展示 `data/exports/csv`，主进程默认目录实际来自 `getDataPath()/exports/csv`；该显示/实际路径差异不适合作为精确 oracle，见 `src/components/storage/CSVExportDialog.vue:236-243`、`src-electron/main/ipc/historyDataHandlers.ts:61-65`。
- **数据读写 - Evidence**: 本地 JSON、history data/history-statistics、CSV export、高速存储 txt、配置导入导出；删除文件存在不可逆 UI 提示，见 `src/components/common/FileListDialog.vue:260-304`。
- **依赖硬件/运行环境 - Evidence**: 文件系统、Electron 主进程、可写 data path；高速存储依赖高频网络数据。
- **现有验证方式 - Evidence**: UI 列表、导入导出结果、history load/export、storage stats 是运行态验证信号；`totalRecords` 存储统计存在简化实现，见 `src-electron/main/ipc/historyDataHandlers.ts:241-290`。
- **是否应作为 oracle**: 是。文件路径策略、导入导出、历史记录、CSV、高速存储命中行为应进入 oracle；存储内部实现不必照搬。
- **Candidate migration category**: `must preserve` 用于用户数据保留和导入导出可观测行为；`compatible` 用于 CSV/history 查询；`can redesign` 用于存储布局和 batch 机制；`unknown` 用于 packaged 可写路径和长期保留策略。

### 4.9 settings / status indicators

- **功能名称**: 系统设置、自动开始记录、历史数据保存间隔、CSV 默认导出路径、状态指示灯配置、设置重置、设置导入导出占位。
- **用户入口或调用入口**: `/settings` 页面、settingsStore、dataDisplayStore、CSV export dialog、status indicator store 和组件。
- **关键文件**: `src/pages/settings/Index.vue`、`src/stores/settingsStore.ts`、`src/layouts/useAppLifecycle.ts`、`src/stores/frames/dataDisplayStore.ts`、`src/components/storage/CSVExportDialog.vue`、`src/stores/statusIndicators.ts`、`src/components/common/StatusIndicators.vue`、`src/components/common/StatusIndicatorConfigDialog.vue`。
- **运行行为 - Evidence**: 设置页提供自动开始记录开关、历史数据保存间隔输入、CSV 默认导出路径、选择文件夹按钮、状态指示灯启用开关和配置按钮，见 `src/pages/settings/Index.vue:31-150`。
- **运行行为 - Evidence**: 设置页提供重置所有设置、导出设置、导入设置按钮，见 `src/pages/settings/Index.vue:164-185`。
- **运行行为 - Evidence**: settingsStore 通过 `useStorage` 持久化 `autoStartRecording`、`csvDefaultOutputPath`、`csvSaveInterval`，默认值分别为 true、空字符串、5，见 `src/stores/settingsStore.ts:8-22`。
- **运行行为 - Evidence**: App lifecycle 会根据 `settingsStore.autoStartRecording` 在启动时自动开始记录，见 `src/layouts/useAppLifecycle.ts:61-68`。
- **运行行为 - Evidence**: dataDisplayStore 将 `settingsStore.csvSaveInterval` 转为毫秒作为 CSV/history 保存间隔，见 `src/stores/frames/dataDisplayStore.ts:149-157`。
- **运行行为 - Evidence**: CSV export dialog 在启用预设路径且 `csvDefaultOutputPath` 非空时把它作为 `outputDirectory`，见 `src/components/storage/CSVExportDialog.vue:128-142`。
- **运行行为 - Evidence**: 选择输出目录当前只提示“文件夹选择功能待实现”；导出设置和导入设置也只提示待实现，见 `src/pages/settings/Index.vue:213-259`。
- **运行行为 - Evidence**: 重置所有设置只把 autoStartRecording、csvDefaultOutputPath、csvSaveInterval 重置为默认值，见 `src/pages/settings/Index.vue:223-240`。
- **运行行为 - Evidence**: 状态指示灯配置持久化到 `statusIndicatorSettings`，默认 enabled 且 indicators 为空，见 `src/stores/statusIndicators.ts:17-20`。
- **运行行为 - Evidence**: activeIndicators 在启用时按每个 indicator 的 receive groupId/dataItemId 读取当前值，并按 valueMappings 映射 currentColor，见 `src/stores/statusIndicators.ts:30-88`。
- **运行行为 - Evidence**: statusIndicators 每秒检查相关 receive data item 当前值是否变化；变化时访问 activeIndicators 触发响应式更新，见 `src/stores/statusIndicators.ts:90-128`。
- **运行行为 - Evidence**: statusIndicators 支持 add/update/remove indicator、列出可用 receive data items、toggle enabled，并在 store 初始化时自动启动更新 timer，见 `src/stores/statusIndicators.ts:138-239`。
- **隐性副作用 - Evidence**: 状态指示灯是 receive display 的隐性消费面，不改变 receive 数据但依赖 receiveFramesStore 当前值和 displayValue，见 `src/stores/statusIndicators.ts:69-88`、`src/stores/statusIndicators.ts:180-208`。
- **隐性副作用 - Evidence**: 设置页“重置所有设置”不会从证据中看到 status indicator 配置被重置，只重置 settingsStore 三个字段，见 `src/pages/settings/Index.vue:223-240`。
- **Unknown**: statusIndicators 暴露 cleanup，但 app unmount 路径未见调用；timer 生命周期是否在实际页面/应用销毁时完整释放需运行态或进一步专项验证，见 `src/stores/statusIndicators.ts:118-138`、`src/stores/statusIndicators.ts:216-239`、`src/layouts/useAppLifecycle.ts:74-89`。
- **数据读写 - Evidence**: local storage 持久化 settings 和 status indicator settings；CSV export 使用默认路径；自动记录影响 history/dataDisplay 采集。
- **依赖硬件/运行环境 - Evidence**: 设置页本身不依赖硬件；状态指示灯依赖 receive 当前值持续更新；CSV 默认路径依赖文件系统和 Electron history export。
- **现有验证方式 - Evidence**: 设置页 UI 值、local storage、启动自动记录、CSV 导出路径、状态指示灯颜色变化是运行态信号；导出/导入设置和选择目录明确是待实现提示。
- **是否应作为 oracle**: 是。自动记录、CSV 间隔、CSV 默认路径行为及显示/实际目录差异、状态指示灯颜色映射和每秒更新应进入 checklist；待实现按钮应进入迁移范围判断。
- **Candidate migration category**: `must preserve` 用于自动记录、CSV 间隔和状态指示灯可观测行为；`compatible` 用于 local storage 默认值；`candidate to drop` 或 `can redesign` 用于待实现按钮和配置 UI；`unknown` 用于用户是否实际依赖设置导入导出。

### 4.10 Platform API / Electron boundary

- **功能名称**: main IPC、preload API、renderer common API、fallback/noop、事件订阅、权限面。
- **用户入口或调用入口**: renderer 调用 `src/api/common`，经 `window.electron` 进入 preload/main。
- **关键文件**: `src-electron/main/index.ts`、`src-electron/main/window.ts`、`src-electron/preload/index.ts`、`src-electron/preload/api/index.ts`、`src-electron/main/ipc/index.ts`、`src/api/common/index.ts`、`src/api/common/systemApi.ts`、`src/api/common/serialApi.ts`、`src/api/common/networkApi.ts`、`src/api/common/filesApi.ts`、`src-electron/preload/api/network.ts`。
- **运行行为 - Evidence**: app ready 后 createWindow 并 setupIPC；window-all-closed 时 cleanupTimers 并退出，见 `src-electron/main/index.ts:18-58`。
- **运行行为 - Evidence**: BrowserWindow 关闭 nodeIntegration、开启 contextIsolation、关闭 frame、sandbox 为 false，见 `src-electron/main/window.ts:10-40`。
- **运行行为 - Evidence**: dev 下 loadURL，prod 下优先 loadFile，失败 fallback loadURL，见 `src-electron/main/window.ts:45-79`。
- **运行行为 - Evidence**: ready-to-show 时设置工作区 bounds、show/focus，并有 10 秒强制 show 兜底，见 `src-electron/main/window.ts:109-137`。
- **运行行为 - Evidence**: preload 在 context isolated 时暴露 `window.electron`，见 `src-electron/preload/index.ts:1-11`。
- **运行行为 - Evidence**: preload 聚合暴露 window/menu/autoLaunch/serial/network/files/dataStorage/path/receive/highSpeedStorage/historyData/timerManager，见 `src-electron/preload/api/index.ts:1-31`。
- **运行行为 - Evidence**: main IPC 统一注册 window/menu/storage/serial/network/files/receive/highSpeedStorage/historyData/timerManager handler，见 `src-electron/main/ipc/index.ts:12-23`。
- **运行行为 - Evidence**: renderer common API 聚合 system/files/serial/network/path/receive/dataStorage/highSpeedStorage/historyData/timerManager，见 `src/api/common/index.ts:6-34`。
- **运行行为 - Evidence**: system/serial/network/files wrappers 在 `window.electron` 不存在时返回 fallback 或 noop，见 `src/api/common/systemApi.ts:7-22`、`src/api/common/serialApi.ts:12-143`、`src/api/common/networkApi.ts:16-101`、`src/api/common/filesApi.ts:9-81`。
- **运行行为 - Evidence**: network preload API 暴露 onData/onConnectionEvent/onStatusChange 并返回 cleanup，见 `src-electron/preload/api/network.ts:71-123`。
- **运行行为 - Evidence**: serial preload 暴露 `onAllStatusChange` 监听 `serial:all-status`，主进程静态扫描可见 `serial:status` 广播和 `serial:all-status` invoke handler，见 `src-electron/preload/api/serial.ts:192-203`、`src-electron/main/ipc/serialHandlers.ts:567-620`。
- **Unknown**: 当前静态扫描未见 `serial:all-status` 事件广播；该订阅是否为历史兼容、遗漏发射点或可删除契约，需要后续专项确认，见 `src-electron/preload/api/serial.ts:192-203`、`src-electron/main/ipc/serialHandlers.ts:567-620`。
- **隐性副作用 - Evidence**: 平台能力面较宽，renderer 可经 common wrapper 触达串口、网络、文件、历史、高速存储、timer 等主进程能力，见 `src-electron/preload/api/index.ts:1-31`、`src-electron/main/ipc/index.ts:12-23`。
- **隐性副作用 - Evidence**: 既有边界分析也指出 main/preload/common 分层存在例外、fallback 不一致和权限面偏宽，见 `codestable/compound/2026-04-24-platform-api-boundary-code-reality-check.md:54-60`、`codestable/compound/2026-04-24-platform-api-boundary-code-reality-check.md:235-260`。
- **数据读写 - Evidence**: 平台层自身不定义业务 schema，但承载全部文件、网络、串口、history、高速存储读写。
- **依赖硬件/运行环境 - Evidence**: Electron、OS 文件系统、串口权限、网络栈、BrowserWindow 和 IPC。
- **现有验证方式 - Evidence**: 主要靠运行态 API 返回值、事件 listener cleanup、窗口可见性和已有边界分析文档；未见自动化 IPC 契约测试。
- **是否应作为 oracle**: 部分是。API 可见行为和 fallback 应记录为兼容/风险 oracle；权限和边界组织不应直接继承。
- **Candidate migration category**: `compatible` 用于调用结果和事件订阅语义；`can redesign` 用于边界分层；`candidate to drop` 用于无主进程 handler 支撑或未使用 fallback；`unknown` 用于 packaged 权限表现。

### 4.11 result / report / northbound gap map, not legacy behavior

- **功能名称**: 中心任务接入、任务控制、结果回传、文件/报告回传、心跳/状态查询。
- **用户入口或调用入口**: 现有代码中未形成用户可见北向入口；本节是外部要求缺口图谱，不是旧系统已实现行为清单，主要来自甲方接口文档和对接清单。
- **关键文件**: `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/04-任务主链.md`、`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-结果、文件与报告回传.md`、`后面对接所需功能清单.md`、`项目现状认知草稿.md`、`二级子系统功能总览-待确认.md`、`refactor/docs/03-architecture/09-中心协同接入与对外交付边界.md`。
- **运行行为 - Evidence**: 甲方任务主链文档描述 task enter、start、pause/continue/stop/abort、file get request，见 `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/04-任务主链.md:14-22`。
- **运行行为 - Evidence**: 甲方文档包含 setTestTask、startTestCaseList、controlTestTask、ccSysGetFileRequest 等外部动作，见 `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/04-任务主链.md:48-126`。
- **运行行为 - Evidence**: 结果/文件/报告回传被定义为任务交付出口，不是任务入口，见 `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-结果、文件与报告回传.md:12-16`。
- **运行行为 - Evidence**: 文档列出测试数据文件上传完成、文件上传完成、单测试项结果上报、报告文件回传等能力，见 `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-结果、文件与报告回传.md:44-107`。
- **运行行为 - Evidence**: 对接清单认为当前主线是中心任务 -> 用例/参数 -> 执行 -> 停止 -> 用例结果 -> 任务 JSON 报告，见 `后面对接所需功能清单.md:109-115`。
- **运行行为 - Evidence**: 对接清单列出心跳、状态查询、测试项结果上报、任务结果摘要与 JSON 报告、报告交付、异常规范化等后续能力，见 `后面对接所需功能清单.md:213-348`、`后面对接所需功能清单.md:352-488`。
- **运行行为 - Evidence**: 项目现状草稿明确当前代码更接近上位机工具，外部更关心 action/result/status，而内部解析很复杂，见 `项目现状认知草稿.md:43-62`、`项目现状认知草稿.md:91-99`。
- **运行行为 - Evidence**: 既有架构文档把 northbound boundary 定位为接收中心请求、投影内部事实、处理外部响应/交付；本文只引用该现有判断，不在本轮新增设计，见 `refactor/docs/03-architecture/09-中心协同接入与对外交付边界.md:45-57`、`refactor/docs/03-architecture/09-中心协同接入与对外交付边界.md:208-260`。
- **Unknown**: 本轮在已读 `src` / `src-electron` 入口中未确认到 setTestTask/start/control/result/report/FTP/HTTP 接入闭环实现。
- **隐性副作用 - Inference**: 现有 send task、history、CSV、SCOE 记录可提供部分“结果-like”材料，但它们不是甲方文档定义的北向任务/报告交付闭环。
- **数据读写 - Evidence**: 旧代码已有本地 history/CSV/JSON/report-like 文件能力；文档要求的北向结果/报告交付需要外部协议和任务上下文，见 `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-结果、文件与报告回传.md:144-189`。
- **依赖硬件/运行环境 - Unknown**: 中心系统协议、HTTP/FTP endpoint、任务上下文、结果字段口径未在代码中确认。
- **现有验证方式 - Unknown**: 本轮未发现北向接口自动测试或可运行 mock。
- **是否应作为 oracle**: 当前代码不能作为完整北向 oracle；只能把本地可观测事实映射为后续 northbound 讨论输入。
- **Candidate migration category**: `must preserve` 用于旧系统已有本地执行事实；`unknown` 用于北向协议闭环；`can redesign` 用于如何组织 northbound boundary；`candidate to drop` 仅限与中心交付无关且用户确认废弃的旧占位行为。

## 5. Cross-domain behavior chains

### 5.1 frame asset -> receive/send/SCOE consumers

- **Evidence**: frame asset 有独立列表/编辑入口和 CRUD/导入导出行为，见 `src/router/routes.ts:14-19`、`src/pages/frames/FrameList.vue:240-391`。
- **Evidence**: frameTemplateStore 通过 `framesConfig` 加载、创建、更新、删除帧定义，见 `src/stores/frames/frameTemplateStore.ts:26-96`；默认持久化路径见 `src/config/configDefaults.ts:5-12`。
- **Evidence**: FrameEditor 保存 create/update，并在 id 变化时删除 lastId，见 `src/composables/frames/useFrameEditor.ts:82-125`。
- **Evidence**: receive store 监听 frameTemplateStore.frames 并在变化时同步主进程缓存，见 `src/stores/frames/receiveFramesStore.ts:257-264`。
- **Inference**: receive 解析、send instance、trigger 和 SCOE 命令都依赖帧定义的稳定 id/字段定义；frame asset 应作为上游资产 oracle 单独盘清，而不是并入 UI。
- **Oracle candidate**: 用 frame asset fixture 验证 create/update/delete/duplicate/import/export 后，receive/send/SCOE 引用是否仍能定位预期 frameId/fieldId。

### 5.2 receive -> parse -> display

- **Evidence**: serial data event 进入 receive store，见 `src/stores/serialStore.ts:392-420`；network data event 进入 receive store，见 `src/stores/netWorkStore.ts:200-256`。
- **Evidence**: 但 network 数据如果命中高速存储规则，会在 main 进程存储后 return，不会广播 `network:data`，因此不进入普通 receive/display/trigger/status-indicator 链，见 `src-electron/main/ipc/networkHandlers.ts:505-520`、`src/stores/netWorkStore.ts:207-213`。
- **Evidence**: receive store 将数据串行化后调用 `processDataInternal`，先统计 inbound，再尝试 SCOE，再调用 receive IPC 解析，见 `src/stores/frames/receiveFramesStore.ts:882-904`、`src/stores/frames/receiveFramesStore.ts:1186-1205`。
- **Evidence**: receive IPC 完成匹配和字段处理，失败返回 unmatched/process error，成功返回 updated groups/items，见 `src-electron/main/ipc/receiveHandlers.ts:54-111`。
- **Evidence**: 成功后更新 frame data cache、当前值、表达式、星座图、统计和 recent packet，见 `src/stores/frames/receiveFramesStore.ts:1060-1181`、`src/stores/frames/receiveFramesStore.ts:1215-1247`。
- **Evidence**: 状态指示灯从 receiveFramesStore 的 group/dataItem 当前值映射颜色，并每秒检查数据变化，见 `src/stores/statusIndicators.ts:69-128`。
- **Oracle candidate**: 用 bytes fixture、帧配置、预期当前值/表达式/统计/状态指示灯颜色构造回归 oracle。

### 5.3 receive -> trigger -> send task

- **Evidence**: receive 成功后把 updated items 转换为 trigger check 输入，见 `src/stores/frames/receiveFramesStore.ts:1149-1167`、`src/stores/frames/receiveFramesStore.ts:1252-1293`。
- **Evidence**: sendTasksStore 暴露 `handleFrameReceived`，将事件交给 triggerListener，见 `src/stores/frames/sendTasksStore.ts:533-561`。
- **Evidence**: trigger listener 匹配 frameId/sourceId、waiting-trigger 状态和 conditions，见 `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:70-158`。
- **Evidence**: trigger 执行支持 responseDelay、single/multiple instance、continueListening false 后 completed，见 `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:223-305`。
- **Oracle candidate**: 用 receive 更新项 + trigger 配置 + 目标任务状态验证是否触发、是否延迟、是否保持监听。

### 5.4 send task -> unified sender -> target -> result

- **Evidence**: send task executor 在发送前检查 task 状态，处理 single/multiple instance，见 `src/composables/frames/sendFrame/useSendTaskExecutor.ts:126-159`、`src/composables/frames/sendFrame/useSendTaskExecutor.ts:265-444`。
- **Evidence**: executor 调用 unified sender；target unavailable 时 task 被暂停并记录错误，见 `src/composables/frames/sendFrame/useSendTaskExecutor.ts:222-247`。
- **Evidence**: unified sender 解析 target、构造 bytes、调用 serial/network API，成功后更新统计和 SCOE 特例记录，见 `src/composables/frames/sendFrame/useUnifiedSender.ts:31-167`、`src/composables/frames/sendFrame/useUnifiedSender.ts:187-260`。
- **Oracle candidate**: 用 target available/unavailable、serial/TCP/UDP target path、发送结果和 task status 构造 checklist。

### 5.5 SCOE receive/send/status loop

- **Evidence**: SCOE TCP server source 进入 SCOE path，命令校验执行后记录接收数据，见 `src/stores/frames/receiveFramesStore.ts:911-1030`。
- **Evidence**: SCOE store 管理 TCP/UDP 连接生命周期和每秒状态/发送检查循环，见 `src/stores/scoeStore.ts:216-340`。
- **Evidence**: command executor 成功后更新命令状态并等待完成条件，见 `src/composables/scoe/useScoeCommandExecutor.ts:77-187`。
- **Evidence**: unified sender 对 SCOE UDP target 有发送记录特例，见 `src/composables/frames/sendFrame/useUnifiedSender.ts:146-167`。
- **Oracle candidate**: 用固定 source/target、命令字节、状态计数、成功/失败/timeout 行为构造专项 SCOE oracle。

### 5.6 platform API -> renderer behavior

- **Evidence**: renderer common API 汇总 system/files/serial/network/path/receive/dataStorage/highSpeedStorage/historyData/timerManager，见 `src/api/common/index.ts:6-34`。
- **Evidence**: preload 暴露 `window.electron` 的多域 API，main IPC 注册对应 handler，见 `src-electron/preload/api/index.ts:1-31`、`src-electron/main/ipc/index.ts:12-23`。
- **Evidence**: wrappers 在非 Electron 或 API 缺失时存在 fallback/noop，见 `src/api/common/systemApi.ts:7-22`、`src/api/common/networkApi.ts:73-101`。
- **Oracle candidate**: 以 API return shape、listener cleanup、缺失 API fallback 行为作为兼容 checklist；权限边界只作为风险输入。

### 5.7 storage / history / report-like behavior

- **Evidence**: App lifecycle 启动历史采集和自动记录，见 `src/layouts/useAppLifecycle.ts:45-68`。
- **Evidence**: dataDisplayStore recording 时按小时批量收集和保存当前数据，见 `src/stores/frames/dataDisplayStore.ts:359-523`、`src/stores/frames/dataDisplayStore.ts:701-730`。
- **Evidence**: history handler 支持 append、load、CSV export、cleanup，见 `src-electron/main/ipc/historyDataHandlers.ts:101-176`、`src-electron/main/ipc/historyDataHandlers.ts:304-553`。
- **Evidence**: 甲方文档要求 result/file/report delivery 是任务交付出口，见 `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-结果、文件与报告回传.md:12-16`。
- **Inference**: 旧系统本地 history/CSV 能为报告提供材料，但不是北向交付闭环。

## 6. Old-system oracle map

### 必须提取 fixture 的行为

- **Frame asset fixture**: frame list/create/update/delete/duplicate/import/export -> framesConfig 持久化 -> selected frame 和 id 变化行为。证据：`src/pages/frames/FrameList.vue:240-391`、`src/stores/frames/frameTemplateStore.ts:26-96`、`src/composables/frames/useFrameEditor.ts:82-125`。
- **Receive bytes fixture**: bytes + receive config -> matched frame / unmatched / parse error / updated items / expressions / stats。证据：`src/stores/frames/receiveFramesStore.ts:1186-1205`、`src-electron/main/ipc/receiveHandlers.ts:54-111`。
- **Frame matcher fixture**: 匹配规则、字段处理错误、AND 条件。证据：`src/utils/receive/dataProcessor.ts:54-105`、`src/utils/receive/dataProcessor.ts:465-550`、`src/utils/receive/frameMatchers.ts:47-109`。
- **Trigger fixture**: updated receive item + task trigger config -> condition result -> execution/continueListening。证据：`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:70-158`、`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:223-305`。
- **Unified sender fixture**: target id/path + send instance -> serial/network send result + stats。证据：`src/composables/frames/sendFrame/useUnifiedSender.ts:31-167`。
- **SCOE protocol fixture**: sourceId、命令 frame、checksum、命令执行结果、timeout。证据：`src/stores/frames/receiveFramesStore.ts:911-1004`、`src/utils/receive/scoeFrame.ts:167-290`。
- **Storage fixture**: JSON import/export、history append/load/export、高速存储命中/未命中。证据：`src-electron/main/ipc/fileMetadataHandlers.ts:8-124`、`src-electron/main/ipc/historyDataHandlers.ts:101-176`、`src-electron/main/ipc/highSpeedStorageHandlers.ts:104-145`。
- **Status indicator fixture**: receive data item value + indicator mapping -> active/currentColor；disabled 时 activeIndicators 为空。证据：`src/stores/statusIndicators.ts:17-88`。

### 必须保留手工 checklist 的行为

- **UI navigation checklist**: 左侧导航项、主要页面可进入、全局文件弹窗可用。证据：`src/components/layout/SidePanel.vue:32-47`、`src/layouts/MainLayout.vue:17-28`。
- **Frame asset checklist**: 帧列表加载、新建/编辑跳转、复制、删除、导入导出、保存后刷新。证据：`src/pages/frames/FrameList.vue:240-391`、`src/composables/frames/useFrameTemplates.ts:18-110`。
- **App lifecycle checklist**: mount 后数据加载/连接刷新/统计初始化/SCOE/init recording；unmount 后停止记录并清空接收当前值。证据：`src/layouts/useAppLifecycle.ts:45-89`。
- **Connection checklist**: 串口刷新/连接/断开、TCP/UDP target 可用性、断开后发送任务暂停。证据：`src/stores/serialStore.ts:134-275`、`src/stores/connectionTargetsStore.ts:172-235`、`src/composables/frames/sendFrame/useSendTaskExecutor.ts:222-247`。
- **Timer checklist**: interval/timeout/delayed 注册、tick、pause/resume、cleanup。证据：`src/composables/common/useTimerManager.ts:29-252`、`src-electron/main/ipc/timerManagerHandlers.ts:48-190`。
- **History checklist**: 自动记录、按时间加载、CSV 导出、清理旧数据。证据：`src/stores/frames/dataDisplayStore.ts:701-730`、`src-electron/main/ipc/historyDataHandlers.ts:304-553`。
- **Settings checklist**: 自动开始记录、CSV 保存间隔、CSV 默认路径行为及显示/实际目录差异、状态指示灯启用/配置、重置设置、待实现按钮提示。证据：`src/pages/settings/Index.vue:31-185`、`src/pages/settings/Index.vue:213-259`、`src/stores/settingsStore.ts:8-22`。
- **Platform checklist**: preload API 是否暴露、wrapper fallback、listener cleanup、window show fallback。证据：`src-electron/preload/api/index.ts:1-31`、`src/api/common/networkApi.ts:73-101`、`src-electron/main/window.ts:109-137`。

### 只能运行态确认的行为

- **Unknown**: 串口 Windows registry 扫描、真实端口枚举、串口 close/error event 顺序，需要设备/OS 验证；相关实现位于 `src-electron/main/ipc/serialHandlers.ts`。
- **Unknown**: TCP/UDP 断线、重连、remote host 变化和高频数据广播/存储竞争，需要真实网络验证；相关实现位于 `src-electron/main/ipc/networkHandlers.ts:498-607`。
- **Unknown**: timer pause/resume 对已经注册任务的真实恢复语义，代码提示 task-specific 逻辑未完整承接，见 `src/composables/frames/sendFrame/useSendTaskController.ts:70-117`。
- **Unknown**: beforeunload 对 task.timers 的 cleanup 是否能覆盖主进程字符串 timer ID，需要运行态或 timer manager 专项验证，见 `src/boot/taskManager.ts:28-38`、`src/stores/frames/sendTasksStore.ts:112-117`。
- **Unknown**: SCOE wait completion、命令 timeout、状态循环在真实设备上的边界，需要设备联调，见 `src/utils/receive/scoeFrame.ts:294-539`、`src/stores/scoeStore.ts:293-340`。
- **Unknown**: packaged 下 `public` data path 是否长期可写、是否符合用户数据保留预期，需要安装态验证，见 `src-electron/preload/api/path.ts:3-15`。

### 当前无法确认的行为

- **Unknown**: setTestTask/start/control/heartbeat/status/result/report/file delivery 是否已有隐藏实现。本轮在已读主代码入口未确认到北向闭环，文档要求见 `后面对接所需功能清单.md:109-115`、`后面对接所需功能清单.md:213-348`。
- **Unknown**: 北向结果字段口径、报告 JSON 细节、FTP/HTTP 交付协议和异常码是否已由用户外部约定锁定，文档仍标记部分字段未确认，见 `后面对接所需功能清单.md:94-105`、`后面对接所需功能清单.md:423-488`。
- **Unknown**: 设置导入/导出和选择目录按钮当前显示待实现提示；是否保留、补齐或删除需要用户确认，见 `src/pages/settings/Index.vue:213-259`。
- **Unknown**: status indicator store 暴露 cleanup 但 app unmount 未见调用；timer 生命周期是否泄漏需运行态确认，见 `src/stores/statusIndicators.ts:118-138`、`src/stores/statusIndicators.ts:216-239`、`src/layouts/useAppLifecycle.ts:74-89`。

## 7. Undocumented behavior and risk list

1. **High - 北向任务/结果/报告闭环缺口**
   - **Evidence**: 甲方文档要求任务进入、开始、控制、文件请求，见 `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/04-任务主链.md:14-126`。
   - **Evidence**: 结果/文件/报告回传被定义为任务交付出口，见 `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-结果、文件与报告回传.md:12-16`。
   - **Evidence**: 当前 main IPC 注册面只有窗口、菜单、storage、serial、network、files、receive、高速存储、history、timer，没有北向任务/报告 handler，见 `src-electron/main/ipc/index.ts:12-23`。
   - **Risk**: 不能把本地 send task/history/CSV 误认为已完成北向交付。

2. **High - stop/completed 语义可能与外部任务控制冲突**
   - **Evidence**: stopTask 将 running/paused/waiting-trigger 任务清理后置为 completed，见 `src/composables/frames/sendFrame/useSendTaskController.ts:26-65`。
   - **Evidence**: completed 状态会触发 removeTask，见 `src/stores/frames/sendTasksStore.ts:401-434`。
   - **Risk**: 如果后续对接中心 stop/abort/failed，需要明确旧系统“停止即 completed”的局限。

3. **High - receive 管线副作用集中且跨域**
   - **Evidence**: receive 成功链同时更新 cache、当前值、表达式、星座图、统计和 trigger，见 `src/stores/frames/receiveFramesStore.ts:1169-1181`。
   - **Evidence**: trigger 又可触发发送任务，见 `src/stores/frames/receiveFramesStore.ts:1252-1293`。
   - **Risk**: rewrite 时如果只复刻解析结果，容易漏掉统计、显示、触发等隐性行为。

4. **High - SCOE 固定 source/early return 容易被误判为普通接收**
   - **Evidence**: 只有 `scoe-tcp-server` source 进入 SCOE path，见 `src/stores/frames/receiveFramesStore.ts:1021-1030`。
   - **Evidence**: SCOE 命中后在 `processDataInternal` 中早返回，不走普通 receive IPC，见 `src/stores/frames/receiveFramesStore.ts:1186-1205`。
   - **Risk**: 新系统若统一抽象所有接收流，必须先明确 SCOE 是否仍保留这条特权路径。

5. **High - 高速存储命中后短路普通 receive/display/trigger 链**
   - **Evidence**: network data 命中 high-speed storage 规则后异步存储并 return，不广播 `network:data`，见 `src-electron/main/ipc/networkHandlers.ts:505-520`。
   - **Evidence**: 普通网络数据进入 receive store 的入口在 network store `network:data` listener，见 `src/stores/netWorkStore.ts:207-213`。
   - **Risk**: 命中高速存储的网络包不进入普通 receive/display/trigger/status-indicator 链；这不是单纯存储行为，而是关键 oracle 分支。

6. **Medium - 帧资产是上游配置资产，不能只归入 UI**
   - **Evidence**: 帧列表/编辑有独立路由，见 `src/router/routes.ts:14-19`。
   - **Evidence**: FrameList 提供新建/编辑/复制/删除/导入/导出，见 `src/pages/frames/FrameList.vue:240-391`。
   - **Evidence**: frameTemplateStore 负责 `framesConfig` 加载、保存和删除，见 `src/stores/frames/frameTemplateStore.ts:26-96`。
   - **Evidence**: receive store 监听 frameTemplateStore.frames 并同步主进程缓存，见 `src/stores/frames/receiveFramesStore.ts:257-264`。
   - **Risk**: rewrite 讨论若只按 receive/send 页面拆分，容易漏掉 frame asset 生命周期、id/field 引用稳定性和 receive main cache 同步。

7. **Medium - 设置页混合了真实运行设置和待实现按钮**
   - **Evidence**: autoStartRecording、csvDefaultOutputPath、csvSaveInterval 通过 `useStorage` 持久化，见 `src/stores/settingsStore.ts:8-22`。
   - **Evidence**: app 启动会按 autoStartRecording 自动开始记录，见 `src/layouts/useAppLifecycle.ts:61-68`；CSV 保存间隔和默认路径分别影响 dataDisplayStore 与 CSV 导出，见 `src/stores/frames/dataDisplayStore.ts:149-157`、`src/components/storage/CSVExportDialog.vue:128-142`。
   - **Evidence**: 选择目录、导出设置、导入设置当前只提示待实现，见 `src/pages/settings/Index.vue:213-259`。
   - **Risk**: 不能把设置页整体标 Unknown；需要区分真实运行行为、显示配置、待实现占位。

8. **Medium - 状态指示灯是 receive display 的隐性消费面，timer cleanup 仍是 Unknown**
   - **Evidence**: 状态指示灯读取 receiveFramesStore group/dataItem 当前值并映射颜色，见 `src/stores/statusIndicators.ts:69-88`。
   - **Evidence**: store 初始化时启动每秒数据变化检查，见 `src/stores/statusIndicators.ts:118-128`、`src/stores/statusIndicators.ts:216-239`。
   - **Evidence**: app unmount 只清理 dataDisplay/global stats/receive values，未见调用 status indicator cleanup，见 `src/layouts/useAppLifecycle.ts:74-89`。
   - **Risk**: 如果 rewrite 只复刻 receive 表格显示，容易漏掉状态指示灯这一额外显示/告警面；其 timer 生命周期需要运行态确认。

9. **Medium - network:statusChange 是静态确认的 contract drift**
   - **Evidence**: preload 暴露 `onStatusChange`，见 `src-electron/preload/api/network.ts:115-123`。
   - **Evidence**: renderer network store 订阅 `networkAPI.onStatusChange` 并写入 connectionStats，见 `src/stores/netWorkStore.ts:251-255`。
   - **Evidence**: network main 明确广播 connectionEvent 和 data，见 `src-electron/main/ipc/networkHandlers.ts:582-607`。
   - **Risk**: 当前静态扫描路径未发现 main 侧同名发射点；按 confirmed static contract drift 处理，除非后续找到隐藏运行态 sender 或其他进程证据。

10. **Medium - 文件 API 权限面较宽**
   - **Evidence**: file handler 支持 caller 指定路径 save/load/delete/read text，见 `src-electron/main/ipc/fileMetadataHandlers.ts:52-112`。
   - **Evidence**: data path 被解析到 `public`，见 `src-electron/preload/api/path.ts:11-15`。
   - **Risk**: 这是旧系统能力事实和安全/迁移风险，不应自动继承为新边界。

11. **Medium - renderer fallback/noop 可能隐藏 Electron API 缺失**
   - **Evidence**: system fallback 返回 no-op window/menu/autolaunch，见 `src/api/common/systemApi.ts:7-22`。
   - **Evidence**: serial/network wrappers 在 API 不可用时返回失败或 no-op cleanup，见 `src/api/common/serialApi.ts:67-72`、`src/api/common/networkApi.ts:73-101`。
   - **Risk**: 非 Electron 或 preload 缺失时可能表现为静默失败，需要 checklist 覆盖。

12. **Medium - history 统计存在简化实现**
   - **Evidence**: history storage stats 的 totalRecords 相关实现存在简化/占位，见 `src-electron/main/ipc/historyDataHandlers.ts:241-290`。
   - **Evidence**: CSV UI 未设置路径时展示 `data/exports/csv`，main 默认目录实际为 `getDataPath()/exports/csv`，见 `src/components/storage/CSVExportDialog.vue:236-243`、`src-electron/main/ipc/historyDataHandlers.ts:61-65`。
   - **Risk**: 旧 UI 显示、默认路径提示和真实记录数可能不一致，迁移时不能直接作为精确 oracle。

13. **Medium - beforeunload task timer cleanup 可能不覆盖 main timer**
   - **Evidence**: beforeunload 对 task.timers 调用 `clearTimeout/clearInterval`，见 `src/boot/taskManager.ts:28-38`。
   - **Evidence**: task.timers 注释为主进程 timer 字符串 ID，见 `src/stores/frames/sendTasksStore.ts:112-117`。
   - **Risk**: 文档和 checklist 应写成 attempts cleanup；main timer cleanup 效果需要专项确认。

14. **Low - serial:onAllStatusChange 可能存在 event contract drift**
   - **Evidence**: preload 监听 `serial:all-status`，见 `src-electron/preload/api/serial.ts:192-203`。
   - **Evidence**: main 静态扫描可见 `serial:status` 广播和 `serial:all-status` invoke handler，未见 `serial:all-status` 事件广播，见 `src-electron/main/ipc/serialHandlers.ts:567-620`。
   - **Risk**: 这是 Platform API 契约面的小风险，建议后续专项确认是否有人订阅。

15. **Low - app unmount 会清空接收当前值并保存配置**
    - **Evidence**: `clearDataItemValues` 清空 receive data item value 后保存配置，见 `src/layouts/useAppLifecycle.ts:28-41`、`src/layouts/useAppLifecycle.ts:74-89`。
    - **Risk**: 这是隐藏数据保留行为；需要确认用户是否期待退出后当前值消失。

## 8. Rewrite discussion inputs

### 必须讨论是否保留的功能

- **Evidence-backed topic**: 页面入口和用户可见工作流：连接、帧配置/编辑、发送、接收、存储、历史、SCOE、设置，见 `src/router/routes.ts:3-54`。
- **Evidence-backed topic**: 帧模板资产是否作为独立迁移对象保留，包括 CRUD、复制、导入导出、id 变更、`framesConfig` 持久化和 receive main cache sync，见 `src/pages/frames/FrameList.vue:240-391`、`src/stores/frames/frameTemplateStore.ts:26-96`、`src/stores/frames/receiveFramesStore.ts:257-264`。
- **Evidence-backed topic**: 串口/TCP/TCP server/UDP remote host 的 target 模型和可用性语义，见 `src/stores/connectionTargetsStore.ts:34-235`。
- **Evidence-backed topic**: receive parse/display/stat/trigger/status indicator 全链路，见 `src/stores/frames/receiveFramesStore.ts:1060-1293`、`src/stores/statusIndicators.ts:69-128`。
- **Evidence-backed topic**: 手工发送、发送实例、统一发送结果、发送任务、trigger、timer、pause/resume/stop/completed，见 `src/composables/frames/sendFrame/useUnifiedSender.ts:16-167`、`src/stores/frames/sendTasksStore.ts:15-122`。
- **Evidence-backed topic**: SCOE 是否作为专项能力保留，以及固定 source/target/命令/状态循环是否需要兼容，见 `src/stores/frames/receiveFramesStore.ts:911-1030`、`src/stores/scoeStore.ts:216-340`。
- **Evidence-backed topic**: 历史记录、CSV、高速存储、本地 JSON 导入导出和数据保留；其中高速存储短路普通 receive 链、CSV 默认路径显示/实际目录、history 统计简化需要单独讨论，见 `src-electron/main/ipc/historyDataHandlers.ts:61-65`、`src-electron/main/ipc/historyDataHandlers.ts:101-553`、`src-electron/main/ipc/networkHandlers.ts:505-520`。
- **Evidence-backed topic**: 设置页中真实运行设置、状态指示灯配置和待实现按钮应分别处理，见 `src/pages/settings/Index.vue:31-185`、`src/pages/settings/Index.vue:213-259`、`src/stores/settingsStore.ts:8-22`。
- **Evidence-backed topic**: 北向任务/结果/报告/文件交付当前是 gap map，不是 legacy behavior；是否进入本轮 rewrite scope 需要单独确认，见 `后面对接所需功能清单.md:109-115`、`后面对接所需功能清单.md:282-348`。

### 可以合并、降级或废弃的候选

- **Candidate migration category: can redesign**: UI 布局、页面组织、store 内部缓存结构、timer 实现、IPC 分层、状态指示灯配置 UI。
- **Candidate migration category: compatible**: frame asset 导入导出、target ID/path、send result shape、receive stats、status indicator 映射、history export 操作可以先兼容旧行为，再决定内部实现。
- **Candidate migration category: candidate to drop**: 未被主进程明确支撑或运行价值不明的事件订阅/fallback、confirmed static contract drift、占位统计，以及用户确认不再需要的设置待实现按钮。
- **Unknown**: 哪些历史页面、设置待实现项、状态指示灯、SCOE 测试工具能力属于实际交付必需，需用户确认。

### 不能直接继承旧实现的行为

- **Evidence-backed warning**: 旧 send task 不等于北向测试任务；stop -> completed/removeTask 的语义不能直接映射中心 stop/abort，见 `src/composables/frames/sendFrame/useSendTaskController.ts:26-65`、`src/stores/frames/sendTasksStore.ts:401-434`。
- **Evidence-backed warning**: 帧模板资产不是纯 UI，不能被 receive/send/SCOE 各自重复吞并；它的 id/field 生命周期会影响多个下游能力并同步 receive 主进程缓存，见 `src/stores/frames/frameTemplateStore.ts:26-96`、`src/composables/frames/useFrameEditor.ts:82-125`、`src/stores/frames/receiveFramesStore.ts:257-264`。
- **Evidence-backed warning**: 旧 history/CSV 是本地记录和导出，不是结果/报告回传闭环，见 `src-electron/main/ipc/historyDataHandlers.ts:304-466`、`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-结果、文件与报告回传.md:12-16`。
- **Evidence-backed warning**: Electron bridge 权限面和 fallback/noop 是旧系统运行事实，不是新边界方案，见 `src-electron/preload/api/index.ts:1-31`、`src/api/common/systemApi.ts:7-22`。
- **Evidence-backed warning**: SCOE 固定 source/target 和 early return 适合作为专项 oracle，但是否泛化为统一 receive 模型需要单独讨论，见 `src/stores/frames/receiveFramesStore.ts:1021-1030`、`src/stores/frames/receiveFramesStore.ts:1186-1205`。
- **Evidence-backed warning**: 高速存储命中后不广播 renderer data，网络包不进入普通 receive/display/trigger/status-indicator 链；这可能是旧性能优化，也可能是功能风险，见 `src-electron/main/ipc/networkHandlers.ts:505-520`。

## 9. Open questions

1. 哪些旧页面是重写后必须保留的用户入口：连接、配置、发送、接收、存储、历史、SCOE、设置是否全部保留？
2. 帧模板资产是否作为独立迁移对象保留？帧 id 变更时删除 lastId、复制帧重命名、导入导出数组格式是否需要兼容？
3. 哪些硬件/运行环境必须进入 rewrite oracle：真实串口、TCP client/server、UDP remote host、SCOE TCP/UDP、打包安装态文件路径？
4. SCOE 是否是生产必需能力，还是测试/兼容工具？固定 source/target、命令处理和状态循环是否必须逐项兼容？
5. 旧系统 stop -> completed/removeTask 的行为是否符合用户预期？北向 stop/abort/failed 是否需要与旧 send task 明确拆开？
6. receive 表达式、星座图数据、统计、trigger 和状态指示灯是否都属于必须保留的业务行为？
7. 设置页的导出设置、导入设置、选择目录按钮当前待实现；后续是补齐、降级，还是删除？
8. 高速存储命中后不再广播 `network:data` 是刻意要求、性能折中，还是旧实现副作用？
9. 历史记录和 CSV 是否足以代表旧系统“报告-like”能力？是否已有外部报告模板或交付目录约定？
10. 北向接入的最低闭环是什么：任务接收、开始/停止、心跳、状态查询、单测试项结果、任务报告、文件上传完成，哪些是首批必须？
11. 结果字段、异常码、任务上下文、设备身份、FTP/HTTP endpoint 是否已有用户侧最终口径？
12. Electron 平台边界是否仍沿用本地桌面 app，还是后续会拆分为桌面端、服务端或设备代理？本问题只影响后续讨论，不在本文给出设计。
13. `public` data path 是否是用户认可的数据目录？打包后是否允许长期写入、备份和清理？
14. `network:statusChange` confirmed static contract drift、`serial:all-status` suspected drift、autoLaunch、设置待实现按钮等边缘能力是否有人使用，是否可降级或删除？
15. beforeunload task timer cleanup、status indicator cleanup 是否存在运行态泄漏或主进程 timer 未清理问题？
16. CSV 默认路径展示值与主进程默认目录差异、history totalRecords 简化是否允许保留，还是需要作为迁移修正项？
