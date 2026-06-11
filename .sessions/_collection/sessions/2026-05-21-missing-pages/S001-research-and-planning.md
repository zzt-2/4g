# [S001] 调研 + 规划

> 2026-05-21 | 规划 | 进行中

## 目标

线1 bug修复 + 三个缺失页面深度调研 + 规划后续实施路径

## 记录

### 线1 Bug 修复（已完成）

3 个 bug 全部修复，1178/1178 tests passed + 0 lint errors：
- BF1: settleResolvers 改 Set<() => void> 支持多等待者
- BF2: runExecutionLoop finally 兜底 resolveSettle
- BF3: helpers.ts 补 storageService mock

### 线2 分析（已完成）

3 个高级分析 agent 并行完成：
- task-real Phase 2：核心已实现，只差测试收尾（~1天）
- 缺失页面：设置 60% / 存储 40% / 历史 30%
- Northbound：4 接口缺失，框架可先搭，等甲方 schema

### 深度调研（已完成）

3 个深度调研 agent 并行完成，6 个维度 × 3 页面 = 18 组调研结果。

#### 存储管理关键发现

storage-local-baseline **不是**高速存储，只覆盖本地材料管理。旧系统高速存储是三层架构：
1. UI 配置层（已部分覆盖）
2. 主进程文件操作层（完全缺失：流式写入、文件轮转）
3. 网络热路径分流层（完全缺失：`networkHandlers.ts:505-517` 等价物）

P0 阻塞项：
- Runtime 分流机制（需在 connection/network 添加热路径钩子）
- Platform 文件流支持（writeStream、checkFileSize、rotateFile）
- 高速存储规则模型（FrameHeaderRule 类型 + 匹配逻辑）

#### 历史分析关键发现

Storage 数据操作已齐全（query/load/CSV/cleanup），但 UI 层缺失严重：
- display feature 的 chartSeries 是单一数组，不支持多图表实例（1-4个）
- 缺数据项元数据注册表（label、dataType、groupId）
- 缺 Y 轴配置、颜色管理、加载进度反馈、统计计算

P0 阻塞项：
- display 多图表实例管理
- 数据项元数据注册表

#### 系统设置关键发现

Settings feature 已覆盖 7/21 项（recording/storage/general），其余分散在：
- connection（串口配置）— 已有 API 但缺 dataBits/stopBits/parity
- display（显示配置）— 已有 updatePreferences
- status（状态指示灯）— 已有 updateIndicatorConfigs
- 待确认：高速存储配置、SCOE 配置、多帧发送策略配置的 API

P0 阻塞项：最小，主要是 API 发现和连接

### 后续实施规划

每个页面的流程：**调研 → feature 扩展 → UI 设计 → UI 实施 → 验收**

推荐对话分工：

| 对话 | 内容 | Lane | 预估 |
|------|------|------|------|
| A | 系统设置页 — feature gap 确认 + 扩展 + UI 设计 | B | 1对话 |
| B | 系统设置页 — UI 实施 + 验收 | B | 1对话 |
| C | 历史分析页 — display 扩展设计（多图表 + 元数据） | B | 1对话 |
| D | 历史分析页 — display 扩展实施 | B | 1对话 |
| E | 历史分析页 — UI 设计 + 实施 | B | 1-2对话 |
| F | 存储管理页 — 高速存储 feature 设计 | B/C | 1对话 |
| G | 存储管理页 — 分流机制 + Platform 文件流 | C | 1-2对话 |
| H | 存储管理页 — UI 设计 + 实施 | B | 1对话 |
| *穿插 | task-real Phase 2 测试收尾 | A | 0.5对话 |
| *并行 | Northbound 框架搭建 | B | 1对话 |

### 历史决策补充（6 agent 回溯 S004-S012 + northbound）

以下为对主线程 15 个 session note 回溯提取的关键决策和约束，补充 §深度调研 的发现。

#### 架构层决策

