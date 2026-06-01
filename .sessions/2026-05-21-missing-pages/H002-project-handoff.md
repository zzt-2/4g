# 东方红上位机重写 — 项目交接文档

> 2026-06-01 | 项目 owner 交接用 | 目标读者：接手人 + AI 辅助

## 一、项目是什么

东方红上位机是一个桌面应用（Electron + Vue 3 + Quasar），用于卫星地面测试设备的数据收发、任务编排、结果显示和对外接口。

**核心能力：** 通过串口/网络接收卫星遥测数据，解析帧结构，实时显示和存储，支持定时/触发任务编排，支持外部系统（甲方）通过 HTTPS 接口控制测试流程并获取结果。

**技术栈：**
- 前端：Vue 3 + Quasar + UnoCSS + TypeScript + Pinia
- 桌面：Electron（nodeIntegration: false, contextIsolation: true）
- 测试：Vitest（1350+ tests）
- 构建：Quasar CLI + Electron Builder

**项目结构：**
```
dongfanghong/
  src/                  ← 旧系统（只做参考，不改）
  src-electron/         ← 旧 Electron（只做参考）
  rewrite/              ← 新系统（所有新代码在这）
    src/
      app/              ← 应用启动、路由、布局壳
      platform/         ← renderer 侧平台 facade（唯一桌面能力入口）
      shared/           ← 纯 TS 工具函数（零 feature 依赖）
      features/         ← 按业务能力归口的 feature 模块
      runtime/          ← 应用级装配、跨域编排
      pages/            ← 路由页面
      widgets/          ← 跨页面 UI 组件
    src-electron/
      main/             ← 主进程（平台资源、串口、网络、HTTP server）
      preload/          ← typed IPC bridge
  codestable/           ← 设计文档、质量规则、roadmap
  .sessions/            ← 跨对话过程记录
```

## 二、架构设计思路

### 核心原则

1. **Feature 归口**：每个业务能力有且仅有一个 owner feature。frame 帧定义全局唯一，connection 拥有连接管理，send 只管单帧发送，task 是通用执行引擎，receive 管接收解析，display 管可视化，storage 管本地持久化，settings 管配置事实。

2. **5 层 feature 内部结构**：core（纯 TS 类型+验证+计算）→ services（业务逻辑+状态管理）→ adapters（外部系统适配）→ state（不可变状态容器）→ selectors（只读快照投影）。

3. **Renderer/Main 边界**：renderer 不碰 Node/Electron，通过 platform facade 访问桌面能力。main 进程只管平台资源（串口/网络/文件/HTTP server），不承载业务逻辑。

4. **Selector 不可变**：所有 selector 返回只读深拷贝，消费方不得反向修改 owner 状态。

5. **shared/ 纯净**：零 feature/Vue/Electron 依赖，任何 feature 可 import shared，shared 不 import 任何 feature。

### Feature 列表与依赖关系

```
L0（无依赖）: frame, settings, storage-local-baseline
L1（需 adapter）: connection
L2（需 L0+L1）: receive, send
L3（需 L2）: task, command-ingress
独立: display, status, northbound, result
```

### Runtime 角色

Runtime 是纯 composition root（零业务逻辑），负责：
- 按依赖层级创建 feature service 实例
- 通过 bridge 连接跨 feature 数据流
- 无状态 routingTick 函数驱动数据路由
- 不建状态机、不建事件总线

## 三、已完成工作

### Feature 层（全部完成，有测试）

| Feature | 核心能力 | 测试 |
|---------|---------|------|
| frame | 帧定义 CRUD、字段管理、表达式配置 | 有 |
| settings | 配置事实管理（7→21 项扩展进行中） | 有 |
| storage-local-baseline | 本地材料管理、历史记录 CRUD、CSV 导出 | 有 |
| connection | 串口/TCP/UDP 连接管理、事件流 | 580+ |
| receive | 接收解析、帧匹配、表达式求值 | 有 |
| send | 单帧发送、目标解析 | 100+ |
| task | 通用执行引擎（send/wait-condition/delay 步骤） | 183 |
| display | 多图表实例(1-4)、投影、偏好管理 | 有 |
| status | 状态指标 | 有 |
| command-ingress | SCOE 命令解析、卫星配置管理 | 803 |
| northbound | 甲方 HTTPS 接口（4 接口框架） | 43 |
| result | 任务结果收集、verdict 判定 | 有 |

