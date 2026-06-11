# [S004] 旧系统 SCOE 命令处理与任务执行可观测行为提取

> 2026-05-19 | 调研 | 进行中

## 目标

调研旧系统的 SCOE 命令处理和任务执行行为，提取所有必须保留的可观测业务行为。只做事实提取，不做设计或实施。

## 记录

### 一、SCOE 命令处理流程

#### 行为 1：SCOE 状态轮询（1 秒定时器）

- **旧行为描述**：SCOE 系统启动后注册一个 1 秒间隔的常开定时器 `SCOE_UPDATE_STATUS`，每秒调用 `updateStatus()`。`updateStatus()` 做三件事：(1) 递增 `runtimeSeconds`；(2) 重置 `receiveCommandSuccess = false`；(3) 若 `scoeFramesLoaded` 为 true 则递增 `satelliteIdRuntimeSeconds`，否则清零所有指令统计。
- **代码位置**：`scoeStore.ts:293-311`（`updateStatus`）、`scoeStore.ts:322-341`（定时器注册）
- **新系统对应 feature**：SCOE 归入"指令接入"feature，状态轮询属 runtim 层
- **oracle 来源评估**：代码实现即 oracle。定时器常开 + 每秒 tick 是明确的可观测行为
- **保留/排除建议**：保留。1 秒状态 tick 是 SCOE 与外部系统交互的节奏基础

#### 行为 2：卫星加载状态管理

- **旧行为描述**：每秒 `updateStatus()` 中调用 `checkSatelliteLoad()`。若 `scoeFramesLoaded = true` 且 UDP 未连接，则自动建立 UDP 连接（连接参数来自 `globalConfig.udpIpAddress/udpPort` + `selectedConfig.sendConfig.udpIpAddress/udpPort` 作为 remoteHosts）。若 `scoeFramesLoaded = false` 且 UDP 已连接，则断开 UDP 并清空 `loadedSatelliteId`。
- **代码位置**：`scoeStore.ts:216-247`（`checkSatelliteLoad`）
- **新系统对应 feature**：指令接入 feature 的连接生命周期
- **oracle 来源评估**：代码即 oracle。UDP 连接与卫星加载状态耦合是关键行为
- **保留/排除建议**：保留。SCOE 帧加载/卸载与 UDP 连接的联动是核心业务行为

#### 行为 3：每秒自动发送所有 SCOE 帧

- **旧行为描述**：每秒 `updateStatus()` 中调用 `sendScoeFrames()`。若 UDP 已连接，遍历 `scoeFrameInstancesStore.sendInstances` 中的所有帧实例，逐个通过 `sendFrameInstance('network:scoe-udp:scoe-udp-remote', instance)` 发送。发送结果失败仅打印警告，不中断后续帧的发送。
- **代码位置**：`scoeStore.ts:278-287`（`sendScoeFrames`）
- **新系统对应 feature**：指令接入 feature 的帧发送
- **oracle 来源评估**：代码即 oracle。每秒轮询式全量发送是 SCOE 协议的核心行为
- **保留/排除建议**：保留。SCOE 协议要求周期性发送帧数据

#### 行为 4：TCP Server 连接管理

- **旧行为描述**：SCOE 可启动一个 TCP Server（`scoe-tcp-server`），IP 和端口从 `globalConfig.tcpServerIp/tcpServerPort` 读取。支持自动连接（`tcpServerAutoConnect`）——初始化时若该选项为 true 则自动调用 `checkTcpConnection()`。TCP 连接是 toggle 语义：未连接时调用则连接，已连接时调用则断开。
- **代码位置**：`scoeStore.ts:252-273`（`checkTcpConnection`）、`scoeStore.ts:319`（自动连接）
- **新系统对应 feature**：指令接入 feature 的连接管理
- **oracle 来源评估**：代码即 oracle
- **保留/排除建议**：保留。TCP Server 是接收外部指令的通道

#### 行为 5：SCOE 接收指令配置模型