| 决策 | 来源 | 影响 |
|------|------|------|
| Runtime 3 层 wiring（L0-L3），不是 5 层 | S004 D3 | 新 feature 加入 wiring 时的层级判断 |
| 无状态 routingTick，不建 EventRouter 状态机 | S004 D1 | runtime 保持 composition root |
| 消费者链模式：receive 不感知下游，bridge 分发 | S007 D3 | storage/display 集成走 bridge |
| 5 层架构：core → service → adapter → state → selector | S007 | 所有 feature 统一结构 |
| Task = 通用执行引擎，SCOE/northbound 共用 | S004 D1 | task-real Phase 2 范围确认 |
| Result ≠ Report ≠ Northbound（三层分离） | S004 | result 只管内部事实 |
| 条件匹配统一到 shared/condition/ 纯函数 | S005 | display/history 页的条件判断复用 |

#### 系统设置补充

| 事实 | 来源 | 影响 |
|------|------|------|
| Settings "只拥有配置事实，不拥有运行事实" | S004 | 配置生效归消费 feature |
| 已覆盖 7/21 项：recording(3) + storage(3) + general(1) | S004 | 确认 gap 大小 |
| 串口参数归 connection，settings 可能只做持久化 | S009 | A4 agent 需确认 connection design |
| status indicator config → 等 status feature design | S004 | 设置页中状态指示灯部分可能受限 |
| display/chart config → 等 display feature design | S004 | 设置页中显示配置部分可能受限 |
| 设置页布局 Mode C（单列居中，max-width 1120px） | S009 D2 | UI 布局已锁定 |
| FeaturePersistence.saveSettings() 已存在但启动加载未连接 | S012 | 持久化路径确认 |

#### 历史分析补充

| 事实 | 来源 | 影响 |
|------|------|------|
| History 不是独立 feature，属 display feature 页面层 | S009 | 对话 B 目标是扩 display |
| 多图表 1-4 个，有独立配置按钮 | S009 | chartSeries → charts[] 扩展方向确认 |
| 不做星座图、不做实时刷新 | S009 | 范围收缩 |
| History 布局 Mode A（master-detail）：左控制面板 + 右图表区 | S009 D2 | UI 布局已锁定 |
| display 已有 ingestSourceMaterial API | S005 | 数据注入路径存在 |
| storage 已有 appendLocalRecords + queryStorageLocalRecords | S005 | 数据层已齐全 |
| 身份对齐：display 用 frameId+fieldId，storage 用 channel+key | S009 | 需转换层 storageRecordsToDisplayMaterials |
| WaveformChart 已实现（ECharts + ChartSeriesProjection） | S011 | 可直接复用 |

#### 存储管理补充

| 事实 | 来源 | 影响 |
|------|------|------|
| storage-local-baseline 只覆盖本地材料，不是高速存储 | S012 | 高速存储需独立设计 |
| 高速存储三层缺失：UI 配置 / 主进程文件操作 / 网络分流 | S005 | 对话 D 工作量确认 |
| Platform facade 边界明确：storage 语义 owner ≠ file API 别名 | S009 | 不在 storage 里封装文件操作 |
| RealLocalMaterialAdapter：baseDir/bucket/safeId.json + 软删除 | S012 | 持久化模式可参考 |
| LazyPersistence：同步创建 → 异步 setDelegate → 启动无阻塞 | S012 | 高速存储可参考此启动模式 |
| 打包态 data path 是 runtime blocker | S009 | 需平台验证 |
| 存储管理页布局 Mode C（同设置页） | S009 D2 | UI 布局已锁定 |

#### Northbound 补充

| 事实 | 来源 | 影响 |
|------|------|------|
| 4 接口已定：setTestTask / controlTestTask / testCaseResultReport / msgReport | northbound | 与设置/存储页面无直接依赖 |
| HTTPS server 在 main process，renderer 处理业务 | northbound | 不影响页面设计 |
| "不做"清单：testDataFileDelivery + 详细 report | northbound | 存储页不承载 FTP 交付 |
| FTP facade 需新增到 platform | northbound | platform 扩展项 |
| testCase = task，翻译层 inbound/outbound | northbound | 与 task-real 耦合 |

