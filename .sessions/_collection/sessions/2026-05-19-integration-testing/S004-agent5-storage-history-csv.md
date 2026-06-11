# [S004-Agent5] 旧系统数据存储、历史记录与 CSV 导出可观测行为提取

> 2026-05-19 | 调研 | 完成
> 来源文件：8 个核心文件 + 类型定义 + 辅助工具

## 目标

提取旧系统在数据存储、历史记录管理、CSV 导出、高速存储、全局统计、数据展示方面的全部可观测业务行为，供新系统 receive-real / storage / visualization feature 参考。

---

## 一、历史数据存储行为

### 1.1 存储介质：JSON 文件，按小时分文件

**旧行为**：历史数据存储为 JSON 文件，文件路径 `{userDataPath}/data/history-statistics/{hourKey}.json`，hourKey 格式 `YYYY-MM-DD-HH`（如 `2026-05-19-14`）。支持 gzip 压缩，压缩后为 `.json.gz`。同一小时只保留一个文件（压缩或未压缩二选一）。

- **代码位置**：
  - `src-electron/main/ipc/historyDataHandlers.ts:34-52` — `getHistoryDataDirectory()` 和 `getFilePath()`
  - `src-electron/main/ipc/historyDataHandlers.ts:55-59` — `isCompressed()` 优先检查 .json.gz
- **新系统对应**：storage feature
- **oracle 评估**：代码完整，行为明确
- **建议**：保留。按小时分文件的设计在高频采集场景下合理，新系统可保留此策略或改为 SQLite 但必须保持等价的按小时查询能力

### 1.2 文件结构：HourlyDataFile

**旧行为**：每个小时文件结构为 `HourlyDataFile`：
```ts
{
  metadata: {
    version: '1.0.0',
    hourKey: 'YYYY-MM-DD-HH',
    groups: GroupMetadata[],   // 分组+数据项元数据
    totalDataItems: number,
    createdAt: number,         // 时间戳
    updatedAt: number,
  },
  records: HistoryDataRecord[] // { timestamp, data: unknown[] }
}
```
`records[].data` 是一个扁平数组，所有分组的所有数据项按全局索引顺序存储。

- **代码位置**：
  - `src/types/storage/historyData.ts:8-40` — 类型定义
  - `src/stores/frames/dataDisplayStore.ts:338-352` — `createHistoryDataRecord()` 构建逻辑
- **新系统对应**：storage feature
- **oracle 评估**：代码完整
- **建议**：保留。新系统存储格式可自由选择，但必须能表达相同的分组元数据+时间序列记录语义

### 1.3 增量写入（批量追加）

**旧行为**：支持通过 `appendBatchRecords` 增量追加记录到已有小时文件。如果文件已存在，解析后追加 records；如果不存在，使用传入的 metadata 创建新文件。写入后更新 `updatedAt` 时间戳。

- **代码位置**：`src-electron/main/ipc/historyDataHandlers.ts:102-157`
- **新系统对应**：storage feature 的写入 API
- **oracle 评估**：代码完整
- **建议**：保留增量写入能力，但新系统应考虑写性能优化（批量 append、fsync 策略等）

### 1.4 定期保存触发机制

**旧行为**：
1. **数据收集定时器**：常开模式，默认每 1 秒（`updateInterval: 1000`）执行 `collectCurrentData()`
2. **历史数据保存定时器**：仅在 recording 启用时运行，默认每 5 分钟（`csvSaveInterval` 设置，单位分钟，默认 5）触发 `saveAllHistoryBatches()`
3. **小时边界检测**：`collectCurrentData()` 中检测小时切换，切换时自动保存上一小时数据
4. **停止记录时**：保存所有未保存的批次数据

- **代码位置**：
  - `src/stores/frames/dataDisplayStore.ts:554-553` — `startDataCollection()`
  - `src/stores/frames/dataDisplayStore.ts:596-630` — `startRecordingTimers()`
  - `src/stores/frames/dataDisplayStore.ts:362-374` — 小时边界检测
  - `src/stores/frames/dataDisplayStore.ts:717-732` — `stopRecording()`
- **新系统对应**：receive-real + storage feature 协作
- **oracle 评估**：代码完整
- **建议**：保留。定时收集+定期持久化+小时边界自动切换是核心行为

### 1.5 自动开始记录