- **旧行为描述**：每个 SCOE 接收指令（`ScoeReceiveCommand`）包含以下可配置项：
  - `label`：指令标签（显示名）
  - `code`：功能码（十六进制字符串，如 `"0x1234"`）
  - `function`：指令功能枚举，包括：`LOAD_SATELLITE_ID`、`UNLOAD_SATELLITE_ID`、`HEALTH_CHECK`、`LINK_CHECK`、`SEND_FRAME`、`READ_FILE_AND_SEND`
  - `checksums`：校验和配置数组（每项含 enabled/offset/length/checksumOffset）
  - `params`：参数数组（每项含 id/label/value/type/offset/length/options），参数选项含 `receiveCode`
  - `frameInstances`：关联的发送帧实例数组
  - `completionConditions`：完成条件数组
  - `completionTimeout`：完成条件超时（默认 5000ms）
  - `successFrameId`：执行成功后发送的帧 ID
- **代码位置**：`src/types/scoe/receiveCommand.ts:85-108`（`ScoeReceiveCommand` 接口）
- **新系统对应 feature**：指令接入 feature 的指令定义
- **oracle 来源评估**：类型定义 + 默认工厂函数
- **保留/排除建议**：保留。这六种指令功能是 SCOE 协议的核心能力集

#### 行为 6：SCOE 完成条件匹配模型

- **旧行为描述**：完成条件（`CompletionCondition`）支持两种模式：
  - **固定值匹配**：`useParam=false`，指定 `sourceFrameId/sourceFieldId` + `operator`（EQUAL/NOT_EQUAL/GREATER_THAN/LESS_THAN/GREATER_EQUAL/LESS_EQUAL）+ `targetFixedValue`
  - **参数选项匹配**：`useParam=true`，指定 `targetParamId`，通过 `options` 数组匹配（每项含 `operator` + `matchValue`）
- **代码位置**：`src/types/scoe/receiveCommand.ts:160-180`（`CompletionCondition` 接口）、`scoeFrameInstancesStore.ts:510-570`（CRUD 方法）
- **新系统对应 feature**：指令接入 feature 的条件匹配
- **oracle 来源评估**：类型定义
- **保留/排除建议**：保留。六种比较运算符和固定值/参数选项两种模式构成 SCOE 指令确认的匹配能力

#### 行为 7：SCOE 状态统计

- **旧行为描述**：SCOE 状态（`ScoeStatus`）跟踪以下统计指标：
  - `runtimeSeconds`：软件运行总秒数（每秒 +1）
  - `satelliteIdRuntimeSeconds`：当前卫星 ID 加载累计秒（加载时 +1，卸载时清零）
  - `commandReceiveCount`：指令接收总计数
  - `commandSuccessCount`：指令执行成功总计数
  - `lastCommandCode`：最近一条指令功能码
  - `commandErrorCount`：指令执行出错计数
  - `lastErrorReason`：指令执行出错原因（枚举：无错误/卫星ID不存在/配置不完整/正在加载/指令码不存在/校验和错误/完成条件超时）
  - `loadedSatelliteId`：已加载配置的卫星 ID
  - `healthStatus`：健康状态（unknown/healthy/error）
  - `linkTestResult`：链路自检结果（unknown/pass/fail）
  - `scoeFramesLoaded`：SCOE 帧是否已加载
  - `receiveCommandSuccess`：接收指令执行完成标志（每秒重置为 false）
- **代码位置**：`src/types/scoe/index.ts:57-83`（`ScoeStatus` 接口）、`scoeStore.ts:293-311`（更新逻辑）
- **新系统对应 feature**：指令接入 feature 的状态管理
- **oracle 来源评估**：类型定义 + 更新逻辑
- **保留/排除建议**：保留。这些统计指标是 SCOE 面板显示的核心数据

#### 行为 8：卫星配置管理

