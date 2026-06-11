# [S015] 集成测试阶段

> 2026-05-19 | 阶段 | 状态: active
> H002 handoff 执行完成，集成测试范围待定

## 目标

为 rewrite 系统建立集成测试体系，覆盖从 TCP 环路到各 feature 端到端链路。

## 记录

### 2026-05-19 H002 执行 + 集测起点

**H002 handoff 已完成的工作（硬阻断 3 项 + 次要 2 项）：**

| # | 问题 | 修复 | 文件 |
|---|------|------|------|
| 1 | bootstrap 不创建 network adapter | 同时创建 serial + network，composite 组合 | `rewriteRuntime.ts` |
| 2 | wireFeatures 只接受单个 adapter | 新建 `composite-adapter.ts`，按 config.kind 路由 | `composite-adapter.ts` |
| 3 | createRealNetworkAdapter 未导出 | adapters/index.ts + connection/index.ts 补导出 | `index.ts` x2 |
| 4 | fanOutToStorage 未调用 | routing-tick 加调用，wiring 加 storageService | `routing-tick.ts`, `feature-wiring.ts` |
| 5 | ConnectionService 按 config.kind 路由 | 由 composite adapter 在 adapter 层解决 | `composite-adapter.ts` |

Build + lint 均通过。

**集测范围待确定：**

已知需要覆盖的维度（粗略）：

1. **TCP 环路**：send 发帧 → TCP write → TCP server 收 → routingTick → receive 匹配 → display/storage
2. **UDP 环路**：类似 TCP 但用 UDP
3. **多连接并发**：同时存在 serial + TCP 连接，composite adapter 正确分发
4. **connection 生命周期**：创建 → 连接 → 收发 → 断开 → 重连
5. **receive 解析链路**：字节流 → 帧匹配 → 字段解析 → 表达式求值
6. **send 构帧链路**：帧定义 → 构造字节 → 目标路由 → transport write
7. **task 执行链路**：任务创建 → step 执行 → send → wait-condition → 完成
8. **command-ingress 链路**：外部命令 → 解析 → 任务触发
9. **持久化**：启动加载 → 运行时修改 → 保存 → 重启恢复
10. **旧 JSON 迁移**：旧帧定义导入 → 新模型兼容

具体哪些必须写、哪些可以 manual checklist、优先级排序——待主对话组织多个子对话确定。

## 后续

- 等主对话确定集测范围清单后，按清单逐项创建测试
- 每完成一批测试追加到本文记录
