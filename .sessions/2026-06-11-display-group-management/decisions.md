# Decisions — 接收帧分组管理 Feature

> 按时间。D### 决策记录，status: active/superseded。

## D001: display 刷新间隔——三视图各自独立节奏，弃用顶层 refreshCadenceMs

> status: active
> date: 2026-06-24
> 取代：无
> 被取代：无

### 决策

display 的刷新节奏按**视图类型各自独立**，不再有单一全局 cadence：
- **星座图**节奏 ← `scatter.refreshIntervalMs`（星座图弹窗入口），默认 2000ms
- **波形图**节奏 ← 各 `charts[].performance.refreshIntervalMs` 的**最小值**（chartBuffer 共享，必须统一节奏，否则不同 cadence 累积会错乱），默认 2000ms
- **表格**节奏 ← 固定常量 500ms（表格无独立配置入口）
- 顶层 `refreshCadenceMs` **弃用**：不再驱动任何视图，底栏不再显示（之前显示 500ms 但实际 200ms 是骗人）

三视图节奏互不影响。此前 `useDisplayRefresh` 写死的 `cadenceMs=200`（真正驱动）与上述 3 个配置全无关，本次彻底接通。

### 理由

用户原话："它们应该是单独的才对？两个独立"——星座图和波形图的刷新节奏应各自独立，不该共用一个全局 cadence。这是比"统一到顶层 refreshCadenceMs"（主对话预判方案）更合理的设计：不同图表对刷新频率的需求天然不同（星座图看实时性、波形图看趋势），强行统一会牺牲灵活性。

单 rAF 循环内按三组 cadence 分别判断到点（`tick` 内三个独立 `lastTime`），避免拆成多个 rAF 循环的结构复杂度。cadence 变化时 watch 重置对应 `lastTime=0`，让新值下一帧立即生效（不等老间隔走完）。

图表 cadence 取 min 而非 per-chart 独立，是因为 `chartBuffer`（时序累积缓冲）是所有图表共享的 Map，多图表若各自 cadence 会产生累积时序错乱。取 min = "按最快的图驱动累积，慢的图只是读得少"。

### 排除的替代方案

- **统一到顶层 refreshCadenceMs（主对话预判）**：否决。用户明确要"两个独立"，全局单 cadence 违背意图。且会让星座图/波形图弹窗的两个"刷新间隔"输入框失去意义。
- **每图表各自独立 rAF 节奏**：否决。chartBuffer 共享导致时序错乱，且拆多循环增加结构复杂度无收益。
- **表格跟随星座图或波形图节奏**：否决。耦合，用户改一个会连累另一个；表格用固定 500ms 最可预测。
- **删掉 refreshCadenceMs 字段**：否决（暂留）。字段保留避免持久化迁移风暴（旧 docking.json 仍含此字段，normalize 会忽略它）；只是不再驱动/显示。

### 影响范围

- `composables/use-display-refresh.ts`：重写，删写死 `cadenceMs=200` 参数，改三组独立 cadence + watch 重启；导出 `clampCadence/computeChartCadence` 纯函数供单测
- `core/normalize.ts`：scatter patch 合并补 refreshIntervalMs/sampleCount/bitWidth/pointSize（**问题 1 存储层根因**，之前漏字段导致存不住）
- `core/clone.ts`：cloneScatterDisplayPreference 补 pointSize（第二个存储 bug，clone 白名单漏字段）
- `core/types.ts` + `core/defaults.ts`：ScatterDisplayPreference 加 pointSize；scatter/chart refreshIntervalMs 默认 100/200 → 2000
- `components/ScatterConfigDialog.vue`：加 pointSize 滑块（1-12px）；refreshIntervalMs 默认 2000
- `components/ChartConfigDialog.vue`：refreshIntervalMs 默认 200 → 2000
- `widgets/ScatterChart.vue`：symbolSize 写死 6 → 读 prop pointSize（默认 4）
- `components/DisplayPanel.vue` + `pages/DisplayPage.vue`：透传 scatterPointSize；删底栏 refreshCadenceMs 显示
- `core/projection.ts`：projectScatter 签名收窄为 Pick（pointSize/refreshIntervalMs 是渲染参数非投影输入）