**旧行为**：应用启动时，如果 `settingsStore.autoStartRecording` 为 true（默认 true），自动调用 `dataDisplayStore.startRecording()`。

- **代码位置**：`src/layouts/useAppLifecycle.ts:65-68`
- **新系统对应**：app lifecycle + receive feature
- **oracle 评估**：代码完整
- **建议**：保留此设置项和行为

### 1.6 内存中缓存机制

**旧行为**：
1. **循环缓冲区**：`CircularBuffer<DataRecord>`，按 groupId 索引。容量根据活跃图表数动态调整（0 图表=1000，1 图表=5000，2 图表=3000）
2. **historyBatches**：`Map<hourKey, HourlyDataFile>`，用于记录模式下积累未保存数据
3. **延迟清理**：每 10 秒检查一次，根据活跃图表数调整缓冲区容量
4. **时间过期清理**：每小时检查，移除超过 `maxHistoryHours`（默认 24 小时）的旧记录

- **代码位置**：
  - `src/stores/frames/dataDisplayStore.ts:51-115` — `CircularBuffer` 类
  - `src/stores/frames/dataDisplayStore.ts:160-161` — `historyRecordsCache`
  - `src/stores/frames/dataDisplayStore.ts:247-274` — `performDelayedCleanup()`
  - `src/stores/frames/dataDisplayStore.ts:739-763` — `cleanHistoryRecords()`
- **新系统对应**：storage + visualization feature
- **oracle 评估**：代码完整，性能优化策略清晰
- **建议**：保留动态容量调整策略。新系统可优化实现但应保持等价效果

---

## 二、历史数据查询行为

### 2.1 查询可用小时键

**旧行为**：扫描 `{userDataPath}/data/history-statistics/` 目录，列出所有 `.json` 或 `.json.gz` 文件，提取文件名作为 hourKey，去重排序返回。

- **代码位置**：
  - `src-electron/main/ipc/historyDataHandlers.ts:81-99` — `getAvailableHours`
  - `src/stores/historyAnalysis.ts:158-166` — `fetchAvailableHours()`
- **新系统对应**：storage feature 查询 API
- **oracle 评估**：代码完整
- **建议**：保留。用户需要能看到哪些小时有数据

### 2.2 按时间范围批量加载

**旧行为**：给定时间范围，生成所有覆盖的 hourKey 列表，批量加载对应文件，合并 records 并按时间戳排序。返回 `Record<hourKey, HourlyDataFile>` 格式。

- **代码位置**：
  - `src-electron/main/ipc/historyDataHandlers.ts:557-620` — `loadMultipleHours`
  - `src/stores/historyAnalysis.ts:174-230` — `loadHistoryData()`
- **新系统对应**：storage feature 批量查询
- **oracle 评估**：代码完整
- **建议**：保留。批量按小时加载是新系统 history analysis 页面的核心查询模式

### 2.3 历史数据按分组/数据项过滤

**旧行为**：加载后，用户可在左侧面板选择分组和数据项（`DataItemSelection`），`filteredData` 计算属性按时间范围过滤。图表数据 `chartDataSets` 按图表配置过滤到特定 groupId + dataItemId。

- **代码位置**：
  - `src/stores/historyAnalysis.ts:93-107` — `filteredData`
  - `src/stores/historyAnalysis.ts:110-153` — `chartDataSets`
  - `src/stores/historyAnalysis.ts:233-278` — 数据项选择管理方法
- **新系统对应**：visualization feature
- **oracle 评估**：代码完整
- **建议**：保留。按分组/数据项选择和多图表展示是历史数据分析的核心交互

### 2.4 多图表展示

**旧行为**：支持 1-4 个图表并行显示（`MultiChartSettings`），每个图表可独立选择数据项、配置标题和 Y 轴（自动缩放、统计计算）。图表配置通过 `useStorage` 持久化到 localStorage。

- **代码位置**：
  - `src/stores/historyAnalysis.ts:46-55` — `multiChartSettings`
  - `src/stores/historyAnalysis.ts:281-362` — 图表管理方法
  - `src/pages/HistoryAnalysisPage.vue:267-430` — 页面布局
- **新系统对应**：visualization feature
- **oracle 评估**：代码完整
- **建议**：保留。多图表+独立配置是关键用户交互

---

## 三、CSV 导出行为

### 3.1 CSV 导出配置

