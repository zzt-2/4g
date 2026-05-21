# [S004] 旧系统连接管理可观测行为提取

> 2026-05-19 | 调研 | active

## 目标

从旧系统代码中提取串口、网络（TCP/UDP/TCP Server）连接管理的所有可观测业务行为，为重写 connection feature 提供事实基础。只做事实提取，不做设计或实施。

## 记录

---

### 一、串口连接完整生命周期

#### 1.1 串口枚举（发现）

- **旧行为**：通过读取 Windows 注册表 `HKLM:\HARDWARE\DEVICEMAP\SERIALCOMM` 获取可用 COM 端口列表。使用 PowerShell 命令执行，返回包含 `path`（如 COM3）、`manufacturer`、`pnpId`、`isOpen` 信息的端口描述。
- **代码位置**：`src-electron/main/ipc/serialHandlers.ts:51-123`（`listPorts` / `listPortsFromRegistry`）
- **渲染端调用**：`serialAPI.listPorts(forceRefresh)` → `serial:list` IPC
- **新系统对应 feature**：connection feature（串口枚举子能力）
- **oracle 来源**：Windows 注册表；代码中是唯一枚举路径（SerialPort 库的 list 方法未被使用，被注册表方式替代）。仅支持 Windows。
- **保留建议**：**保留**。枚举可用串口是核心能力，但实现方式需从注册表 PowerShell 迁移到跨平台方案（serialport 库原生 list）。

#### 1.2 串口连接状态机

- **旧行为**：串口连接有四个状态：`disconnected` → `connecting` → `connected` → `error`。状态转换：
  - `disconnected` → `connecting`：用户调用 `connectPort(portPath)` 时
  - `connecting` → `connected`：`serialAPI.open` 成功返回时
  - `connecting` → `error`：`serialAPI.open` 失败或异常时
  - `connected` → `disconnected`：用户主动断开 `disconnectPort(portPath)` 或端口意外关闭
  - `connected` → `error`：串口运行中发生错误
  - `error` → `connecting`：用户再次尝试连接
- **代码位置**：
  - 状态定义：`src/types/serial/serial.ts:66`（`ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'`）
  - 状态转换：`src/stores/serialStore.ts:161-209`（`connectPort`）、`216-243`（`disconnectPort`）、`355-376`（`updatePortStatus`）
- **新系统对应 feature**：connection feature
- **oracle 来源**：代码事实。四状态模型完整覆盖。
- **保留建议**：**保留**。四状态模型合理，应作为新系统串口连接状态基础。

#### 1.3 串口配置

- **旧行为**：
  - 默认配置：`baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none', autoOpen: false`
  - 支持的参数：baudRate、dataBits（5/6/7/8）、stopBits（1/1.5/2）、parity（none/even/odd/mark/space）、flowControl（none/hardware/software）、bufferSize、timeout
  - 配置持久化：每个端口独立配置通过 `useStorage('serial-options-map')` 持久化到 localStorage；全局默认配置通过 `useStorage('default-serial-options')` 持久化
  - 热更新配置：已连接的串口修改配置时，先关闭再重新打开（`setPortOptions` in serialHandlers.ts:467-490）
  - 未连接时修改配置只保存不立即应用
- **代码位置**：
  - 默认配置：`src/stores/serialStore.ts:22-29`
  - 持久化：`src/stores/serialStore.ts:54-59`
  - 热更新：`src/stores/serialStore.ts:295-314`、`src-electron/main/ipc/serialHandlers.ts:467-490`
  - 类型定义：`src/types/serial/serial.ts:6-21`
- **新系统对应 feature**：connection feature（配置子能力）
- **oracle 来源**：代码事实。配置参数与 SerialPort 库对齐。
- **保留建议**：**保留**。配置参数集合和热更新行为均为必要。持久化方式需迁移到新系统的持久化层。

#### 1.4 串口数据收发

- **旧行为**：
  - **接收**：main 进程通过 SerialPort `data` 事件接收原始二进制数据，广播 `serial:data` IPC 事件到所有渲染进程窗口。渲染端 serialStore 监听后同时更新 `receivedMessagesMap`（最近 100 条）和调用 `receiveFramesStore.handleReceivedData('serial', portPath, data)` 进行帧解析。
  - **发送**：支持三种发送方式：`sendText`（文本/十六进制）、`sendBinary`（Uint8Array）、`sendFrameInstance`（帧实例转 Buffer）。发送前检查连接状态。发送成功后 main 进程广播 `serial:data:sent` 事件。
  - **缓冲区清除**：`clearBuffer` 重置 bytesReceived 计数器（非真正清除缓冲区数据）
  - **历史记录**：每个端口维护收发历史（`receivedMessagesMap` / `sentMessagesMap`），限制 100 条，支持清空
