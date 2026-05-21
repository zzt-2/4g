# [S014] Runtime Real 主控对话（全局规划→甲方对接）

> 2026-05-07 ~ 2026-05-18 | 跨 11 天主控 | 已完成
> 2026-05-18 续接 — 补全归档

## 目标

补全 030d34c4 (5.6M) 主控对话的归档。这是 rewrite 项目最大单对话，跨 11 天、8 次 context 重置，作为"控制塔"驱动 30+ 并行子对话完成从骨架到可操作系统的全过程。

## 记录

### 概况

- 3128 行 JSONL，8 次 context 重置（4 次自动 overflow + 4 次手动 compact）
- 核心角色：不是直接实施者，而是规划者 + 提示词生产者 + 进度追踪者
- 总进度从 ~30%（骨架）推到 ~80%（feature 完成 + 6 页面 + 甲方文档分析）

### 阶段 1：现状摸底与全局规划（05-07 ~ 05-08）

派 6 个子 agent 并行摸底 platform/Electron/runtime/旧系统现状。

**确认**：骨架已通（9 feature + runtime wiring + 330+ 测试），空缺明确（网络 transport、文件系统、SCOE、Northbound、UI）。

**用户明确**：全部保留、串口先通网口紧随、SCOE 特殊路径现在就实现、历史数据不兼容。

**产出**：1078 行全局规划 `codestable/compound/2026-05-07-runtime-next-phase-global-planning.md`，规划 A-G 7 个功能分组，确立 Wave 0-7 波次并行策略。

**关键决策**：
- SCOE → 指令接入（command-ingress），旧 SCOE 不再独立
- 表达式引擎放 shared/ 纯函数
- 帧定义全局唯一
- 条件匹配分两层（匹配逻辑归 shared/，触发行为归各 feature）

### 阶段 2：架构审计与 Wave 0（05-08 ~ 05-09）

- 架构风险审计：Feature 边界隔离 A+，Store 36 写入点归口正确，最大风险 = selector 浅拷贝 + 端到端集成测试缺失
- 三线旧系统调研：SCOE 22 文件 / 表达式引擎 1385 行 / 可视化 1074 行
- Wave 0 完成：expression-engine 全流程（330 tests）、bootstrap（80%，缺 AppShell 集成）、condition-matching 补齐

### 阶段 3：Wave 1-4 推进（05-09 ~ 05-11）

通过提示词驱动子对话执行：
- frame-real：design + impl 完成
- platform-network-transport：缩为单 cs-feat（TCP/UDP），design + impl 完成
- connection-complete：design + impl 完成
- send-real：brainstorm + design 完成
- receive-real：brainstorm + roadmap 拆分，~40% 完成
- task-real：27 文件 ~3500 行，design + impl 完成
- command-ingress：29 文件 ~4300 行，design + impl 完成
- Wave 3 审查发现 7 个跨 feature 类型对齐问题，做了一轮一致性扫描

### 阶段 4：质量体系建设（05-10 ~ 05-12）

写入 CLAUDE.md 的规则：
- 过度设计审查（5 维度）：上游消费方式、下游需求匹配、驱动需求真实性、链路位置、跨模块一致性
- 代码精简审查（5 检查项）：层间增值、死 surface、传递函数、重复模式、过度抽象
- Service Readiness Audit：UI 设计前必须审计 service 层

执行的质量工作：
- 全局身份标识审计：frameId/fieldId 全链路 string 引用
- 代码精简审计：5 feature ~10,289 行，269 export 中仅 15% 有外部消费
- 前端规范提取：`rewrite-frontend-conventions.md`（376 行/39 条）+ `rewrite-frontend-checklist.md`
- 会话交接模板：6 个模板

### 阶段 5：UI 架构与页面设计（05-12 ~ 05-13）

- 全局 UI 架构：二级折叠侧边栏 + MVP 10 入口 + 6 锁定决策
- UnoCSS 职责划分：结构性布局走 utility class，视觉 token 走 CSS
- B1 帧域+连接 3 页面 design（审查 7 问题，修订后完成）
- B2 任务+发送+指令 3 页面 design（大量规范违规，修订后完成）

### 阶段 6：事件恢复与防护（05-13 ~ 05-15）

**问题**：CLAUDE.md 的 12/13 次 Edit 被其他对话 git reset 覆盖丢失。

**恢复**：
- 6 条自检规则全部恢复
- 14 个文件确认丢失，9 个需恢复，5 个是精简有意删除
- 甲方文档从 stash 恢复（20 个文件）
- settings.json 新增 24 条 git 高危命令 deny 规则
- 全局 CLAUDE.md 加自动提交规则和危险命令禁止项
- 编写 `scripts/audit-lost-files.py` 扫描审计

### 阶段 7：进度收拢与甲方对接（05-15 ~ 05-18）

- 全景盘点：20+ 对话产出汇总
- 85 文件大提交（6 页面 + 审计修复 + 基础设施）
- 建立 `.sessions/` 过程日志体系
- 调查发现：存储完全没接持久化、SendPage direction bug
- 确认 10 个 service 全部 100% 完成
- 甲方文档分析：31 个 HTTPS 接口 + FTP
- 甲方对接 4 接口闭环决策写入 memory

### 测试/验证

- 803 tests passed（receive-real 完成后）
- routing-tick 15 tests（含 3 个预算截断测试）
- expression-engine 330 tests
- pnpm lint + pnpm build 通过
- 架构审计：Feature 边界隔离 A+，0 穿透

### Git commits（本对话直接）

- `4528e67` — 暂存工作区防丢失
- 甲方文档恢复 commit
- `1ae3a6c` — 85 文件大提交
- `92a51e9` — 规范 + 审计文档
- `828c4a7` — .sessions/ 建立
- 05-15 UI 审计 + 对标修复
- 05-18 甲方对接闭环

## 后续

- 持久化层是最高优先级缺口（所有 feature state 仍为内存闭包）
- Runtime 真实能力：serial/TCP 仍为 mock，帧发送无真实串口
- 6 个页面是 UI 骨架，数据通路未接真实能力
- 可视化 UI 缺 ECharts 渲染组件
- 甲方 MVP 6 接口实现未启动