#### 实施模式补充

| 模式 | 来源 | 适用 |
|------|------|------|
| Checklist-based acceptance：design → checklist → impl → review | S008 | 所有 feature 验收 |
| Phased implementation：types → service → adapter → wiring | S007 | 复杂 feature 拆期 |
| Consumer chain 分发，非 dispatch | S008 | 跨 feature 数据流 |
| 集测验证 1178 tests + lint 必须通过 | S011 | 每个 feature 完成标准 |

#### UI 实施约束补充

| 约束 | 来源 | 适用 |
|------|------|------|
| 47 项 UI 审计（3 P0 + 12 P1 + 4 P2）已有纠正模式 | S011 | 新页面避免重犯 |
| useAsyncAction / usePolling / useNotify / useStableKeys 必用 | S011 | 所有页面 |
| 状态声明顺序 O1：service → 业务数据 → 筛选 → UI → 派生 → 操作 | S011 | 所有页面 |
| 所有 6 页面当前是 UI skeleton | S011 | 集成时需注意 |
| HomePage 无 Settings/History/Storage 入口 | S011 | 完成后需补入口 |

### 对话级必读清单 + 子 agent 策略

#### 通用规则

**三波结构（每个主对话）：**
1. **Wave 1 事实收集**：6-9 个 agent，分 2-3 批（每批 ≤3 并发），只读不写不判断
2. **Wave 2 设计**：主线程汇总事实，做设计决策，产出设计文档
3. **Wave 3 自检**：3 个 agent 并行，拿设计结果对照规范/规则/完整性检查

**所有 UI 对话必读（Wave 1 包含或主线程预读）：**
- `codestable/quality/rewrite-frontend-conventions.md`
- `codestable/quality/rewrite-frontend-checklist.md`
- `codestable/reference/rewrite-frontend-quickref.md`

**每波之间有门槛：**
- Wave 1 全部回来 → 主线程才能做设计
- 设计完成 → Wave 3 自检 agent 才能出发
- Wave 3 全部通过 → 才进入实施

---

#### 对话 A：系统设置页 — feature gap 确认 + 设计实施

**Lane B** | 预估 1 对话 | 前置：无

**直接合同：** 本专题 S001 调研结果（§系统设置关键发现）

**Wave 1（9 agent，分 3 批）：**

**Batch 1（3 agent 并行）：**
- **A1 — settings feature types + defaults**：`rewrite/src/features/settings/core/`（types.ts、defaults.ts、normalize.ts、validation.ts）+ `src/stores/settingsStore.ts`
  → 产出：settings 类型完整结构 + 默认值 + 验证规则
- **A2 — settings service + state + selectors**：`rewrite/src/features/settings/services/settings-service.ts` + `rewrite/src/features/settings/state/` + `rewrite/src/features/settings/selectors/`
  → 产出：service 操作签名（update/replace/reset scope）+ selector 投影
- **A3 — 旧系统设置 store**：`src/stores/settingsStore.ts` + `src/stores/dataDisplayStore.ts`（配置部分）+ `src/stores/serialStore.ts`（配置部分）
  → 产出：旧系统配置项完整清单 + 归属 store 对照

**Batch 2（3 agent 并行）：**
- **A4 — connection 配置 API**：`rewrite/src/features/connection/core/types.ts`（SerialTransportConfig）+ `rewrite/src/features/connection/services/connection-service.ts`（upsertConfig/listTransportConfigs）
  → 产出：connection 配置 API 签名 + 缺失字段（dataBits/stopBits/parity）
