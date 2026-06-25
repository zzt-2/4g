# 中心对接任务批次历史面板 — 上线后现象复查

> 状态: **已完成代码证据复查（2026-06-25, fresh context）**。结论基于代码 + git blame，
> 不依赖压缩前的仓促推断。见文末「证据链」。

## 背景

9-Task 实施计划已全部完成并推送（HEAD `568727f` = origin/main，82 新测试通过）。
用户在 dev 实测后报了两个现象。压缩前我做过仓促推断，**用户明确要求压缩后用新上下文重读代码核实**。

---

## 现象 1：跨层 barrier「同时启动」

### 用户原话
> "2.5G LDPC 和 5G RS 都没跑完，它们和 5G LDPC 是同时开的，这不太对劲"
> "parallel:true 感觉意思理解错了。应该是这一 layer 里的要一起开? 而不是这 layer 和下一 layer 一起开"

### 代码证据（`northbound-service.ts` `processLayers` 399-440）

```ts
for (const layer of layers) {
  if (layer.parallel) {
    const tasks = [];
    for (const node of layer.nodes) {
      // ...
      tasks.push(createAndStartTask(tc, customerTaskId));   // (A)
    }
    await Promise.all(tasks);                                // (B)
  } else {
    for (const node of layer.nodes) {
      const { instanceId } = await createAndStartTask(tc, customerTaskId);
      await options.taskService.onSettled(instanceId);      // (C)
    }
  }
}
```

#### 关键事实 1：`(B) await Promise.all(tasks)` 只等「创建+启动」，不等「终态」

`createAndStartTask`（442-476）返回值是 `{ instanceId }`，内部:
```ts
const instance = options.taskService.createTask(def);   // 同步建实例
state.mapTestCase(...);
options.taskService.updateCase(...);                     // 回填
options.taskService.startTask(instance.instanceId);     // fire-and-forget 起执行循环
return { instanceId: instance.instanceId };             // ← 立刻 resolve
```

`startTask`（task-service.ts 270-280）是 fire-and-forget：`runExecutionLoop(...)` 不 await。
所以 `(A)` 这个 promise 在「实例创建 + startTask 调用返回」时就 resolve 了，**与该用例是否跑完无关**。

→ `(B) Promise.all(tasks)` resolve 的时刻 = layer 内所有用例「都已开始」，
**不是「都已结束」**。于是外层 `for (const layer of layers)` 立刻进入下一个 layer，
下一 layer 的用例在上一 layer 还在跑时就被 `createAndStartTask` 启动。

#### 关键事实 2：`parallel:false` 分支是对的（对照系）

`(C) await options.taskService.onSettled(instanceId)` 真正等到终态
（`onSettled` 注册 settleResolvers，在 `completeTask/failTask/stopTask` 里 `resolveSettle` 才 resolve，
见 task-lifecycle-manager.ts 39-45 / 70-80）。所以顺序分支的层内用例会「一个跑完再跑下一个」。

但注意：(C) 只保证**层内**串行，**层间**也没有显式 barrier —— 只是恰巧层内最后一个 settle 后
就进下一层，等价于层间串行。真正缺 barrier 的是 `parallel:true` 分支。

### 根因结论（代码层面已确认，非推断）

**`parallel:true` 分支用「等创建完成」冒充「等执行完成」**。`Promise.all` 应该等的是
「该 layer 所有用例到达终态」，而不是「该 layer 所有用例都 startTask 过了」。
表现：`parallel:true` 的层在下一层启动时，本层用例可能仍在 `running`。

这与 spec 红线「processLayers barrier 正确，不要动」**冲突** —— 代码实际有 bug，spec 的前提错了。

### git blame（不是我引入的）

