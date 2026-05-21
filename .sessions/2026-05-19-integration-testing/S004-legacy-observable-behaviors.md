# [S004] 旧系统可观测行为提取 — 综合报告

> 2026-05-19 | 调研 | 完成
> 9 个 agent 并行提取，3 批 × 3

## 目标

从旧系统代码中提取所有必须保留的可观测业务行为，作为集成测试 oracle 来源和新系统验收基线。

---

## 一、提取总览

| Agent | 调研范围 | 提取行为数 | 保留 | 排除 | 需重新设计 |
|-------|---------|-----------|------|------|-----------|
| 1 | receive/send 数据流 | 36 | 30 | 6 | — |
| 2 | SCOE/task 执行 | 34 | 34 | 0 | — |
| 3 | 连接管理 | 26 | 13 | 6 | 7 |
| 4 | 表达式/解析/条件 | 27 | 19 | 8 | — |
| 5 | 存储/历史/CSV | 27 | 25 | 2 | — |
| 6 | 帧定义管理 | 24 | 20 | 4 | — |
| 7 | 状态指示/健康检查/统计 | 27 | 26 | 1 | — |
| 8 | 设置/配置 | 25 | 21 | 4 | — |
| 9 | 页面入口/路由 | 10 路由 | 6 | 2 | 2 |
| **合计** | | **~236** | **~194** | **~33** | **~9** |

详细产出见各 agent 文件：
- `S004-agent1-receive-send.md`
- `S004-agent2-scoe-task.md`
- `S004-agent3-connection.md`
- `S004-agent4-expression-parser.md`
- `S004-agent5-storage-history-csv.md`
- `S004-agent6-frame-definition.md`
- `S004-agent7-status-indicators.md`
- `S004-agent8-settings-config.md`
- `S004-agent9-routes-pages.md`

---

## 二、按 feature 归口的行为清单

### 2.1 connection feature（连接管理）

**必须保留（13 项）：**
1. 串口四状态生命周期（disconnected → connecting → connected → error）
2. 串口配置参数集（baudRate/dataBits/stopBits/parity/flowControl）+ 每端口独立配置 + 热更新（关闭重开）
3. 多串口并发管理（独立状态/配置/数据通道）
4. TCP 客户端连接（setNoDelay + 5000ms 超时 + \r\n 分割）
5. TCP Server 多客户端管理（广播发送）
6. UDP 绑定 + 远程主机列表 + 广播模式
7. 统一连接目标视图（serial:{port} / network:{connId} / network:{connId}:{remoteId}）
8. 连接统计（bytes/messages/activity per connection）
9. 最后使用串口记忆
10. 应用退出时关闭所有连接
11. TCP \r\n 数据分割（需参数化）
12. 网络连接卡片网格展示（最多 9 个，四态颜色/图标/文本）
13. 连接状态事件驱动实时更新（500ms 防抖）

**排除（6 项）：**
- receivedMessagesMap/sentMessagesMap 100 条内存历史（调试功能）
- 自动连接/自动重连（类型定义存在但未实现）
- 串口热插拔自动检测（无实现）
- Windows 注册表 PowerShell 枚举方式（应迁移到 serialport 库）
- clearBuffer 只重置计数器不真正清空（语义不清）
- autoOpen: false 配置项（始终 false）

**需重新设计（7 项）：**
- 配置持久化方式（localStorage → 新持久化层）
- 网络连接配置持久化（旧系统无持久化）
- IPC 通道命名和 preload 桥接方式
- 连接目标 ID 编码规则
- TCP \r\n 分割参数化
- UDP 远程主机管理持久化
- 高速存储配置持久化

**关键 oracle：** 四状态模型完整、TCP/UDP 行为完整、高速存储分流链路完整。

---

### 2.2 receive feature（接收管线）

**必须保留（17 项）：**
1. 串口/网络数据接收 → 自动帧匹配 → 字段解析 → UI 更新
2. 数据项值增量更新（跳过表达式字段）
3. 帧级统计（每帧 totalReceived/lastReceiveTime/checksumFailures/errorCount）
4. 全局统计（收发包/字节/匹配率/错误率/系统时间）
5. 最近 100 个数据包记录（调试用）
6. 配置自动保存和主进程缓存同步（1s/500ms 防抖）
7. 映射关系验证和孤立数据项清理
8. 表达式字段接收后立即计算
9. 帧识别规则匹配（8 种运算符 AND 逻辑）
10. 11 种数据类型解析（含 BigInt 64 位）
11. 大端/小端字节序
12. applyFactor（乘以 factor，toFixed(5) 限 5 位小数）
13. direct/indirect 数据字段区分
14. labelOptions 标签显示
15. receive→send 条件触发桥接
16. 条件触发 AND/OR 短路逻辑
17. 帧统计面板展示（全局+单帧两种粒度重置）

