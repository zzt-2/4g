# Runtime 下一阶段全局规划对话记录

> 日期：2026-05-07
> 性质：方向把控对话，不做任何设计或实施，只确保方向正确、功能划分正确
> 参与者：用户（项目 owner）、AI（Claude）
> 背景：9 个 feature 全部建成，runtime wiring 已完成，核心数据通路骨架已通但还没接真实能力

---

## 一、对话目标与范围

用户明确提出本轮对话定位：

> 我需要设计和实现 rewrite 项目的下一步：让 runtime 真正跑起来。
> 当前状态：9 个 feature 全部建成，runtime wiring 已完成，核心数据通路骨架已通但还没接真实能力。下一轮目标是两件事：
> 1. platform 打通 — 让 real serial adapter 通过 Electron main/preload 真正可用
> 2. routingTick 调度 — 让闭环自动转起来

> 不需要最小方案。好不容易有这么一次全局检查、判断方向的机会。尽可能把后面一段时间的规划路线定下来，至少得想想哪些功能放一起，哪些功能可以不要，哪些功能一块做，然后这一堆功能先后顺序啥的。不止讨论后面这一点。你现在大概能知道整体情况吧？

> 这个对话不会做任何的设计、实施，只把控全局，确保方向没歪、功能划分正确。

---

## 二、两轮摸底（6 个 Agent 并行探索）

### 第一轮：现状摸底

#### Agent 1：Platform 代码现状

**读取文件：**
- rewrite/src/platform/index.ts
- rewrite/src/platform/transport.ts
- rewrite/src/features/connection/adapters/real-serial-adapter.ts
- rewrite/src/features/connection/adapters/fake-transport-adapter.ts

**发现：**

TransportFacade 接口完整签名：

```typescript
export interface TransportFacade {
  enumerateSerialPorts(): Promise<readonly SerialPortCandidate[]>;
  connectSerial(config: SerialConnectConfig): Promise<TransportCommandResult>;
  disconnect(connectionId: string): Promise<TransportCommandResult>;
  write(connectionId: string, bytes: readonly number[]): Promise<TransportCommandResult>;
  cleanup(): Promise<TransportCommandResult>;
  drainEvents(): readonly TransportBridgeEvent[];
  onEvent(callback: (event: TransportBridgeEvent) => void): () => void;
}
```

Window bridge 机制：
- 全局键 `dongfanghongRewritePlatform`，preload 通过 `contextBridge.exposeInMainWorld` 暴露
- `getTransportFacade()` 获取桥接对象，单例缓存
- `createTransportFacade()` 将底层 TransportBridge 包装成 TransportFacade

RealSerialAdapter：
- 期望完整的 TransportBridge 接口
- 额外提供 `discoverResources()` 方法通过 `transport.enumerateSerialPorts()` 发现串口

FakeTransportAdapter：
- 完全内存运行，不需硬件
- 提供失败注入（`setFailure`）、数据推送（`pushData/pushError/pushClose`）、状态检查（`readStoredConfig/readWrittenBatches`）
- 事件存储在内存队列，需手动触发

共享类型文件：`rewrite/src/shared/platform-bridge.ts`

#### Agent 2：Electron 层现状

**读取文件：**
- rewrite/src-electron/preload/ 所有文件
- rewrite/src-electron/main/ 所有文件

**发现：**

Preload 暴露的 API（通过 `contextBridge.exposeInMainWorld`）：

```typescript
interface RewritePlatformBridge {
  getBridgeInfo(): RewritePlatformBridgeInfo;
  readonly transport: TransportBridge;
}
```

Main 进程模块：
- `index.ts`：应用生命周期、BrowserWindow 管理、安全配置（nodeIntegration: false, contextIsolation: true, sandbox: false）
- `serial-handlers.ts`：生产级串口管理

串口能力（已完整）：
- 枚举、连接、断开、读写
- 数据接收批处理（batchBuffer，基于时间和字节数的智能刷新）
- 6 个 IPC channel：`transport:enumerate-serial-ports`、`transport:serial-connect`、`transport:serial-disconnect`、`transport:serial-write`、`transport:cleanup`、`transport:event`
- 多连接并发管理、错误处理、区分主动/意外断开

网络能力：**完全缺失**（TCP/UDP/HTTP/FTP 均未实现）

文件系统能力：**完全缺失**

#### Agent 3：架构硬约束

**读取文件：**
- codestable/architecture/rewrite-target-structure.md
- codestable/architecture/rewrite-system-architecture.md
- codestable/architecture/boundary-desktop-capability-access.md

**发现：**

Platform 边界精确定义：
- Renderer 访问桌面能力的唯一正式入口
- 只表达能力，不承载业务语义
- 允许访问的能力类别：window/menu/app shell、files/path/dialogs、serial/network transport、scheduling、打包数据路径、可选 HTTP/FTP transport

Main process 硬红线（禁止承载）：
- Receive 业务逻辑（帧匹配、字段解析、表达式输入、接收结果输出）
- Send 业务逻辑（发送任务生命周期、步骤编排、SCOE 成功条件判断、报告交付语义）
- Task 系统（中心任务上下文、用例执行上下文推进）
- SCOE 业务（协议解析、命令解析、完成条件定义）
- Storage 业务（数据模型、导入导出语义）
- Result/Report/Northbound 业务

Main process 可以保留（仅限平台侧）：
- 串口/网络 socket 生命周期管理
- 文件系统、路径、系统对话框
- 窗口控制、应用生命周期
- 高频数据的平台侧缓冲、批处理、聚合、节流、队列和背压

Renderer 禁止直接访问：
- Node.js/Electron 原生模块
- 裸 IPC 调用
- 裸 Platform 对象（window.electron）
- 业务侧直接访问平台资源

高频数据性能处理归属：
- Main 可以做平台侧性能处理（buffer/batch/queue/throttle/backpressure）
- Main 不能做业务语义（接收分类、Storage 规则、Task/Result/Report 统计含义）
- 高频数据目标流：platform resource → main buffer → preload bridge → platform facade → feature service → read model → throttled UI

Preload 职责边界：
- 只暴露最小 typed bridge
- 禁止暴露裸 invoke/send/on、任意 channel、window.electron 大包
- 禁止承载业务逻辑

Runtime 约束：
- 可以做：应用启动/销毁、依赖注入、跨 feature 编排、边界例外登记
- 不能做：承载领域内部规则、直接访问 Electron/Node、成为全局杂物箱

Feature 间通信规则：
- 允许：公开 service 调用、runtime 编排、显式事件、边界输入输出
- 禁止：直接 import 其他 feature 的内部 state、绕过 public API、通过共享状态回读编排

### 第二轮：专项约束

#### Agent 4：Connection ↔ Platform 桥接细节

**读取文件：**
- codestable/architecture/rewrite-connection-platform-bridge.md
- codestable/architecture/rewrite-connection-transport-boundary.md
- codestable/architecture/rewrite-platform-api-surface-reduction.md

**发现：**

Transport 事件完整路径：
```
native resource (main)
  → main-side buffer / batch / queue / backpressure
  → 最小化 typed preload bridge
  → rewrite/src/platform facade
  → connection real transport adapter
  → connection service/state/read model
  → runtime route
  → receive / send / SCOE / status public boundary
  → feature-owned read model
  → throttled UI snapshot
```