- **代码位置**：
  - 接收：`src-electron/main/ipc/serialHandlers.ts:522-541`、`src/stores/serialStore.ts:392-421`
  - 发送：`src-electron/main/ipc/serialHandlers.ts:286-365`、`src/stores/serialStore.ts:510-579`
  - 历史记录：`src/stores/serialStore.ts:62-89`、`599-672`
- **新系统对应 feature**：connection feature（数据通道）+ receive/send feature
- **oracle 来源**：代码事实。
- **保留建议**：
  - **保留**：多端口并发收发、发送前置连接检查、帧实例发送。
  - **排除**：`receivedMessagesMap` / `sentMessagesMap` 的 100 条内存历史——这是旧系统调试/调试页面功能，新系统的 receive feature 有自己的帧存储。

#### 1.5 串口状态广播

- **旧行为**：main 进程在以下时机广播状态到所有渲染窗口：
  - 端口打开成功
  - 端口关闭
  - 数据接收（更新 bytesReceived）
  - 数据发送完成（更新 bytesSent）
  - 错误事件
  - 渲染端状态监听有 500ms 防抖（`useDebounceFn(..., 500)`）
- **代码位置**：
  - main 端广播：`src-electron/main/ipc/serialHandlers.ts:567-578`（`broadcastStatus`）
  - 渲染端防抖：`src/stores/serialStore.ts:449-465`
- **新系统对应 feature**：connection feature
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。状态广播 + 防抖是合理的性能优化模式。新系统应在 platform facade 中统一实现。

#### 1.6 串口连接生命周期清理

- **旧行为**：
  - 应用退出时（`app.on('will-quit')`）自动关闭所有串口
  - 组件卸载时（`onUnmounted`）断开所有串口并清理监听器
  - 每个端口有独立的监听器清理函数数组（dataListener、sentDataListener、statusListener、allStatusListener）
- **代码位置**：
  - 应用级清理：`src-electron/main/ipc/serialHandlers.ts:639-651`
  - 组件级清理：`src/stores/serialStore.ts:707-715`
  - 监听器管理：`src/stores/serialStore.ts:382-502`
- **新系统对应 feature**：connection feature + app lifecycle
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。生命周期清理是必要行为。

#### 1.7 最后使用串口记忆

- **旧行为**：记录最后使用的串口路径（`useStorage('last-used-port')`），用于下次启动时的默认选择。
- **代码位置**：`src/stores/serialStore.ts:51`
- **新系统对应 feature**：connection feature
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。UX 便利行为。

#### 1.8 串口断开全部

- **旧行为**：`disconnectAllPorts()` 通过 `serialAPI.closeAll()` 一次性向 main 进程请求关闭所有端口，main 进程遍历 `portConnections` Map 逐一关闭，清空 `activePorts` 列表。
- **代码位置**：`src/stores/serialStore.ts:249-288`、`src-electron/main/ipc/serialHandlers.ts:259-278`
- **新系统对应 feature**：connection feature
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。批量断开是必要操作。

---

### 二、TCP/UDP 网络连接完整生命周期

#### 2.1 TCP 客户端模式

- **旧行为**：
  - 创建 `net.Socket` 连接到指定的 `host:port`
  - 强制禁用 Nagle 算法（`setNoDelay(true)`），强制禁用 keepAlive（`setKeepAlive(false)`）
  - 连接超时默认 5000ms，可通过配置覆盖
  - 连接成功：状态 `connected`，广播 `network:connectionEvent`（type: 'connected'）
  - 数据接收：按 `\r\n` 分割（`handleTcpData`），逐包发送 `network:data` 事件到渲染进程
  - 连接错误/超时/关闭：广播对应事件，清理连接记录（`connections.delete`）
  - **无自动重连**：连接断开后需要用户手动重新连接（`autoReconnect` 字段存在于类型定义但未在 main 进程中实现）
