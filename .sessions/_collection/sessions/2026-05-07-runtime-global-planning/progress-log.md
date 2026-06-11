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

## 2026-05-15 UI 审计 + 对标修复

### 已完成

**UI 静态审计修复（47 项）**
- 跨页面共性：min-height/quasar spacing/media padding 统一
- P0 功能缺陷：任务/发送编辑弹窗加 QForm、CI 高亮弹窗 @hide 清理
- P1 规范违规：$q.notify→useNotify、v-model 修正、StatusBadge 统一、useStableKeys、校验规则、loading 按钮
- P2 性能优化：v-show→v-if、模板内联 .map()→computed、预计算到 row 数据

**设计文档对标修复（2 组对话）**
- 帧域+连接页面（Connection/FrameList/FrameEditor）对照 pages-frame-connection-design.md 修复
- 任务+发送+指令页面（Send/TaskManage/CommandIngress）对照 pages-task-send-command-design.md 修复

**Side bar + Icon 修复**
- 侧边栏补全 6 项导航
- material-icons-outlined 添加，o_ 前缀 icon name 修正

**Service 完成度确认（调查结果）**
- 10 个 feature service 层全部 100% 完整实现，零 stub/TODO/空壳
- display feature 已含星座图（projectScatter）和波形图（projectChartSeries）数据投影层
- 缺的是 UI 渲染组件（ECharts），不是后端逻辑

### 发现的问题

**P0 Bug：SendPage 帧列表始终为空**
- `SendPage.vue` 第 41 行 `direction: 'o_send'` 应为 `'send'`
- 第 578 行 FieldEditWidget 同样问题
- 新建帧默认 direction 为 `'receive'`，用户不改方向不会出现在发送列表

**P0 架构缺口：零持久化**
- 所有 feature state 是 JS 内存闭包，进程退出数据全丢
- storage-local-baseline 设计文档已完成（draft），真实文件 adapter 未实现
- platform/files.ts 的 FileFacade 已实现但无消费者
- 属于 Wave 5，排期在 runtime bootstrap 之后

### 未完成（更新）

**Runtime 真实能力（最高优先级）**
- Bootstrap 补完（AppShell adapter 选择 + routingTick 定时驱动）
- 真实串口/TCP 接入
- 端到端联调

**存储持久化**
- 真实 LocalMaterialAdapter（通过 FileFacade 写文件）
- AppShell 启动时加载持久化数据（帧定义、连接配置、任务模板）
- storage-real 从 draft 推进到 impl

**可视化 UI**
- 星座图 ECharts 渲染组件（数据层已就位）
- 波形图 ECharts 渲染组件（数据层已就位）

**Receive 页面**
- 接收数据展示页面尚未设计/实现

**已知技术债**
- 12 个 known-gap 测试（7 reconnect + 4 expression + 1 bootstrap）
- GS1: JSON 持久化为内存态 stub（与持久化缺口重叠）
- GS2: variableProvider 为 noop

## 2026-05-18 甲方对接闭环讨论

### 背景

拿到甲方 V1.0.1 接口文档（31 个 HTTPS 接口），需要确认"甲方控制我们任务、我们回传结果"的链路是否闭环。
专题记录：`.sessions/2026-05-18-northbound-integration/`

### 已拍板决策

**核心映射**
- 甲方 testCase = 我们的 task（TaskDefinition），不是帧，不是独立用例实体
- setTestTask 的 testCaseInfo[] 每项 → 一个 task 实例
- task 典型 steps = send step（发帧）+ wait-condition step（等接收帧校验参数）
- verdict 映射：wait-condition matched → success，timeout/不匹配 → fail，被 stop → tbd

**MVP 接口（6 个）**
- setTestTask（甲方→我们）：下发任务
- controlTestTask（甲方→我们）：abort/pause/continue/stop 直接映射 task lifecycle
- testCaseResultReport（我们→甲方）：task 终态 verdict 翻译上报
- msgReport（我们→甲方）：步骤进度实时上报（缺 step 事件驱动，需补）
- heartbeat（甲方→我们）：心跳响应
- getSubSysState（甲方→我们）：状态查询响应

**架构决策**
- HTTPS server 放 main process（传输层），业务逻辑在 renderer，IPC bridge 通信
- northbound 做独立 feature，不合并到 command-ingress
- 翻译层在 northbound feature 内（inbound-translator + outbound-translator）
- executionPlan 按顺序执行（不做并行），parallel=true 层 = 多 task 实例同时运行

**不做的**
- 测试数据文件（testDataFileTranslationComplete）
- 精细测试报告（checkPoints 详细对比、statisticsItems 等）
- 用例库管理（CRUD、菜单树）
- FTP 文件上传（getTestCaseAll 的 FTP 暂不实现，待确认）

### 确认缺失（需实现）

| 缺失 | 影响 | 改动范围 |
|------|------|---------|
| step 级事件通知 | msgReport 无驱动源 | task 执行循环加回调 hook |
| HTTPS outbound client | 无法向甲方 POST 数据 | platform facade 新增 |
| FTP 上传 | getTestCaseAll 文件上传无通道 | platform facade 新增 |
| result 自动收集 | 需手动调 collectResult | northbound feature 接线 |

### 待验证（G2、G5）

- G2: step 名称映射 — TaskStepDefinition 有没有 name/label 字段
- G5: getTestCaseAll — 甲方 JSON 格式哪些字段必填，task 定义是否自然覆盖

### 待甲方确认（2 条）

1. setTestTask 的 immediate=false 时，后续怎么触发任务开始？
2. isEnd=false 分批下发，实际使用中是否总是一次发完？

### 下一步

- 验证 G2、G5 gap
- 进入 northbound feature design
- 同时推进：持久化、Runtime bootstrap、Receive 页面
