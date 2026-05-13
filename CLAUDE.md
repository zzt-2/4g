# 东方红上位机重写

## 会话入口

新对话开始时先做 **Lane 判定**，再决定走快速修复、单 feature 流程还是 roadmap 流程。Lane 判定只负责复杂度和流程选择，不自动触发任何 runtime。

### Lane 判定

- **Lane A: Fastforward**
  - 需求清晰
  - 不跨模块
  - 改动小
  - 验证路径短
- **Lane B: Single-thread Disciplined**
  - 需要设计、实现、验收闭环
  - 单对话仍能稳定持有上下文
  - 不需要大需求拆解
  - 不需要跨对话交接
- **Lane C: Roadmap-Oriented**
  - 需求大到不能塞进单个 feature
  - 需要拆成多个可独立验收的 feature
  - 需要依赖关系、全局状态或跨对话交接

默认流程：

- Lane A：走 `cs-feat-ff` 或 issue 快速修复通道。fastforward 不写完整 spec，只做必要知识检索、小改实现和短验证。
- Lane B：走 CodeStable 单 feature / issue 标准流程。
- Lane C：先走 `cs-roadmap` 形成 `codestable/roadmap/{slug}/{slug}-roadmap.md` 和 `{slug}-items.yaml`，再让每个 item 进入单 feature 流程。

如果当前环境没有安装同名 `cs-*` skill / runtime，仍按同名流程在 `codestable/` 下手工推进，并在回复里说明没有调用到真实 skill。

## CodeStable 主骨架

`codestable/` 是本项目长期工程规则、设计工件、roadmap、feature、issue 和沉淀文档的主承载。`.sessions/` 只在需要跨对话交接、多轮讨论过程记录或 handoff 时使用。

### 三类真相源

| 类型 | 主路径 | 作用 | 不承载什么 |
| --- | --- | --- | --- |
| 对话过程记录 | `.sessions/` 下的 session note / topic-index / handoff | 记录过程、决策脉络、交接上下文 | 长期 feature / issue / architecture 正式工件 |
| 长期工程规范 / 设计工件 | `codestable/architecture/`、`codestable/features/`、`codestable/issues/`、`codestable/quality/`、`codestable/compound/`、`codestable/reference/` | 长期可复用资产和正式规则 | 对话逐轮推进过程 |
| 大需求规划状态 | `codestable/roadmap/{slug}/{slug}-roadmap.md`、`{slug}-items.yaml` | 大需求拆解、依赖、接口契约、全局状态 | session note、handoff 正文、单 feature 实现细节 |

### 直接合同与边界护栏

同一轮若读取多份材料，必须显式区分：

- **直接合同**：当前轮真正据此判断能不能做、做到什么程度的唯一真相源。
- **边界护栏**：用于锁范围、术语、依赖和上下文的辅助材料。

边界护栏可以补边界，不能推翻直接合同。跨 feature / 跨线程共享的合同，优先引用单一 canonical 工件，不在多份 prompt / handoff / note 里各抄一份摘要。

## 重写主线必读

涉及东方红上位机重写的讨论、设计、实现或审查时，优先读取：

- `codestable/reference/session-handoff-templates.md`（会话交接模板，开新对话前先看对应模板确定上下文和子 agent 策略）

- `codestable/compound/2026-04-28-rewrite-execution-charter.md`
- `codestable/architecture/rewrite-target-structure.md`
- `codestable/quality/rewrite-quality-rules.md`
- `codestable/quality/rewrite-review-checklist.md`

涉及任何 UI 页面、组件、样式的讨论、设计或实现时，**必须**在动手前完整阅读以下两份规范，不允许跳过、略读或凭记忆：

- `codestable/quality/rewrite-frontend-conventions.md`（前端 UI 规范 — Quasar 组件、表格、表单、弹窗、布局、颜色、数据展示、性能）
- `codestable/quality/rewrite-frontend-checklist.md`（前端自检 checklist — 逐条勾选）

违反该规范的代码不得合入。设计文档产出后必须附规范合规检查结果。

涉及 northbound / 甲方协同 / result / report / file delivery 时，额外读取：

