# 重写过程日志

> 从 2026-05-15 起持续记录。之前的对话无统一日志，靠对话 JSONL 回溯。

## 2026-05-15 状态盘点

### 已完成

**Feature 核心（9 个 feature 全部建成）**
- frame、connection、send、receive、task、command-ingress、expression-engine、result、runtime

**代码简化 + 对齐审计（~30 个对话，05-12 ~ 05-13）**
- 5 feature 代码简化审计，30 项改动全部完成，净减 ~400 行
- 设计-代码对齐验证，12 项修正
- Service Readiness Audit（send / command-ingress / frame / connection）
- Expression engine 集成（Wave 1-3）
- Task 类型重组 Wave 0（ScheduleDriver、统一循环、step repeat）

**UI 页面（6 个页面已实现，build/lint 通过）**
- ConnectionPage — 连接管理
- FrameListPage — 帧定义列表
- FrameEditorPage — 帧定义编辑
- SendPage — 帧发送
- CommandIngressPage — 指令接入
- TaskManagePage — 任务管理

**前端基础设施**
- CSS token 体系 + UnoCSS spacing
- Shared composables（use-async-action / use-polling / use-notify / use-stable-keys / use-toggle-favorite）
- Shared utils（deep-clone / format）
- Widgets（DataTable / StatusBadge / FieldEditWidget / TableToolbar / TaskExecutionDetail）
- 前端规范（conventions + checklist + quickref）

**数据保护**
- git deny 规则（24 条危险命令）
- 全局 CLAUDE.md 自动提交规则
- 甲方文档恢复（20 个文件从 stash 恢复）
- 丢失文件审计脚本

### 未完成

**Runtime 真实能力（最高优先级）**
- serial / TCP 连接还是 mock
- 帧发送没有真实串口
- 任务调度是内存 stub
- SCO 命令是空壳
- routingTick 闭环没跑起来

**已知技术债**
- 1 个 pre-existing 测试失败（framePublicApi）
- 12 个 known-gap 测试（7 reconnect + 4 expression + 1 bootstrap）
- UnoCSS 间距迁移丢失，需重做
- GS1: JSON 持久化为内存态 stub
- GS2: variableProvider 为 noop

**页面后续**
- 6 个页面都是 UI 骨架，数据通路未接真实能力
- Home 页面待设计
