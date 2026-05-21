# [S004-Agent7] 状态指示、健康检查和统计展示 — 旧系统可观测行为提取

> 2026-05-19 | 事实提取 | 状态: 完成

## 目标

提取旧系统中所有与状态指示、健康检查、统计展示相关的可观测业务行为，作为新系统保留/排除的依据。

---

## 一、连接状态指示

### 行为 1: 网络连接四态展示

- **旧行为**: 网络连接有四种状态：`idle`（未连接）、`connecting`（连接中）、`connected`（已连接）、`error`（连接失败）。每种状态有独立的颜色（grey/green/orange/red）、图标（wifi_off/wifi/wifi_find/wifi_off）和文本（未连接/已连接/连接中/连接失败）。
- **代码位置**: `src/components/connect/NetworkConnectionCard.vue:22-48`（getStatusColor/getStatusIcon/getStatusText 函数）
- **状态类型定义**: `src/types/serial/network.ts:9` — `NetworkConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error'`
- **新系统对应 feature**: connection feature
- **Oracle 来源**: 代码 + 类型定义，证据充分
- **建议**: **保留**。四态模型是连接管理的核心可观测行为，新系统 connection feature 应保留等价状态。

### 行为 2: 串口连接四态展示

- **旧行为**: 串口连接同样有四种状态：`disconnected`、`connecting`、`connected`、`error`。通过 `ConnectionStatus` 类型定义，UI 用 check_circle 绿色图标标识已连接。
- **代码位置**: `src/types/serial/serial.ts:66` — `ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'`
- **代码位置**: `src/stores/serialStore.ts:42` — `portConnectionStatuses`
- **新系统对应 feature**: connection feature
- **Oracle 来源**: 类型定义 + store，证据充分
- **建议**: **保留**。与网络连接状态模型一致。

### 行为 3: 网络连接卡片网格展示（最多 9 个）

- **旧行为**: 连接管理页面用 3 列网格展示所有网络连接配置卡片，上限 9 个。每张卡片显示连接名称、地址（type://host:port）、状态标签、错误信息、操作按钮（编辑/删除/连接/断开）。已连接状态下禁用删除按钮。
- **代码位置**: `src/components/connect/ConnectionContentPanel.vue:156-178`
- **新系统对应 feature**: connection feature UI
- **Oracle 来源**: 组件模板，证据充分
- **建议**: **保留**。9 连接上限和卡片布局是具体 UI 行为。

### 行为 4: 连接状态实时事件驱动更新

- **旧行为**: 连接状态通过事件驱动实时更新。`networkAPI.onConnectionEvent` 监听 `connected`/`disconnected`/`error` 三种事件类型，直接修改对应连接的 `isConnected`、`status`、`error` 属性。
- **代码位置**: `src/stores/netWorkStore.ts:222-249`
- **新系统对应 feature**: connection feature 状态层
- **Oracle 来源**: store 逻辑，证据充分
- **建议**: **保留**。事件驱动状态更新是核心行为模式。

### 行为 5: 网络连接统计（按连接）

- **旧行为**: 每个网络连接维护独立的统计信息：`bytesReceived`、`bytesSent`、`messagesReceived`、`messagesSent`、`lastActivity`、`connectionTime`、`error`。通过 `networkAPI.onStatusChange` 实时更新。
- **代码位置**: `src/types/serial/network.ts:53-62` — `NetworkStatus` 接口
- **代码位置**: `src/stores/netWorkStore.ts:252-255` — statusChange 监听
- **新系统对应 feature**: connection feature 统计
- **Oracle 来源**: 类型定义 + store，证据充分
- **建议**: **保留**。按连接维度的收发统计是核心可观测行为。

---

## 二、状态指示灯系统

### 行为 6: 用户可配置的状态指示灯

- **旧行为**: 用户可创建多个状态指示灯，每个指示灯绑定一个 receive 数据项（通过 groupId + dataItemId），配置值-颜色映射。指示灯以圆点 + 标签形式展示在顶部 HeaderBar 中。支持全局启用/禁用开关。配置通过 `useStorage` 持久化到 localStorage。
- **代码位置**: `src/stores/statusIndicators.ts:15-239` — 整个 store
- **代码位置**: `src/components/common/StatusIndicators.vue:1-49` — 展示组件
- **代码位置**: `src/components/layout/HeaderBar.vue:13-15` — 嵌入 HeaderBar
- **类型定义**: `src/types/frames/receive.ts:150-169` — `StatusIndicatorConfig`、`StatusIndicatorSettings`、`ValueColorMapping`
- **新系统对应 feature**: receive feature 的指示灯子能力
- **Oracle 来源**: store + 组件 + 类型定义，证据充分
- **建议**: **保留**。用户可配置的状态指示灯是核心展示能力，绑定 receive 数据项的值变化到视觉反馈。