**关键 oracle：** `public/data/frames/configs/*.json` 中的帧定义可构造固定输入→验证输出。

---

### 2.3 send feature（发送管线）

**必须保留（18 项）：**
1. 单帧发送（表达式计算→倍率→序列化→路由→统计）
2. 顺序发送任务
3. 定时发送任务（间隔/次数/无限循环/首次立即）
4. 定时任务参数变化
5. 条件触发发送（监听→匹配→延时→执行→持续监听）
6. 时间触发发送（6 种重复粒度 + endTime）
7. 任务暂停/恢复（旧行为有缺陷，新系统应正确实现）
8. 任务停止（清理定时器+监听器）
9. 连接断开自动暂停
10. 发送统计（实例级 sendCount/lastSentAt）
11. SCOE UDP 发送记录
12. 实例间延时
13. 帧实例 deepClone 缓存（隔离运行时副本和持久化实例）
14. 任务进度追踪（1s 批量同步）
15. 触发监听器管理
16. 帧实例导入/导出 JSON
17. 帧模板更新联动实例
18. UDP 远程主机发送

**关键 oracle：** 固定帧实例+目标→捕获发送字节可录制。

---

### 2.4 task feature（任务执行引擎）

**必须保留（从 SCOE/task agent 提取的 34 项）：**
- 7 种任务状态完整转换（idle/running/paused/completed/error/waiting-trigger/waiting-schedule）
- 定时发送配置模型（间隔/重复/无限循环）
- 触发发送配置模型（条件触发 + 时间触发）
- 条件评估逻辑（5 种操作符 + AND/OR 短路）
- 4 种多帧策略（immediate/timed/triggered/variable）
- 可变参数发送（fieldVariations + 参数数组长度验证）
- 任务配置导入/导出
- 活跃任务监控（列表/进度/操作控制）
- 进度批量更新优化（1s 缓存同步）

---

### 2.5 command-ingress feature（指令接入 / SCOE）

**必须保留：**
1. SCOE 帧识别流程（功能码验证 + 三标志验证 + 型号/卫星 ID 验证）
2. SCOE 校验和验证（累加取模 256）
3. SCOE 完成条件匹配（固定值模式 + 参数索引匹配模式）
4. SCOE 接收指令配置模型（6 种功能）
5. SCOE 全局字节偏移配置（6 个偏移量）
6. SCOE 卫星配置管理（多卫星 CRUD）
7. SCOE 状态统计（12 个指标）
8. SCOE 测试工具（数据录制 + 高亮显示）
9. SCOE 健康自检（卫星加载 + 帧加载 + 连接路径）
10. SCOE 链路自检（载波/定时/帧三个锁定状态，需改用 ID 匹配）

**关键发现：** SCOE 命令接收与执行的运行时链路在 renderer 侧代码中未找到完整实现，可能在 main process 或尚未实现。

---

### 2.6 frame feature（帧定义管理）

**必须保留：**
1. 帧 CRUD（深拷贝编辑、变更检测、ID 修改含冲突检测）
2. 11 种数据类型 + 4 种输入类型（input/select/radio/expression）
3. 字段操作（添加/删除/复制/移动/编辑 tempField 模式）
4. 字段验证（name 非空、至少一字段、字段名唯一、bytes length > 0）
5. 校验和配置（4 种方法：xor8/sum8/crc16/crc32）
6. 帧识别规则（8 种运算符 AND 逻辑）
7. 帧选项（autoChecksum/bigEndian/includeLengthField）
8. JSON 导入/导出
9. 帧实例从帧模板创建（全字段复制、configurable 标记）
10. 帧更新后实例同步（已存在保留 value、新字段用 defaultValue）
11. 收藏功能（帧级+实例级独立）
12. 帧列表过滤/排序（搜索/direction/日期范围/ID/name/date/usage）
13. 帧复制（深拷贝 + `(副本)` 命名 + 新 ID）

