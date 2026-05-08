---
doc_type: compound
type: rewrite-domain-order-and-first-batches
status: draft
date: 2026-04-29
summary: Domain order, Batch 0 architecture baseline, and first-batch planning memo for the full rewrite. This document fixes the recommended implementation order, cs-feat entry expectations, dependency risks, and customer-decision boundaries without defining schemas or implementation details.
tags:
  - rewrite
  - domain-order
  - batches
  - cs-feat
  - planning
---

# Rewrite domain order and first batches

## 1. Purpose

本文固定后续重写的功能域推进顺序，作为进入 `cs-roadmap` / `cs-feat-*` 之前的讨论稿。

它只回答：

- Batch 0 先锁哪些整体架构骨架。
- 先做哪些功能域，后做哪些功能域。
- 为什么这个顺序能降低旧耦合复活的风险。
- 哪些批次可以不等甲方回复先推进。
- 哪些批次必须等用户、甲方、runtime 或 hardware 证据。
- 每批进入 `cs-feat-design` 前至少需要哪些直接合同和验证材料。

本文不做以下事情：

- 不写接口 schema。
- 不定义 northbound 字段、枚举或错误码。
- 不设计具体模块内部实现。
- 不制定逐文件迁移清单。
- 不替代后续 `cs-feat-design`、`cs-feat-impl`、`cs-feat-accept`。

## 2. Inputs

Direct contract:

- `AGENTS.md`
- `codestable/compound/2026-04-28-rewrite-execution-charter.md`
- `codestable/compound/2026-04-28-rewrite-scope-default-preserve.md`

Boundary guards:

- `codestable/architecture/rewrite-target-structure.md`
- `codestable/quality/rewrite-quality-rules.md`
- `codestable/quality/rewrite-review-checklist.md`
- `codestable/compound/2026-04-28-northbound-overlap-and-gap-map.md`

Fixed decisions inherited here:

