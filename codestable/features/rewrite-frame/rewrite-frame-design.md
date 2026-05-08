---
doc_type: feature-design
feature: rewrite-frame
status: draft
date: 2026-04-30
summary: 东方红上位机重写中 frame feature 的 owner、边界、状态归属、公开读取面和后续实现入口。
---

# Rewrite frame feature design

## 1. Direct contract

本设计只依据以下正式工件判断范围和完成度：

1. `AGENTS.md`
2. `codestable/compound/2026-04-28-rewrite-execution-charter.md`
3. `codestable/compound/2026-04-28-rewrite-scope-default-preserve.md`
4. `codestable/architecture/rewrite-target-structure.md`
5. `codestable/architecture/rewrite-system-architecture.md`
6. `codestable/architecture/rewrite-feature-boundaries.md`
7. `codestable/architecture/rewrite-feature-interaction-matrix.md`
8. `codestable/architecture/rewrite-shared-tooling-audit-plan.md`
9. `codestable/architecture/rewrite-pre-design-gate-and-sequencing.md`
10. `codestable/architecture/rewrite-platform-api-surface-reduction.md`
11. `codestable/architecture/rewrite-shared-tooling-app-shell-ownership.md`
12. `codestable/quality/rewrite-quality-rules.md`
13. `codestable/quality/rewrite-review-checklist.md`

`codestable/architecture/rewrite-target-structure.md` 仍是目录与职责的 canonical 架构基线。

## 2. Boundary guards

- 本轮是 Lane B 单 feature design，只产出 design/checklist，不进入实现，不迁移代码，不写接口 schema。
- frame 本轮只设计静态帧资产、字段、表达式定义、校验、导入导出的 owner 和边界。
- 不设计 receive、send、task、SCOE、report、northbound 内部细节。
- 不冻结 northbound、result、report、TestReport schema。
- 不把旧 JSON 当成新核心模型；旧 JSON 只能作为迁移输入、fixture 或 oracle。
- 不把统计 read model 写回 frame definition、field definition 或静态配置。
- 不把 frame helper 提前抽到 `shared`，除非后续实现证明它满足 shared 纯工具条件。
- 不写 preload、main、renderer API schema。
- 不读取或引用前端自动生成 types 文件作为证据。

## 3. Evidence summary

### 3.1 Contract evidence

- 目标结构要求 `features/frame` 承担帧定义、字段定义、静态校验、序列化、导入导出和旧 JSON 迁移入口；领域规则应在可测试 TypeScript 层，不依赖 Vue、Pinia、Electron、platform facade、全局 store 或 Node 能力。
- feature 边界和 interaction matrix 将 receive、send、task、SCOE、report 视为 frame 静态资产的消费者；它们可以读取 frame selector 或快照，但不能 import frame internal state。
- 状态分层要求静态资产、运行事实、统计 read model、UI snapshot 分离；统计 read model 由对应 owner feature 基于运行事件维护，不能写回 frame definition。
- platform surface reduction 要求 file、path、dialog 只是受控平台能力；旧 `window.electron` 大包、dataStorage/history/highSpeed 不能原样升级为新 platform API。
- shared tooling audit 要求旧 `src/utils/frames/*` 中的 frame 业务校验和表达式定义规则回归 frame feature；只有纯通用、无业务语义、无副作用工具才可能进入 `shared`。
- pre-design gate 要求第一批业务 feature design 明确 legacy observable behavior ledger，登记旧可观测行为、owner、处理策略、证据和验证等级。
- rewrite root placement 要求 frame 新代码落在 `rewrite/src/features/frame`；旧 `src/` 和 `public/` 路径只作为 legacy evidence、fixture 或 oracle 输入。

### 3.2 Legacy evidence

本轮读取的旧系统证据只用于保留可观测行为和识别边界，不作为新架构结构模板：

