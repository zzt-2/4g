# 等待条件测试数据 — 手测指南 (S014)

本目录的两组 JSON 用于测试 task 模板的**等待条件**（wait-condition）：
- `wait-condition-test-frames.json` — 5 个帧：2 个 send（回环用）+ 3 个 receive（等待条件目标）
- `wait-condition-test-tasks.json` — 21 个任务模板，覆盖 9 种 operator + and/or + 3 种 onTimeout + 永久等待 + 中断 + sourceId + repeat.until + exitCondition

## 帧设计

### receive 帧（等待条件等这些）
| frameId | 字段 | 测什么 |
|---------|------|--------|
| `wt-status` | wt-power(uint16) / wt-raw-status(uint32,0x) / wt-status-text(枚举) / wt-optional-payload(可空) | eq/neq/gt/lt/gte/lte + 十六进制 threshold + contains + null 路径 |
| `wt-aux` | wt-aux-val(uint16) / wt-aux-flag(uint8) | frameId 隔离 + OR 跨帧组合 |
| `wt-counter` | wt-count(uint32) | change / any / sourceId 过滤 |

### send 帧（回环用，产生 receive 帧的字节）
| frameId | 镜像 | 同步字 |
|---------|------|--------|
| `wt-status-cmd` | wt-status | 0x1ACFFC1D |
| `wt-counter-cmd` | wt-counter | 0x3ACFFC1D |

send 帧的字段布局/类型/字节序/同步字与对应 receive 帧完全一致，**echo 回来的字节会被 receive 侧按同步字识别成对应的 receive 帧**，从而触发等待条件。改 send 帧的字段值即可构造不同的匹配输入。

## 为什么需要 echo server（重要）

应用**没有内置「发送帧回环到接收」的机制**。`receiveEventSourceBridge.emit`（"收到一帧"的唯一事件源）在生产代码里只有真实 TCP/串口接收路径会调，**没有 UI 入口能手动注入一帧**。所以单机要手测等待条件，必须让发送的字节真的"回到"接收管线——最简单的办法是起一个**本地 TCP echo server**。

## 手测步骤

### 1. 导入数据
- 帧定义页 → 导入 `wait-condition-test-frames.json`
- 任务模板页 → 导入 `wait-condition-test-tasks.json`

### 2. 起一个本地 echo server
任选一种：
- **Python**：`python -c "import socket; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1); s.bind(('127.0.0.1',9001)); s.listen(1); c,_=s.accept(); [c.sendall(d) for _ in iter(lambda: c.recv(4096), b'')]" 2>/dev/null &` （简陋但够用；更稳的见下方 Node 版）
- **Node**（参考 `rewrite/src/__tests__/integration/helpers/node-net-transport-facade.ts` 的 `startEchoServer`）：收啥原样发回的 TCP server，监听 `127.0.0.1:9001`。

### 3. 应用里连接
- 连接管理 → 新建 TCP client → host `127.0.0.1` port `9001` → 连接

### 4. 跑任务 + 发帧触发
- 任务模板页 → 选一个等待条件任务（如 `wt-eq` 等"功率==100"）→ 创建实例 → 启动
- 发送帧页 → 选 `wt-status-cmd` → 把 wt-power 设成 100 → 发送
- echo server 把字节打回 → receive 解析成 `wt-status`（wt-power=100）→ 等待条件满足 → 任务推进

### 5. 各用例怎么触发
| 任务 | 怎么让它满足 |
|------|------------|
| `wt-eq`（功率==100） | 发 wt-status-cmd，wt-power=100 |
| `wt-gt-lt`（>50 然后 <50） | 先发 wt-power=51（过 gt），再发 wt-power=49（过 lt）|
| `wt-hex-threshold`（状态字==0x0001） | 发 wt-status-cmd，wt-raw-status=0x00000001 |
| `wt-contains`（状态串含 OK） | 发 wt-status-cmd，wt-status-text=1(=OK) |
| `wt-and-group`（功率==100 AND 状态字==1） | 发 wt-status-cmd，wt-power=100 且 wt-raw-status=1 |
| `wt-or-group`（功率==100 OR 辅助标志==1） | 发 wt-status-cmd(wt-power=100) **或** 发 wt-aux 镜像帧(注意 wt-aux 无 send 镜像，可用真实硬件或跳过) |
| `wt-frame-id-isolation`（等 wt-status 来 wt-aux 不匹配） | 发 wt-aux 的字节（同步字 0x2ACFFC1D）→ 不该匹配，1s 后超时 skip |
| `wt-timeout-continue/skip/fail` | 启动后**不发帧**，等 500ms 超时 |
| `wt-forever-wait` | 启动后不发帧 → 一直等；发匹配帧才过；或手动 stop |
| `wt-interrupt-stop` | 启动后立即手动 stop → 验证中断 |
| `wt-source-filter`（sourceId 过滤） | 需要能控制帧的 sourceId，echo 回环的 sourceId 取决于连接，可能需真实硬件 |
| `wt-repeat-until`（收到 wt-count==3 退出） | 启动后发 wt-counter-cmd(wt-count=3) → repeat.until 命中提前退出（**S014 已修 fieldValueProvider 接线，生效**）|
| `wt-exit-condition`（收到 wt-count>=5 任务退出） | 启动后发 wt-counter-cmd(wt-count>=5) → exitCondition 命中任务整体退出（**S014 已修，生效**）|

## 注意
- `wt-aux` 没有 send 镜像帧（它的 OR 组合测试可用真实硬件，或在集成测试 `wait-condition-coverage.spec.ts` 里直接 emit 模拟）。
- `sourceId` 过滤（`wt-source-filter`）：echo 回环的 sourceId 由连接层决定，未必可控；最可靠的验证在集成测试里（直接 emit 带 sourceId 的帧）。
- 本沙箱无硬件时，**集成测试 `wait-condition-coverage.spec.ts`（31 用例全过）已用 `FakeReceiveEventSource.emit()` 跑真实执行路径验证了全部行为**，等价于"手动构造接收帧"。本指南的 echo 回环是真实硬件场景的手测补充。

## 已知行为（S014 实测确认，非 bug）
- `onTimeout=fail` + `errorPolicy:stop` → 终态 **failed**（S014 已改，原为 stopped 反直觉）
- 手动 `stopTask` → 终态 **stopped**（与错误失败区分）
- 被中断的 wait step 不记 step result（设计如此）
- push 模型：帧在任务启动后到达才会被等到的 wait step 处理（任务启动时 group 已注册，所以启动后发帧不会丢）
