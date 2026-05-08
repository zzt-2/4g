---
doc_type: feature-design
feature: rewrite-storage-local-baseline
status: draft
date: 2026-04-30
summary: 东方红上位机重写中 storage local baseline 的 owner、边界、本地持久化/history/CSV/legacy material 范围和后续实现入口。
---

# Rewrite storage local baseline feature design

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
12. `codestable/features/rewrite-frame/rewrite-frame-design.md`
13. `codestable/features/rewrite-frame/rewrite-frame-checklist.yaml`
14. `codestable/quality/rewrite-quality-rules.md`
15. `codestable/quality/rewrite-review-checklist.md`

`codestable/architecture/rewrite-target-structure.md` 仍是目录、依赖方向和职责归口的 canonical 架构基线。

## 2. Boundary guards

- 本轮是 Lane B 单 feature design，只产出 design/checklist，不进入实现，不迁移旧代码，不写接口 schema。
- 新代码落点是 `rewrite/src/features/storage-local-baseline`；旧 `src/`、`src-electron/`、`public/` 只作为 evidence、fixture 或 oracle 输入。
- storage-local-baseline 只覆盖本地持久化、legacy JSON migration material、history/local records、CSV/local export 的边界。
- 不设计高速存储最终模型；只登记 local boundary、runtime exception 和 deferred 项。
- 不设计 report delivery、northbound file delivery、TestReport、HTTP/FTP 或客户闭环。
- 不把 history、CSV、local export 等同 report 或 northbound delivery。
- 不定义最终 file/path/dialog platform API schema。
- 不直接访问 Node/Electron/`fs`/`path`/`ipcRenderer`/`window.electron`。
- 不把旧 `DATA_PATH_MAP`、`dataStorageApi`、`historyDataApi` 当成新核心模型。
- 不进入 receive/send/task/SCOE/result/report/northbound 内部实现。
- 前端自动生成 types 文件不作为证据或合同；本轮旧系统类型形态只从可观测调用和 DTO/feature 文档边界推断。

## 3. Evidence summary

### 3.1 Contract evidence

- 目标结构将 `storage` 定义为本地持久化、历史记录、CSV、高速存储和迁移输入输出 owner；明确不拥有 northbound 文件回传协议和任务结果事实定义。
- feature boundaries 要求 storage/history/file 写入事实留在 storage，但 result truth、report object semantics、northbound FTP/HTTP delivery closure 分别归 `result`、`report`、`northbound`。
- interaction matrix 将 `receive -> storage`、`send -> storage`、`report -> storage`、`northbound -> storage` 分为不同边界；history/CSV/local export 不得等同 TestReport 或 delivery closure。
- platform surface reduction 将 files/path/dialog 归为 platform/app shell 能力；storage owns persistence semantics，platform 只提供受控文件、路径、对话框和必要的文件 I/O。
- shared tooling/app shell ownership 要求 file dialog 走 app shell + platform/files + feature adapter 的单一路径；widgets 和 app shell 不拥有导入导出业务语义。
- rewrite-frame design 已将 frame JSON 语义、校验、迁移和 frame asset owner 留在 frame；storage 只能作为持久化和 legacy material 边界，不反向定义 frame model。
- 质量规则要求 storage 迁移、history、CSV、legacy JSON material 优先进入可测试 TypeScript 层；打包态 data path、长期写入、高速存储必须登记 runtime validation。

### 3.2 Legacy evidence

本轮读取的旧系统证据只用于保留可观测行为和识别边界，不作为新架构结构模板：