**旧行为**：CSV 导出通过 `CSVExportDialog` 组件触发，用户可配置：
- **文件名**：自定义或自动生成（格式 `history_data_YYYYMMDD_HHmmss`）
- **时间范围**：使用当前 historyAnalysis store 中的 timeRange
- **选中数据项**：从 `dataItemSelections` 中选择
- **包含表头**：可选，默认包含
- **包含时间戳**：可选，默认包含
- **输出方式**：预设路径（`settings.csvDefaultOutputPath`）或手动选择（系统保存对话框）
- **时间格式选项**：`YYYY-MM-DD HH:mm:ss`、`YYYY/MM/DD HH:mm:ss`、`MM/DD/YYYY HH:mm:ss`、`DD.MM.YYYY HH:mm:ss`、`ISO 8601`、`Unix 时间戳`

- **代码位置**：
  - `src/components/storage/CSVExportDialog.vue:1-401` — 完整对话框
  - `src/types/storage/historyData.ts:115-131` — `CSVExportConfig` 类型
- **新系统对应**：storage feature 导出 + UI 页面
- **oracle 评估**：代码完整，UI 交互完整
- **建议**：保留。CSV 导出是用户关键需求，时间格式选项和预设路径行为应保留

### 3.2 CSV 生成逻辑

**旧行为**：
1. 根据时间范围生成 hourKey 列表
2. 批量加载对应文件（支持压缩文件）
3. 合并、按时间范围过滤、按时间戳排序
4. 生成 CSV：
   - 分隔符：逗号（`,`）
   - 编码：UTF-8
   - 表头格式：`timestamp` 或自定义，数据项表头为 `{groupLabel}_{dataItemLabel}`
   - 时间戳格式：`YYYY-MM-DD HH:MM:SS`（ISO 格式去掉 T 和毫秒 Z）
   - 每行按选中数据项的 metadata index 从 `record.data[]` 取值
   - 空值用空字符串表示
5. 写入文件

- **代码位置**：`src-electron/main/ipc/historyDataHandlers.ts:305-474`
- **新系统对应**：storage feature 导出
- **oracle 评估**：代码完整，格式逻辑清晰
- **建议**：保留。CSV 逗号分隔+UTF-8+表头命名规则+时间戳格式是可观测行为

### 3.3 快捷键 Ctrl+E 导出

**旧行为**：在 HistoryAnalysisPage 按 Ctrl+E 打开导出对话框（前提：有选中数据项）。

- **代码位置**：`src/pages/HistoryAnalysisPage.vue:232-244`
- **新系统对应**：UI 交互
- **oracle 评估**：代码完整
- **建议**：排除。快捷键是 UI 细节，非核心业务行为，新系统自行决定

---

## 四、数据导入/导出行为（配置数据）

### 4.1 JSON 配置数据导入导出

**旧行为**：通过 `DataStorageManager` 和 `dataStorageApi`，支持以下数据类型的 CRUD + 导入导出：
- `framesConfig` — 帧配置模板
- `sendInstances` — 发送实例
- `receiveConfig` — 接收配置
- `scoeSatelliteConfigs` — SCOE 卫星配置
- `scoeFramesSendInstances` — SCOE 发送实例
- `scoeFramesReceiveCommands` — SCOE 接收命令

每个类型统一提供 `list` / `save` / `delete` / `saveAll` / `export` / `import` 六个操作。导出为 JSON 文件，导入也仅支持 JSON。存储路径为 `{userDataPath}/{dirPath}.json`。

- **代码位置**：
  - `src/config/configDefaults.ts:1-17` — `DATA_PATH_MAP`
  - `src-electron/main/ipc/dataStorageHandlers.ts:1-198` — `DataStorageManager` + handler 注册
  - `src/api/common/dataStorageApi.ts:1-90` — renderer 侧 API 封装
  - `src/components/common/ImportExportActions.vue:1-133` — UI 组件
- **新系统对应**：各 feature 的持久化层
- **oracle 评估**：代码完整
- **建议**：保留配置数据的导入导出能力。这是用户迁移和备份配置的需求。但新系统不采用旧的通用 DataStorageManager 模式，各 feature 自行管理持久化

---

## 五、高速存储行为

### 5.1 触发条件