- **旧行为描述**：SCOE 支持多卫星配置（`ScoeSatelliteConfig[]`）。每个配置包含发送配置（卫星识别字/信息标识/信源标识/信宿标识/UDP IP/UDP 端口）和接收配置（额外含型号ID/卫星ID/三个识别开关）。配置持久化通过 `dataStorageAPI.scoeSatelliteConfigs.saveAll/list`。全局配置（`ScoeGlobalConfig`）含 TCP Server 参数、UDP 参数、6 个字节偏移量配置（信息标识/信源/信宿/型号ID/卫星ID/功能码）、成功帧 ID 和高亮配置。
- **代码位置**：`scoeStore.ts:82-173`（配置管理）、`src/types/scoe/index.ts:10-131`（类型定义）
- **新系统对应 feature**：指令接入 feature 的配置管理
- **oracle 来源评估**：类型定义 + 持久化 API
- **保留/排除建议**：保留。多卫星配置和字节偏移量配置是 SCOE 协议的必要参数

---

### 二、定时发送流程

#### 行为 9：定时发送配置模型

- **旧行为描述**：定时发送（`TimedStrategyConfig`）配置项：
  - `sendInterval`：发送间隔（毫秒），默认 1000ms
  - `repeatCount`：重复次数，默认 1
  - `isInfinite`：是否无限循环，默认 false
  - 配置持久化到帧实例的 `strategyConfig` 中
  - 配置变更时通过 watch 自动保存到 store
- **代码位置**：`TimedSendDialog.vue:43-47`（本地状态）、`TimedSendDialog.vue:111-124`（`setTimedConfig`）
- **新系统对应 feature**：task feature 的定时发送 step
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。间隔/重复次数/无限循环是定时发送的核心参数

#### 行为 10：定时发送执行流程

- **旧行为描述**：
  1. 用户点击"开始定时发送"
  2. 通过 `useSendTaskManager().createTimedTask()` 创建任务（状态 `idle`）
  3. 通过 `startTask()` 启动任务
  4. `startTimedTask()` 初始化帧实例缓存（deepClone），将状态改为 `running`
  5. 立即执行第一次发送
  6. 若需重复，通过 `timerManager.registerTimer()` 注册 interval 定时器，按 `sendInterval` 间隔重复执行
  7. 每次发送更新进度（`currentCount`、`percentage`）
  8. 达到 `repeatCount` 后自动完成（状态 `completed`），清理缓存和定时器
  9. 无限循环模式只更新 `currentCount` 和 `nextExecutionTime`，不设上限
- **代码位置**：`useSendTaskExecutor.ts:542-656`（`createTimedSender` + `startTimedTask`）
- **新系统对应 feature**：task feature 的 step 执行引擎
- **oracle 来源评估**：代码实现。执行流程完整且可追溯
- **保留/排除建议**：保留。立即发送第一次 + interval 重复 + 自动完成是定时发送的核心行为

#### 行为 11：定时发送的帧实例缓存与参数变化

- **旧行为描述**：
  - 每个任务启动时 deepClone 所有帧实例到缓存（`frameInstanceCaches` Map）
  - 若实例启用参数变化（`enableVariation`），每次发送前按 `currentVariationIndex` 更新缓存实例的字段值
  - 发送使用缓存实例而非原始实例，避免修改原始配置
  - 任务完成后清理缓存
- **代码位置**：`useSendTaskExecutor.ts:54-75`（缓存初始化）、`useSendTaskExecutor.ts:80-101`（参数更新）
- **新系统对应 feature**：task feature 的 step 执行引擎
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。帧实例不可变 + 参数变化是"可变参数发送"能力的基础

#### 行为 12：关闭对话框时的任务继续行为

- **旧行为描述**：定时发送对话框关闭时，若任务仍在运行，弹出确认对话框，用户可选"停止任务并关闭"或"后台运行"。选后台运行则任务继续执行，对话框关闭。
- **代码位置**：`TimedSendDialog.vue:193-220`（关闭逻辑）
- **新系统对应 feature**：task feature 的 UI 交互
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。后台运行任务是用户可感知的 UI 行为

---

### 三、触发发送流程

#### 行为 13：触发发送配置模型（条件触发）

- **旧行为描述**：条件触发（`triggerType='condition'`）配置项：
  - `sourceId`：监听来源（从连接目标列表中选择）
  - `triggerFrameId`：触发帧（从接收帧列表中选择）
  - `conditions`：触发条件数组，每个条件含 `fieldId`（已映射字段）、`condition`（equals/not_equals/greater/less/contains）、`value`（匹配值）、`logicOperator`（and/or）
  - `continueListening`：触发后是否继续监听（默认 true）
  - `responseDelay`：响应延时（毫秒），触发后延时发送