- 统一配置持久化：`src/config/configDefaults.ts:5-12`、`src/api/common/dataStorageApi.ts:39-90`、`src-electron/preload/api/dataStorage.ts:13-42`、`src-electron/main/ipc/dataStorageHandlers.ts:147-190`
- 路径和打包态风险：`src-electron/preload/api/path.ts:1-17`、`src-electron/main/ipc/dataStorageHandlers.ts:151`、`src-electron/main/ipc/historyDataHandlers.ts:33-64`
- 文件元数据和 JSON/text 文件通道：`src-electron/main/ipc/fileMetadataHandlers.ts:1-120`、`src-electron/preload/api/files.ts:5-44`
- 历史数据本地记录：`src/api/common/historyDataApi.ts:18-124`、`src-electron/main/ipc/historyDataHandlers.ts:33-115`、`src-electron/main/ipc/historyDataHandlers.ts:304-470`、`src-electron/main/ipc/historyDataHandlers.ts:478-553`
- history UI 和 CSV local export：`src/pages/HistoryAnalysisPage.vue:40`、`src/components/storage/HistoryTimeSelector.vue:30`、`src/components/storage/HistoryDataSelector.vue:30`、`src/components/storage/CSVExportDialog.vue:121-143`
- receive 侧历史落盘来源：`src/stores/frames/dataDisplayStore.ts:945-999`
- settings 侧消费关系：`src/pages/settings/Index.vue:52-89`、`src/components/storage/CSVExportDialog.vue:129-143`
- 高速存储边界证据：`src/pages/storage/HighSpeedStoragePage.vue:11`、`src/components/storage/HighSpeedStoragePanel.vue:199-373`、`src/stores/highSpeedStorageStore.ts:22-31`、`src-electron/main/ipc/highSpeedStorageHandlers.ts:22-29`、`src-electron/main/ipc/highSpeedStorageHandlers.ts:104-119`、`src-electron/main/ipc/networkHandlers.ts:507-513`
- 旧 seed/oracle material：`public/data/templates/framesConfig.json`、`public/data/templates/sendInstances.json`、`public/data/templates/receiveConfig.json`、`public/data/templates/scoeSatelliteConfigs.json`、`public/data/templates/scoeSendInstances.json`、`public/data/templates/scoeReceiveCommands.json`

## 4. Design

### 4.1 Owner / not owner

| 分类 | storage owner | storage not owner |
| --- | --- | --- |
| 本地持久化 | 本地持久化策略、本地记录写入事实、history 文件生命周期、CSV/local export 语义、legacy material 归档和 fixture/oracle 入口。 | frame/settings/receive/send/task/SCOE/result/report/northbound 的领域模型和运行 truth。 |
| 旧 JSON / migration material | 管理 legacy JSON 样本、迁移输入输出材料、导入导出技术边界和兼容警告的存储侧承载。 | 为旧 JSON 内部形态扭曲 frame/settings/SCOE 等 feature 的新核心模型。 |
| history/local records | 本地 history record 的 append/load/query/cleanup/export 边界、文件生命周期和 storage read model。 | receive 解析结果含义、task/case result truth、report 对象语义、外部交付状态。 |
| CSV/local export | CSV 本地导出的选择范围、列输出、文件生成规则和用户可见 local export 结果。 | JSON TestReport、HTTP/FTP 交付、northbound completion notice、客户侧接收确认。 |
| 高速存储 | 本轮只登记旧行为、local file boundary、short-circuit 风险、runtime validation 和 deferred 后续设计。 | 高速存储最终模型、吞吐策略、真实硬件闭环、普通 receive/display/trigger 是否短路的最终口径。 |
| 平台能力 | 消费 platform/app shell 提供的受控 files/path/dialog 能力，并解释 storage 语义。 | 原生文件系统、路径解析、native dialog、打包态 data path 选择、裸 IPC 或 `window.electron` 暴露。 |

storage 的目标是成为本地持久化和本地记录语义的 owner。它不是平台文件 API 的别名，也不是 report/northbound delivery 的捷径。

### 4.2 Legacy observable behavior ledger

