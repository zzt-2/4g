# [S002] 系统设置页 — Wave 1 事实收集 + Wave 2 设计 + Wave 3 自检

> 2026-05-24 | 设计 | 进行中

## 目标

对话 A 执行：9 agent 事实收集 → 设计 → 3 agent 自检 → 准备实施

## 记录

### Wave 1 事实收集（9 agent，3 批）

#### A1 — Settings types+defaults

- 7 字段 / 3 scope（recording 3 + storage 3 + general 1）
- 完整类型/验证/normalize/service/selector 体系
- SettingsPatch 支持深度合并 + 旧格式向后兼容
- 目录：core/(types,defaults,clone,normalize,validation) + state/ + selectors/ + services/ + fixtures/

#### A2 — Settings service+state+selectors

- 3 个修改操作：replace(全量) / update(patch) / reset(按 scope)
- 9 个 selector（selectSettingsSnapshot, selectRecordingSettings, selectAutoStartRecording, selectCsvExportPreference, selectStorageSettings, selectGeneralSettings, selectUpdateInterval, selectMaxHistoryHours, isAutoSaveEnabled）
- SettingsStateContainer：snapshot 单一状态源
- Public API 导出 16 个类型 + 11 个函数

#### A3 — 旧系统 settings store

- 17 个主配置项分布在 8 个 store，实际约 50+ 配置字段
- settingsStore(3): autoStartRecording, csvDefaultOutputPath, csvSaveInterval
- serialStore(3): lastUsedPort, portSerialOptions(按端口), defaultSerialOptions
- dataDisplayStore(4): table1Config, table2Config, table1ScatterConfig, table2ScatterConfig
- highSpeedStorageStore(1): highSpeedStorageConfig
- scoeStore(3): globalConfig(15子字段), satelliteConfigs, selectedConfigId
- statusIndicators(1): statusIndicatorSettings
- historyAnalysisStore(1): multiChartSettings
- sendFrameInstancesStore(1): multiFrameStrategyConfig
- 持久化方式：localStorage(useStorage) + 文件(dataStorageAPI)

#### A4 — Connection 配置 API

- SerialTransportConfig 只有 portPath + baudRate（继承 BaseTransportConfig 的 id/kind/label/autoConnect）
- **缺 7 个串口字段**：dataBits, stopBits, parity, flowControl, bufferSize, timeout, autoOpen
- Connection service 无独立 delete config 方法（upsertConfig 做 create/update）
- 持久化已接入 FeaturePersistence.saveConnections → {dataDir}/state/connections.json
- 无独立 selectors/ 目录，投影内联在 service 工厂函数

#### A5 — Display+Status 配置 API

- Display preferences 完整：table1/table2(TableDisplayPreference) + chart(ChartDisplayPreference) + scatter(ScatterDisplayPreference) + refreshCadenceMs
- 旧系统 4 项配置（table1Config/table2Config/星座图）在新系统有完整对应
- 缺失：yAxisConfig、pointSize
- Status indicator config 完整：IndicatorConfig(id/label/groupId/dataItemId/enabled + warningThreshold/errorThreshold/rangeMin/rangeMax)
- 旧系统 valueMappings → 新系统阈值机制（重新设计，非缺漏）
- **两个 feature 都没有持久化**

#### A6 — Command-ingress SCOE 配置

- 类型+验证完整：ScoeGlobalConfig(14字段) + SatelliteConfig + ScoeCommandConfig
- 新系统新增 udpTargetId 字段
- 缺失：highlightConfigs（旧系统有）
- **持久化是 TODO 占位**：use-scoe-config.ts 的 loadConfigs/saveConfigs 为空实现
- 无 selectors/ 目录，状态读通过 StateReader 接口

#### A7 — 持久化机制

- FeaturePersistence 接口：load / saveFrames / saveConnections / saveSettings / saveAll
- 仅 3 个 feature 持久化：frame、connection、settings
- **启动只恢复 frames**，connections 和 settings 虽有保存方法但未在启动时恢复
- LazyPersistence 模式：同步创建 → 异步 setDelegate → 启动无阻塞
- 未持久化的 feature：storage-local-baseline、receive、display、send、task、command-ingress、bridge

#### A8 — 集测行为基线（21 项）

