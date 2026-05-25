# 甲方对接闭环分析

> 状态: active | 创建: 2026-05-18

## 专题目标

基于甲方 V1.0.1 接口文档（31 接口），确认"甲方控制我们任务、我们回传结果"这条链路是否闭环，识别断点，拍板决策，为后续 northbound feature 设计和实施做准备。

## 进展线索

### S001 — 闭环讨论与决策拍板
- 完整读入甲方文档并拆分为 11 个文件（31 接口），存放在 `rewrite/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/`
- 并行 3 个子 agent 读取：我方 6 份 northbound 文档、task 系统代码+设计、甲方 4 个核心接口详细规格
- 完成 5 个问题分析（Q1 闭环完整性、Q2 HTTPS 放哪、Q3 翻译层形状、Q4 与 command-ingress 关系、Q5 旧 gap 有效性）
- 代码级验证 result/task/platform 实际实现状态（另派 1 个 explore agent 查代码）
- 拍板所有核心决策（4 轮决策演进：初始 → testCase=task → verdict 依据确认 → 甲方回复）
- 产出甲方待确认 2 条 → 甲方回复 immediate=true/isEnd=true → 待确认项清零

## 已确认结论

### 核心映射

- **甲方 testCase = 我们的 task（TaskDefinition）**
- 甲方的 executionPlan.layers 中每个 testCaseId → 我们创建一个 task 实例
- task 典型 steps = send step（发帧）+ wait-condition step（等接收帧校验参数）
- verdict: wait-condition matched → success, timeout/不匹配 → fail, task 被 stop → tbd

### MVP 接口（6 个）

| 接口 | 方向 | 映射 | 状态 |
|------|------|------|------|
| setTestTask | 甲方→我们 | testCaseInfo[] 每项 → 一个 task | 逻辑通 |
| controlTestTask | 甲方→我们 | abort→stop, pause→pause, continue→resume, stop→stop | 通 |
| testCaseResultReport | 我们→甲方 | task 终态 verdict → success/fail/tbd | 有基础需接线 |
| msgReport | 我们→甲方 | step 完成 → stepInfo | 缺 step 事件（G1） |
| heartbeat | 甲方→我们 | 简单响应 | 需实现 |
| getSubSysState | 甲方→我们 | 状态查询响应 | 需实现 |

### executionPlan 处理

- parallel=true 层：同时 createTask + startTask 多个实例（task service 已支持多实例并行）
- parallel=false 层：顺序执行，等前一个 onSettled 再启动下一个
- layers 按层序号顺序处理

### 架构决策

- HTTPS server 放 main process（传输层），业务逻辑在 renderer，通过 IPC bridge 通信
- northbound 做独立 feature，不合并到 command-ingress
- 翻译层在 northbound feature 内（inbound-translator + outbound-translator）
- result 不需要改，northbound 自己接线：onSettled → collectResult() → 翻译 → POST

### 不做的

- 测试数据文件（testDataFileTranslationComplete）— 悄悄不做
- 精细测试报告（详细 checkPoints 对比、statisticsItems 等）— 糊弄版
- 用例库管理 / 独立用例实体
- FTP 文件上传（getTestCaseAll 的 FTP 暂不实现？待确认）

## 代码验证结果

### 已有基础

| 能力 | 文件 | 说明 |
|------|------|------|
| verdict 判断 | `result/core/judge.ts` | judgeCaseVerdict → passed/failed/stopped |
| task 终态感知 | `task-service.ts` | onSettled(), Promise resolve 机制 |
| step 结果实时写入 | `task-iteration-loops.ts:162/171/222` | 每 step 完成立刻 addStepResult() |
| platform bridge 模式 | `platform/index.ts` | transport + file facade |
| result service | `result/services/result-service.ts` | collectResult/getVerdict/getSnapshot/clear |

### 确认缺失

| 缺失 | 影响 | 改动范围 |
|------|------|---------|
| step 级事件通知 | msgReport 无驱动源 | task 执行循环加回调 hook |
| HTTPS outbound client | 无法向甲方 POST 数据 | platform facade 新增 |
| FTP 上传 | getTestCaseAll 文件上传无通道 | platform facade 新增 |
| result 自动收集 | 需手动调 collectResult | northbound feature 接线 |
| 报告生成 | 只有 placeholder | northbound feature 实现 |

## 甲方已确认

1. **immediate 始终 true** — 收到 setTestTask 直接 createTask + startTask，不需要延迟启动逻辑
2. **isEnd 始终 true** — 一次下发全部 testCaseInfo，不需要多批次拼装

甲方说明：接口参照了原入网认证的一二级接口，部分字段暂未用到。

## 待验证（G2、G5）

- **G2**: step 名称映射 — TaskStepDefinition/TaskStepResult 有没有 name/label 字段
- **G5**: getTestCaseAll — 需求变了（testCase=task），需确认甲方 JSON 格式哪些字段必须填

## 甲方文档拆分

`rewrite/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/`

| 文件 | 接口数 | 内容 |
|------|--------|------|
| 00-index.md | - | 全部接口索引 |
| 01-概述与约定.md | - | 协议约定 |
| 02-设备管理.md | 5 | 设备信息、状态 |
| 03-用例管理.md | 7 | getTestCaseAll、文件上传下载、增删 |
| 04-任务管理.md | 3 | **setTestTask**、**controlTestTask**、ccSysGetFileRequest |
| 05-文件传输与结果上报.md | 3 | testDataFileTranslationComplete、fileTranslationComplete、**testCaseResultReport** |
| 06-告警上报.md | 2 | 设备告警、子系统告警 |
| 07-参数配置与查询.md | 4 | 参数转发、读写 |
| 08-系统维护.md | 4 | 升级、**heartbeat**、neControl、参数反馈 |
| 09-数据转发与实时上报.md | 3 | dataTransmit、**msgReport**、sigReport |
| 10-附录.md | - | 模板、编码表 |

## 未决项

- getTestCaseAll 是否纳入 MVP？甲方查用例，需要把 task 定义转成甲方 JSON 格式并通过 FTP 上传
- HTTPS 库选型（Fastify/Express）
- taskId ↔ instanceId 映射表放在哪里（northbound feature 内部？runtime？）
- sessionId 生命周期管理
- step 名称映射方案（G2 待验证）
- TLS 配置（自签名？双向？）

## 下一步

1. 完成 runtime 真实连接能力（串口/TCP mock → 真实）
2. 验证 G2（step 名称映射）和 G5（getTestCaseAll 格式）
3. 本地端到端验证：建 task → 发帧 → 收响应 → 条件匹配 → verdict
4. 以上全通后设计实施 northbound feature

### S002 — Northbound feature 实施
- 按 approved design + checklist 实施 8 步，全部完成
- 新增 northbound feature（types + translator + state + service）、platform HttpFacade、task onStepResult callback
- feature-wiring 注册 resultService + northboundService
- 43 个单元测试通过，build + lint 通过
- 5 项跨 feature 遗留详见 S002 §后续