### 行为 7: 指示灯值匹配逻辑（精确值 + 数值范围）

- **旧行为**: 指示灯支持两种值匹配方式：(1) 精确值匹配 — 字符串相等比较；(2) 数值范围匹配 — 支持 "min-max" 格式（如 "10-20"），自动解析为范围。匹配成功时使用映射颜色，无匹配时使用默认颜色。数据项不存在或值为 null/undefined 时，指示灯不激活。
- **代码位置**: `src/stores/statusIndicators.ts:40-88` — parseValueType / isValueMatch / getIndicatorStatus
- **新系统对应 feature**: receive feature 的指示灯匹配逻辑
- **Oracle 来源**: store 方法，证据充分
- **建议**: **保留**。精确值 + 范围匹配是核心匹配行为。

### 行为 8: 指示灯定时刷新（1 秒间隔）

- **旧行为**: 指示灯通过 1 秒间隔的 `setInterval` 定时刷新。每次刷新先做快照对比（hasDataChanged），仅在数据变化时才触发计算属性更新。这是性能优化手段，避免每秒都重算。
- **代码位置**: `src/stores/statusIndicators.ts:91-128` — hasDataChanged / startAutoUpdate
- **新系统对应 feature**: receive feature 的指示灯更新机制
- **Oracle 来源**: store 方法，证据充分
- **建议**: **保留**。1 秒轮询 + 快照对比是具体行为模式，新系统可以用响应式替代，但"数据变化才更新"的语义应保留。

### 行为 9: 指示灯配置对话框

- **旧行为**: 提供完整的配置对话框，支持：添加/删除指示灯、选择关联数据项（从所有 receive 数据分组和数据项中选择）、设置默认颜色、配置值-颜色映射（支持 color picker）、如果数据项有 labelOptions 则自动使用下拉选择替代自由输入。保存时清空现有配置后批量写入。
- **代码位置**: `src/components/common/StatusIndicatorConfigDialog.vue:1-291`
- **新系统对应 feature**: receive feature 的指示灯配置 UI
- **Oracle 来源**: 组件代码，证据充分
- **建议**: **保留**。完整的配置 CRUD 行为。

### 行为 10: 指示灯 Tooltip 显示详情

- **旧行为**: 鼠标悬停指示灯时显示 tooltip，格式为 `{label}: 激活 ({value})` 或 `{label}: 未激活 ({value})` 或 `{label}: 数据项不存在`。
- **代码位置**: `src/components/common/StatusIndicators.vue:7` — title 绑定
- **代码位置**: `src/components/common/StatusIndicators.vue:35-44` — getIndicatorStatusText
- **新系统对应 feature**: receive feature 的指示灯展示
- **Oracle 来源**: 组件代码，证据充分
- **建议**: **保留**。Tooltip 悬停详情是用户交互细节。

---

## 三、健康检查

### 行为 11: SCOE 健康自检指令

- **旧行为**: SCOE 系统支持"健康自检"指令，检查三个条件：(1) 已加载卫星ID（`loadedSatelliteId` 非空）；(2) SCOE 帧已加载（`scoeFramesLoaded` 为 true）；(3) 连接目标路径有效（`network:scoe-udp:scoe-udp-remote` 存在）。三者全部满足则状态为 `healthy`，否则为 `error`。结果写入 `scoeStore.status.healthStatus`。
- **代码位置**: `src/composables/scoe/commands/healthCheck.ts:1-43` — executeHealthCheck
- **状态枚举**: `src/types/scoe/index.ts:75` — `healthStatus: 'unknown' | 'healthy' | 'error'`
- **新系统对应 feature**: 指令接入 / SCOE 子系统
- **Oracle 来源**: 命令执行器 + 类型定义，证据充分
- **建议**: **保留**。健康自检是 SCOE 的核心运维行为。注意当前实现是 TODO 级别，逻辑较简陋。

### 行为 12: SCOE 链路自检指令

