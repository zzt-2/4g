---
doc_type: quality
type: rewrite-validation-fixture-oracle-baseline
status: draft
date: 2026-04-30
summary: Validation, fixture, oracle, evidence, and completion-claim baseline for all rewrite features.
tags:
  - rewrite
  - quality
  - validation
  - fixture
  - oracle
---

# Rewrite validation / fixture / oracle baseline

## 1. Direct Contract

本基线的直接合同是：

- `AGENTS.md`
- `codestable/compound/2026-04-28-rewrite-execution-charter.md`
- `codestable/compound/2026-04-28-rewrite-scope-default-preserve.md`
- `codestable/architecture/rewrite-target-structure.md`
- `codestable/architecture/rewrite-system-architecture.md`
- `codestable/architecture/rewrite-feature-boundaries.md`
- `codestable/architecture/rewrite-feature-interaction-matrix.md`
- `codestable/architecture/rewrite-pre-design-gate-and-sequencing.md`
- `codestable/features/rewrite-frame/rewrite-frame-design.md`
- `codestable/features/rewrite-frame/rewrite-frame-checklist.yaml`
- `codestable/features/rewrite-settings/rewrite-settings-design.md`
- `codestable/features/rewrite-settings/rewrite-settings-checklist.yaml`
- `codestable/features/rewrite-storage-local-baseline/rewrite-storage-local-baseline-design.md`
- `codestable/features/rewrite-storage-local-baseline/rewrite-storage-local-baseline-checklist.yaml`
- `codestable/quality/rewrite-quality-rules.md`
- `codestable/quality/rewrite-review-checklist.md`
- `rewrite/package.json`
- `rewrite/vitest.config.ts`
- `rewrite/src/features/frame/core`
- `rewrite/src/features/frame/fixtures`
- `rewrite/src/features/frame/__tests__`
- `rewrite/src/features/settings/core`
- `rewrite/src/features/settings/fixtures`
- `rewrite/src/features/settings/__tests__`
- `rewrite/src/features/storage-local-baseline/core`
- `rewrite/src/features/storage-local-baseline/fixtures`
- `rewrite/src/features/storage-local-baseline/__tests__`

## 2. Boundary Guards

- Vitest 可以作为 core、service、selector、adapter 和 fake adapter 的默认单测栈。
- Vitest 不能替代真实串口、TCP、UDP、SCOE 或其他 hardware validation。
- Vitest 不能替代 packaged data path、权限、备份、清理和长期写入验证。
- Vitest 不能替代 HTTP、FTP、northbound 或 customer acceptance。
- 旧代码和旧数据只能作为 evidence、oracle 或 migration input，不能自动升级为新架构、新 schema 或长期业务模型。
- 不读取、不修改自动生成的前端 types。需要接口类型时以后端 DTO 为准。

## 3. Purpose

本文定义重写后所有 feature 必须遵守的验证基线。

目标是防止两类误判：

- 后续实现靠人工临时兜底，没有稳定 fixture、oracle、manual checklist 或 runtime 计划。
- 用静态扫描、Vitest、fixture 或 fake adapter 结果宣称硬件、打包态、HTTP/FTP、northbound 或客户闭环已完成。

本文是质量基线，不定义业务字段 schema，不规定具体 fixture 内容，也不替代各 feature design/checklist。每个 feature 仍必须在自己的 design 和 checklist 中登记实际证据、路径、验证层级和未验证项。

## 4. Evidence Terms

