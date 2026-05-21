# [S011] UI 基础设施与六页面实现

> 2026-05-13 ~ 2026-05-15 | 实现阶段 | 已完成

## 目标

在已完成 9 个 feature 核心逻辑（811 tests baseline）的基础上，完成 UI 实施前最后一轮代码准备（task 类型重组、expression 集成、基础设施到位），然后一次性实现 6 个业务页面 + Home 总览页，补全侧边栏导航和前端规范，最终通过 47 项 UI 静态审计和设计文档对标修复，使重写前端从"只有 service 层"进入"页面可操作"状态。

直接合同：`codestable/features/pre-ui-service-design.md` + `codestable/quality/pre-ui-implementation-checklist.md`（Wave 0-4 代码准备）；`pages-frame-connection-design.md` + `pages-task-send-command-design.md`（页面实现）。

## 记录

### 05-13: Wave 0-4 代码准备 + 审计 + 文档

本日工作集中在 UI 实施前的代码侧准备。由 pre-ui-service-design.md 定义了 5 个 Wave（0-4），按波次依次完成。

**Wave 0: Task 类型重组** `3e9cb1b`

task-real-design 的 30 项类型重组全部落地，涉及 21 个文件，净增约 200 行（大量重写而非纯新增）：

- `ScheduleDriver` discriminated union 替代原有 `TaskSchedulingMode` 字符串枚举，支持 `timed`/`trigger`/`sequence`/`manual` 四种驱动模式，每种携带自己的配置参数
- `runTask` 统一循环替代分散的 `runTimedLoop`/`runTriggerLoop`/`runSequenceLoop`，循环体内部根据 `ScheduleDriver.kind` 分支处理
- `ConditionRegistry` 新增 `registerGroup`/`unregisterGroup` 支持 AND/OR 条件组合
- `FieldVariation`、`StepRepeat`、`TimerService` port 新类型
- G1-G3: `updateTask`、`selectTaskHistory`、`stopAll` 返回 number
- 测试 fixture 的 delay 值降低以提升测试稳定性

**Wave 1-3: Expression 集成、Command-log、Highlight、Dead surface** `7716245`

14 个文件改动，+484 / -92 行：

- A1: receive processor 表达式集成 — `compile -> evaluate -> mark fields` 后处理 pass 完整实现，表达式引擎正式接入 receive 数据流
- C1-C3: CommandLogRecorder ring buffer、testDataRecorder、sendTestData 三项 command-ingress 数据记录能力
- B3: HighlightRuleConfig data-driven 替代 function-based HighlightRule，高亮规则从函数式改为声明式配置
- B4: command-ingress dead surface 清理
- D6: report-core 测试补写
- D7: receive-display-bridge groupId/dataItemId 字段对齐

**Wave 4: 基础设施** `67fe632`

5 个文件，+42 / -155 行（净减来自 dead surface 清理）：

- D1: UnoCSS spacing scale 与 SCSS `--rw-space-*` tokens 对齐，定义在 `uno.config.ts` theme 中
- D2: vitest testTimeout 增至 10s 提升异步测试稳定性
- 删除 connection selectors dead surface（142 行）
- eslint.config.js ignore verify-serialport.mjs

**设计-代码对齐审计修正** `767c5ff`

8 个文件，+367 / -17 行。对齐审计发现设计文档与代码实现之间有多处不一致：

- `pages-task-send-command-design.md`: 任务域 Service Readiness Audit 全部标注、D-T5 Phase 2 标注、D-T7 术语修正、D-T10 方法签名重写
- `pages-frame-connection-design.md`: selector 引用更新
- `send-real-design.md`: `evaluateFieldPreview` 签名、expression API 名称、`configurable` 可选
- `frame-real-design.md`: `legacy.ts` 路径修正
- `frame/index.ts`: 移除死 re-export
- 恢复此前误删的 `status-timer.ts` 和 `connection-selectors.ts`

**Pre-UI Service Design + Checklist** `e2c5c02`

7 个文件，+1086 / -40 行。产出 UI 实施前的最终代码改动合同：