- **A5 — display + status 配置 API**：`rewrite/src/features/display/core/types.ts` + `rewrite/src/features/display/services/display-service.ts`（updatePreferences）+ `rewrite/src/features/status/core/types.ts` + `rewrite/src/features/status/services/status-service.ts`（updateIndicatorConfigs）
  → 产出：display/status 配置 API 签名
- **A6 — command-ingress SCOE 配置**：`rewrite/src/features/command-ingress/core/types.ts` + `rewrite/src/features/command-ingress/services/`（配置管理相关）
  → 产出：SCOE 配置 API 是否暴露 + 缺失项

**Batch 3（3 agent 并行）：**
- **A7 — 持久化机制**：`rewrite/src/runtime/persistence.ts`（FeaturePersistence 接口）+ `rewrite/src/runtime/feature-wiring.ts`（哪些 feature 被持久化）
  → 产出：哪些配置已持久化 + 哪些缺失
- **A8 — 集测行为基线**：`.sessions/2026-05-19-integration-testing/S004-legacy-observable-behaviors.md` §2.10（21 项设置行为）
  → 产出：21 项行为逐一标注新系统覆盖情况
- **A9 — UI 规范速查**：`codestable/quality/rewrite-frontend-conventions.md` + `codestable/reference/rewrite-frontend-quickref.md`
  → 产出：设置页 UI 实施要点（表单组件、分组、验证反馈）

**Wave 2（主线程设计）：**
- 汇总 9 agent 事实
- 设计设置页分组结构（应用/连接/显示/状态/高级）
- 确认 feature gap → 需要扩展的 API（如串口详细参数）
- 产出设计文档

**Wave 3（3 agent 自检并行）：**
- **SC1 — 规范合规**：拿设计对照 `rewrite-frontend-conventions.md` + `rewrite-frontend-checklist.md` → 逐条检查
- **SC2 — 质量规则合规**：拿设计对照 `codestable/quality/rewrite-quality-rules.md`（R2/R4/R7/R14）
- **SC3 — 覆盖度检查**：拿设计对照 A8 的 21 项行为 → 确认无遗漏

**边界护栏：** R14（services and wiring explicit）+ R7（one owner per state）+ CLAUDE.md 配置归口

---

#### 对话 B：历史分析 — display 扩展设计实施

**Lane B** | 预估 1 对话 | 前置：无

**直接合同：** 本专题 S001 调研结果（§历史分析关键发现）

**Wave 1（9 agent，分 3 批）：**

**Batch 1（3 agent 并行）：**
- **B1 — display types + defaults**：`rewrite/src/features/display/core/types.ts` + `rewrite/src/features/display/core/defaults.ts`
  → 产出：当前显示类型结构（TableDisplayPreference/ChartDisplayPreference/ScatterDisplayPreference）
- **B2 — display service + selectors + composables**：`rewrite/src/features/display/services/display-service.ts` + `rewrite/src/features/display/selectors/` + `rewrite/src/features/display/composables/`
  → 产出：display 完整操作面（getChartSeries/updatePreferences/ingestSourceMaterial）
- **B3 — display design 文档**：`codestable/features/rewrite-display/`（如存在）+ `codestable/features/` 目录扫描看有没有 display 相关设计
  → 产出：display 设计意图 + 已知扩展点

**Batch 2（3 agent 并行）：**
- **B4 — 旧系统多图表模型**：`src/stores/historyAnalysis.ts`（重点行 45-55 配置、109-153 计算、280-362 操作）
  → 产出：多图表类型结构（chartCount/charts[]/每个图表的 title/dataItems/yAxis）+ 操作方法
- **B5 — 旧系统数据项选择模型**：`src/stores/historyAnalysis.ts`（行 232-278 数据项选择）+ `src/components/storage/HistoryDataSelector.vue`
  → 产出：分组/数据项元数据结构 + 选择操作方法
