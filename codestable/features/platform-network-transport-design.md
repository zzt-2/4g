# Platform Network Transport — Design

> Feature: platform-network-transport
> Date: 2026-05-08
> Status: approved
> Input: codestable/compound/2026-05-08-platform-expansion-brainstorm.md

---

## 1. Problem

renderer 通过 platform facade 只能访问串口。TCP/UDP 在四层（shared types / main / preload / facade）全部缺失。connection-complete（Wave 2）依赖此能力，它又是 Wave 3-4 的前置。

## 2. Design Decisions

### D1: 统一 connect 接口

`TransportBridge.connect(config: TransportConnectConfig)` 统一入口，discriminated union 区分传输类型。替代分立方法（connectTcp / listenTcp / connectUdp），理由：
- disconnect/write/cleanup 已经按 connectionId 多态，connect 也应该统一
- 对后续 HTTP transport 扩展友好（只加 config 变体，不改 interface）

影响：
- `connectSerial` 从 `TransportBridge` 和 `TransportFacade` 中移除
- `SerialConnectConfig` 新增 `kind: 'serial'` discriminant
- `RealSerialAdapter` 迁移到 `connect({ kind: 'serial', ... })`

### D2: TCP Server 事件设计

listener 和每个 accepted client 各自拥有独立 connectionId：
- listener 的 connectionId = config 中的 `id`
- client 的 connectionId = `${listenerId}::client:${remoteAddress}:${remotePort}`

事件流：
1. `connect(tcpServerConfig)` → listener 的 `connected`（`role: 'tcp-server-listener'`）
2. 客户端连入 → `connected`（`role: 'tcp-server-client'`，新 connectionId）
3. 客户端断开 → `disconnected`
4. `disconnect(listenerId)` → 关闭所有客户端 + listener，返回所有 `disconnected` 事件

### D3: 主进程架构 — Preload 路由

preload 维护 `connectionId → transport type` 映射，将 disconnect/write/cleanup 路由到正确的 IPC channel。serial-handlers.ts 不做任何修改。

- serial-handlers.ts：完全不动，保持现有 IPC channels
- network-handlers.ts：新建，独立管理 TCP/UDP 连接，使用新的 IPC channels
- 两者共享 `transport:event` 事件 channel
- preload 的 `TransportBridge` 实现做路由分发

### D4: UDP 写入目标

UDP `connect` 时指定 `remoteHost`/`remotePort`。`write()` 发送到配置目标。未配置目标时 `write()` 返回错误。多目标发送留给未来 `writeTo()` 扩展。

### D5: Batch 参数

TCP/UDP 复用串口策略（maxBatchBytes=4096, maxBatchWindowMs=50, maxQueueDepth=100），参数独立可配。batch 基础设施在 network-handlers 中独立复制一份（与 serial-handlers 不共享），后续可提取为 main 内部共享模块，但不阻塞本 feature。

### D6: RewritePlatformCapability

当前 `RewritePlatformCapability` 类型只有 `'transport'`。TCP/UDP 是 transport 能力的扩展（不是新的能力类别），保持 `'transport'` 不变。未来文件系统等独立能力再加入新值（如 `'filesystem'`、`'window'`）。

### D7: 已知限制

- TCP Server clientId 格式 `${serverId}::client:${addr}:${port}` 在同一客户端断开重连时可能产生 connectionId 冲突。实际影响由 connection-complete 的 adapter 层状态管理覆盖。
- UDP 无 remoteHost/remotePort 时 write 返回错误。多目标发送留给未来 `writeTo()` 扩展。

## 3. Type Changes — shared/platform-bridge.ts

### 新增类型

```ts
export interface TcpClientConnectConfig {
  readonly kind: 'tcp-client';
  readonly id: string;
  readonly host: string;
  readonly port: number;
}

export interface TcpServerConnectConfig {
  readonly kind: 'tcp-server';
  readonly id: string;
  readonly host: string;
  readonly port: number;
}

export interface UdpConnectConfig {
  readonly kind: 'udp';
  readonly id: string;
  readonly localHost: string;
  readonly localPort: number;
  readonly remoteHost?: string;
  readonly remotePort?: number;
}

export type TransportConnectConfig =
  | SerialConnectConfig
  | TcpClientConnectConfig
  | TcpServerConnectConfig
  | UdpConnectConfig;
```