| 旧可观测行为 | owner feature | 处理策略 | evidence source | validation level |
| --- | --- | --- | --- | --- |
| `DATA_PATH_MAP` 列出 `framesConfig`、`sendInstances`、`receiveConfig`、SCOE 配置/实例/命令等旧数据类型，并通过统一 list/save/delete/saveAll/export/import 访问。 | storage for persistence boundary; source feature owns data semantics | preserve as compatibility material; deferred exact core model | `src/config/configDefaults.ts:5-12`、`src/api/common/dataStorageApi.ts:39-90`、`src-electron/main/ipc/dataStorageHandlers.ts:147-190` | fixture, manual |
| 旧 dataStorage 写入路径基于 `pathAPI.getDataPath()` + `public/data/templates/*.json`。 | storage with platform/path guard | candidate drop for exact path; preserve only as migration input | `src-electron/preload/api/path.ts:1-17`、`src-electron/main/ipc/dataStorageHandlers.ts:151`、`public/data/templates/*.json` | runtime, package |
| 旧 `public/data/templates/*.json` 提供 frames、send、receive、SCOE 的默认/样本数据。 | source feature owns semantics; storage owns fixture material | preserve as fixture/oracle only | `public/data/templates/framesConfig.json`、`sendInstances.json`、`receiveConfig.json`、`scoeSatelliteConfigs.json`、`scoeSendInstances.json`、`scoeReceiveCommands.json` | fixture |
| dataStorage 默认 import 只检查数组，load parse error 等异常可静默回空数组或失败结果。 | storage | preserve user-visible failure handling; candidate drop silent data loss | `src-electron/main/ipc/dataStorageHandlers.ts:130-143`、`src/api/common/dataStorageApi.ts:43-90` | fixture |
| 文件元数据通道可列出 `.json` 文件、创建目录、读写 JSON、删除文件和读取文本。 | platform owns capability; storage/app shell consume | preserve as capability category, not storage core schema | `src-electron/main/ipc/fileMetadataHandlers.ts:1-120` | fixture, manual, runtime |
| 历史页入口存在，支持时间范围选择、历史数据加载、数据项选择、图表查看和 CSV 导出入口。 | storage UI/history; widgets only display later | preserve | `src/router/routes.ts:38-40`、`src/pages/HistoryAnalysisPage.vue:40`、`src/components/storage/HistoryTimeSelector.vue:30`、`src/components/storage/HistoryDataSelector.vue:30`、`src/components/storage/CSVExportDialog.vue:121` | manual, fixture |
| 录制状态下 receive/data display 侧按小时批次缓存历史记录，并通过 `appendBatchRecords` 增量写盘。 | receive owns source facts; storage owns persisted local records | preserve boundary | `src/stores/frames/dataDisplayStore.ts:945-999`、`src/api/common/historyDataApi.ts:28-35`、`src-electron/main/ipc/historyDataHandlers.ts:101-157` | fixture, runtime |
| history 文件按小时键发现、读取 `.json/.json.gz`，并可加载多个小时文件合并排序。 | storage | preserve | `src-electron/main/ipc/historyDataHandlers.ts:33-115`、`src/api/common/historyDataApi.ts:18-124` | fixture |
| CSV local export 可按时间范围、选中项、表头、时间戳和预设路径/保存对话框输出本地 CSV。 | storage owns CSV semantics; platform owns dialog/file write | preserve | `src/components/storage/CSVExportDialog.vue:121-143`、`src-electron/main/ipc/historyDataHandlers.ts:304-470` | fixture, manual, runtime |
| settings 页面暴露历史数据保存间隔、自动开始记录、CSV 默认导出路径等可见配置。 | settings owns config facts; storage consumes snapshot | preserve interaction boundary | `src/pages/settings/Index.vue:52-89` | manual, fixture |
| history 支持删除小时文件和按保留天数清理旧文件。 | storage | preserve cleanup boundary | `src-electron/main/ipc/historyDataHandlers.ts:478-553`、`src/api/common/historyDataApi.ts:83-105` | fixture, runtime |
| `compressHourData`、`getStorageStats` 等旧 history 能力存在，但本轮未确认主要 UI 入口和优先级。 | storage | deferred | `src/api/common/historyDataApi.ts:39-69`、`src-electron/main/ipc/historyDataHandlers.ts:197-302` | fixture |
| CSV 导出表单里存在 dateFormat 等局部 UI 选项，但旧主进程导出逻辑未体现完整格式分支。 | storage UI snapshot | candidate drop or deferred fix | `src/components/storage/CSVExportDialog.vue:90`、`src-electron/main/ipc/historyDataHandlers.ts:403-456` | manual, fixture |
| 高速存储页面可配置启用、连接目标、帧头规则、文件大小/轮转、统计刷新和重置。 | storage-local boundary; high-speed final owner deferred | deferred | `src/pages/storage/HighSpeedStoragePage.vue:11`、`src/components/storage/HighSpeedStoragePanel.vue:199-373`、`src/stores/highSpeedStorageStore.ts:22-31` | manual, runtime, hardware |
| network 热路径命中高速存储规则后直接写文件并短路普通 renderer data event。 | connection/receive/storage boundary exception | deferred; runtime exception required | `src-electron/main/ipc/highSpeedStorageHandlers.ts:104-119`、`src-electron/main/ipc/networkHandlers.ts:507-513` | runtime, hardware, performance |
| 本地 history/CSV/local export 可作为报告素材候选。 | report consumes later; storage owns material | preserve as material only | `src/pages/HistoryAnalysisPage.vue`、`src-electron/main/ipc/historyDataHandlers.ts:304-470`、architecture contracts | fixture, customer |
| 本地 history/CSV/local export 当前没有 northbound HTTP/FTP/TestReport 交付闭环。 | report/northbound | not touched | `codestable/architecture/rewrite-feature-boundaries.md`、`rewrite-feature-interaction-matrix.md`、旧代码未见闭环入口 | customer |