- 页面入口和用户行为：`src/pages/frames/FrameList.vue`、`src/pages/frames/FrameEditor.vue`、`src/composables/frames/useFrameEditor.ts`
- frame 静态资产状态和持久化：`src/stores/frames/frameTemplateStore.ts`、`src/config/configDefaults.ts`、`src/api/common/dataStorageApi.ts`
- 字段、校验、表达式定义：`src/utils/frames/frameUtils.ts`、`src/utils/frames/fieldValidation.ts`、`src/utils/frames/defaultConfigs.ts`
- 表达式运行消费方式：`src/composables/frames/useExpressionCalculator.ts`、`src/composables/frames/useFrameExpressionManager.ts`
- receive/send/task/SCOE 消费边界：`src/stores/frames/receiveFramesStore.ts`、`src/stores/frames/sendFrameInstancesStore.ts`、`src/stores/frames/sendTasksStore.ts`、`src/composables/frames/sendFrame/useUnifiedSender.ts`
- 旧 JSON 和样本输入：`public/data/templates/framesConfig.json`、`public/data/frames/configs/`、`public/data/frames/templates/`、`public/data/frames/sendInstances/`、`public/data/frames/taskConfigs/`、`public/data/frames/receiveConfig/`

## 4. Design

### 4.1 Owner / not owner

| 分类 | frame owner | frame not owner |
| --- | --- | --- |
| 静态资产 | 帧定义、字段定义、表达式定义、展示/编辑用静态配置、收藏标记、导入导出语义、旧 JSON 迁移入口。 | receive 配置、send 实例、task 配置、SCOE 专属实例、result/report/northbound schema。 |
| 领域规则 | frame asset 校验、field 校验、表达式定义校验、导入内容校验、序列化/反序列化规则、迁移规则。 | 串口/TCP/UDP 数据接收、发送执行、任务调度、SCOE 命令流程、报告生成和交付。 |
| 状态写入 | 静态 frame asset collection 和 frame 页面局部 UI snapshot。 | 接收运行事实、发送运行事实、任务运行事实、SCOE 状态、连接状态、统计 read model、报告交付状态。 |
| 外部读取 | 提供只读 snapshot、selector 或 service 给明确消费者读取 frame asset。 | 反向拥有消费者状态，或替 receive/send/task/SCOE/report 维护运行投影。 |
| 平台能力 | 定义 frame JSON 语义、校验、迁移和导入导出领域结果。 | 文件选择、路径解析、对话框、打包态 data path、主进程缓存。 |

frame 的目标是成为静态帧资产和字段/表达式定义规则的单一 owner。它不成为所有帧相关行为的总入口，也不把历史上聚集在旧 store/composable 中的 receive、send、task、SCOE 运行行为收回到 frame。

### 4.2 Legacy observable behavior ledger