- **旧行为**: SCOE 系统支持"链路自检"指令，遍历所有 receive 数据分组和数据项，检查三个特定标签的数据项：(1) "载波同步锁定"值是否为 1；(2) "定时同步锁定"值是否为 1；(3) "帧同步锁定"值是否为 1。全部为 1 则 `pass`，否则 `fail`。结果写入 `scoeStore.status.linkTestResult`。
- **代码位置**: `src/composables/scoe/commands/linkCheck.ts:14-46` — executeLinkCheck
- **状态枚举**: `src/types/scoe/index.ts:76` — `linkTestResult: 'unknown' | 'pass' | 'fail'`
- **新系统对应 feature**: 指令接入 / SCOE 子系统
- **Oracle 来源**: 命令执行器，证据充分
- **建议**: **保留，但实现方式需改进**。当前通过硬编码数据项标签名匹配是脆弱的。新系统应使用更可靠的标识机制（如数据项 ID），但"检查载波/定时/帧三个锁定状态"的业务语义必须保留。

### 行为 13: SCOE 状态面板展示

- **旧行为**: SCOE 有独立的状态面板，展示 10 个状态项：
  1. 软件启动累计秒（格式化为 Xh Xm Xs）
  2. 当前卫星ID加载累计秒
  3. 指令接收总计数（toLocaleString 格式化）
  4. 指令执行成功总计数
  5. 指令执行出错计数
  6. 最近一条指令功能码
  7. 指令执行出错原因（ScoeErrorReason 枚举值）
  8. 已加载配置的卫星ID
  9. 健康状态（healthy=绿色"正常"/unknown=灰色"未自检"/error=红色"异常"）
  10. 链路自检结果（pass=绿色"通过"/fail=红色"失败"/unknown=灰色"未自检"）
- **代码位置**: `src/components/scoe/StatusPanel.vue:1-185`
- **新系统对应 feature**: 指令接入 / SCOE 状态展示
- **Oracle 来源**: 组件代码，证据充分
- **建议**: **保留**。10 项 SCOE 运维指标是完整的状态面板行为。

### 行为 14: SCOE 状态数据结构

- **旧行为**: SCOE 状态由 `ScoeStatus` 接口定义，包含：runtimeSeconds、satelliteIdRuntimeSeconds、commandReceiveCount、commandSuccessCount、lastCommandCode、commandErrorCount、lastErrorReason、loadedSatelliteId、healthStatus、linkTestResult、scoeFramesLoaded、receiveCommandSuccess。初始值中 healthStatus 和 linkTestResult 都是 `unknown`。
- **代码位置**: `src/types/scoe/index.ts:57-82` — ScoeStatus 接口
- **代码位置**: `src/types/scoe/index.ts:161-174` — defaultScoeStatus 默认值
- **新系统对应 feature**: 指令接入 / SCOE 状态模型
- **Oracle 来源**: 类型定义，证据充分
- **建议**: **保留**。ScoeStatus 是 SCOE 子系统的完整状态模型。

### 行为 15: SCOE 错误原因枚举

- **旧行为**: SCOE 定义了 6 种错误原因枚举：NONE（无错误）、SATELLITE_ID_NOT_FOUND、SATELLITE_CONFIG_INCOMPLETE、SATELLITE_ID_LOADING、COMMAND_CODE_NOT_FOUND、CHECKSUM_ERROR、COMPLETION_CONDITION_TIMEOUT。初始值为 `ScoeErrorReason.NONE`。
- **代码位置**: `src/types/scoe/receiveCommand.ts:113-121` — ScoeErrorReason 枚举
- **新系统对应 feature**: 指令接入 / SCOE 错误模型
- **Oracle 来源**: 类型定义，证据充分
- **建议**: **保留**。SCOE 错误原因枚举是运维可观测行为。

---

## 四、全局统计系统

### 行为 16: 全局统计分类和字段

- **旧行为**: 全局统计分四类：
  - **系统统计**：year/month/day/hour/minute/second/millisecond/allSeconds/startTime/uptime/latitude/longitude。其中 uptime 从 startTime 起每秒递增。
  - **通信统计**：sentPackets、receivedPackets、sentBytes、receivedBytes（均为累计计数器）。
  - **帧匹配统计**：matchedFrames、unmatchedFrames（均为累计计数器）。
  - **错误统计**：communicationErrors、frameParseErrors（均为累计计数器）。
- **代码位置**: `src/stores/globalStatsStore.ts:17-50` — 四类 ref 定义
- **新系统对应 feature**: 可能为 runtime 层面或独立 stats feature
- **Oracle 来源**: store 定义，证据充分
- **建议**: **保留**。四类统计是新系统运行时的基础可观测能力。

### 行为 17: 统计值暴露给表达式系统