- **代码位置**：`TriggerSendDialog.vue:58-72`（本地状态）、`TriggerSendDialog.vue:171-203`（`setTriggerConfig`）
- **新系统对应 feature**：task feature 的条件触发 step
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。来源+帧+条件+继续监听+延时构成条件触发的完整参数

#### 行为 14：触发发送配置模型（时间触发）

- **旧行为描述**：时间触发（`triggerType='time'`）配置项：
  - `executeTime`：执行时间（ISO 8601 datetime）
  - `isRecurring`：是否重复执行
  - `recurringType`：重复类型（second/minute/hour/daily/weekly/monthly）
  - `recurringInterval`：重复间隔
  - `endTime`：重复结束时间
- **代码位置**：`TriggerSendDialog.vue:68-72`（本地状态）、`TriggerSendDialog.vue:186-195`（时间配置构建）
- **新系统对应 feature**：task feature 的时间触发 step
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。执行时间+重复+6 种重复粒度+结束时间构成时间触发的完整参数

#### 行为 15：条件触发条件评估逻辑

- **旧行为描述**：
  - 空条件数组 = 接收到帧即触发（默认触发）
  - 条件评估支持 AND/OR 逻辑组合（通过 `logicOperator` 字段）
  - 支持短路逻辑：AND 遇 false 或 OR 遇 true 提前结束
  - 单个条件支持 5 种操作符：equals（字符串比较）、not_equals（字符串比较）、greater/less（数值比较）、contains（字符串包含）
  - 条件中的 `fieldId` 通过接收帧映射关系（`receiveFramesStore.mappings`）查找对应的 `dataItem`
  - 评估失败（找不到字段或数据项）时，AND 逻辑返回 false，OR 逻辑继续检查
- **代码位置**：`useSendTaskTriggerListener.ts:100-158`（`evaluateTriggerConditions`）、`useSendTaskTriggerListener.ts:189-218`（`evaluateSingleCondition`）
- **新系统对应 feature**：task feature 的条件匹配，匹配逻辑归 shared/
- **oracle 来源评估**：代码实现。条件评估逻辑完整且边界清晰
- **保留/排除建议**：保留。AND/OR 组合 + 5 种操作符 + 短路逻辑是条件触发的核心判断能力

#### 行为 16：条件触发执行流程

- **旧行为描述**：
  1. 用户点击"开始监听"
  2. 创建 `triggered` 类型任务，状态 `idle`
  3. `startTask()` -> `startTriggeredTask()` 初始化帧实例缓存
  4. 将任务状态改为 `waiting-trigger`
  5. 注册触发监听器（`registerTriggerListener`），记录 sourceId/triggerFrameId/conditions/continueListening/responseDelay
  6. 当接收帧系统收到数据时，调用 `handleFrameReceived(frameId, sourceId, updatedDataItems)`
  7. 遍历活跃监听器，匹配 frameId + sourceId
  8. 匹配成功后评估条件，条件满足则执行
  9. 执行前若 `responseDelay > 0`，先等待延时
  10. 发送帧实例（单实例用 `processInstance`，多实例用 `processMultipleInstances`）
  11. 若 `continueListening = true`，保持 `waiting-trigger` 状态继续监听；否则完成任务
- **代码位置**：`useSendTaskTriggerListener.ts:70-95`（`handleFrameReceived`）、`useSendTaskTriggerListener.ts:223-306`（`executeTriggerTask`）
- **新系统对应 feature**：task feature 的触发执行
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。注册监听 -> 接收帧回调 -> 条件匹配 -> 延时 -> 发送 -> 继续监听是条件触发的完整生命周期

#### 行为 17：时间触发执行流程

- **旧行为描述**：
  1. 创建 `triggered` 类型任务（`triggerType='time'`）
  2. 计算初始执行时间与当前时间的差值
  3. 将任务状态改为 `waiting-schedule`
  4. 注册 setTimeout 定时器，到达执行时间后执行
  5. 执行时状态改为 `running`，发送所有帧实例
  6. 若 `isRecurring = true`，计算下次执行时间，再次进入 `waiting-schedule`
  7. 重复类型支持 6 种：second/minute/hour/daily/weekly/monthly，按 `recurringInterval` 递增
  8. 若设置了 `endTime`，下次执行时间超过 endTime 则完成任务
  9. 一次性执行（`isRecurring = false`）完成后直接 `completed`