**旧行为**：在 main 进程的网络数据接收处理中，每收到一帧数据都检查高速存储规则：
1. 存储功能必须 enabled
2. 规则必须存在且 enabled
3. 规则的 connectionId 必须匹配当前连接 ID（支持 `network:connId:remoteId` 格式，提取中间的 connId）
4. 帧头必须匹配规则中的任一 headerPattern（十六进制字符串逐字节比较）

**关键行为**：匹配高速存储规则的数据**不会发送到渲染进程**（`return` 跳过 `emitDataEvent`），只有非业务数据才发送到渲染进程。

- **代码位置**：
  - `src-electron/main/ipc/networkHandlers.ts:498-521` — `handleDataReceived()`
  - `src-electron/main/ipc/highSpeedStorageHandlers.ts:77-119` — `shouldStore()` + `matchFrameHeader()`
- **新系统对应**：receive-real + storage（高速存储路径）
- **oracle 评估**：代码完整，行为非常明确
- **建议**：保留。业务数据与遥测数据分流是关键架构决策，新系统必须保持等价行为

### 5.2 存储文件格式

**旧行为**：
- 存储路径：`{userDataPath}/business-data/business_data_{ISO-timestamp}.txt`
- 文件名中的 ISO timestamp 的 `:` 和 `.` 替换为 `-`
- 每帧数据写为一行十六进制大写字符串（`Array.from(data).map(byte => byte.toString(16).padStart(2, '0').toUpperCase()).join('')`）
- 使用 `createWriteStream` 追加写入（flags: 'a'）

- **代码位置**：
  - `src-electron/main/ipc/highSpeedStorageHandlers.ts:142-146` — `generateFilePath()`
  - `src-electron/main/ipc/highSpeedStorageHandlers.ts:248-271` — `storeData()`
- **新系统对应**：storage feature（高速路径）
- **oracle 评估**：代码完整
- **建议**：保留。十六进制每行一帧的格式简单高效，新系统可保持或改为二进制格式但需保持读写能力

### 5.3 文件轮转策略

**旧行为**：
- 默认最大文件大小 100MB（`maxFileSize: 100`）
- 默认启用轮转（`enableRotation: true`）
- 默认保留 5 个轮转文件（`rotationCount: 5`）
- 文件达到大小限制时：关闭当前流 -> 清理旧文件 -> 初始化新流
- 清理旧文件：按修改时间降序排列，保留最新的 N 个，删除其余

- **代码位置**：
  - `src-electron/main/ipc/highSpeedStorageHandlers.ts:180-241` — `checkFileRotation()` + `cleanupOldFiles()`
  - `src/stores/highSpeedStorageStore.ts:22-28` — 默认配置
- **新系统对应**：storage feature
- **oracle 评估**：代码完整
- **建议**：保留。文件轮转是防止磁盘占满的必要机制，100MB/5 文件是合理默认值

### 5.4 高速存储统计

**旧行为**：维护实时统计信息：
- `totalFramesStored` — 总存储帧数
- `totalBytesStored` — 总存储字节数
- `currentFileSize` — 当前文件大小（估算：每帧 `dataSize * 2 + 1` 字节）
- `storageStartTime` / `lastStorageTime` — 开始/最后存储时间
- `frameTypeStats` — 按规则 ID 统计帧数
- `isStorageActive` — 存储是否活跃
- `currentFilePath` — 当前写入文件路径

- **代码位置**：
  - `src-electron/main/ipc/highSpeedStorageHandlers.ts:278-291` — `updateStats()`
  - `src/types/serial/highSpeedStorage.ts:29-38` — `StorageStats` 类型
- **新系统对应**：storage feature 统计
- **oracle 评估**：代码完整
- **建议**：保留。用户需要看到存储状态和统计

### 5.5 高速存储配置持久化

**旧行为**：配置通过 `useStorage('highSpeedStorageConfig', ...)` 持久化到 localStorage。初始化时与 main 进程双向同步（main 有配置则以 main 为准，否则将本地配置同步到 main）。

- **代码位置**：`src/stores/highSpeedStorageStore.ts:22-28` 和 `src/stores/highSpeedStorageStore.ts:245-264`
- **新系统对应**：storage feature 配置管理
- **oracle 评估**：代码完整
- **建议**：保留。但新系统应统一配置持久化策略，不依赖 localStorage

### 5.6 重置统计 = 删除当前文件