- 已覆盖 8 项(38%)：#1自动记录、#2CSV路径、#3CSV间隔、#4更新间隔、#5历史小时数、#6自动保存、#7历史存储、#18帧定义
- 部分覆盖 9 项(43%)：#8串口独立配置(缺7字段)、#11双表格(缺yAxisConfig)、#12星座图(缺pointSize)、#13多图表(缺多实例)、#14状态指示灯(阈值替代值映射)、#15高速存储(三层全缺)、#16 SCOE全局(缺highlightConfigs)、#17 SCOE卫星(结构差异)
- 未覆盖 3 项(14%)：#10上次串口记忆、#20发送策略默认值、#21多帧策略持久化
- 无法判断 1 项(5%)：#19帧字段默认配置

#### A9 — UI 规范速查

- Mode C：单列居中，max-width 1120px，p-page class
- 表单：QForm + Quasar 组件，QInput :rules 做简单校验，复杂校验走 service
- 提交防重：QBtn :loading/:disable
- 删除操作：$q.dialog() 二次确认
- 状态声明顺序 O1：service → 业务数据 → 筛选 → UI → 派生 → 操作
- 必用 composable：useAsyncAction / usePolling / useNotify
- 组件超 300 行必须拆分
- 高频违规：catch {}、inline style token、硬编码 px、index key、any 类型

### Wave 2 设计

#### 页面结构

Mode C 布局（单列居中 max-width 1120px），QExpansionItem 可折叠分组。

| 分组 | 配置来源 | 本对话实施 |
|------|---------|-----------|
| 应用 Application | settings feature 7 项 | 完整实施 |
| 连接 Connection | connection feature 串口默认参数 | 完整实施 |
| 显示 Display | display feature | 预留占位 |
| 状态指示 Status | status feature | 预留占位 |
| 高级 Advanced | SCOE/存储/策略 | 预留占位 |

#### Feature 扩展

1. **SerialTransportConfig 扩展**：添加 dataBits(5|6|7|8)/stopBits(1|1.5|2)/parity(none|even|odd|mark|space)/flowControl(none|hardware|software) 4 个可选字段
2. **不扩展 SettingsSnapshot**：各 feature 配置归各 feature 自己持久化（R7）

#### 消费模式

- 页面按 feature 拆子组件：ApplicationSettings.vue / ConnectionSettings.vue / DisplaySettings.vue(占位) / StatusSettings.vue(占位) / AdvancedSettings.vue(占位)
- 各子组件通过 runtime.features.xxxService 直接调用
- dirty tracking 在 composable 层
- 持久化各 feature 各自 save

#### 不做清单

- 不把 connection/display/status 配置搬进 settings feature（违反 R7）
- 不等对话 B/D 完成才做设置页
- 不做高速存储配置页面（等对话 D）
- 不补 SCOE 持久化（等 command-ingress 自行解决）

### Wave 3 自检（3 agent）

#### SC1 — 规范合规（6/9 通过，70%）

- PASS: Mode C 布局、QToggle/QInput 组件、useAsyncAction、状态声明顺序 O1
- FAIL(HIGH): 未明确用 QExpansionItem 做分组容器 → 已修正
- FAIL(HIGH): 超 20 字段未拆子组件 → 已修正（按 feature 拆 5 个子组件）
- PARTIAL: 文件路径选择器需用 platform facade showOpenDialog

#### SC2 — 质量规则（5/5 通过）

- R2 PASS: 设置页跨 feature 调用通过 public API
- R4 PASS: dirty tracking 在 composable，validation/save 在 service
- R7 PASS: 串口参数归 connection，各 feature 各自持久化
- R14 PASS: 通过 runtime.wiring 显式注入
- R5/R6 PASS: 串口扩展不涉边界，platform facade 已有收口

#### SC3 — 覆盖度检查

- #1-#7 Application 组：完整覆盖
- #8-#9 Connection 组：需扩展 SerialTransportConfig（本对话实施）
- #10 上次串口记忆：out-of-scope（运行时状态）
- #11-#14 显示/状态：deferred（后续对话）
- #15-#17 高速存储/SCOE：deferred（独立 feature 设计）
- #18 帧定义：已有独立页面
- #19-#21 常量/策略：out-of-scope

## 后续

- 落日志后走 CodeStable cs-feat 流程：design → impl → accept
- 串口扩展 + 设置页实现
- 更新 topic-index