- **代码位置**：`useSendTaskExecutor.ts:794-937`（`createScheduledExecutor` + `startTimedTriggeredTask`）
- **新系统对应 feature**：task feature 的时间触发 step
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。等待调度 -> 执行 -> 重复/完成是时间触发的完整生命周期

---

### 四、顺序发送流程（Enhanced Sequential Send）

#### 行为 18：多帧发送策略选择

- **旧行为描述**：多帧发送对话框（`EnhancedSequentialSendDialog`）支持 4 种策略：
  - **immediate**：立即发送，所有帧实例按序发送一次
  - **timed**：定时发送，所有帧实例按序发送，按间隔重复
  - **triggered**：触发发送，所有帧实例按序发送，触发条件满足时执行
  - **variable**：可变参数发送，基于定时发送实现，每轮更新参数值
- **代码位置**：`EnhancedSequentialSendDialog.vue:86`（策略类型定义）、`EnhancedSequentialSendDialog.vue:634-763`（`startSendingTask`）
- **新系统对应 feature**：task feature 的多 step 任务
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。4 种策略覆盖了所有发送场景

#### 行为 19：多帧序列管理

- **旧行为描述**：
  - 用户可从可用帧实例列表中选择实例添加到发送序列
  - 每个序列项包含：帧实例引用、发送目标 ID、实例间延时（默认 1000ms）
  - 支持上移/下移调整顺序
  - 支持移除序列项
  - 序列数据持久化到 `localStorage`（key: `enhanced-sequential-send-instances`）
  - 每个序列项支持独立设置发送目标（可选择不同的连接目标）
- **代码位置**：`EnhancedSequentialSendDialog.vue:280-346`（序列管理方法）
- **新系统对应 feature**：task feature 的 step 配置
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。多帧序列管理是用户直接操作的核心 UI 行为

#### 行为 20：可变参数发送

- **旧行为描述**：
  - 每个序列项可启用参数变化（`enableVariation`）
  - 配置字段变化（`fieldVariations`）：指定字段 ID 和变化值数组
  - 变化值支持手动输入（逗号分隔）和文件导入（.txt/.csv，支持换行/回车/逗号分隔）
  - 执行时验证所有可变字段的值数组长度一致，不一致则报错
  - 重复次数 = 参数数组长度
  - 第 N 轮发送时，使用第 N 个参数值更新帧实例字段
- **代码位置**：`EnhancedSequentialSendDialog.vue:362-502`（可变参数管理）、`EnhancedSequentialSendDialog.vue:702-744`（variable 策略执行）
- **新系统对应 feature**：task feature 的可变参数 step
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。参数变化是测试工具的重要能力

#### 行为 21：任务配置导入/导出

- **旧行为描述**：
  - 多帧发送配置支持导出为 JSON 文件（存储到 `data/frames/taskConfigs`）
  - 导入时验证配置文件格式（`validateTaskConfigFile`）和实例引用有效性（`validateInstanceReferences`）
  - 导入时恢复策略配置和序列数据
- **代码位置**：`EnhancedSequentialSendDialog.vue:534-629`（`handleGetTaskConfigData` + `handleSetTaskConfigData`）
- **新系统对应 feature**：task feature 的持久化
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。配置导入/导出是用户可见的功能入口

---

### 五、SCOE 测试工具（录制/回放）

#### 行为 22：发送/接收数据录制

- **旧行为描述**：
  - 发送数据录制：通过 `addSendData(data)` 添加记录，当 `sendStopped = false` 时录制
  - 接收数据录制：通过 `addReceiveData(data, checksumValid, failedReason)` 添加记录，当 `receiveStopped = false` 时录制
  - 每条记录含：时间戳（精确到毫秒的中文格式）、原始数据（hex 字符串）、校验状态（仅接收）、预计算的高亮段
  - 数据列表按时间倒序排列（新数据在前）
  - 最大记录行数可配置（`maxRecordLines`，默认 30，范围 1-10000）
  - 超出限制时裁剪旧数据