| Term | Meaning | Required caution |
| --- | --- | --- |
| `fixture` | 测试输入、测试用例素材或固定 expected output，可来自新构造样本或旧系统摘取样本。 | fixture 只证明样本覆盖范围内的行为，不证明样本全集完整。 |
| `oracle` | 用于判断新实现是否保留旧可观测行为或目标行为的对照基准，可以是 legacy 样本、golden output、截图、日志或客户口径。 | oracle 不是新架构 schema；旧 oracle 只能证明“旧行为曾这样表现”，不能证明旧实现组织应被继承。 |
| `legacy sample` | 从旧 `public/data`、旧 JSON、history、CSV、截图、旧运行记录或旧代码路径摘取的证据材料。 | 必须登记来源、owner feature、处理策略和 validation level，不能直接写成新核心模型。 |
| `manual checklist` | 人工检查页面入口、操作流程、视觉状态、对话框、错误提示和用户可见行为的清单。 | 不能替代协议正确性、文件权限、硬件链路或客户闭环。 |
| `runtime validation` | 在开发态应用或可运行 Electron 应用中验证生命周期、事件顺序、装配、定时器、长时间流和真实 platform facade 行为。 | 不能自动等同真实硬件、打包态安装包或客户验收。 |
| `hardware validation` | 用真实串口、TCP、UDP、SCOE 设备、高速链路或等价硬件环境验证连接、时序、吞吐、异常和完成条件。 | 不能替代 northbound/customer 语义确认。 |
| `package validation` | 用打包态应用验证 data path、权限、extraResources、长期写入、备份、清理、升级或安装环境差异。 | 不能由开发态 Electron 或 Vitest 代替。 |
| `customer validation` | 用甲方 schema、样例、HTTP/FTP 环境、回执、验收场景或客户确认验证对外交付语义。 | 缺甲方口径时必须登记 blocker，不能用内部 history/CSV/report material 代替。 |

## 5. Validation Level Taxonomy

| Level | Can prove | Cannot prove | Typical evidence |
| --- | --- | --- | --- |
| `static scan` | 文件存在性、目录归口、禁用 import、文档字段、配置项和明显边界违规。 | 运行行为、用户交互、真实 I/O、性能、硬件、打包态或客户语义。 | `rg`/`sed`/`wc` 输出、review 记录、结构清单。 |
| `Vitest unit` | node 环境下纯 TypeScript 的 core、service、selector、adapter 逻辑和确定性输入输出。 | DOM/UI、Electron runtime、preload/main、真实文件对话框、串口/TCP/UDP、SCOE 设备、打包态、HTTP/FTP、客户验收。 | `pnpm -C rewrite test` 或定向 Vitest 结果。 |
| `fixture test` | 已登记 fixture 输入下的校验、迁移、解析、构帧、状态推进、序列化和错误分支。 | 未覆盖样本、真实平台条件、样本来源完整性、硬件时序、客户闭环。 | feature 内 fixture 文件、spec 断言、expected output。 |
| `oracle comparison` | 新输出与 legacy/golden oracle 的差异，证明指定旧可观测行为被保留或被明确改变。 | 旧行为天然正确、未登记旧行为、客户新合同、硬件链路、性能上限。 | `oracles/` golden 文件、legacy sample 对照表、diff 记录。 |
| `fake adapter test` | service 面对 adapter 成功、取消、权限错误、损坏文件、路径不可写、超时等返回时的业务响应。 | 真实 platform facade、真实文件系统权限、真实 dialog、真实 transport、Electron lifecycle。 | fake adapter spec、adapter contract fixture、错误码断言。 |
| `manual checklist` | 页面入口、表单交互、按钮状态、提示、弹窗、导航、可见状态和人工可观察流程。 | 协议算法、硬件时序、打包态路径、客户验收、长期稳定性。 | checklist 勾选结果、截图、操作记录。 |
| `runtime validation` | 应用装配、启动加载顺序、运行事件顺序、timer drift、batch/backpressure、真实 platform facade 的开发态行为。 | 真实硬件、打包安装环境、客户 HTTP/FTP 接收、长期现场可靠性。 | 运行记录、dev app log、runtime checklist、压力脚本记录。 |
| `hardware validation` | 真实串口/TCP/UDP/SCOE/high-speed 链路的连接、断开、重连、时序、吞吐、timeout 和完成条件。 | 打包态路径、northbound/customer schema、客户接收确认。 | 设备信息、接线/网络环境、命令日志、收发记录、异常记录。 |
| `package validation` | 打包态 data path、权限、备份、清理、extraResources、安装路径、升级/重启后的持久化行为。 | 真实硬件协议、HTTP/FTP 客户闭环、未打包开发态行为。 | packaged app 版本、平台、路径记录、写入/恢复/清理记录。 |
| `customer validation` | 甲方 schema、字段、枚举、状态、错误/拒绝语义、HTTP/FTP 交付、TestReport、文件回传和客户确认。 | 内部 core 算法完整性、UI 交互细节、未覆盖硬件场景。 | 客户样例、接口联调记录、验收记录、确认口径和 blocker。 |

升级规则：

- 低层级证据不能自动升级成高层级完成声明。
- `fixture test` 可以支撑 implementation 继续推进，但不能宣称 `hardware validation`、`package validation` 或 `customer validation` 完成。
- `pass-with-known-gaps` 只允许用于语义和边界已锁定、未完成的 runtime/hardware/package/customer 项已登记 owner、blocker 和后续验证方式的情况。

