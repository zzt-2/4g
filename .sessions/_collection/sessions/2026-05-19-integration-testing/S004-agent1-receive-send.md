# [S004] 旧系统 receive/send 数据流事实提取

> 2026-05-19 | 调研 | 进行中

## 目标

从旧系统代码中提取 receive 和 send 的完整数据流路径、所有可观测业务行为，为重写提供 oracle 基线。

---

## 一、旧 Receive 完整数据流路径

### 1.1 入口：串口/网络数据到达

**串口路径**
- `serialStore.ts` 监听 `serialAPI.onData` 回调
- 收到 `{ portPath, data }` 后调用 `receiveFramesStore.handleReceivedData('serial', portPath, new Uint8Array(data.data))`
- 代码位置: `src/stores/serialStore.ts:416`

**网络路径**
- `netWorkStore.ts` 监听 `networkAPI.onData` 回调
- 收到 `{ connectionId, data, timestamp }` 后调用 `receiveFramesStore.handleReceivedData('network', connectionId, uint8Data)`
- 代码位置: `src/stores/netWorkStore.ts:212`

### 1.2 统一入口：handleReceivedData（renderer 侧）

- 位置: `receiveFramesStore.ts:852-892`
- 行为: **串行处理锁** — 如果正在处理数据（`processingLock`），新数据进入 `pendingProcessQueue` 排队
- 串行保证: 同一时刻只有一个 `processDataInternal` 在执行，队列中的请求按 FIFO 顺序处理

### 1.3 内部处理：processDataInternal

位置: `receiveFramesStore.ts:1005-1144`

完整步骤链：

1. **全局统计更新**（同步）
   - `globalStatsStore.incrementReceivedPackets()` — 接收包计数 +1
   - `globalStatsStore.addReceivedBytes(data.length)` — 接收字节累加

2. **SCOE 帧分流**（条件分支）
   - 条件: `sourceId === 'scoe-tcp-server'`
   - 调用 `handleScoeFrame(data)` 尝试作为 SCOE 帧处理
   - 如果 SCOE 处理成功，直接 return，不再走通用帧匹配路径
   - SCOE 处理包括: isScoeFrame 检测 → checksum 校验 → 参数解析 → scoeCommandExecutor.executeCommand → addReceiveData 记录

3. **主进程帧匹配与解析**（IPC 调用）
   - 调用 `receiveAPI.handleReceivedData(source, sourceId, data)` → 通过 `window.electron.receive.handleReceivedData` → IPC 到主进程
   - 主进程处理链（`receiveHandlers.ts:32-160`）：
     a. 从 `receiveConfigCache` 获取缓存的帧模板、映射、分组
     b. `createDataPacket(source, sourceId, data)` 创建数据包对象
     c. `matchDataToFrame(packet, frames)` 执行帧匹配（基于 matchRules）
     d. `processReceivedData(packet, matchResult, mappings, groups)` 提取字段值
     e. `applyDataProcessResult(processResult, updatedGroups)` 应用到分组副本
   - 返回给 renderer: `{ success, updatedGroups, updatedDataItems, recentPacket, frameStats, errors }`

4. **失败处理**（result.success === false）
   - `globalStatsStore.incrementUnmatchedFrames()` — 未匹配帧计数 +1
   - 如果包含解析错误: `globalStatsStore.incrementFrameParseErrors()` — 解析错误计数 +1
   - 记录到 `recentPackets`

5. **成功处理**（result.success === true）
   - `globalStatsStore.incrementMatchedFrames()` — 匹配成功帧计数 +1
   - 记录到 `recentPackets`（最多 100 条，FIFO）
   - 更新 `frameDataCache`（fieldId → value 映射）
   - **增量更新数据项** — 遍历 `updatedDataItems`，跳过表达式字段，直接赋值 `dataItem.value` 和 `dataItem.displayValue`
   - **表达式计算** — `frameExpressionManager.calculateAndApplyReceiveFrame(frameId)` 同步计算间接字段
   - **星座图数据收集** — 异步调用 `collectConstellationData`，将 bytes 类型字段数据送入 dataDisplayStore
   - **帧统计更新** — `frameStats` Map 中累加 `totalReceived`、更新 `lastReceiveTime`
   - **触发条件检查** — 调用 `checkTriggerConditions(frameId, sourceId, updatedDataItems)` → 通知 sendTasksStore

### 1.4 配置同步到主进程

- 位置: `receiveFramesStore.ts:235-267`
- 触发方式: watch `configForWatch`（排除 value/displayValue 的 groups + mappings 变化）
- 行为:
  - 1 秒防抖后调用 `saveConfig()` 持久化
  - 500ms 防抖后调用 `syncConfigToMainProcess()` 更新主进程缓存
  - 帧模板变化时也触发 `debouncedSyncCache`

---

## 二、旧 Send 完整数据流路径