- **B6 — 旧系统时间选择 + CSV 导出**：`src/components/storage/HistoryTimeSelector.vue` + `src/components/storage/CSVExportDialog.vue` + `src/stores/historyAnalysis.ts`（行 364-386 导出）
  → 产出：时间选择交互模式 + CSV 导出配置项

**Batch 3（3 agent 并行）：**
- **B7 — storage 数据层**：`rewrite/src/features/storage-local-baseline/core/types.ts` + `rewrite/src/features/storage-local-baseline/core/history.ts` + `rewrite/src/features/storage-local-baseline/services/storage-local-service.ts`
  → 产出：storage API 对历史分析数据需求的支撑度
- **B8 — 集测行为基线**：`.sessions/2026-05-19-integration-testing/S004-legacy-observable-behaviors.md` §2.9（历史/CSV 8 项行为）
  → 产出：8 项行为逐一标注新系统覆盖情况
- **B9 — UI 规范 + 现有组件**：`codestable/quality/rewrite-frontend-conventions.md` + `rewrite/src/widgets/WaveformChart.vue` + `rewrite/src/widgets/ScatterChart.vue`
  → 产出：图表组件可复用能力 + UI 规范要点

**Wave 2（主线程设计）：**
- 确定多图表扩展方案：chartSeries → charts[] 的类型和 selector 变更
- 确定元数据注册表归属（storage 或 display）
- 设计 Y 轴配置、颜色管理、加载进度反馈
- 实施

**Wave 3（3 agent 自检并行）：**
- **SC1 — 规范合规**：对照前端 conventions + checklist
- **SC2 — 质量规则**：对照 R2（feature ownership）+ R7（one owner）— 多图表偏好归属是否正确
- **SC3 — 覆盖度检查**：对照 B8 的 8 项行为 → 确认无遗漏 + 旧系统功能项逐条对照

**边界护栏：** R7（多图表偏好归属 display，数据归属 storage）+ R4（UI 不承载逻辑）

---

#### 对话 C：历史分析 — UI 设计实施

**Lane B** | 预估 1-2 对话 | 前置：对话 B 完成

**直接合同：** 对话 B 产出的 display 扩展 + 本专题 S001 调研结果

**Wave 1（6 agent，分 2 批）：**

**Batch 1（3 agent 并行）：**
- **C1 — UI 规范全量**：`rewrite-frontend-conventions.md` + `rewrite-frontend-checklist.md` + `rewrite-frontend-quickref.md`
  → 产出：页面实施前规范要点清单（表格、表单、弹窗、布局）
- **C2 — 现有 rewrite 页面模式**：`rewrite/src/pages/DisplayPage.vue` + `rewrite/src/pages/HomePage.vue` + `rewrite/src/widgets/` 全部组件
  → 产出：现有页面组织模式 + 可复用组件清单
- **C3 — 旧系统完整 UI 交互**：`src/components/storage/HistoryAnalysisPage.vue` + `src/components/storage/HistoryTimeSelector.vue` + `src/components/storage/HistoryDataSelector.vue` + `src/components/storage/CSVExportDialog.vue`
  → 产出：完整交互流程提取（时间选择→数据加载→数据项选择→图表配置→导出）

**Batch 2（3 agent 并行）：**
- **C4 — display 扩展后的 API**：对话 B 产出（直接读对话 B 产出文件或 handoff）
  → 产出：确认可用的 display service API + selector
- **C5 — storage query API 确认**：`rewrite/src/features/storage-local-baseline/services/storage-local-service.ts` + `rewrite/src/features/storage-local-baseline/core/history.ts`
  → 产出：历史分析页面可用的 storage 查询操作签名
- **C6 — 主进程历史数据操作**：`src-electron/main/ipc/historyDataHandlers.ts`（旧系统主进程操作：getAvailableHours/loadMultipleHours/compressHourData/getStorageStats）
  → 产出：哪些操作需要 platform facade + 哪些已由 storage adapter 覆盖

