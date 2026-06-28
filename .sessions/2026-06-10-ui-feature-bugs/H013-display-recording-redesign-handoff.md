# H013 实时测试页录制功能重设计 — 讨论型 Handoff

> 2026-06-28 | 讨论型 handoff(不是直接实施)
> 类型: 需求不明 → 先 brainstorm 明确 → 再 design → 再实施
> 派发对象: 新对话(用户手动开,复制本文件全部内容作为提示词)
> 关联专题: `.sessions/2026-06-11-display-group-management/`(录制在 DisplayPage)

---

## ⚠️ 给新对话的第一句话

**你是一个被派来"讨论 + 设计"的对话,不是被派来"直接改代码"的。** 用户原话:"实时测试那边的录制。有问题,需要修。"但用户列了 4 个诉求,彼此交织,需要先用 brainstorming 把需求掰开揉碎、明确每一项该怎么做、有没有取舍,再动手。**禁止凭猜测直接改代码。** 第一步永远是:读完本文件 → 读相关代码/文档 → 用 brainstorming skill 和用户逐项对齐。

---

## 一、你是谁 / 遵守什么

- 这是 **dongfanghong 项目**的 Vue3 + Electron 35 + Quasar + Pinia + TS 工业遥测上位机(重写版)。活代码全在 `rewrite/`,根目录 `_archive-legacy/` 只读。
- **目标平台是 LINUX**(银河麒麟),quasar.config.ts 只配 linux target(AppImage+deb/x64),Win11 只是开发机。设计存储方案要考虑 Linux 文件系统。
- 这是 **display feature**(接收显示/实时测试页),归口 `.sessions/2026-06-11-display-group-management/` 专题。
- **会话治理**:开工前先读 `.sessions/_registry.yaml` + `.sessions/2026-06-11-display-group-management/topic-index.md`。涉及新建 S/R/H/D 编号或改治理文档时,先重读 session-governance skill 规范。
- **目标专题当前最大编号**:display-group-management 是 S011(分组配置导入导出);ui-feature-bugs 最大 S015。录制的归属(归哪个 topic)要在讨论中和用户确认。
- **诚实优先**:定位不准就直说,不靠代码推断瞎改。

## 二、背景(为什么有这个任务)

用户在实时测试页(DisplayPage)发现录制功能多个问题,原话逐条:

1. **"录制点了之后,换到别的页面,再换回去会发现录制取消了"** —— 切路由再回来,录制状态丢了,得重新点。
2. **"应该有个录制设置,只录设置的,不然太多了"** —— 现在是无脑全录,数据量爆炸。
3. **"录制感觉应该是记下来接收到的帧(选择哪些帧记录下来),而不是把整个表全都记下来?那太多了"** —— 录制粒度应该是"按帧",不是"按整个表的当前快照"。
4. **"得好好讨论怎么存比较节省空间"** —— 存储格式要省空间。

这 4 条**不是 4 个独立 bug,而是一组交织的需求**,可能需要统一重设计录制模型(数据结构 + 触发逻辑 + 存储格式 + 持久化)。所以必须先讨论清楚再动手。

## 三、根因 / 现状(已为主对话摸清,文件:行号准确)

### 录制代码链路(全部在 DisplayPage.vue 内联,没有独立 composable)

- `rewrite/src/pages/DisplayPage.vue:426-470` —— 录制逻辑全部内联(注释自称 "inline composable, D2")
  - `:427` `const isRecording = ref(false)` 状态
  - `:428` `const recordCount = ref(0)` 已录条数
  - `:429` `const recordStartTime = ref(0)` 开始时间戳
  - `:430` `let recordInterval` setInterval 句柄
  - `:432-440` `recordElapsed` computed(计时显示)
  - `:442-462` **`function startRecording()`**:设 isRecording=true + setInterval 每秒一条
    - `:447` `const rows = displayRefresh.getTable1Rows()` 取**整个表格当前所有行**
    - `:449-458` 构造 `StorageLocalRecord`,**`fields = rows.map(r => ({key, value}))` 把整表所有字段全塞进一条 record**
    - `:459` `storageService.appendLocalRecords([record])`(fire-and-forget,没 await)
  - `:464-470` **`function stopRecording()`**:清 interval
  - **`:485-487` `onUnmounted(() => { stopRecording() })`** —— **这就是现象①的根因**:路由切走 → DisplayPage 组件卸载 → onUnmounted 调 stopRecording → 录制停止。切回来重新挂载,isRecording 又是 false。
  - `:547-574` UI:红色圆钮开始 / 灰色 stop 钮停止 + REC 徽标 + 记录数显示

### 录制数据存到哪(关键事实,影响存储方案设计)