### 2.1 任务创建

入口: `useSendTaskManager` → `useSendTaskCreator`

四种任务类型:
1. **顺序发送** (`createSequentialTask`) — 一组帧实例按顺序发送，发完即止
2. **定时发送** (`createTimedTask`) — 参数: instances, sendInterval, repeatCount, isInfinite
3. **条件触发发送** (`createTriggeredTask`) — 参数: instances, sourceId, triggerFrameId, conditions, continueListening
4. **时间触发发送** (`createTimedTriggeredTask`) — 参数: instances, executeTime, isRecurring, recurringType, recurringInterval, endTime

所有类型创建后存入 `sendTasksStore.addTask()`，状态初始为 `idle`。

### 2.2 任务启动

入口: `useSendTaskExecutor.startTask(taskId)` — 根据 `task.type` 分发

#### 顺序发送 (startSequentialTask)
- 初始化帧实例缓存（deepClone）
- 状态 → `running`
- 调用 `processMultipleInstances(taskId)` — 按顺序逐个发送
- 每个实例发送前后更新实例级 status（idle→running→completed/error）
- 完成后状态 → `completed`，清理缓存

#### 定时发送 (startTimedTask)
- 初始化帧实例缓存
- 状态 → `running`
- 使用 `createTimedSender` 通用定时器：
  - 首次立即发送一轮所有实例
  - 之后按 `sendInterval` 设置 interval 定时器
  - 每轮发送前检查 `isTaskStillRunning`、是否达到 `repeatCount`
  - 支持参数变化：`updateCachedInstanceFields(cachedInstance, currentCount)` 按轮次索引更新字段值
  - `isInfinite` 模式：只更新计数不设上限
  - 达到上限后状态 → `completed`
- 连接断开时状态 → `paused`（`sendFrameToTarget` 中检测）

#### 条件触发发送 (startTriggeredTask)
- 初始化帧实例缓存
- 状态 → `waiting-trigger`
- 注册触发监听器: `sendTasksStore.registerTaskTriggerListener(taskId, config)`
- 监听器在 `useSendTaskTriggerListener` 中管理

#### 时间触发发送 (startTimedTriggeredTask)
- 初始化帧实例缓存
- 使用 `createScheduledExecutor`：
  - 状态 → `waiting-schedule`
  - 计算下次执行时间（支持一次性 / 重复: second/minute/hour/daily/weekly/monthly）
  - 到达时间后状态 → `running`，执行一轮发送
  - 重复模式下计算下次时间，状态回到 `waiting-schedule`
  - 超过 endTime 或一次性完成后状态 → `completed`

### 2.3 单帧发送流程

入口: `useUnifiedSender.sendFrameInstance(targetId, frameInstance)`

1. **表达式计算** — 如果帧有表达式字段，先 `calculateAndApplySendFrame` 计算
2. **倍率应用** — 非 bytes 类型且 factor !== 1 时，`value = Number(value) * factor`
3. **序列化** — `frameToBuffer(frameInstanceTemp)` 转为 Uint8Array
4. **路由发送** — 根据 `targetId` 格式解析目标类型：
   - `serial:COM1` → `serialAPI.sendData(portPath, data)`
   - `network:tcp-xxx` → `networkAPI.send(connectionId, data)` 或带 targetHost 的 UDP 发送
5. **统计更新**（异步 setTimeout）：
   - 成功: `sendFrameInstancesStore.updateSendStatsCache(instance)` — 缓存中 sendCount++, lastSentAt 更新
   - 成功: `globalStatsStore.incrementSentPackets()` + `addSentBytes(data.length)`
   - SCOE UDP 目标: `scoeStore.addSendData(hexString)` 记录发送的十六进制
   - 失败: `globalStatsStore.incrementCommunicationErrors()`

### 2.4 触发条件匹配流程

**receive 到 send 的桥接路径:**

1. `processDataInternal` 成功后 → `checkTriggerConditions(frameId, sourceId, updatedDataItems)` (receiveFramesStore.ts:1186)
2. → `sendTasksStore.handleFrameReceived(frameId, sourceId, dataItems)` (sendTasksStore.ts:556)
3. → `triggerListener.handleFrameReceived(frameId, sourceId, updatedDataItems)` (useSendTaskTriggerListener.ts:70)

**条件评估** (`evaluateTriggerConditions`):
- 遍历所有活跃监听器，匹配 `triggerFrameId === frameId` 且 `sourceId === sourceId`
- 检查任务状态是否为 `waiting-trigger`
- 空条件数组 = 接收到帧即触发
- 有条件时: 通过 `receiveFramesStore.mappings` 查找 `fieldId → dataItemId` 映射
- 支持 AND/OR 逻辑组合，条件操作符: equals / not_equals / greater / less / contains
- 所有值比较都用 String() 或 Number() 转换后比较

