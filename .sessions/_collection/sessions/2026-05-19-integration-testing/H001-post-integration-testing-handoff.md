# Handoff: 集成测试完成 → 线 1 Bug 修复 + 线 2 Rewrite 主线推进

> 来源: S006 对话 6-13 | 交接目标: 后续对话接手 bug 修复和功能推进
> 文件名: H001-post-integration-testing-handoff.md

## 已完成边界

### 集成测试体系（12 对话，~60 子 agent）

- **调研阶段**（对话 1-6）：从 26 天讨论记录 + 10+ feature 设计文档 + 旧系统代码 + 新系统接缝中提取集测范围
- **实施阶段**（对话 7-12）：36 条集测项全部完成
- **产出**：28 个 integration spec 文件，11,479 行测试代码
- **测试结果**：1177 passed，1 failed（routing-tick.spec.ts 老测试因 BF-1 修复后 fixture 不匹配），lint 0 errors
- **Bug 已修复**：frame-matcher.ts `any` operator 永不匹配、routing-tick.ts fanOutToStorage 加 await

### 文件变更（未提交）

```
32 files changed, 1219 insertions(+), 261 deletions(-)
```

修改文件（M）：
- `rewrite/src/runtime/routing-tick.ts` — BF-1 fanOutToStorage 加 await
- `rewrite/src/runtime/feature-wiring.ts` — 集测相关 wiring 调整
- `rewrite/src/runtime/__tests__/helpers.ts` — 测试 helper 更新
- `rewrite/src/features/receive/core/frame-matcher.ts` — bug fix: `case 'any': return true`
- `rewrite/src/app/rewriteRuntime.ts` — 运行时调整
- `rewrite/src/features/connection/adapters/index.ts` — adapter 导出
- `rewrite/src/features/connection/index.ts` — public API 调整
- UI 组件和页面若干（框架侧改动）

新增文件（??）：
- `rewrite/src/__tests__/integration/` — 28 个 spec + 1 个 helper（全部集成测试）
- `rewrite/src/features/connection/adapters/composite-adapter.ts`
- `rewrite/src/features/display/components/`、`composables/`
- `rewrite/src/features/receive/components/`
- `rewrite/src/pages/DisplayPage.vue`
- `rewrite/src/widgets/ScatterChart.vue`、`WaveformChart.vue`

### 知识资产

| 文件 | 内容 |
|------|------|
| `S006-test-scope-synthesis.md` | 36 条集测项定义（§四-§六）、后续追加计划（§十）、实施对话规划（§十一） |
| `S001-historical-extraction.md` + 12 agent 子文件 | 26 天历史讨论中的验收标准、已知缺口 |
| `S002-feature-designs-upper.md` | 9 个 feature（frame→status）的设计验收标准提取 |
| `S003-feature-designs-lower.md` | task/command-ingress/result/northbound 设计验收标准提取 |
| `S004-legacy-observable-behaviors.md` + 9 agent 子文件 | ~194 条旧系统保留行为 + oracle 来源 |
| `S005-new-system-seam-audit.md` | 22 个接缝（7 高 + 10 中 + 5 低风险） |

## 不要做什么

- **不要重跑对话 1-6**：调研阶段产出完整，不需要重复提取
- **不要修改现有 28 个 integration spec 的测试逻辑**：这些是验收基线，除非对应代码实现改变
- **不要跳过必读文档直接写代码**：CLAUDE.md 明确要求先读规范再动手
- **不要把集测发现的功能缺失（command-ingress 未集成 routingTick、fieldKey 无来源区分）当成测试问题修**：这些是设计/实现问题，归 feature 实施计划
- **不要在 WSL2 上假定 TCP 测试 100% 稳定**：T001b/T001c 有偶发失败可能（端口竞争），必要时加 retry

## 必读

按优先级排序：

### 所有后续对话通用

1. `codestable/quality/rewrite-quality-rules.md` — 质量红线 R1-R16
2. `codestable/architecture/rewrite-target-structure.md` — 目标结构
3. `.sessions/2026-05-19-integration-testing/S006-test-scope-synthesis.md` — 集测范围 + 后续追加计划 + known-gaps
4. `.sessions/2026-05-19-integration-testing/topic-index.md` — 集测专题全貌和当前进度

### 线 1 Bug 修复额外必读

5. `rewrite/src/features/task/services/task-service.ts` — onSettled 竞态位置
6. `rewrite/src/features/task/core/` — task 执行引擎核心
7. `rewrite/src/runtime/__tests__/routing-tick.spec.ts` — 当前 1 个 failing test 的根因
8. `rewrite/src/runtime/routing-tick.ts` — BF-1 修复后 fixture 可能不匹配
9. `.sessions/2026-05-19-integration-testing/S005-new-system-seam-audit.md` — H1/H3/H4 接缝详情

### 线 2 分析对话额外必读

10. `codestable/features/rewrite-task/task-real-design.md` — task-real Phase 2 设计
11. `codestable/features/rewrite-task/task-real-brainstorm.md`（如存在）
12. `rewrite/src/features/task/core/types.ts` — 当前类型 vs task-real 目标类型
13. `.sessions/2026-05-19-integration-testing/S004-legacy-observable-behaviors.md` — §2.7（存储管理 16 项行为）+ §2.9（历史/CSV 8 项行为）+ §2.10（设置 21 项行为）
14. `src/stores/` — 旧系统对应 store（storageStore / historyDataStore / settings 相关）
15. `.sessions/2026-05-18-northbound-integration/S001-closed-loop-analysis.md` — 甲方 4 接口闭环分析
16. `codestable/compound/2026-05-07-runtime-next-phase-global-planning.md` — 下一阶段全局规划