### UI 页面

| 页面 | 路由 | 状态 | 备注 |
|------|------|------|------|
| 首页 | / | 基本完成 | 指标卡片+快速入口 |
| 连接管理 | /connections | 基本完成 | — |
| 帧定义 | /frames | 基本完成 | — |
| 发送 | /send | 基本完成 | — |
| 实时显示 | /display | **需重做** | 仅旧系统 15% 功能，UX 差 |
| 任务管理 | /tasks | 基本完成 | — |
| 指令接入 | /command-ingress | 基本完成 | — |
| 系统设置 | /settings | 部分完成 | Application+Connection 已做，Display/Status/Advanced 占位 |
| 历史分析 | /history | **未做** | display 扩展已完成，UI 未做 |
| 存储管理 | /storage | **未做** | 高速存储 feature 设计+实施+UI 全未做 |

### 基础设施

- 持久化层（RealLocalMaterialAdapter + FeaturePersistence + LazyPersistence）
- 集成测试体系（36 条集测项，1350+ tests）
- 前端规范体系（conventions + checklist + quickref）
- Platform facade（transport + files + http）
- Expression engine（shared/ 纯 TS，支持预编译和依赖排序）

## 四、开发流程

### Lane 判定（所有新对话入口）

| Lane | 适用场景 | 流程 |
|------|---------|------|
| A | 需求清晰，不跨模块，改动小 | 快速修复，不需要子 agent |
| B | 需要设计+实现+验收，单对话能完成 | CodeStable 单 feature 流程 |
| C | 需求大到需要拆多个 feature | 先 cs-roadmap 拆解，再逐个 feature |

### 三波 Agent 结构（Lane B/C 对话）

每个主对话分三波：

1. **Wave 1 事实收集**（6-9 个 agent，每批 ≤3 并发）
   - 只读不写不判断
   - 读代码、读文档、读旧系统
   - 全部回来后主线程才能进入设计

2. **Wave 2 设计**（主线程）
   - 汇总事实，产出设计文档 + checklist
   - 自检前先说方案等用户确认
   - 自检使用 CLAUDE.md 框架（过度设计审查、代码精简审查、Service Readiness Audit、覆盖度检查）

3. **Wave 3 自检**（3 个 agent 并行）
   - 拿设计/实现结果对照规范检查
   - 发现问题修正后才能进入下一阶段

### CodeStable 流程

```
cs-feat-design → cs-feat-impl → cs-feat-accept
（设计+checklist） （实施）     （验收）
```

每个阶段有门槛：
- design 完成后自检通过才能 impl
- impl 前必须先读前端规范（硬门槛）
- impl 完成后 build + lint + test 必须通过
- accept 对照 checklist 逐条确认，结论 4 档（pass / pass-with-known-gaps / revise-required / blocked）

### Session 管理

`.sessions/` 目录管理跨对话过程：
- `_registry.yaml` — 全局专题注册表
- 每个专题有 `topic-index.md` + S/R/H 编号文件
- 新对话开前先查注册表，续接旧专题而非另起炉灶

## 五、当前状态

### 测试
- **1350/1351 tests passing**（1 个预存在的 connection test 间歇性失败）
- Build 通过，Lint 通过

### 未提交改动（工作树中）
有来自多个对话的未提交改动，包括 DP（显示页设计）、C（历史 UI）、D（存储设计）、E（存储实施）等。提交前需要检查。

### 已提交的关键 commits

```
5d1bd6c feat: northbound feature框架
265fc59 test: task-real Phase 2
82e412d feat: display多图表扩展
a45b263 feat: 系统设置页
8048c1d feat: 集成测试体系
fdbfa6b feat: 持久化层
```

## 六、下一步（按优先级）