### 修改 SerialConnectConfig

新增 `kind: 'serial'` discriminant：

```ts
export interface SerialConnectConfig {
  readonly kind: 'serial';
  readonly id: string;
  readonly portPath: string;
  readonly baudRate: number;
}
```

### 修改 TransportBridge

```diff
 export interface TransportBridge {
   enumerateSerialPorts(): Promise<readonly SerialPortCandidate[]>;
-  connectSerial(config: SerialConnectConfig): Promise<TransportCommandResult>;
+  connect(config: TransportConnectConfig): Promise<TransportCommandResult>;
   disconnect(connectionId: string): Promise<TransportCommandResult>;
   write(connectionId: string, bytes: readonly number[]): Promise<TransportCommandResult>;
   cleanup(): Promise<TransportCommandResult>;
   drainEvents(): readonly TransportBridgeEvent[];
   onEvent(callback: (event: TransportBridgeEvent) => void): () => void;
 }
```

### 与 connection 层类型的对应

platform bridge 类型是 connection `TransportConfig` 的子集（无 `label`），adapter 做映射：

| Platform bridge | Connection feature |
|---|---|
| `SerialConnectConfig` (kind+id+portPath+baudRate) | `SerialTransportConfig` (+label) |
| `TcpClientConnectConfig` (kind+id+host+port) | `TcpClientTransportConfig` (+label) |
| `TcpServerConnectConfig` (kind+id+host+port) | `TcpServerTransportConfig` (+label) |
| `UdpConnectConfig` (kind+id+localHost+localPort+remote?) | `UdpTransportConfig` (+label) |

## 4. Main Process — network-handlers.ts（新建）

### 内部连接类型

```ts
interface ManagedTcpClient {
  type: 'tcp-client';
  socket: net.Socket;
  id: string;
  config: TcpClientConnectConfig;
  batchBuffer: number[];
  batchTimer: ReturnType<typeof setTimeout> | null;
}

interface ManagedTcpServer {
  type: 'tcp-server';
  server: net.Server;
  id: string;
  config: TcpServerConnectConfig;
  clients: Map<string, ManagedTcpServerClient>;
}

interface ManagedTcpServerClient {
  type: 'tcp-server-client';
  socket: net.Socket;
  id: string;
  listenerId: string;
  batchBuffer: number[];
  batchTimer: ReturnType<typeof setTimeout> | null;
}

interface ManagedUdp {
  type: 'udp';
  socket: dgram.Socket;
  id: string;
  config: UdpConnectConfig;
  batchBuffer: number[];
  batchTimer: ReturnType<typeof setTimeout> | null;
}
```

### IPC Channels

```
transport:network-connect    — TCP/UDP connect/listen/bind
transport:network-disconnect — disconnect
transport:network-write      — write
transport:network-cleanup    — close all
transport:event              — 共享（与 serial 相同）
```

### TCP Client 行为

1. 创建 `net.Socket`，连接 `host:port`
2. `setNoDelay(true)`，可选超时（默认 5000ms）
3. 成功 → push `connected`（`role: 'tcp-client-peer'`）
4. data → batch buffer → flush 时 push `data`
5. close → push `disconnected`
6. error → push `error`

### TCP Server 行为

1. 创建 `net.Server`，监听 `host:port`
2. 成功 → push `connected`（`role: 'tcp-server-listener'`）
3. 客户端连入 → 分配 `connectionId = ${serverId}::client:${remoteAddress}:${remotePort}` → push `connected`（`role: 'tcp-server-client'`）
4. 客户端 data → 独立 batch buffer → flush 时 push `data`
5. 客户端 close → push `disconnected`
6. disconnect(listenerId) → 关闭所有客户端 + listener
7. disconnect(clientId) → 只关闭该客户端

### UDP 行为

1. 创建 `dgram.Socket('udp4')`，绑定 `localHost:localPort`
2. 成功 → push `connected`（`role: 'udp-remote'`）
3. message → batch buffer → flush 时 push `data`
4. write → `socket.send(bytes, remotePort, remoteHost)`
5. 未配置 remoteHost/remotePort 时 write 返回 error

### 导出

```ts
export function registerNetworkHandlers(mainWindow: BrowserWindow): void;
export function cleanupNetworkHandlers(): void;
```