- **代码位置**：`src-electron/main/ipc/networkHandlers.ts:85-141`（`connectTcp`）
- **新系统对应 feature**：connection feature（TCP 客户端子类型）
- **oracle 来源**：代码事实。TCP 客户端行为完整。
- **保留建议**：**保留**。TCP 客户端连接行为均为必要。需注意：
  - `\r\n` 分割逻辑是硬编码协议行为，新系统应可配置
  - `setKeepAlive(false)` 和 `setNoDelay(true)` 应可通过配置控制
  - `autoReconnect` 类型定义存在但未实现，新系统需决定是否实现

#### 2.2 TCP Server 模式

- **旧行为**：
  - 使用 `net.createServer` 监听指定 `host:port`
  - 接受多客户端连接，维护客户端列表 `tcpServerClients`
  - 每个客户端的 socket 设置 `setKeepAlive(false)` 和 `setNoDelay(true)`
  - 数据接收：所有客户端数据通过同一连接 ID 汇入 `handleTcpData`，按 `\r\n` 分割
  - 发送数据：向所有已连接客户端广播（`clients.forEach(client.write(...))`）
  - 客户端断开时从列表中移除，不触发服务器级别的 disconnected 事件
  - 服务器关闭时广播 `network:connectionEvent`（type: 'disconnected'）
- **代码位置**：`src-electron/main/ipc/networkHandlers.ts:146-224`（`connectTcpServer`）
- **新系统对应 feature**：connection feature（TCP Server 子类型）
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。TCP Server 多客户端管理是必要行为。注意：
  - 向所有客户端广播发送是旧系统行为，新系统需确认是否需要定向发送
  - 客户端生命周期管理（连接/断开）需要独立事件通知

#### 2.3 UDP 模式

- **旧行为**：
  - 使用 `dgram.createSocket('udp4')` 创建 UDP socket
  - 绑定到指定 `host:port` 进行监听（`socket.bind`）
  - 当 `host === '0.0.0.0'` 时，bind 时不指定 host（`undefined`），表示监听所有接口
  - 支持广播模式（`options.broadcast` → `setBroadcast(true)`）
  - 数据接收：所有接收到的消息通过 `handleDataReceived` 处理（注意 UDP 不做 `\r\n` 分割）
  - 数据发送：需要指定目标地址（`targetHost` 格式 `host:port`），使用 `socket.send`
  - 远程主机列表：配置中可包含 `remoteHosts` 数组，每个远程主机有独立的 `id`、`name`、`host`、`port`、`enabled`、`description`
- **代码位置**：`src-electron/main/ipc/networkHandlers.ts:229-292`（`connectUdp`）、`src/types/serial/network.ts:11-19`（RemoteHost 类型）
- **新系统对应 feature**：connection feature（UDP 子类型）
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。UDP 绑定+远程主机列表模式是完整的。远程主机列表作为 UDP 的发送目标管理，与 TCP/TCP Server 的发送模型不同。

#### 2.4 网络连接通用状态管理

- **旧行为**：
  - `NetworkConnectionManager` 类在 main 进程管理所有网络连接，使用 `Map<connectionId, NetworkConnection>` 存储
  - 连接状态：`connecting` → `connected` → `disconnected` / `error`
  - 重复连接处理：如果连接已存在且 `isConnected=true`，返回错误；如果 `isConnected=false`（残留），先清理再重新创建
  - 连接统计：每个连接维护 `bytesReceived`、`bytesSent`、`messagesReceived`、`messagesSent`、`lastActivity`、`connectionTime`
  - 断开连接：根据类型分别处理（TCP 销毁 socket、TCP Server 关闭所有客户端+关闭服务器、UDP 关闭 socket）
  - 渲染端 `netWorkStore` 通过 IPC 调用 main 进程方法，监听事件更新本地状态
- **代码位置**：
  - main 进程：`src-electron/main/ipc/networkHandlers.ts:22-609`（`NetworkConnectionManager`）
  - 渲染端：`src/stores/netWorkStore.ts:1-337`
- **新系统对应 feature**：connection feature
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。通用连接管理、统计、断开清理均为必要行为。

#### 2.5 网络数据接收事件链

- **旧行为**：
  - main 进程接收到数据后调用 `handleDataReceived`
  - `handleDataReceived` 首先更新统计，然后检查高速存储规则
  - 如果命中高速存储规则，数据**不发送到渲染进程**，只做异步文件存储
  - 如果未命中，通过 `emitDataEvent` 将数据发送到所有渲染进程（`Array.from(data)` 转为普通数组以通过 IPC）
  - 渲染端 `networkAPI.onData` 监听 `network:data` 事件，将数据转为 `Uint8Array` 后调用 `receiveFramesStore.handleReceivedData('network', connectionId, data)`
  - 同时更新连接的 `lastActivity` 时间