### 来源

S010 / 用户纠正（"它们应该是单独的才对？两个独立" + "弃用 C，底栏不再显示单一值" + "表格 500ms" + "点大小加配置"）

---

## D002: 实时录制重设计——独立路径 + 记原始字节 + 主进程写盘 + 采集点在 routingTick matched 帧

> status: active
> date: 2026-06-28
> 取代：无
> 被取代：无
> 注：第 6 项"文件格式"由 D003 细化(RCD1 升级为 RCD1+帧定义块防漂移)。核心 8 项决定仍 active。

### 决策

把 DisplayPage 的录制从"组件级定时整表快照（setInterval + appendLocalRecords）"重构为"**runtime 全局 + 事件驱动 + 原始字节落盘**"模型，8 项拍板决定（承 H013/H014 brainstorming）：

1. **持久化**：落盘到磁盘文件（`{userData}/dongfanghong/recordings/*.bin`），跨会话保留。
2. **架构**：新建 receive 层录制（独立路径），**不直接用 storage-highspeed，复用其磁盘写盘/滚动模式**（提取 disk-rotation-writer 共享工具消除 70-80% 重复）。
3. **录制模型**：记**整帧原始字节（bytes）**，查看时用 `parseReceiveFrameFields` 解析（不是整表快照，不是已解析字段）。
4. **选帧粒度**：帧级（frameId），选中即录整帧所有字段；只录接收类型帧（`direction="receive"`）。
5. **切路由**：后台继续录制（状态在全局 recordingService，不在组件）——治诉求①根因。
6. **文件格式**：二进制紧凑格式（magic "RCD1" + uint32 秒 + uint16 len + frameId + uint16 len + bytes）+ 大小滚动。
7. **配置存放**：扩展进现有 DisplayPreferences（跨会话记住选帧）。
8. **采集点**：routingTick 的 matched outcomes 处（选项A），renderer O(1) 条件 + fire-and-forget IPC，写盘在主进程。

### S015/D013 红线守约（本决策最高优先级约束）

录制采集接入 routingTick 热路径，但严格守 D013（唯一 records 写入口是 appendLocalRecords，禁止 routingTick 写盘）+ S015（renderer 无数组累积/深拷贝）：
- RecordingBridge.collect **第一行 `if (!isRecording) return`**（O(1) 早退，录制关时几乎零开销）。
- 录制是**独立路径**，不碰 storage-local 的 records 数组。
- 写盘在主进程（WriteStream 顺序 append），renderer 只 fire-and-forget（`void appendFrames`，不等 IPC 返回）。
- 初版设计曾把写盘放进 routingTick → 违反 D013（与已删的 fanOutToStorage 同构），自检推翻，写盘移到主进程。

### 教训：DisplayPreferences 加字段白名单是 5 处不是 4 处

plan T7 说加字段改 4 处（types/defaults/normalize/clone）。实测是 **5 处**：
1. types.ts（字段 + Patch）
2. defaults.ts
3. normalize.ts（逐字段校验 + fallback 兜底）
4. clone.ts（**必须防御 undefined**，旧 snapshot 的 preferences.recording 可能缺失）
5. **applyDisplayPreferencesPatch（patch 合并）**——漏这处会导致 patch 合并丢字段；hydrate 走的就是这条路径

症状：加字段后 7 个 display 测试崩（TypeError: Cannot read 'selectedFrameIds'）。修 5 处 + fixture 加字段后全绿。**后续给 DisplayPreferences 加任何字段，必须检查这 5 处 + 相关 fixture**。

### 排除的替代方案

- **照搬 storage-highspeed 全套**：否决。70-80% 结构性重复，提取 disk-rotation-writer 共享工具消除。
- **记已解析字段而非原始字节**：否决。原始字节更紧凑（源头最简）+ 查看时一次性解析成本可接受（用户拍板）。
- **采集点放传输层 tap（选项B）**：否决。用户选选项A（routingTick matched 帧），只录干净选中帧、兼容性更好。
- **写盘放 routingTick（初版设计）**：否决。违反 D013，与 fanOutToStorage 同构，自检推翻。
- **History 页本轮一起改**：否决（范围拆分）。录制出 .bin 暂无人消费是故意留的债务，下一轮 spec 做 History 查看。