## 5. Preload Changes — src-electron/preload/index.ts

### 新增常量

```ts
const IPC_NETWORK_CONNECT = 'transport:network-connect';
const IPC_NETWORK_DISCONNECT = 'transport:network-disconnect';
const IPC_NETWORK_WRITE = 'transport:network-write';
const IPC_NETWORK_CLEANUP = 'transport:network-cleanup';
```

### 连接类型路由

```ts
const connectionTypes = new Map<string, 'serial' | 'network'>();
```

填充时机：
- `connect()` 返回 ok → `connectionTypes.set(id, type)`
- 事件监听器收到 `connected` 且 `target.role` 含 `tcp-server-client` → `connectionTypes.set(connectionId, 'network')`
- `disconnect()` → `connectionTypes.delete(connectionId)`
- 事件监听器收到 `disconnected` → `connectionTypes.delete(connectionId)`

### TransportBridge 实现

```ts
const transportBridge: TransportBridge = {
  enumerateSerialPorts: () => ipcRenderer.invoke(IPC_ENUMERATE),

  async connect(config: TransportConnectConfig): Promise<TransportCommandResult> {
    if (config.kind === 'serial') {
      const result = await ipcRenderer.invoke(IPC_CONNECT, config);
      if (result.ok) connectionTypes.set(config.id, 'serial');
      return result;
    }
    const result = await ipcRenderer.invoke(IPC_NETWORK_CONNECT, config);
    if (result.ok) connectionTypes.set(config.id, 'network');
    return result;
  },

  async disconnect(connectionId: string): Promise<TransportCommandResult> {
    const type = connectionTypes.get(connectionId);
    connectionTypes.delete(connectionId);
    // fallback: unknown connectionId 走 network（包括 TCP Server client 事件丢失的场景）
    if (type === 'serial') {
      return ipcRenderer.invoke(IPC_DISCONNECT, connectionId);
    }
    return ipcRenderer.invoke(IPC_NETWORK_DISCONNECT, connectionId);
  },

  async write(connectionId: string, bytes: readonly number[]): Promise<TransportCommandResult> {
    const type = connectionTypes.get(connectionId);
    // fallback: 同上
    if (type === 'serial') {
      return ipcRenderer.invoke(IPC_WRITE, connectionId, bytes);
    }
    return ipcRenderer.invoke(IPC_NETWORK_WRITE, connectionId, bytes);
  },

  async cleanup(): Promise<TransportCommandResult> {
    connectionTypes.clear();
    const [serialResult, networkResult] = await Promise.all([
      ipcRenderer.invoke(IPC_CLEANUP),
      ipcRenderer.invoke(IPC_NETWORK_CLEANUP),
    ]);
    // 二次清理：防止 cleanup 期间 late-arriving 事件泄漏记录
    connectionTypes.clear();
    return {
      ok: serialResult.ok && networkResult.ok,
      events: [...serialResult.events, ...networkResult.events],
    };
  },

  drainEvents: () => eventBuffer.splice(0, eventBuffer.length),
  onEvent: (callback) => { /* unchanged */ },
};
```

### 事件监听器更新

在现有 `transport:event` 监听器中增加路由跟踪：

```ts
ipcRenderer.on(IPC_EVENT_CHANNEL, (_e, event: TransportBridgeEvent) => {
  // 路由跟踪
  if (event.kind === 'connected' && event.target?.role === 'tcp-server-client') {
    connectionTypes.set(event.connectionId, 'network');
  }
  if (event.kind === 'disconnected') {
    connectionTypes.delete(event.connectionId);
  }

  eventBuffer.push(event);
  for (const cb of eventCallbacks) {
    try { cb(event); } catch { }
  }
});
```

## 6. Facade Changes

### platform/transport.ts

`connectSerial` → `connect`：

```ts
export interface TransportFacade {
  enumerateSerialPorts(): Promise<readonly SerialPortCandidate[]>;
  connect(config: TransportConnectConfig): Promise<TransportCommandResult>;
  disconnect(connectionId: string): Promise<TransportCommandResult>;
  write(connectionId: string, bytes: readonly number[]): Promise<TransportCommandResult>;
  cleanup(): Promise<TransportCommandResult>;
  drainEvents(): readonly TransportBridgeEvent[];
  onEvent(callback: (event: TransportBridgeEvent) => void): () => void;
}
```