**Wave 2（主线程设计 + 实施）：**
- 基于 B 的 feature 扩展 + 6 agent 事实
- 设计页面布局和组件拆分
- 实施

**Wave 3（3 agent 自检并行）：**
- **SC1 — 规范合规**
- **SC2 — 质量规则**：R4（UI 不承载业务逻辑）— 检查页面是否直接操作状态
- **SC3 — 覆盖度检查**：对照旧系统交互流程 → 确认无功能遗漏

**边界护栏：** R4（UI is not business workflow owner）+ 前端 conventions

---

#### 对话 D：存储管理 — 高速存储 feature 设计

**Lane B/C** | 预估 1 对话 | 前置：建议在 A/B 之后（积累 feature 扩展经验）

**直接合同：** 本专题 S001 调研结果（§存储管理关键发现）

**Wave 1（9 agent，分 3 批）：**

**Batch 1（3 agent 并行）：**
- **D1 — 旧系统高速存储 store**：`src/stores/highSpeedStorageStore.ts`（全部 358 行）
  → 产出：配置项结构（enabled/targetId/frameHeaders/maxFileSize/rotationCount）+ 统计字段 + 状态映射
- **D2 — 旧系统主进程文件操作**：`src-electron/main/ipc/highSpeedStorageHandlers.ts`（全部）
  → 产出：WriteStream 管理 + 文件轮转 + 二进制写入 + 规则热更新 完整行为
- **D3 — 旧系统网络分流**：`src-electron/main/ipc/networkHandlers.ts`（重点 480-520 行）+ `src/components/storage/HighSpeedStoragePanel.vue`（旧 UI）
  → 产出：分流触发条件 + 短路逻辑 + UI 交互模式

**Batch 2（3 agent 并行）：**
- **D4 — connection feature 架构**：`rewrite/src/features/connection/`（adapter 模式 + service + 事件模型 + CompositeAdapter）
  → 产出：connection 数据接收路径 + 可插入分流钩子的位置
- **D5 — platform facade 现状**：`rewrite/src/platform/`（transport.ts、files.ts、index.ts）+ `rewrite/src/runtime/routing-tick.ts` + `rewrite/src/runtime/feature-wiring.ts`
  → 产出：platform 已有能力 + 数据流路径 + 缺失的文件流 API
- **D6 — storage-local-baseline 完整审计**：`rewrite/src/features/storage-local-baseline/`（全部文件）
  → 产出：storage 当前 API + adapter 接口 + 与高速存储的关系/差距

**Batch 3（3 agent 并行）：**
- **D7 — 架构约束**：`codestable/architecture/rewrite-target-structure.md` + `codestable/compound/2026-04-28-rewrite-execution-charter.md`
  → 产出：目录结构约束 + feature 归口规则 + Electron 边界约束
- **D8 — 已有决策 + 接缝审计**：`.sessions/2026-05-18-northbound-integration/S001-closed-loop-analysis.md`（§四 main process HTTPS 决策）+ `.sessions/2026-05-19-integration-testing/S005-new-system-seam-audit.md`
  → 产出：相关已拍板决策 + 高风险接缝
- **D9 — 集测行为基线**：`.sessions/2026-05-19-integration-testing/S004-legacy-observable-behaviors.md` §2.7（存储 16 项行为）
  → 产出：16 项行为逐一标注新系统覆盖情况

**Wave 2（主线程设计，不实施）：**
- 规则模型归属（新建 feature？扩 storage？放 connection？）
- 分流机制位置（adapter 内部？runtime？main？）
- Platform 文件流 API 设计
- 产出设计文档（不写代码）

**Wave 3（3 agent 自检并行）：**
- **SC1 — 架构合规**：对照 rewrite-target-structure.md + R5/R6 确认 main/renderer 边界正确
- **SC2 — 质量规则**：对照 R2（feature ownership）+ R5（Electron boundary）确认归口不越界
- **SC3 — 覆盖度检查**：对照 D9 的 16 项行为 → 确认设计覆盖

