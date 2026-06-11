# 新旧系统功能对照表

> 日期：2026-05-07
> 性质：旧系统全面扫描 + 新系统覆盖度评估
> 目的：确认 MVP 功能无遗漏，为下一阶段实施优先级提供依据
> 方法：4 个 agent 并行扫描旧系统（页面、状态、IPC、覆盖度）

---

## 一、旧系统页面与功能清单

### 路由与页面结构（10 个页面）

| 路径 | 页面 | 分类 | 核心功能 |
|------|------|------|---------|
| `/` | 首页 | 辅助 | 系统标题展示（"激光链路标准测试设备"） |
| `/connect` | 连接配置 | **主流程** | 三面板：连接列表 + 网口/串口/测试工具配置 |
| `/frames/list` | 帧格式列表 | **主流程** | 帧格式 CRUD、搜索过滤、导入导出、收藏 |
| `/frames/editor` | 帧编辑器 | **主流程** | 三栏：基本信息 + 字段编辑 + 预览 |
| `/frames/send` | 帧发送 | **主流程** | 三栏：帧格式 + 发送实例 + 预览；定时/触发/顺序三种模式 |
| `/frames/receive` | 帧接收 | **主流程** | 双模式：编辑/显示；表格/折线图/星座图；录制控制 |
| `/scoe` | SCOE 配置 | **主流程** | 三栏：卫星配置列表 + 配置表单 + 状态面板；链路自检 |
| `/storage` | 高速存储 | 辅助 | 高速网络数据存储、帧头识别、存储状态监控 |
| `/history` | 历史分析 | 辅助 | 时间范围查询、1-4 图表、数据项选择、CSV 导出 |
| `/settings` | 系统设置 | 辅助 | 数据记录设置、CSV 导出路径、状态指示灯、导入导出 |

### 主流程页面（日常使用）

1. **连接配置** — 建立串口/网络连接（所有数据流的前置依赖）
2. **帧发送** — 手动/定时/触发/顺序四种发送模式
3. **帧接收** — 实时数据展示（表格/折线图/星座图）
4. **SCOE 配置** — 卫星测试、链路自检、指令执行

### 页面间导航关系

```
首页 → 连接配置（建立连接）
         ↓
帧格式列表 → 帧编辑器（编辑帧定义）
         ↓
帧发送 ←→ 帧接收（核心收发）
         ↓
SCOE 配置（独立测试模块）
         ↓
高速存储 / 历史分析（数据存储和分析）
```

### 特别关注的交互能力

| 能力域 | 旧系统实现 |
|--------|-----------|
| 串口配置 | 波特率/数据位/停止位/校验位、热插拔检测 |
| 网口配置 | TCP client/server、UDP、连接状态实时监控 |
| 发送模式 | 单次、定时（TimedSend）、触发（TriggerSend）、顺序（SequentialSend） |
| 可视化 | 表格、折线图、星座图（I/Q 采样点）、多图表布局 |
| 录制控制 | 开始/停止录制、自动录制 |
| 测试工具 | 串口测试工具、网口测试工具 |

---

## 二、旧系统状态与耦合清单

### Store 清单（19 个）

#### 连接管理层

| Store | 核心状态 | 跨 Store 引用 |
|-------|---------|--------------|
| `serialStore` | 串口连接列表、接收/发送数据、状态统计 | → `receiveFramesStore.handleReceivedData`（直接调用） |
| `netWorkStore` | TCP/UDP 连接列表、数据监听、连接状态 | 被 `scoeStore`、`connectionTargetsStore` 引用 |
| `connectionTargetsStore` | 统一连接目标、聚合串口+网络 | → `serialStore` + `networkStore` |

#### 帧管理层