### 影响范围

新增 feature `recording/`（core/types+defaults+serialization、state、services、composables、components/RecordingConfigDialog、index）+ 主进程（shared/disk-rotation-writer、recording-writer、recording-handlers）+ platform（recording facade + index）+ preload + main/index 接线 + runtime/bridges/recording-bridge + routing-tick 采集一行 + DisplayPage 删内联改用 useRecording。重构 storage-filter 复用共享工具（-141 行）。详见 S012 任务表。

### 验证

代码层全绿（recording 18 + display 82 + storage-highspeed 91 + 全量 1889 passed，11 失败全 pre-existing；tsc src 0 错；lint 本轮文件 0 error）。**⚠️ S015 目标 Linux 机实测未做**——需用户连真实数据源坐实"录制不引入卡顿 + 切路由不中断 + .bin 落盘"。不宣称"完成"直到实测过。

### 来源

S012（H014 实施型 handoff 执行）/ H013 brainstorming 8 项拍板决定 / 用户原话（"可不可以只记录设置需要记录的接收帧，然后看的时候直接解析"→ 记原始字节；"配置按钮放到录制按钮右边"→ UI 位置；"A：收 matched 帧"→ 采集点）。触发原话：见 voice.md 2026-06-28 段。

---

## D003: 录制格式演进 RCD1+帧定义块（防漂移）+ History 读取层重写 + RCD2 路线失败记录

> status: active
> date: 2026-06-28
> 取代：无（细化 D002 第 6 项"文件格式"，D002 核心 8 项仍 active）
> 被取代：无

### 决策

H015：让 History 页能查看录制的 `.bin`。三件事：
1. **格式演进**：录制格式从纯 RCD1 升级为 **RCD1 + session 头部帧定义块**（activate 时一次性写所有选中帧的 FrameAsset JSON）。防帧定义漂移——读时用内嵌定义解析，不依赖当前 frameReader。**不向后兼容老 .bin（无帧定义块的文件报错跳过，用户确认测试数据作废）。**
2. **History 读取层重写**：useHistoryData 数据源从 StorageLocalRecord 切到录制 .bin，内部模型直接换新（帧×字段×时间点），不维持旧 StorageLocalRecord 兼容形状。
3. **附带修 bug**：HistoryPage.vue:15 拼写 bug（`storageLocalService`，接口是 `storageService`）——进页必崩，前置修复。

格式布局（spec §三.1）：
```
[4B magic "RCD1"][4B frameDefBlockLen uint32][帧定义块内容][帧记录流(不变)]
帧定义块 = [uint16 count][count × (uint16 frameIdLen + frameId + uint32 jsonLen + json)]
```
frameDefBlockLen 自描述定位：解析时 magic → 读 blockLen → 跳过 → 剩余是帧记录流。

### 理由

- **帧定义漂移根治**：录制开始时把当时帧定义快照写进文件头，读时用它解析。即使以后改了帧定义，旧 .bin 仍正确解析（用内嵌定义）。
- **写入路径零改动**（S015/D013 守约）：帧定义块是 activate 时一次性写（所有选中帧一起），不是每帧写；帧记录流格式完全不变，写入路径 O(1) 追加。
- **读取粒度整文件读**：自检验证单文件最坏 ~2MB（12 帧/秒 × 1 小时），解码个位数毫秒（decodeFrameRecords 紧凑线性扫描）。不引入 mmap/流式——数据规模不值得。
- **内部模型换新**：旧 StorageLocalRecord 已废弃，没必要为它留适配层。改比"适配旧形状"大但干净。

### 核心失败机制：RCD2 路线（索引块 + 分层目录 + 多文件分流）被自检否决