- 旧系统可观测业务行为和页面入口默认保留。
- 不保留旧代码组织、全局状态穿透、跨模块耦合和旧 Electron 暴露方式。
- 后续代码实现必须按 `cs-feat-*` 流程进入。
- `codestable/` 是长期正式文档目录。
- Electron 方向固定为 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: false`。
- main process 的目标边界是平台资源访问、生命周期和必要的平台侧高频缓冲，不新增业务运算、协议语义、任务推进或报告语义；现有 main 业务化路径作为迁移风险处理。
- northbound / result / report / file delivery 是独立边界，不能用旧 send task、history、CSV、serial/network target 直接替代。

## 3. Ordering Principles

1. 先完成 Batch 0 架构基线，再让任何功能进入 `cs-feat-design`。

   Batch 0 不写业务代码，不写接口 schema，不设计具体 receive/send/task/SCOE/northbound 实现。它只把目录、feature 分层、跨 feature 访问边界、runtime 使用条件、Electron、状态、高频数据、UI 和验证边界固定成后续批次共同遵守的合同。

2. 先稳定资产和持久化，再接运行链路。

   frame asset、storage、settings 是很多运行行为的输入。它们先稳定，可以减少 receive/send/task 后续为了旧 JSON 或页面状态返工。

3. 先固定平台和连接边界，再处理收发业务。

   串口、TCP、UDP、文件、路径和窗口能力必须先通过 `platform` facade 收口。否则 receive/send/task 容易重新直接依赖 Electron、Node 或旧 preload。

4. receive / send / task 作为一组大域推进，不拆成过窄切片。

   这些域彼此耦合强，过窄切片容易为了局部能跑而重建共享 store、隐式事件和跨域状态回读。后续可以在 `cs-feat` 内拆步骤，但本轮批次按大域看。

5. SCOE 在通用收发任务边界稳定后单独接入。

   SCOE 旧能力明确存在，但它有固定 source/target、命令语义和完成条件。先做通用 receive/send/task，再让 SCOE 通过显式入口接入，避免硬编码回到通用链路。

6. status / result / report / northbound 放在内部事实稳定之后。

   status、result、report 需要读取 connection、receive、send、task、SCOE、storage 的内部事实。northbound 还依赖甲方口径，不能先从外部字段倒推内部主状态。

7. 性能风险按数据流解决，不靠 main 业务化。

   高频数据可以在 main 做平台侧缓冲、批处理、聚合、节流、队列和背压，但解析、统计含义、任务推进、报告语义仍归可测试 TypeScript 层。

## 4. Batch Matrix

| Batch | Domains | Why this order | Produces | Oracle / validation focus | Customer dependency | Main risk |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | architecture baseline | 先固定所有功能都必须遵守的骨架，避免 Batch 1 开始后临场补架构 | `rewrite-target-structure.md` 升格为 Batch 0 canonical baseline；后续 `cs-feat-design` 前置条件 | 文档一致性检查；不跑业务验证 | 低 | 另起一份架构基线导致双真相源；过早写 schema 或功能细节 |
| 1 | `frame / storage / settings` | 先稳定静态资产、迁移输入、基础配置和本地持久化 | 帧资产口径、旧 JSON 迁移入口、本地存储和设置归口 | legacy JSON fixture、导入导出 checklist、设置读写 checklist | 低 | 旧 JSON 兼容污染新核心模型；统计写回 frame list |
| 2 | `platform / connection` | 先把 Electron、串口、TCP、UDP、文件能力收口，再让业务链路依赖它 | typed platform facade、连接生命周期、target 可用性、平台侧高频缓冲口径 | serial/TCP/UDP runtime validation、IPC 粒度检查、打包态路径检查 | 低；northbound HTTP/FTP 除外 | main 以性能为理由吞业务语义；IPC 过细或裸露 |
| 3 | `receive / send / task` | 核心运行链路，需要一起确认输入输出和状态推进 | 接收解析、发送构帧、发送结果、定时发送、任务状态推进的内部事实 | bytes fixture、send build fixture、timed send fixture、性能/队列检查、手工收发 checklist | 中；甲方 task 语义不应阻塞本地 timed send | receive/store 重新变大脑；send/task 混淆；高频更新推动 UI 全量刷新 |
| 4 | `scoe` | 在通用收发任务边界稳定后接入专项能力 | SCOE 命令、状态、发送请求、完成条件和测试工具记录边界 | SCOE fixture、真实设备 runtime validation、边界例外登记 | 中；与当前甲方 northbound 身份分开 | SCOE hardcode 沉积到通用 receive/send；通过共享状态回读完成条件 |
| 5 | `status / result / report / northbound` | 内部事实成熟后再做状态投影、结果、报告和对外交付 | 内部状态摘要、结果事实、报告生成、northbound 对外投影和交付边界 | status mapping fixture、report fixture、HTTP/FTP/customer validation | 高 | 把旧 history/CSV 当 TestReport；把旧 send task 当 northbound task；甲方口径缺失被误判为 known gap |

## 5. Batch 0: architecture baseline

Goal:

- 把 `codestable/architecture/rewrite-target-structure.md` 固定为后续重写整体架构基线。
- 明确后续每个 Batch 进入 `cs-feat-design` 前必须满足的架构前置条件。
- 只锁目录、分层、依赖、状态、runtime、platform、UI 和验证边界，不设计功能内部细节。

Should include:

- 目标目录结构和 feature 内部通用分层。
- feature public API 作为跨 feature 访问边界的轻量规则。
- runtime 按需作为组合根的职责，以及禁止成为全局业务中心的边界。
- platform / preload / main / renderer 边界。
- 静态资产、运行事实、统计 read model、UI snapshot 的状态分层。
- 高频数据流的 batch / delta / queue / throttle / snapshot / backpressure 原则。
- 跨 feature 通过明确认可的入口、runtime 编排、显式事件或边界输入输出通信；不强制每个 feature 预设 `public.ts`、event bus 或 command bus。
- pages、widgets、feature components 的职责边界。
- 测试、fixture、oracle 的放置和验证分层。
- 后续每个 Batch 的 `cs-feat-design` 架构前置条件。

Should not include:

- 字段 schema、接口签名、事件 payload、northbound 字段或枚举。
- receive / send / task / SCOE / result / report / northbound 的内部算法和流程细节。
- 具体高频参数，例如队列深度、采样窗口和延迟目标；这些应在对应 feature design 中结合证据确定。
- 新增独立 `rewrite-architecture-baseline.md`，除非 `rewrite-target-structure.md` 无法承载；当前不需要新增。

Exit condition:

- `rewrite-target-structure.md` 已明确 Batch 0 baseline 身份。
- 本文 Batch Matrix 已包含 Batch 0。
- 后续 Batch 1 的 `cs-feat-design` 提示词已给出，并把 Batch 0 基线作为直接合同之一。

## 6. Batch 1: frame / storage / settings

Goal:

- 固定帧资产作为独立业务对象。
- 保留旧页面入口和用户可见能力：帧列表、编辑、新建、删除、复制、收藏、导入导出。
- 把旧 JSON 作为迁移输入或 oracle，不把旧 `framesConfig` 结构写进新核心模型。
- 固定本地存储、历史材料入口、基础设置读写的职责边界。

Should include:

- frame asset、frame editor、frame import/export 的可观测行为范围。
- storage 对 frame/settings/history/export 的持久化边界。
- settings 的默认值、读写和页面入口范围。
- legacy JSON fixture 候选。

Should not include:

- receive 当前值、命中统计、最近值等运行统计写入 frame asset。
- send/receive/task 的运行状态。
- northbound 报告或文件交付。

Entry condition for `cs-feat-design`:

- 旧功能 baseline 和 default-preserve 范围已读。
- 至少有一组旧 JSON 样例，或明确记录样例暂缺且只做结构设计。
- 说明哪些导入导出行为自动 fixture 覆盖，哪些只做手工 checklist。

## 7. Batch 2: platform / connection

Goal:

- 固定 Electron 与平台边界。
- 保留串口、TCP、TCP server、UDP remote host 和 target 可用性语义。
- 让 renderer 只通过 `platform` facade 访问桌面能力。
- 明确高频数据在 main 的平台侧缓冲、批处理、聚合、节流、队列和背压边界。

Should include:

- preload typed API 口径。
- renderer platform facade 口径。
- main process 平台资源职责。
- serial / network / target 的连接生命周期和错误展示行为。
- 高频通道的队列上限、溢出策略、合并窗口、延迟观察方式或替代验证理由。

Should not include:

- 帧解析、表达式、统计含义。
- task 生命周期推进。
- SCOE 协议语义。
- result/report/northbound 业务语义。

Entry condition for `cs-feat-design`:

- Electron 边界规则已列为直接合同或边界护栏。
- 明确是否涉及真实串口/TCP/UDP runtime validation。
- 明确 main 中任何高频处理都只是平台侧处理，不定义业务分类、成功失败或报告语义。

## 8. Batch 3: receive / send / task

Goal:

- 重建核心收发和任务执行链路。
- 保留 receive bytes -> frame match -> fields -> expression/result/statistics/trigger 等旧可观测结果。
- 保留手工发送、发送实例、target 路由、发送成功/失败结果。
- 保留已实际使用的定时发送能力。
- 让旧 task 其他形态作为兼容候选或 oracle，不自动成为新系统中心模型。

Should include:

- receive core 的输入、解析、归一、结果输出。
- send core 的构帧、发送请求、目标落地、发送结果。
- timed send 和任务状态推进。
- 统计 read model 和 UI snapshot 分层。
- trigger 相关旧可观测行为的 preserve / compatible / deferred 判断。
- 高频数据从平台批次进入领域处理，再进入 read model 和 UI snapshot 的节流路径。

Should not include:

- receive 直接决定甲方任务生命周期。
- send 成功直接写 report 或 northbound response。
- UI 组件直接创建并启动任务状态机。
- store/composable 重新承载跨域业务流程。

Entry condition for `cs-feat-design`:

- 明确本批覆盖哪些旧可观测行为。
- 明确接收/发送/任务主状态 owner。
- 明确统计 read model 的 owner、key、reset 时机、生命周期、是否持久化和 UI snapshot 策略。
- 明确哪些行为可自动 fixture，哪些需要真实串口/TCP/UDP runtime validation。

## 9. Batch 4: SCOE

Goal:

- 保留 SCOE 页面入口和专项能力。
- 把 SCOE 作为声明过的领域模块或边界例外处理。
- 通过显式入口接入 receive/send/task，不把固定 source/target、命令语义和完成条件硬编码进通用链路。

Should include:

- SCOE 命令解析、状态、发送请求、完成条件。
- SCOE 测试工具记录归口。
- SCOE 与 connection/receive/send/task 的显式输入输出。
- 边界例外登记。

Should not include:

- 把 SCOE 抬成当前甲方 northbound 身份。
- 用 SCOE 测试工具记录替代统一运行主状态。
- 通用 receive/send 内长期保留 SCOE hardcode。

Entry condition for `cs-feat-design`:

- SCOE baseline 和旧系统专项行为已读。
- 明确是否有真实 SCOE 设备或模拟环境。
- 明确不能 runtime 验证的内容只能声明 fixture 或静态验证通过。

## 10. Batch 5: status / result / report / northbound

Goal:

- 在内部事实稳定后做状态摘要、结果事实、报告生成和对外边界。
- 分开 `result`、`report`、`northbound`：
  - `result` 归口内部结果事实。
  - `report` 归口报告对象和报告文件生成。
  - `northbound` 归口对外接入、投影、交付、回执和错误语义转换。

Should include:

- status 指示和内部状态摘要。
- case result / task result 的内部事实来源。
- JSON report 的内部素材归集和生成边界。
- northbound task/control/status/heartbeat/result/report/file delivery 的对外转换边界。

Should not include:

- 把旧 history / CSV / local export 当成 TestReport 或 file delivery 闭环。
- 把旧 send task 当成 `setTestTask` / `controlTestTask`。
- 把 serial/network target 当成 northbound `deviceId`。
- 在甲方口径缺失时冻结字段、枚举、错误码或验收值。

Entry condition for `cs-feat-design`:

- 若只做内部 status/result/report，可先以内部事实为直接合同。
- 若做 northbound 对外行为，必须有甲方回复、客户材料或明确的用户决策作为直接合同。
- 缺少 task/case、deviceId、stop 状态、result enum、report 必填项、HTTP/FTP completion 语义时，不能把结果判为 `pass-with-known-gaps`；应标记为 `blocked` 或只做内部边界设计。

## 11. What Can Start Before Customer Reply

可以先推进：

- Batch 1 的 frame / storage / settings。
- Batch 2 的 Electron/platform/connection 基础边界。
- Batch 3 的本地 receive/send/timed task 核心能力，但不能把本地 task 语义冻结成 northbound task。
- Batch 4 的 SCOE 专项能力和 oracle 整理，但不能并入当前甲方身份。
- Batch 5 中纯内部 status/result/report 的事实归口讨论。

需要等用户或甲方口径后再冻结：

- `subSysId`、`subSysType`、`deviceId`、设备编码和地址来源。
- `startTestCaseList` 的正式粒度。
- stop 后外部状态名。
- case result、task result、exception code、handleCode、拒绝执行枚举。
- JSON TestReport 层级、必填字段、命名和样例。
- HTTP/FTP 交付、完成通知、客户侧接收确认。
- heartbeat 响应、间隔、超时和状态查询字段。

## 12. Batch-Level Review Risks

每批进入实现和审查时都要特别防以下问题：

- `runtime` 变成新的全局大脑。
- store 变成 service locator 或跨域编排器。
- composable 变成隐藏业务 service。
- main process 以性能为理由承载业务运算、协议语义、任务推进或报告语义。
- 高频数据逐包推动页面、全局 store 或静态资产全量刷新。
- 统计 read model 写回 frame list、字段定义或配置对象。
- feature 外部绕过 public API 直接 import 内部 state/service/adapter/composable。
- northbound 口径缺失被误判成 `pass-with-known-gaps`。
- 旧代码事实被当作新系统必须照搬的架构证据。

## 13. Recommended Next Step

下一步不要直接写代码。

推荐顺序：

1. 如需正式进入 Lane C，先把本文转成 `codestable/roadmap/{slug}/{slug}-roadmap.md` 和 `{slug}-items.yaml`。
2. Batch 0 已完成后，第一批实现从 Batch 1 进入 `cs-feat-design`，直接合同应包含本文、default-preserve 范围、target structure、quality rules 和旧 frame/storage/settings baseline。
3. Batch 2 和 Batch 3 可以并行准备只读检索 prompt，提前收集真实串口/网络、高频链路、旧 receive/send/task oracle 证据。
4. 甲方回复到达后，先更新 `codestable/compound/2026-04-28-northbound-overlap-and-gap-map.md` 或新增客户回复记录，再决定 Batch 5 是否可以进入 `cs-feat-design`。

## 14. Suggested prompt for Batch 1 `cs-feat-design`

```text
本轮是东方红上位机重写 Batch 1：frame / storage / settings 的 cs-feat-design。
不写业务代码，不写接口 schema，不进入 receive/send/task/SCOE/northbound 实现。