## 6. Current Vitest Baseline

当前 `rewrite` 测试 scaffold 事实：

- `rewrite/package.json` 只有 `test: "vitest run"` 和 `test:watch: "vitest"`。
- `rewrite/vitest.config.ts` 使用 `environment: 'node'`。
- Vitest include 为 `test/**/*.spec.ts` 和 `src/**/*.spec.ts`。
- 当前未配置 `setupFiles`、coverage、DOM 环境、browser test、Electron runtime harness 或统一 fake adapter scaffold。
- 当前可见 feature 小实现试点已覆盖 frame、settings、storage-local-baseline：`rewrite/src/features/frame/__tests__/frame-core.spec.ts`、`rewrite/src/features/frame/__tests__/frame-service-state-selector.spec.ts`、`rewrite/src/features/settings/__tests__/settings-core-service-state-selector.spec.ts`、`rewrite/src/features/storage-local-baseline/__tests__/storage-core-oracle.spec.ts`、`rewrite/src/features/storage-local-baseline/__tests__/storage-fake-adapter.spec.ts`、`rewrite/src/features/storage-local-baseline/__tests__/storage-service-state-selector.spec.ts`。
- 当前 fixture 分别位于 `rewrite/src/features/frame/fixtures/frame-fixtures.ts`、`rewrite/src/features/settings/fixtures/settings-fixtures.ts` 和 `rewrite/src/features/storage-local-baseline/fixtures/storage-fixtures.ts`；尚无独立 `oracles/` 目录，现有 golden/expected output 仍在 fixture 或 spec 层。

默认规则：

- Vitest 用来测 `features/*/core`、`services`、`adapters`、`selectors` 和 fake adapter 合同。
- 页面交互先进入 manual checklist，除非后续另行建立明确 UI test scaffold。
- Electron runtime、preload/main、真实 file/path/dialog、真实串口/TCP/UDP/SCOE、打包态 data path、HTTP/FTP、northbound 和 customer closure 必须用对应验证层级登记。

## 7. Feature Directory Baseline

feature 内推荐目录和职责：

| Directory | Purpose | Test/evidence stance |
| --- | --- | --- |
| `core/` | 纯 TypeScript 领域规则、校验、解析、构帧、迁移、状态推进等确定性逻辑。 | 必须优先可 Vitest unit 和 fixture test；不得依赖 Vue、Pinia、Electron、platform、Node 或全局 store。 |
| `services/` | 业务用例入口，调用 core、state、adapter 或公开协作接口。 | 用 Vitest + fake adapter 覆盖成功、失败、取消、边界和错误分支。 |
| `state/` | 本 feature 的主状态、read model、selector 和很薄的本域 action。 | selector 和状态转移需 fixture/Vitest；不能保存其他 feature truth。 |
| `adapters/` | 本 feature 面向 platform 或外部能力的适配边界。 | adapter contract 可用 fake adapter test；真实 platform 行为需 runtime/package/hardware/customer。 |
| `fixtures/` | 测试输入、legacy sample、expected output、小型错误样本和迁移输入。 | 可以分 `legacy/`、`expected/`、`invalid/`、`runtime-notes/`；不得被生产代码当长期 schema。 |
| `oracles/` | golden output、legacy 对照结果、截图索引、客户样例映射或不可直接作为 fixture 的对照材料。 | 必须写明 provenance；用于 oracle comparison，不作为核心模型来源。 |
| `__tests__/` | feature 本地 spec，按 core/service/adapter/selector 能力组织。 | 应引用本 feature fixture/oracle 或明确说明跨 feature oracle 的 owner。 |

若某 feature 暂时不建立某个目录，design 必须说明原因。例如只有 core pilot 时可以没有 `services/`，但若使用 legacy oracle，则必须有可追踪的 oracle 来源说明。

## 8. Evidence Registry Template

每个 feature design 至少登记当前轮触达的 legacy observable behavior。建议模板：

| Observable behavior | Evidence source | Owner feature | Strategy | Validation level | Blocker |
| --- | --- | --- | --- | --- | --- |
| 旧系统用户可见行为或外部口径 | 路径、截图、日志、客户文档、旧 JSON/history/CSV 样本、旧代码位置 | `frame` / `settings` / `storage` / ... | `preserve` / `candidate drop` / `deferred` / `not touched` | taxonomy level | 缺样本、缺硬件、缺甲方口径、缺 package 环境等 |