### 4.3 State ownership

| 状态类别 | 写入 owner | 读取方 | reset / lifecycle | 是否持久化 | 本轮设计约束 |
| --- | --- | --- | --- | --- | --- |
| 静态 storage policy / local record definition | storage writes storage policy; settings writes user config values; source features write their own model definitions | storage services、settings、runtime、storage pages、future report | 应用启动加载；设置变更后显式应用；cleanup 独立命令 | 是，按 storage policy 持久化 | 不写字段 schema；不把 `DATA_PATH_MAP` 直接升级成核心模型；旧类型集合只作为 migration material。 |
| legacy JSON migration material | storage stores material index and fixtures; source feature owns migration semantics | frame/settings/SCOE 等 source feature service、tests | fixture 生命周期由测试和 migration plan 管理 | fixture yes; core model no | storage 只保管材料和导入导出边界，不解释 frame/SCOE 核心语义。 |
| 运行事实 | receive/send/task/SCOE/result 等 source owner 写运行事实；storage 写本地记录写入结果和耐久化状态 | storage read model、history page、future report | flush、shutdown、失败重试、cleanup 需要显式策略 | 本地记录 yes | storage 不定义 receive result、task result 或 report success；只记录已接收的 material 和本地写入事实。 |
| 统计 read model | storage owns local file/storage stats; high-speed stats deferred | storage pages、status/report future if explicitly allowed | resetStats/cleanup 后重算或清空；生命周期必须可审计 | 按具体 read model 决定 | 统计不写回 frame definition、settings config 或 receive source facts。 |
| UI snapshot | storage/history pages、storage composables、CSV dialog | 页面组件 | 页面打开/关闭、筛选、分页、展开、表单重置 | 默认否；需要持久化时由 settings/storage 明确 | 时间范围、选中项、导出表单、加载状态不是本地记录 truth。 |

### 4.4 Public API necessity

后续实现只在真实消费者存在时声明最小允许入口，不机械创建同构 `public.ts`。

需要 storage service/selector 的消费者：

- frame：需要通过 storage adapter/app shell 完成本地 frame asset 的导入导出、legacy JSON material 读取和 migration fixture 管理；frame JSON 语义仍归 frame。
- settings：需要持久化设置值或读取 storage-related config snapshot，例如记录开关、保存间隔、默认导出路径；settings 仍是配置事实 owner。
- receive：需要把显式 receive output 或 local record material 交给 storage 写入 history/local record；receive 仍 owns 解析事实和接收 read model。
- pages/storage/history：需要读取 history hour list、storage read model、CSV export 进度和 local file result；页面只消费 UI snapshot 和公开 selector。
- runtime：启动加载、flush、shutdown、cleanup、边界例外登记时可调用 storage 公开服务。
- report：未来如需读取 local material，只能由 report design 声明 selector/service 边界；本轮不建立长期 report contract。