用户最初提"内嵌帧定义 + 分层目录 + 一帧一文件"，据此设计的 RCD2 被自检子代理读真实代码后否决，三个致命问题：
1. **索引块布局物理写不出来**：追加式 WriteStream（`disk-rotation-writer.ts:143` `flags:'a'`）只能往尾追加，没法回头改前面的索引。要写索引只能 O(N) 每帧重写 = **正是 S015/D013 卡顿的罪魁**（与已删的 fanOutToStorage 同构）。
2. **多文件分流破坏单流模型**：N 种帧 = N 个并发流，DiskRotationWriter 只支持单流（`:56` 单 writeStream 字段）。
3. **分层目录搞坏滚动清理**：`cleanupOldFiles`（`:156-169`）平铺单目录不递归，日期目录下永不删文件 → 磁盘无限增长。

### 否决了什么

- **任何"索引块 + 分层目录 + 多文件分流"的组合**。
- SQLite（D006 原生模块 ABI 风险，单用户浏览场景不值得）。
- 为旧 StorageLocalRecord 留兼容适配层（旧格式废弃，直接换新内部模型）。
- 向后兼容老 .bin（用户确认测试数据作废，无帧定义块的文件报错跳过）。

### 可复用部分（RCD2 路线中的对的洞察）

- 用户的核心洞察①**内嵌帧定义防漂移** → Option A 采纳（RCD1 + 帧定义块）。
- 核心洞察②**时间索引加速查询** → 用文件名 ISO 时间戳 + mtimeMs 扫描实现，不靠分层目录。

### 教训

**设计存储格式前必须先确认写入原语的物理约束（追加 vs 随机访问）。** RCD2 假设了随机访问（索引块回头改），但实际是追加流。Option A 规避了全部三个问题。

### 影响范围

- 录制侧（小改）：`serialization.ts`（+帧定义块编解码纯函数）、`recording-writer.ts`（activate 写帧定义块）、`recording-handlers.ts`（handleActivate 接 frameDefinitions + 新增 list/read handlers）、`preload`（+list/read channel）、`recording-service.ts`（持 frameReader，start 取帧定义 + list/read 代理）、`platform-bridge.ts`/`platform/recording.ts`（+frameDefinitions/RecordingFileMeta/RecordingReadResult/list/read）、`feature-wiring.ts`（传 frameReader + stub 补 read）。
- History 侧（重写读取层）：新建 `recording-reader.ts`（parseRecordingFileBytes + parseRecordingToFieldSeries 纯函数）、`useHistoryData.ts`（数据源切 recording-reader + 内部模型换新）、`HistoryPage.vue`（修拼写 bug + 适配新签名 + CSV 置灰）。
- 治理：新建 S013；D002 加注（格式部分被 D003 细化）。

### 验证（诚实标注）

代码层全绿：recording 38（18 原有 + 10 reader + 10 service 新）/ display 82 / storage 91 / 全量 **1901 passed / 11 failed（全 S015 pre-existing baseline，0 新增）**；tsc src 0 新错（3 个 plugin-vue baseline）；lint 0 新增 error（7 个 pre-existing baseline）。

scenario 10 fieldName resolution 集成测试重写适配新数据源（旧测 StorageLocalRecord + frameReader 机制过时），3/3 passed，R19 测试意图在新模型下仍成立。

**⚠️ 端到端手测未做**（需真实 Electron App + 真实录数据 + Linux 目标机）：
- 录几帧 → 确认 .bin 含帧定义块
- 进 History 页（确认不崩——拼写 bug 修复）
- 选时间范围 → 加载 → 选帧/字段 → 看曲线 → 确认数据正确
- 漂移测试：改帧定义后旧 .bin 仍正确解析
- 老 .bin（无帧定义块）被跳过不崩
不宣称"完成"直到目标机实测过（与 H014/S012 一致）。

### 来源

S013（H015 实施型 handoff 执行）/ H015 brainstorming 拍板（"A：接进现有 History 页"；"完整嵌"帧定义；"可不可以只记录...看的时候直接解析"防漂移；"subagent自检一下"触发 RCD2 否决 → Option A；"不用兼容，反正现在都是测试"老 .bin 作废）。触发原话：见 voice.md 2026-06-28 段（H015）。