Evidence source 登记规则：

- 旧 JSON：登记原始路径、摘取范围、是否只作为 migration input，以及新模型 owner。
- history：登记文件形态、时间范围、压缩/损坏/空数据样本和 owner。
- CSV：登记本地导出语义、列头/时间格式/空数据行为和是否仅作为 report material。
- 截图：登记页面、操作、日期、期望可见状态和是否只支撑 manual checklist。
- 硬件观测：登记设备、连接方式、固件/配置、输入命令、输出日志、异常和限制。
- 客户口径：登记来源文档或确认记录、字段/枚举/错误语义状态和仍缺的决策。

未登记 owner、strategy、validation level 或 blocker 的 evidence 不能作为 completion claim 依据。

## 9. Required Test Items In Feature Design

每个后续 feature design 必须有测试与验证小节，至少回答：

- 本 feature 覆盖哪些旧可观测行为，分别使用哪些 evidence source。
- 哪些行为用 `static scan`、`Vitest unit`、`fixture test`、`oracle comparison` 或 `fake adapter test` 自动覆盖。
- fixture 放在哪里，expected output 或 oracle 放在哪里，是否含 legacy sample。
- 是否需要 manual checklist；需要时列出页面入口、操作、可见状态和错误提示。
- 是否涉及 runtime validation；需要时列出应用生命周期、装配顺序、timer、batch/backpressure、长时间运行或 platform facade 行为。
- 是否涉及 hardware validation；需要时列出串口、TCP、UDP、SCOE、高速链路、设备条件和阻塞项。
- 是否涉及 package validation；需要时列出打包态 data path、权限、备份、清理、extraResources 或安装环境。
- 是否涉及 customer validation；需要时列出 northbound、HTTP/FTP、TestReport、file delivery、外部错误/拒绝/状态语义和甲方 blocker。
- 哪些项是 `preserve`、`candidate drop`、`deferred`、`not touched`。
- 哪些验证本轮不能完成，完成声明中必须如何标注。

每个 checklist item 的 `validation` 字段必须使用本文 taxonomy 中的层级名，或在 item 文本中明确映射到这些层级。禁止只写“测试通过”而不说明验证层级。

## 10. Implementation Completion Template

后续 implementation 完成声明必须包含：

```text
Changed files:
- <file>: <what changed>

Verify evidence:
- Commands:
  - <command>: pass | fail | not run (<reason>)
- Validation levels:
  - static scan: <evidence or not applicable>
  - Vitest unit: <spec/command or not applicable>
  - fixture test: <fixture/spec or not applicable>
  - oracle comparison: <oracle/diff or not applicable>
  - fake adapter test: <spec or not applicable>
  - manual checklist: <checked items or not run + reason>
  - runtime validation: <evidence or not run + blocker>
  - hardware validation: <evidence or not run + blocker>
  - package validation: <evidence or not run + blocker>
  - customer validation: <evidence or not run + blocker>

Not claimed:
- <hardware/package/customer/runtime claims explicitly not made>

Open issues:
- none | <blocker/deferred/candidate drop>
```

默认实现轮需要运行：

```bash
pnpm -C rewrite build
pnpm -C rewrite lint
```

若当轮是纯文档或规则修改，可以不运行 build/lint，但必须在 `Verify evidence` 中写明未运行原因。不得用 build/lint 通过替代 feature behavior、runtime、hardware、package 或 customer evidence。

## 11. Review Gates

review 时必须新增或收紧以下 gate：

- 未列 `Direct contract` / `Boundary guards`：`blocked`。
- 未登记本轮触达旧行为的 evidence source、owner feature、strategy 和 validation level：`revise-required`；若关键 baseline 缺失导致无法判断范围：`blocked`。
- feature design 缺测试与验证小节，或 checklist item 只有“测试”但无 validation level：`revise-required`。
- 使用 Vitest、fixture、fake adapter 或 static scan 宣称真实串口/TCP/UDP/SCOE、打包态 data path、HTTP/FTP、northbound 或 customer closure 完成：`revise-required`。
- 缺甲方 schema、字段、枚举、错误码、HTTP/FTP 环境或接收确认，却声明 northbound/customer 完成：`blocked`。
- `pass-with-known-gaps` 必须列出每个 gap 的 validation level、owner、blocker 和后续验证方式；否则不能使用。
- Fast path 也必须列出验证证据；除纯文档外，不能省略 build/lint 状态说明。

