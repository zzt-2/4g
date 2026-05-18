# [S001] 甲方对接闭环讨论

> 2026-05-18 | 讨论 | 已完成

## 目标

基于甲方 V1.0.1 接口文档，逐段分析"甲方控制我们任务、我们回传结果"的闭环链路，识别断点和决策点。

## 记录

### 文档拆分

甲方原始文档 7455 行 / 31 接口，拆分为 11 个文件存放于 `rewrite/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/`。4 个核心接口（setTestTask / controlTestTask / testCaseResultReport / msgReport）内容完整保留。

### 5 个问题分析

通过 3 个并行子 agent 读取我方系统文档（6 份）、task 系统代码（types + service + design）、甲方核心接口详细规格，完成以下分析：

**Q1 任务闭环：** 逐段检查后确认三大断点——用例映射层缺失、并行执行不匹配、出站通道未建立。后续决策简化了前两个：testCase=task、并行=多 task 实例。

**Q2 HTTPS 服务：** 放 main process（传输层），renderer 处理业务逻辑。复用现有 platform bridge 模式。

**Q3 翻译层：** northbound feature 内部模块，不做 shared/，不合并 command-ingress。双向（入站+出站）独立。

**Q4 command-ingress 关系：** 独立 feature。SCOE 和 northbound 是两个外部系统，协议完全不同，不应合并。

**Q5 旧 gap 分析有效性：** 大部分结论仍成立。新文档暴露了更多细节需求（executionPlan 层级模型、用例目录树、多批次拼装等）。

### 决策过程

1. 初始分析产出后，用户逐条拍板：
   - testCaseId = 帧 → 后改为 testCase = task（更合理的映射）
   - 不做并行 → 后确认并行可行（多 task 实例，task service 原生支持）
   - 测试数据文件不做
   - 测试报告糊弄版
   - heartbeat / getSubSysState 纳入 MVP

2. 代码验证确认：
   - judgeCaseVerdict 存在且完整（G3 ✅）
   - step 级事件确实缺失（G1 ⚠️）
   - HTTPS/FTP outbound 确实缺失（G6 ⚠️）
   - onSettled 是 Promise 机制，可接线
   - result service 被动，需手动 collectResult

3. 甲方反馈事项缩减为 2 条：
   - immediate=false 启动机制
   - isEnd 多批次实际使用场景
   - 报告格式简化和测试数据文件不做——不问甲方，悄悄不做

### 关键代码位置

| 能力 | 文件 | 行号 |
|------|------|------|
| verdict 判断 | `rewrite/src/features/result/core/judge.ts` | 15-19 |
| result service（被动） | `rewrite/src/features/result/services/result-service.ts` | 5-9 |
| step 结果实时写入 | `rewrite/src/features/task/services/task-iteration-loops.ts` | 162, 171, 222 |
| onSettled Promise | `rewrite/src/features/task/services/task-service.ts` | 66, 273 |
| settle resolve 触发 | `rewrite/src/features/task/services/task-lifecycle-manager.ts` | 39-45, 73, 79 |
| platform bridge | `rewrite/src/platform/index.ts` | 29-39 |
| transport facade | `rewrite/src/platform/transport.ts` | — |
| file facade | `rewrite/src/platform/files.ts` | — |
| report placeholder | `rewrite/src/features/command-ingress/composables/use-task-report.ts` | 7-9 |
| central docking placeholder | `rewrite/src/features/command-ingress/composables/use-central-docking.ts` | 26-28 |

## 后续

- 向甲方确认 2 个问题（immediate=false 启动方式、isEnd 多批次）
- 验证 G2（step 名称映射）和 G5（getTestCaseAll 格式）
- 完成 runtime 真实连接能力（串口/TCP mock → 真实）
- 设计 northbound feature
- 实施：task step 事件 hook → northbound feature → platform HTTPS facade