| Store | 核心状态 | 跨 Store 引用 |
|-------|---------|--------------|
| `frameTemplateStore` | 帧模板 CRUD | 被 `sendFrameInstancesStore`、`scoeFrameInstancesStore` 引用 |
| `frameFieldsStore` | 帧字段管理 | 被编辑器引用 |
| `frameEditorStore` | 编辑器状态 | ← `frameTemplateStore` |
| `frameFilterStore` | 帧过滤 | 被列表页引用 |

#### 收发执行层

| Store | 核心状态 | 跨 Store 引用 |
|-------|---------|--------------|
| `receiveFramesStore` | 接收帧处理、数据分组、映射、SCOE帧 | → `sendTasksStore`（触发检查）、`dataDisplayStore`（星座图）、`scoeStore`（SCOE帧） |
| `sendFrameInstancesStore` | 发送帧实例、策略配置、统计 | → `frameTemplateStore` |
| `sendTasksStore` | 发送任务管理、触发监听、状态跟踪 | → `sendFrameInstancesStore`、`receiveFramesStore`（触发监听） |
| `scoeFrameInstancesStore` | SCOE 帧实例 | → `frameTemplateStore` |

#### 数据存储层

| Store | 核心状态 | 跨 Store 引用 |
|-------|---------|--------------|
| `dataDisplayStore` | 数据显示、历史记录、CSV 导出、星座图 | → `receiveFramesStore` + `settingsStore` |
| `highSpeedStorageStore` | 高速存储配置、统计、规则 | 独立 |
| `historyAnalysis` | 历史数据分析、图表配置、CSV 导出 | 独立 |

#### 全局服务层

| Store | 核心状态 | 跨 Store 引用 |
|-------|---------|--------------|
| `globalStatsStore` | 全局统计、时间、位置、通信统计 | 被多处引用 |
| `settingsStore` | 应用设置、CSV 配置 | 被多处引用 |
| `statusIndicators` | 状态指示灯、值映射 | ← `receiveFramesStore` |
| `fileStorageStore` | 文件存储 | 独立 |

### 严重耦合关系图

```
serialStore ──直接调用──→ receiveFramesStore
  ↑                           │
  │                     ┌─────┼──────┐
  │                     ↓     ↓      ↓
connectionTargetsStore  sendTasksStore dataDisplayStore
  ↑       ↑              │              │
  │       │              ↓              │
serialStore networkStore receiveFramesStore（循环！）
              ↑
              │
           scoeStore
```

**关键问题**：
- `receiveFramesStore` 动态导入 `sendTasksStore` 和 `dataDisplayStore` 来规避循环依赖
- `serialStore` 直接调用 `receiveFramesStore.handleReceivedData()`，串口数据直接穿透到帧处理
- `connectionTargetsStore` 同时依赖串口和网络两个 store，是"胶水 store"
- `scoeStore` 直接调用 `networkStore` 管理连接，SCOE 绑死了网络传输

---

## 三、旧系统 IPC 和 Electron 能力清单

### IPC Channel 分类（10 大类，50+ channel）

#### 1. 窗口控制
- `set-menu-visibility`, `is-menu-visible`
- `window-close`, `window-minimize`, `window-maximize`, `window-unmaximize`, `window-is-maximized`

#### 2. 串口通信（serial:*）
- `serial:list`, `serial:open`, `serial:close`, `serial:close-all`
- `serial:write`, `serial:send`, `serial:read`
- `serial:status`, `serial:all-status`
- `serial:setOptions`, `serial:clearBuffer`

#### 3. 网络通信
- `network:connect`, `network:disconnect`, `network:send`
- `network:getConnections`, `network:getStatus`

#### 4. 文件操作
- `files:listWithMetadata`, `files:getFullPath`, `files:ensureDirectory`
- `files:saveJsonToFile`, `files:loadJsonFromFile`
- `files:deleteFile`, `files:readTextFile`

#### 5. 数据存储（dataStorage:*，动态生成）
- `dataStorage:list`, `dataStorage:save`, `dataStorage:delete`
- `dataStorage:saveAll`, `dataStorage:export`, `dataStorage:import`

