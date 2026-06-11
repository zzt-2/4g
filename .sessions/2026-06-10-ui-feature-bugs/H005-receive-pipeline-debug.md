# Handoff: 接收管线调试

> 来源: S001 全局指挥对话 | 交接目标: 接收管线问题修复 + 帧列表改进讨论
> 文件名: H005-receive-pipeline-debug.md

## 已完成边界

### 1. 接收错误计数根因定位

**现象**：所有接收帧都报 config-error，错误计数持续增加。

**根因**：`receiveService.refreshFrameReferences()` 在运行时从未被调用。

- `wireFeatures()` 创建 receiveService 但不刷新帧引用
- `initPersistenceAsync()` 加载帧到 frameService 后不刷新 receive 引用
- `FrameListPage.vue` 帧 CRUD 后不刷新
- `use-frame-editor.ts` 帧保存后不刷新
- 测试文件全部手动调了 `refreshFrameReferences()`，所以测试全通过

**结果**：receiveService 内部 `reference.frames` 始终为空，所有数据走到 `matchReceiveFrame` → `receiveFrames.length === 0` → `config-error`（code: `receive.frame.none`）。

### 2. 修复已应用

| 文件 | 改动 |
|------|------|
| `rewriteRuntime.ts:94` | 帧从持久化加载后调 `refreshFrameReferences()` |
| `FrameListPage.vue` | 新增 `onFrameMutation()` 统一刷新 receive 引用 + saveFrames |
| `use-frame-editor.ts:87` | 帧保存后调 `refreshFrameReferences()` |

### 3. 调试日志已加（临时）

以下文件有 `[RX-PROC]` / `[RX-SVC]` / `[ROUTE-TICK]` 日志，待问题确认后清理：
- `rewrite/src/features/receive/core/processor.ts` — 3 处
- `rewrite/src/features/receive/services/receive-service.ts` — 2 处
- `rewrite/src/runtime/routing-tick.ts` — 2 处

### 4. 其他发现（未修）

- **字节序问题**：R-FPGA-003 等帧定义 `options.bigEndian: false`，但硬件实际发送大端数据。多字节字段（uint32/int32/uint16）解析值错误。单字节字段不受影响。需要确认所有帧的实际字节序。
- **0x1ACF8002 无 receive 帧定义**："通信控制帧 (副本)" 是 send 帧，其 header `0x1ACF8002` 没有 receive 帧匹配。收到响应后会被 unmatched（但不增加错误计数）。
- **expressionCache 未传入**：`processReceiveBatch` 调用时没传 `expressionCache`，所有表达式字段（如 R-FPGA-003 的"编码方式"）跳过求值。

## 不要做什么

- 不要删除调试日志，等确认修复生效后再清
- 不要改帧定义的字节序配置——需要用户确认硬件实际字节序
- 不要为 send 帧创建 receive 帧定义——需要用户确认业务需求

## 必读

1. `rewrite/src/runtime/routing-tick.ts` — 数据从连接层到 receive 的完整路径
2. `rewrite/src/features/receive/services/receive-service.ts` — receive service 帧引用生命周期
3. `rewrite/src/app/rewriteRuntime.ts` — 应用启动和持久化加载流程

## 下一轮

- 确认 `refreshFrameReferences` 修复生效（日志中 `refFrames > 0`）
- 讨论帧列表存在的问题（用户提到"不少不好的地方，和初始预期存在不少偏差"）
- 确认硬件字节序 → 修正帧定义
- 清理调试日志
