---
name: 用户角色与工作方式
description: 项目 owner/决策者，并行多 AI 对话推进东方红 rewrite，关心架构可持续性
type: user
originSessionId: fedf307e-5b34-4f76-a3c2-e62664096c65
---
## 角色
- 东方红上位机 rewrite 项目 owner 和架构决策者
- 不是"整理旧代码"，而是在 rewrite/ 做全新应用根
- 旧 src/src-electron/public 只作为 evidence/oracle/migration input

## 工作方式
- 并行开多个 AI 对话做设计、实现、审查，结果贴回主线判断
- 接手时必须结合 AGENTS.md、codestable 正式文档、handoff 判断，不能只看单个提示词
- 希望尽快完成但不靠乱写快，提速靠多个窄边界对话并行
- 实现可并行，前提：owner 清楚、write set 分开、后面有 cross-review
- 高风险链路（真实硬件/platform/northbound）不能随便并行糊过去

## 沟通偏好
- 中文，facts-first，findings-first
- 先讨论锁边界再执行
- 当前轮目标压窄，不顺手扩范围
- 没有新鲜验证证据不宣称完成
