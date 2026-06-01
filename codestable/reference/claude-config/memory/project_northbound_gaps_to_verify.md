---
name: Northbound 对接 gap 待验证清单
description: 2026-05-18 闭环讨论中识别的"声称缺失"条目，需对照设计文档和实际代码验证
type: project
originSessionId: 2281612a-34a4-4ffb-84e6-ff3f18434a1f
---
# Northbound 对接 gap 待验证清单

> 2026-05-18 闭环讨论产出。以下每条都是分析时声称"缺少"，需要后续统一对照设计文档和实际代码确认是真的缺少还是已有但没发现。

## 已拍板的决策

- testCaseId = 帧，不建独立用例实体
- executionPlan 不做并行，按顺序执行
- 测试数据文件（testDataFileTranslationComplete）不做
- 测试报告 MVP 糊弄版
- HTTPS server 放 main process，Fastify/Express 随便
- northbound 做独立 feature，不合并到 command-ingress
- 用例级结果判断可加，设计时注意解耦不一路连到底
- getTestCaseAll：帧列表 → 甲方用例 JSON → 上传 FTP

## 待验证 gap 清单

### G1: task step 级事件机制 ⚠️ 已确认缺失

**声称**：task service 只有终态事件（onSettled），没有 step 级完成回调/事件，无法驱动 msgReport。

**验证结果**：**确认缺失。** step 完成后只写内部状态（addStepResult），无事件发射、无回调、无外部通知。
- 证据：`task-iteration-loops.ts:162/171/222` — 只调用 addStepResult()
- 证据：task 目录下无 hook/emitter/callback 代码
- 影响：msgReport 无驱动源，需在 task 执行循环中加 step 完成回调

### G2: step 名称映射

**声称**：task step 只有 stepIndex，没有"步骤名称"概念（如甲方期望的"入网成功"、"呼叫"），无法填充 msgReport.stepInfo[].name。

**验证方法**：检查 TaskStepDefinition 和 TaskStepResult 类型，看是否有 name/label 字段或扩展点。检查 frame 定义是否有可复用的名称。

### G3: 用例级 verdict → 已改为 task 级 ✅ 已确认有基础

**决策变更**：甲方 testCase = 我们的 task，不需要用例级 verdict，直接用 task 级 verdict。

**验证结果**：judgeCaseVerdict 存在且完整（passed/failed/stopped），但 result service 是被动的，需手动调 collectResult()。
- 证据：`result/core/judge.ts:15-19` — 完整判断逻辑
- 证据：`result/services/result-service.ts:5-9` — 被动 API，无自动消费 onSettled
- 影响：northbound feature 需要自己接线：onSettled → collectResult() → 翻译 → POST

### G4: executionPlan 翻译 → 已简化 ✅ 方案已确认

**决策变更**：testCase = task 实例，并行 = 多 task 实例同时运行（task service 已支持）。

**翻译方案**：
- parallel=true 层：同时 createTask + startTask 多个实例
- parallel=false 层：顺序执行，等前一个 onSettled 再启动下一个
- executionPlan.layers 按层序号顺序处理

### G5: getTestCaseAll 的帧→用例 JSON 转换

**决策变更**：testCase = task，不再是帧。getTestCaseAll 需要暴露我们可执行的 task 定义列表，不是帧列表。

**验证方法**：确认甲方 JSON 格式的必填字段（id, name, isParent, inputPars 等），看 task 定义是否自然覆盖。inputPars 对应 task 的 userFieldValues 或 frame 字段。

### G6: FTP 上传能力 ⚠️ 已确认缺失

**验证结果**：**确认缺失。** platform 只有 transport（串口/TCP/UDP）和 file facade，无 FTP/HTTP。
- 证据：`platform/index.ts` — 只有 transport + file bridge
- 证据：搜索全项目无 FTP 相关代码
- 影响：getTestCaseAll 用例上传、测试报告上传都无法实现

### G7: 多批次任务拼装（isEnd）→ 待向甲方确认

**状态**：需向甲方确认实际使用中是否总是 isEnd=true。

### G8: msgReport 批量上报 → 依赖 G1

**状态**：G1（step 级事件）解决后，批量构造是简单实现问题。

### G9: stopped → tbd 的 verdict 映射 → 已确认可行

**验证结果**：judgeCaseVerdict 已返回 'stopped'，可直接映射为甲方 tbd。无需改动。
- 证据：`result/core/judge.ts:17` — lifecycle === 'stopped' → 'stopped'

## 验证优先级

先做 G1、G2、G3（影响核心闭环设计），再做 G5、G6（影响出站通路），最后 G4、G7、G8、G9（实现细节）。
