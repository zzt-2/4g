# H015 History 页查看录制数据 — 实施型 Handoff

> 2026-06-28 | **实施型 handoff**(直接执行,非讨论)
> 类型: brainstorming + 设计 + 计划已全部完成 → 本对话派发去**执行实施计划**
> 派发对象: 新对话(用户手动开,复制本文件全部内容作为提示词)
> 关联专题: **`.sessions/2026-06-11-display-group-management/`**(录制 + History 都属 display feature)
> 前序: `.sessions/2026-06-11-display-group-management/H014-recording-redesign-implementation-handoff.md`(录制功能,已实施完成并合并 a3c9df1)
> 本轮治理编号(实施落档时): **S013**;更新 **D002**(格式演进)

---

## ⚠️ 给新对话的第一句话

**你是一个被派来"执行实施计划"的对话,不是被派来重新讨论设计的。** 上一轮对话(本 handoff 之前)已完成 brainstorming → 设计 → 计划三阶段,产物已落档提交(见下"产物清单")。你的任务是**按 `docs/superpowers/plans/2026-06-28-history-view-recording.md` 逐任务执行**(TDD,7 任务)。**第一步永远是:读完本文件 → 读必读文档(见 §二)→ 按 §三执行流程用 executing-plans skill 开工。** 禁止重新讨论已拍板的设计。

---

## 一、你是谁 / 遵守什么

- 这是 **dongfanghong 项目**的 Vue3 + Electron 35 + Quasar + Pinia + TS 工业遥测上位机(重写版)。活代码全在 `rewrite/`,根目录 `_archive-legacy/` 只读。
- **目标平台是 LINUX**(银河麒麟)。端到端验收涉及真实录数据 + 进 History 页手测(见 §六)。
- 这是 **display feature** 的延续:录制功能(H014/S012)已落地,本论让 History 页能查看录制的 `.bin`。