API 表面收敛决策：
- 必须删除：`window.electron` 大包、`src/api/common/index.ts`、renderer 侧直接 Electron/Node 入口、`timerManager.onCustomEvent`、重复文件对话路径、`systemApi.electronAPI`
- 需要合并：window/menu/app shell → 一条 path；files/path/dialog → 一条 path；scheduling → 统一 facility；IPC tooling → 合并到 main

Owner Split 职责划分：

| Owner | Owns | Must not own |
|-------|-------|--------------|
| platform | renderer 侧 facade；桥接可用性 | 连接配置语义、target identity、receive parsing、send result |
| preload | 最小 typed bridge | 裸 invoke/send/on、window.electron 大包 |
| main | native resource handle；资源生命周期；buffer/batch/queue | frame matching、receive classification、send task state、SCOE completion |
| renderer | 通过 platform facade 使用能力 | Node/Electron 直连 |
| connection | transport config meaning；runtime connection facts | 业务帧解析、send 构帧、task 推进 |
| runtime | app 级装配、跨 feature 路由 | transport native resource 细节、领域规则 |

高频数据批处理/节流策略：
- Main 可保留：input byte batching、write queueing、subscription queueing、bounded lifecycle/error event buffering、throttle/coalesce、overflow/backpressure signal、resource cleanup drain
- 关键规则：overflow 必须作为 transport-level material 可观测，不能静默转换为业务 failure
- 禁止：全窗口无差别广播 raw bytes、main 用业务规则决定 bytes 进入链路

#### Agent 5：Runtime 职责 + Feature 交互

**读取文件：**
- codestable/architecture/rewrite-thin-ui-runtime-wiring.md
- codestable/architecture/rewrite-feature-interaction-matrix.md
- codestable/compound/2026-04-28-rewrite-execution-charter.md

**发现：**

Runtime 能做什么：
- 应用级装配与编排（wireFeatures, createRewriteRuntime, destroy）
- 跨 feature 公开 API 编排
- 边界例外管理
- routingTick()：执行事件路由

Runtime 不能做什么：
- 存储 feature 业务状态
- 实现 frame 校验、settings 合并、storage CSV/history 语义
- 承载 receive 解析、send 构帧、task 生命周期、SCOE 协议
- 成为全局 store、事件总线、命令总线

Feature 交互契约：

Connection → Receive：
- 交互类型：Explicit Event + Runtime Orchestration + Selector
- 高频：是
- 实现：ConnectionToReceiveInputSource + routingTick()

Connection → Send：
- 交互类型：Selector + Public Service + Runtime Orchestration
- 实现：ConnectionBackedSendWriter + ConnectionBackedTargetResolver

Receive → Task：
- 交互类型：Explicit Event + Runtime Orchestration + Selector
- 实现：ReceiveEventSourceBridge + routingTick()

Task → Send：
- 交互类型：Public Service + Runtime Orchestration
- 已决策：Promise<SendResult> 主要方式

Task → Result：
- 交互类型：Explicit Event + Runtime Orchestration + Selector
- 已决策：stop→stopped（非 completed）；result 只消费 TaskInstanceCompletion

SCOE 特殊交互（边界例外）：
- SCOE 入站 bypass receive，直接从 connection transport event 到 SCOE adapter
- SCOE 出站通过 task→send 路径

重写章程优先级与实施顺序（Phase 1-5）：
1. Phase 1：frame / storage / settings（静态资产与持久化）
2. Phase 2：platform / connection（平台与连接）
3. Phase 3：receive / send / task（核心收发链）
4. Phase 4：scoe（SCOE 专项能力）
5. Phase 5：status / result / report / northbound（对外闭环）

Runtime 代码实际状态：
- wireFeatures()：完整的三层依赖装配（L0→L1→L2→L3）
- routingTick()：connection drain → filter data → receiveService.drainInputSource → ConditionMatchInput → receiveEventSourceBridge.emit
- destroy()：资源清理
- 所有 bridge 模式已实现
- 测试覆盖：routing-tick.spec.ts、feature-wiring.spec.ts、rewrite-runtime.spec.ts
- 缺失：无真实串口/TCP/UDP 测试、无高频数据压测、无端到端集成测试

#### Agent 6：调度 + 任务系统约束

**读取文件：**
- codestable/architecture/topology-receive-send-mainlines.md
- codestable/architecture/domain-task-system-ownership.md
- codestable/architecture/rewrite-feature-boundaries.md

**发现：**

接收主链四层架构：
1. 输入承接层：承接连接事件，整理成标准输入包
2. 解析/归一层：原始字节 → 标准化接收结果
3. 领域分发层：按领域入口条件分发到通用接收输出或领域模块
4. 结果输出层：接收结果 → 明确边界输出

发送主链四层架构：
1. 发送请求承接层：承接显式发送请求
2. 通用编排/归一层：检查执行上下文、生命周期状态、目标可解析性
3. 目标落地层：交给传输层执行
4. 执行结果输出层：标准发送执行结果

任务系统核心对象层级：
```
中心任务上下文（一级运行骨架）
  → 用例执行上下文（任务骨架内的当前执行层）
    → 本地发送执行对象（用例执行层之下的局部执行载体）
```

任务生命周期语义：
- 等待触发 → 等待调度 → 执行中 → 停止中 → 已停止 / 已完成 / 异常中止

三种调度循环：
- runTimedLoop：定时循环，按间隔时间重复执行
- runTriggerLoop：触发循环，基于条件注册表等待触发
- runSequenceLoop：序列循环，一次性顺序执行

完成条件判断：
- ConditionMatchInput 来自接收主链输出
- conditionRegistry.processInput() 处理匹配
- 超时策略：continue / skip / fail

routingTick 的架构定位：
- 不是主状态，只是调度函数
- 不是任务系统，只负责数据路由
- 数据流：Platform Events → connectionService.drainAdapterEvents() → routingTick() → receiveService.drainInputSource() → receiveEventSourceBridge.emit() → taskService.conditionRegistry.processInput()

数据从"收到字节"到"业务可用"经过的层级：
```
物理层（串口/网络字节）
  → 平台适配层（connectionService.drainAdapterEvents → TransportEventSnapshot）
  → 路由调度层（routingTick 过滤 data 事件）
  → 输入承接层（ConnectionToReceiveInputSource → ReceiveInputEvent）
  → 解析/归一层（processReceiveBatch → 帧匹配 → 字段解析）
  → 领域分发层（ReceiveBatchOutcome → matched/unmatched）
  → 结果输出层（转换为 ConditionMatchInput）
  → 条件匹配层（conditionRegistry.processInput）
  → 执行编排层（runTimedLoop/runTriggerLoop/runSequenceLoop）
  → 发送请求承接层（sendService.sendRequest）
  → 通用编排层（帧构建、目标解析、传输写入）
  → 执行结果输出层（SendResult）
  → 业务可用（TaskStepResult → TaskInstanceState → TaskExecutionSummary）
```

