# Handoff: 速度模拟帧自引用累加不生效

> 来源: H002 修复对话 | 交接目标: 排查速度模拟帧发送后速度不变的实际运行时问题
> 文件名: H003-speed-simulation-debug.md

## 已完成边界

### H002 全部 5 项修复已提交代码

1. **Fix 1 — FieldEditWidget 预览值**：新增 `previewValues` prop，SendPage 计算 `editPreviewValues` 传入，`getDisplayValue` 用 preview fallback
2. **Fix 2 — 拓扑排序**：`resolveFieldValues` 重构为两阶段（非表达式先求值 + 表达式拓扑排序），复用 shared `kahnSort`
3. **Fix 3 — 表达式回写**：`SendResult.resolvedFieldValues` 新字段，`sendService.execute` 所有路径传递，`onSend` 成功后回写表达式字段值到 `instance.userFieldValues`
4. **Fix 4 — 整数截断 warning**：`INTEGER_RANGES` 常量 + `buildFrame` 范围校验
5. **Fix 5 — Hex 预览**：已确认现有代码已实现

### 自引用 seed 修复（第二轮）

- `resolveFieldValues` Phase 2 增加 `isSelfReferencing()` 检测
- 自引用字段无 `userFieldValues` 历史值时自动 seed 0 或 defaultValue
- 理论上解决了首次发送 chicken-and-egg 问题

### 测试覆盖

- 117 send tests 全绿
- 新增：拓扑排序 3 + 循环检测 2 + 自引用 2 + 整数范围 10 + kahnSort 8

## 不要做什么

- **不改变 factor 方向**：`raw = physical / factor`，实现正确
- **不在 core 层引入 Vue/Pinia 依赖**
- **不假设帧数据格式**：实际速度模拟帧的 expressionConfig 可能和测试中的不同
- **不跳过前端规范检查**

## 必读

1. `rewrite/src/features/send/core/frame-resolver.ts` — 当前 resolveFieldValues 两阶段实现 + isSelfReferencing + topologicalSortExpressions
2. `rewrite/src/pages/SendPage.vue` — onSend 函数（回写逻辑在 ~L225-250）
3. `rewrite/src/features/send/composables/use-send-instances.ts` — updateInstance / incrementSendCount
4. `rewrite/src/features/send/services/send-service.ts` — execute 中 resolvedValues 传递

## 核心未解问题

**用户反馈：速度模拟帧设步进=1，每次发送后速度不变。**

代码层面已验证的路径（单测通过）：
- resolveFieldValues 自引用 seed + 拓扑排序 + 回写逻辑在单元测试中工作正常
- send-frame-resolver.spec.ts 的 "accumulates value using previous result" 和 "seeds 0 and evaluates correctly" 两个测试都通过

但实际运行时仍不生效，可能原因（需要下轮验证）：

1. **帧数据配置不匹配**：实际速度模拟帧的 expressionConfig.variables 可能用的不是 `sourceType: 'current_field'` + `sourceId: 自身fieldId`，而是其他 sourceType。需要在运行时打印帧数据确认。
2. **sendService 的 variableProvider**：runtime 创建 sendService 时注入的 variableProvider 可能和测试不同。如果帧变量用的是 `global_stat` 而不是 `current_field`，则不走 Phase 2 seed 路径。
3. **UI 回写时机**：`onSend` 中 `inst` 在 `await sendService.execute` 之前捕获。`incrementSendCount` 后再 `updateInstance`，两次 shallowRef 替换可能导致竞态。需要确认 `inst.userFieldValues` 在 updateInstance 时是否仍指向正确数据。
4. **表达式变量名不匹配**：表达式中用中文名如 `速度 + 步进`，变量映射 `{ identifier: '速度', sourceId: 'speed' }`。如果 `resolveExpressionVariables` 查找 `fieldValues.get('speed')` 但 mergedVars 中 key 是其他值，则映射失败。
5. **回写后的持久化**：`updateInstance` 更新了内存，但 `saveSendInstances()` 可能没被调用或持久化失败，下次加载时丢失。

## 排查方向

### 最优先：确认实际帧数据

在浏览器 DevTools 或 main process 日志中，打印速度模拟帧的完整字段定义，特别关注：
- speed 字段的 `expressionConfig`（expressions + variables 数组）
- variables 中每个变量的 `sourceType` 和 `sourceId`
- step 字段是否 configurable

### 次优先：加临时 console.log 追踪

在 `onSend` 成功分支中加：
```typescript
console.log('[onSend] resolvedFieldValues:', result.resolvedFieldValues);
console.log('[onSend] writeback:', writeback);
console.log('[onSend] inst.userFieldValues before update:', inst.userFieldValues);
```

在 `resolveFieldValues` Phase 2 中加：
```typescript
console.log('[resolveFieldValues] Phase 2 seeding:', field.id, 'selfRef:', isSelfReferencing(field), 'inUserValues:', field.id in userFieldValues);
```

### 验证方法

- 打开速度模拟帧，步进设为 1
- 第一次发送：检查 console.log 输出 resolvedFieldValues 是否包含 speed 字段
- 第二次发送：检查 userFieldValues 是否包含上次回写的值
- 第三次发送：确认累加是否生效