**旧行为**：`resetStats()` 不仅重置统计数字，还关闭当前写入流并**删除当前存储文件**。

- **代码位置**：`src-electron/main/ipc/highSpeedStorageHandlers.ts:350-388`
- **新系统对应**：storage feature
- **oracle 评估**：代码完整
- **建议**：保留。重置 = 清空是合理语义

---

## 六、全局统计行为

### 6.1 统计指标

**旧行为**：`globalStatsStore` 维护四类统计：

**系统统计**（每秒更新）：
- `uptime` — 运行时间（秒）
- `year/month/day/hour/minute/second/millisecond` — 当前时间分解
- `allSeconds` — Unix 时间戳（秒）
- `startTime` — 应用启动时间戳

**通信统计**：
- `sentPackets` / `receivedPackets` — 收发包计数
- `sentBytes` / `receivedBytes` — 收发字节数

**帧匹配统计**：
- `matchedFrames` — 匹配成功帧数
- `unmatchedFrames` — 未匹配帧数

**错误统计**：
- `communicationErrors` — 通信错误数
- `frameParseErrors` — 帧解析错误数

- **代码位置**：
  - `src/stores/globalStatsStore.ts:17-84` — 状态定义和计算属性
  - `src/stores/globalStatsStore.ts:136-168` — 增量更新方法
- **新系统对应**：可能归 connection / receive / 各 feature 分别维护
- **oracle 评估**：代码完整
- **建议**：保留。所有统计指标都有观测价值。新系统可拆分到各 feature 但需保持等价的汇总能力

### 6.2 统计更新频率

**旧行为**：系统统计每秒更新一次（`interval: 1000`），通信/帧/错误统计通过 increment 方法实时更新。

- **代码位置**：`src/stores/globalStatsStore.ts:92-99`
- **新系统对应**：各 feature 统计
- **oracle 评估**：代码完整
- **建议**：保留每秒时间更新 + 实时递增的模式

### 6.3 统计供表达式引擎消费

**旧行为**：`availableStats` 计算属性将所有统计汇总为一个扁平对象，`getStatValue(statKey)` 方法供表达式系统按名称获取统计值。

- **代码位置**：`src/stores/globalStatsStore.ts:55-86` 和 `src/stores/globalStatsStore.ts:171-173`
- **新系统对应**：shared/ 表达式引擎 + 各 feature 统计注入
- **oracle 评估**：代码完整
- **建议**：保留。表达式引擎需要访问统计值是新系统的既定需求

### 6.4 统计重置

**旧行为**：`resetStats()` 将所有四类统计归零。

- **代码位置**：`src/stores/globalStatsStore.ts:176-210`
- **新系统对应**：各 feature 统计管理
- **oracle 评估**：代码完整
- **建议**：保留。用户需要重置统计的能力

### 6.5 位置信息

**旧行为**：初始化时调用 `location.fetchLocation()` 获取经纬度，存入 `systemStats.latitude` / `systemStats.longitude`（整数，精确到分）。

- **代码位置**：`src/stores/globalStatsStore.ts:88-106` 和 `src/stores/globalStatsStore.ts:122-133`
- **新系统对应**：待定（可能归 platform facade）
- **oracle 评估**：代码完整
- **建议**：保留位置信息获取能力，但新系统应通过 platform facade 提供

---

## 七、数据展示行为

### 7.1 实时数据表格展示

**旧行为**：两个独立表格（table1 / table2），每个表格可配置：
- 选择一个分组（`selectedGroupId`）
- 三种显示模式：`table`（数值表格）、`chart`（曲线图）、`special`（星座图）
- 图表模式下可选中特定数据项（`chartSelectedItems`）

表格模式下每行显示：编号、标签、displayValue、hexValue、可见性、收藏标记。

- **代码位置**：
  - `src/stores/frames/dataDisplayStore.ts:118-128` — table 配置
  - `src/stores/frames/dataDisplayStore.ts:286-302` — `getTableData()`
- **新系统对应**：visualization feature
- **oracle 评估**：代码完整
- **建议**：保留双表格+三模式的展示能力

### 7.2 星座图模式