**触发执行** (`executeTriggerTask`):
- 可选 responseDelay 延迟
- 单实例: `processInstance(taskId, 0, 1, true)`
- 多实例: `processMultipleInstances(taskId)`
- 执行后清理实例缓存
- `continueListening === false`: 注销监听器，任务 → completed
- `continueListening === true`: 保持监听，下次匹配可再次触发

### 2.5 任务控制

入口: `useSendTaskController`

- `stopTask(taskId)` — 清理定时器 + 触发监听器，状态 → completed
- `pauseTask(taskId)` — 仅更新状态 → paused（定时器实际未暂停，依赖 executeOnce 中 isTaskStillRunning 检查）
- `resumeTask(taskId)` — 状态 → running（注意: 暂停后的定时器恢复逻辑不完整，代码注释承认这一点）
- `stopAllTasks()` — 遍历所有 running/paused/waiting-trigger 任务调用 stopTask
- `forceCleanupTask(taskId)` — 强制清理定时器 + 监听器，状态 → error

---

## 三、receiveFramesStore 职责清单

### 3.1 状态（ref）
| 状态 | 类型 | 用途 |
|------|------|------|
| groups | DataGroup[] | 数据分组，包含 dataItems（带 value/displayValue） |
| mappings | FrameFieldMapping[] | 帧.字段 → 分组.数据项 映射关系 |
| frameStats | Map<string, ReceiveFrameStats> | 每帧统计（totalReceived, lastReceiveTime, checksumFailures, errorCount） |
| selectedFrameId | string | UI 当前选中帧 |
| selectedGroupId | number | UI 当前选中分组 |
| isLoading | boolean | 加载状态 |
| recentPackets | ReceivedDataPacket[] | 最近 100 个数据包（用于调试/监控） |
| frameDataCache | Map<string, Map<string, unknown>> | 帧ID → (fieldId → value) 快速缓存，供表达式计算和条件检查 |
| processingLock | boolean | 数据处理串行锁 |
| pendingProcessQueue | array | 排队等待处理的数据包 |

### 3.2 计算属性（computed）
| 属性 | 用途 |
|------|------|
| receiveFrames | 过滤 direction === 'receive' 的帧模板 |
| receiveFrameOptions | 帧选项列表（id, name, fields） |
| selectedFrameDataItems | 选中帧的映射 + 数据项联合信息 |
| selectedGroup | 当前选中分组 |
| availableReceiveFrameOptions | 帧选项（label/value 格式，用于下拉） |
| getAvailableFrameFieldOptions | 指定帧的已映射字段选项 |
| allReceiveFrameData | frameDataCache 的只读引用 |
| directDataFrames | 只含直接数据字段的接收帧副本（过滤 indirect） |
| configForWatch | 排除 value/displayValue 的配置快照（用于自动保存） |

### 3.3 Watcher
| watch 目标 | 行为 |
|------------|------|
| configForWatch | 配置变化时 1s 防抖保存 + 500ms 防抖同步主进程缓存 |
| frameTemplateStore.frames | 帧模板变化时同步主进程缓存 |

### 3.4 Actions（方法）
| 方法 | 职责 |
|------|------|
| loadConfig | 从 dataStorageAPI 加载 groups + mappings，验证映射，同步主进程 |
| saveConfig | 持久化 groups + mappings |
| exportConfig | 导出配置对象 |
| importConfig | 导入配置（验证、清空、重建、同步主进程） |
| validateMappings | IPC 调用主进程验证映射完整性 |
| selectFrame / selectGroup | UI 选择 |
| addGroup / removeGroup / updateGroup | 分组 CRUD |
| addDataItemToGroup / updateDataItem / removeDataItem | 数据项 CRUD |
| addMapping / removeMapping | 映射关系 CRUD |
| toggleDataItemVisibility / toggleDataItemFavorite | UI 状态切换 |
| clearDataItemValues | 清空所有数据项的 value/displayValue |
| handleReceivedData | 统一数据接收入口（串行锁 + 内部处理） |
| processDataInternal | 核心数据处理（统计→SCOE→帧匹配→更新→表达式→星座图→触发） |
| handleScoeFrame | SCOE 帧专属处理 |
| checkTriggerConditions | receive→send 触发桥接 |
| collectConstellationData | 星座图数据收集 |
| updateFrameStats | 帧级统计更新 |
| clearReceiveStats | 清空统计和缓存 |
| getRecentPackets | 获取最近数据包（可按 source/sourceId 过滤） |
| findOrphanedDataItems | 查找无映射的孤立数据项 |
| removeInvalidMappings | 清理无效映射 |
| removeOrphanedDataItems | 清理孤立数据项 |
| moveVisibleDataItemUp / moveVisibleDataItemDown | 可见项排序 |
| syncConfigToMainProcess | 同步配置到主进程缓存 |
| debouncedSaveConfig / debouncedSyncCache | 防抖保存/同步 |