- **代码位置**：`useScoeTestTool.ts:113-178`（`addSendData` + `addReceiveData`）
- **新系统对应 feature**：指令接入 feature 的测试工具
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。数据录制是测试工具的核心能力

#### 行为 23：数据高亮显示

- **旧行为描述**：
  - 支持为发送区和接收区分别配置高亮规则（`HighlightConfigs`）
  - 每条高亮规则含：名称、字节偏移量（offset）、字节长度（length）
  - 高亮颜色循环使用 6 种预设颜色（蓝/绿/黄/紫/粉/橙），自动分配
  - 数据被分割为连续的高亮/非高亮段（`DataSegment[]`），UI 按段渲染
  - 相邻高亮配置的颜色不同
- **代码位置**：`useScoeTestTool.ts:42-108`（`calculateSegments`）、`src/types/scoe/highlightConfig.ts`（类型定义）
- **新系统对应 feature**：指令接入 feature 的测试工具 UI
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。数据高亮帮助用户快速定位帧数据中的关键字段

#### 行为 24：发送/接收录制开关

- **旧行为描述**：
  - 发送录制默认停止（`sendStopped = true`），需手动开启
  - 接收录制默认开启（`receiveStopped = false`）
  - 初始化时清空所有数据
- **代码位置**：`useScoeTestTool.ts:31-34`（默认值）、`useScoeTestTool.ts:204-207`（初始化）
- **新系统对应 feature**：指令接入 feature 的测试工具 UI
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。录制开关是用户直接操作的 UI 控件

---

### 六、活跃任务监控

#### 行为 25：活跃任务列表与筛选

- **旧行为描述**：
  - 任务监控面板（`ActiveTasksMonitor`）显示所有活动任务（running + paused + waiting-trigger + waiting-schedule）
  - 支持按类型筛选：全部/顺序/定时/多实例定时/触发/多实例触发
  - 支持按状态筛选：全部/运行中/已暂停/等待触发/等待执行/错误
  - 每个任务显示：名称、状态 badge（颜色区分）、类型 badge、任务图标
- **代码位置**：`ActiveTasksMonitor.vue:31-44`（筛选逻辑）、`ActiveTasksMonitor.vue:47-63`（标签映射）、`ActiveTasksMonitor.vue:241-381`（模板）
- **新系统对应 feature**：task feature 的监控 UI
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。任务列表和筛选是用户管理并发任务的核心入口

#### 行为 26：任务进度展示

- **旧行为描述**：
  - 运行中/已暂停任务显示进度条（`q-linear-progress`）和百分比
  - 定时任务：显示"已执行 N 次"（无限循环）或 "N/M"（有限次）
  - 定时任务额外显示下次发送剩余时间（"X 时 Y 分后"/"X 分 Y 秒后"/"X 秒后"/"即将执行"）
  - 触发任务在 `waiting-trigger` 状态显示"等待触发条件满足"
  - 时间触发任务在 `waiting-schedule` 状态显示"将在 X 后执行"
  - 所有运行中的任务显示运行时长（"X 时 Y 分 Z 秒"）
  - 错误任务显示错误信息
- **代码位置**：`ActiveTasksMonitor.vue:106-150`（时间计算函数）、`ActiveTasksMonitor.vue:264-327`（进度展示模板）
- **新系统对应 feature**：task feature 的监控 UI
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。进度/时间/状态的实时展示是用户直接感知的行为

#### 行为 27：任务操作控制

- **旧行为描述**：
  - running 状态：可暂停（pause）、可停止（stop）
  - paused 状态：可继续（resume）、可停止（stop）
  - waiting-trigger 状态：可停止监听（stop）
  - waiting-schedule 状态：可停止定时（stop）
  - error 状态：可重试（start）
  - 停止任务时：清理定时器、注销触发监听器、更新状态为 completed
  - 暂停任务时：仅更新状态为 paused（定时器不实际暂停，resume 时需重新启动）
  - 强制清理（`forceCleanupTask`）：清空所有定时器 + 监听器，状态设为 error