#### 6. 接收数据处理（receive:*）
- `receive:handleReceivedData`, `receive:validateMappings`
- `receive:updateConfigCache`, `receive:updateFramesCache`
- `receive:updateMappingsCache`, `receive:updateGroupsCache`
- `receive:getCacheStatus`, `receive:clearConfigCache`

#### 7. 高速存储（highSpeedStorage:*）
- `highSpeedStorage:updateConfig`, `highSpeedStorage:getConfig`
- `highSpeedStorage:getStats`, `highSpeedStorage:validateRule`, `highSpeedStorage:resetStats`

#### 8. 历史数据（historyData:*）
- `historyData:getAvailableHours`, `historyData:appendBatchRecords`
- `historyData:compressHourData`, `historyData:getFileInfo`
- `historyData:getStorageStats`, `historyData:exportCSV`
- `historyData:deleteHourData`, `historyData:cleanupOldData`
- `historyData:loadMultipleHours`

#### 9. 定时器管理（timerManager:*）
- `timerManager:register`, `timerManager:start`, `timerManager:stop`
- `timerManager:pause`, `timerManager:resume`, `timerManager:unregister`
- `timerManager:getInfo`, `timerManager:getAllTimers`
- `timerManager:batchOperation`, `timerManager:getStats`, `timerManager:cleanup`
- `timerManager:onTimerTick`, `timerManager:onCustomEvent`

#### 10. 路径/启动
- `path:getDataPath`, `path:resolve`, `path:isPackaged`
- `autoLaunch:getEnabled`, `autoLaunch:setEnabled`

### window.electron 暴露能力

旧系统 preload 通过 `contextBridge.exposeInMainWorld` 暴露了一个巨大的 `window.electron` 对象，包含：
- `window` — 窗口控制（最小化/最大化/关闭/状态）
- `menu` — 菜单控制
- `autoLaunch` — 开机启动
- `serial` — 串口完整管理（列表/开关/读写/状态/缓冲）
- `network` — 网络管理（TCP/UDP 连接/断开/发送/状态）
- `files` — 文件操作（列表/路径/目录/JSON读写/删除/读取）
- `dataStorage` — 通用数据存储（按 DATA_PATH_MAP 动态生成）
- `path` — 路径工具
- `receive` — 接收数据处理（含业务逻辑！）
- `highSpeedStorage` — 高速存储配置
- `historyData` — 历史数据管理
- `timerManager` — 定时器（含自定义事件）

### 架构违规项

| 违规 | 位置 | 说明 |
|------|------|------|
| **main 承载业务逻辑** | `receive:*` handlers | 帧匹配、映射验证、缓存更新等业务逻辑在 main 进程执行 |
| **main 承载业务逻辑** | `historyData:*` handlers | 历史数据压缩、CSV 导出等业务逻辑在 main 进程执行 |
| **main 承载业务逻辑** | `highSpeedStorage:*` handlers | 存储规则验证在 main 进程执行 |
| **renderer 直接使用 Node** | `useFileDialog.ts` | renderer 中直接 import `path` 模块 |
| **裸 IPC 暴露** | preload/index.ts | 暴露整个 `window.electron` 大包，无类型约束 |
| **业务事件穿透** | `timerManager:onCustomEvent` | 定时器自定义事件通道，相当于裸事件总线 |

---

## 四、新旧系统功能覆盖度对照表

### 核心业务场景对照