不需要 storage public API 的对象：

- connection/serial/network 不能直接调用 storage 内部规则；高速存储短路必须经 runtime exception 和后续 design。
- result 不通过 storage 定义内部结果 truth。
- northbound 不直接读取 history/CSV/local export 作为 delivery closure。
- widgets 不直接读取 storage internals 或 platform files/path；只吃 page/runtime/feature 传入的 view model。
- platform 不调用 storage 业务规则；platform 只执行受控文件、路径、对话框、流式写入等能力。

禁止形态：

- 不暴露任意路径读写、动态 data type CRUD 或旧 `window.electron.dataStorage/historyData/highSpeedStorage` 形态。
- 不暴露可变 storage state、内部 store、adapter 实例或文件系统路径拼接 helper。
- 不让 report/northbound 通过 storage API 跳过 result/report owner。

root public API 口径以 `rewrite/src/features/storage-local-baseline/index.ts` 为准：

- 保留公开：`createStorageLocalService`、`createStorageLocalReader` 及其类型；`LocalMaterialAdapter`、`LocalMaterialAdapterError` 等 adapter port 类型；本地记录、history、CSV、legacy material、validation result 等只读或材料类型；`STORAGE_LOCAL_RECORD_SOURCES`、`STORAGE_MATERIAL_BUCKETS`、`getStorageHourKey`、`queryStorageLocalRecords`、`cleanupStorageLocalRecords`、`summarizeStorageHours`、`createStorageCsvMaterial` 等确定性 core helper。
- 上述 core helper 仅作为纯函数 public utility，用于本地记录筛选、小时汇总、CSV material 生成和候选枚举复用；它们不是 mutable state、platform API、path helper、adapter 实例或跨 feature 写入口。
- 视为内部：`createStorageState`、state container、fake adapter、clone/normalize/merge/createIssue/legacy classify 等 feature 内部装配和校验细节，以及 selector 的独立函数出口。外部默认通过 service/reader 读取 projection；若后续有真实消费者需要独立 selector，必须再经 root index 显式升级为 public API。

### 4.5 Runtime involvement

storage-local-baseline 需要 runtime 参与，但 runtime 只做装配、生命周期和边界路由。

runtime 可以负责：

- 应用启动：按顺序装配 storage service、settings snapshot、frame/settings 等 source feature 的加载入口。
- flush：为 history/local records 建立显式批量 flush 或触发保存时机；flush 的记录语义归 storage，source facts 归对应 feature。
- shutdown：应用退出前触发 storage flush、释放文件 adapter、记录未完成写入的可见错误。
- cleanup：周期性或用户触发的本地历史清理、过期数据删除、local export 临时状态清理。
- exception registry：登记 packaged data path、高速存储 short-circuit、main-side file stream/rotation、未来 HTTP/FTP local material access 等例外。

runtime 不得负责：

- local record 字段含义、history/CSV 语义、legacy JSON migration 规则。
- receive 解析、send 构帧、task 状态推进、SCOE 协议、result truth、report object、northbound delivery/error 语义。
- 原生文件系统、路径拼接或 native dialog 细节。

### 4.6 Platform involvement

platform/app shell 是 files/path/dialog 的能力 owner；storage 是本地持久化语义 owner。

platform/main/preload 可以承接：

- 受控文件选择、保存对话框、目录选择和对话框结果。
- 受控读取、写入、删除、列出、元数据读取、目录准备。
- 受控 data path category、packaged state 查询和路径类别解析。
- 与平台资源绑定且性能压力明显的文件 stream、rotation、batch、backpressure。

platform/main/preload 不得承接：