## 12. Current Feature Baseline Scan

### frame

已有基础：

- `rewrite-frame-design.md` 已列出 frame fixture/oracle/test plan。
- `rewrite-frame-checklist.yaml` 已有 `FR-TEST-BASELINE-001` 和 `FR-IMPL-011`。
- `rewrite/src/features/frame/fixtures/frame-fixtures.ts` 提供最小 frame、重复字段、表达式、安全失败和 legacy frame config 样本。
- `rewrite/src/features/frame/__tests__/frame-core.spec.ts` 已覆盖部分校验、表达式安全和 legacy migration 行为。
- `rewrite/src/features/frame/__tests__/frame-service-state-selector.spec.ts` 已覆盖 service/state/selector public boundary 小试点。

缺测试前置项：

- 当前是 fixture-as-input + 固定断言，尚无独立 `oracles/` golden comparison。
- `validateFrameAssetCollection`、字段校验、表达式变量映射和 legacy 边界样本仍不完整。
- frame 页面交互、file/path/dialog、打包态 data path、真实接收/发送/SCOE、HTTP/FTP、northbound 和客户闭环均不能由 frame 当前测试声明完成。

### settings

已有基础：

- `rewrite-settings-design.md` 已列出 settings fixture/oracle/test plan。
- `rewrite-settings-checklist.yaml` 已要求 Vitest 覆盖 core/service/adapter/selector，并声明不得用静态测试声明 hardware、packaged app、HTTP/FTP、SCOE、northbound 或 customer closure。
- 旧设置、图表、history analysis、connection defaults 和占位按钮等 evidence 已在 design 中登记。
- `rewrite/src/features/settings/fixtures/settings-fixtures.ts` 与 `rewrite/src/features/settings/__tests__/settings-core-service-state-selector.spec.ts` 已覆盖 settings core/service/state/selector 小实现试点。

缺测试前置项：

- 未单独列 package validation 层级；涉及选择目录、导入/导出、持久化路径时必须补打包态验证计划。
- connection 默认参数真实生效依赖 connection design 和硬件/runtime 验证，settings 只能证明默认输入和 snapshot。
- 导入/导出设置、选择输出目录、autolaunch/menu 是否成为真实能力仍是 deferred 或用户决策项。

### storage local baseline

已有基础：

- `rewrite-storage-local-baseline-design.md` 对 local persistence、legacy JSON migration material、history、CSV、fake files/path adapter 和 deferred 项描述较完整。
- `rewrite-storage-local-baseline-checklist.yaml` 已明确 packaged data path blocker、高速存储 deferred、report/northbound not owner，以及 storage fixture/Vitest 覆盖要求。
- `rewrite/src/features/storage-local-baseline/fixtures/storage-fixtures.ts` 与 storage-local-baseline 三个 spec 已覆盖 core oracle、fake adapter、service/state/reader 小实现试点。

缺测试前置项：

- `package validation` 需要作为独立层级登记，而不只混在 runtime 文本里。
- 尚无独立 `oracles/` golden 目录；storage/history/csv 当前只完成 fixture/spec 层的小试点。
- packaged data path、长期写入、备份、清理、权限、高速存储、高吞吐和 short-circuit 行为仍是 runtime/package/hardware blocker。
- history/CSV/local export 只能作为本地记录或 report material，不能声明 TestReport、HTTP/FTP 或 northbound delivery closure。

## 13. Deferred / Blockers

- 仓库尚无统一 evidence registry 总表；当前登记分散在 feature design、checklist 和 architecture 文档。
- `rewrite` 当前没有统一 `oracles/` 目录，也没有跨 feature oracle comparison scaffold。
- fake adapter 模式尚未形成统一目录和命名约定；后续 feature 可以先在本 feature 内建立。
- 真实串口、TCP、UDP、SCOE、高速数据链路和长期吞吐无本轮验证证据。
- 打包态 data path、权限、备份、清理和长期写入无本轮验证证据。
- HTTP/FTP、northbound、TestReport、file delivery、外部错误/拒绝/状态语义和 customer closure 仍依赖甲方口径与运行环境。
- 本轮只设计验证基线，不写测试代码，不改业务代码，不运行 build。