**边界护栏：** R5 + R6 + CLAUDE.md main 不承载业务逻辑

---

#### 对话 E：存储管理 — feature 实施

**Lane B** | 预估 1-2 对话 | 前置：对话 D 完成 + Wave 3 通过

**直接合同：** 对话 D 产出的 feature 设计文档

**子 agent 策略：** 根据 D 的设计拆实施任务。按 feature/层分 agent 并行。
具体派法待 D 完成后根据设计文档规划。

**自检：** 同 Wave 3 模式，实施完后对照设计文档 + 质量规则检查。

---

#### 对话 F：存储管理 — UI 设计实施

**Lane B** | 预估 1 对话 | 前置：对话 E 完成

**直接合同：** 对话 E 的 feature 实现 + D 的设计

**Wave 1（6 agent，分 2 批）：**
- 与对话 C 同模式：UI 规范 + 现有页面 + 旧 UI + feature API 确认 + storage query + platform 操作
- 具体文件列表根据 D/E 产出调整

**Wave 3（3 agent 自检）：** 同 C 模式

---

#### 穿插对话：task-real Phase 2 测试收尾

**Lane A** | 预估 0.5 对话 | 随时可做

**必读：**
- `codestable/features/rewrite-task/task-real-design.md` — Phase 2 定义
- 现有 task 测试文件（验证哪些需更新）

**子 agent：** 不需要，主线程直接跑测试、补缺失测试即可

---

#### 并行对话：Northbound 框架搭建

**Lane B** | 预估 1 对话 | 与页面对话并行

**直接合同：** `.sessions/2026-05-18-northbound-integration/S001-closed-loop-analysis.md`

**Wave 1（6 agent，分 2 批）：**

**Batch 1（3 agent 并行）：**
- **N1 — northbound 分析文档事实提取**：`S001-closed-loop-analysis.md`（§四-§六 架构决策 + §十三 全量清单）
  → 产出：7 条已拍板决策 + 入站/出站完整清单 + 待决项
- **N2 — result + task 终态机制**：`rewrite/src/features/result/`（judgeCaseVerdict + result service）+ `rewrite/src/features/task/services/task-service.ts`（onSettled + stepResults）
  → 产出：result MVP API 签名 + onSettled 用法 + step 结果存储机制
- **N3 — command-ingress 参考模式**：`rewrite/src/features/command-ingress/`（TransportEventConsumer + ProtocolAdapter + Handler 链）
  → 产出：已有外部系统接入模式 + 可复用的架构模式

**Batch 2（3 agent 并行）：**
- **N4 — platform facade 扩展需求**：`rewrite/src/platform/`（当前 facade 全部文件）
  → 产出：需要新增的 HTTPS client + FTP facade + IPC bridge 设计
- **N5 — main process Electron 能力**：`rewrite/src-electron/main/`（main 入口 + 已有 IPC handlers 模式）
  → 产出：main 进程已有能力 + HTTPS server 放在哪里
- **N6 — 质量规则 + 架构约束**：`codestable/quality/rewrite-quality-rules.md`（R5/R6/R10）+ `codestable/architecture/boundary-northbound-collaboration-delivery.md`
  → 产出：northbound 边界约束清单

**Wave 2（主线程设计）：** 框架设计，不写完整实现

**Wave 3（3 agent 自检）：**
- **SC1 — 边界合规**：对照 R5/R6/R10 确认 main/renderer 分层正确
- **SC2 — 与 S001 决策一致性**：对照 7 条已拍板决策
- **SC3 — 接口覆盖度**：对照 §十三 全量清单确认框架覆盖

**边界护栏：** R5 + R6 + R10 + S001 已拍板 7 条决策

## 后续

- 确认上述对话分工、优先级和子 agent 策略
- 系统设置页最先启动（对话 A）
- task-real Phase 2 可穿插在任何空闲对话完成
- Northbound 框架可独立并行