- `DATA_PATH_MAP` 动态业务类型生命周期。
- history/local record model、CSV 字段选择和导出语义。
- high-speed rule matching、connectionId 业务解释、stats interpretation。
- report delivery success、northbound FTP/HTTP 交付闭环。

打包态 data path 是本 feature 的 runtime blocker。旧 `process.resourcesPath/public` 或开发态 `path.resolve()/public` 只能登记为风险和 migration evidence，不能成为新长期写入策略。

### 4.7 Cross-feature boundaries

| Feature | 与 storage-local-baseline 的关系 | 明确禁止 |
| --- | --- | --- |
| frame | frame owns asset/migration semantics；storage 提供本地持久化 adapter、legacy material、导入导出文件边界。 | storage 反向定义 frame schema，或把旧 `framesConfig` 形态写进 frame core。 |
| settings | settings owns config facts；storage 读取设置快照决定保存间隔、默认导出目录等可见策略。 | storage 直接拥有 settings 页面配置 truth，或 settings 直接访问 platform file/path。 |
| receive | receive produces explicit local record material；storage persists history/local records and exposes history read model。 | receive 直接写 storage internal state，storage 定义 receive parse/result truth。 |
| send/task/SCOE | 后续可生产 local record/report material；本轮只登记 storage 可作为本地材料承载。 | storage 定义 send/task/SCOE lifecycle、完成条件或硬件语义。 |
| connection | connection/platform 提供 transport source；高速存储短路需后续 exception design。 | connection 直接调用 storage 业务规则，或把 serial/network target 等同 northbound deviceId。 |
| status | status 可读取 storage 公开的本地文件状态摘要或导出状态快照。 | status 直接读取 storage internals，或把本地文件状态抬成系统运行 truth。 |
| result | future result 可读取 storage material，但 result truth 归 result feature。 | storage 定义 case/task result。 |
| report | future report 可读取 storage material 或请求 report file persistence。 | storage 生成 report object 或声明 TestReport 已完成。 |
| northbound | future northbound 可通过 report/storage 读取交付材料。 | northbound 直接把 history/CSV/local export 当作 HTTP/FTP delivery closure。 |

### 4.8 Target internal layering

后续实现的目标分层只描述职责，不在本设计中冻结字段 schema。

| 层 | 目标职责 |
| --- | --- |
| `core` | 纯 TypeScript 规则。负责 storage policy、local record lifecycle、hour bucket、CSV local export、cleanup policy、legacy material classification 等可测试规则；不依赖 Vue、Pinia、Electron、platform、Node 或全局 store。 |
| `services` | 应用服务入口。负责 load/save/append/history query/export CSV/cleanup/import material/flush/shutdown 等用例编排，协调 core、state、adapter 和 source feature 输入。 |
| `state` | storage 本 feature 的本地持久化状态、history read model、storage stats、CSV export UI-independent status 和只读 selector；不保存 receive/result/report truth。 |
| `adapters` | 调用 platform/app shell/files/path/dialog 或 fake adapter；负责技术 I/O 转换、错误标准化和测试替换，不解释业务 schema。 |
| `composables` | 面向 storage/history 页面和 dialog 的 UI-facing 组合，管理时间范围、选中项、加载态、导出表单、错误展示和 service 调用。 |
| `components` | storage/history/CSV local export 相关 feature UI。组件通过 props/events/composables 使用 storage 能力，不直接访问 platform、旧 API 或其他 feature internal state。 |
| `fixtures` | legacy JSON samples、history hour files、CSV expected outputs、path error cases、cleanup cases、高速存储小样本规则和 oracle mapping。fixtures 是证据材料，不是新核心模型。 |

### 4.9 Fixture / oracle / test plan

Vitest 可覆盖的自动验证：