Feature 间依赖层次（代码实现）：
```typescript
// L0: 无跨依赖
frameReader, settingsService, storageReader
// L1: 需要 adapter
connectionService({ adapter })
// L2: 需要 L0 + L1
receiveService({ frameReader })
sendService({ frameReader, targetResolver, transportWriter })
// L3: 需要 L2
taskService({ sendService, receiveEventSource })
```

---

## 三、第一轮摸底汇总与初步分组

### 现状速写

骨架通、测试全、UI 为零。串口链路从 main 到 adapter 代码全到位。网络 transport 全缺。文件系统全缺。

### 初步功能分组（后被推翻）

AI 提出的初始分组：

- A：启动链路（bootstrap）— runtime 实例化、platform 检测、routingTick 驱动
- B：帧定义 + 收发 + 串口 connection
- C：任务 + SCOE
- D：网络扩展
- E：数据持久化 + 结果
- F：北向交付
- G：UI

顺序：A → B → C‖D → E → F → G

### 用户关键纠正

#### 纠正 1：网口和串口是同一个模块

用户原话：

> 遥控遥测是串口、网口，scoe是网口，新的甲方的是https（我没记错的话），这些应该算在一起吧？

传输层不应该按类型拆阶段。串口、TCP/UDP 都是 connection feature 的不同 adapter，不应该分成"串口先做、网口后面再加"两个阶段。业务流程（遥测、SCOE、北向）只是选择不同的连接类型。

#### 纠正 2：Receive 和 Task 是分开的

用户原话：

> receive和 task emit不是应该是分开的吗？接收指的是遥测？那我是把收到的帧解析之后参数存起来（或者某些参数用于触发别的像是发送、任务之类）。task emit就是任务吧？然后scoe到指令码、新甲方的指令码，这些不走receive吧？

正确的数据流分法：

```
connection events
  ↓
routingTick 分流
  ├→ receive（遥测）：解析帧 → 存参数 → 部分参数作为条件触发 task
  ├→ SCOE / 指令码：bypass receive，直接走自己的 adapter
  └→ （未来可能有其他领域模块）
```

三条路是独立的，routingTick 只负责分发，不是把 receive 和 task 串成一条线。

---

## 四、十一个业务流程详细描述

AI 对每个流程做了详细描述，用户确认后进行了多轮纠正。

### Flow 1：设备连接管理

**是什么**：管理上位机和被测设备之间的物理连接。是所有数据流的底层依赖。

**涉及传输类型**：串口、TCP client、TCP server、UDP。

**完整过程**：
1. 用户在连接页面选择传输类型（串口/TCP/UDP）
2. 选择或输入目标参数（串口：端口+波特率；TCP client：IP+端口；TCP server：监听等待设备连入；UDP：绑定本地端口+对端地址）
3. 点击连接 → connection service 通过 adapter 调用 platform transport → 建立物理连接
4. 连接成功后进入"已连接"状态，成为后续收发的 target
5. 持续监听连接状态（意外断线、设备热插拔）
6. 意外断线时：检测到 → 状态变为"已断开" → 可选自动重连策略 → 通知上层
7. 用户主动断开 → 清理资源 → 状态变为"空闲"
8. 支持同时存在多个连接

**产出**：一组活着的连接，每个有 ID、状态、配置。

### Flow 2：遥测接收

**是什么**：从已建立的连接接收设备上报的遥测数据，解析出具体参数值并存储。

**涉及传输类型**：串口、TCP/UDP。

**完整过程**：
1. 设备通过已建立连接主动上报数据（字节流）
2. main 侧串口/网络 handler 收到原始字节 → 批处理缓冲 → 通过 preload bridge 推到 renderer
3. routingTick 定期排空 connection 的事件队列
4. routingTick 识别这是遥测数据，分发到 receive 路径
5. receive service 处理：帧匹配 → 字段解析 → 归一化
6. 解析成功的参数值存入 receive read model
7. 如果参数值满足预设触发条件，emit 条件匹配事件
8. 条件匹配事件可以被 task service 消费

**产出**：当前参数最新值（read model）、条件匹配事件、接收统计。

### Flow 3：遥控发送

**是什么**：通过已建立的连接向设备发送控制指令。

**涉及传输类型**：串口、TCP/UDP。

**完整过程**：
1. 触发来源：用户手动操作，或任务步骤自动触发
2. send service 处理：帧构造 → 目标解析 → 传输写入
3. 返回发送结果：成功/失败

**产出**：发送结果。

### Flow 4：SCOE 协议处理（后被重命名为"指令接入"）

**是什么**：SCOE 是一套专门的设备控制协议。**后经用户纠正，SCOE 和新甲方统一为"指令接入"模块。**

**涉及传输类型**：TCP/UDP（网口）。

**完整过程**（按纠正后的理解）：
1. 外部系统（SCOE TCP / 新甲方 HTTPS）发指令给我们
2. connection adapter 接收（不同传输，同一层）
3. 指令解析（各自协议格式）
4. 翻译成内部动作（大多情况：生成一个 task 去执行）
5. task system 执行
6. 结果回传给外部系统

**特殊点**：入站 bypass receive，走指令接入路径。

### Flow 5：任务执行

**是什么**：自动化测试的核心。

**完整过程**：
1. 用户创建/选择任务定义（步骤、执行模式）
2. 启动 → 创建任务实例，状态"执行中"
3. 按执行模式进入循环（定时/触发/序列）
4. 每步骤执行（send / wait-condition / delay / SCOE）
5. 所有步骤完成 → 任务完成 → 汇总结果
6. 异常处理（步骤失败策略、超时策略、手动停止）
7. 完成后交给 result 处理

**产出**：任务执行结果。

### Flow 6：结果收集

**是什么**：把任务执行过程数据收集归口。

**完整过程**：task 完成步骤 → emit 步骤结果 → task 整体完成 → emit 任务完成事件 → result 收集步骤结果、参数快照、汇总信息。

**产出**：结构化测试结果数据。

### Flow 7：数据存储

**是什么**：持久化存储遥测参数历史、任务结果等。

**注意**：用户确认不需要兼容旧格式，新系统从零开始。

### Flow 8：帧定义管理

**是什么**：定义系统中所有帧的结构——解析和构造的"字典"。

**注意**：用户确认新系统重新定义格式（JSON），旧数据写迁移脚本。帧定义全局唯一，不存在第二套帧结构。

### Flow 9：报告生成

**是什么**：根据任务结果按甲方要求格式生成测试报告。

### Flow 10：北向交付

**是什么**：把结果/报告推给甲方系统（HTTPS）。

### Flow 11：系统设置

**是什么**：管理应用各类配置。

---

## 五、SCOE 重命名为"指令接入"

### 用户的纠正

用户原话：

> SCO其实和新甲方他们一样，指令码（新甲方是https接口）控我们，可能是跟新甲方任务一样，发一系列遥控帧，可能是运维方面，可能是什么乱七八糟的（这些感觉都可以算到任务？毕竟触发源一样，中间过同一处之后分开）。所以我一直觉得，SCOE得改个名字，叫什么都行，然后SCOE和新甲方都是这里面一部分

用户原话：