**排除：**
- isSCOEFrame 标记（统一通过指令接入 feature）
- 全量覆盖式导入（应提供冲突处理）
- 无确认删除（应加确认对话框）
- 无级联清理（应在帧删除时触发关联清理）

---

### 2.7 storage feature（存储/历史/高速存储）

**必须保留：**
1. JSON 文件按小时存储历史数据
2. 增量追加记录到小时文件
3. 定时收集（1s）+ 定期持久化（5min）+ 小时边界自动切换
4. 自动开始记录（可配置）
5. 循环缓冲区 + 动态容量 + 时间过期清理
6. 查询可用小时键 + 按时间范围批量加载
7. CSV 导出（文件名/时间范围/数据项/6 种时间格式/预设路径）
8. CSV 格式（逗号分隔、UTF-8、{group}_{item} 表头、ISO 时间戳）
9. 高速存储帧头匹配 + 连接 ID 匹配触发
10. 匹配高速存储规则的数据**不发送到渲染进程**（关键架构分流）
11. 高速存储文件格式（每帧一行十六进制大写）
12. 文件轮转（100MB + 5 文件）
13. 高速存储统计
14. 重置统计 = 删除当前文件
15. 过期数据清理（按天保留）
16. 压缩旧数据文件（gzip）

**关键 oracle：** 高速存储分流行为在 `networkHandlers.ts:515-517` 有明确代码（return 跳过 emitDataEvent）。

---

### 2.8 shared/ expression engine（表达式引擎）

**必须保留（19 项核心）：**
1. 条件-表达式对顺序评估，默认值 0
2. 13 种数学函数注入
3. 4 种变量数据源（CURRENT_FIELD/FRAME_FIELD/GLOBAL_STAT/SCOE_DATA），未解析默认 0
4. 拓扑排序（Kahn 算法）+ 循环依赖检测
5. 类型处理（float/double 保持，整数 Math.floor）
6. 接收帧解析后立即计算；发送帧组帧前计算
7. 错误容错（不崩溃、错误不应用、console.error 记录）
8. 通用比较运算符（6 种 + 自动数值/字符串检测）
9. 发送触发条件（5 种操作符 + AND/OR 短路逻辑）

**排除（8 项实现细节）：**
- `new Function` 求值方式
- 依赖缓存策略
- 计算历史记录
- 各 store 直接依赖（新系统通过 feature public API）

**关键 oracle：** `public/data/frames/configs/3.json` 含多条件表达式+变量映射+自引用。

---

### 2.9 display/visualization feature（数据展示）

**必须保留：**
1. 双表格+三模式（table/chart/constellation）
2. 星座图（IQ 数据源配置 + 按位宽提取 + 定时刷新）
3. 按需数据收集优化
4. 历史数据按分组/数据项过滤 + 多图表展示（1-4 图表）
5. 多图表独立配置（标题/Y 轴/数据项选择）

---

### 2.10 settings feature（配置管理）

**必须保留（21 项）：**
- 应用级 7 项（autoStartRecording、csvDefaultOutputPath、csvSaveInterval、updateInterval、maxHistoryHours、enableAutoSave、enableHistoryStorage）
- 串口配置 3 项（per-port、default、lastUsedPort）
- 数据显示 3 项（双表格分组选择、星座图参数、历史图表配置）
- 状态指示灯 1 项
- 高速存储 1 项
- SCOE 配置 2 项
- 帧定义默认值 3 项
- 多帧发送策略 1 项

**排除（4 项运行时状态）：**
- 帧过滤器 UI 状态（不持久化）
- 串口消息缓冲区
- 自动滚动
- 记录运行时状态

---

## 三、关键发现

### 3.1 新系统缺失的 3 个页面

| 旧页面 | 功能 | 优先级 |
|-------|------|--------|
| `/storage` | 高速存储管理（几百 Mbps 网络数据存储配置） | 高 |
| `/history` | 历史数据分析（时间选择+多图表+CSV 导出） | 高 |
| `/settings` | 系统设置 | 中 |

### 3.2 SCOE 命令执行运行时链路缺失

旧代码中定义了 SCOE 接收指令的完整配置模型（6 种功能码、完成条件、校验和），但 renderer 侧代码未找到"收到 TCP 数据 → 解析指令码 → 匹配功能 → 执行"的完整运行时链路。可能位于 main process 或尚未实现。需进一步确认。

