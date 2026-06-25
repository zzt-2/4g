# [H011] 批次历史改内存派生重构完成 + 现象2(停的实例历史看不到)待查

> 2026-06-25 | 重构完成 handoff + 未决 bug 待查 | 接 S017/D018/9-Task 后续
> 严重度: 重构部分**已完成**;现象2 是**中等**(功能可见性 bug,非 blocker)
> 直接合同: 本 handoff、`docking-history-followup-investigation.md`、`specs/2026-06-25-docking-task-history-inmemory-refactor-design.md`、`plans/2026-06-25-docking-task-history-inmemory-refactor.md`、D004

## 本 handoff 的两个独立部分

1. **重构完成交接**(已做完,代码已提交,测试通过)——压缩后接续者只需知道"做了什么/在哪"。
2. **现象2 待查**(未解决,需新上下文重新定位)——压缩后接续的首要任务。

---

## 第一部分:批次历史改内存派生重构(已完成)

### 目标(一句话)

把中心对接批次面板(TaskListPanel)的数据源从「独立持久化 `docking-tasks.json`」改成「taskService 实例内存派生 + command-ingress 内存映射表 batchRegistry」,解决暂停态割裂 + 消除两套数据冗余。

### 为什么做(触发)

用户实测发现:批次面板有暂停按钮但 `PersistedTaskCase.status` 只有 4 态没 paused → 点暂停只调本地 pauseTask,批次记录不反映、没恢复按钮。根因是**两套数据(批次记录 vs taskService 实例)靠 4 接入点手工同步**,暂停是同步漏洞。用户进一步质疑「批次面板和执行监控为啥独立,它俩不是一个嘛」,确认跨重启历史不重要后定方向:**内存派生,不持久化**。

### 做了什么(5 Task,TDD,commit `8733576`..`fcdcdbe`)

| Task | commit | 内容 |
|---|---|---|
| 1 | `8733576` | 新建 `core/docking-batch-registry.ts`(内存 Map,insertBatch/setInstance/loadAll/clear,浅拷贝隔离) |
| 2 | `1dceec4` | `composables/use-docking-task-history.ts` 重写:数据源改 batchRegistry+taskService.getInstance 派生,case.status 从 lifecycle 实时算(含 paused),新增 resumeCase |
| 3 | `d0682f2` | `task-case-display.ts` 加 paused 态(warning/o_pause_circle) + `TaskCaseRow.vue` 恢复按钮(resume emit) |
| 4 | `4994ab9` | northbound 接入点1/2 改写 batchRegistry;接入点3/4 删(reportTaskResult/controlTestTask 不再写 registry,函数本身保留);feature-wiring 换 batchRegistry;rewriteRuntime 删 hydrateDockingTaskHistory;**删 docking-task-history-storage.ts 整文件 + 其 spec** |
| 5 | `fcdcdbe` | TaskListPanel 接 batchRegistry + resume + 全量回归 |

### 关键设计约束(不变量,接续者必须知道)

- **D004 保持**:task 内核(`TaskInstanceState`)**零改动**,不加 customerTaskId。批次归属信息在 command-ingress(batchRegistry),northbound 只拿引用做接入点1/2。
- **不持久化**:batchRegistry 纯内存,重启清空(用户确认跨重启历史无所谓)。
- **单一真相源**:case.status/进度/结果全部从 taskService 实例 lifecycle 派生,不再有两套数据同步。

### 数据流(重构后)

```
setTestTask → northbound handleSetTestTask → batchRegistry.insertBatch(建 meta,instanceId=null)
            → processLayers → createAndStartTask → taskService.createTask+startTask
                                              → batchRegistry.setInstance(回填 instanceId)
面板渲染(polling 1s): batchRegistry.loadAll() → 每批 cases → taskService.getInstance(instanceId)
                     → 派生 DockingCaseView(status/进度/duration 实时)→ TaskCaseRow
暂停/停止/恢复: TaskCaseRow emit → composable → taskService.pause/stop/resumeTask → 下次 polling 反映
```

### 测试状态(重要)

- **全量 1862 passed / 1873**(11 失败全是**预存环境抖动**,非本次引入):
  - `heartbeat-timer.spec.ts` ×5(fake-timer 抖动)
  - `tcp-receive-datapath.spec.ts` ×4(ECONNRESET)
  - `frame-service-state-selector.spec.ts` ×1
  - `event-truncation.spec.ts` ×1
  - 这 11 个在 D018 时 stash 到 clean HEAD 同样失败,基线稳定。
- **build**:TS+Vue 编译阶段全过;electron 打包 EBUSY 是预存(app.asar 被运行中的打包 app 锁),非代码。

### 待用户验证(GUI 手测,我无法静态做)

- 暂停 → 显示恢复按钮 → 点恢复 → 继续 running(零同步成本)
- controlTestTask pause/continue 中心下发时,批次面板反映 paused 态
- **现象2 是否随重构变化**(见第二部分)

### 相关文档(压缩后接续者读这些就够)

- spec: `rewrite/docs/superpowers/specs/2026-06-25-docking-task-history-inmemory-refactor-design.md`(已过 subagent 自检 + 复核 4/4 pass)
- plan: `rewrite/docs/superpowers/plans/2026-06-25-docking-task-history-inmemory-refactor.md`