> SCOE那块，当时我弄的就比较接近现在任务希望的，不过弄的挺乱的，搞了独立帧列表，独立的条件啥的，一堆乱七八糟的，这都得好好分解，想想哪里需要什么

### 架构纠正

之前的理解（有问题）：
- SCOE = 独立 feature，有 bypass receive 特殊路径
- 北向 = 独立 feature，HTTP/FTP 交付
- 两者不相关

纠正后的理解：
- **指令接入 feature**：统一收 SCOE + 新甲方，解析外部命令，翻译成内部动作（通常是 task），执行后回应。传输层差异只是 adapter 不同。
- **北向交付 feature**：我们把结果/报告主动推给外部系统。这是出站方向，和指令接入是两个独立能力。
- SCOE 的"bypass receive"不再是架构例外——它根本就不走 receive 路径，它走的是指令接入路径。

三条路在 routingTick 层分流，各走各的：
- 遥测走 receive
- 遥控走 send
- 外部指令走指令接入

### 指令接入内部的分发

大多数外部指令进来后是"发一系列遥控帧 + 等条件"，和手动创建的 task 结构一样。但有几类可能不是 task：
- 查询类：外部系统问"当前设备状态" → 直接返回 read model 快照
- 运维类：重连、重启采集、清理数据 → 直接调对应 service
- 纯控制类：立即发一帧，不等待条件 → 可能就是一个 send

指令接入 feature 的设计：解析完命令后根据命令类型分发到不同处理器——task 只是其中一种处理器。feature 保留分发权，具体执行委托给已有 feature（task / send / connection / storage）。

---

## 六、五大风险识别

AI 提出了五个"不修后面必炸"的问题，用户基本认可。

### 风险 1：routingTick 无背压

routingTick 是同步 drain 模型。一个 tick 里可能积了几百个 batch，receive 解析同步阻塞，整个链路在同一个微任务里跑完。

经用户纠正后降级：routingTick 本身只是轻量分发，重的活在各自 context 里跑。真正要注意背压的是 receive 解析那一环。

**建议**：B 组预留背压和分批处理口子，routingTick 内部按预算截断。

### 风险 2：无断线重连

connection service 能连能断，但断线后没有自动重连闭环。

**建议**：在 connection 实现时一起做，指数退避 + 用户可感知的状态。

### 风险 3：Bridge 胶水膨胀

当前四个 bridge 是手写薄适配器。后面加 SCOE→task、task→result、result→report 等每条交互路径都多一个 bridge 文件。

**建议**：不提前做框架，观察重复模式后考虑提取 `drainBridge(producer, transform, consumer)` 工具函数。

### 风险 4：Storage 和 Result 是完全空壳

正常，先铺骨架后填肉。但 E 组工作量可能比预期大。

### 风险 5：无端到端集成测试路径

330+ 单元测试覆盖 feature 内部逻辑，但没有"fake adapter → routingTick → receive → task → send → result"的端到端测试。

**建议**：A 组完成后立刻补一条端到端集成测试，后续每组扩展。

---

## 七、表达式引擎 — 最关键的共用件

### 用户的深入说明

用户原话：

> 表达式这个，应该是和发送那边一模一样吧？都是放到共用那边的，两边用的时候就几行？

用户原话：

> 但表达式里面可能用到各种东西，比如发送的时候，可能用到当前帧参数，可能用到遥测（可视化）那边维持的参数，可能用到一些全局的参数（比如时间啥的），那它是作为一个功能模块？不然shared里不方便获取这些吧？还是说打算全部外部传入？也不是不行。

用户原话（关于表达式的问题细节）：

> 接一个帧，它里面可能有表达式运算（这个发送、接收都有，而且之前写的不好，这个必须考虑变量先后顺序，比如前面变量算完了，后面得用算完的接着算，而不是算之前的，还得考虑性能。总之之前写的很烂，来回打了不少补丁）

### 表达式引擎的使用场景

用在：
- **接收**：帧内字段值经过表达式计算得到最终参数值
- **发送**：用户填的参数值经过表达式计算得到要写入帧的字节
- **任务**：条件判断、步骤参数填充
- **指令接入**：外部命令参数翻译
- **报告**：统计计算

### 核心难点

**变量依赖顺序**：A 表达式算完得出值，B 表达式依赖 A 的结果，必须用 A 算完后的值继续算，不能用原始值。加上性能要求，这不是简单 eval，需要正经的求值器。

### 表达式变量的来源

- 当前帧参数（本帧上下文）
- 遥测当前值（receive 的 read model）
- 全局参数（时间、系统计数器等）

### 设计决策：纯函数 + 外部传参

路线 B（全部外部传入）胜出。表达式引擎是 shared/ 纯函数：

- 输入：一堆变量（Map<name, value>）+ 一堆表达式文本
- 输出：按依赖排序求值的结果
- 引擎不管变量从哪来，调用方自己收集

调用方知道需要哪些变量源：
- send service 调用表达式时：读 receive selector（公开只读）+ 读 settings（公开只读）+ 本帧上下文（自己的）
- 不存在"表达式引擎反向依赖 receive/send/settings"的问题

变量命名空间约定：`$遥测.温度`、`$本帧.系数`、`$global.时间`，在帧定义里约定，引擎按名字查 map。

---

## 八、接收管线 — 比预期复杂得多

### 用户的深入说明

用户原话：

> 最需要慎重考虑的就是接收。比如接一个帧，它里面可能有表达式运算……然后可能得更新星座图（演示这些，比如表格、折线图、星座图啥的，你是不是忘了？星座图特殊，还得单独记，别的考虑到存储也是有些麻烦，容易爆炸），得更新表格，可能触发别的发送一帧或者一个任务里某个步骤推进或者触发别的什么；然后表达式不仅是帧内参数，别的地方也都有很多。

### 正确的接收管线

```
收到字节 → 帧匹配 → 提取原始字段
  → 表达式求值（带依赖排序）
  → 得到最终参数值

最终参数值出来之后，多条岔路同时走：
  ├→ ① 存参数值（read model，当前最新值）
  ├→ ② 更新可视化：
  │     - 表格（参数值填进表格行）
  │     - 折线图（参数值追加到时间序列）
  │     - 星座图（特殊 — 需要单独记录 I/Q 采样点，数据量大，存储策略不同）
  ├→ ③ 存历史（持久化，但要控制量，容易爆炸）
  ├→ ④ 检查条件匹配 → 可能触发：
  │     - 发一帧（立即 send）
  │     - 推进任务步骤
  │     - 触发其他什么
  └→ ⑤ 如果没匹配到任何已知帧 → 记录为未匹配
```

这不是"receive feature 内部的事"，输出扇出到好几个地方：可视化（UI 层）、存储（持久化层）、条件匹配（task 层）、直接触发 send（send 层）。

### 星座图特殊性

- 普通参数：一个帧一个值，数据量可控
- 星座图：一个帧可能带几十到几百个 I/Q 采样点，高频帧一秒几十帧，数据量爆炸
- 不能和其他参数用同一个存储策略，必须有独立的采样/存储/清理机制

### 接收管线的五个子问题