- storage core 的 hour bucket、local record append/merge、history query、cleanup cutoff、CSV local export rendering、escaping、empty data failure 和 deterministic ordering。
- dataStorage compatibility material classification：旧 `DATA_PATH_MAP` key、旧 templates 样本、数组/非数组 import、损坏 JSON 和 warning/error 分类。
- service 行为：使用 fake file/path/dialog adapter 验证 load/save/append/export/import/cleanup/flush/shutdown，不触达真实文件系统。
- adapter 行为：fake platform files/path 返回成功、取消、权限错误、文件损坏、路径不可写、目录不存在等结果时，storage service 给出可审查错误。
- selector 行为：history 页面和 future report 只能读取只读 projection，不获得可变 internal state 或 platform path helper。

fixture/oracle 建议位置：

- `rewrite/src/features/storage-local-baseline/fixtures/legacy/templates/`：保存允许范围内的旧 `public/data/templates/*.json` 摘取样本。
- `rewrite/src/features/storage-local-baseline/fixtures/legacy/history/`：保存最小 hour file、压缩/非压缩存在性样本和损坏文件样本。
- `rewrite/src/features/storage-local-baseline/fixtures/expected/csv/`：保存 CSV local export 期望输出。
- `rewrite/src/features/storage-local-baseline/fixtures/high-speed/`：只保存小样本 rule/match/short-circuit evidence，不作为最终高速存储模型。

可 fixture 的 history/CSV/local export 行为：

- 按小时键发现、加载和合并本地历史文件。
- append batch 后清空已保存 records 的边界效果。
- 时间范围筛选、选中项输出、表头/时间戳输出和空数据失败。
- cleanup by retention cutoff。
- import/export 的取消、失败、损坏文件和成功结果。

只能 manual/runtime/hardware/customer validation 的内容：

- history/storage 页面入口、时间选择器、数据项选择、CSV dialog、文件对话框可见行为需要 manual validation。
- 开发态/打包态 data path、长期写入、备份、清理、权限、路径迁移需要 runtime/package validation。
- 高速存储持续写入、文件轮转、short-circuit 是否影响普通 receive/display/trigger、高吞吐下背压需要 runtime/hardware/performance validation。
- 真实串口/TCP/UDP、SCOE 设备链路由对应 feature 做 hardware validation。
- HTTP/FTP、northbound file delivery、JSON TestReport、客户接收确认必须 customer/runtime validation，本轮不声明完成。

### 4.10 Structure health and micro-refactor stance

本轮不做代码实现，也不做“只搬不改行为”的微重构。

后续实现应新建 `rewrite/src/features/storage-local-baseline` 内部层，不迁移旧 `src/api/common/dataStorageApi.ts`、`historyDataApi.ts`、`highSpeedStorageApi.ts` 或旧 main handlers 的组织方式。旧文件中暴露的职责混杂问题只作为设计风险：

- `dataStorageHandlers` 将 data type、path 和 import/export dialog 混在一起。
- `historyDataHandlers` 将 history model、CSV generation、dialog 和文件 I/O 混在一起。
- `highSpeedStorageHandlers` 将 rule matching、stats 和文件流/轮转混在一起。
- `pathAPI.getDataPath` 的长期写入路径需重新设计和打包态验证。

这些问题不阻塞本 design，但必须进入后续 implementation checklist 和 runtime validation。

### 4.11 Blocked / deferred

- 最终 file/path/dialog platform API schema 未定义；本轮只确认 capability owner 和禁止面。
- 打包态 data path、长期写入、备份、清理和权限行为未验证，阻塞 packaged persistence acceptance。
- 高速存储最终模型、short-circuit 口径、高吞吐背压和真实链路验证 deferred。
- history/CSV/local export 可以作为 report material，但不定义 report object 或 TestReport schema。
- northbound HTTP/FTP delivery、完成通知、外部错误码和客户侧接收确认 not touched。
- receive/send/task/SCOE/result/report 内部语义不在本轮范围内。

## 5. Checklist entry

后续 `cs-feat-impl` 入口以 `codestable/features/rewrite-storage-local-baseline/rewrite-storage-local-baseline-checklist.yaml` 为准。实现阶段必须先重新确认本设计中的 direct contract、owner/not owner、state ownership、public API necessity、runtime/platform involvement 和 blocked/deferred 项，不能把本轮文档外的旧代码结构升级为新实现合同。