## 下一轮

### 对话 A：线 1 — Bug 修复 + Failing Test 修复

**目标**：修 2 个 bug + 修 1 个 failing test，1178/1178 全绿

**Lane A**：快速修复

**直接合同**：
- 本 handoff 文档
- 具体代码位置（见下）

**Bug 1：onSettled 竞态**
- **位置**：`rewrite/src/features/task/services/task-service.ts`
- **现象**：CI 内部也调 onSettled，测试中用 pollUntil 绕过
- **影响**：task 执行结果可能不可靠
- **修复方向**：确保 onSettled 只被调用一次，或用 settled flag 保护

**Bug 2：errorPolicy stop/pause 不 resolve settle promise**
- **位置**：同上 task-service.ts
- **现象**：errorPolicy 为 stop 或 pause 时 settle promise 永远不 resolve
- **影响**：await taskService.startTask() 永远挂起
- **修复方向**：stop/pause 时也 resolve settle promise（值为 stopped/paused 状态）

**Bug 3（可能不是 bug）：routing-tick.spec.ts 1 个 failing test**
- **位置**：`rewrite/src/runtime/__tests__/routing-tick.spec.ts:86`
- **现象**：BF-1 修复（fanOutToStorage 加 await）后，老测试的 mock fixture 不匹配
- **修复方向**：更新测试 fixture 以匹配新的 await 行为，或确认是 fixture 问题

**验证**：`pnpm -C rewrite test` → 1178/1178 passed + `pnpm -C rewrite lint` → 0 errors

**不改**：
- 不改集成测试文件
- 不改 UI 组件
- 只改 task-service.ts + routing-tick.spec.ts（fixture 更新）

---

### 对话 B：线 2 分析 — task-real Phase 2 + 缺失页面范围评估

**目标**：不写代码，只做分析。产出两份范围评估：
1. task-real Phase 2 实际工作量（哪些类型需改、影响多少文件、哪些测试需更新）
2. 缺失页面（存储管理/历史分析/系统设置）的功能范围（从旧系统提取、对照已有 feature 评估缺口）

**Lane B**：单对话分析

**直接合同**：
- 本 handoff 文档
- task-real-design.md
- S004 旧系统行为提取

**子 agent 策略**：
- Agent 1：读 task-real-design.md + 当前 types.ts + task service，评估 Phase 2 每个子项的工作量和影响范围
- Agent 2：读旧系统 storage/history/settings 代码 + S004 §2.7/§2.9/§2.10，提取缺失页面的功能清单
- Agent 3：读 northbound 分析 + 全局规划文档，评估 northbound 前置依赖

**产出**：
- task-real Phase 2 范围评估（每个子项：文件数、风险、依赖）
- 缺失页面功能清单（每个页面：功能项、对应 feature、缺口）
- northbound 前置依赖清单
- 三者之间的依赖关系和推荐执行顺序

---

### 对话 C+：根据分析结果实施

对话 B 产出后再规划具体实施对话。

## 测试中发现的 Known-Gaps 清单

以下问题在集测过程中发现并文档化，按严重度排序：

| # | 发现 | 来源测试 | 严重度 | 建议 |
|---|------|---------|--------|------|
| 1 | onSettled 竞态 | T005 | 高 | 线 1 修 |
| 2 | errorPolicy stop/pause 不 resolve settle | T024b | 高 | 线 1 修 |
| 3 | storage bridge 失败阻塞全部下游 bridge emit | T016 | 中 | 需要 await + 错误隔离 |
| 4 | display bridge 失败阻塞全部下游 | T016 | 中 | 需要错误隔离 |
| 5 | connection disconnect 不自动 pause 活跃 task | T024d | 中 | 功能缺失，需设计 |
| 6 | command-ingress 未集成到 routingTick | T016b | 中 | 功能缺失，需接线 |
| 7 | fieldKey(frameId:fieldId) 无来源区分 | T016e | 低 | 设计局限，文档化 |
| 8 | bridge handler 无异常隔离 | T016 | 中 | 需要单 handler try-catch |

## 后续集测追加触发条件

| 触发事件 | 追加集测 | 参考 |
|----------|---------|------|
| task-real Phase 2 实施 | 统一引擎循环、fieldVariation、exitCondition | S006 §10.1 |
| Result runtime 编排实现 | result 收集端到端 | S006 §10.1 |
| autoConnect 实现 | 启动自动连接测试 | S006 §10.1 |
| readModel 跨帧变量实现 | 跨帧表达式测试 | S006 §10.1 |
| northbound 4 接口闭环 | HTTPS 入站/控制/回报/step 事件 | S006 §10.2 |
| 打包态验证 | native module/data path | S006 §10.3 |

## 提交状态

所有改动未提交。建议：
- 线 1 修完后统一提交一次（集测体系 + bug 修复）
- 提交消息示例：`feat: 集成测试体系建立 — 36 条集测项（343 tests）+ frame-matcher bug fix + fanOutToStorage await fix`