| 旧可观测行为 | owner feature | 处理策略 | evidence source | validation level |
| --- | --- | --- | --- | --- |
| 帧配置列表页提供新建、编辑、复制、删除、收藏、详情查看、搜索/筛选、导入、导出入口。 | frame | preserve | `src/pages/frames/FrameList.vue`、`src/stores/frames/frameTemplateStore.ts` | manual, fixture |
| 帧编辑页支持创建/编辑帧、编辑字段、保存前校验、取消/退出确认和错误提示。 | frame | preserve | `src/pages/frames/FrameEditor.vue`、`src/composables/frames/useFrameEditor.ts` | manual, fixture |
| 保存时校验帧名、至少一个字段、字段名唯一、字段名/dataType/长度等基础字段规则。 | frame | preserve | `src/utils/frames/frameUtils.ts`、`src/composables/frames/useFrameEditor.ts` | fixture |
| 表达式定义校验包含变量标识符、表达式非空、括号匹配、危险关键字、变量映射、条件表达式、循环依赖等检查。 | frame | preserve | `src/utils/frames/fieldValidation.ts`、`src/utils/frames/defaultConfigs.ts` | fixture |
| 表达式运行时可从当前帧、其他帧、全局统计、SCOE 数据等来源读取值并计算字段结果。 | frame for definition; receive/send/SCOE/status for runtime facts | deferred | `src/composables/frames/useExpressionCalculator.ts`、`src/composables/frames/useFrameExpressionManager.ts` | fixture, runtime, hardware |
| 旧实现使用 `new Function` 执行表达式，并在运行期读取 Vue store 中的 receive/global/SCOE 状态。 | consumer features; frame only records definition validation boundary | candidate drop | `src/composables/frames/useExpressionCalculator.ts`、`src/composables/frames/useFrameExpressionManager.ts` | fixture, runtime |
| frame 模板通过 `framesConfig` 读写，store 维护 `frames` 和 `selectedFrameId`，新增/更新采用内存更新后全量保存。 | frame | preserve | `src/stores/frames/frameTemplateStore.ts`、`src/config/configDefaults.ts` | fixture, manual |
| 删除当前选中帧时旧 store 会清空 `selectedFrameId`。 | frame UI snapshot | preserve | `src/stores/frames/frameTemplateStore.ts` | fixture |
| 收藏行为翻转 `isFavorite` 并持久化。 | frame | preserve | `src/stores/frames/frameTemplateStore.ts`、`src/pages/frames/FrameList.vue` | fixture, manual |
| frame JSON 导出通过文件对话框写出当前 frame 列表。 | frame for JSON semantics; app/platform for file dialog/path | preserve | `src/pages/frames/FrameList.vue`、`src/api/common/dataStorageApi.ts` | manual, runtime |
| frame JSON 导入旧行为只做数组形态检查后覆盖保存并重新加载。 | frame | preserve user-visible import; deferred exact compatibility rules | `src/pages/frames/FrameList.vue`、`src/api/common/dataStorageApi.ts` | fixture, manual |
| `public/data/templates/framesConfig.json` 和 `public/data/frames/*` 提供旧样本和默认数据来源。 | frame fixtures as oracle input | preserve as fixture/oracle only | `public/data/templates/framesConfig.json`、`public/data/frames/configs/`、`public/data/frames/templates/` | fixture |
| receive 按 frame 静态资产匹配帧、提取字段、填充 data items、更新展示数据和统计。 | receive; frame provides read-only asset snapshot | preserve as consumer boundary | `src/stores/frames/receiveFramesStore.ts` | fixture, runtime, hardware |
| send 使用 frame 元数据、字段、send instance 输入构造发送内容并处理校验/表达式。 | send; frame provides read-only asset snapshot | preserve as consumer boundary | `src/stores/frames/sendFrameInstancesStore.ts`、`src/composables/frames/sendFrame/useUnifiedSender.ts` | fixture, runtime, hardware |
| task 触发条件和定时任务可引用帧、字段、接收输出。 | task; frame provides read-only references | preserve as consumer boundary; task internals deferred | `src/stores/frames/sendTasksStore.ts`、`src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue` | fixture, runtime |
| SCOE 流程使用部分 frame/SCOE 实例和 receive 分支数据。 | SCOE; frame only owns generic frame asset | deferred | `src/stores/frames/receiveFramesStore.ts`、`src/stores/frames/scoeFrameInstancesStore.ts` | fixture, hardware |
| 旧 receive store 同时维护接收数据、global stats、frameStats、表达式结果、触发检查和展示状态。 | receive/status/task owners, not frame | not touched | `src/stores/frames/receiveFramesStore.ts` | fixture, runtime, hardware |
| report 当前未发现可作为本轮合同的直接 frame 生成/交付链路；未来可按 report 设计读取 frame metadata。 | report | not touched | 本轮允许范围内搜索结果 | customer |

### 4.3 State ownership