1. 帧匹配 + 字段提取（依赖帧定义）
2. 表达式求值（依赖 shared 表达式引擎）
3. 参数值存储（read model + 持久化，持久化策略要考虑数据量控制）
4. 可视化数据管道（表格/折线图/星座图各自不同的数据形态）
5. 条件匹配 + 副作用触发（send / task step / 其他）

---

## 九、最终模块划分

### 用户的纠正原则

用户原话：

> 表达式这个，应该是和发送那边一模一样吧？都是放到共用那边的，两边用的时候就几行？然后，整个系统，帧的结构不应该出现第二个？这样所有地方都能通用一套工具（我怀疑你之前没遵守这个）。存储则是单独模块，接收这边调用而已。可视化同样是单独模块，条件触发我觉得也算单独的？毕竟，输入很多（接收、发送、别人给的都可以算做这个？），输出很多（感觉这些都能统一，但也可能是我想错了）

### 纠正后的归属

- **表达式引擎**：shared/ 纯工具，两边调用就是几行
- **帧结构**：全局唯一，不存在第二个帧模型
- **存储**：独立模块，receive 只是调用方
- **可视化**：独立模块
- **条件匹配**：分两层——匹配逻辑（shared/ 纯函数）+ 触发行为（各 feature 自己管）

### 条件匹配的两层分离

**匹配层（shared/ 纯函数）**：
"这个事件满不满足这个条件？"——纯逻辑，无状态。接收参数值 > 阈值、发送结果 == 失败、外部命令类型 == 某个值，底层都是"输入事实 + 条件定义 → 是否匹配"。

**触发层（各 feature 自己管）**：
"匹配了之后干嘛？"——业务语义，每个 feature 不一样：
- task 的 wait-condition 步骤：匹配了 → 推进当前步骤
- 指令接入：匹配了 → 回应外部系统
- 发送失败重试：匹配了 → 重新发送

不统一也不应该统一——统一了就是事件总线，架构明确禁止。

### 最终模块全景

| 模块 | 性质 | 核心职责 | 被谁消费 |
|------|------|---------|---------|
| **表达式引擎** | shared/ 纯工具 | 带依赖排序的表达式求值 | receive、send、task、指令接入、报告 |
| **帧定义** | frame feature | 唯一帧模型，解析+构造 | receive、send、指令接入、task 引用 |
| **条件匹配** | shared/ 纯工具 | 事实 + 条件 → 是否匹配 | task、指令接入、任何需要条件判断的地方 |
| **connection** | connection feature | 传输管理，串口/TCP/UDP adapter | receive、send、指令接入 |
| **receive** | receive feature | 帧匹配→表达式求值→产出参数事实→分发 | 给可视化/存储/条件匹配提供输入 |
| **send** | send feature | 参数+帧定义→构造字节→写入连接 | task、指令接入、条件触发 |
| **task** | task feature | 步骤序列执行引擎 | 手动任务、指令接入触发 |
| **指令接入** | 指令接入 feature | 接收外部命令→翻译→分发执行→回应 | SCOE、新甲方 |
| **storage** | storage feature | 持久化+查询+导出+清理策略 | receive 存参数、task 存结果、报告存文件 |
| **可视化** | visualization feature | 表格/折线图/星座图数据管道+渲染 | receive 推送参数数据 |
| **result** | result feature | 结果收集+归口 | task 产出、报告消费、指令接入回应 |
| **报告** | report feature | 按模板生成报告文件 | result 输入、北向交付消费 |
| **北向交付** | northbound feature | HTTPS 推送结果/报告给外部 | report 输出 |
| **settings** | settings feature | 配置管理 | 所有 feature |

---

## 十、跨模块交互 — 旧 store 教训与新架构

### 用户的核心担忧

用户原话：

> 不同模块之间怎么跨模块交互。我之前是全部用的store，结果就是成一坨屎山了。新的架构说实话我没咋看，也不知道行不行，挺担忧的。

### 旧系统怎么烂的

```
Feature A 的 store ← Feature B 直接 import 并读写
Feature B 的 store ← Feature C 直接 import 并读写
Feature C 的 store ← Feature A 直接 import 并读写
```

结果：没有单向数据流、没有 owner、没有边界、没法测试。

### 新架构的四种合法跨模块交互方式

**1. 调用 public service（命令）**
```
task 调 sendService.sendRequest({ frameId, targetId, params })
```
task 不知道 send 内部怎么实现，只知道 public API。

**2. 读 public selector（只读查询）**
```
send 读 receiveSelector.getCurrentValues()
```
send 需要遥测当前值来算表达式，通过 receive 暴露的只读 selector 拿。send 只能读不能改。

**3. Bridge（runtime 接线）**
```
receive 产出事件 → runtime 通过 bridge 转换格式 → task 消费
```
receive 和 task 互不知道。runtime 在中间接线。

**4. 显式事件（高频/异步场景）**
```
receive emit 条件匹配事件 → receiveEventSourceBridge → task condition registry
```

### 旧 store vs 新架构对比

| | 旧 store | 新架构 |
|---|---|---|
| 谁写 | 谁都能写 | 只有 owner feature 写 |
| 谁读 | 直接 import store | 通过 public selector（只读） |
| 跨 feature 通信 | A 写 B 的 store | service 调用 / bridge / 事件 |
| 数据流方向 | 双向乱串 | 单向：producer → bridge → consumer |
| 改一个 feature 影响 | 不可预测 | 只影响消费它 public API 的地方 |

### 四个真实风险

**风险 1：selector 返回可变引用**
selector 必须返回深拷贝或 readonly 冻结对象，否则消费方一个 `.push()` 就绕过保护。

**风险 2：bridge 里塞业务逻辑**
bridge 应该只做格式转换。如果开始做"判断要不要转发"、"根据条件选择路由"，就成了隐式业务逻辑。

**风险 3："我就读这一个值"的诱惑**
开发中容易想直接 import 内部 state。一次破例变成两次、三次。防御：feature 内部文件不从 public.ts 导出，外部 import 不到。

**风险 4：runtime 膨胀**
runtime 是唯一知道所有 feature 的地方。如果开始做业务判断，就成了新的屎山中心。runtime 必须只做接线不做判断。

---

## 十一、待确认事项

1. **指令接入模块名称**：用户尚未确定最终叫什么（指令接入/远程指令/外部指令/待定）
2. **routingTick 驱动机制**：定时轮询（简单可控）vs 事件驱动（更精确），倾向定时轮询先上
3. **帧定义 JSON 格式**：新系统自己的格式，具体 schema 待设计
4. **旧 SCOE 代码复用**：旧代码"比较接近任务系统希望的"，有独立帧列表、独立条件，需要分解，好的复用思路，坏的消灭
5. **跨模块 import 边界硬约束机制**：feature 内部文件不导出的具体实现方式
6. **端到端集成测试策略**：A 组完成后立刻补的测试具体范围

---

## 十二、四线调研结论（2026-05-07 追加）

四条调研线并行完成，报告分别沉淀于：
- `codestable/compound/2026-05-07-architecture-audit-report.md`
- `codestable/compound/2026-05-07-old-system-investigation-scoe-expression-visualization.md`
- 跨模块 import 耦合图谱（审计结论内联）
- `codestable/compound/2026-05-07-old-new-system-coverage-matrix.md`