- `codestable/compound/2026-04-28-northbound-overlap-and-gap-map.md`
- `codestable/compound/2026-05-07-runtime-next-phase-global-planning.md`（下一阶段实施规划、模块拆分、波次策略）

涉及 SCOE、高速存储、真实串口、TCP/UDP、打包态 data path、HTTP/FTP 交付时，必须查对应 architecture、compound 或旧系统事实材料；不能凭印象规划或实现。

## 重写总原则

- 保留旧系统可观测业务行为和页面入口。
- 不保留旧代码组织、全局状态穿透、跨模块耦合和旧 Electron 暴露方式。
- 旧 JSON、历史数据、CSV、旧任务形态等只能作为迁移输入、oracle 或兼容候选，不污染新核心模型。
- 旧代码事实可作为证据，但不能自动升级为新系统架构。
- 甲方 northbound / result / report / file delivery 是独立边界，不用旧 send task、history、CSV、serial/network target 直接等价替代。

## 模块归口与命名

- 旧 SCOE 不再作为独立模块。外部系统命令（SCOE TCP 协议、新甲方 HTTPS 接口）统一通过"指令接入"feature 接入，独立于 receive 路径。
- 帧定义全局唯一。任何模块不得维护独立帧列表或独立帧实例管理，所有帧操作通过 frame feature 的 public API。
- 表达式引擎归口 `shared/`，是纯 TypeScript 纯函数。零 Vue/Pinia/Electron 依赖，零 store 依赖，全部变量由调用方外部传入。支持预编译和依赖排序。
- 条件匹配分两层：匹配逻辑归 `shared/` 纯函数（事实 + 条件 → 是否匹配），触发行为归各 feature 自己管理。不建统一事件总线。
- 存储和可视化是独立 feature，receive 只是调用方，不拥有存储逻辑和可视化逻辑。

## Selector 不可变约束

- feature selector 返回值必须为只读快照（`readonly` 类型 + 深拷贝或冻结对象），禁止返回内部可变引用。
- 消费方不得通过 selector 返回值反向修改 owner feature 内部状态。

## Electron 与平台边界

重写默认配置：

```ts
nodeIntegration: false
contextIsolation: true
sandbox: false
```

硬规则：

- renderer 不直接访问 Node、Electron、`ipcRenderer`、`fs`、`path`、`net`、`serialport`。
- preload 只暴露 typed API，不暴露裸 `invoke/send/on`。
- renderer 通过 `rewrite/src/platform` facade 访问桌面能力。
- main process 主要负责平台资源访问和生命周期，例如串口、网络、文件、路径、窗口、系统对话框、应用生命周期、HTTP/FTP 传输。
- main process 可以承接与平台资源绑定且性能压力明显的高频数据缓冲、批处理、聚合、节流、队列和背压。
- main process 不承载 receive/send/task/SCOE/result/report/northbound 的领域规则，不承载业务运算、协议语义、任务状态推进或报告语义。
- 性能问题优先通过数据流设计、批处理、缓冲、队列、背压、采样和事件压缩解决；不能为了减少 IPC 把业务逻辑塞进 main。

任何 main 进程边界例外都必须说明：

- 为什么 renderer / TypeScript core 无法合理承载。
- main 中只保留了哪些平台侧或性能侧处理。
- 业务语义最终在哪里归口。
- 如何测试、压测或手工验证。

## 目录与职责

目标结构以 `codestable/architecture/rewrite-target-structure.md` 为准：

```text
rewrite/
  src/
  src-electron/
    main/
    preload/
```

`rewrite/` 是新的独立应用根目录，不只是源码目录。旧 `src/`、`src-electron/`、`public/` 只作为旧系统 evidence、oracle 或 migration input，不作为新代码落点。

renderer 源码结构：

```text
rewrite/src/
  app/
  platform/
  shared/
  features/
  runtime/
  pages/
  widgets/
```

基本职责：

- `app/`：应用启动、路由、布局壳、全局 provider、生命周期装配。
- `platform/`：renderer 侧平台 facade，唯一正式桌面能力入口。
- `shared/`：纯 TypeScript 工具函数和类型。零 feature 依赖，零 Vue/Pinia/Electron 依赖。任何 feature 可 import shared，shared 不 import 任何 feature。
- `features/`：按业务能力归口领域规则、应用服务、状态和领域内 UI。
- `runtime/`：应用级装配、跨域编排、边界例外登记，不承载领域内部规则。
- `pages/`：路由页面、页面级布局、连接用户操作到 runtime / feature 公开入口。
- `widgets/`：跨页面 UI 组件和纯展示组件。