- **代码位置**：
  - main 进程分流：`src-electron/main/ipc/networkHandlers.ts:498-521`（`handleDataReceived`）
  - 渲染端接收：`src/stores/netWorkStore.ts:200-219`（`setupNetworkDataHandling`）
- **新系统对应 feature**：connection feature + receive feature + storage feature
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。数据接收 → 高速存储分流 → 渲染进程通知的完整链路需要保留。

---

### 三、高速存储分流逻辑

#### 3.1 高速存储触发条件

- **旧行为**：
  - 在网络数据接收路径 `handleDataReceived` 中，每次收到数据都调用 `storageManager.shouldStore(connectionId, data)`
  - 匹配条件：存储功能已启用（`config.enabled`）+ 规则已启用（`rule.enabled`）+ 连接 ID 匹配（解析 `network:` 前缀后的实际连接 ID）+ 帧头模式匹配（至少一个 headerPattern 完全匹配数据前缀）
  - 匹配后数据**不发送到渲染进程**，只异步写入文件（不阻塞数据处理）
  - 帧头匹配是精确前缀匹配（逐字节比较）
- **代码位置**：
  - 分流入口：`src-electron/main/ipc/networkHandlers.ts:507-517`
  - 匹配逻辑：`src-electron/main/ipc/highSpeedStorageHandlers.ts:104-119`（`shouldStore`）
  - 帧头匹配：`src-electron/main/ipc/highSpeedStorageHandlers.ts:77-96`（`matchFrameHeader`）
- **新系统对应 feature**：storage feature（高速存储子能力）
- **oracle 来源**：代码事实。注意此分流只在网络连接路径中，串口连接路径**没有**高速存储分流。
- **保留建议**：**保留**。高速存储分流是业务关键路径。但新系统应评估：
  - 是否串口也需要高速存储分流
  - 帧头匹配逻辑是否应从 storage 移到 shared/ 作为纯函数

#### 3.2 高速存储文件管理

- **旧行为**：
  - 存储位置：`userDataPath/business-data/` 目录
  - 文件名格式：`business_data_{ISO时间戳}.txt`
  - 数据格式：每行一条十六进制字符串
  - 文件轮转：达到 `maxFileSize`（默认 100MB）时关闭当前文件，清理超出 `rotationCount`（默认 5）的旧文件，创建新文件
  - 统计信息：`totalFramesStored`、`totalBytesStored`、`frameTypeStats`、`storageStartTime`、`lastStorageTime`
  - 重置统计：关闭写入流、删除当前文件、清零所有统计
- **代码位置**：`src-electron/main/ipc/highSpeedStorageHandlers.ts:140-388`
- **新系统对应 feature**：storage feature
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。文件轮转、统计、重置均为必要行为。但新系统应将存储路径管理移到 platform facade。

#### 3.3 高速存储配置

- **旧行为**：
  - 单一规则（`FrameHeaderRule`）：包含 `connectionId`、`headerPatterns`（十六进制字符串数组）、`enabled`
  - 全局配置：`enabled`、`rule`、`maxFileSize`、`enableRotation`、`rotationCount`
  - 配置通过 IPC `highSpeedStorage:updateConfig` 动态更新
  - 从禁用变为启用时初始化写入流；从启用变为禁用时关闭存储
- **代码位置**：`src-electron/main/ipc/highSpeedStorageHandlers.ts:296-319`（`updateConfig`）、`src/types/serial/highSpeedStorage.ts`
- **新系统对应 feature**：storage feature
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。动态配置启停行为合理。

---

### 四、连接状态 UI 展示行为

#### 4.1 连接状态指示器

- **旧行为**：
  - 串口状态：`portConnectionStatuses` Map，每个端口独立状态（disconnected/connecting/connected/error）
  - 网络状态：`connections` 数组中每个连接的 `isConnected` + `status` 字段
  - 状态更新：串口通过 `serial:status` IPC 事件（500ms 防抖），网络通过 `network:connectionEvent` 事件
  - 计算属性：`hasConnectedPort`（至少一个串口已连接）、`connectedCount`（网络已连接数）、`hasActiveConnections`（是否有活跃网络连接）
  - 连接统计：每端口/每连接的 `bytesReceived`、`bytesSent`