---

## 第二部分:现象2 —— 停止甲方实例后历史记录看不到(未解决,首要待查)

### 用户原话(2026-06-25)

"我停止甲方发过来的实例后,历史记录里依然是没有"

(更早:"停止之后哪都看不见了,活动任务和历史记录都没有")

### 已确认的代码事实(不是猜的)

1. `stopTask`(task-service.ts:301-310)→ 实例 lifecycle 变 `stopped`(终态)。
2. `moveToHistory`/`removeInstance` 在**生产代码零调用**(grep 仅测试命中)——所以实例**应该**留在 instances。
3. 执行监控历史表 = `instances 中终态的 ∪ history`(TaskManagePage.vue refreshExecutionLists L184-188)。
4. → 按代码,stopped 实例**应该**出现在历史 tab。但用户说没有 → **我漏了什么,根因未定位**。

### 重构后的关键变化(影响排查)

重构改了**批次面板**的数据源,但**执行监控历史 tab 是另一条独立路径**(不经过 batchRegistry,直接读 taskService.snapshot.instances)。所以「停的实例看不到」分两种可能,取决于用户指哪个面板。

### 压缩后排查 checklist(新上下文执行,顺序很重要)

**第 0 步:回问用户(别跳过)** —— 用户说的「历史记录」是哪个面板?
- (a) 中心对接页**批次面板**(TaskListPanel)—— 走 batchRegistry 派生,stopped→case.status=failed(deriveCaseStatus)。重构后应能看到。
- (b) 任务管理**执行监控历史 tab**(HistoryTaskTable)—— 走 taskService.snapshot.instances。
- 还有:停的入口(controlTestTask / 执行监控停止按钮 / 批次面板停止按钮)?停后那条在 active tab 还在不在?

**第 1 步:查 removeTask 调用点(最可能的根因候选 A)**
- grep `\.removeTask\(` 全 src。`removeTask`(task-service.ts:327)会 `removeInstance` + `removeFromHistory`。若某处对 stopped 实例**自动**调 removeTask → 实例从 instances 消失、也不在 history → 两边都看不到。
- 特别查:有没有 onTaskSettled 订阅者在终态后清理实例。
- 查 northbound handleTaskSettled/reportTaskResult 链路有无误删实例(重构后接入点3 删了写 registry,但末尾 `state.removeMapping`/`removeTaskIdMapping` 是清 northbound 映射不是 task 实例,要确认没误删)。

**第 2 步:写复现测试**(systematic-debugging Phase 4)
- stopTask 后查 `taskService.getSnapshot().instances`,确认实例是否还在 + lifecycle=stopped。若不在 → 候选 A 坐实。

**第 3 步:DevTools 实测(D011 方法论)**
- 用户停一个用例后,console 查 taskService 状态,看实例到底去哪了。

### 根因候选(3 个,按可能性)

| 候选 | 内容 | 可能性 |
|---|---|---|
| A | 某处自动 removeTask 清掉了 stopped 实例 | 高(最能解释"两边都看不到") |
| B | controlTestTask 1:1 覆盖映射(northbound-state mapTaskId 一批多用例只记最后),stop 只命中一个 | 中(但用户说"停的看不到",不是"没停的") |
| C | 执行监控历史 tab 的 statusFilter/searchText 把 stopped 滤掉 | 低(要用户主动开筛选) |

### 不要做的事(给接续者的红线)

- **不要在没定位根因前改 stopTask/历史表逻辑**(systematic-debugging:先根因后修复)。
- **不要假设候选 A 一定对** —— 上次 barrier 我凭印象差点误判,是重读代码才证伪的。这条尤其重要。
- **不要碰 D004**(task 内核不带甲方字段)—— 本次重构刚确认保持。

---

## 第三部分:现象1(barrier)—— 已解决(仅供接续者了解背景)

- 用户报"2.5G LDPC/5G RS 没跑完,5G LDPC 就同时开了" → processLayers parallel:true 分支 `await Promise.all(createAndStartTask)` 只等创建不等终态,跨层 barrier 失效。
- 已修(commit `d65d9fd`,D018):改为并发启动收集 instanceId → `await Promise.all(onSettled)`,层内并发层间等终态。
- 用户 2026-06-25 确认"dag 对了" ✓。
- spec 红线已勘误(原写"barrier 正确勿改",代码证伪)。

---

## Git 状态

- 当前分支:`main`(延续 D018 直接提交模式,用户认可)
- **11 个 commit 未推送**(`d65d9fd`..`080cdac`):D018 修复 + spec/plan + 5 Task 重构 + 调查日志
- 推不推由用户定(压缩前或后都行)
- 工作区:`.sessions/2026-06-10-ui-feature-bugs/nul` 是 Windows 残留空文件(git add -A 会卡,需显式 add 文件);`public/display-groups-20260624-224109.json` 是 untracked 调试产物

## 接续者第一步

1. 读 `rewrite/docs/docking-history-followup-investigation.md`(完整调查日志,2026-06-25 续段是最新)
2. 读本 handoff 第二部分(checklist)
3. 回问用户第 0 步(哪个面板)
4. 按 checklist 查,根因定位后再改(不仓促)