核心规则必须放在可测试 TypeScript 层。`features/*/core` 不依赖 Vue、Pinia、Electron、platform facade、全局 store 或 Node 能力。

基础设施基线：

- `rewrite/` 下配置必须重新收缩，不能原样搬旧 Quasar boot、旧 `src/api/common`、旧 `window.electron`、旧 preload 聚合、旧 main business handlers 或旧 `public` data path。
- Vitest 是 core/service/adapter/selector 默认单测栈；页面交互先走 manual checklist。
- Electron runtime、打包态 package、真实串口/TCP/UDP/SCOE 硬件和 customer validation 不由 Vitest 代替。
- 默认保持显式 import；如后续引入 auto-import，只允许 Vue、Vue Router、Pinia 等基础框架 API，禁止自动导入 feature service、platform facade、runtime、store、feature public API、adapter 或带业务 owner 的 helper。
- rewrite UI 样式职责划分：UnoCSS 负责所有结构性布局（间距、flex、grid、display、position、sizing），SCSS/CSS 只负责复杂的、需要复用的组件级样式（动画、伪元素、复杂选择器、语义 class）。
- UnoCSS theme 中的 spacing scale 映射到与 `--rw-space-*` 相同的设计值，确保 `gap-3` 和 `var(--rw-space-3)` 视觉一致；spacing token 值在 `uno.config.ts` theme 中维护，不再要求组件 `<style>` 中用 `var(--rw-space-*)` 做间距。
- 颜色、背景、状态色、边框、阴影、圆角、z-index 和字体层级仍归口到 `rewrite/src/css/tokens/*`；这些视觉值通过 `--rw-*`、Quasar brand/helper 或语义 class 消费，不得硬编码裸 hex/rgb/hsl/px/rem/em 值。
- Quasar 官方组件 prop 和 helper class 可正常使用（`color="primary"`、`text-h*`、`shadow-*`）；app-specific surface、selected、device/status 等视觉语义仍必须写语义 class 并消费 token。
- 涉及 rewrite UI 样式实现或审查时，完成前必须静态扫描 app/pages/widgets/feature components/UnoCSS 配置中的硬编码视觉值；样式入口、Quasar config、token 或 UnoCSS config 变更后至少运行 `pnpm -C rewrite lint`，触达构建入口时运行 `pnpm -C rewrite build`。

## CodeStable 推进规则

### Lane C

Lane C 不使用旧 slice 体系。全局拆解、依赖和状态只放在：

- `codestable/roadmap/{slug}/{slug}-roadmap.md`
- `codestable/roadmap/{slug}/{slug}-items.yaml`

每个 roadmap item 启动后，按单 feature 流程推进：

1. `cs-feat-design`：读取 roadmap item 和相关合同，产出 feature design/checklist。
2. `cs-feat-impl`：按 feature design/checklist 实施。
3. `cs-feat-accept`：验收后回写 roadmap item 状态。

实施中重新出现开放分歧、接口契约不成立、依赖顺序错误或代码现实冲突时，回到 `cs-roadmap update` 或当前 feature design 阶段，不在实现阶段临场扩大边界。

### 实施对话

实施以单 feature 或单 issue 为单位。若来自 roadmap，当前 feature 的直接合同是：

- 对应 roadmap item。
- 当前 feature 的 `{slug}-design.md`。
- 当前 feature 的 `{slug}-checklist.yaml`。

若存在 handoff，handoff 只补充跨对话上下文和边界，不能推翻上述直接合同。

每轮实施和审查开头必须列出：

- `Direct contract:` 当前轮真正据此判断范围和完成度的正式工件。
- `Boundary guards:` 只用于补边界、术语和上下文的辅助材料。

未列出直接合同，或把 handoff、摘要、临时 prompt 当成正式合同，不能进入实现结论。

### 审查对话

独立审查只看直接合同、边界护栏和实际改动，不依赖实施过程讨论。审查结论按 `rewrite-review-checklist.md` 使用：