### 前置依赖状态(已就绪)
- 录制功能已实施并合并(commit a3c9df1 Merge feat/recording-redesign)。
- 录制产出的 `.bin` 是 **RCD1 格式**(只 magic + 帧记录,无帧定义块)——这是**测试数据**。
- 本轮会把格式升级为"RCD1 + 帧定义块",**老 RCD1 文件作废**(用户已确认,不向后兼容)。
- 用户实测录过 3 帧(在 `C:\Users\zzt\AppData\Roaming\Electron\dongfanghong\recordings\`),那些是老格式,本轮后读不了——正常,会跳过不崩。

### 诚实优先
- 定位不准就直说,不靠代码推断瞎改。
- 端到端手测未做就直说,不靠 vitest 声称"完成"。

---

## 二、必读文档 + 必看规范(开工前读完)

### 2.1 必读 — 产物清单(上一轮已落档提交)

| 产物 | 路径 | commit | 用途 |
|---|---|---|---|
| **设计 spec** | `docs/superpowers/specs/2026-06-28-history-view-recording-design.md` | 9136554 + 1777a80 | 架构/数据模型/格式/验收 — 先读这个理解全貌 |
| **实施计划** | `docs/superpowers/plans/2026-06-28-history-view-recording.md` | 65b8003 | **你执行的依据 — 7 任务 TDD 拆解** |

**开工第一步:读完 spec(§〇~§八),再读 plan 全文。** plan 是逐任务可执行的,每步有代码 + 命令 + 预期。

### 2.2 必读 — 规范文档(codestable/,项目架构契约)

⚠️ **这是硬约束,违反即返工。** 路径 `codestable/`:

| 文档 | 为什么必读 | 重点 |
|---|---|---|
| `codestable/architecture/rewrite-target-structure.md` | feature 布局/命名/Electron 边界/分层契约 | :308-334 Electron 边界(platform 唯一入口);renderer 不碰 fs |
| `codestable/quality/rewrite-quality-rules.md` | R1-R19 硬规则 | **R5**(renderer 不碰 fs/path/ipcRenderer)、**R6**(IPC 粗粒度)、**R19**(静态 metadata,不泄漏 raw id 到 UI——hierarchy label 要注意) |
| `CLAUDE.md`(根) | 总规范 | :103-128 Electron 边界;:275-284 shared 提取规则 |

### 2.3 必读 — 治理文档(会话治理 + 历史教训)

| 文档 | 为什么必读 |
|---|---|
| `.sessions/2026-06-11-display-group-management/decisions.md` **D002** | **录制架构决策**——本轮会**更新**它的"格式"部分(RCD1 → RCD1+帧定义块)。落档前重读 |
| `.sessions/2026-06-10-ui-feature-bugs/S015-routing-tick-zombie-write-removal.md` | **S015 性能红线**——本轮录制侧改动(T2)必须守约:写入路径 O(1) 追加不变,不在 routingTick 写盘 |
| `.sessions/2026-06-11-display-group-management/topic-index.md` | 当前专题范围边界 + 不变量 |

### 2.4 必读 — 关键代码(理解改动点)

plan 里引用的核心文件(开工前抽查):
- `rewrite/src/features/recording/core/serialization.ts` — T1 在此加帧定义块编解码(现有 RCD1 编解码,全读)
- `rewrite/src-electron/main/recording-writer.ts` — T2 改 activate 写帧定义块(全读)
- `rewrite/src/features/receive/core/field-parser.ts:158` — `parseReceiveFrameFields({frame, bytes})` — T4 用它解析,**核对返回值精确属性名**(plan 易错点 #1)
- `rewrite/src/features/receive/core/types.ts` — `ReceiveParsedFieldValue`(field id/name/value 精确名)
- `rewrite/src/pages/history/useHistoryData.ts` — T5 重写数据源 + 内部模型(全读)
- `rewrite/src/pages/HistoryPage.vue:15` — **拼写 bug**(storageLocalService,接口是 storageService),T6 修
- `rewrite/src/features/frame/core/types.ts:94-107` — FrameAsset 结构(帧定义 JSON 序列化对象)

---

## 三、执行流程(严格按序)

### 第 0 步:报到 + 验证(必做,session-governance Trigger 5)

1. 读 `.sessions/_registry.yaml` + `.sessions/2026-06-11-display-group-management/topic-index.md`
2. **验证本 handoff 至少 3 条事实声称**(见 §七验证清单,逐条核对代码)
3. 确认范围未违反 topic-index"明确不含"
4. 用 `using-superpowers` 或 `using-git-worktrees` 建隔离工作区(推荐 worktree,隔离本轮改动)

### 第 1 步:用 executing-plans 执行计划

**用户选了内联执行(executing-plans)。** 用 `superpowers:executing-plans` skill。

按 plan 的 T1→T7 顺序执行:
- 每个任务内部是 TDD(先写失败测试 → 实现 → 测试通过 → commit)
- executing-plans 会按 checkpoint 批量执行,checkpoint 处停下让你 review
- **频繁 commit**(plan 每个任务都有 commit 步骤,别攒)

### 第 2 步:验收(对照 spec §七.2 + plan §验收清单)

- 全量测试 / tsc / lint 通过
- **端到端手测(必做,见 §六)**:录几帧 → 进 History → 加载 → 看曲线
- 录制侧无回归(新 .bin 含帧定义块)

### 第 3 步:治理落档(session-governance Trigger 2)

- 新建 `.sessions/2026-06-11-display-group-management/S013-history-view-recording.md`(S### 模板)
- 更新 `topic-index.md`(加 S013 进展线索 + 当前位置)
- 用户原话记 `voice.md`(见 §八)
- **更新 `decisions.md` D002**(格式从纯 RCD1 演进为"RCD1 + 帧定义块";记录自检推翻 RCD2 的教训)。D002 状态标 `partially-superseded`(格式部分被更新),或按 governance skill 判断是否新建 D###
- ⚠️ 落档前重读 session-governance skill 规范 + D-template

---

## 四、设计已拍板的决定(不许重新讨论)

| # | 维度 | 决定 |
|---|---|---|
| 1 | 方向 | **接进现有 History 页**(不新建回放页) |
| 2 | 新旧格式 | **旧 StorageLocalRecord 废弃,只读新 .bin** |
| 3 | 格式演进 | **RCD1 基础 + session 头部帧定义块**(必填,**不向后兼容老文件**) |
| 4 | 内部模型 | **useHistoryData 直接换新**(帧×字段×时间点),不维持 StorageLocalRecord 兼容形状 |
| 5 | CSV 导出 | **本轮不做**(麻烦——要重写 createCsvFromLocalRecords 数据源),按钮置灰 |
| 6 | 读取粒度 | **整文件读**(最坏 2MB,解码个位数毫秒),不引入 mmap/流式 |
| 7 | 旁路 bug | **修 HistoryPage.vue:15 拼写 bug**(前置,进页崩) |

详见 spec §一 + §八(已确认决定)。

### 自检推翻的方案(RCD2)及其教训——别重蹈

用户最初提"内嵌帧定义 + 分层目录 + 一帧一文件",据此设计的 RCD2 被**自检子代理读真实代码后否决**,三个致命问题:
1. **索引块布局物理写不出来**:追加式 WriteStream(`flags:'a'`)只能往尾追加,没法回头改前面的索引 → 要么 O(N) 每帧重写(=S015 卡顿罪魁),要么放弃追加模型。
2. **多文件分流破坏单流模型**:N 种帧 = N 个并发流,`DiskRotationWriter` 只支持单流。
3. **分层目录搞坏滚动清理**:`cleanupOldFiles` 平铺单目录不递归,日期目录下永不删文件 → 磁盘无限增长。

**最终采 Option A**(RCD1 不动 + session 头部帧定义块),规避全部三个问题。**教训:设计存储格式前必须先确认写入原语的物理约束(追加 vs 随机访问)。** 详见 spec §一。

---

## 五、S015/D013 红线(本轮录制侧改动必须守约)

本轮 T2 会改录制侧(activate 写帧定义块)。**这是触碰 S015 红线的改动,必须守约:**

| S015 守约点 | 本轮如何保证 |
|---|---|
| 写入路径 O(1) 追加不变 | 帧定义块是 activate 时**一次性写**(所有选中帧一起写),不是每帧写。帧记录流格式完全不变 |
| 不在 routingTick 写盘 | recording-bridge.collect 不变(O(1) 早退),写盘仍在主进程 |
| renderer 不做数组累积/深拷贝 | 不变 |

**T2 的风险点**:activate 改成两参(fileConfig + frameDefinitions),调用方 feature-wiring 要同步改。改动后跑 recording 全测试确认无回归。

---

## 六、验收阈值契约(量化标准)

| 验证项 | PASS 标准 | 阈值来源 | 历史通过率 |
|--------|----------|---------|-----------|
| History 页能打开 | 进页不崩(拼写 bug 修复) | spec §7.2 #1 | 待测 |
| 列出录制文件 | 时间选择器能看到录过的 session(.bin) | spec §7.2 #2 | 待测 |
| 查看录制数据 | 选时间→加载→选帧/字段→曲线,数据与实时显示一致 | spec §7.2 #3 | 待测 |
| 帧定义漂移防护 | 改帧定义后旧 .bin 仍正确解析(用内嵌定义) | spec §7.2 #4 | 待测 |
| 老 .bin 跳过不崩 | 无帧定义块的文件报错跳过,不崩 | spec §7.2 #5 | 待测 |
| CSV 按钮置灰不崩 | 点 CSV 按钮无反应/tooltip 提示,不崩 | spec §7.2 #6 | 待测 |
| tsc | src 0 新错 | CLAUDE.md | 历史基线 |
| lint | 0 新增 error | CLAUDE.md | 历史基线 |
| 录制侧无回归 | recording 全测试通过;新 .bin 含帧定义块 | spec §7.2 #8 | 待测 |

**端到端手测(必做,T7 Step 3):**
1. 启动 App,选帧录制几秒(确认 .bin 含帧定义块——用十六进制看或 T3 的 read)
2. 进 History 页(确认不崩)
3. 选包含录制时间的时间范围 → 加载
4. 左侧 hierarchy 展开帧 → 勾选字段 → 右侧出现曲线
5. 确认曲线数据正确
6. (漂移测试)改帧定义后旧 .bin 仍正确解析
7. 老 .bin(无帧定义块)被跳过不崩

---

## 七、接收方验证(续接对话时必须完成)

- [ ] 已读取 `.sessions/2026-06-11-display-group-management/topic-index.md` 的不变量段落
- [ ] 已验证本文件中的至少 3 条关键事实声称:
  - 声称1:**录制功能已合并**(a3c9df1)→ 验证:`git log --oneline | grep "Merge feat/recording"`
  - 声称2:**HistoryPage.vue:15 拼写 bug 存在**(`storageLocalService`,接口是 `storageService`)→ 验证:读 HistoryPage.vue:15 + feature-wiring 的 RewriteWiredFeatures 接口
  - 声称3:**parseReceiveFrameFields 存在且签名是 `{frame, bytes}`** → 验证:读 `receive/core/field-parser.ts:158`
  - 声称4:**录制写入用追加式 WriteStream**(`flags:'a'`)→ 验证:读 `disk-rotation-writer.ts` 的 initializeWriteStream
- [ ] 已检查 `_registry.yaml` 中本专题(display-group-management)的 depends_on 和 conflicts_with
- [ ] 已确认当前范围未违反 topic-index"明确不含"(注意:CSV 导出明确不做;分层目录/索引块明确不做)

---

## 八、用户原话(brainstorming 拍板依据,落档时记 voice.md)

本轮 brainstorming 的关键原话(实施落档时按 voice.md 格式记):

- "不用了,咱们讨论后续的?比如历史那边咋看这个?"(开本轮讨论)
- "A:接进现有 History 页"(方向拍板)
- "A"(只读 .bin,旧格式废弃)
- **"可不可以只记录设置需要记录的接收帧(十六进制格式),然后看的时候直接解析?"** + **"我感觉加个解析定义也不会很麻烦?"** + **"一帧一个文件,然后每个文件包含帧定义...文件夹分天数,文件名分小时和名称"**(触发格式重设讨论)
- "A?我感觉加个解析定义也不会很麻烦?"(倾向全面重设)
- "A:session/小时粒度"(文件粒度,放弃一帧一文件)
- "A:完整嵌"(帧定义内嵌完整 FrameAsset)
- "A:一轮全做"(实施路径)
- **"subagent自检一下,尤其是新的格式,想想哪里可能不妥以及有没有明显更优的办法"**(触发自检,推翻 RCD2 → 采 Option A)
- "A:Option A(推荐)"(自检后定格式)
- "可以?不用兼容,反正现在都是测试,用不上完全无所谓。"(老 .bin 不兼容)
- "后者。csv导出可以带?不过不急。如果很简单你可以弄一下,麻烦就先不管了。"(内部模型换新 + CSV 简单才做→判定麻烦,不做)
- "给我交接文档吧"(要 handoff,新对话执行)

---

## 九、已知债务(原则与现实差距,声明触发解决条件)

| 债务 | 原则 | 当前状态 | 触发解决条件 |
|------|------|---------|-------------|
| **CSV 导出不支持新格式** | 录制数据应可导出 CSV | 本轮 CSV 按钮置灰。`createCsvFromLocalRecords` 是 storage-local 专有,重写数据源 = 麻烦 | 用户明确需要导出时单独做一轮:从"帧×字段×时间序列"生成 CSV |
| **History 内部模型 vs R19** | hierarchy label 不泄漏 raw frameId/UUID(R19) | T5 Step 3 的 label 可能暂用 frameId(TODO) | 实施时尽量用内嵌 frame.name;若做不到,标注 TODO 待后续 |
| **录制 S015 目标机实测** | 录制期间不引入卡顿 | 录制那轮(H014)已声明未做。本轮 T2 改了 activate,理论上不影响(一次性写),但目标机实测仍未做 | 用户在银河麒麟连真实数据源实测录制开 vs 关的 routingTick 耗时 |

---

## 十、失败数据附录(避免重蹈覆辙)

### 方案:RCD2(索引块 + 分层目录 + 多文件分流)——自检推翻

- **核心失败机制**:索引块布局物理写不出来(追加式 WriteStream 无法回头改前面的索引);多文件分流破坏单流模型;分层目录搞坏已验证的滚动清理。
- **具体数据**:子代理读 `disk-rotation-writer.ts:143`(`flags:'a'` 追加模式)、`:156-169`(`cleanupOldFiles` 平铺不递归)、`:56`(单 writeStream 字段)取证。
- **已排除方向**:**任何"索引块 + 分层目录 + 多文件分流"的组合**。也排除了 SQLite(D006 原生模块 ABI 风险,单用户浏览场景不值得)。
- **可复用部分**:用户的两个核心洞察是对的——①内嵌帧定义防漂移(Option A 采纳)②时间索引加速查询(用文件名 ISO 时间戳 + 扫描实现,不靠分层目录)。

---

## 十一、边界红线

- **禁止重新讨论已拍板的设计。**(7 项决定 + 自检推翻 RCD2 的教训,见 §四)
- **禁止在 brainstorming/设计阶段消耗时间。** 这两阶段已收口,直接执行 plan。
- **不重新引入 routingTick 写盘变更**(D013);T2 录制写入路径 O(1) 追加不变(S015)。
- **不引入 SQLite**(D006 原生模块 ABI 风险)。
- **不做分层目录 / 索引块**(自检否决)。
- **CSV 导出本轮不做**(spec §5.4)。
- **老 .bin 不向后兼容**(用户确认,测试数据作废)。
- 改治理文档前重读 session-governance skill(Trigger 2)。
- 不碰 `_archive-legacy/` / `_wsl-claude-archive/_collection`(用户明确不读)。

---

## 十二、后续自检要考虑什么(给你的清单)

执行过程中,在每个 checkpoint 用这些自检:

### 12.1 规范符合性自检(对照 §二.2)
- [ ] renderer 全程不碰 fs/path/ipcRenderer(R5)——读 .bin 在主进程(T3),renderer 经 IPC 拿字节
- [ ] IPC 粗粒度(R6)——read 用 list-files + read-file 两个 channel,不是每文件一个
- [ ] R19——hierarchy label 用 frame.name 不泄漏 raw frameId(T5 Step 3 易错点)

### 12.2 S015 红线自检(对照 §五)
- [ ] T2 activate 改两参后,帧定义块是**一次性写**(不是每帧写)
- [ ] recording-bridge.collect 不变(O(1) 早退)
- [ ] recording 全测试无回归

### 12.3 格式自洽自检
- [ ] 帧定义块用 `frameDefBlockLen`(uint32 总长)自描述定位——解析时 magic → 读 blockLen → 跳过那么多字节 → 剩余是帧记录流
- [ ] 老 .bin(无帧定义块)解析时抛错被 catch 跳过,不崩(T4 Step 1 测试覆盖)
- [ ] 新录制的 .bin 实际含帧定义块(手测确认)

### 12.4 数据正确性自检
- [ ] parseReceiveFrameFields 返回值的属性名核对正确(plan 易错点 #1)— Read `receive/core/types.ts` 的 `ReceiveParsedFieldValue`
- [ ] History 曲线数据和实时显示一致(端到端手测)
- [ ] 帧定义漂移防护验证(改帧定义后旧 .bin 仍解析对)

### 12.5 接线自检
- [ ] HistoryPage 经 `recordingService` 调 read(T2 Step 5 给 service 加了 listRecordingFiles/readRecordingFile 代理方法),不直接碰 facade
- [ ] read IPC 路径穿越防护(plan 易错点 #4):合法路径 PASS、`../etc/passwd` FAIL

---

## 十三、产物引用速查

- **设计 spec**:`docs/superpowers/specs/2026-06-28-history-view-recording-design.md`(9136554 + 1777a80)
- **实施计划**:`docs/superpowers/plans/2026-06-28-history-view-recording.md`(65b8003)— **你的执行依据**
- **前序录制 handoff**:`.sessions/2026-06-11-display-group-management/H014-recording-redesign-implementation-handoff.md`
- **D002**:`.sessions/2026-06-11-display-group-management/decisions.md`(本轮更新)
- **S015**:`.sessions/2026-06-10-ui-feature-bugs/S015-routing-tick-zombie-write-removal.md`

**执行模式:内联执行(executing-plans skill),按 plan T1→T7 逐任务 TDD,checkpoint 处 review。开工先用 executing-plans skill。**