---

## 四、sendTasksStore 职责清单

### 4.1 状态
| 状态 | 用途 |
|------|------|
| tasks | shallowRef<SendTask[]> — 所有任务 |
| statusIndexes | Map<TaskStatus, Set<string>> — 按状态索引，O(1) 查询 |
| taskMap | Map<string, SendTask> — ID 到任务的快速映射 |
| progressCache / configCache | Map — 批量更新缓存（1s 同步到 store） |

### 4.2 计算属性
| 属性 | 用途 |
|------|------|
| activeTasks | running + paused + waiting-trigger + waiting-schedule |
| runningTasks | 仅 running |
| completedTasks | 仅 completed |
| errorTasks | 仅 error |
| waitingTriggerTasks | 仅 waiting-trigger |

### 4.3 Actions
| 方法 | 职责 |
|------|------|
| addTask | 创建任务，更新索引 |
| getTaskById / getTaskByName | 查询 |
| updateTaskStatus | 状态转换（含索引更新），completed 时自动 removeTask |
| updateTask | 通用更新（配置更新走缓存） |
| removeTask | 删除任务 |
| clearCompletedTasks / clearErrorTasks / clearAllTasks | 批量清理 |
| stopAllRunningTasks | 批量暂停 |
| updateTaskProgressCached | 进度缓存更新（1s 批量同步） |
| updateTaskConfigCached | 配置缓存更新 |
| forceSyncCache | 强制同步缓存 |
| syncCacheToStore | 批量同步缓存到 store |
| registerTaskTriggerListener | 注册触发监听器 |
| unregisterTaskTriggerListener | 注销触发监听器 |
| handleFrameReceived | 透传给 triggerListener |
| getActiveTriggerListeners / getTriggerListenerStats | 监听器查询 |

---

## 五、sendFrameInstancesStore 职责清单

### 5.1 核心职责
- 帧实例 CRUD（创建、复制、删除、更新、排序）
- 帧实例收藏管理
- 帧实例编辑（localInstance 编辑副本、hexValues、保存）
- 帧实例导入/导出（JSON）
- 帧模板更新时联动更新实例
- 触发配置管理（条件触发、时间触发）
- 发送统计管理（sendCount, lastSentAt 缓存）

### 5.2 触发配置状态
- `triggerType`: 'condition' | 'time'
- 条件触发: sourceId, triggerFrameId, conditions, continueListening
- 时间触发: executeTime, isRecurring, recurringType, recurringInterval, endTime
- `responseDelay`: 触发后延迟执行时间

---

## 六、全局统计（globalStatsStore）

| 统计项 | 更新位置 |
|--------|---------|
| sentPackets | useUnifiedSender.sendFrameInstance 成功后 |
| receivedPackets | receiveFramesStore.processDataInternal 入口 |
| sentBytes | useUnifiedSender.sendFrameInstance 成功后 |
| receivedBytes | receiveFramesStore.processDataInternal 入口 |
| matchedFrames | receiveFramesStore.processDataInternal 成功后 |
| unmatchedFrames | receiveFramesStore.processDataInternal 失败后 |
| communicationErrors | useUnifiedSender.sendFrameInstance 失败后 |
| frameParseErrors | receiveFramesStore.processDataInternal 解析错误时 |
| systemStats (时间/位置) | 每秒更新，表达式系统可消费 |

统计项全部为累加计数器，resetStats 一次性清零。所有统计通过 `availableStats` computed 暴露给表达式系统。

---

## 七、可观测业务行为清单

### R-01: 串口数据接收并自动匹配帧

**旧行为:** 串口收到原始字节 → 自动按帧模板匹配 → 匹配成功则解析字段值 → 更新 UI 数据项

**代码位置:**
- 入口: `serialStore.ts:416` → `receiveFramesStore.handleReceivedData`
- 主进程: `receiveHandlers.ts:32-160`
- 匹配: `dataProcessor.ts:54-113` (`matchDataToFrame`)
- 解析: `dataProcessor.ts:440-566` (`processReceivedData`)
- 字段值提取: `dataProcessor.ts:199-430` (`extractFieldValue`)

**新系统对应 feature:** receive feature

**oracle 来源:** 可录制 — 固定帧模板 + 固定输入字节 → 验证输出字段值

**保留建议:** 保留。帧匹配和字段解析是核心数据流。

---

### R-02: 网络数据接收并自动匹配帧

**旧行为:** 网络连接收到原始字节 → 同串口路径处理（区分 sourceId）

**代码位置:**
- 入口: `netWorkStore.ts:212` → `receiveFramesStore.handleReceivedData`
- 后续路径同 R-01

**新系统对应 feature:** receive feature

**oracle 来源:** 同 R-01