- `codestable/features/pre-ui-service-design.md`（690 行）：5 Wave 实施规划，明确每个 Wave 的范围、文件、预估和验收标准
- `codestable/quality/pre-ui-implementation-checklist.md`（356 行）：Phase A/B/C/D 四阶段 checklist，含 30+ 具体检查项
- 同步更新 connection/frame/send/ui-architecture brainstorm 文档，确保与代码状态一致

**testDataRecorder 空壳修复 + 类型对齐** `aad8aae`

4 个文件，+117 / -30 行：

- testDataRecorder 通过 adapter `onConsume` 回调记录 consumed raw bytes（此前是空壳）
- 修正 UI design 文档中 11 处 BREAKING + 9 处 TERMINOLOGY（`schedule.kind` 替代 `schedulingMode`、`stopAll`/`retryTask` 签名更新等）
- SCOE protocol adapter 测试补写

**Conventions D2/P4/T2 补充** `c626a7c`

conventions 文件补充三条规则，为 UI 实施提供明确指引：

- D2: dialog class 尺寸表 — 明确 `dialog-sm`/`dialog-md`/`dialog-lg` 的宽度和最大高度
- P4: shallowRef 推荐模式 — 大型响应式对象推荐使用 `shallowRef` + 手动 trigger
- T2: QTable 列宽豁免 — QTable 列宽允许使用 px 值，不强制 token

**辅助工作** `57aba60` `dbe05b5`

- `57aba60`: 暂存所有工作区改动（58 文件，+2067 / -710 行），包含 CLAUDE.md 自检规则更新、代码精简审计文档、connection/receive/send/task 代码改动、安全防护脚本。这是一个保护性 commit，将多日并行工作成果安全落盘
- `dbe05b5`: 从 stash 恢复甲方相关文档（20 个文件，+5667 行），包括集成测试接口设计文档（10 个）、甲方接口审查文档（4 个）、沟通确认记录（3 个）等

### 05-15: 六页面实现 + 审计修复 + Home + 导航

本日是实施密集日，从早上到下午连续完成页面实现、审计、对标修复和基础设施收尾。

**6 页面实现 + 审计修复 + 基础设施** `1ae3a6c`

这是本阶段最大的单一 commit，85 个文件，+8652 / -1383 行。一次性实现 6 个业务页面并修复已知问题：

页面实现：

| 页面 | 文件 | 行数 | 核心功能 |
|------|------|------|---------|
| ConnectionPage | `pages/ConnectionPage.vue` | 228 | 连接卡片列表、新建连接弹窗、连接状态管理 |
| FrameListPage | `pages/FrameListPage.vue` | 331 | 帧列表 CRUD、导入/导出、搜索过滤、收藏 |
| FrameEditorPage | `pages/FrameEditorPage.vue` | 180 | 帧编辑左右布局、字段列表、基本信息表单 |
| SendPage | `pages/SendPage.vue` | 547 | 帧实例列表、目标选择、实例编辑、发送控制 |
| CommandIngressPage | `pages/CommandIngressPage.vue` | 664 | SCOE 配置三 Tab、测试工具、高亮规则 |
| TaskManagePage | `pages/TaskManagePage.vue` | 963 | 任务列表双 Tab（活动/历史）、任务编辑器、状态筛选 |

审计修复（在实现中同步完成）：

- deepClone 统一到 `shared/utils/deep-clone.ts`
- 空 catch 块补 log
- StatusBadge 泛化为通用 widget
- composable 提取（frame/send/task 各自的 use-*.ts）

基础设施（支撑所有页面）：

- shared composables: `use-async-action`/`use-polling`/`use-notify`/`use-stable-keys`
- widgets: `DataTable`/`StatusBadge`/`FieldEditWidget`/`TableToolbar`/`TaskExecutionDetail`
- CSS tokens: `_utilities.scss` 工具层、`_size.scss` 补充
- feature 组件：frame（8 个组件 + 3 个 composable + 3 个 label 文件）、send（3 个组件 + 2 个 composable）、task（4 个组件 + 3 个 composable + 3 个 label 文件）、command-ingress（6 个组件 + 5 个 composable）、connection（2 个组件 + 1 个 statusMap）

路由更新：

- `routes.ts` 注册 6 个页面路由
- `AppShell.vue` 添加路由出口样式

runtime 测试更新：

