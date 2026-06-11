# [S004-agent8] 旧系统设置与配置管理行为调研

> 2026-05-19 | 调研 | 完成

## 目标

调研旧系统的设置和配置管理行为，提取所有必须保留的可观测业务行为。只做事实提取，不做设计或实施。

## 记录

### 一、旧系统配置项完整清单

旧系统的配置分散在多个 store 和组件中，使用 `@vueuse/core` 的 `useStorage` 绑定 localStorage 做持久化，或通过 `dataStorageAPI` 持久化到文件。没有统一的设置页面或集中式配置管理。

#### 1.1 应用级配置（settingsStore）

**文件**: `src/stores/settingsStore.ts`

| 配置项 | 类型 | 默认值 | 存储键 | 说明 |
|--------|------|--------|--------|------|
| autoStartRecording | boolean | true | `settings.autoStartRecording` | 自动开始记录 |
| csvDefaultOutputPath | string | '' | `settings.csvDefaultOutputPath` | CSV 导出默认路径 |
| csvSaveInterval | number | 5（分钟） | `settings.csvSaveInterval` | CSV 保存间隔 |

- 持久化方式：`useStorage` -> localStorage，实时写入
- 无主题、语言、窗口布局等应用外观配置
- 无配置重置/恢复功能

#### 1.2 串口配置（serialStore）

**文件**: `src/stores/serialStore.ts`

| 配置项 | 类型 | 默认值 | 存储键 | 说明 |
|--------|------|--------|--------|------|
| lastUsedPort | string | '' | `last-used-port` | 上次使用的串口路径（用于默认选择） |
| portSerialOptions | Record<string, SerialPortOptions> | {} | `serial-options-map` | 每个串口独立的配置映射 |
| defaultSerialOptions | SerialPortOptions | {baudRate:9600, dataBits:8, stopBits:1, parity:'none', flowControl:'none', autoOpen:false} | `default-serial-options` | 全局默认串口配置 |

`SerialPortOptions` 完整字段：
- `baudRate`: 波特率（可选值：110~1000000）
- `dataBits`: 数据位（5/6/7/8）
- `stopBits`: 停止位（1/1.5/2）
- `parity`: 校验位（none/even/odd/mark/space）
- `flowControl`: 流控制（none/hardware/software）
- `bufferSize`: 缓冲区大小
- `autoOpen`: 是否自动打开
- `timeout`: 超时设置(ms)

- 持久化方式：`useStorage` -> localStorage，实时写入
- 每个串口路径有独立配置，连接时读取 `portSerialOptions[portPath]` 或 fallback 到 `defaultSerialOptions`
- 无配置重置功能

#### 1.3 帧过滤器配置（frameFilterStore）

**文件**: `src/stores/frames/frameFilterStore.ts`

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| searchQuery | string | '' | 搜索关键词 |
| filters | FilterOptions | {protocol:'', frameType:'', direction:'', dateRange:undefined} | 过滤条件 |
| sortOrder | string | 'id' | 排序方式（id/name/date/usage） |
| showFilterPanel | boolean | false | 过滤面板是否显示 |

- **不持久化**：使用普通 `ref`，刷新后丢失
- `resetFilters()` 方法可重置为默认值
- FilterOptions 定义在 `src/config/frameDefaults.ts`

#### 1.4 数据显示配置（dataDisplayStore）

**文件**: `src/stores/frames/dataDisplayStore.ts`

| 配置项 | 类型 | 默认值 | 存储键 | 说明 |
|--------|------|--------|--------|------|
| table1Config | TableConfig | {selectedGroupId:null, displayMode:'table', chartSelectedItems:[]} | `table1Config` | 表格1配置 |
| table2Config | TableConfig | {selectedGroupId:null, displayMode:'table', chartSelectedItems:[]} | `table2Config` | 表格2配置 |
| table1ScatterConfig | ConstellationConfig | {bitWidth:12, sampleCount:16, pointSize:3, refreshInterval:1000, iDataSource:{frameId:'',fieldId:''}, qDataSource:{frameId:'',fieldId:''}} | `table1ScatterConfig` | 星座图1配置 |
| table2ScatterConfig | ConstellationConfig | 同上 | `table2ScatterConfig` | 星座图2配置 |
| displaySettings | DisplaySettings | {updateInterval:1000, csvSaveInterval:5*60*1000, maxHistoryHours:24, enableAutoSave:true, enableRecording:false, enableHistoryStorage:true} | 不持久化 | 显示设置（运行时状态） |