- **旧行为**: 全局统计通过 `availableStats` 计算属性暴露，聚合所有四类统计并计算派生值（totalPackets、totalBytes、totalErrors），由 `getStatValue(statKey)` 方法供表达式引擎按 key 取值。
- **代码位置**: `src/stores/globalStatsStore.ts:55-85` — availableStats computed
- **代码位置**: `src/stores/globalStatsStore.ts:171-173` — getStatValue
- **新系统对应 feature**: shared/ 表达式引擎的统计变量源
- **Oracle 来源**: store 方法，证据充分
- **建议**: **保留**。统计值作为表达式变量源是跨 feature 的关键能力。

### 行为 18: 系统统计每秒更新（含位置信息）

- **旧行为**: 系统统计通过 `timerManager.registerTimer` 以 1000ms 间隔定时更新。每次更新计算 uptime、年月日时分秒毫秒。初始化时还获取一次 GPS 位置信息（经纬度精确到分）。
- **代码位置**: `src/stores/globalStatsStore.ts:88-133` — initialize / updateSystemStats / updateLocationInfo
- **新系统对应 feature**: runtime 层面的定时更新
- **Oracle 来源**: store 方法，证据充分
- **建议**: **保留**。时间统计是基础能力；GPS 位置信息是否保留取决于新系统是否有定位需求。

### 行为 19: 统计重置

- **旧行为**: 全局统计提供 `resetStats()` 方法，将四类统计全部归零。系统统计部分（时间/位置）也归零，startTime 归零。调用后打印 console.log。
- **代码位置**: `src/stores/globalStatsStore.ts:176-210` — resetStats
- **新系统对应 feature**: stats feature 重置能力
- **Oracle 来源**: store 方法，证据充分
- **建议**: **保留**。统计重置是运维操作。

### 行为 20: 通信统计由外部 store 递增

- **旧行为**: 通信统计（sentPackets/receivedPackets/sentBytes/receivedBytes）不自动采集，而是暴露 `incrementSentPackets`、`addSentBytes` 等方法由外部调用方在数据收发时手动递增。
- **代码位置**: `src/stores/globalStatsStore.ts:136-168` — 六个 increment/add 方法
- **新系统对应 feature**: connection / send / receive feature 在数据路径中调用
- **Oracle 来源**: store 方法，证据充分
- **建议**: **保留，但改为自动采集**。新系统的统计应在数据路径中自动采集，而非依赖外部手动调用。

---

## 五、Receive 帧级统计

### 行为 21: 帧级统计信息

- **旧行为**: 每个 receive 帧维护独立统计：`frameId`、`totalReceived`（总接收数）、`lastReceiveTime`（上次接收时间）、`checksumFailures`（校验失败数）、`errorCount`（错误数）、`lastReceivedFrame`（最后接收帧原始数据）。通过 `Map<string, ReceiveFrameStats>` 存储。
- **代码位置**: `src/types/frames/receive.ts:49-56` — ReceiveFrameStats 接口
- **代码位置**: `src/stores/frames/receiveFramesStore.ts:95` — frameStats ref
- **新系统对应 feature**: receive feature 统计
- **Oracle 来源**: 类型 + store，证据充分
- **建议**: **保留**。帧级统计是 receive 的核心可观测行为。

### 行为 22: 帧统计面板展示

- **旧行为**: receive 页面有独立的统计面板，展示：
  - **总体统计**：接收总数（智能格式化 K/M）、错误总数、校验失败数、活跃帧数、错误率（百分比，>5% 显示红色，否则绿色）
  - **当前帧统计**：选中帧的接收次数、错误次数、最后接收时间（相对时间：X 秒前/X 分钟前/X 小时前/X 天前）
  - **记录状态**：是否正在记录数据、运行时间、记录数、开始/停止记录按钮
- **代码位置**: `src/components/frames/receive/FrameStatsPanel.vue:1-227`
- **新系统对应 feature**: receive feature 的统计展示 UI
- **Oracle 来源**: 组件代码，证据充分
- **建议**: **保留**。帧统计面板是 receive 的核心展示能力。

### 行为 23: 帧统计重置（全局 + 单帧）

- **旧行为**: 支持两种重置：
  - **全局重置**：清空所有 frameStats，同时将所有数据项的 value 归 null、displayValue 归空字符串。操作前有 confirm 弹窗。
  - **单帧重置**：仅删除选中帧的统计数据。操作前有 confirm 弹窗。
- **代码位置**: `src/components/frames/receive/FrameStatsPanel.vue:66-84` — resetStats / resetSelectedFrameStats
- **新系统对应 feature**: receive feature 的统计管理
- **Oracle 来源**: 组件方法，证据充分
- **建议**: **保留**。两种粒度的重置是具体用户操作行为。

---

## 六、发送任务状态监视

### 行为 24: 活动任务监视器