| 功能 | 旧系统 | 新系统状态 | 覆盖度 | 说明 |
|------|--------|-----------|--------|------|
| **串口连接管理** | `serialStore` + `serialApi` | ✅ 已实现 | 90% | connection feature 完整 core/service/state，有 fake adapter + Vitest |
| **网络连接管理** | `netWorkStore` + `networkApi` | ✅ 已实现 | 85% | TCP/UDP config 已定义，adapter 骨架在，Electron main 侧未实现 |
| **多连接并发** | `connectionTargetsStore` | ✅ 已实现 | 90% | connection service 支持多连接管理 |
| **连接状态监控** | 各 store 混管 | ✅ 已实现 | 95% | `ConnectionRuntimeFact` + `TransportEventSnapshot` |
| **断线重连** | 无 | 📋 已设计 | 20% | design 中提到重连策略，未实现 |
| **帧定义 CRUD** | `frameTemplateStore` + `frameFieldsStore` | ✅ 已实现 | 100% | frame feature 完整，23 个测试文件 |
| **帧编辑器** | `FrameEditor.vue` 三栏 | 📋 已设计 | 30% | frame design 覆盖，UI 未实现 |
| **帧导入导出** | `ImportExportActions.vue` | 📋 已设计 | 20% | design 提到 JSON 迁移，未实现 |
| **表达式引擎** | 旧系统内嵌（有 bug） | ✅ 已实现 | 100% | `validation-expression.ts` 带依赖排序求值 |
| **帧匹配** | `frameMatchers.ts` | ✅ 已实现 | 90% | `frame-matcher.ts` 支持多种匹配规则 |
| **字段解析** | `fieldParser.ts` | ✅ 已实现 | 85% | `field-parser.ts` 支持 INT/UINT/HEX/BIT/STRING |
| **遥测接收** | `receiveFramesStore` | ✅ 已实现 | 85% | receive feature 完整 matcher/processor/field-parser |
| **遥控发送** | `sendFrameInstancesStore` | ✅ 已实现 | 85% | send feature 完整 encode/checksum/validation |
| **定时发送** | `TimedSendDialog` | ✅ 已实现 | 90% | task feature 支持定时循环 |
| **触发发送** | `TriggerSendDialog` | ✅ 已实现 | 85% | task feature 支持 wait-condition step |
| **序列发送** | `SequentialSendDialog` | ✅ 已实现 | 90% | task feature 支持多步骤序列 |
| **任务生命周期** | `sendTasksStore` | ✅ 已实现 | 85% | task lifecycle: wait→schedule→run→stop→done/abort |
| **任务控制** | pause/resume/stop | ✅ 已实现 | 80% | lifecycle manager 支持 |
| **条件匹配** | 内嵌在 receive | ✅ 已实现 | 85% | task condition registry |
| **SCOE 协议** | `scoeStore` 独立体系 | 📋 已设计 | 30% | 设计为"外部指令适配器"，未实现 |
| **SCOE 帧实例** | `scoeFrameInstancesStore` | 🚫 刻意不保留 | N/A | 旧 SCOE 独立帧列表必须消灭，复用全局帧 |
| **SCOE 执行器** | `useScoeCommandExecutor` | 🚫 刻意不保留 | N/A | 统一用 task 执行引擎 |
| **高速存储** | `highSpeedStorageStore` + handlers | 📋 Deferred | 15% | storage design 标记为 deferred |
| **参数历史存储** | `historyDataHandlers` | ✅ 已实现 | 75% | storage-local-baseline 有 history 支持 |
| **CSV 导出** | `CSVExportDialog` | ✅ 已实现 | 70% | storage 有 csv.ts，UI 未完整 |
| **历史分析** | `HistoryAnalysisPage` | 📋 已设计 | 25% | display design 提到历史图表 |
| **表格显示** | `DataTable.vue` | 📋 已设计 | 20% | display design 完成，UI 未实现 |
| **折线图** | `UniversalChart.vue` | 📋 已设计 | 20% | design 提到 chart library |
| **星座图** | scatter 模式 | 📋 已设计 | 20% | design 提到 scatter projection |
| **录制控制** | `RecordingControls.vue` | 📋 已设计 | 15% | 未实现 |
| **测试报告** | 旧系统无（只有 CSV） | ❌ 未覆盖 | 0% | result feature design 完成，report 未启动 |
| **北向 HTTPS** | 无 | ❌ 未覆盖 | 0% | 完全缺失 |
| **北向 FTP** | 无 | ❌ 未覆盖 | 0% | 完全缺失 |
| **状态指示器** | `StatusIndicators.vue` | ✅ 已实现 | 70% | status feature 有 core/service/state，UI 未实现 |
| **全局统计** | `globalStatsStore` | ✅ 已实现 | 70% | status feature 有 indicator |
| **设置管理** | `settingsStore` | ✅ 已实现 | 90% | settings feature 完整 |
| **配置持久化** | `dataStorageApi` | ✅ 已实现 | 85% | storage feature 有本地持久化 |