| 状态类别 | 写入 owner | 读取方 | 本轮设计约束 |
| --- | --- | --- | --- |
| 静态 frame assets | frame | frame pages、receive、send、task、SCOE、未来 report | 包含帧、字段、表达式定义和静态展示配置。写入只来自 frame 的创建、编辑、复制、删除、收藏、导入、迁移服务。 |
| 运行事实 | receive、send、task、SCOE、connection、result 等对应 feature | 各自页面、runtime 编排、统计/报告消费者 | frame 不写入、不缓存、不重放运行事实。表达式运行输入属于消费者 feature 或运行编排输入，不属于 frame 静态资产。 |
| 统计 read model | 对应 owner feature，例如 receive/status/result | 页面、报告、任务触发等明确消费者 | 统计只作为 read model 或运行投影，不写回 frame definition、field definition 或静态配置。 |
| UI snapshot | frame 页面、组件、composable 或 feature state 的 UI 子层 | frame 页面和局部组件 | 搜索词、筛选条件、当前选中帧、编辑草稿、对话框状态等是 UI snapshot，不是 frame asset truth。若需要持久化，必须单独标记，不混入静态定义。 |
| 导入/迁移过程状态 | frame service 和页面流程 | frame 页面、验证结果展示 | 迁移报告、导入错误、兼容警告只描述导入过程，不成为核心 schema。 |

### 4.4 Public API necessity

frame 不为所有能力强行设计同构 public API。后续实现只给真实外部消费者提供最小只读入口。

需要 frame public selector/service 的消费者：

- frame 页面：读取 frame 列表、详情、编辑草稿初始化数据，并调用 frame service 进行创建、更新、复制、删除、收藏、导入、导出。
- receive：读取接收方向可用的 frame asset snapshot、字段定义和必要匹配信息；不得写入 frame state，不得 import frame internal store。
- send：读取发送方向可用的 frame asset snapshot 和字段定义，用于 send instance 配置与发送构造；发送执行结果不回写 frame。
- task：读取稳定的 frame/field 引用选项，用于触发条件或任务配置；task 运行状态和触发执行归 task。
- SCOE：在 SCOE 设计明确需要时读取 generic frame asset snapshot；SCOE 专属帧实例、命令流程和设备状态归 SCOE。
- report：本轮不设计 schema；未来若 report 需要 frame metadata，只能通过只读 selector/service 读取，不从 frame internal state 取数。
- import/export adapter：调用 frame service 完成 JSON 语义校验、迁移和序列化；文件读写由 app/platform 能力承担。

不需要 frame public API 的对象：

- connection、serial/network platform：它们不直接理解 frame 领域语义。
- status 纯展示组件：应读取对应 owner 的 read model，而不是直接 import frame internals。
- northbound/result/report 交付闭环：本轮不冻结 schema，也不建立 frame 到 northbound 的直接合同。
- shared tools/widgets：除非后续有明确纯展示或纯工具需求，否则不作为 frame 领域 API 消费者。

禁止形态：

- 不暴露可变 frame collection 引用。
- 不暴露 internal store、Pinia state、Vue ref、全局 singleton 给其他 feature。
- 不把 receive/send/task/SCOE/report 的运行方法挂在 frame API 上。
- 不为了形式统一创建空壳 `public.ts`、同构 service 或同构 event bus。

### 4.5 Runtime involvement

frame core、service、state、adapter 自身不需要 runtime 承载领域规则。

runtime 只有在以下场景可以参与：

- 应用启动装配：在 receive/send/task 等消费者读取前加载 frame assets，或注册 frame asset snapshot 的刷新顺序。
- 跨 feature 输入输出：当某个消费者需要订阅 frame asset 更新时，runtime 可以负责装配订阅关系，不能解释 frame 字段、表达式或迁移语义。
- 生命周期：应用退出、刷新、导入后重载等流程中，runtime 可协调加载顺序和错误上报。
- 边界例外登记：若后续 receive/send 为性能或平台原因需要 main 侧缓存 frame snapshot，例外只登记平台/生命周期原因；frame 领域规则仍归 frame core/service。

runtime 不得包含：

- frame/field/expression 校验规则。
- 旧 JSON 迁移规则。
- frame import/export JSON 语义。
- receive/send/task/SCOE/report 的领域决策。