- **代码位置**：
  - 串口：`src/stores/serialStore.ts:42-43`（`portConnectionStatuses`）、`101-108`（计算属性）、`449`（防抖）
  - 网络：`src/stores/netWorkStore.ts:19-43`（状态和计算属性）、`222-249`（事件监听）
- **新系统对应 feature**：connection feature（selector 暴露）
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。状态指示器和统计信息是 UI 核心需求。500ms 防抖是合理的更新频率。

#### 4.2 错误信息展示

- **旧行为**：
  - 串口：每个端口独立错误信息 `portErrorMessages` Map，连接失败、运行错误都会设置
  - 网络：全局 `lastError` + 每个连接的 `connection.error` 字段
  - 错误清除：串口 `clearPortError` 在连接尝试时清除；网络 `clearError` 手动清除
- **代码位置**：
  - 串口：`src/stores/serialStore.ts:44-45`、`333-348`
  - 网络：`src/stores/netWorkStore.ts:25`、`281-283`
- **新系统对应 feature**：connection feature
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。错误信息独立管理合理。

---

### 五、多连接并发管理

#### 5.1 多串口并发

- **旧行为**：
  - 支持同时连接多个串口（`portConnections` Map in main process）
  - 每个端口独立的连接状态、配置、数据收发通道
  - `activePorts` 数组记录所有已连接端口
  - 数据接收按 `portPath` 分流到对应的 `receivedMessagesMap[portPath]`
  - `getAllMessages()` 可展平所有端口的消息并按时间戳排序
- **代码位置**：`src/stores/serialStore.ts:48`（`activePorts`）、`62-89`（消息映射）、`655-672`（`getAllMessages`）
- **新系统对应 feature**：connection feature
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。多串口并发是核心需求。

#### 5.2 网络多连接并发

- **旧行为**：
  - `NetworkConnectionManager` 支持同时管理多个 TCP/TCP Server/UDP 连接
  - 每个连接有唯一 `id`，不同类型连接共存
  - TCP Server 的多客户端也是并发的（`tcpServerClients` Map）
  - `disconnectAll()` 使用 `Promise.allSettled` 并行断开
- **代码位置**：`src-electron/main/ipc/networkHandlers.ts:22-28`（数据结构）、`288-293`（渲染端 disconnectAll）
- **新系统对应 feature**：connection feature
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。多网络连接并发是必要能力。

#### 5.3 连接目标统一视图

- **旧行为**：
  - `connectionTargetsStore` 将串口和网络连接统一为 `ConnectionTarget` 列表
  - 目标 ID 编码规则：串口 `serial:{portPath}`，网络 TCP/Server `network:{connectionId}`，网络 UDP 远程主机 `network:{connectionId}:{remoteHostId}`
  - 提供按类型分组（`serialTargets` / `networkTargets`）、按连接状态过滤（`connectedTargets`）
  - `getFirstAvailableTargetId()` 优先返回已连接目标
  - `isTargetAvailable(targetId)` 检查目标是否可用
  - `getValidatedTargetPath(targetId)` 为发送路由提供验证后的路径
  - 300ms 防抖刷新（`useDebounceFn(..., 1000)`，实际代码注释写的 300ms 但传入 1000ms）
  - 通过 `watchEffect` 监听串口和网络状态变化自动刷新
- **代码位置**：`src/stores/connectionTargetsStore.ts:1-253`
- **新系统对应 feature**：connection feature（selector）+ send feature（目标选择）
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。统一目标视图是发送操作的基础。但注意：
  - `getValidatedTargetPath` 的路径编码规则需要在新系统中重新设计
  - UDP 远程主机作为独立发送目标的概念需要保留

---

### 六、连接配置的 CRUD 行为

#### 6.1 串口配置持久化

- **旧行为**：
  - 每个端口独立配置存储到 localStorage（`useStorage('serial-options-map')`）
  - 全局默认配置存储到 localStorage（`useStorage('default-serial-options')`）
  - 新端口使用默认配置，修改后保存为端口独立配置
  - 连接时优先使用端口独立配置，无则使用默认配置
- **代码位置**：`src/stores/serialStore.ts:54-59`（持久化）、`173-174`（使用）
- **新系统对应 feature**：connection feature + persistence
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。配置持久化行为合理，但存储方式需迁移。

#### 6.2 网络连接配置