| 行 | 提交 | 日期 | 内容 |
|----|------|------|------|
| 419-420 | `1f8b90d5` | 2026-05-25 | `for(layers)` / `if(layer.parallel)` 框架 |
| 421-428 | `4cfaf38f` | 2026-06-11 | `parallel:true` 分支（`Promise.all` 错误等法） |
| 429-437 | `4cfaf38f` | 2026-06-11 | `parallel:false` 分支（正确 `onSettled`） |
| 424-426, 432-433, 435 | `e2a25f32`（我，06-18） | 仅 `resolveNode` + `hasTestCase` 去重重构，**没碰 barrier 语义** |

→ barrier bug 在 9-Task 之前就存在。9-Task 没有加剧它。

### 修复方向（待授权）

最小修复：`parallel:true` 分支也应等终态。两种写法（择一，需讨论）：
1. **收集 instanceId 后逐个 `onSettled`**：
   ```ts
   const started: string[] = [];
   for (const node of layer.nodes) {
     const tc = resolveNode(node);
     if (!tc || state.hasTestCase(tc.testCaseId)) continue;
     const { instanceId } = await createAndStartTask(tc, customerTaskId);
     started.push(instanceId);
   }
   await Promise.all(started.map(id => options.taskService.onSettled(id)));
   ```
   语义：「层内并发启动，但层间等本层全部终态」。符合用户对 parallel 的澄清（层内一起开、层间隔离）。
2. **直接对 createAndStartTask 内部 await 终态**：改动面更大，不推荐。

> ⚠️ spec 红线冲突：spec「不要动 processLayers barrier」的前提（barrier 正确）已被代码证伪。
> 修复需用户明确授权 + 同步修正 spec。

---

## 现象 2：任务管理-执行监控「历史记录」里看不到停掉的用例

### 用户原话
> "我说停的一个用例的。我说的历史记录是任务管理-执行监控那边的历史记录。"

### 代码证据

#### 历史视图来源（TaskManagePage.vue 184-188）
```ts
const terminated = snapshot.instances.filter((i) => isTerminal(i.lifecycle));
const historyIds = new Set(snapshot.history.map((i) => i.instanceId));
const merged = [...snapshot.history, ...terminated.filter((i) => !historyIds.has(i.instanceId))];
historyRows.value = filteredHistory.map(toHistoryRow);
```

历史表 = `snapshot.history`（已归档）∪ `snapshot.instances` 里终态未归档的。
**关键：只要实例还在 `instances`（没被 moveToHistory），终态后也能进历史表。**
所以「stopped 进不进历史」不取决于 moveToHistory，取决于 stop 后 lifecycle 是不是 `stopped`（终态）。

#### stopTask 是否把实例标成 `stopped`？（task-service.ts 301-310）
```ts
stopTask(instanceId) {
  const inst = state.getInstance(instanceId);
  if (!inst) return;
  if (inst.lifecycle !== 'running' && inst.lifecycle !== 'paused') return;  // ← 守卫
  lifecycle.updateLifecycle(instanceId, 'stop');
  ...
}
```
`transition(lifecycle,'stop')` 在 running/paused → stopped。所以正常 stop 会变 `stopped`（终态），

#### 真正的疑点：接入点4 的 `stopTask` 是否真的在执行？

`handleControlTestTask`（478-523）里 stop/abort 分支调 `options.taskService.stopTask(instanceId)`，
**但 `instanceId` 来自 `state.getInstanceIdByCustomerTaskId(taskId)`**（487）。
一个 customerTaskId (T_xxx) 对应**整批**，不是单个用例 —— 但 mapping 是 instanceId↔customerTaskId，
一批多个用例 = 多个 instanceId 都 map 到同一个 customerTaskId。

`getInstanceIdByCustomerTaskId` 返回的是**哪个** instanceId？需要看 northbound-state 的实现。
如果它只返回「最后 map 进去的那个」，或「任一一个」，那么中心 stop 一个 taskId 时，**只停了批里的一个用例**，
其余用例继续 running → 不进历史（因为非终态）。这就能解释「停的那个用例不在历史里」可能是因为：
- 停的其实是批里某用例，但它停后没出现在历史表 —— 但按上面分析终态应进历史表，所以…