`TableConfig` 字段：
- `selectedGroupId`: 选中分组ID
- `displayMode`: 'table' | 'special' | 'chart'
- `chartSelectedItems`: 图表选中数据项ID数组
- `yAxisConfig`: Y轴配置（可选）

`ConstellationConfig` 字段：
- `bitWidth`: 位宽（默认12）
- `sampleCount`: 采样数（默认16）
- `pointSize`: 点大小（默认3）
- `refreshInterval`: 刷新间隔ms（默认1000）
- `iDataSource`/`qDataSource`: I/Q路数据源 {frameId, fieldId}

`DisplaySettings` 字段：
- `updateInterval`: 数据更新间隔ms（默认1000）
- `csvSaveInterval`: CSV保存间隔ms（从 settingsStore.csvSaveInterval 派生）
- `maxHistoryHours`: 最大历史记录小时数（默认24）
- `enableAutoSave`: 自动保存（默认true）
- `enableRecording`: 是否正在记录（默认false，运行时状态）
- `enableHistoryStorage`: 历史数据存储（默认true）

- 持久化方式：tableConfig 和 scatterConfig 通过 `useStorage` -> localStorage 持久化
- displaySettings 不持久化，为运行时状态

#### 1.5 历史分析图表配置（historyAnalysisStore）

**文件**: `src/stores/historyAnalysis.ts`

| 配置项 | 类型 | 默认值 | 存储键 | 说明 |
|--------|------|--------|--------|------|
| multiChartSettings | MultiChartSettings | {chartCount:1, charts:[{id:1,title:'图表1',selectedDataItems:[]}]} | `historyAnalysis_chartSettings` | 多图表布局配置 |

- 持久化方式：`useStorage` -> localStorage
- 图表数量范围 1~4，标题和数据项选择跨会话保留

#### 1.6 状态指示灯配置（statusIndicatorStore）

**文件**: `src/stores/statusIndicators.ts`

| 配置项 | 类型 | 默认值 | 存储键 | 说明 |
|--------|------|--------|--------|------|
| settings | StatusIndicatorSettings | {indicators:[], isEnabled:true} | `statusIndicatorSettings` | 状态指示灯配置 |

`StatusIndicatorSettings` 字段：
- `isEnabled`: 总开关
- `indicators`: StatusIndicatorConfig 数组
  - `id`: 唯一ID
  - `label`: 标签
  - `groupId`: 关联分组ID
  - `dataItemId`: 关联数据项ID
  - `valueMappings`: ValueColorMapping[]（值到颜色映射）
  - `defaultColor`: 默认颜色（'#6b7280'）

- 持久化方式：`useStorage` -> localStorage
- 用户可自定义任意数量的指示灯，每个指示灯可配置值-颜色映射

#### 1.7 高速存储配置（highSpeedStorageStore）

**文件**: `src/stores/highSpeedStorageStore.ts`

| 配置项 | 类型 | 默认值 | 存储键 | 说明 |
|--------|------|--------|--------|------|
| config | StorageConfig | {enabled:false, rule:null, maxFileSize:100, enableRotation:true, rotationCount:5} | `highSpeedStorageConfig` | 高速存储配置 |

`StorageConfig` 字段：
- `enabled`: 是否启用
- `rule`: FrameHeaderRule | null（帧头识别规则）
  - `connectionId`: 关联连接ID
  - `headerPatterns`: 帧头十六进制字符串数组
  - `enabled`: 规则是否启用
- `maxFileSize`: 最大文件大小MB（默认100）
- `enableRotation`: 文件轮转（默认true）
- `rotationCount`: 轮转文件数量（默认5）

