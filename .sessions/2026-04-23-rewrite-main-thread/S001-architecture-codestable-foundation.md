# [S001] 架构边界锁定与 CodeStable 体系建立

> 2026-04-23 ~ 2026-04-28 | 设计阶段 | 已完成

## 目标

在旧系统代码基础上建立全面重写的架构基线，锁定目录结构、feature 归口、Electron 边界和质量红线，为后续逐功能域实现提供可执行的正式合同。

## 记录

### 1. 为什么要 rewrite：问题诊断与决策基础

旧系统功能可用但维护困难，核心问题已通过代码热点分析和架构边界文档确认：

- **跨 store 写入**：`receiveFramesStore` 同时处理输入队列、SCOE 短路、解析结果、表达式计算、统计、触发条件检查，并把 `DataItem[]` 推给 `sendTasksStore`。一个 store 承载了至少三个能力域的职责。
- **main 进程业务化**：网络接收主路径中内嵌高速存储分流逻辑（`networkHandlers`），main 承担了应由 renderer 侧 feature 归口的领域判断。
- **preload 暴露面过宽**：旧 preload 聚合 `window/menu/serial/network/files/receive/highSpeedStorage/historyData/timerManager` 等 API，通过 `window.electron` 直连 renderer。
- **全局状态穿透**：`useUnifiedSender` 发送成功后跨 store 更新统计，并硬编码 SCOE UDP target 特判。发送相关 UI 组件直接创建并启动 task 状态机。
- **shared/common 边界不清**：`src/utils` 和 `src/api/common` 混入大量业务逻辑和重复工具函数。

决策：目标不是整理旧代码，而是保留旧系统可观测业务行为和页面入口，但完全重建代码组织、模块边界和 Electron 暴露方式。旧代码组织、全局状态穿透、模块耦合和 Electron 暴露方式不保留。

这一决策记录在 `codestable/compound/2026-04-28-rewrite-execution-charter.md` 中，作为后续所有重写讨论的总入口。

### 2. CodeStable 体系建立

建立了 `codestable/` 作为长期工程规则和设计工件的主承载目录，替代旧 `refactor/docs` 和 `easysdd` 作为重写主线。体系结构：

| 目录 | 职责 |
|------|------|
| `architecture/` | 目标目录结构、依赖方向、状态归口、Electron 边界、feature 边界 |
| `compound/` | 跨域整合文档（execution charter、northbound gap map、scope preserve） |
| `features/` | 单 feature design / checklist / acceptance |
| `issues/` | issue report / analysis / fix-note |
| `quality/` | 质量红线、review checklist、前端规范、前端自检 checklist |
| `reference/` | 速查卡、会话交接模板 |
| `roadmap/` | 大需求拆解和跨 feature 规划 |

来源文档（`refactor/docs` 和 `easysdd`）定位为历史输入、甲方材料和 baseline 来源；新增重写主线文档默认放到 `codestable`。

### 3. Feature 归口锁定

通过 `rewrite-target-structure.md` 和 `rewrite-execution-charter.md` 锁定以下功能归口：

| Feature | 归口 |
|---------|------|
| `frame` | 帧资产、字段编辑、校验、序列化、导入导出、旧 JSON 迁移入口 |
| `connection` | 串口/TCP/UDP 连接模型、连接实例、连接状态、target 路由 |
| `receive` | 输入字节流承接、帧匹配、字段解析、表达式输入、接收结果输出 |
| `send` | 单帧发送全链路、发送队列、target 落地、发送统计 read model |
| `task` | 通用执行引擎（step 序列执行、错误处理、进度追踪）、多态 step |
| `scoe` | SCOE 协议、命令解析、完成条件、SCOE 领域状态和静态资产 |
| `storage` | 本地持久化、历史记录、CSV、高速存储、迁移脚本 |
| `settings` | 设置模型、默认值、持久化 |
| `status` | 状态指示、健康状态、状态视图 |
| `display` | 展示偏好、表格/图表/星座图 projection、UI-safe snapshot |
| `result` | 内部结果事实、结果归因和聚合规则 |
| `report` | 报告对象和报告文件生成 |
| `northbound` | 中心协同接入、对外投影、对外交付、外部错误语义转换 |

每个 feature 的"拥有什么"和"不得拥有什么"均已显式列出。feature 之间只通过公开 service、runtime 编排、显式事件或边界输入输出交互。

### 4. Electron 边界锁定

重写默认配置固定为：

```ts
nodeIntegration: false
contextIsolation: true
sandbox: false
```

做了什么：
- 早期桌面能力文档（`boundary-desktop-capability-access.md`）讨论过受控开启 `nodeIntegration` 的备选方案。本轮决策收紧为上述配置。
- `platform/` 作为 renderer 侧桌面能力的唯一正式入口。
- preload 只暴露 typed API，不暴露裸 `invoke/send/on`。
- main 只承接平台资源访问和生命周期，不承载 receive/send/SCOE/task/report 领域规则。
- main 可以做平台侧缓冲、批处理、聚合、节流、队列和背压，但业务运算、协议语义、任务状态推进仍归口到可测试 TypeScript 层。