- `feature-wiring.spec.ts` 大幅改写（107 行变动）
- `routing-tick.spec.ts` 简化（-322 行，抽取到 helpers）
- 新增 `__tests__/helpers.ts`（248 行测试工具）
- `feature-wiring.ts` 扩展 wiring 列表

**规范更新 + 审计文档 + 前端速查** `92a51e9`

5 个文件，+663 行。为后续 UI 审计修复对话提供弹药：

- conventions: O2 通用规则、composable 模式、v-for key 规范（+177 行）
- checklist: A/I 检查组补充（+12 行）
- CLAUDE.md: 强制阅读语气升级，明确"每次写新页面/组件前必须先读速查卡"
- 新增 `audit-fix-prompt-2026-05-14.md`（328 行）：UI 审计修复对话的标准 prompt，含审计报告格式、修复策略、验收标准
- 新增 `rewrite-frontend-quickref.md`（141 行）：前端速查卡，汇总 shared/ API 索引 + 语义 class + 高频违规清单 + 新页面检查清单

**过程日志建立 + 文档搬移** `828c4a7` `befdafd`

- `828c4a7`: 新增 `.sessions/2026-05-15-progress-log.md`（58 行全局状态盘点），搬移 `codestable/compound/` 下的 runtime 规划文档到 `.sessions/2026-05-07-runtime-global-planning/`
- `befdafd`: progress-log 搬入专属文件夹 `.sessions/2026-05-15-progress-log/`

**侧边栏导航补全** `df1c5f1`

19 个文件，+84 / -88 行：

- `AppShell.vue` navigationItems 从 2 项补全为 6 项：总览/连接管理/帧定义/帧发送/任务管理/指令接入
- `quasar.config.ts` extras 添加 `material-icons-outlined`
- 全项目移除 `o_` 前缀 icon name，统一使用标准 Material Icons 名称（涉及 12 个组件文件）
- 修正 frame-public-api 测试中 `createFrameAssetService` 的断言方向

**Home 总览页** `a6abb6c`

替换原占位内容为完整总览页，+282 / -108 行：

- 四个 SummaryMetric 卡片：连接数/帧数/任务数/发送数
- 五个快速入口卡片：导航到各业务页面
- 活跃连接状态列表
- 系统快照面板
- 使用 `usePolling` 2s 刷新各 feature selector 数据

**UnoCSS spacing 迁移** `d467c25`

8 个文件，+62 / -112 行（净减 50 行）：

将 `var(--rw-space-*)` CSS 变量引用替换为 UnoCSS utility class（`gap-3`、`p-4` 等），确保与 SCSS tokens 视觉一致。响应式间距 media query 保留字面值。涉及 ConnectionCard、NewConnectionDialog、CommandIngressPage、ConnectionPage、HomePage、AppNavigation、SummaryMetricGrid。

**帧域+连接页面对标修复** `bdc1e8d`

9 个文件，+212 / -70 行。对照 `pages-frame-connection-design.md` 逐条修复：

- P0: 修复 FrameFieldList emit 名称错误导致添加/编辑字段不工作；修复方向筛选值 `o_send` -> `send` 与枚举不一致
- P1: 字段复制按钮 + 行点击编辑；ImportFrameDialog issues 按 error/warning 分组显示；识别规则末条隐藏逻辑运算符；选项配置 radio 互斥 + 最少 2 项；连接卡片 autoConnect toggle；串口端口刷新按钮 + use-input；详情面板空状态
- P2: 帧列表 selection 改 single；轮询间隔 500 -> 1000ms

**三页面设计文档对标修复** `1648ecc`

5 个文件，+693 / -312 行。对照 `pages-task-send-command-design.md` 逐条修复三大页面：

SendPage:
- 双击帧格式创建实例并打开编辑对话框（D-S2）
- 批量删除模式：`selection="multiple"` + 批量删除确认（D-S3）
- 可配置字段显示 hex 值而非原始值（D-S4）

TaskManagePage:
- `q-tab-panels` + `keep-alive` 替代 `v-if` 切换（D-T3）
- 状态筛选 QChip 组：全部/待启动/运行中/已暂停/已完成/失败（D-T3）
- 工具栏增加导入/导出按钮（stub，待 platform file facade）（D-T2）
- 活动列表终止态任务增加移至历史按钮（D-T3）
- 时间格式改用 `formatDateTime`（V2）
- 右面板增加可变参数摘要（D-T4）