`createTransportFacade` 同步更新。

### platform/index.ts

新增 re-export：
- `TransportConnectConfig`
- `TcpClientConnectConfig`
- `TcpServerConnectConfig`
- `UdpConnectConfig`

## 7. Adapter Migration — real-serial-adapter.ts

### connect 方法

```diff
- const result = await transport.connectSerial({
-   id: config.id,
-   portPath: config.portPath,
-   baudRate: config.baudRate,
- });
+ const result = await transport.connect({
+   kind: 'serial',
+   id: config.id,
+   portPath: config.portPath,
+   baudRate: config.baudRate,
+ });
```

### mapBridgeEvent cast 修复

```diff
- kind: event.target.kind as 'serial',
- role: event.target.role as 'serial-port',
+ kind: event.target.kind as TransportKind,
+ role: event.target.role as TransportTargetRole,
```

需新增 import `TransportKind` 和 `TransportTargetRole`（来自 connection core types 或定义在 shared）。

### main/index.ts

```diff
- import { registerSerialHandlers, cleanupSerialHandlers } from './serial-handlers';
+ import { registerSerialHandlers, cleanupSerialHandlers } from './serial-handlers';
+ import { registerNetworkHandlers, cleanupNetworkHandlers } from './network-handlers';
```

```diff
  registerSerialHandlers(mainWindow);
+ registerNetworkHandlers(mainWindow);
```

```diff
  mainWindow.on('closed', () => {
    cleanupSerialHandlers();
+   cleanupNetworkHandlers();
    mainWindow = undefined;
  });
```

## 8. File Change Manifest

| 文件 | 操作 | 改动 |
|---|---|---|
| `rewrite/src/shared/platform-bridge.ts` | 修改 | 新增 3 个 config 类型 + TransportConnectConfig union；SerialConnectConfig 加 kind；TransportBridge 接口改 connectSerial → connect |
| `rewrite/src-electron/main/network-handlers.ts` | **新建** | TCP/UDP 连接管理 + IPC handler + batch/queue/overflow |
| `rewrite/src-electron/main/serial-handlers.ts` | 不动 | — |
| `rewrite/src-electron/main/index.ts` | 修改 | import + register + cleanup network handlers |
| `rewrite/src-electron/preload/index.ts` | 修改 | 统一路由（connectionType map + connect/disconnect/write/cleanup 分发） |
| `rewrite/src/platform/transport.ts` | 修改 | connectSerial → connect |
| `rewrite/src/platform/index.ts` | 修改 | re-export 新类型 |
| `rewrite/src/features/connection/adapters/real-serial-adapter.ts` | 修改 | connect 迁移 + cast 修复 |

## 9. Out of Scope

- TCP/UDP adapter（connection 层的 RealTcpAdapter/RealUdpAdapter）→ connection-complete
- 断线重连 → connection-complete
- UDP 多目标发送（writeTo）→ 未来扩展
- 文件系统、窗口控制、对话框 → Wave 5-7
- HTTP/FTP → northbound（Wave 6）
- 高速存储 stream 写入 → storage-real

## 10. Testing Strategy

| 层 | 方式 | 覆盖 |
|---|---|---|
| shared types | TypeScript 编译 | 类型正确性 |
| network-handlers | 手动验证（真实 socket） | TCP/UDP 连通性 |
| preload | 无单测（依赖 Electron IPC） | 集成验证覆盖 |
| facade | Vitest + mock bridge | connect 方法路由 |
| real-serial-adapter | 现有测试 | 不 break |

端到端手动验证：
1. TCP Client 连接到外部 TCP Server → 收发数据 → 断开
2. TCP Server 监听端口 → 外部客户端连入 → 收发数据 → 断开
3. UDP 绑定端口 → 收发数据 → 关闭
4. 串口功能不受影响（回归）

## 11. Acceptance Criteria

- TCP Client 可连接远程 Server，收发数据，断开
- TCP Server 可监听端口，accept 客户端，为客户端收发数据
- UDP 可绑定端口，收发数据
- 现有串口功能不受影响
- renderer 不直接访问 Node/Electron
- main 不包含业务逻辑
- `pnpm -C rewrite build` 通过
- `pnpm -C rewrite lint` 通过
- 现有测试全部通过