### 12.1 架构风险审计结论

**整体评估：架构根基扎实，零生产代码违规。**

| 维度 | 违规数 | 评级 |
|------|--------|------|
| Feature ↔ Feature（17 处跨 feature import） | 0 | A+ |
| Runtime ↔ Feature（~20 处引用） | 0 | A |
| Pages/Widgets ↔ Feature（3 个文件） | 0 | A |
| Shared 自身合规 | 0 | A- |
| Store 单点写入（36 个写入点） | 0 违规 | A |

关键事实：
- 17 处跨 feature import 全部通过 index.ts（public API），16/17 是 type-only
- 依赖方向形成 DAG 无环：frame/connection → receive/send → task
- Runtime 4 个 bridge 只做格式转换，不承载业务逻辑
- Shared 零 feature/框架依赖，ReadonlyDeep 被 10 个 feature 复用

**最大风险：selector 浅拷贝**
- display selector（`display-selectors.ts`）多处 `{ ...r }` 浅拷贝，涉及 `TableRowProjection`、`ChartSeriesProjection`、`ScatterProjection`
- storage selector（`storage-selectors.ts`）、frame selector（`frame-selectors.ts`）也有浅拷贝
- 修复策略：各 feature 填肉时统一改深拷贝或 readonly

**P0 阻塞项：端到端集成测试完全缺失**
- 已有 23 个测试文件、417 个测试用例，全是单元级
- 缺失：fake adapter → routingTick → receive → task → send → result 完整链路
- 建议：A 组完成后立刻补一条跨 feature 端到端测试作为骨架

### 12.2 旧系统调研结论

#### 表达式引擎（旧代码 1385 行核心）

已有机制：
- Kahn 算法拓扑排序解决变量顺序问题（O(V+E) 时间复杂度）
- `configHash + timestamp` 缓存失效机制，LRU 最多 50 项，5 分钟过期
- 4 种数据源类型：CURRENT_FIELD / FRAME_FIELD / GLOBAL_STAT / SCOE_DATA
- `new Function(...keys, 'return (expression)')` 动态构造函数
- 数学函数直接绑定 Math.*，可省略 Math. 前缀

旧实现问题：
- 并行计算导致顺序问题（原始实现并行计算所有表达式字段，字段 A 依赖 B 时可能用旧值）
- 无预编译机制（每次 new Function）
- 无表达式级缓存（相同表达式+相同输入不跳过）
- 持有 store 依赖（从 allFrameData 直接读，不纯）
- 循环依赖检测有但只回退不报错

新系统指导：
- 必须保留：Kahn 拓扑排序、configHash 缓存失效、数学函数简化绑定
- 必须消灭：store 依赖、无预编译、并行计算
- 必须：解析和求值分离、纯函数化、支持预编译

#### SCOE（旧代码 22 个文件）

可复用模式：
- 策略模式执行器映射：`Record<ScoeCommandFunction, CommandExecutor>` 字典映射指令类型到执行器
- 统一执行上下文：`CommandExecutionContext` + `CommandExecutionResult` 标准化输入输出
- 异步轮询条件等待：`waitForCompletionConditions()` 100ms 间隔轮询，可配置超时
- 分层验证流程：帧识别→校验和→参数解析→指令执行→条件检查→回应
- 分层状态结构：`ScoeStatus` 包含接收数/成功数/错误数/运行时长

需要消灭的问题：
- 跨 store 循环依赖（`receiveFramesStore.ts` 延迟初始化 `let scoeStore = null`）
- 重复帧实例管理（`scoeFrameInstancesStore.ts` 完整复制帧实例管理逻辑）
- SCOE 逻辑硬编码在通用接收流程（`receiveFramesStore.ts:922-1000`）
- 校验和逻辑散落、`Record<string, unknown>` 类型不安全传参、测试工具耦合核心 store

#### 可视化（旧代码 1074 行核心 store）

验证过的好模式：
- 循环缓冲区 `CircularBuffer<T>` 自动覆盖旧数据，容量按活跃图表数动态调整（0 图表:1000, 1 图表:5000, 2 图表:3000）
- ECharts 增量更新 `notMerge: false, silent: true, lazyUpdate: true`
- 时间格式化批量缓存 `formatTimestampsBatch()` + Map（最多 10000 条）
- 单次遍历同时处理时间戳和所有系列数据
- 配置持久化 `useStorage`

需要改进：
- 多层定时器嵌套需要统一为单一定时器 + 事件分发
- 星座图无长期数据量上限（高频帧 + 长刷新间隔 = 内存累积）
- 表格硬编码 500ms 定时器
- 性能监控代码被注释

#### 交叉发现：条件匹配散落三处

| 位置 | 实现内容 |
|------|----------|
| SCOE 完成条件 | `CompletionCondition { sourceFrameId, sourceFieldId, useParam, targetParamId, targetFixedValue, operator, options }` |
| 表达式条件 | `ConditionalExpression { condition: string, expression: string }` |
| 任务触发条件 | 独立的 trigger check 逻辑 |

三套独立实现是新系统 shared/condition/ 统一收口的重点目标。

### 12.3 跨模块耦合审计结论

**零违规，依赖图形成 DAG 无环。**

- Feature 间依赖方向：frame/connection → receive/send → task
- Runtime 对 feature 引用全部通过构造函数注入，不持有内部状态
- Bridge 文件对两端引用通过接口/类型，不引用具体实现
- UI 层通过 runtime/platform facade 间接访问，零直接 feature import
- 唯一跨 feature value import：`cloneFrameField`（receive ← frame），建议评估提取到 shared/

### 12.4 旧新系统功能覆盖度

新系统覆盖度：
- ✅ 已实现 44%（16 项）— 核心领域层（frame/connection/receive/send/task/storage/settings/status）架构骨架 + core 逻辑完成
- 📋 已设计未实现 31%（11 项）— display/SCOE/report/northbound 有设计无代码
- ❌ 完全未覆盖 14%（5 项）— 报告生成、HTTPS/FTP 推送、网络 main 侧、文件系统、窗口控制
- 🚫 刻意不保留 10 项 — SCOE 独立帧列表、window.electron 大包、store 间直接 import 等

旧系统全景：10 个页面，19 个 store（严重循环依赖），50+ IPC channel。

旧系统最严重耦合：
- `serialStore` → `receiveFramesStore` 直接调用 `handleReceivedData()`
- `receiveFramesStore` ↔ `sendTasksStore` 循环依赖（用延迟初始化规避）
- `connectionTargetsStore` 同时依赖 serial 和 network
- `scoeStore` 绑死 networkStore

P0 阻断项（没有跑不起来）：
1. Platform Facade — renderer 无法访问桌面能力（网络/文件/窗口全缺）
2. 核心页面层 — 只有 HomePage 空壳
3. Layout 系统 — 页面无法组织导航

### 12.5 调研对规划的修正

**确认正确的决策：**
- 模块划分（14 模块全景表）经审计验证，零违规
- 四种跨模块交互模式经审计验证
- SCOE→指令接入重命名方向正确
- 表达式引擎 shared/ 纯函数方向正确
- 条件匹配分两层方向正确