- `pass`
- `pass-with-known-gaps`
- `revise-required`
- `blocked`

`pass-with-known-gaps` 只用于语义已锁定但 runtime/hardware/customer 环境证据尚未完成的情况。缺少用户决策、甲方口径、关键 baseline、直接合同、northbound 语义或阻断性 schema/枚举时，结论必须是 `blocked`。

### 过度设计审查

审查不仅是查错，还要评估设计的**位置和形状**是否在整条链路中合身。逐项检查：

- **上游消费方式**：该模块消费了什么，从 shared 拿还是从 feature public API 拿，粒度是否刚好。
- **下游需求匹配**：哪些模块会消费该模块，它们真正需要什么粒度的 API，当前暴露的 surface 是多了还是少了，边界画在这下游用起来会不会别扭。
- **驱动需求真实性**：设计回应的是具体需求，还是"可能的需求"或"别人的需求"。
- **链路位置优化**：有些逻辑放在这里也行、放在 shared 也行、放在消费方也行——当前位置是否最合适。有没有本该在 shared 的东西写进了 feature，或本该归消费方管理的逻辑被该模块代劳。
- **跨模块一致性**：同类问题的解法在不同模块间是否一致。如果 send 这么做、receive 那么做，shared 层是否缺了统一能力。

核心判断：**这个设计在整条链路里，形状对不对、位置对不对、和上下游的接口合不合身。**

### 代码精简审查

过度设计审查关注设计层面的形状和位置；代码精简审查关注实现层面每一行是否在增值。实施完成前或大规模重构后，应逐 feature 检查：

- **层间增值**：每个文件/函数是否存在理由明确。如果删掉它、把逻辑搬到调用方或被调用方，代码会更短还是更长。更短 → 可能是不必要的分层。
- **死 surface**：public API（index.ts export）中是否有其他文件实际 import 的。导出了但无人消费的函数/类型/常量应删除或降为内部。
- **传递函数**：函数体只有 `return otherFunc(...)` 的透传函数，是否在增值。如果只是换了个名字，调用方可以直接用底层函数。
- **重复模式**：同一模式在 2+ feature 中独立实现（如 clone、selector 投影、CRUD 样板），是否该提取到 shared。
- **过度抽象**：interface/factory/strategy 只有一个实现时，抽象是否有回报。如果只有一个 concrete 实现，直接用具体类型或函数。

核心判断：**这一层/这个函数/这个 export 挣到了它的位置吗？**

### Service Readiness Audit（UI 页面设计前置）

Feature 通过验收 ≠ UI-ready。Feature 的 public API 是给其他 feature 消费的（runtime 装配、bridge 调用），UI 页面的消费模式不同（CRUD 表单、dirty tracking、字段级校验、可编辑副本）。

设计 UI 页面前，必须对页面上每个用户操作做 service readiness 审计：

1. 对应的 service method 是否存在
2. method 签名的输入输出是否和 UI 表单/展示对齐
3. 操作是否有副作用需要 UI 管理（如 connect 不是原子的、save 需要先 validate）
4. selector 返回的类型是否包含 UI 展示需要的全部字段
5. 是否需要 read-for-edit（从只读 selector 拿到可编辑副本的路径）

审计产出：service gap 清单（"UI 需要但 service 不提供"的操作），作为 design 的前置条件列入 checklist，不在实施时才打补丁。Service readiness 审计发现需要改动时，合并同一 feature 的其他待改项（简化、重构、类型对齐）一起执行，不拆多轮。

### Brainstorm 规则

- brainstorm 完成后必须暂停，等用户审阅确认后再进入 design 阶段；不在同一轮内自动推进到 design
- brainstorm 阶段**一定要检查**：
  - 每个"应该可以"的假设 → 找新系统代码证据
  - 入站/出站数据流 → 实际 API 签名和调用链
  - 状态依赖和前置条件 → 哪些操作有门控
  - 生命周期边界 → 创建、运行、完成、失败、断开
  - 跨 feature 交互 → 真正的 API，不是想象中的 API
  - 跨 feature 标识对齐 → 当前 feature 的标识模型是否与上游（数据来源）和下游（消费方）对齐；同一概念是否在不同 feature 中有不同名称；是否存在不必要的映射转换层（如本该 pass-through 但做了字段重命名）