- 持久化方式：`useStorage` -> localStorage + 同步到 main 进程
- 初始化时双向同步：优先使用 main 进程配置，否则将本地配置同步到 main

#### 1.8 SCOE 配置（scoeStore）

**文件**: `src/stores/scoeStore.ts`, `src/types/scoe/index.ts`

| 配置项 | 类型 | 持久化 | 说明 |
|--------|------|--------|------|
| globalConfig | ScoeGlobalConfig | 文件（dataStorageAPI） | SCOE 全局配置 |
| satelliteConfigs | ScoeSatelliteConfig[] | 文件（dataStorageAPI） | 卫星配置列表 |

`ScoeGlobalConfig` 字段：
- `scoeIdentifier`: SCOE 标识
- `tcpServerIp`: TCP Server IP（默认'0.0.0.0'）
- `tcpServerPort`: TCP Server 端口（默认8080）
- `tcpServerAutoConnect`: 自动连接（默认false）
- `udpIpAddress`: UDP IP
- `udpPort`: UDP 端口
- 字节偏移量：messageIdentifierOffset, sourceIdentifierOffset, destinationIdentifierOffset, modelIdOffset, satelliteIdOffset, functionCodeOffset
- `successFrameId`: 执行成功帧ID
- `highlightConfigs`: 测试工具高亮配置

`ScoeSatelliteConfig` 字段：
- `id`: 配置ID
- `satelliteId`: 卫星ID
- `sendConfig`: {satelliteIdentifier, messageIdentifier, sourceIdentifier, destinationIdentifier, udpIpAddress, udpPort}
- `receiveConfig`: {satelliteIdentifier, messageIdentifier, sourceIdentifier, destinationIdentifier, modelId, satelliteId, recognitionMessageId, recognitionSourceId, recognitionDestinationId}

- 持久化方式：通过 `dataStorageAPI.scoeSatelliteConfigs.saveAll/load` 写入文件
- 保存时机：每次修改后立即保存（addSatelliteConfig、deleteSatelliteConfig、saveAllConfigs）
- 加载时机：initialize 时从文件加载

#### 1.9 帧模板配置（frameTemplateStore）

**文件**: `src/stores/frames/frameTemplateStore.ts`

- 帧定义列表（Frame[]）通过 `dataStorageAPI.framesConfig` CRUD
- 持久化到文件系统
- 保存时机：每次创建/更新/删除后立即保存
- 加载时机：手动调用 fetchFrames

`Frame` 中的配置性字段：
- `options`: FrameOptions {autoChecksum, bigEndian, includeLengthField}
- `identifierRules`: IdentifierRule[] 帧识别规则
- `isFavorite`: 收藏标记

#### 1.10 多帧发送配置（sendFrameInstancesStore + 组件局部状态）

