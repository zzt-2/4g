# [S010] 任务参数递增与重复机制语义讨论

> 2026-06-11 | 讨论阶段 | 状态: 进行中
> 来源: S009 s1-s4 完成后用户实测发现 step.repeat / fieldVariations 行为不符合预期

## 目标

澄清 task feature 中 `step.repeat` 和 `fieldVariations` 的当前语义、bug、用户预期落差，为"参数递增 / 扫频 / 轮次循环"机制确定下一阶段设计方向。本轮只讨论、不实施。

## 记录

### 用户发现的现象（原话归纳）

1. "每个步骤里的重复次数，是不是没算到总进度次数里？"
2. "步骤的重复，表达式是不是没有叠加？如速度步进，我设了一个值后，它并没有随着发送增加"
3. "高级设置里的最大迭代次数也是？都不会让表达式计算自递增，也没算到总进度？"
4. 想要的可变字段支持两种 mode：**单步循环**（值列表长度决定重复次数，每次重复取一个值）+ **轮次循环**（每一轮换一次参数）
5. 进一步问："如果想让它在整个任务内，同一个帧被来回更改（任务期间实例内部参数是连续的），这样是不是很麻烦？"

### 一轮主线程代码核查结论（带证据）

| 现象 | 证据 | 结论 |
|---|---|---|
| step.repeat 没算进 stepsTotal | `core/progress.ts:7` `stepsPerIteration = steps.length`；`progress.ts:14-22` 按 stepResults 计数（每次 repeat 都 addStepResult） | 分子超分母，进度爆表 |
| step.repeat 内字段值/表达式不变 | `task-iteration-loops.ts:166-186` executeRepeatableSend 每次循环传同一 iteration；`task-step-executors.ts:27-34` buildSendRequest：userFieldValues 只按 iteration 取、variables 直接透传 | by design — repeat 是"同值重发"，递增不是它的活 |
| fieldVariations 是 task 级 iteration-indexed | `task-iteration-loops.ts:132-146` resolveFieldValues：`variation.values[iteration]`；`types.ts:259-269` 有 fieldVariations 时 maxIterations = max(values.length)，**静默覆盖 stopCondition.maxIterations** | 跨 step 副作用大、UI 难用 |
| 表达式引擎纯读 | `shared/expression/_internal.ts:22` BinaryOp 无 `=`/`+=`；VariableMap 是 ReadonlyMap；TaskInstanceState 无 mutable 字段 | 当前架构不支持"实例级连续累积" |

### 三 agent 并行调研（用户明确要求"多派一些子agent全面看看"）

#### Agent 1 — 旧系统参考（`/mnt/d/code/frontend/dongfanghong/src`）