**旧行为**：`special` 模式下显示 IQ 星座图：
- 配置：`bitWidth`（位宽，默认 12）、`sampleCount`（采样数，默认 16）、`pointSize`（点大小）
- 数据源：分别配置 I 路和 Q 路的 frameId + fieldId
- 刷新间隔：可配置，默认 1000ms
- 数据处理：从 hex 字符串按 bitWidth 提取数值，支持有符号数
- I 路取前一半采样，Q 路取后一半采样
- 使用定时器定期刷新显示数据（refreshConstellationData -> clear 已累积数据）

- **代码位置**：
  - `src/stores/frames/dataDisplayStore.ts:25-42` — `ConstellationConfig` 类型
  - `src/stores/frames/dataDisplayStore.ts:131-147` — 配置持久化
  - `src/stores/frames/dataDisplayStore.ts:806-906` — 星座图数据管理
- **新系统对应**：visualization feature（星座图子组件）
- **oracle 评估**：代码完整
- **建议**：保留。星座图是卫星通信领域的标准可视化需求

### 7.3 数据收集时机

**旧行为**：`collectCurrentData()` 在以下条件之一满足时才执行实际数据收集：
1. table1 或 table2 处于 chart 模式且选中了分组
2. 正在 recording

否则直接跳过（性能优化）。收集时只处理被用到的分组的被选中数据项。

- **代码位置**：`src/stores/frames/dataDisplayStore.ts:394-403` — 早期退出判断
- **新系统对应**：receive-real 数据分发
- **oracle 评估**：代码完整
- **建议**：保留按需收集的优化策略

### 7.4 hex 转换缓存

**旧行为**：使用 LRU 缓存（最大 1000 条）缓存 hex 转换结果，避免重复计算。缓存满时清理前半部分。

- **代码位置**：`src/stores/frames/dataDisplayStore.ts:168-169` 和 `src/stores/frames/dataDisplayStore.ts:222-244`
- **新系统对应**：shared/ 或 visualization 内部优化
- **oracle 评估**：代码完整
- **建议**：排除。这是性能优化细节，新系统自行决定缓存策略

---

## 八、数据清理行为

### 8.1 历史数据过期清理

**旧行为**：`cleanupOldData(daysToKeep)` 按 hourKey 字符串比较，删除早于 cutoff 日期的文件。支持同时删除 .json 和 .json.gz。

- **代码位置**：`src-electron/main/ipc/historyDataHandlers.ts:512-554`
- **新系统对应**：storage feature
- **oracle 评估**：代码完整
- **建议**：保留。按天保留策略是必要的磁盘管理功能

### 8.2 删除特定小时数据

**旧行为**：`deleteHourData(hourKey)` 可删除指定小时的文件（同时删 .json 和 .json.gz）。

- **代码位置**：`src-electron/main/ipc/historyDataHandlers.ts:477-509`
- **新系统对应**：storage feature
- **oracle 评估**：代码完整
- **建议**：保留。用户需要手动删除特定小时数据的能力

### 8.3 压缩小时数据

**旧行为**：`compressHourData(hourKey)` 将未压缩的 .json 文件 gzip 压缩为 .json.gz，然后删除原文件。

- **代码位置**：`src-electron/main/ipc/historyDataHandlers.ts:160-192`
- **新系统对应**：storage feature
- **oracle 评估**：代码完整
- **建议**：保留。自动压缩旧数据节省磁盘空间

### 8.4 内存循环缓冲区容量动态调整

**旧行为**：根据活跃图表数（0/1/2）动态设置循环缓冲区容量（1000/5000/3000），每 10 秒检查一次。

- **代码位置**：`src/stores/frames/dataDisplayStore.ts:247-274`
- **新系统对应**：visualization 或 storage
- **oracle 评估**：代码完整
- **建议**：保留动态调整语义，具体数值新系统可调

---

## 九、存储统计查询

### 9.1 历史数据存储统计

**旧行为**：`getStorageStats()` 返回：
- `totalFiles` — 总文件数
- `totalSize` — 总大小（字节）
- `totalRecords` — 总记录数（简化处理，代码中注释说明实际需遍历所有文件）
- `dateRange` — 最早/最新日期
- `compressionRatio` — 压缩比

- **代码位置**：`src-electron/main/ipc/historyDataHandlers.ts:241-302`
- **新系统对应**：storage feature
- **oracle 评估**：代码完整，totalRecords 为已知简化
- **建议**：保留。存储统计是用户管理磁盘空间的依据

---

## 十、汇总：新系统各 feature 需保留的核心行为清单