### 4.6 Platform involvement

platform 与 app shell 在 frame 中只承担文件、路径、对话框等能力边界：

- 导入：选择文件、读取文本或结构化内容、返回失败原因的技术错误。
- 导出：选择目标路径、写入文件、返回文件系统结果。
- 数据路径：解析开发态/打包态存储位置。
- 对话框：确认覆盖、选择文件、错误提示所需的 app shell 能力。

frame 必须自己承担：

- frame JSON 的语义识别。
- 导入内容校验。
- 旧 JSON 迁移和兼容警告。
- 导出结构的稳定性和可测试性。
- 导入/导出结果如何反馈给 frame 页面。

本设计不定义最终 platform API schema。后续实现只能通过目标架构允许的 renderer platform facade 或 app shell 能力进入 file/path/dialog，不直接访问 Node、Electron、`fs`、`path`、`ipcRenderer` 或旧 `window.electron` 大包。

### 4.7 Cross-feature boundaries

| Feature | 如何读取 frame | 明确禁止 |
| --- | --- | --- |
| receive | 读取只读 frame asset snapshot，用于识别帧、字段解释、接收配置中 frame/field 引用选项。 | import frame internal state；把接收数据、global stats、frameStats、表达式运行结果写回 frame。 |
| send | 读取发送方向 frame snapshot 和字段定义，用于 send instance 配置和发送构造。 | 让 frame 拥有发送实例、发送队列、连接状态、执行结果或错误重试策略。 |
| task | 读取 frame/field reference selector，用于 trigger/timer 配置和校验。 | 让 frame 拥有 task 生命周期、触发执行、任务运行日志。 |
| SCOE | 在 SCOE 设计允许时读取 generic frame asset snapshot。 | 把 SCOE command、设备状态、SCOE 专属实例或硬件语义塞入 frame。 |
| report/result | 后续如需读取 frame metadata，只能通过明确只读 selector/service。 | 在本轮冻结 report/TestReport schema；把本地 history/CSV 导出等同 report delivery。 |
| status/statistics | 读取对应 owner 的统计 read model，必要时可展示 frame 名称/字段名快照。 | 将统计 read model 写回 frame definition。 |
| northbound | 本轮无直接 frame public API。 | 把 northbound deviceId、result、file delivery 与 frame/serial target 直接等价。 |

### 4.8 Target internal layering

后续实现的目标分层只描述职责，不在本设计中冻结字段 schema。

| 层 | 目标职责 |
| --- | --- |
| `core` | 纯 TypeScript 领域规则。负责 frame asset、field、expression definition 的校验；旧 JSON 识别、迁移和规范化；序列化/反序列化规则；只接收显式输入，不依赖 Vue、Pinia、Electron、platform、Node 或全局 store。 |
| `services` | 组织用例流程。负责 create/update/delete/duplicate/favorite/import/export/migrate/validate 等应用服务，协调 core、state 和 adapter，但不承载平台细节。 |
| `state` | frame 静态资产集合、只读 selector、必要的 frame UI snapshot。state action 应保持薄层，不直接访问其他 feature internal state，不维护运行事实或统计 read model。 |
| `adapters` | 与 storage、file import/export、legacy sample loading 等边界适配。adapter 只做技术转换，调用 frame service/core 解释 JSON 语义。 |
| `composables` | frame 页面交互层。负责表单草稿、列表筛选、导入导出对话流程、错误展示和 service 调用，不承载核心校验规则。 |
| `components` | frame list、frame editor、field editor、expression editor 等 UI 组件。组件通过 props/events/composables 使用 feature 能力，不直接读取 platform 或跨 feature internal state。 |
| `fixtures` | 旧 JSON 正例/反例、迁移输入、预期输出、表达式定义校验样本、导入导出 round-trip 样本。fixtures 是 oracle，不是新核心模型。 |

### 4.9 Fixture / oracle / test plan

Vitest 可覆盖的自动验证：