- **代码位置**：`ActiveTasksMonitor.vue:83-103`（操作分发）、`useSendTaskController.ts:26-65`（stopTask）、`useSendTaskController.ts:70-92`（pauseTask）、`useSendTaskController.ts:97-117`（resumeTask）
- **新系统对应 feature**：task feature 的控制操作
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。暂停/继续/停止/重试/强制清理是任务管理的完整操作集

---

### 七、任务状态机

#### 行为 28：任务状态机完整转换

- **旧行为描述**：任务状态（`TaskStatus`）共 7 种，转换规则：
  - `idle` -> `running`（启动顺序/定时任务）、`idle` -> `waiting-trigger`（启动条件触发任务）、`idle` -> `waiting-schedule`（启动时间触发任务）
  - `running` -> `completed`（所有实例发送完成）、`running` -> `error`（发送失败）、`running` -> `paused`（用户暂停）
  - `paused` -> `running`（用户恢复）
  - `waiting-trigger` -> `running`（条件满足，开始发送）、`waiting-trigger` -> `completed`（用户停止）
  - `waiting-schedule` -> `running`（执行时间到达）、`waiting-schedule` -> `completed`（用户停止）
  - `completed` 任务自动从列表移除
- **代码位置**：`sendTasksStore.ts:15-30`（类型定义）、`useSendTaskExecutor.ts` 各 `startXxxTask` 函数、`useSendTaskController.ts` 控制函数
- **新系统对应 feature**：task feature 的状态机
- **oracle 来源评估**：代码实现。状态机转换完整且可追溯
- **保留/排除建议**：保留。7 种状态和转换规则构成任务执行的状态骨架

#### 行为 29：任务进度批量更新优化

- **旧行为描述**：
  - 任务进度不直接更新 store，而是写入缓存（`progressCache`）
  - 每 1 秒批量同步缓存到 store（`BATCH_UPDATE_INTERVAL = 1000`）
  - 任务完成/错误/暂停时强制同步（`forceSyncCache`）
  - 通过状态索引（`statusIndexes` Map）实现 O(1) 状态查询
  - `taskMap` 实现 O(1) ID 查找
- **代码位置**：`sendTasksStore.ts:153-358`（缓存和索引机制）
- **新系统对应 feature**：task feature 的性能优化层
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留性能优化思路，但具体实现可按新架构调整。1 秒批量更新和高频发送场景下的性能保障是可观测的间接行为（UI 流畅度）

---

### 八、帧实例管理

#### 行为 30：SCOE 帧实例发送列表管理

- **旧行为描述**：
  - 发送帧实例列表（`sendInstances`）持久化到 `dataStorageAPI.scoeFramesSendInstances`
  - 支持添加/复制/删除/选择帧实例
  - 选择时创建 deepClone 到 `localSendInstance` 作为编辑副本
  - 编辑后通过 `applyLocalEdit()` 将本地副本写回列表
  - 支持取消编辑（恢复到原始状态）
  - 可用帧过滤条件：`isSCOEFrame && direction === 'send'`
- **代码位置**：`scoeFrameInstancesStore.ts:55-218`（发送实例管理）
- **新系统对应 feature**：frame feature 的实例管理（SCOE 标记实例）
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。帧实例的 CRUD 和编辑副本模式是用户直接操作的行为

#### 行为 31：SCOE 接收指令列表管理

- **旧行为描述**：
  - 接收指令列表（`receiveCommands`）持久化到 `dataStorageAPI.scoeFramesReceiveCommands`
  - 支持添加/复制/删除/选择接收指令
  - 每个指令可关联多个帧实例（`frameInstances`）用于响应发送
  - 每个指令可配置多个校验和（`checksums`）
  - 每个指令可配置多个参数（`params`），每个参数可配置多个选项（`options`）
  - 每个指令可配置多个完成条件（`completionConditions`）
  - UI 展开状态（`expandedParamIds`/`expandedInstanceIds`/`expandedConditionIds`）用于管理嵌套编辑
