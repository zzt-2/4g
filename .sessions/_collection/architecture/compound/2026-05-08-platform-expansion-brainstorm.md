# Platform Expansion Brainstorm — TCP/UDP 传输能力

> 日期：2026-05-08
> 性质：brainstorm 结论，锁定范围和决策，作为 cs-feat-design 的输入
> 状态：已确认

---

## 一、要解决什么问题

renderer 当前只能通过 platform facade 访问串口。TCP/UDP 传输能力在 main/preload/facade 三层全部缺失（类型已定义，零实现）。

TCP/UDP 是 connection-complete（Wave 2）的前置依赖，而 connection-complete 又是 receive-real 和 send-real（Wave 3）的前置依赖。不做 TCP/UDP，Wave 2-4 全部卡住。

## 二、核心行为

四层架构，和现有串口模式一致：

### 第 1 层：main process — `network-handlers.ts`（新建）

用 Node.js `net` 和 `dgram` 模块管理真实 socket。注册 IPC handler 供 preload 调用。

- **TCP Client**：连接远程 IP:Port，收发数据，断开
- **TCP Server**：监听本地 IP:Port，accept 外部连入，为每个客户端分配 connectionId，收发数据，关闭 listener
- **UDP**：绑定本地端口，向目标发数据，收数据，关闭
- **数据批处理**：复用串口已有 batch/queue/overflow 策略，TCP/UDP 可独立配置参数
- **IPC channel**：按命名规范注册到 ipcMain

硬约束：main 不承载任何业务逻辑（帧头匹配、存储路由、协议解析等）。

### 第 2 层：preload — 扩展 TransportBridge（改现有）

在现有 `transportBridge` 对象上新增 TCP/UDP 方法，每个方法转发 IPC。

现有 `enumerateSerialPorts` / `connectSerial` 保留不动。

### 第 3 层：shared 类型 — 扩展 `platform-bridge.ts`（改现有）

`TransportBridge` 接口新增 TCP/UDP 方法签名。类型已存在（`TcpClientTransportConfig`、`TcpServerTransportConfig`、`UdpTransportConfig`），需对齐接口。

### 第 4 层：facade — 扩展 `TransportFacade`（改现有）

`TransportFacade` 暴露新的连接方法。`RealSerialAdapter` 做小迁移：从调 `connectSerial` 改为调新的统一 `connect` 方法。行为不变，只是走新入口。

## 三、不做什么

| 不做 | 理由 |
|---|---|
| TCP/UDP adapter（connection 层的 `RealTcpAdapter`） | connection-complete 的范围 |
| 断线重连 | connection-complete 的范围 |
| 文件系统、窗口控制、对话框 | Wave 5-7 按需做，当前无消费者 |
| HTTP/FTP | northbound（Wave 6）的范围 |
| 旧系统业务逻辑（帧头匹配、存储路由） | main 不承载业务逻辑，硬规则 |
| UI 页面 | 不在本 feature 范围 |

## 四、关键设计决策（留给 design 阶段）

1. **接口统一 vs 分立**：一个 `connect(config: TransportConfig)` 万能入口，还是 `connectTcp` / `listenTcp` / `connectUdp` 分开写。影响 facade 和 preload API 形态。
2. **TCP Server 事件设计**：外部客户端连入时，如何通知 renderer（事件格式、connectionId 分配策略）。
3. **batch 参数差异**：TCP/UDP 和串口用同一套默认值，还是各自可配。

倾向方向：统一 `connect` 入口，TCP/UDP 参数通过 discriminated union 区分。理由：
- `disconnect`/`write`/`cleanup` 已经按 connectionId 多态，不关心底层类型
- 和 `ConnectionTransportAdapter` 的 `connect(config)` 模式一致
- 对后续 northbound HTTPS transport 扩展友好

## 五、验收标准

- TCP Client：连到真实 TCP Server，收发数据，断开
- TCP Server：监听端口，accept 外部连接，为客户端收发数据，关闭
- UDP：绑定端口，收发数据，关闭
- 现有串口功能不受影响
- renderer 不直接访问 Node/Electron，全部通过 facade
- main 不包含任何业务逻辑
- `RewritePlatformCapability` 准确反映已实现能力

## 六、依赖顺序与波次

```
platform-expansion (Wave 1, 本 feature)
  → connection-complete (Wave 2) [需要 TCP/UDP adapter]
    → receive-real + send-real (Wave 3) [需要 connection-complete]
```

本 feature 与 expression-engine、frame-real 并行（Wave 1），互不依赖。

本 feature 在关键路径上。

## 七、旧代码参考

| 用什么 | 从哪找 | 怎么用 |
|---|---|---|
| TCP/UDP socket 管理 | 旧 `src-electron/main/ipc/networkHandlers.ts`（679 行） | 参考 socket 创建、连接、收发的技术实现 |
| 数据批处理模式 | 现有 `rewrite/src-electron/main/serial-handlers.ts` | 复用 batch/queue/overflow 架构 |
| 业务逻辑分离 | 旧 `handleDataReceived()` | **反面教材**——帧头匹配和存储路由不能搬进 main |
| TCP Server 多客户端 | 旧 `NetworkConnectionManager.tcpServerClients` Map | 参考 listener + client 映射模式 |
| UDP broadcast | 旧 `connectUdp` 的 `options.broadcast` | 参考 UDP 广播模式 |

## 八、推迟到后续 Wave 的能力

| 能力 | 谁需要 | 什么时候需要 | 备注 |
|---|---|---|---|
| 文件读写/目录 | storage-real | Wave 5 | 先用内存存储 |
| 系统对话框 | storage 导入导出 | Wave 5 | |
| 路径解析 | storage 持久化 | Wave 5 | |
| 窗口控制 | ui-pages | Wave 7 | 当前 Electron 原生装饰够用 |
| HTTP/FTP | northbound | Wave 6 | 全新绿地 |

这些能力按需在后续 Wave 作为独立 feature 做，不在本 feature 范围内。

## 九、给 cs-feat-design 的输入

- brainstorm 已锁定范围和决策方向
- 需要进入 cs-feat-design 产出：`{slug}-design.md` + `{slug}-checklist.yaml`
- design 阶段需解决的 3 个关键决策见第四节
- 实施按 checklist 逐项推进
- accept 阶段需验证真实 TCP/UDP 连通性