- 重写新应用已在 `rewrite/` 独立根目录引入 Vitest 基线；`pnpm -C rewrite test` 当前运行最小 infra smoke test。旧根 `package.json` 的 `test` script 仍只属于旧应用，不作为 rewrite feature 验证入口。
- Vitest 是 frame `core`、`service`、`adapter`、`selector` 的默认单测栈；页面交互先走 manual checklist；Electron runtime、打包态 package、hardware 和 customer validation 不由 Vitest 代替。
- frame asset 基础校验：帧名、字段存在、字段名唯一、字段基础属性、方向/类别等静态约束。
- expression definition 校验：变量标识符、表达式非空、括号匹配、危险关键字、变量映射、条件表达式、循环依赖。
- 旧 JSON 导入：数组形态、缺失字段、重复字段、非法表达式、可迁移样本、不可迁移样本。
- 导出 round-trip：frame service 序列化后再导入，静态资产语义保持稳定。
- service 行为：创建、更新、复制、删除当前选中帧、收藏切换、导入覆盖或合并策略。
- selector 行为：receive/send/task/SCOE/report 消费者只能拿到只读 snapshot 或 reference projection，不能获得可变内部 state。
- adapter 行为：使用 fake storage/file adapter 验证 import/export 流程，不触达真实 file/path/dialog。

fixture/oracle 建议位置：

- 后续实现时在 `rewrite/src/features/frame/fixtures/legacy/` 放旧 JSON 输入样本。
- 在 `rewrite/src/features/frame/fixtures/expected/` 放迁移和导出预期输出。
- 测试专用反例可放在对应 `__fixtures__` 或 feature fixtures 下，但必须避免把 fixture 当作生产 schema。
- 旧 `public/data/templates/framesConfig.json`、`public/data/frames/configs/`、`public/data/frames/templates/` 只作为历史 oracle 输入，不作为新核心模型。

需要的旧样本：

- 最小合法 frame 列表。
- 包含多个字段和重复字段名的样本。
- 包含 expression definition、条件表达式、变量映射、跨帧引用的样本。
- 包含旧导入仅数组检查即可通过、但新校验应给出警告或失败的样本。
- 被 receive/send/task/SCOE 引用的 frame 样本，用于验证 selector projection 和 reference stability。

只能 manual/runtime/hardware/customer validation 的内容：

- frame list/editor 页面交互、退出确认、导入导出对话框和错误提示需要 manual validation。
- 开发态/打包态 file/path/dialog、启动加载顺序、导入后消费者刷新需要 runtime validation。
- 真实串口/TCP/UDP 接收、发送链路、SCOE 设备链路属于对应 feature 的 hardware validation，frame 只能提供静态 fixture 证据。
- HTTP/FTP、northbound、report/TestReport、客户闭环不属于本轮完成范围，不能由 frame design 声明完成。

### 4.10 Blocked / deferred

- 新 frame 核心模型字段 schema 未冻结，后续实现前只按本设计的 owner 和边界推进。
- 旧 JSON 完整兼容范围未冻结，需要在实现前补齐样本语料和迁移失败策略。
- expression runtime 安全模型未冻结；本轮只确认 expression definition validation 归 frame，运行输入和执行归对应消费者设计。
- platform file/path/dialog 最终 API 未定义，本轮只确认 frame 不直接访问 Node/Electron/旧 `window.electron`。
- receive/send/task/SCOE/report 内部设计不在本轮范围内。
- 打包态 data path、真实硬件链路、HTTP/FTP、northbound、客户闭环均为后续 runtime/hardware/customer validation，不在本轮完成声明中。

## 5. Checklist entry

后续 `cs-feat-impl` 入口以 `codestable/features/rewrite-frame/rewrite-frame-checklist.yaml` 为准。实现阶段必须先重新确认本设计中的 direct contract、owner/not owner、state ownership、public API necessity、runtime/platform involvement 和 blocked/deferred 项，不能把本轮文档外的旧代码结构升级为新实现合同。