### 3.3 高速存储分流是关键架构决策

匹配高速存储规则的网络数据**不发送到渲染进程**（`networkHandlers.ts:515-517` return 跳过 emitDataEvent）。这意味着部分网络数据只有文件级记录，不经过 receive 管线。新系统必须保持等价行为。

### 3.4 旧系统已知缺陷清单（不应复制到新系统）

| 缺陷 | 位置 | 影响 |
|------|------|------|
| 暂停后定时器不真正暂停 | useSendTaskController.ts | 定时器继续触发但被 isTaskStillRunning 跳过 |
| 任务停止状态为 completed 而非 cancelled | sendTasksStore | 用户停止和自然完成无法区分 |
| 串行处理锁可能成为高频瓶颈 | receiveFramesStore.ts | 所有数据源共享一个处理锁 |
| SCOE 模块直接耦合 receiveFramesStore | receiveFramesStore.ts | SCOE 逻辑嵌入 receive 主路径 |
| globalStats 累加计数器无持久化 | globalStatsStore | 重启后统计清零 |
| 条件匹配直接访问 receive store 内部 | useSendTaskTriggerListener.ts | 触发监听器直接访问 receive store |
| 进度缓存 1s 批量同步 | sendTasksStore | 快速完成任务进度显示不准确 |
| 帧删除无级联清理 | frameTemplateStore | 关联实例/映射不会被自动清理 |
| 帧导入全量覆盖 | FrameList.vue | 导入会覆盖所有现有帧 |
| TCP \r\n 分割硬编码 | networkHandlers.ts | 不支持其他分割符 |
| 链路自检用数据项标签名匹配 | linkCheck.ts | 脆弱，应改用 ID |

### 3.5 Oracle 来源评估

| 行为领域 | oracle 可信度 | 来源 |
|---------|-------------|------|
| 串口/网络连接生命周期 | 高 | 四状态模型代码完整 |
| 帧解析（11 种类型） | 高 | `public/data/frames/configs/*.json` |
| 表达式引擎 | 高 | `configs/3.json` + 代码逻辑 |
| 高速存储分流 | 高 | 代码链路完整 |
| SCOE 命令执行运行时 | 低 | 配置模型完整但运行时链路未找到 |
| CSV 导出格式 | 高 | 代码逻辑完整 |
| 任务状态机 | 高 | 7 状态 + 转换规则完整 |

---

## 四、排除规则（供 S006 综合阶段使用）

以下旧行为**不进入**集测范围：

1. 已标记为旧系统缺陷的行为（上表 11 项）
2. 实现细节（`new Function`、缓存策略、LRU、序列化方式）
3. 各 store 间的直接依赖（新系统通过 feature public API）
4. 纯 UI 运行时状态（展开/折叠、自动滚动、过滤器面板）
5. 硬编码的旧协议预设（网络测试工具快速发送）
6. isSCOEFrame 标记（统一到指令接入）
7. 全量覆盖式导入导出策略
8. Windows 注册表串口枚举方式

---

## 五、集测高价值 oracle 样本清单

| 文件 | 内容 | 集测价值 |
|------|------|---------|
| `public/data/frames/configs/*.json` | 帧定义（含表达式字段） | 帧解析/匹配 oracle |
| `public/data/templates/framesConfig.json` | 帧配置模板 | 帧结构 oracle |
| `public/data/templates/sendInstances.json` | 发送实例（含表达式） | 发送帧 oracle |
| `public/data/templates/scoeReceiveCommands.json` | SCOE 接收指令 | 条件匹配 oracle |
| `public/data/scoe/satelliteConfigs/1.json` | 卫星配置 | SCOE 识别参数 oracle |
| `public/data/scoe/scoeConfigs/1.json` | SCOE 全局配置 | SCOE 帧识别偏移 oracle |

---

## 后续

1. **S005（对话 5）**：新系统接缝审计，应重点验证上述行为在新系统代码中的实现覆盖度
2. **S006（对话 6）**：综合所有提取结果，按 P0/P1/P2 分级形成最终集测清单
3. SCOE 命令执行运行时链路需在接缝审计中确认
4. 3 个缺失页面（存储/历史/设置）需确认是否在集测范围内