**保留建议:** 保留。

---

### R-03: 接收数据串行处理（处理锁）

**旧行为:** 同一时刻只有一个数据处理流程在执行，后续数据排队 FIFO 处理

**代码位置:** `receiveFramesStore.ts:806-892` (`processingLock` + `pendingProcessQueue`)

**新系统对应 feature:** receive feature（是否需要串行锁取决于新架构）

**oracle 来源:** 代码逻辑验证

**保留建议:** 需讨论。串行保证防止竞态，但可能影响高频场景吞吐。新系统应评估是否需要锁、用锁粒度多大。

---

### R-04: SCOE 帧分流处理

**旧行为:** sourceId === 'scoe-tcp-server' 时，数据优先走 SCOE 专属处理路径（识别→校验→参数解析→指令执行→记录）。SCOE 处理成功则不走通用帧匹配。

**代码位置:** `receiveFramesStore.ts:899-1000` (`handleScoeFrame`)

**新系统对应 feature:** 指令接入 feature

**oracle 来源:** SCOE 帧配置文件 + 录制的输入字节

**保留建议:** 保留 SCOE 帧识别和校验行为。但 SCOE 专属路径应统一到指令接入 feature，不复用旧 SCOE 独立模块结构。

---

### R-05: 数据项值增量更新

**旧行为:** 帧匹配成功后，只更新有映射的数据项的 value 和 displayValue，不覆盖整个 groups。跳过表达式字段。

**代码位置:** `receiveFramesStore.ts:1076-1089`

**新系统对应 feature:** receive feature

**oracle 来源:** 固定帧模板 + 映射 + 输入字节 → 验证各数据项值

**保留建议:** 保留。增量更新是性能关键。

---

### R-06: 表达式字段计算

**旧行为:** 直接字段值更新后，同步计算该帧上的表达式字段（indirect 字段），并更新对应数据项的 value/displayValue。

**代码位置:** `receiveFramesStore.ts:1092-1099`，委托给 `useFrameExpressionManager`

**新系统对应 feature:** 表达式引擎（shared/）+ receive feature 调用

**oracle 来源:** 配置表达式 + 输入直接字段值 → 验证间接字段输出

**保留建议:** 保留。新系统表达式引擎已在 shared/ 实现。

---

### R-07: 帧级统计（每帧接收计数、最后接收时间）

**旧行为:** 每次帧匹配成功后，frameStats Map 中该帧的 totalReceived 累加，lastReceiveTime 更新。

**代码位置:** `receiveFramesStore.ts:1108-1125`

**新系统对应 feature:** receive feature

**oracle 来源:** 发送 N 帧后验证统计数据

**保留建议:** 保留。

---

### R-08: 全局统计（收发包数、字节数、匹配率、错误率）

**旧行为:** 全局累加统计，分四类: 通信统计（收发包/字节）、帧匹配统计（匹配/未匹配）、错误统计（通信错误/解析错误）、系统统计（运行时间/位置）。

**代码位置:** `globalStatsStore.ts`

**新系统对应 feature:** 全局统计（可能是独立 feature 或 receive/send 的公共能力）

**oracle 来源:** 发送/接收固定数量数据后验证统计值

**保留建议:** 保留。

---

### R-09: 最近数据包记录（调试用）

**旧行为:** 保留最近 100 个数据包（无论匹配成功或失败），可按 source/sourceId 过滤查询。

**代码位置:** `receiveFramesStore.ts:134-143, 1248-1261`

**新系统对应 feature:** receive feature 的调试/监控能力

**oracle 来源:** UI 观察验证

**保留建议:** 保留。

---

### R-10: 配置自动保存和主进程同步

**旧行为:** groups/mappings 变化时 1s 防抖保存到本地存储，500ms 防抖同步到主进程缓存。帧模板变化也触发主进程同步。

**代码位置:** `receiveFramesStore.ts:168-267`

**新系统对应 feature:** receive feature 的持久化层

**oracle 来源:** 修改配置后重启验证持久化

**保留建议:** 保留。新系统持久化策略可能不同（FeaturePersistence 已实现），但行为需等价。

---

### R-11: 映射关系验证和孤立数据项清理

**旧行为:** 导入配置后验证映射完整性。提供 `findOrphanedDataItems`、`removeInvalidMappings`、`removeOrphanedDataItems` 方法。

**代码位置:** `receiveFramesStore.ts:614-803`

**新系统对应 feature:** receive feature 配置管理

**oracle 来源:** 构造含孤立项的配置 → 调用清理方法 → 验证结果

**保留建议:** 保留。

---

### R-12: 星座图数据收集

**旧行为:** 帧匹配成功后，如果数据项类型为 bytes 且有映射关系，收集数据到 dataDisplayStore 供星座图可视化。

**代码位置:** `receiveFramesStore.ts:1149-1181`