## shared/ 提取规则

- `rewrite/src/shared/` 只放纯 TypeScript 工具函数。零 feature 依赖，零 Vue/Pinia/Electron 依赖。
- 任何 feature 可 import shared，shared 不 import 任何 feature。
- **提取条件**：同一模式在 2+ feature 中出现，或明确是跨 feature 的基础能力（比较算子、定时器、格式化）。
- **不放 shared**：业务逻辑、状态、领域类型、feature 间的交互契约。
- 新 feature design 时，必须显式检查：
  1. `shared/` 已有什么可以直接复用
  2. 正在设计的模式是否与其他已有 feature 的模式相似
  3. 如果相似，是提取到 shared 还是让一个 feature 依赖另一个的 public API

## 实施前检查

进入代码实施前，必须明确：

- 当前轮直接合同是什么。
- 覆盖哪些旧系统可观测行为。
- 涉及哪些 feature 归口。
- 外部是否只通过明确 public API 访问 feature。
- 是否涉及 Electron/preload/main API。
- 是否涉及 northbound、SCOE、高速数据、旧 JSON 迁移或 report delivery。
- 哪些行为可自动 fixture，哪些只能手工 checklist，哪些必须 runtime / hardware validation。

不写业务代码的规则整理、文档收口和只读分析，可以只说明读取证据和判断依据，不强制进入 feature 实施流程。

## 验证与完成声明

代码实现完成前必须提供验证证据。默认执行：

```bash
pnpm build
pnpm lint
```

如果是纯文档或规则修改，可以不运行 build/lint，但必须说明未运行原因。

涉及真实串口、TCP/UDP、SCOE 设备、打包态 data path、HTTP/FTP northbound 交付时，静态测试只能声明“静态分析通过”或“fixture 通过”，不能声明硬件链路、打包链路或甲方闭环完成。

实施摘要必须包含：

- `Changed files:` 改了什么文件、改了什么。
- `Verify evidence:` 跑了什么验证命令、结果是什么。
- `Open issues:` 还有什么未决问题；没有则写 `none`。

## 子 agent 调度

代码阅读、文件扫描、事实调查类任务优先判断是否适合子 agent。主对话负责目标、边界、集成结果和最终判断；子 agent 只接收边界清楚、可验证、可并行的任务。

中等以上任务：

- 讨论阶段积极派 explore agent 并行检索相关代码和文档。
- 执行阶段有多个独立任务时拆给 executor 子 agent 并行。
- 验证阶段尽量由独立 verifier / code-reviewer 做，不自审自验。

小任务默认主线程完成；如果子 agent 能更快获得独立事实或低成本复核，可以派轻量子 agent。

## `.sessions/` 轻量过程层

`.sessions/` 只在确有需要时使用：

- 跨对话交接。
- 多轮讨论过程需要保留。
- 需要 topic-index 帮助定位上下文。
- handoff 能显著降低下一轮误读风险。

`.sessions/` 不承载 CodeStable 正式工件，不维护全局状态板，不默认生成 slice 文件。写入前先检查同专题已有 note / handoff，能引用就不重复复制。

## 禁止事项

- 不因为旧代码质量差就否定旧可观测业务行为。
- 不把旧代码组织、旧 store、旧 IPC 暴露方式复制成新架构。
- 不把业务运算、协议语义、任务状态推进、报告语义塞进 main process。
- 不暴露裸 IPC，不让 renderer 直接访问 Node / Electron 能力。
- 不把 northbound task 等同旧 send task。
- 不把 northbound deviceId 等同串口/网口 target。
- 不把 history / CSV / 本地文件导出等同 TestReport 或 file delivery 闭环。
- 不为还没确认的甲方 schema、字段、枚举、错误码写长期契约。
- 不把 session note 当成正式 feature / issue / architecture 工件。
- 不再使用旧 workstream / slice 体系。
- 不按单文件/单函数把同类改动拆成独立任务；应按能力边界合并执行，减少上下文切换。
- 旧 SCOE 独立帧列表、独立条件系统、硬编码协议识别不得复制到新系统。
- 旧表达式引擎的 store 依赖和并行计算模式不得复制到新 shared/ 表达式引擎。
