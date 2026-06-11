# Electron Main Process Handler 模板模式

## 问题

main process 需要管理多种 native resource（串口、TCP client/server、UDP socket、HTTP/FTP、文件系统），每种有：
- 独立生命周期（open/close/error）
- 高频数据接收（需要 batch 聚合）
- 统一事件推送到 renderer
- 资源 ID 冲突防御
- 主动断开 vs 意外断开的区分

直接复制粘贴会导致：不一致的错误处理、资源泄漏、事件队列溢出、重复的 batch 逻辑。

## 模式

### 核心骨架

```typescript
// 1. Discriminated union 管理资源类型
interface ManagedTcpClient {
  type: 'tcp-client';
  socket: net.Socket;
  id: string;
  batchBuffer: number[];
  batchTimer: ReturnType<typeof setTimeout> | null;
}

interface ManagedTcpServer {
  type: 'tcp-server';
  server: net.Server;
  id: string;
  clients: Map<string, ManagedTcpServerClient>;
}

type ManagedConnection = ManagedTcpClient | ManagedTcpServer | ManagedUdp;

// 2. 全局索引
let connections = new Map<string, ManagedConnection>();

// 3. 防止主动断开时推送重复事件
const intentionalDisconnect = new Set<string>();

// 4. Batch 基础设施
interface Batchable {
  batchBuffer: number[];
  batchTimer: ReturnType<typeof setTimeout> | null;
}

function flushBatch(batchable: Batchable, connectionId: string, win: BrowserWindow): void {
  if (batchable.batchBuffer.length === 0) return;
  const bytes = batchable.batchBuffer;
  batchable.batchBuffer = [];

  if (batchable.batchTimer !== null) {
    clearTimeout(batchable.batchTimer);
    batchable.batchTimer = null;
  }

  emitToRenderer(win, { kind: 'data', connectionId, bytes, byteLength: bytes.length });
}

function scheduleBatchFlush(batchable: Batchable, connectionId: string, win: BrowserWindow): void {
  if (batchable.batchBuffer.length >= batchConfig.maxBatchBytes) {
    flushBatch(batchable, connectionId, win);
    return;
  }
  if (batchable.batchTimer !== null) return;
  batchable.batchTimer = setTimeout(() => {
    batchable.batchTimer = null;
    flushBatch(batchable, connectionId, win);
  }, batchConfig.maxBatchWindowMs);
}

function cleanupBatchable(batchable: Batchable): void {
  if (batchable.batchBuffer.length > 0) {
    batchable.batchBuffer = [];
  }
  if (batchable.batchTimer !== null) {
    clearTimeout(batchable.batchTimer);
    batchable.batchTimer = null;
  }
}

// 5. 统一事件推送 + bounded buffer
let eventQueue: TransportBridgeEvent[] = [];

function emitToRenderer(win: BrowserWindow, event: TransportBridgeEvent): void {
  if (eventQueue.length >= batchConfig.maxQueueDepth) {
    eventQueue.shift(); // 防止无限增长
  }
  eventQueue.push(event);
  try {
    win.webContents.send(IPC_EVENT_CHANNEL, event);
  } catch {
    // webContents may be destroyed during shutdown
  }
}
```

### TCP Server 特殊处理

TCP server 有 listener 和 accepted client 两层，需要：

```typescript
// client ID 命名：listenerId::client:remoteAddress:remotePort
const clientId = `${config.id}::client:${remoteAddress}:${remotePort}`;

// ID 冲突防御：新 client 连入时先清理旧 client
const existing = conn.clients.get(clientId);
if (existing) {
  cleanupBatchable(existing);
  existing.socket.destroy();
  emitToRenderer(win, { kind: 'disconnected', connectionId: clientId, occurredAt: now() });
}

// client 同时存入 server.clients 和全局 connections
conn.clients.set(clientId, clientConn);
connections.set(clientId, clientConn);

// 断开 listener 时关闭所有 client
if (conn.type === 'tcp-server') {
  for (const [clientId, client] of conn.clients) {
    intentionalDisconnect.add(clientId);
    cleanupBatchable(client);
    client.socket.destroy();
    connections.delete(clientId);
  }
  conn.clients.clear();
}
```

### 导出模式

```typescript
export function registerNetworkHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_NETWORK_CONNECT, (_e, config: TransportConnectConfig) =>
    handleNetworkConnect(config, mainWindow),
  );
  ipcMain.handle(IPC_NETWORK_DISCONNECT, (_e, connectionId: string) =>
    handleNetworkDisconnect(connectionId),
  );
  // ...
}

export function cleanupNetworkHandlers(): void {
  for (const conn of connections.values()) {
    // 清理所有资源
  }
  connections = new Map();
  eventQueue = [];
  intentionalDisconnect.clear();
}
```

## 扩展点

### HTTP/FTP Handler

```typescript
interface ManagedHttpDownload {
  type: 'http-download';
  client: HTTPClient;
  id: string;
  // HTTP 特有：进度、chunk、暂停/恢复
  progress: { downloaded: number; total: number };
  paused: boolean;
}

interface Batchable {
  batchBuffer: number[];
  batchTimer: ReturnType<typeof setTimeout> | null;
}

// HTTP 可复用 Batchable（chunk 聚合）和 emitToRenderer
// 不需要 intentionalDisconnect（HTTP 无持久连接）
```

### 文件系统 Handler

```typescript
interface ManagedFileWatcher {
  type: 'file-watcher';
  watcher: FSWatcher;
  id: string;
  // 文件系统特有：debounce、事件过滤
  eventBuffer: FileSystemEvent[];
  debounceTimer: ReturnType<typeof setTimeout> | null;
}

// 可复用 emitToRenderer
// 不需要 batch（文件事件频率低）
// 不需要 intentionalDisconnect（watcher close 不推送事件）
```

## 参考实现

- `rewrite/src-electron/main/network-handlers.ts` — TCP client/server + UDP 完整实现
- `rewrite/src-electron/main/serial-handlers.ts` — 串口完整实现

## 关键约束

1. **不承载业务逻辑**：main process 只管平台资源访问和生命周期，不承载任务状态、协议语义或业务规则
2. **统一事件格式**：所有 handler 通过同一条 IPC channel 推送 `TransportBridgeEvent`
3. **类型安全**：Managed 类型用 discriminated union，避免运行时类型判断
4. **错误处理**：所有异步操作必须 try/catch，防止未捕获 promise rejection
5. **资源清理**：cleanupHandlers 必须清理所有资源，防止窗口关闭后内存泄漏