#### 代码确认：controlTestTask 的 taskId→instanceId 映射是 1:1 覆盖（bug）

`northbound-state.ts:54-65`：
```ts
mapTaskId(instanceId, customerTaskId) {
  instanceToCustomerTaskId.set(instanceId, customerTaskId);
  customerTaskIdToInstance.set(customerTaskId, instanceId);   // ← 同一 customerTaskId 后者覆盖前者
}
getInstanceIdByCustomerTaskId(customerTaskId) {
  return customerTaskIdToInstance.get(customerTaskId);        // ← 只能拿到「最后一个」instanceId
}
```

一个批次 T_xxx 有 N 个用例 → `createAndStartTask` 被调 N 次 → `mapTaskId` 被调 N 次，
`customerTaskIdToInstance['T_xxx']` 被覆盖 N 次，**最终只保留最后一个 instanceId**。

后果：中心下 `controlTestTask { taskId: 'T_xxx', action: 'stop' }` 时，`handleControlTestTask` 只能取到最后一个 instanceId，
**只停批里那一个用例**，其余 N-1 个用例继续 running，不进历史（非终态）。这正解释了用户「停的那个用例（其实是那批）的状态不对」。

#### 但还有一种可能：用户「停」的入口不是 controlTestTask

如果用户是在**任务管理-执行监控页**点某行的停止按钮（前端直接 stopTask(instanceId)），那停的实例会变 `stopped`（终态），
1 秒内 polling 把它算进历史表。这种情况代码层面正常，看不到只能是刷新时机。

### 根因结论（代码层面，已确认一条实 bug）

- **确认的 bug**：controlTestTask 的 customerTaskId→instanceId 是 1:1 覆盖映射，批次内多用例时 stop 只命中最后一个。
  这是**既有代码**（`mapTaskId` 设计如此），9-Task 没改它；但 9-Task 的接入点4 在 stop 分支只处理单个 instanceId，
  暴露/放大了这个限制。
- **未确认的疑点**：用户停用例的入口是 controlTestTask 还是执行监控页停止按钮。需要回问。
- `moveToHistory` 在生产代码里零调用（grep 仅测试命中），所以实例始终留在 `instances`，终态后必进历史表 ——
  **没有任何规则让 `stopped` 系统性地进不了历史**。

---

## 证据链（复查用）

- `northbound-service.ts:399-440` processLayers 全文
- `northbound-service.ts:442-476` createAndStartTask（return 早于终态）
- `northbound-service.ts:478-523` handleControlTestTask（接入点4，stop 只处理单 instanceId）
- `northbound-state.ts:54-65` mapTaskId / getInstanceIdByCustomerTaskId（1:1 覆盖映射 bug）
- `task-service.ts:270-280` startTask fire-and-forget runExecutionLoop
- `task-service.ts:361-373` onSettled 注册 settleResolvers
- `task-lifecycle-manager.ts:39-45,70-80` resolveSettle 在终态触发
- `task-service.ts:301-310` stopTask → transition stopped
- `task-state.ts:244-250` moveToHistory（仅测试调用）
- `TaskManagePage.vue:184-188` 历史表 = history ∪ instances 中终态
- git blame northbound-service.ts L419-440（barrier bug 非 9-Task 引入）

## 下一步（等用户）

1. 现象 1 是否授权修 processLayers `parallel:true` 分支（用方向 1，最小改动 + 同步改 spec 红线注记）。
2. 现象 2：controlTestTask 的 1:1 覆盖映射 bug 是否一并修（改成 1:N：customerTaskId → instanceId[]，stop 时遍历）。
3. 现象 2 请用户补充：停用例的入口、停后是否刷新、停的那条是否在 active 表里还在跑。
