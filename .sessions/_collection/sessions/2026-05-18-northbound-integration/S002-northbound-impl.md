# [S002] Northbound feature 实施

> 2026-05-25 | 实施 | 完成

## 目标

按 `codestable/features/rewrite-northbound/northbound-design.md`（approved）和 `northbound-checklist.yaml` 实施 northbound feature 全部 8 步。

## 记录

### 完成的工作

**Step 1: Platform HTTP facade**
- `shared/platform-bridge.ts`：新增 HttpBridge、HttpServerConfig、HttpClientConfig、HttpRequest、HttpResponse 类型
- `platform/http.ts`：HttpFacade 接口 + createHttpFacade 工厂（与 TransportFacade 同模式）
- `platform/index.ts`：新增 getHttpFacade() 懒加载 + resetHttpFacade()
- `main/http-handlers.ts`：Node 原生 http 模块实现 server/client IPC handlers
  - 入站请求通过 `http:incoming-request` IPC 事件转发给 renderer
  - renderer 处理后通过 `http:respond` IPC invoke 回传响应
  - 30s 超时兜底
- `preload/index.ts`：HttpBridge IPC 实现（请求 handler 注册 + 事件监听）
- `main/index.ts`：注册 registerHttpHandlers / cleanupHttpHandlers

**Step 2: Task service step callback**
- `task/services/task-service.ts`：CreateTaskServiceOptions 新增 `onStepResult?` 可选回调
- `task/services/task-iteration-loops.ts`：3 处 addStepResult 后调用 onStepResult，每处 try/catch 隔离
  - executeRepeatableSend 无 repeat 分支（line 162）
  - executeRepeatableSend repeat 循环（line 171）
  - executeSteps 普通分支（line 222）
- 现有 183 个 task 测试全部通过，无破坏

**Step 3: Northbound 名词层 + 编排骨架**
- `northbound/core/types.ts`：甲方接口类型定义（CustomerRequest union、SetTestTaskRequest、TestCaseInfo、TestCaseStep、ControlTestTaskRequest、HeartbeatRequest、GetSubSysStateRequest、TestCaseResultReport、MsgReport、StepInfo、CustomerResponse）
- `northbound/core/inbound-translator.ts`：translateTestCaseToTaskDefinition 纯函数
  - send step → createSendStep（frameId/targetId/fieldValues）
  - wait-condition step → createWaitConditionStep（conditions 映射为 ConditionTerm，缺 frameId 用空字符串占位）
- `northbound/core/outbound-translator.ts`：translateTaskResult + translateStepResult 纯函数
  - verdict 映射：passed→success, failed→fail, stopped→tbd
  - stepName 从 definitionRef.steps[stepIndex].name 取
- `northbound/state/northbound-state.ts`：testCaseId↔instanceId 双向 Map + session snapshot
- `northbound/index.ts`：public API 聚合

**Steps 4-7: 入站/出站/step 事件/简单 handler 接线**
- `northbound/services/northbound-service.ts`：主编排服务
  - handleRequest URL 路由：/setTestTask、/controlTestTask、/heartbeat、/getSubSysState
  - executionPlan 处理：parallel 层用 Promise.all，sequential 层逐个等 onSettled
  - 中途失败不回滚，已创建 task 继续运行
  - setTestTask 幂等（hasTestCase 检查）
  - controlTestTask: abort/stop→stopTask, pause→pauseTask, continue→resumeTask
  - handleStepResult: getInstance → translateStepResult → postToCustomer(/msgReport)
  - reportTaskResult: onSettled resolve → collectResult → translateTaskResult → postToCustomer(/testCaseResultReport)
  - 出站 POST 失败只记日志不重试
- `runtime/feature-wiring.ts`：
  - 新增 resultService（createResultState + createResultService）
  - 新增 northboundService（L5 层，依赖 task + result + httpFacade）
  - stepResultHolder 延迟绑定模式解决 task↔northbound 循环依赖
- RewriteWiredFeatures 接口新增 resultService + northboundService

**Step 8: 测试覆盖**
- 4 个测试文件，43 个测试全部通过
  - inbound-translator.spec.ts：10 tests
  - outbound-translator.spec.ts：12 tests
  - northbound-state.spec.ts：11 tests
  - northbound-service.spec.ts：10 tests

### 验证结果

- `pnpm build`：成功
- `pnpm lint`：我们的文件 0 errors
- `pnpm vitest run src/features/task/ src/features/northbound/ src/features/result/ src/runtime/`：267 pass, 0 fail

## 后续

### 跨 feature 遗留项

1. **task-service.ts linter 回退**：linter 把 `import type { TaskStepResult }` + 直接引用改回了 `import('../core').TaskStepResult`。这是项目 eslint 规则偏好，已接受，不是 bug。

2. **outbound-translator.ts 的 stepStartTime/stepEndTime**：当前输出空字符串。TaskStepResult 不含时间戳。需要 task feature 后续在 TaskStepResult 或 addStepResult 时记录时间戳，northbound 再对接。不阻塞 MVP。

3. **wait-condition 的 ConditionTerm 缺 frameId**：inbound-translator 中 ConditionTerm.frameId 用空字符串占位。甲方 WaitConditionDef 不含 frameId 概念。如果后续需要精确匹配 receive 帧，需要甲方补充 frameId 或在翻译时从上下文推断。不阻塞 MVP（wait-condition 匹配不依赖 frameId）。

4. **架构文档未更新**：design 第 4 节列了 4 份需要更新的文档（rewrite-target-structure.md、rewrite-feature-boundaries.md、rewrite-feature-interaction-matrix.md、rewrite-system-architecture.md）。这些应在 feature 验收后统一更新。

5. **HttpFacade 未写独立测试**：HTTP facade 的单元测试依赖 IPC mock，当前通过 northbound-service.spec.ts 间接覆盖了 mock HttpFacade 的行为。如需 Electron 环境外独立验证 HTTP server/client，需补集成测试。

### Checklist 对应

northbound-checklist.yaml 的 8 个 steps 和 14 个 checks 仍需逐条验收（cs-feat-accept 阶段）。
