# Trick: Preload IPC 多通道路由模式

## 问题

Electron preload bridge 需要同时路由多种 transport（serial、TCP、UDP、HTTP/FTP）的 IPC 调用。不同 transport 使用不同 IPC channel（`transport:serial-*`、`transport:network-*`），但共享同一个 event channel（`transport:event`）。

若在 preload 硬编码每种 transport 的路由逻辑，会导致：
- 扩展新 transport 需要改动多处代码
- 事件监听器难以准确区分 connection 来源
- cleanup 容易遗漏某些 transport

## 模式

**类型映射路由**：用 `Map<connectionId, TransportType>` 记录每个连接的传输类型，在 connect 时记录、在操作时查表路由。

### 核心要素

1. **类型注册表**：`connectionTypes: Map<string, 'serial' | 'network' | 'http' | ...>`
2. **显式注册时机**：connect 成功时按 config.kind 记录类型
3. **隐式注册时机**：事件监听中捕获被动连接（如 TCP Server 的 client 连入）
4. **路由查表**：disconnect/write 时按 map 查找，fallback 到默认类型
5. **双重清理**：cleanup 时前后两次 `connectionTypes.clear()` 防泄漏

## 代码骨架

```typescript
// 1. 类型定义
const IPC_EVENT_CHANNEL = 'transport:event';

const IPC_SERIAL_CONNECT = 'transport:serial-connect';
const IPC_SERIAL_DISCONNECT = 'transport:serial-disconnect';
const IPC_SERIAL_WRITE = 'transport:serial-write';
const IPC_SERIAL_CLEANUP = 'transport:cleanup';

const IPC_NETWORK_CONNECT = 'transport:network-connect';
const IPC_NETWORK_DISCONNECT = 'transport:network-disconnect';
const IPC_NETWORK_WRITE = 'transport:network-write';
const IPC_NETWORK_CLEANUP = 'transport:network-cleanup';

// 未来新增 transport：
// const IPC_HTTP_CONNECT = 'transport:http-connect';
// const IPC_HTTP_DISCONNECT = 'transport:http-disconnect';

// 2. 类型注册表
const connectionTypes = new Map<string, 'serial' | 'network' | 'http'>();

// 3. 事件监听中捕获被动连接
ipcRenderer.on(IPC_EVENT_CHANNEL, (_e, event: TransportBridgeEvent) => {
  // TCP Server 的 client 连入时，main 进程不会先调用 connect
  if (event.kind === 'connected' && event.target?.role === 'tcp-server-client') {
    connectionTypes.set(event.connectionId, 'network');
  }
  if (event.kind === 'disconnected') {
    connectionTypes.delete(event.connectionId);
  }
  // ... 其他事件处理
});

// 4. connect 时按 config.kind 显式注册
async connect(config: TransportConnectConfig): Promise<TransportCommandResult> {
  if (config.kind === 'serial') {
    const result = await ipcRenderer.invoke(IPC_SERIAL_CONNECT, config);
    if (result.ok) connectionTypes.set(config.id, 'serial');
    return result;
  }
  // TCP/UDP 等 network 类型
  const result = await ipcRenderer.invoke(IPC_NETWORK_CONNECT, config);
  if (result.ok) connectionTypes.set(config.id, 'network');
  return result;
}

// 5. disconnect 时按类型路由
async disconnect(connectionId: string): Promise<TransportCommandResult> {
  const type = connectionTypes.get(connectionId);
  connectionTypes.delete(connectionId); // 提前删除，防止失败后重试时残留

  if (type === 'serial') {
    return ipcRenderer.invoke(IPC_SERIAL_DISCONNECT, connectionId);
  }
  // fallback 到 network（覆盖 TCP Server client 事件丢失场景）
  return ipcRenderer.invoke(IPC_NETWORK_DISCONNECT, connectionId);
}

// 6. write 时按类型路由
async write(connectionId: string, bytes: readonly number[]): Promise<TransportCommandResult> {
  const type = connectionTypes.get(connectionId);
  if (type === 'serial') {
    return ipcRenderer.invoke(IPC_SERIAL_WRITE, connectionId, bytes);
  }
  return ipcRenderer.invoke(IPC_NETWORK_WRITE, connectionId, bytes);
}

// 7. cleanup 时双重清理
async cleanup(): Promise<TransportCommandResult> {
  connectionTypes.clear(); // 第一次清理，释放引用
  const [serialResult, networkResult] = await Promise.all([
    ipcRenderer.invoke(IPC_SERIAL_CLEANUP),
    ipcRenderer.invoke(IPC_NETWORK_CLEANUP),
  ]);
  connectionTypes.clear(); // 第二次清理，防泄漏（边缘情况）
  return {
    ok: serialResult.ok && networkResult.ok,
    events: [...serialResult.events, ...networkResult.events],
  };
}
```

## 扩展点

新增 transport 类型（如 HTTP/FTP）时只需：

1. **扩展类型联合**：
   ```typescript
   const connectionTypes = new Map<string, 'serial' | 'network' | 'http' | 'ftp'>();
   ```

2. **新增 IPC channel 常量**：
   ```typescript
   const IPC_HTTP_CONNECT = 'transport:http-connect';
   const IPC_HTTP_DISCONNECT = 'transport:http-disconnect';
   const IPC_HTTP_WRITE = 'transport:http-write';
   const IPC_HTTP_CLEANUP = 'transport:http-cleanup';
   ```

3. **在 connect/disconnect/write 中加分支**：
   ```typescript
   if (config.kind === 'http') {
     const result = await ipcRenderer.invoke(IPC_HTTP_CONNECT, config);
     if (result.ok) connectionTypes.set(config.id, 'http');
     return result;
   }
   ```

4. **在 cleanup 中加入 Promise.all**：
   ```typescript
   const [serialResult, networkResult, httpResult] = await Promise.all([
     ipcRenderer.invoke(IPC_SERIAL_CLEANUP),
     ipcRenderer.invoke(IPC_NETWORK_CLEANUP),
     ipcRenderer.invoke(IPC_HTTP_CLEANUP),
   ]);
   ```

**核心优势**：事件监听器无需改动，只需扩展类型联合和对应的 IPC channel 路由。

## 参考实现

`rewrite/src-electron/preload/index.ts` —— 完整的 serial + network 双通道路由实现。

## 注意事项

1. **Fallback 策略**：disconnect/write 时若 `connectionTypes.get()` 返回 `undefined`，需要 fallback 到合理的默认值（如 network）。这覆盖了边缘情况，例如 TCP Server 的 client 事件丢失导致未及时注册类型。

2. **提前删除**：disconnect 时先 `connectionTypes.delete()` 再调用 IPC，避免 IPC 失败后重试时 map 中仍有残留。

3. **双重清理**：cleanup 时前后两次 `clear()` 是防御性编程。第一次释放主要引用，第二次清理边缘情况下的泄漏（如 IPC 调用期间新建立的连接）。

4. **被动连接注册**：TCP Server 的 client 连入由 main 进程主动推送 `connected` 事件，preload 无法提前知道类型，必须在事件监听中捕获并注册。