### Electron 平台能力对照

| 能力 | 旧系统 IPC | 新系统 | 状态 |
|------|-----------|--------|------|
| 串口枚举 | `serial:list` | `transport:enumerate-serial-ports` | ✅ 已实现 |
| 串口连接/断开 | `serial:open/close` | `transport:serial-connect/disconnect` | ✅ 已实现 |
| 串口读写 | `serial:write/read/send` | `transport:serial-write` + event batch | ✅ 已实现 |
| 网络连接 | `network:connect/disconnect/send` | — | ❌ 缺失 |
| 文件操作 | `files:*` (7 channels) | — | ❌ 缺失 |
| 路径工具 | `path:*` (3 channels) | — | ❌ 缺失 |
| 窗口控制 | `window-*` (5 channels) | — | ❌ 缺失 |
| 菜单控制 | `menu:*` (2 channels) | — | ❌ 缺失 |
| 开机启动 | `autoLaunch:*` (2 channels) | — | ❌ 缺失 |
| 定时器 | `timerManager:*` (11 channels) | — | ❌ 缺失（新系统设计在 renderer 侧） |
| 数据存储 | `dataStorage:*` (动态) | — | ❌ 缺失（新系统设计为 storage feature） |
| 历史数据 | `historyData:*` (9 channels) | — | ❌ 缺失 |
| 高速存储 | `highSpeedStorage:*` (5 channels) | — | ❌ 缺失 |
| 接收处理 | `receive:*` (8 channels) | — | 🚫 不应迁移（业务逻辑不应在 main） |

### 页面/UI 层对照

| 页面 | 旧系统 | 新系统 | 状态 |
|------|--------|--------|------|
| 首页 | `HomePage.vue` | `HomePage.vue`（空壳） | 📋 骨架在 |
| 连接配置 | `ConnectConfigPage.vue` | — | ❌ 缺失 |
| 帧格式列表 | `FrameList.vue` | — | ❌ 缺失 |
| 帧编辑器 | `FrameEditor.vue` | — | ❌ 缺失 |
| 帧发送 | `FrameSendPage.vue` | — | ❌ 缺失 |
| 帧接收 | `ReceiveFramePage.vue` | — | ❌ 缺失 |
| SCOE 配置 | `SCOEConfigPage.vue` | — | ❌ 缺失 |
| 高速存储 | `HighSpeedStoragePage.vue` | — | ❌ 缺失 |
| 历史分析 | `HistoryAnalysisPage.vue` | — | ❌ 缺失 |
| 系统设置 | `settings/Index.vue` | — | ❌ 缺失 |
| 主布局 | `MainLayout.vue` + `SidePanel.vue` | — | ❌ 缺失 |

---

## 五、新系统必须实现但还没骨架的功能清单

### P0 — 核心阻断（没有就跑不起来）

| 功能 | 当前状态 | 阻断原因 |
|------|---------|---------|
| **Platform Facade** | ❌ 无骨架 | renderer 无法访问串口/网络/文件能力；只有 serial transport 代码 |
| **核心页面** | ❌ 只有 HomePage | 用户无法访问任何功能 |
| **Layout 系统** | ❌ 无骨架 | 页面无法组织导航 |

### P1 — 高优先级（核心功能可见）

