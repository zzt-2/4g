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
- rewrite UI 样式以 Quasar + `rewrite/src/css` SCSS token 为主系统；颜色、背景、状态色、边框、阴影、间距、圆角、z-index 和字体层级必须先归口到 token，业务组件、页面、widget、UnoCSS class 和 inline style 不得硬编码这些视觉 token。
- Quasar 官方组件 prop 和 helper class 可作为 Quasar token scale 使用，例如 `color="primary"`、`q-pa-*`、`row/col`、`text-h*`、`shadow-*`；app-specific surface、selected、device/status 等视觉语义仍必须写语义 class 并消费 token。
- UnoCSS 只允许承担结构性布局 utility 和 token-backed shortcut，不作为业务样式主系统；组件 class 按 app/page/widget/feature ownership 使用语义化命名，跨页面通用 visual utility 只能进入 token-backed `.rw-*` 基线类。
- `rewrite/src/css/tokens/*` 是 primitive 视觉值的唯一落点；新增颜色、间距、尺寸、字体层级、边框、圆角、阴影或 z-index 时，必须先扩展 token，再通过 `--rw-*`、Quasar brand/helper 或语义 class 消费。`app/pages/widgets/features/*/components`、`uno.config.ts` 和 inline style 不得新增裸 hex/rgb/hsl/px/rem/em 视觉值。
- 涉及 rewrite UI 样式实现或审查时，完成前必须静态扫描 app/pages/widgets/feature components/UnoCSS 配置中的硬编码视觉值和 Uno 视觉 utility；样式入口、Quasar config、token 或 UnoCSS config 变更后至少运行 `pnpm -C rewrite lint`，触达构建入口时运行 `pnpm -C rewrite build`。

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