为什么：旧系统 main 进程业务化、`window.electron` 直连是最大的维护灾难。所有旧证据（preload 聚合、main business handlers、跨 store 副作用链）都指向这个根因。

### 5. 质量红线制定

`rewrite-quality-rules.md` 定义了 16 条硬规则（R1-R16），每条用 MUST/MUST NOT 二分法表述。核心红线：

| 规则 | 要点 |
|------|------|
| R1 | 保留行为，替换结构。不因代码脏砍功能 |
| R2 | Feature 归口显式，禁止跨 feature 内部写入 |
| R3 | Core 逻辑必须可测试 TypeScript，不依赖 Vue/Electron |
| R4 | UI 不是业务流程 owner |
| R5 | Electron 能力边界必须窄 |
| R7 | 运行主状态单一 owner |
| R8 | Receive/Send 主链保持显式输入输出 |
| R9 | SCOE 必须作为声明的领域例外 |
| R10 | Northbound 必须是边界层，不是 feature 快捷方式 |
| R11 | Result/Report/Delivery 三者必须分开 |
| R12 | 旧 JSON 兼容不得污染新模型 |
| R13 | 统计不得写回源模型（frame definition） |

反模式清单列出了 15 种默认判为质量问题的代码模式，来源于旧系统实际踩坑证据（如 `receiveFramesStore` 职责过宽、`useUnifiedSender` 硬编码 SCOE 特判、UI 组件直接创建 task 状态机等）。

### 6. 重写审查体系

`rewrite-review-checklist.md` 建立了四档审查结论：

| 结论 | 含义 |
|------|------|
| `pass` | 范围、边界和验证证据均满足 |
| `pass-with-known-gaps` | 语义已锁定，runtime/hardware 证据未完成但已登记 |
| `revise-required` | 边界、范围或验证有问题 |
| `blocked` | 缺关键决策、口径或 baseline，不能继续 |

每轮审查必须列出 `Direct contract` 和 `Boundary guards`，不得用 handoff、摘要或临时 prompt 替代正式合同。

### 7. 前端 UI 规范

`rewrite-frontend-conventions.md` 覆盖 12 个维度，核心规则包括：
- Quasar 组件优先，不引入第三方 UI 库
- 颜色只用 semantic-colors token 或 Quasar brand 色，禁止硬编码
- 大列表开虚拟滚动，列定义抽到 `columns.ts`
- 表单用 QForm + Quasar 组件，超过 20 字段拆子组件
- 弹窗宽度用语义 class（`rw-dialog-sm/md/lg/xl`）
- 高频数据必须缓冲后批量刷新（rAF 16ms）
- 大数组用 shallowRef 整组替换
- 异步操作统一走 `useAsyncAction()` composable
- 轮询统一走 `usePolling()` composable

### 8. 架构探索前置工作（04-23 ~ 04-24）

在正式锁定架构之前，完成了以下探索和分析：

- `2026-04-23-scoping-capability-domains-and-core-modules.md`：能力域与核心模块范围界定，基于 04/05/06/07 架构文档和代码热点分析。确定以边界语言收口，不把代码热点直接升格为正式能力域。
- `2026-04-23-explore-task-system-module-overview.md`：任务系统模块探索。
- `2026-04-23-feature-to-architecture-mapping-pass.md`：Feature 到架构映射的第一轮校验。
- `2026-04-23-spike-capability-domain-current-code-map.md`：能力域到当前代码的映射 spike。
- `2026-04-24-project-quality-conventions-system-analysis.md`：项目级质量规范体系前置分析，确定可借的是文档体系结构（阶段门禁、硬规则/经验规则、Evidence/Inference/Candidate rule 格式），不能借的是具体技术栈内容。

### 9. 推进方式决策

`rewrite-execution-charter.md` 的第 4 节明确了推进方式：不按"很窄切片、小修小补"推进，也不同时改所有东西。顺序是：

1. 先锁业务语义和质量边界
2. 再锁目录归口和运行主状态归属
3. 再按功能域批量重写
4. 每个功能域完成后留下 oracle、fixture、manual checklist 或 runtime validation 证据

建议的功能域顺序：frame/storage/settings -> platform/connection -> receive/send/task -> SCOE -> status/result/report/northbound。

### 10. Northbound 独立定位

northbound 在本轮被明确为独立边界 feature，不等同于旧 send task、旧 history/CSV、旧 serial/network target。关键决策：
- `deviceId` 是业务设备身份，不是串口/网口 target
- `setTestTask` 是甲方外部任务下发，不是旧本地 send task
- result/report/delivery 三者必须分开：内部结果事实、报告对象生成、HTTP/FTP 对外交付分别归口
- 旧 history/CSV/本地文件导出只能作为报告素材或 oracle 材料

这些决策基于 `2026-04-28-northbound-overlap-and-gap-map.md` 的分析。

## 后续

- 04-29 起进入七大基础 feature（frame/settings/storage-local-baseline/connection/receive/status/display）的实现
- 一期 northbound 最小业务闭环语义仍需确认
- 功能域重写顺序需确认
- Send/Task/SCOE 统一执行引擎的设计尚未开始
- 真实串口/TCP/UDP/SCOE 硬件验证未开始