| 编号 | 行为 | 旧代码位置 | 新系统归属 | 保留/排除 |
|------|------|-----------|-----------|----------|
| H-01 | JSON 文件按小时存储历史数据 | historyDataHandlers.ts:34-52 | storage | 保留 |
| H-02 | HourlyDataFile 结构（分组元数据+时间序列） | types/storage/historyData.ts:8-40 | storage | 保留 |
| H-03 | 增量追加记录到小时文件 | historyDataHandlers.ts:102-157 | storage | 保留 |
| H-04 | 定时收集（1s）+ 定期持久化（5min）+ 小时边界切换 | dataDisplayStore.ts:554-630 | receive + storage | 保留 |
| H-05 | 自动开始记录（可配置） | useAppLifecycle.ts:65-68 | app lifecycle | 保留 |
| H-06 | 循环缓冲区 + 动态容量 + 时间过期清理 | dataDisplayStore.ts:51-274 | storage/visualization | 保留 |
| H-07 | 查询可用小时键 + 按时间范围批量加载 | historyDataHandlers.ts:81-620 | storage | 保留 |
| H-08 | 历史数据按分组/数据项过滤 + 多图表展示 | historyAnalysis.ts:93-362 | visualization | 保留 |
| C-01 | CSV 导出（文件名/时间范围/数据项选择/表头/时间戳/预设路径） | CSVExportDialog.vue + historyDataHandlers.ts:305-474 | storage + UI | 保留 |
| C-02 | CSV 格式：逗号分隔、UTF-8、{group}_{item} 表头、ISO 时间戳 | historyDataHandlers.ts:403-456 | storage | 保留 |
| D-01 | JSON 配置导入导出（帧/发送/接收/SCOE） | dataStorageHandlers.ts + dataStorageApi.ts | 各 feature 持久化 | 保留 |
| S-01 | 高速存储：帧头匹配 + 连接 ID 匹配触发 | networkHandlers.ts:498-521 | receive + storage | 保留 |
| S-02 | 匹配高速存储规则的数据不发送到渲染进程 | networkHandlers.ts:515-517 | receive | 保留（关键） |
| S-03 | 高速存储文件格式：每帧一行十六进制大写 | highSpeedStorageHandlers.ts:248-271 | storage | 保留 |
| S-04 | 文件轮转：100MB 上限 + 保留 5 个 + 按时间排序清理 | highSpeedStorageHandlers.ts:180-241 | storage | 保留 |
| S-05 | 高速存储统计（帧数/字节数/文件大小/活跃状态） | highSpeedStorageHandlers.ts:278-291 | storage | 保留 |
| S-06 | 重置统计 = 删除当前文件 | highSpeedStorageHandlers.ts:350-388 | storage | 保留 |
| G-01 | 全局统计：时间/通信/帧匹配/错误四类 | globalStatsStore.ts:17-84 | 各 feature | 保留 |
| G-02 | 统计每秒更新 + 实时递增 | globalStatsStore.ts:92-168 | 各 feature | 保留 |
| G-03 | 统计供表达式引擎消费 | globalStatsStore.ts:55-86, 171-173 | shared/ 表达式 | 保留 |
| G-04 | 位置信息获取 | globalStatsStore.ts:122-133 | platform facade | 保留 |
| V-01 | 双表格+三模式（table/chart/constellation） | dataDisplayStore.ts:118-302 | visualization | 保留 |
| V-02 | 星座图（IQ 数据源配置 + 按位宽提取 + 定时刷新） | dataDisplayStore.ts:806-906 | visualization | 保留 |
| CL-01 | 过期数据清理（按天保留） | historyDataHandlers.ts:512-554 | storage | 保留 |
| CL-02 | 删除指定小时数据 | historyDataHandlers.ts:477-509 | storage | 保留 |
| CL-03 | 压缩旧数据文件（gzip） | historyDataHandlers.ts:160-192 | storage | 保留 |
| -- | Ctrl+E 快捷键导出 | HistoryAnalysisPage.vue:232-244 | UI | 排除 |
| -- | hex 转换 LRU 缓存 | dataDisplayStore.ts:168-244 | 内部优化 | 排除 |

---

## 后续

无。本文档已完成全部 8 个核心文件的事实提取，所有行为已标注代码位置、新系统对应归属和保留/排除建议。