**新系统对应 feature:** 可视化 feature（独立于 receive）

**oracle 来源:** 录制 bytes 类型字段的输入数据 → 验证星座图数据

**保留建议:** 保留行为，但新系统中星座图收集由可视化 feature 消费 receive 数据，不是 receive 自己做。

---

### R-13: 标签显示（labelOptions 匹配）

**旧行为:** 数据项启用 `useLabel` 时，解析后的 displayValue 会与 `labelOptions` 匹配，匹配到则显示标签而非原始值。匹配通过十六进制归一化比较。

**代码位置:** `dataProcessor.ts:523-533`

**新系统对应 feature:** receive feature 数据展示

**oracle 来源:** 配置 labelOptions + 发送匹配值 → 验证显示标签

**保留建议:** 保留。

---

### R-14: 倍率应用

**旧行为:** 字段有 factor 且不等于 1 时，解析后的值乘以 factor，保留最多 5 位小数。send 方向在序列化前也应用倍率。

**代码位置:**
- receive: `dataProcessor.ts:121-134` (`applyFactor`)
- send: `useUnifiedSender.ts:88-98`

**新系统对应 feature:** 帧 field 定义的一部分，shared/ 纯函数

**oracle 来源:** 配置 factor + 输入原始值 → 验证输出

**保留建议:** 保留。

---

### R-15: 直接/间接数据字段区分

**旧行为:** 帧匹配时只使用 `dataParticipationType === 'direct'`（或未设置默认为 direct）的字段。间接字段（indirect / 表达式字段）不参与帧匹配，通过表达式计算得出。

**代码位置:** `receiveFramesStore.ts:823-844` (`directDataFrames` computed)

**新系统对应 feature:** receive feature 帧匹配

**oracle 来源:** 配置含 direct + indirect 字段的帧 → 发送数据 → 验证只有 direct 字段参与匹配

**保留建议:** 保留。

---

### R-16: receive→send 条件触发桥接

**旧行为:** 帧匹配成功后，将 frameId + sourceId + 更新的数据项传给 sendTasksStore → triggerListener，遍历所有活跃监听器匹配条件，满足则触发发送任务执行。

**代码位置:**
- 桥接入口: `receiveFramesStore.ts:1186-1231` (`checkTriggerConditions`)
- 条件评估: `useSendTaskTriggerListener.ts:100-158`
- 单条件操作符: `useSendTaskTriggerListener.ts:189-218`

**新系统对应 feature:** receive feature 发出事件 → task feature 消费

**oracle 来源:** 配置触发条件 + 发送满足/不满足条件的帧 → 验证是否触发

**保留建议:** 保留。但新系统中条件匹配逻辑归 shared/ 纯函数，触发行为归 task feature。

---

### R-17: 条件触发支持 AND/OR 逻辑组合

**旧行为:** 多条件支持 AND/OR 逻辑运算符连接，支持短路求值。

**代码位置:** `useSendTaskTriggerListener.ts:113-158`

**新系统对应 feature:** shared/ 条件匹配纯函数

**oracle 来源:** 构造 AND/OR 条件组合 → 输入不同值组合 → 验证触发结果

**保留建议:** 保留。

---

### S-01: 单帧发送（用户手动发送）

**旧行为:** 用户选择帧实例和目标连接 → 表达式计算 → 倍率应用 → 序列化 → 按目标类型路由（串口/网络 TCP/UDP）→ 更新统计。

**代码位置:** `useUnifiedSender.ts:69-178` (`sendFrameInstance`)

**新系统对应 feature:** send feature

**oracle 来源:** 固定帧实例 + 目标 → 捕获发送的字节

**保留建议:** 保留。

---

### S-02: 顺序发送任务

**旧行为:** 一组帧实例按顺序逐个发送，每个实例独立状态追踪（running/completed/error），全部完成后任务标记 completed。

**代码位置:** `useSendTaskExecutor.ts:490-537` (`startSequentialTask`)

**新系统对应 feature:** task feature

**oracle 来源:** 创建顺序任务 + 验证发送顺序和完成状态

**保留建议:** 保留。

---

### S-03: 定时发送任务

**旧行为:** 按固定间隔重复发送一组帧实例。支持有限次数和无限循环。支持参数变化（每轮更新字段值）。首次立即发送。

**代码位置:** `useSendTaskExecutor.ts:542-728` (`createTimedSender` + `startTimedTask`)

**新系统对应 feature:** task feature

**oracle 来源:** 创建定时任务 + 验证间隔和次数

**保留建议:** 保留。

---

### S-04: 定时任务参数变化

**旧行为:** 帧实例启用 `enableVariation` 时，每轮发送前按 `currentVariationIndex` 更新字段值为 `fieldVariations[roundIndex]` 中的值。

**代码位置:** `useSendTaskExecutor.ts:80-101` (`updateCachedInstanceFields`)