Direct contract:
- AGENTS.md
- codestable/compound/2026-04-29-rewrite-domain-order-and-first-batches.md
- codestable/architecture/rewrite-target-structure.md
- codestable/quality/rewrite-quality-rules.md
- codestable/quality/rewrite-review-checklist.md
- codestable/compound/2026-04-28-rewrite-scope-default-preserve.md

Boundary guards:
- codestable/compound/2026-04-28-rewrite-execution-charter.md
- easysdd/compound/2026-04-27-legacy-feature-inventory-and-oracle-map.md
- 旧 frame / storage / settings 相关代码和旧 JSON 样例，只作为 legacy baseline、fixture 和 oracle 来源

目标：
1. 设计 Batch 1 的 feature design/checklist。
2. 固定 frame asset、storage、settings 的职责归口；只有存在外部消费者或跨 feature 协作时，才定义允许入口。
3. 明确旧系统可观测行为中哪些 preserve、candidate drop、deferred、not touched。
4. 明确旧 JSON 只作为迁移输入或 oracle，不污染新核心模型。
5. 明确静态资产、运行事实、统计 read model、UI snapshot 的边界，禁止把接收/发送统计写回 frame definition。
6. 明确自动 fixture、手工 checklist、runtime validation 的范围。

不要做：
- 不写业务代码。
- 不写字段 schema 或最终存储 schema。
- 不设计 receive/send/task/SCOE/northbound 细节。
- 不新增跨 feature 内部 state 访问规则。
- 不为了形式感新增 `public.ts`、runtime 层、event bus、command bus 或 DI 容器。

产物：
- codestable/features/{slug}/{slug}-design.md
- codestable/features/{slug}/{slug}-checklist.yaml
- 若发现 Batch 0 架构基线不足，只提出 blocking issue，不在 Batch 1 临场改架构。
```
