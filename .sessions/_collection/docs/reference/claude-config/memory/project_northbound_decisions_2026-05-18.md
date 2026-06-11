---
name: Northbound 甲方对接闭环决策 2026-05-18
description: 基于 V1.0.1 甲方接口文档的闭环讨论结论，包含已拍板决策和待验证 gap
type: project
originSessionId: 2281612a-34a4-4ffb-84e6-ff3f18434a1f
---
# Northbound 甲方对接闭环决策

> 2026-05-18，基于新甲方文档（V1.0.1，31 接口）的闭环讨论

## 核心链路（6 个 MVP 接口）

1. **setTestTask**（甲方→我们）：下发任务。testCaseInfo[] 每一项 → 一个 TaskDefinition。
2. **controlTestTask**（甲方→我们）：abort/pause/continue/stop → task lifecycle 直接映射。
3. **testCaseResultReport**（我们→甲方）：task 终态 verdict → success/fail/tbd。
4. **msgReport**（我们→甲方）：步骤进度实时上报。
5. **heartbeat**（甲方→我们）：心跳响应，MVP 必做。
6. **getSubSysState**（甲方→我们）：状态查询，MVP 必做。

## 已拍板决策

- **甲方 testCase = 我们的 task**（不是帧，不是独立用例实体）。setTestTask 的 testCaseInfo[] 每项 → 一个 task 实例。
- executionPlan 不做并行，layers 按顺序创建/执行 task
- 测试数据文件（testDataFileTranslationComplete）不做
- 测试报告 MVP 糊弄版：result + 时间 + 基本用例列表，checkPoints 简化
- HTTPS server 放 main process（传输层），业务逻辑在 renderer，IPC 通信
- northbound 做独立 feature，不合并到 command-ingress
- task 级 verdict 直接映射 testCaseResultReport，不需要额外用例级判断层
- **verdict 判定依据**：发帧 + 等接收帧校验参数。task 典型 steps = send step + wait-condition step。wait-condition matched → success，timeout/不匹配 → fail，task 被 stop → tbd
- getTestCaseAll：帧列表转甲方用例 JSON 格式，上传到甲方指定 FTP
- 翻译层在 northbound feature 内，不是 shared/，不是 command-ingress

## 不做的

- 并行执行模型
- 测试数据文件生成和 FTP 上传
- 精细测试报告（checkPoints 详细对比、statisticsItems、attachItems 等）
- 用例库管理（CRUD、菜单树管理等）

## 下一步

- 对照设计文档和实际代码验证 G1-G9 gap 清单
- 验证完成后进入 northbound feature design