- **代码位置**：`scoeFrameInstancesStore.ts:220-570`（接收指令管理）
- **新系统对应 feature**：指令接入 feature 的指令配置
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。接收指令的嵌套配置（参数->选项、帧实例、完成条件）是 SCOE 指令定义的核心数据结构

---

### 九、发送连接管理

#### 行为 32：连接断开时任务自动暂停

- **旧行为描述**：
  - 发送帧到目标时，若 `sendFrameInstance` 返回失败，检查目标是否可用（`isTargetAvailable`）
  - 若目标不可用（连接断开），自动将任务状态改为 `paused`，错误信息为"连接已断开"
  - 任务暂停后不再发送，等待用户处理
- **代码位置**：`useSendTaskExecutor.ts:222-247`（`sendFrameToTarget`）
- **新系统对应 feature**：task feature 的容错处理
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。连接断开自动暂停是用户可感知的保护行为

#### 行为 33：实例间延时

- **旧行为描述**：
  - 多实例顺序发送时，实例间可配置延时（`interval`，默认 1000ms）
  - 最后一个实例发送后不添加延时
  - 延时通过 `setTimeout` 实现
- **代码位置**：`useSendTaskExecutor.ts:252-260`（`addInstanceDelay`）
- **新系统对应 feature**：task feature 的 step 间延时
- **oracle 来源评估**：代码实现
- **保留/排除建议**：保留。实例间延时控制发送节奏是协议需求

---

### 十、全局配置与字节偏移

#### 行为 34：SCOE 全局字节偏移配置

- **旧行为描述**：SCOE 全局配置（`ScoeGlobalConfig`）定义了 6 个字节偏移量：
  - `messageIdentifierOffset`（信息标识，默认 0）
  - `sourceIdentifierOffset`（信源标识，默认 1）
  - `destinationIdentifierOffset`（信宿标识，默认 2）
  - `modelIdOffset`（型号 ID，默认 3）
  - `satelliteIdOffset`（卫星 ID，默认 7）
  - `functionCodeOffset`（功能码，默认 11）
  - 另有 `successFrameId`：执行成功后发送的帧 ID
- **代码位置**：`src/types/scoe/index.ts:97-130`（`ScoeGlobalConfig` 接口）、默认值在 `defaultScoeGlobalConfig`
- **新系统对应 feature**：指令接入 feature 的协议配置
- **oracle 来源评估**：类型定义 + 默认值
- **保留/排除建议**：保留。字节偏移量是 SCOE 协议解析的必要参数

---

## 后续

1. **关于"两阶段状态机"**：旧代码中未发现显式的"两阶段状态机"实现。SCOE 命令处理流程中的状态更新逻辑在 `updateStatus()` 中是简单的每秒重置 + 累加。如果"两阶段状态机"指的是 SCOE 外部设备（而非上位机软件）内部的协议状态机，则需要在硬件文档或甲方协议规范中寻找，旧上位机代码不是 oracle。

2. **SCOE 命令接收与解析**：旧代码中 `scoeStore` 和 `scoeFrameInstancesStore` 定义了接收指令的配置模型（`ScoeReceiveCommand`），但没有找到实际接收 TCP 数据 -> 解析指令码 -> 匹配配置 -> 执行对应功能（加载卫星/卸载/健康自检/链路自检/发送帧/读取文件发送）的运行时代码。这意味着：要么这部分逻辑在 main process 的网络回调中（TCP Server 收到数据后），要么尚未实现。需要进一步检查 main process 代码确认。

3. **测试工具的录制/回放**：旧代码中的 `useScoeTestTool` 只实现了数据录制（发送/接收数据列表），没有找到回放（replay）功能。录制的数据是追加到列表中的 hex 字符串，没有持久化到文件或重新发送的能力。

4. **需要进一步确认的项目**：
   - TCP Server 收到数据后的指令解析和执行逻辑（可能在 main process）
   - `ScoeStatus` 中 `commandReceiveCount`/`commandSuccessCount`/`lastCommandCode` 等字段的实际更新位置（`updateStatus` 中只做清零/重置，递增逻辑可能在别处）
   - SCOE 指令的校验和验证逻辑（配置存在但验证代码未在已读文件中找到）