- **旧行为**：
  - `NetworkConnectionConfig` 包含：id、name、type、host、port、remoteHosts、autoReconnect、timeout、description
  - 连接配置由调用方（UI 或其他 store）构造并传入，store 本身不持久化连接配置
  - 连接成功后配置信息随 `NetworkConnection` 对象保存在 main 进程内存中
  - 断开后连接记录从内存中删除（`connections.delete(connectionId)`）
- **代码位置**：`src/types/serial/network.ts:22-32`（配置类型）、`src-electron/main/ipc/networkHandlers.ts:53-58`（连接创建）
- **新系统对应 feature**：connection feature + persistence
- **oracle 来源**：代码事实。注意：旧系统网络连接配置**没有持久化**，重启后需要重新创建。
- **保留建议**：**保留**连接配置类型。新系统应增加持久化能力（保留已创建的连接配置跨重启）。

#### 6.3 高速存储规则配置

- **旧行为**：
  - `StorageConfig` 包含：enabled、rule（单一 FrameHeaderRule）、maxFileSize、enableRotation、rotationCount
  - `FrameHeaderRule` 包含：id、connectionId、headerPatterns、enabled
  - 规则验证：检查 connectionId 非空、至少一个 headerPattern、十六进制格式合法、偶数长度
  - 配置通过 IPC 动态更新
- **代码位置**：`src/types/serial/highSpeedStorage.ts:8-24`、`src-electron/main/ipc/highSpeedStorageHandlers.ts:394-429`（`validateRule`）
- **新系统对应 feature**：storage feature
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。规则配置和验证行为完整。

---

### 七、自动连接/自动重连行为

#### 7.1 自动连接

- **旧行为**：**无自动连接行为**。应用启动时只刷新可用端口列表（`serialStore.refreshPorts()`）和连接目标列表（`connectionTargetsStore.refreshTargets()`），不自动连接任何端口或网络。
- **代码位置**：`src/layouts/useAppLifecycle.ts:45-52`（onMounted）
- **oracle 来源**：代码事实。
- **保留建议**：**排除**。当前无自动连接。如新系统需要自动连接，需作为新需求设计。

#### 7.2 自动重连

- **旧行为**：**类型定义中存在 `autoReconnect` 字段**（`NetworkConnectionConfig.autoReconnect?: boolean`），但**main 进程和渲染端均未实现自动重连逻辑**。连接断开后（错误、超时、对端关闭），只更新状态为 `disconnected`/`error`，不做任何重连尝试。
- **代码位置**：`src/types/serial/network.ts:29`（字段定义）
- **oracle 来源**：代码事实。字段存在但无实现，属于预留接口。
- **保留建议**：**排除旧实现**（因为没有实现）。新系统如需自动重连，应作为新需求设计，可参考此字段名。

---

### 八、应用启动时的连接初始化

- **旧行为**：
  - `useAppLifecycle.onMounted`：
    1. `serialStore.refreshPorts()` — 刷新可用串口列表（从注册表获取）
    2. `connectionTargetsStore.refreshTargets()` — 构建统一连接目标列表
    3. 同时初始化帧模板、发送实例、接收配置、全局统计、SCOE 等
  - `netWorkStore.initialize()`：
    1. `setupNetworkDataHandling()` — 设置数据监听、连接事件监听、状态变化监听
    2. `refreshConnections()` — 从 main 进程获取当前连接列表（通常为空，因为是新启动）
  - `connectionTargetsStore` 自动 watchEffect：串口/网络状态变化时自动重新构建目标列表
- **代码位置**：
  - 应用级：`src/layouts/useAppLifecycle.ts:45-52`
  - 网络初始化：`src/stores/netWorkStore.ts:297-300`
  - 目标自动更新：`src/stores/connectionTargetsStore.ts:218-231`
- **新系统对应 feature**：app lifecycle + connection feature
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。启动时序：先枚举端口 → 建立监听 → 构建统一目标列表。这个顺序合理。

---

### 九、TCP 数据分割行为

#### 9.1 TCP \r\n 分割

- **旧行为**：
  - TCP 数据接收时按 `\r\n`（0x0D 0x0A）分割为独立数据包
  - `handleTcpData` 遍历数据查找所有 `\r\n` 位置，提取之间的数据
  - 不以 `\r\n` 结尾的剩余数据作为最后一个包
  - 空包（连续 `\r\n` 或开头 `\r\n`）被过滤掉
  - UDP 数据不做分割，直接作为整包处理