- 旧系统**就有 fieldVariations**，结构和 rewrite 几乎一致：`{ fieldId, values: (string|number)[] }`
  - 位置：`src/stores/frames/sendTasksStore.ts:35-38`
  - 执行：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:80-101`（按 repeatCount 轮次取值）
  - UI：`src/components/frames/FrameSend/EnhancedSequentialSend/InstanceSequenceTable.vue:41-88`（字段选择 + 逗号分隔值 + .txt 文件加载）
- SCOE 扩展支持从文件读取值列表：`src/composables/scoe/commands/readFileAndSend.ts:45-115`
- **旧系统是离散查找表模式**，不是连续计算
- **旧系统也不支持**：单 step 内按发送次数递增；跨 step 跨 iteration 连续累积

→ 用户想要的"单 step 内递增"和"实例内连续累积"都是 rewrite 才会冒出来的新需求，没有旧系统参考可循。

#### Agent 2 — 表达式引擎 + send 链路能力

- 表达式引擎：算术 / 比较 / 逻辑 / 17 个数学函数，**纯读**
- 变量流转：`SendVariableProvider.getVariables()` + `SendRequest.variables` 合并 → `frame-resolver.ts:38-133` resolveFieldValues → `:210-249` evaluateFieldExpressions
- `SendPage.vue:231-244` 有**手动 writeback**（用户改 SendFrameInstance.userFieldValues）— task 链路没有
- `TaskEventHandlers.onStepResult` 是通知机制，订阅者**无法修改 instance state**

**缺口清单（要实现"实例级 mutable 变量 + send 后回写"）**：
1. `TaskInstanceState` 加 `mutableVariables: Map<string, VariableValue>`
2. `SendStepConfig` 加 `variableUpdates?: Readonly<Record<string, string>>`（如 `"velocity": "velocity + 10"`）
3. 表达式引擎加赋值算子或新机制（不能在纯函数 evaluate 里直接做，需要状态读写分离）
4. `task-step-executors.ts` executeSendStep 完成后解析 variableUpdates、计算新值、回写 instance
5. `buildSendRequest` 合并 mutableVariables 至 request.variables

工作量评估：大（types + 表达式扩展 + executor + UI）。

#### Agent 3 — task 全链路 + frame asset 就绪度

- 4 个 bug 全部确认（进度超分 / 字段不递增 / UI 无下拉 / 类型丢失）
- **`FrameAssetService.listFieldReferences(query)` 已就绪**（`frame-asset-service.ts:104-106`），UI 字段下拉零障碍
- 扩展建议：`StepRepeat.mode: 'iteration' | 'step'` + `FieldVariation.mode` 分支取值

### 三层需求归口（用户拍板依据）

| 层次 | 当前 | 旧系统 | 工作量 | 用户场景 |
|---|---|---|---|---|
| 单步循环（值列表长度 = repeat 次数，每次取下一个）| ❌ | ❌ | 中 | velocity 步进单 step 重发 |
| 轮次循环（每 iteration 换值）| ✓ fieldVariations | ✓ fieldVariations | UI 难用 | 多轮测试，每轮不同参数 |
| 实例内连续累积（`+10` 自增公式）| ❌ | ❌ | 大 | 用户最后问的"任务期间连续" |

### 推荐方向（主线程判断，等用户拍板）

**推荐**：先做"mode 统一 + UI 修复 + 进度 bug"，**砍掉连续累积**直到业务真出现。

理由：
- 旧系统都不支持连续累积，业务可能从没用过
- 离散值列表（单步循环 / 轮次循环）能覆盖绝大部分步进场景
- 实例级 mutable 变量是另一层抽象（表达式赋值 + 状态读写分离），混进 mode 统一会把范围爆掉

### 待用户拍板（轮到下一轮对话的输入）

1. **业务真实场景确认**："连续累积"真实存在吗？还是离散值列表足够？
2. **若离散列表足够**：mode 统一（单步循环 / 轮次循环）+ UI 字段下拉 + 类型保留 + 进度 bug 修复 — 一波收尾
3. **若连续累积真需要**：单独开专题做实例变量空间，不与 mode 整合

### 顺手修的打包 crash（讨论中途用户报）

错误堆栈：`Cannot read properties of undefined (reading 'label') at TaskManagePage + QForm`，本地 dev 不复现，打包后改步骤名必现。

根因：`ExecutionListPage.vue:309` 和 `TemplateListPage.vue:197` 的 `onStepNameUpdate`：
```ts
const step = editor.steps[si];   // ← editor.steps 是 Ref，漏 .value，[si] = undefined
editor.updateStep(si, { ...step, name });  // ← spread undefined → step 只剩 { name }，kind/id/config 全丢
```

渲染时 `step.kind = undefined` → `STEP_KIND_LABELS[undefined].label` → crash。dev 没报可能只是用户在 dev 没用过此功能（或 Vue warn 不 throw）。

同时发现 `hasPreviousSendStep` 也漏 `.value`（optional chaining 所以不 crash 但永远返回 false，"复制上一步字段值"按钮永远不显示）。

修复 4 处（2 crash + 2 silent bug）：
- `ExecutionListPage.vue` `onStepNameUpdate` + `hasPreviousSendStep`
- `TemplateListPage.vue` `onStepNameUpdate` + `hasPreviousSendStep`

全部改为 `editor.steps.value[...]`，并在 onStepNameUpdate 加 null check 兜底。

## 后续

等用户对三层需求拍板：
- 是否砍掉连续累积？
- mode 统一的形状（`StepRepeat.mode` vs 新顶层 abstraction）？
- 这一轮要不要进入 design 阶段？

拍板前不实施。S010 仍是讨论记录。