- **旧行为**: 有独立的活动任务监视器对话框，展示所有正在执行的发送任务。每个任务显示：任务名称、类型标签（顺序/定时/触发）、状态 badge（7 种状态：idle/running/paused/completed/error/waiting-trigger/waiting-schedule）、进度条和进度百分比、下次执行倒计时（定时任务）、运行时长、错误信息。支持按类型和状态筛选。
- **代码位置**: `src/components/frames/FrameSend/ActiveTasksMonitor.vue:1-418`
- **新系统对应 feature**: task feature 的任务监控 UI
- **Oracle 来源**: 组件代码，证据充分
- **建议**: **保留**。任务监视器是发送任务管理的核心 UI。

### 行为 25: 任务状态颜色映射

- **旧行为**: 7 种任务状态有固定颜色映射：idle=blue-grey, running=blue, paused=orange, completed=positive, error=negative, waiting-trigger=purple, waiting-schedule=indigo。每种状态有对应的中文标签和操作按钮。
- **代码位置**: `src/components/frames/FrameSend/ActiveTasksMonitor.vue:54-73` — taskStatusLabels / taskStatusColors
- **新系统对应 feature**: task feature 的状态展示
- **Oracle 来源**: 组件代码，证据充分
- **建议**: **保留**。状态颜色映射是 UI 视觉一致性的一部分。

---

## 七、网络测试工具

### 行为 26: 网络测试工具中的快速发送预设

- **旧行为**: 网络测试工具内置 5 个快速发送预设：心跳包（FF FF 00 01）、查询状态（FF FF 00 02）、复位命令（FF FF 00 03）、Hello、Test。前三个是 hex 格式，后两个是 text 格式。
- **代码位置**: `src/components/connect/NetworkTestTools.vue:179-184` — quickSendPresets
- **新系统对应 feature**: connection feature 的测试工具
- **Oracle 来源**: 组件代码，证据充分
- **建议**: **排除**。硬编码的预设值是旧系统特定协议实现，新系统不应硬编码。

### 行为 27: 网络测试工具的收发数据展示

- **旧行为**: 测试工具展示收发数据日志，发送数据蓝色（->前缀）、接收数据绿色（<-前缀）、错误红色（warning前缀）。支持 hex/text 格式切换、自动滚动、保存到文件、清空。接收区最大 1000 行。
- **代码位置**: `src/components/connect/NetworkTestTools.vue:124-161` — addReceivedData / clearReceiveArea / saveReceiveData
- **新系统对应 feature**: connection feature 的测试工具
- **Oracle 来源**: 组件代码，证据充分
- **建议**: **保留**。数据收发日志的彩色展示和格式切换是通用测试能力。

---

## 八、汇总

### 按类别统计

| 类别 | 行为数 | 保留 | 排除 |
|------|--------|------|------|
| 连接状态指示 | 5 | 5 | 0 |
| 状态指示灯系统 | 5 | 5 | 0 |
| 健康检查 | 5 | 5 | 0 |
| 全局统计系统 | 5 | 5 | 0 |
| Receive 帧级统计 | 3 | 3 | 0 |
| 发送任务状态监视 | 2 | 2 | 0 |
| 网络测试工具 | 2 | 1 | 1 |
| **合计** | **27** | **26** | **1** |

### 排除项

| 编号 | 行为 | 排除原因 |
|------|------|----------|
| 行为 26 | 快速发送预设（心跳包/查询状态/复位命令） | 硬编码旧协议特定字节序列，新系统不应硬编码 |

### 保留但需改进的实现方式

| 编号 | 行为 | 改进原因 |
|------|------|----------|
| 行为 8 | 指示灯 1 秒轮询刷新 | 新系统应改用响应式数据流，不再需要定时轮询 |
| 行为 12 | 链路自检通过数据项标签名匹配 | 新系统应使用数据项 ID 替代标签名匹配 |
| 行为 18 | GPS 位置信息 | 需确认新系统是否有定位需求 |
| 行为 20 | 通信统计手动递增 | 新系统应在数据路径中自动采集 |

### 新系统 feature 归口映射

| 旧行为类别 | 新系统 feature |
|------------|---------------|
| 连接状态指示（行为 1-5） | connection feature |
| 状态指示灯（行为 6-10） | receive feature 的指示灯子能力 |
| SCOE 健康检查（行为 11-15） | 指令接入 feature |
| 全局统计（行为 16-20） | runtime 层面或独立 stats 能力 |
| 帧级统计（行为 21-23） | receive feature |
| 任务监视（行为 24-25） | task feature |
| 测试工具（行为 27） | connection feature |

## 记录

无额外记录。

## 后续

无。