| # | 对话 | 内容 | Lane | 依赖 |
|---|------|------|------|------|
| 1 | DP | DisplayPage UX 重做实施 | B | S007 设计已完成 |
| 2 | C | 历史分析 UI 实施 | B | B 的 display 扩展已完成 |
| 3 | D | 存储管理高速存储 feature 设计 | B/C | 无硬依赖 |
| 4 | E | 存储管理 feature 实施 | B | D 完成 |
| 5 | F | 存储管理 UI 实施 | B | E 完成 |

**提示词已准备**：`.sessions/2026-05-21-missing-pages/H001-conversation-prompts.md`

DP 和 C 可以并行（不同页面），D 可与 C/DP 并行。

## 七、关键决策记录

| 决策 | 原因 |
|------|------|
| Task = 通用执行引擎 | SCOE/northbound/本地 task 共用，不建独立执行器 |
| Result ≠ Report ≠ Northbound | 三层分离：内部事实/文件格式/对外交付 |
| display 不处理时序积累 | display 只管可视化偏好，时间序列数据来自 storage |
| 无状态 routingTick | runtime 保持 composition root，不建事件总线 |
| 消费者链模式 | receive 不感知下游，bridge 分发 |
| Settings 只拥有配置事实 | 配置生效归消费 feature，settings 不做 runtime |
| 高速存储 deferred | 三层架构（UI配置/主进程文件操作/网络分流）全部缺失，最复杂 |
| 北向 4 接口已定 | setTestTask/controlTestTask/testCaseResultReport/msgReport |

## 八、文档地图（AI 辅助接手必读）

### 必读（最高优先级）

| 文档 | 内容 | 位置 |
|------|------|------|
| CLAUDE.md | 项目总规则、架构约束、开发流程、禁止事项 | 项目根目录 |
| rewrite-target-structure.md | 目录结构、模块职责 | codestable/architecture/ |
| rewrite-quality-rules.md | 质量规则 R1-R18 | codestable/quality/ |
| rewrite-frontend-conventions.md | 前端 UI 规范（表格/表单/弹窗/布局/颜色） | codestable/quality/ |
| rewrite-frontend-checklist.md | 前端自检 checklist | codestable/quality/ |
| rewrite-frontend-quickref.md | 前端速查卡（composable 索引+违规清单） | codestable/reference/ |

### 设计文档

| 文档 | 位置 |
|------|------|
| 各 feature 设计 | codestable/features/rewrite-{name}/ |
| 帧定义/连接/接收/发送/任务/UI 设计 | codestable/features/ |
| 架构文档 | codestable/architecture/ |
| 系统架构/feature 边界/交互矩阵 | codestable/architecture/ |
| Northbound 设计 | codestable/features/rewrite-northbound/ |
| 设置页设计 | codestable/features/2026-05-24-settings-page/ |

### 过程记录

| 文档 | 内容 | 位置 |
|------|------|------|
| 重写主线全程 | S001-S015（架构→feature→UI→甲方） | .sessions/2026-04-23-rewrite-main-thread/ |
| 集成测试 | 36 条集测项 | .sessions/2026-05-19-integration-testing/ |
| 缺失页面规划 | 调研+设计+实施记录 S001-S007 | .sessions/2026-05-21-missing-pages/ |
| 对话提示词 | 各对话可直接粘贴的提示词 | .sessions/2026-05-21-missing-pages/H001-*.md |
| 甲方对接 | 4 接口分析+决策 | .sessions/2026-05-18-northbound-integration/ |
| 运行时全局规划 | 模块进度、技术债 | .sessions/2026-05-07-runtime-global-planning/ |

### AI 接手建议

新 AI 对话开始时，给以下指令：

```
这是东方红上位机重写项目。先读以下文件了解全貌：
1. CLAUDE.md（项目规则）
2. .sessions/2026-05-21-missing-pages/H002-project-handoff.md（交接文档）
3. .sessions/2026-05-21-missing-pages/topic-index.md（当前专题进展）
4. .sessions/2026-05-21-missing-pages/H001-conversation-prompts.md（待做对话提示词）

然后告诉我你理解了什么，有什么疑问。
```