**需要修正的判断：**
- 覆盖度比"9 feature 全建完"的印象低：44% 已实现，很多 85-90% 是骨架而非真实能力
- P0 阻断项不是 routingTick 驱动，而是 Platform Facade（renderer 当前无法访问任何桌面能力）
- 可视化比想象更独立（完整数据管道、生命周期管理、刷新节奏控制），强化"独立模块"判断

---

## 十三、全局原则总结

1. **传输层是一个整体**：串口、TCP/UDP、HTTPS 都是 connection 的 adapter，不按类型拆阶段
2. **帧结构全局唯一**：不存在第二套帧模型，旧 SCOE 独立帧列表必须消灭
3. **表达式引擎是 shared/ 纯函数**：带依赖排序的求值器，全部外部传参，不持有状态
4. **条件匹配分两层**：匹配逻辑（shared/）+ 触发行为（各 feature）
5. **SCOE 和新甲方统一为"指令接入"**：外部系统控我们，走同一套指令接入路径
6. **存储、可视化、条件触发是独立模块**：receive 只是调用方，不拥有它们
7. **单点写入**：每个状态只有 owner feature 能写，外部只能读 selector
8. **runtime 只做接线不做判断**：composition root，不承载业务逻辑
9. **main 不装业务逻辑**：只做平台资源和必要的高频性能处理
10. **跨模块共用件时刻注意**：最容易耦合深的地方，必须严格通过 public API
11. **子 agent 积极使用**：brainstorm 用 explore agent 并行查旧代码和架构文档；design 用 explore agent 确认 public API 对接；impl 拆 executor agent 并行；accept 用独立 verifier agent

---

## 十四、实施规划 — Feature / Roadmap 拆分与排期

> 2026-05-08 定稿

### 14.1 拆分规则

- **cs-feat 全流程**（design → impl → accept）：中小规模，一个 design 能覆盖
- **cs-feat 拆两个 feature**：如果 design 过程中发现内容较多，在 design 阶段主动拆成两个 feature（各自有 design + checklist），串行实现。不需要升级到 roadmap
- **cs-roadmap**：3+ 子 feature 或高复杂度（预估 > 1000 行），需要 roadmap.md + items.yaml 管理依赖和交叉
- **brainstorm 先行**：只要不是特别明确，先走 cs-brainstorm 定方案再进 feature/roadmap 流程
- **子 agent 必须积极用**：每个阶段都要有明确的子 agent 任务

### 14.2 cs-feat 全流程（共 9 个）

| # | 名称 | 设计覆盖内容 | brainstorm? | 状态 | 备注 |
|---|------|-------------|-------------|------|------|
| 1 | bootstrap | runtime 实例化 + platform 检测 + routingTick 定时驱动 + 端到端测试骨架 | 否 | ✅ 完成 80% | Wave 0，缺 AppShell 集成 |
| 2 | condition-matching | shared/ 条件匹配纯函数 | 否 | ✅ 完成 | Wave 0 |
| 3 | expression-engine | shared/ 表达式引擎（Kahn 拓扑排序 + 预编译 + 多数据源变量解析 + 数学函数） | **是** | ✅ 完成 | Wave 0-1，全流程完成 |
| 4 | frame-real | 帧定义 JSON schema + 真实 frame reader + 旧格式迁移 | 否 | ✅ 完成 | Wave 1 |
| 5 | connection-complete | 串口端到端 + 断线重连 + TCP/UDP adapter | 否 | ✅ 完成 | Wave 2 |
| 6 | send-real | 构帧管线 + 表达式求值 + target 解析 + 写入连接 | **是** | ✅ 完成 | Wave 3 |
| 7 | storage-real | 参数历史持久化 + 查询/导出/清理 | **是** | ✅ pass-with-known-gaps | Wave 5，packaged data path blocked |
| 8 | result-report | 结果收集归口 + 报告生成 | 否 | 🔄 brainstorm 中 | Wave 5 |
| 9 | northbound | HTTPS 推送 + 交付闭环 | **是**（等 schema） | ⏳ 未开始 | Wave 6 |

**cs-feat 拆分规则**：如果 design 阶段发现内容超出预期（如 checklist 步骤 > 8 或预估行数接近 1000），在 design 里主动拆成两个独立 feature（各自有 slug、design、checklist），串行实现。不需要升级到 roadmap。

### 14.3 cs-roadmap（共 6 个）

| # | 名称 | 原估子 feature | 实际 | brainstorm? | 状态 | 备注 |
|---|---------|--------------|------|-------------|------|------|
| 10 | platform-expansion | 3 | 1（仅 TCP/UDP） | **是** | ✅ 完成 | 降级为 cs-feat，文件/窗口推迟 |
| 11 | receive-real | 3-4 | 1（receive-real-pipeline） | **是** | ✅ 完成 | 含背压截断+5 桥扇出 |
| 12 | task-real | 3 | 1（统一执行引擎） | **是** | ✅ 完成 | 降级为 cs-feat |
| 13 | 指令接入 | 2-3 | 1（SCOE+消费者链） | **是** | ✅ 完成 | 降级为 cs-feat |
| 14 | visualization | 3 | 1 | **是** | 🔄 设计完成 | 见下方 UI 进度 |
| 15 | ui-pages | 5-8 | 11 页面 MVP | **是** | 🔄 框架设计中 | 见下方 UI 进度 |

### 14.4 执行波次与并行策略

> 进度快照：2026-05-13，总进度约 80%

```
Wave 0（基础，零依赖）— ✅ 基本完成:
  [1-bootstrap ✅80%] ‖ [2-condition-matching ✅] ‖ [3-expression-engine ✅]
  bootstrap 缺 AppShell 集成

Wave 1（平台 + 帧，零业务依赖）— ✅ 完成:
  [3-expression-engine ✅] ‖ [10-platform-network-transport ✅] ‖ [4-frame-real ✅]

Wave 2（连接，依赖 platform）— ✅ 完成:
  [5-connection-complete ✅]
  含 TCP/UDP + 断线重连

Wave 3（收发，依赖 Wave 0-2）— ✅ 完成:
  [11-receive-real ✅] ‖ [6-send-real ✅]
  receive-real 全流程完成，含背压截断 + 5 桥扇出

Wave 4（编排，依赖 Wave 3）— ✅ 完成:
  [12-task-real ✅] ‖ [13-command-ingress ✅]

Wave 5（数据层，依赖 Wave 3-4）— 🔄 进行中:
  [7-storage-real ✅] ‖ [14-visualization 🔄设计完成] ‖ [8-result-report 🔄brainstorm]
  storage pass-with-known-gaps
  visualization: display UI 设计完成，架构框架完成
  result-report: brainstorm 进行中

Wave 5.5（代码质量）— ✅ 完成:
  [跨 feature 身份审计 ✅] ‖ [代码简化审计+readiness 补丁 ✅]
  身份链干净，~10% 代码精简

Wave 6（对外，依赖 Wave 5）— ⏳ 未开始:
  [9-northbound]

Wave 7（UI，依赖全部）— 🔄 框架+页面设计中:
  [前端规范 ✅] ‖ [UI 架构框架 ✅] ‖ [B1 帧域+连接设计 ✅] ‖ [B2 任务+发送+指令设计 ✅]
  [B3 数据域+工具设计 ⏳] ‖ [UnoCSS 迁移 ⏳] ‖ [设计-代码对齐验证 🔄]
```