**新系统对应 feature:** task feature

**oracle 来源:** 配置参数变化 + 验证每轮发送的字段值

**保留建议:** 保留。

---

### S-05: 条件触发发送任务

**旧行为:** 任务进入 `waiting-trigger` 状态，注册触发监听器。receive 数据匹配到指定帧 + 条件满足后，按 responseDelay 延迟后执行发送。支持 `continueListening` 控制是否持续监听。

**代码位置:** `useSendTaskExecutor.ts:733-789` + `useSendTaskTriggerListener.ts:223-306`

**新系统对应 feature:** task feature

**oracle 来源:** 配置触发条件 + 发送满足条件的帧 → 验证触发和发送

**保留建议:** 保留。

---

### S-06: 时间触发发送任务

**旧行为:** 指定执行时间（一次性或重复），到达时间后发送一组帧实例。重复支持 second/minute/hour/daily/weekly/monthly 间隔。支持 endTime 限制。

**代码位置:** `useSendTaskExecutor.ts:794-976` (`createScheduledExecutor` + `startTimedTriggeredTask`)

**新系统对应 feature:** task feature

**oracle 来源:** 设置近未来时间 → 验证触发执行

**保留建议:** 保留。

---

### S-07: 任务暂停/恢复

**旧行为:** pause 更新状态为 paused，但定时器未真正暂停（依赖执行函数中 isTaskStillRunning 检查跳过执行）。resume 更新状态为 running，但定时器恢复逻辑不完整（代码注释承认这一点）。

**代码位置:** `useSendTaskController.ts:70-117`

**新系统对应 feature:** task feature

**oracle 来源:** 暂停/恢复后验证任务行为

**保留建议:** 保留需求，但新系统应正确实现暂停/恢复。旧行为是已知缺陷。

---

### S-08: 任务停止

**旧行为:** 停止任务时清理定时器 + 触发监听器，状态 → completed（注意：不是 cancelled，是 completed）。

**代码位置:** `useSendTaskController.ts:26-65`

**新系统对应 feature:** task feature

**oracle 来源:** 停止后验证清理和状态

**保留建议:** 保留。新系统应区分 completed 和 stopped/cancelled。

---

### S-09: 连接断开自动暂停

**旧行为:** 发送帧时如果目标连接不可用（`isTargetAvailable` 返回 false），自动将任务状态改为 paused 并记录原因。

**代码位置:** `useSendTaskExecutor.ts:233-237` (`sendFrameToTarget`)

**新系统对应 feature:** task feature + connection feature 协同

**oracle 来源:** 发送中断开连接 → 验证任务状态变为 paused

**保留建议:** 保留。

---

### S-10: 发送统计（实例级 sendCount/lastSentAt）

**旧行为:** 每次发送成功后，帧实例的 sendCount +1，lastSentAt 更新为当前时间。统计先写入缓存，定时器批量同步到 store。

**代码位置:**
- 缓存更新: `sendFrameInstancesStore.ts:251-269` (`updateSendStatsCache`)
- 批量同步: `sendFrameInstancesStore.ts:200-249` (`updateSendStats`)

**新系统对应 feature:** send feature

**oracle 来源:** 发送 N 次 → 验证统计值

**保留建议:** 保留。

---

### S-11: SCOE UDP 发送记录

**旧行为:** 如果发送目标是 `network:scoe-udp:scoe-udp-remote`，发送成功后额外将发送数据以十六进制形式记录到 scoeStore。

**代码位置:** `useUnifiedSender.ts:154-159`

**新系统对应 feature:** 指令接入 feature

**oracle 来源:** 发送 SCOE UDP 帧 → 验证记录

**保留建议:** 保留记录行为，但归属指令接入 feature。

---

### S-12: 实例间延时

**旧行为:** 多实例任务发送时，每个实例发送完后可配置延时（`instanceConfig.interval`），最后一个实例不延时。

**代码位置:** `useSendTaskExecutor.ts:252-260` (`addInstanceDelay`)

**新系统对应 feature:** task feature

**oracle 来源:** 多实例任务 + 验证发送间隔

**保留建议:** 保留。

---

### S-13: 帧实例 deepClone 缓存

**旧行为:** 任务启动时 deepClone 所有帧实例作为缓存，发送时使用缓存副本，避免修改原始实例。每轮参数变化修改缓存而非原始。

**代码位置:** `useSendTaskExecutor.ts:54-75` (`initializeFrameInstanceCache`)

**新系统对应 feature:** task feature

**oracle 来源:** 任务执行期间修改原始实例 → 验证不影响正在运行的任务

**保留建议:** 保留。隔离运行时副本和持久化实例是正确做法。

---

### S-14: 任务进度追踪