- **代码位置**：`src-electron/main/ipc/networkHandlers.ts:466-493`（`handleTcpData`）
- **新系统对应 feature**：connection feature（数据预处理）或 receive feature
- **oracle 来源**：代码事实。
- **保留建议**：**保留分割行为但参数化**。`\r\n` 分割是旧系统硬编码的协议假设，新系统应支持可配置的分隔符或无分割模式。这是业务关键行为，不能丢失。

---

### 十、IPC 通道一览

#### 10.1 串口 IPC 通道

| IPC 通道 | 方向 | 用途 |
|---|---|---|
| `serial:list` | invoke | 列出可用串口 |
| `serial:open` | invoke | 打开串口 |
| `serial:close` | invoke | 关闭串口 |
| `serial:close-all` | invoke | 关闭所有串口 |
| `serial:write` | invoke | 写入数据（文本/hex） |
| `serial:send` | invoke | 发送帧数据（二进制） |
| `serial:read` | invoke | 读取缓冲区数据 |
| `serial:status` | invoke | 获取单个端口状态 |
| `serial:all-status` | invoke | 获取所有端口状态 |
| `serial:setOptions` | invoke | 设置串口参数 |
| `serial:clearBuffer` | invoke | 清除接收缓冲区计数 |
| `serial:data` | on | 数据接收事件 |
| `serial:data:sent` | on | 数据发送确认事件 |
| `serial:status` | on | 状态变化事件（注意与 invoke 同名） |

- **代码位置**：
  - main 端注册：`src-electron/main/ipc/serialHandlers.ts:581-631`
  - preload 桥接：`src-electron/preload/api/serial.ts`
- **新系统对应 feature**：connection feature（platform facade）
- **保留建议**：**保留语义，重写通道**。新系统的 preload facade 应提供类型安全的 API，不暴露裸 IPC 通道名。

#### 10.2 网络 IPC 通道

| IPC 通道 | 方向 | 用途 |
|---|---|---|
| `network:connect` | invoke | 创建网络连接 |
| `network:disconnect` | invoke | 断开连接 |
| `network:send` | invoke | 发送数据 |
| `network:getConnections` | invoke | 获取连接列表 |
| `network:getStatus` | invoke | 获取连接状态 |
| `network:data` | on | 数据接收事件 |
| `network:connectionEvent` | on | 连接事件（connected/disconnected/error） |
| `network:statusChange` | on | 状态变化事件 |

- **代码位置**：
  - main 端注册：`src-electron/main/ipc/networkHandlers.ts:668-678`
  - preload 桥接：`src-electron/preload/api/network.ts`
- **新系统对应 feature**：connection feature（platform facade）
- **保留建议**：同上。

#### 10.3 高速存储 IPC 通道

| IPC 通道 | 方向 | 用途 |
|---|---|---|
| `highSpeedStorage:updateConfig` | invoke | 更新存储配置 |
| `highSpeedStorage:getConfig` | invoke | 获取当前配置 |
| `highSpeedStorage:getStats` | invoke | 获取统计信息 |
| `highSpeedStorage:validateRule` | invoke | 验证规则 |
| `highSpeedStorage:resetStats` | invoke | 重置统计 |

- **代码位置**：`src-electron/main/ipc/highSpeedStorageHandlers.ts:491-501`
- **新系统对应 feature**：storage feature（platform facade）
- **保留建议**：同上。

---

### 十一、其他发现

#### 11.1 串口端口热插拔

- **旧行为**：**无主动热插拔检测**。`refreshPorts` 是被动调用（应用启动时调用一次）。没有定期轮询或 USB 事件监听。用户需要手动触发刷新。
- **代码位置**：`src/stores/serialStore.ts:134-154`（`refreshPorts`）
- **oracle 来源**：代码事实。
- **保留建议**：**排除旧行为，作为新需求评估**。新系统可考虑监听 USB 串口插拔事件自动刷新。

#### 11.2 网络连接事件清理

- **旧行为**：`netWorkStore` 有三个独立的监听器清理函数（`dataListenerCleanup`、`connectionEventCleanup`、`statusChangeCleanup`），通过 `cleanupListeners()` 统一管理。但 `initialize()` 是公开方法，需要外部调用。
- **代码位置**：`src/stores/netWorkStore.ts:27-29`、`261-276`、`297-300`
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。监听器生命周期管理是必要行为。