### 14.5 关键路径

最长依赖链（决定整体最短完成时间）：

```
expression-engine ✅ → frame-real ✅ → receive-real ✅ → task-real ✅ → command-ingress ✅ → result-report 🔄 → northbound ⏳
```

关键路径已全部完成至 result-report。当前瓶颈是 **UI 实施**（Wave 7）和 **result-report**（Wave 5）。

### 14.6 旧代码参考索引

每个 feature/roadmap 实施时可参考的旧代码资源：

| 目标模块 | 旧代码参考 | 可复用 | 必须消灭 |
|---------|-----------|--------|---------|
| expression-engine | 旧表达式引擎 1385 行，Kahn 算法 + configHash 缓存 | 拓扑排序思路、缓存失效机制、数学函数绑定 | store 依赖、new Function、并行计算 |
| condition-matching | SCOE CompletionCondition + 表达式 ConditionalExpression + 任务触发条件 | 运算符集、条件结构 | 三套独立实现 |
| receive-real | receiveFramesStore + dataDisplayStore | 帧匹配流程、字段解析 | SCOE 硬编码在通用接收、store 交叉 |
| send-real | sendFrameInstancesStore + sendTasksStore | 帧实例构造 | 独立帧实例管理 |
| task-real | sendTasksStore 三种循环 + SCOE 执行器 | 策略模式执行器映射、CommandExecutionContext | 独立条件系统、跨 store 循环依赖 |
| 指令接入 | SCOE 22 文件（scoeStore + scoeFrameInstancesStore） | 分层验证流程、异步轮询条件等待 | 独立帧列表、独立条件、硬编码协议识别 |
| visualization | dataDisplayStore 1074 行 | CircularBuffer + ECharts 增量更新 + 批量时间格式化 | 多层定时器嵌套、星座图无数据上限 |
| storage-real | historyAnalysis + fileStorageStore | CSV 导出流程 | 混合存储逻辑 |
| ui-pages | 旧系统 10 个页面 | 页面布局和交互参考 | store 直连模式 |

### 14.7 Wave 0 调研结果（2026-05-08）

> bootstrap 和 condition-matching 的 design 前调研已完成，以下为具体发现。

#### bootstrap 调研结论

已有实现：
- `createRewriteRuntime()` 已实现，接受可选 `connectionAdapter`
- `wireFeatures()` 已完成 L0→L3 全部接线
- `routingTick()` 已实现 drain→receive→match→emit
- `real-serial-adapter.ts` 已实现 TransportFacade→ConnectionTransportAdapter 映射
- `fake-transport-adapter.ts` 已有完整 fake（pushData/pushError/pushClose）
- `AppShell.vue` 已调 `provideRewriteRuntime()` 但无 adapter 选择、无 tick 驱动、无清理
- **result feature 不存在**（runtime 引用了但 feature 目录下没有）

实际缺口（仅 4 项）：
1. AppShell 启动时检测 platform bridge → 选 real/noOp adapter
2. routingTick setInterval 定时驱动
3. AppShell destroy 清理
4. 端到端集成测试骨架

结论：比预期更小，主要是 AppShell 改造 + 测试骨架，不涉及 runtime 核心逻辑改动。

#### condition-matching 调研结论

`shared/condition-operators/` 已有完整实现：
- `compare.ts`（71 行）：`compareValues(actual, threshold, operator)` — 8 个运算符（eq, neq, gt, lt, gte, lte, change, any）
- `types.ts`（9 行）：`ComparisonOperator` + `FieldCondition`
- `compare.spec.ts`（168 行）：完整测试覆盖

Task feature 已在消费它（`evaluateCondition` + `ConditionRegistry`）。

实际范围（补齐+清理，不是从零建）：
1. `FieldCondition` 类型（带 `frameId`/`fieldId`）从 shared/ 移到 task feature（它绑定了"从哪个帧的哪个字段取值"的 task 领域知识）
2. 补 `contains` 运算符（旧系统有，通用需求）
3. 确认 `range`（between）是否需要——如果表达式引擎能处理 `value >= 10 && value <= 20`，则不需要单独 range 运算符
4. 逻辑组合（AND/OR 多条件）归消费方（task 已有 ConditionRegistry），shared/ 不需要管
5. 清理 shared/condition-operators/ 确保只留纯匹配逻辑

结论：实际工作量极小，可能 fastforward 就够。

### 14.8 进度快照（2026-05-13）

**总进度：~80%**

核心功能 feature 15 个中 12 个已完成，剩余 3 个（result-report / northbound / ui-pages）。

#### 已完成

| 类别 | 项 | 关键产出 |
|------|---|---------|
| Wave 0-4 功能 | expression-engine / frame-real / connection / receive-real / send-real / task-real / command-ingress | 全部 ✅，803 tests green |
| Wave 5 数据 | storage-real | ✅ pass-with-known-gaps（packaged data path blocked） |
| 代码质量 | 跨 feature 身份审计 | ✅ 标识链干净，display/status 统一为 frameId/fieldId |
| 代码质量 | 代码简化审计 + readiness 补丁 | ✅ ~10% 精简，service gap 补齐（upsertFrame/retryTask 等） |
| UI 基础 | 前端规范 | ✅ 39 条规则 + 46 项 checklist |
| UI 基础 | UI 架构框架 | ✅ 导航/布局/widget/页面清单/暗色模式 |
| UI 设计 | B1 帧域+连接页面设计 | ✅ 3 页面（帧列表/帧编辑/连接管理） |
| UI 设计 | B2 任务+发送+指令页面设计 | ✅ 4 页面（发送/任务列表/任务编辑/指令接入） |
| CLAUDE.md 新增规则 | Service Readiness Audit / 代码精简审查 / 前端规范必读 / brainstorm 插入点 / 跨 feature 标识检查 | 5 项自检规则 |

#### 进行中

| 项 | 进度 | 阻塞项 |
|----|------|--------|
| B3 数据域+工具页面设计（Dashboard/存储/设置） | brainstorm 待跑 | 无 |
| 设计-代码对齐验证 | 21 子 agent 审计中 | 无 |
| result-report | brainstorm 中 | 无 |
| UnoCSS 间距迁移 | 待跑 | 无 |
| bootstrap AppShell 集成 | 80%，差 AppShell | 无 |

#### 待启动

| 项 | 依赖 |
|----|------|
| B1/B2/B3 页面 UI 实施 | 对齐验证完成 + service gap 修复 |
| 共享 widget 实现 | UI 架构框架 |
| northbound | result-report + 甲方 schema |
| packaged data path | 打包态环境 |

#### 优先级排序

1. **设计-代码对齐验证**（当前轮）— 确保 design 和代码一致
2. **B3 brainstorm** — 完成最后一个页面设计组
3. **UnoCSS 迁移** — 小且快，为 UI 实施做准备
4. **UI 框架搭建**（布局壳 + 导航 + 路由）— 所有页面设计的共享基础
5. **逐页面 UI 实施** — 按 feature 并行