- `rewrite/src/pages/DisplayPage.vue:30` `const storageService = runtime.features.storageService`
- `rewrite/src/features/storage-local-baseline/services/storage-local-service.ts:272` `appendLocalRecords` → `:226 appendAndPersist` → `:235/:246 adapter.writeMaterial('records', 'local-records', merged)`
- **写到内存还是磁盘,取决于注入的 adapter**:
  - `rewrite/src/features/storage-local-baseline/adapters/fake-local-material-adapter.ts:97-105` —— **只写内存 Map**,不碰磁盘,且 `cloneStorageValue` 对整个 records 数组做全量深拷贝
  - `rewrite/src/features/storage-local-baseline/adapters/real-local-material-adapter.ts:54-63` —— 真写磁盘(JSON.stringify → fileFacade.writeTextFile)
- **⚠️ 生产接线现状(主对话已实锤)**:
  - `rewrite/src/runtime/feature-wiring.ts:101` `createDefaultStorageService()` 里 `const adapter = createFakeLocalMaterialAdapter()` —— **生产用 fake,纯内存 Map**
  - `createRealLocalMaterialAdapter` 全库(排除测试)**零生产引用**;唯一使用点是 `src/__tests__/integration/storage-crud-lifecycle.spec.ts:55` 测试
  - bootstrap(`rewrite/src/app/rewriteRuntime.ts`)**从不调 `loadLocalRecords`**
  - **净效果:录制数据在生产从不落盘,App 一关全丢。** 这是设计存储方案时绕不开的前提(讨论"怎么存省空间"之前,先得明确"到底要不要落盘 / 落到哪")。这个事实是上一轮性能治理 S015 锁定的,记录在 `.sessions/2026-06-10-ui-feature-bugs/S015-routing-tick-zombie-write-removal.md:32` 和 decisions.md D013。

### History 页怎么消费录制数据(影响录制 key 格式设计)

- `rewrite/src/pages/history/useHistoryData.ts:118` 构造 `recordKey = ${item.groupId}:${item.frameId}:${item.fieldId}:${fieldName}`(**4 段**)
- `:122` 比较 `field.key !== recordKey` 就 skip —— **key 必须 4 段对齐才画点**
- 录制写入的 key(`DisplayPage.vue:455`)是 `${r.groupId}:${r.dataItemId}:${r.fieldName}`(**字面 3 段**),但 `r.dataItemId` 本身是 `${frameId}:${fieldId}` 两段(见 `use-display-refresh.ts:30-33 splitDataItemId`)→ 实际展开是 4 段。**所以现在对得上,但脆性约定**:依赖 dataItemId 永远含冒号。重设计录制时要注意这个对齐。

### 旁路发现的独立潜在 bug(讨论中提一句让用户决定要不要顺带修)

- `rewrite/src/pages/HistoryPage.vue:15` 写的是 `const storageService = runtime.features.storageLocalService`,但 `RewriteWiredFeatures` 接口(`feature-wiring.ts:73`)暴露的是 **`storageService`**(没有 Local)。属性名拼错 → 可能 History 页一进就 `undefined` 报错。**这个和录制重设计是两回事,但既然要动存储,顺便确认下。**

### 录制数据的存储模型(讨论省空间时要看)

- `rewrite/src/features/storage-local-baseline/core/`(types.ts 里 `StorageLocalRecord` 结构)
- 当前结构:`{ id, capturedAt(ISO 字符串), source, channel, fields: [{key, value}] }`,每秒一条,每条 fields 是整表所有字段。**这就是"太多了"的根源**:N 个字段 × 每秒一条 × 录制时长。

### 治理文档里录制的已知上下文

- `.sessions/2026-06-10-ui-feature-bugs/S015-routing-tick-zombie-write-removal.md` —— 路径A(录制)合法保留 / 路径B(僵尸写入)已删
- `.sessions/2026-06-10-ui-feature-bugs/decisions.md` D010(partially-superseded)、D013(根除僵尸写入)
- `.sessions/2026-06-11-display-group-management/S009-realtime-page-layout-tweak.md` —— 录制控件 UI 布局(纯样式)
- `.sessions/2026-06-11-display-group-management/voice.md:21` —— 用户原话"stat我打算让它和开始录制那按钮一行"

## 四、你要做的事(流程,严格按序)

### 第 0 步:报到 + 读现状(必做)

1. 读 `.sessions/_registry.yaml` + `.sessions/2026-06-11-display-group-management/topic-index.md`
2. 读上面"根因/现状"列的所有文件:行号(可以抽查,但 DisplayPage.vue:426-470 + storage-local-service.ts appendLocalRecords + feature-wiring.ts:101 必读)
3. 看 History 页消费链路 useHistoryData.ts(理解录制数据最终怎么被用)

### 第 1 步:brainstorming(核心,和用户逐项对齐)

**用 brainstorming skill**。把用户的 4 条诉求拆成需要拍板的设计问题,逐个和用户对齐。建议(不强制,看讨论走向)覆盖以下议题——**但这些是议题不是结论,结论必须用户拍板**:

- **议题 A:切走再回来录制被取消**
  - 期望行为是什么?切走时:(a) 自动停止录制并提示 / (b) 录制继续在后台跑 / (c) 暂停,回来可恢复?
  - 若要后台继续:`isRecording` 状态该放哪?(从组件 ref 提到全局 store / composable / 持久化?)录制定时器是组件级的,提到哪一层能跨路由存活?
  - 参考项目已有的 `usePersistentTab`(`rewrite/src/shared/`,commit `e20eaf6`)做 tab 持久化的思路。

- **议题 B:录制粒度 —— 整表快照 vs 按帧增量**
  - 现在每秒拍整表快照(`getTable1Rows()` 全量)。用户觉得"太多了"。
  - 替代方案讨论:改成"接收到的每一帧,记录一次该帧的字段"(事件驱动增量),而不是定时整表快照?两者的数据量、实现复杂度、对 History 画图的影响各是什么?
  - 注意:录制数据源 `displayRefresh.getTable1Rows()` 拿的是当前表格视图;若改成事件驱动,得从 receive 事件流取数据,链路完全不同。讨论清楚改动范围。

- **议题 C:录制设置 —— 帧级 / 字段级过滤**
  - "只录设置的"—— 设置粒度是什么?(a) 选哪些帧(frameId 级)记录 / (b) 选哪些字段(fieldId 级)记录 / (c) 两者都要?
  - 现有 display 的"分组管理"(DisplayGroupConfig,见 display-group-management S008)已经是"帧→分组→可见字段"的模型,**能否复用**作为录制的字段选择来源?还是录制要有自己独立的"录哪些"配置?
  - 设置存哪?(DisplayPreferences 扩展?独立 recording config?)

- **议题 D:存储格式 / 省空间**
  - 用户明确要"省空间"。当前每条 record 塞整表所有字段 + ISO 时间字符串 + UUID。
  - 讨论方向(用户拍板):
    - 是否落盘?(现在生产不落盘,见背景。若要落盘:接 real adapter + bootstrap 调 loadLocalRecords。这是大决策。)
    - 字段存储压缩:只存有变化的字段?时间戳用数字 epoch 而非 ISO 字符串?key 用数字 id 而非冒号字符串?
    - 滚动上限 / 每次录制 session 的容量上限?(S015 后续待办提过"录制时长很长导致 N 涨时再考虑滚动上限")
    - 注意 D010 续接二轮曾否决"records 滚动上限",但那条否决前提(B 路径数据给 History 用)已被 S015/D013 证明错误(那是僵尸写入),所以**否决逻辑已失效,不构成对新设计的约束**——但要在讨论中说清楚,别让用户以为"之前否决过所以不能做"。

- **议题 E(可选):录制数据真的需要落盘吗?**
  - 这是最根本的问题。当前生产从不落盘。如果不落盘,讨论"省空间"意义有限(内存是主要约束)。如果落盘,存储方案、文件格式、加载策略都要重新设计。**这个先问清楚。**

### 第 2 步:拍板后 → design → 实施

- brainstorming 出结论后,按结论走 design(用 writing-plans 或 frontend-design,看改动性质)
- 实施时:涉及动 storage adapter 接线(fake→real)的,要小心 S015 的性能教训(路径A 低频可以,但若改事件驱动高频写,要复测卡顿)
- 实施完按验收标准验证

## 五、验收标准

- 切走再回来录制状态的期望行为按用户拍板的方案实现并验证
- 录制粒度/过滤按用户拍板的方案实现
- 存储方案按用户拍板的方案实现
- 不引入 S015 已修复的卡顿回归(若改了写盘频率,要在目标机实测)
- 相关单测 + 集成测试通过,tsc/lint 0 新增错误
- 改了治理文档就按 session-governance 规范落档(新建 S/R/D 编号)

## 六、完成后必须做

- 更新对应 topic 的 topic-index.md(进展线索 + 当前位置)
- 若有架构/数据模型决策,落 decisions.md 新建 D### 并在 topic-index 引用
- 用户原话记 voice.md
- 不要碰 `_archive-legacy/`

## 七、边界红线

- **禁止在 brainstorming 拍板前直接改代码。** 第一步永远是讨论。
- **禁止凭主对话给的"建议议题"当结论。** 议题是给你参考的讨论框架,每一项的答案必须用户说了算。
- **禁止盲目动 storage adapter 接线**(fake→real)而不考虑 S015 性能教训。real adapter 落盘 + 高频写 = 潜在卡顿回归,要评估。
- **不要碰 northbound feature**(那是另一个对话的事)。
- **不要碰 receive-storage-bridge.ts**(已被 S015 整文件删除,不存在了)。
- **不要翻 `_wsl-claude-archive/_collection`**(52 个旧 jsonl,用户明确不读)。
- 大文件(如果用户给新性能 trace)不要直接读进上下文,用 `analyze-perf.py`(项目根)或 `analyze-longtask.py` 消化成摘要。