| 功能 | 当前状态 | 说明 |
|------|---------|------|
| **Display Feature** | 📋 只有 design | 表格/折线图/星座图全部未实现 |
| **SCOE/指令接入 Feature** | 📋 只有 design | 外部指令协议完全缺失 |
| **Status UI** | ✅ Core 完成但无 UI | 用户无法看到系统健康状态 |
| **网络 Transport (main 侧)** | ❌ 缺失 | TCP/UDP 连接管理在 Electron main 未实现 |
| **文件系统 (main 侧)** | ❌ 缺失 | 配置持久化、导出功能依赖文件操作 |

### P2 — 中优先级（扩展能力）

| 功能 | 当前状态 | 说明 |
|------|---------|------|
| **Report Feature** | ❌ 无骨架 | 测试报告生成，等待 result 产出后设计 |
| **Northbound Feature** | ❌ 无骨架 | HTTPS/FTP 推送，等待甲方 schema |
| **高速存储** | 📋 Deferred | 高频数据场景，核心功能稳定后启动 |
| **帧导入导出** | 📋 Design 覆盖 | 旧数据迁移支持 |
| **历史分析** | 📋 Design 覆盖 | 数据回看和图表分析 |
| **窗口控制** | ❌ 缺失 | 最小化/最大化/关闭/菜单 |

---

## 六、旧系统有但新系统刻意不保留的功能

| 旧功能 | 旧位置 | 不保留原因 | 处理方式 |
|--------|--------|-----------|---------|
| SCOE 独立帧列表 | `scoeFrameInstancesStore` | 全局帧模型唯一，SCOE 不应有第二套 | 消灭，复用全局帧定义 |
| SCOE 独立执行器 | `useScoeCommandExecutor` | 统一执行引擎决策 | 消灭，SCOE 命令翻译为 TaskDefinition |
| 全局 `window.electron` | `preload/index.ts` | 违反 Electron 安全原则 | 消灭，通过 typed platform facade |
| Store 间直接 import | 各 store | 违反 feature isolation | 消灭，通过 public API/service/selector |
| main 进程业务逻辑 | `receive:*` handlers | 违反"main 不承载领域规则" | 消灭，业务逻辑在 renderer TypeScript 层 |
| `dataDisplayStore` 混存 | 配置+采样+刷新 | 违反静态资产/运行事实分离 | 拆分到各自 feature |
| 旧 stop→completed 语义 | `useSendTaskController` | 新系统 stop 后状态为 stopped | 废弃旧语义 |
| 串口 target 等同 deviceId | `connectionTargetsStore` | northbound deviceId 另行定义 | 保留为 transport 事实 |
| `timerManager:onCustomEvent` | main 进程定时器 | 相当于裸事件总线 | 消灭，用 runtime bridge 替代 |
| 旧 JSON 格式作核心模型 | `public/data/templates/*.json` | 新系统自有 schema | 迁移适配器转换 |

---

## 七、覆盖度统计

| 类别 | 数量 | 占比 |
|------|------|------|
| ✅ 已实现 | 16 | 44% |
| 📋 已设计未实现 | 11 | 31% |
| ❌ 完全未覆盖 | 5 | 14% |
| 🚫 刻意不保留 | 10 | — |

### 结论

**核心领域层（frame/connection/receive/send/task/storage/settings/status）已高质量完成**，有 330+ 单元测试、fake adapter 支持、zero-dependency core 层。

**三个关键缺口**：
1. **Platform Facade 缺失** — renderer 无法访问任何桌面能力（串口只写了一半）
2. **页面层完全空白** — 用户无法使用任何功能
3. **Northbound 完全未启动** — 甲方要求的报告/HTTPS/FTP 全部未实现（但依赖甲方 schema 确认）

**旧系统最大教训**：19 个 store 的循环依赖和跨 store 直接读写，新系统通过 feature isolation + public API + runtime bridge 完全规避。