**旧行为:** 实时追踪 currentCount（当前发送轮次/帧数）、totalCount、percentage、currentInstanceIndex、nextExecutionTime。进度更新走缓存，1s 批量同步到 store。

**代码位置:**
- 进度更新: `useSendTaskExecutor.ts` 各处调用 `updateTaskProgressCached`
- 批量同步: `sendTasksStore.ts:269-301` (`syncCacheToStore`)

**新系统对应 feature:** task feature

**oracle 来源:** 运行任务 + 观察 UI 进度

**保留建议:** 保留。

---

### S-15: 触发监听器管理

**旧行为:** 触发任务注册监听器后，可查询活跃监听器列表、按帧清理监听器、查询统计信息（总数、按帧/按源分布、有条件/无条件数量）。

**代码位置:** `useSendTaskTriggerListener.ts:311-372`

**新系统对应 feature:** task feature

**oracle 来源:** 注册多个监听器 → 查询统计 → 验证

**保留建议:** 保留。

---

### S-16: 帧实例导入/导出 JSON

**旧行为:** 支持将帧实例配置导出为 JSON 文件，以及从 JSON 文件导入配置。

**代码位置:** `sendFrameInstancesStore.ts:349`（代理到 `useInstancesImportExport`）

**新系统对应 feature:** send feature 持久化

**oracle 来源:** 导出 JSON → 导入 → 验证一致性

**保留建议:** 保留。

---

### S-17: 帧模板更新联动实例

**旧行为:** 当帧模板定义变更时（字段增删改），已有的帧实例自动同步更新。

**代码位置:** `sendFrameInstancesStore.ts:33`（代理到 `useInstanceFrameUpdates`）

**新系统对应 feature:** send feature + frame feature 协同

**oracle 来源:** 修改帧模板 → 验证实例字段同步

**保留建议:** 保留。

---

### S-18: UDP 远程主机发送

**旧行为:** 网络目标格式 `network:xxx:host:port` 时，解析为 UDP 远程主机目标，使用 `networkAPI.send(connectionId, data, targetHost)` 发送。

**代码位置:** `useUnifiedSender.ts:118-136`

**新系统对应 feature:** send feature（网络发送路由）

**oracle 来源:** 配置 UDP 目标 → 验证发送

**保留建议:** 保留。

---

## 八、字段值提取支持的数据类型

| 数据类型 | 字节数 | 大/小端 | 倍率 | 标签 |
|----------|--------|---------|------|------|
| uint8 | 1 | - | 支持 | 支持 |
| int8 | 1 | - | 支持 | 支持 |
| uint16 | 2 | 支持 | 支持 | 支持 |
| int16 | 2 | 支持 | 支持 | 支持 |
| uint32 | 4 | 支持 | 支持 | 支持 |
| int32 | 4 | 支持 | 支持 | 支持 |
| uint64 | 8 | 支持 | 支持 | 支持 |
| int64 | 8 | 支持 | 支持 | 支持 |
| float | 4 | 支持 | 支持 | 支持 |
| double | 8 | 支持 | 支持 | 支持 |
| bytes | 变长 | - | - | 支持（ASCII 模式/十六进制） |

代码位置: `dataProcessor.ts:199-430` (`extractFieldValue`)

---

## 九、排除项（旧行为缺陷，不应复制）

| 行为 | 问题 | 建议 |
|------|------|------|
| 暂停后定时器不真正暂停 | 定时器继续触发但被 isTaskStillRunning 跳过 | 新系统应正确实现暂停/恢复 |
| 任务停止状态为 completed 而非 cancelled | 用户主动停止和自然完成无法区分 | 新系统应区分 stopped/cancelled/completed |
| 串行处理锁可能成为高频瓶颈 | 所有数据源共享一个处理锁 | 新系统应评估是否需要更细粒度锁 |
| 旧 SCOE 模块直接耦合 receiveFramesStore | SCOE 逻辑嵌入 receive 主路径 | 新系统统一到指令接入 feature |
| globalStats 累加计数器无持久化 | 重启后统计清零 | 是否需要持久化取决于业务需求 |
| 条件匹配通过 receiveFramesStore.mappings 查找 fieldId | 触发监听器直接访问 receive store 内部数据 | 新系统应通过公共 API 获取映射信息 |
| 进度缓存批量同步 1s 间隔 | 快速完成的任务可能在完成时进度显示不准确 | 新系统应在任务完成时强制同步 |

---

## 后续

1. 将以上行为清单映射到新系统各 feature 的 design spec
2. 补充条件触发匹配算法的详细 oracle 测试用例（AND/OR 短路、各种比较操作符）
3. 调研旧系统帧匹配算法（matchRules 的具体规则生成逻辑）
4. 调研旧系统表达式引擎（`useFrameExpressionManager`）的具体行为，与新 shared/ 引擎对标
5. 调研星座图数据收集的下游消费方式（`dataDisplayStore`）