#### 11.3 UDP 目标地址解析

- **旧行为**：`sendData` 接收 `targetHost` 参数，格式为 `host:port`。解析时按 `:` 分割，如果 parts.length === 2 则使用解析后的 host 和 port，否则使用连接默认配置。UDP 发送使用 `socket.send(data, port, host)`。
- **代码位置**：`src-electron/main/ipc/networkHandlers.ts:359-371`（地址解析）、`420-436`（UDP 发送）
- **新系统对应 feature**：connection feature
- **oracle 来源**：代码事实。
- **保留建议**：**保留**。UDP 目标地址动态指定是必要能力。

#### 11.4 连接 ID 命名规则

- **旧行为**：网络连接 ID 由外部（UI/调用方）生成传入。串口使用端口路径（如 `COM3`）作为标识。`connectionTargetsStore` 使用复合 ID：`serial:{portPath}`、`network:{connectionId}`、`network:{connectionId}:{remoteHostId}`。
- **代码位置**：`src/stores/connectionTargetsStore.ts:56-121`（ID 生成）
- **新系统对应 feature**：connection feature
- **oracle 来源**：代码事实。
- **保留建议**：**保留命名空间概念，重写编码规则**。`type:id` 命名空间概念合理，具体编码应在设计阶段确定。

---

## 后续

### 行为保留/排除汇总

**保留的行为（核心，不可丢失）**：
1. 串口四状态生命周期（disconnected → connecting → connected → error）
2. 串口配置参数集合 + 每端口独立配置 + 热更新（关闭重开）
3. 多串口并发管理
4. TCP 客户端连接（setNoDelay、超时、\r\n 分割）
5. TCP Server 多客户端管理
6. UDP 绑定 + 远程主机列表 + 广播模式
7. 网络数据高速存储分流（连接 ID + 帧头匹配 → 文件存储，不转发渲染进程）
8. 高速存储文件轮转（大小限制 + 文件数量限制）
9. 统一连接目标视图（串口 + 网络合并为 ConnectionTarget）
10. 连接统计（bytes/messages/activity）
11. 最后使用串口记忆
12. 应用退出时关闭所有连接
13. TCP \r\n 数据分割

**排除的行为**：
1. `receivedMessagesMap` / `sentMessagesMap` 100 条内存历史（调试功能，receive feature 有独立存储）
2. 自动连接/自动重连（类型定义存在但未实现）
3. 串口端口热插拔自动检测（无实现）
4. Windows 注册表 PowerShell 枚举方式（应迁移到 serialport 库原生 list）
5. `clearBuffer` 只重置计数器不真正清空缓冲区（行为名不副实，新系统应明确语义）
6. `autoOpen: false` 配置项（始终 false，新系统不需要此配置）

**需重新设计的行为**：
1. 连接配置持久化方式（从 localStorage 迁移到新持久化层）
2. 网络连接配置持久化（旧系统无持久化，新系统应增加）
3. IPC 通道命名和 preload 桥接方式
4. 连接目标 ID 编码规则
5. TCP \r\n 分割是否参数化
6. UDP 远程主机管理的持久化
7. 高速存储配置的持久化

### oracle 来源评估

| 行为领域 | oracle 可信度 | 说明 |
|---|---|---|
| 串口连接生命周期 | 高 | 代码事实完整，四状态模型清晰 |
| TCP/UDP 连接管理 | 高 | main 进程代码完整，类型定义完备 |
| 高速存储分流 | 高 | 代码链路完整：shouldStore → storeData → 文件轮转 |
| 连接目标统一视图 | 高 | connectionTargetsStore 完整实现 |
| 自动重连 | 低 | 仅有类型定义，无实现代码 |
| UI 状态展示 | 中 | store 有状态和计算属性，但缺少 UI 组件代码佐证 |

### 新系统 feature 映射

| 旧行为 | 新系统 feature |
|---|---|
| 串口枚举/连接/断开/配置 | connection feature |
| TCP/UDP/TCP Server 连接管理 | connection feature |
| 数据收发通道（IPC 事件） | connection feature（platform facade） |
| TCP \r\n 分割 | connection feature 或 receive feature（待设计确定） |
| 高速存储分流 + 文件管理 | storage feature |
| 统一连接目标视图 | connection feature（selector）+ send feature |
| 连接统计 | connection feature（selector） |
| 配置持久化 | persistence layer + connection feature |