**文件**: `src/stores/frames/sendFrameInstancesStore.ts`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue`

| 配置项 | 类型 | 默认值 | 存储键 | 说明 |
|--------|------|--------|--------|------|
| multiFrameStrategyConfig | StrategyConfig | {type:'triggered', triggerType:'condition', responseDelay:0} | `multi-frame-strategy-config` | 多帧全局策略 |
| selectedInstances | FrameInstanceInTask[] | [] | `enhanced-sequential-send-instances` | 多帧发送选中的实例列表 |
| variableInterval | number | 1000 | `enhanced-sequential-send-variable-interval` | 可变参数发送间隔 |

#### 1.11 帧字段默认配置常量

**文件**: `src/config/frameDefaults.ts`, `src/utils/frames/defaultConfigs.ts`

这些不是持久化配置，而是代码内嵌的默认值常量：

| 常量 | 默认值 | 说明 |
|------|--------|------|
| DEFAULT_FRAME_OPTIONS | {autoChecksum:true, bigEndian:false, includeLengthField:false} | 新帧默认选项 |
| DEFAULT_FILTER_OPTIONS | {protocol:'', frameType:'', direction:'', dateRange:undefined} | 默认过滤条件 |
| DEFAULT_IDENTIFIER_RULES | {startIndex:0, endIndex:7, operator:'eq', value:'0x00', logicOperator:'and'} | 默认识别规则 |
| DEFAULT_VALID_OPTION | {isChecksum:false, startFieldIndex:'0', endFieldIndex:'0', checksumMethod:'sum8'} | 默认校验设置 |
| FRAMES_PER_PAGE | 20 | 每页帧数 |
| RECENT_FRAMES_LIMIT | 10 | 最近使用帧数上限 |
| createDefaultTimedConfig() | {type:'timed', sendInterval:1000, repeatCount:10, isInfinite:false, startDelay:0} | 定时策略默认值 |
| createDefaultTriggerConfig() | {type:'triggered', triggerType:'condition', responseDelay:0, sourceId:'', triggerFrameId:'', conditions:[...]} | 触发策略默认值 |
| createDefaultExpressionConfig() | {expressions:[{condition:'true', expression:'0'}], variables:[]} | 表达式默认值 |

### 二、配置持久化行为总结

#### 2.1 存储位置

| 机制 | 使用场景 | 位置 |
|------|---------|------|
| `useStorage` (VueUse -> localStorage) | 轻量级用户偏好、表格配置、串口配置等 | 浏览器 localStorage |
| `dataStorageAPI` (IPC -> main -> 文件) | 帧定义、SCOE 卫星配置等大结构数据 | 用户数据目录文件 |

#### 2.2 保存时机

- localStorage（useStorage）：**实时**，每次响应式值变更时自动写入
- 文件存储（dataStorageAPI）：**操作后立即**，每次 CRUD 操作完成后保存
- 无批量保存或退出时保存的机制

#### 2.3 加载时机

- localStorage（useStorage）：**首次访问时**，store 创建时自动从 localStorage 读取
- 文件存储（dataStorageAPI）：**显式调用**，如 `fetchFrames()`、`loadSatelliteConfigs()`

#### 2.4 配置恢复/重置行为

- `frameFilterStore.resetFilters()`: 重置过滤条件为默认值（不持久化的配置）
- `dataDisplayStore`: 无显式重置方法
- `settingsStore`: 无重置方法
- `serialStore`: 无重置方法
- `scoeStore`: 无重置方法（需手动修改配置）
- **结论：旧系统几乎没有配置恢复/重置功能**

### 三、新系统对应关系

#### 3.1 已在新系统中有对应的配置

| 旧配置 | 新系统对应 | 新系统文件 |
|--------|-----------|-----------|
| autoStartRecording | settings.recording.autoStartRecording | `rewrite/src/features/settings/core/types.ts` |
| csvDefaultOutputPath | settings.recording.csvDefaultOutputPath | 同上 |
| csvSaveInterval (分钟) | settings.recording.csvSaveIntervalMinutes | 同上 |
| maxHistoryHours | settings.storage.maxHistoryHours | 同上 |
| enableAutoSave | settings.storage.enableAutoSave | 同上 |
| enableHistoryStorage | settings.storage.enableHistoryStorage | 同上 |
| updateInterval | settings.general.updateInterval | 同上 |

新系统 settings feature 已实现的增强：
- `SettingsSnapshot` 统一数据结构，schema 版本化
- `SettingsService` 提供 replace/update/reset 操作
- `SettingsReader` 只读接口
- 验证和归一化机制（validation.ts, normalize.ts）
- 按 scope 重置（all/recording/storage/general）
- 持久化通过 `FeaturePersistence` 写入 `{dataDir}/state/settings.json`

#### 3.2 在新系统中可能缺失的配置

| 旧配置 | 新系统状态 | 建议 |
|--------|-----------|------|
| 串口配置（per-port options, default options, lastUsedPort） | connection feature 有 TransportConfig，但串口参数配置待确认 | 需检查 connection feature 是否覆盖 |
| 帧过滤器配置（searchQuery, filters, sortOrder） | frame feature 有 filter 相关能力，待确认细节 | 需检查 frame feature filter API |
| 表格显示配置（table1Config, table2Config, displayMode, selectedGroupId） | display feature 存在，待确认 | 需检查 display feature |
| 星座图配置（scatterConfig: bitWidth, sampleCount, 数据源） | display feature 待确认 | 需检查 display feature |
| 历史分析图表配置（multiChartSettings） | 待确认 | 需检查 history/display 相关 |
| 状态指示灯配置（indicators, isEnabled, valueMappings） | 待确认 | 需检查 status feature |
| 高速存储配置（StorageConfig, FrameHeaderRule） | storage-local-baseline feature 存在，待确认 | 需检查 storage feature |
| SCOE 全局配置（globalConfig, satelliteConfigs） | command-ingress feature 存在，待确认 | 需检查 command-ingress |
| 多帧发送策略配置（multiFrameStrategyConfig, selectedInstances） | send feature + task feature 存在，待确认 | 需检查 send/task |
| 帧字段默认配置常量 | shared/ 或 frame/core 待确认 | 需检查常量位置 |

#### 3.3 不再需要的配置

| 旧配置 | 原因 |
|--------|------|
| `showFilterPanel` (frameFilterStore) | UI 展开状态，运行时临时状态，无需持久化 |
| `autoScroll` (serialStore) | UI 滚动行为，运行时临时状态 |
| `enableRecording` (displaySettings) | 运行时状态（是否正在记录），非配置项 |
| 串口消息记录（receivedMessagesMap, sentMessagesMap） | 运行时缓冲区，非配置项 |

### 四、逐条可观测行为清单

#### 4.1 保留 -- 应用设置

1. **自动开始记录开关**
   - 旧行为：应用启动后，如果 autoStartRecording=true，自动开始数据记录
   - 代码位置：`src/stores/settingsStore.ts:10` + `src/stores/frames/dataDisplayStore.ts` 中引用
   - 新系统对应：settings feature `recording.autoStartRecording`
   - oracle 评估：高可靠性（useStorage 直接持久化）
   - 建议：**保留**

2. **CSV 导出路径记忆**
   - 旧行为：记住用户选择的 CSV 默认输出路径
   - 代码位置：`src/stores/settingsStore.ts:13`
   - 新系统对应：settings feature `recording.csvDefaultOutputPath`
   - oracle 评估：高可靠性
   - 建议：**保留**

3. **CSV 保存间隔配置**
   - 旧行为：用户可设置 CSV 保存间隔（默认5分钟），实际值乘以 60*1000 转为毫秒
   - 代码位置：`src/stores/settingsStore.ts:16` + `src/stores/frames/dataDisplayStore.ts:153`
   - 新系统对应：settings feature `recording.csvSaveIntervalMinutes`
   - oracle 评估：高可靠性
   - 建议：**保留**

4. **数据更新间隔**
   - 旧行为：控制数据收集定时器间隔（默认1000ms）
   - 代码位置：`src/stores/frames/dataDisplayStore.ts:150`
   - 新系统对应：settings feature `general.updateInterval`
   - oracle 评估：高可靠性
   - 建议：**保留**

5. **最大历史记录小时数**
   - 旧行为：控制历史数据保留时间（默认24小时）
   - 代码位置：`src/stores/frames/dataDisplayStore.ts:153`
   - 新系统对应：settings feature `storage.maxHistoryHours`
   - oracle 评估：高可靠性
   - 建议：**保留**

6. **自动保存开关**
   - 旧行为：是否启用自动保存
   - 代码位置：`src/stores/frames/dataDisplayStore.ts:154`
   - 新系统对应：settings feature `storage.enableAutoSave`
   - oracle 评估：高可靠性
   - 建议：**保留**

7. **历史数据存储开关**
   - 旧行为：是否启用历史数据存储到文件
   - 代码位置：`src/stores/frames/dataDisplayStore.ts:155`
   - 新系统对应：settings feature `storage.enableHistoryStorage`
   - oracle 评估：高可靠性
   - 建议：**保留**

#### 4.2 保留 -- 串口配置

8. **每个串口独立配置记忆**
   - 旧行为：每个串口路径有独立的波特率、数据位、停止位、校验位、流控配置，记住用户上次设置
   - 代码位置：`src/stores/serialStore.ts:54` (`portSerialOptions`)
   - 新系统对应：待确认 connection feature
   - oracle 评估：高可靠性（localStorage 持久化）
   - 建议：**保留**

9. **全局默认串口配置**
   - 旧行为：新串口使用默认配置 {baudRate:9600, dataBits:8, stopBits:1, parity:'none', flowControl:'none'}
   - 代码位置：`src/stores/serialStore.ts:22-29,57-59`
   - 新系统对应：待确认 connection feature 默认值
   - oracle 评估：高可靠性
   - 建议：**保留**

10. **上次使用的串口记忆**
    - 旧行为：记住上次使用的串口路径，用于默认选择
    - 代码位置：`src/stores/serialStore.ts:52`
    - 新系统对应：待确认 connection feature
    - oracle 评估：中可靠性（依赖 localStorage，串口路径可能因硬件变化失效）
    - 建议：**保留**（作为可选优化，非核心行为）

#### 4.3 保留 -- 数据显示配置

11. **双表格分组选择记忆**
    - 旧行为：两个表格各自记住选中的分组ID、显示模式（表格/图表/星座图）、图表选中项
    - 代码位置：`src/stores/frames/dataDisplayStore.ts:118-128`
    - 新系统对应：待确认 display feature
    - oracle 评估：高可靠性
    - 建议：**保留**

12. **星座图参数配置持久化**
    - 旧行为：记住位宽、采样数、点大小、刷新间隔、I/Q数据源配置
    - 代码位置：`src/stores/frames/dataDisplayStore.ts:131-147`
    - 新系统对应：待确认 display feature
    - oracle 评估：高可靠性
    - 建议：**保留**

13. **历史分析多图表配置**
    - 旧行为：记住图表数量（1~4）、每个图表的标题和选中的数据项
    - 代码位置：`src/stores/historyAnalysis.ts:46-55`
    - 新系统对应：待确认
    - oracle 评估：高可靠性
    - 建议：**保留**

#### 4.4 保留 -- 状态指示灯

14. **状态指示灯配置持久化**
    - 旧行为：记住所有自定义指示灯的配置（标签、关联分组/数据项、值-颜色映射、启用状态）
    - 代码位置：`src/stores/statusIndicators.ts:17-19`
    - 新系统对应：待确认 status feature
    - oracle 评估：高可靠性
    - 建议：**保留**

#### 4.5 保留 -- 高速存储配置

15. **高速存储配置持久化**
    - 旧行为：记住是否启用、识别规则、最大文件大小、轮转设置；初始化时与 main 进程双向同步
    - 代码位置：`src/stores/highSpeedStorageStore.ts:22-28,245-264`
    - 新系统对应：待确认 storage-local-baseline feature
    - oracle 评估：高可靠性（localStorage + main 进程同步）
    - 建议：**保留**

#### 4.6 保留 -- SCOE 配置

16. **SCOE 全局配置持久化**
    - 旧行为：TCP/UDP 连接参数、字节偏移量、自动连接开关等保存到文件
    - 代码位置：`src/stores/scoeStore.ts:117-132`, `src/types/scoe/index.ts:184-203`
    - 新系统对应：待确认 command-ingress feature
    - oracle 评估：高可靠性（文件持久化）
    - 建议：**保留**（作为 command-ingress 配置的一部分）

17. **SCOE 卫星配置列表持久化**
    - 旧行为：支持多卫星配置的 CRUD，每次操作后立即保存
    - 代码位置：`src/stores/scoeStore.ts:82-193`
    - 新系统对应：待确认 command-ingress feature
    - oracle 评估：高可靠性
    - 建议：**保留**

#### 4.7 保留 -- 帧定义与默认配置

18. **帧定义持久化**
    - 旧行为：帧定义列表（含字段、选项、识别规则）保存到文件，支持 CRUD
    - 代码位置：`src/stores/frames/frameTemplateStore.ts:26-145`
    - 新系统对应：frame feature 已实现
    - oracle 评估：高可靠性
    - 建议：**保留**

19. **帧字段默认配置常量**
    - 旧行为：新帧使用默认选项（自动校验和、小端序、无长度字段等）
    - 代码位置：`src/config/frameDefaults.ts:86-91`
    - 新系统对应：待确认 frame/core 默认值
    - oracle 评估：高可靠性（硬编码常量）
    - 建议：**保留默认值**

20. **发送策略默认配置常量**
    - 旧行为：定时发送默认1秒间隔/10次重复；触发发送默认条件触发/无延迟
    - 代码位置：`src/utils/frames/defaultConfigs.ts:23-46`
    - 新系统对应：待确认 send/task feature
    - oracle 评估：高可靠性
    - 建议：**保留默认值**

#### 4.8 保留 -- 多帧发送配置

21. **多帧发送策略和实例序列持久化**
    - 旧行为：记住多帧发送的策略配置、选中的实例列表、可变参数间隔
    - 代码位置：`src/stores/frames/sendFrameInstancesStore.ts:42-46`, `EnhancedSequentialSendDialog.vue:155,182-185`
    - 新系统对应：待确认 send/task feature
    - oracle 评估：中可靠性（localStorage，引用可能因帧实例删除失效）
    - 建议：**保留**（策略配置和间隔设置；实例列表引用需做失效检查）

#### 4.9 排除 -- 不需要保留的行为

22. **帧过滤器 UI 状态**
    - 旧行为：searchQuery、filters、sortOrder、showFilterPanel 不持久化
    - 代码位置：`src/stores/frames/frameFilterStore.ts`
    - 建议：**排除**（旧系统本身就不持久化，运行时临时状态）

23. **串口消息缓冲区**
    - 旧行为：receivedMessagesMap、sentMessagesMap 为运行时缓冲区，限制100条
    - 代码位置：`src/stores/serialStore.ts:62-89`
    - 建议：**排除**（运行时状态）

24. **串口自动滚动**
    - 旧行为：autoScroll 控制接收区是否自动滚动
    - 代码位置：`src/stores/serialStore.ts:95`
    - 建议：**排除**（UI 运行时状态，且旧系统不持久化）

25. **记录运行时状态**
    - 旧行为：recordingStatus（isRecording、startTime、recordCount 等）为运行时状态
    - 代码位置：`src/stores/frames/dataDisplayStore.ts:175-181`
    - 建议：**排除**（运行时状态，非配置项）

### 五、新系统 settings feature 与旧系统差异

| 维度 | 旧系统 | 新系统 |
|------|--------|--------|
| 配置集中度 | 分散在 10+ 个 store | settings feature 统一管理应用级配置 |
| 持久化机制 | localStorage（useStorage）+ 文件（dataStorageAPI） | JSON 文件（{dataDir}/state/settings.json） |
| 数据结构 | 扁平 key-value（localStorage） | 嵌套 SettingsSnapshot（schema 版本化） |
| 校验 | 无 | normalize + validation |
| 重置 | 仅 frameFilter 有 resetFilters() | 按 scope 重置（all/recording/storage/general） |
| 只读保护 | 无 | ReadonlyDeep 类型 |
| 串口配置 | localStorage per-port map | 待确认（connection feature） |
| SCOE/帧/存储 | 独立文件存储 | 各 feature 自行管理持久化 |

新系统 settings feature 目前只覆盖了旧系统 `settingsStore` + `dataDisplayStore.displaySettings` 中的部分配置（7 项）。以下旧配置在新系统中尚未确认有对应：

- 串口配置（per-port / default / lastUsedPort）
- 表格显示配置（table1Config, table2Config, displayMode, selectedGroupId）
- 星座图配置（scatterConfig）
- 历史分析图表配置（multiChartSettings）
- 状态指示灯配置（indicators, isEnabled, valueMappings）
- 高速存储配置（StorageConfig, FrameHeaderRule）
- SCOE 配置（globalConfig, satelliteConfigs）
- 多帧发送策略配置

这些配置可能归入各自 feature 的配置管理，也可能需要 settings feature 统一协调。这属于设计决策，不在本调研范围。

## 后续

无。