CommandIngressPage:
- 修复"添加卫星"按钮无 `@click` handler（P0）
- 测试工具接收区改用 `QVirtualScroll` + 时间列（D-CI2）
- 接收区增加开始/停止录制按钮（D-CI2）
- 高亮对话框颜色选项修正为 negative/positive（D-CI2）
- SCOE 配置左栏增加导入/导出按钮（D-CI3）
- SCOE 配置右栏实现卫星信息编辑表单 + 命令配置列表（D-CI3）
- Tab3 增加内部 Tab（任务列表/设备列表）+ stub 对话框（D-CI4）

shared: 新增 `formatDateTime` 工具函数

**UI 静态审计修复** `c94e099`

进度日志记录了 47 项 UI 审计问题及修复（详见 `codestable/quality/ui-audit-2026-05-15.md`）：

- P0（3 项）：任务编辑弹窗拆分 + QForm 包裹；发送编辑弹窗加 QForm；CI 高亮弹窗 `@hide` 清理
- P1（12 项）：`$q.notify` -> `useNotify` 统一；v-model 修正；StatusBadge 替代手动映射；Quasar spacing -> UnoCSS 全量迁移（13 个文件）；min-height 统一；media padding token 化
- P2（4 项）：v-show -> v-if 优化；模板内联 `.map()` -> computed；预计算到 row 数据

**Service 完成度调查**（同日确认）

通过代码审查确认 10 个 feature service 层全部 100% 完整实现，零 stub/TODO/空壳。display feature 已含星座图（`projectScatter`）和波形图（`projectChartSeries`）数据投影层，缺的只是 ECharts 渲染组件。

**SendPage P0 Bug 修复** `978e48a`

- `SendPage.vue` 第 41 行 `direction: 'o_send'` 应为 `'send'`（FrameDirection 枚举合法值只有 `'send'` 和 `'receive'`）
- 导致 `matchesQuery` 过滤掉所有帧，发送页帧列表始终为空

### 产出汇总

| 类别 | 数量 | 关键产出 |
|------|------|---------|
| 页面实现 | 7 个 | Connection/FrameList/FrameEditor/Send/CommandIngress/TaskManage/Home |
| 前端基础设施 | 4 类 | shared composables（5 个）、widgets（5 个）、CSS tokens、UnoCSS spacing |
| Feature 组件 | ~25 个 | frame 8 + send 3 + task 4 + CI 6 + connection 2 + labels/statusMaps |
| Feature composables | ~15 个 | frame 3 + send 2 + task 3 + CI 5 + connection 1 |
| 审计修复 | 47 项 | 3 P0 + 12 P1 + 4 P2 + spacing 迁移 |
| 设计文档对标 | 2 组 | 帧域+连接 3 页面 / 任务+发送+指令 3 页面 |
| 规范文档 | 3 份 | quickref + audit-prompt + conventions 补充 |
| 代码准备 | Wave 0-4 | task 类型重组 + expression 集成 + 基础设施 + dead surface 清理 |

## 后续

1. **持久化层是最高优先级缺口** — 所有 feature state 仍是 JS 内存闭包，进程退出数据全丢。后续立即实现 `RealLocalMaterialAdapter` + `FeaturePersistence` + 启动加载（已在 05-15 当日启动，见 S012）
2. **Runtime 真实能力** — serial/TCP 连接仍为 mock，帧发送没有真实串口，任务调度是内存 stub，SCOE 命令是空壳，routingTick 闭环未跑起来
3. **已知技术债** — 12 个 known-gap 测试（7 reconnect + 4 expression + 1 bootstrap）；variableProvider 为 noop
4. **可视化 UI** — display feature 数据层已就位，缺 ECharts 渲染组件（星座图 + 波形图）
5. **Receive 页面** — 接收数据展示页面尚未设计/实现
6. **6 个页面都是 UI 骨架** — 页面可操作但数据通路未接真实能力，需 runtime bootstrap + 真实串口/TCP 接入 + 端到端联调后才有实际数据流
