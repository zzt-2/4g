# H014 实时测试页录制功能重设计 — 实施型 Handoff

> 2026-06-28 | **实施型 handoff**(直接执行,非讨论)
> 类型: brainstorming + 设计 + 计划已全部完成 → 本对话派发去**执行实施计划**
> 派发对象: 新对话(用户手动开,复制本文件全部内容作为提示词)
> 关联专题: **`.sessions/2026-06-11-display-group-management/`**(录制在 DisplayPage,见下方专题归属讨论)
> 前序: `.sessions/2026-06-10-ui-feature-bugs/H013-display-recording-redesign-handoff.md`(讨论型,已收口)

---

## ⚠️ 给新对话的第一句话

**你是一个被派来"执行实施计划"的对话,不是被派来重新讨论设计的。** 上一轮对话已完成 brainstorming → 设计 → 实施计划三阶段,产物已落档提交(见下"产物清单")。你的任务是**按 `docs/superpowers/plans/2026-06-28-recording-redesign.md` 逐任务执行**(TDD,12 任务)。**第一步永远是:读完本文件 → 读必读规范/文档(见 §二)→ 按 §三执行流程用 executing-plans skill 开工。** 禁止重新讨论已拍板的设计。

---

## 一、你是谁 / 遵守什么

- 这是 **dongfanghong 项目**的 Vue3 + Electron 35 + Quasar + Pinia + TS 工业遥测上位机(重写版)。活代码全在 `rewrite/`,根目录 `_archive-legacy/` 只读。
- **目标平台是 LINUX**(银河麒麟),quasar.config.ts 只配 linux target。**S015 性能验收必须在目标机实测**(见 §六验收红线)。
- 这是 **display feature**(接收显示/实时测试页)。

### 专题归属(重要,先看)

**归口 `.sessions/2026-06-11-display-group-management/` 专题,实施落档编号 S012。**

用户曾问"这个应该属于 `2026-05-18-northbound-integration` 吧?"——**不对**。证据:
- northbound 专题(`topic-index.md:1-14`)是**甲方对接**(SOCC-CQ 协议、getTestCaseAll、setTestTask、FTP 用例上传、LAS 子系统),跟"录制接收帧到本地磁盘"零关系。
- 录制按钮在 DisplayPage(实时测试页),该页是 display-group-management 专题的。
- 该专题 topic-index 已有录制控件布局记录(S009),voice.md 也有录制相关原话(:21)。
- 三轮子代理 + handoff 原文(H013:7,20-22)都指向 display-group-management。

**若用户坚持换专题,以用户为准**,但落档前需走 session-governance Trigger 3(范围变更记录)。

### 诚实优先
- 定位不准就直说,不靠代码推断瞎改。
- 实测未做就直说,不靠 vitest 声称"完成"。

---

## 二、必读文档 + 必看规范(开工前读完)

### 2.1 必读 — 产物清单(上一轮已落档提交)

| 产物 | 路径 | commit | 用途 |
|---|---|---|---|
| **设计 spec** | `docs/superpowers/specs/2026-06-28-recording-redesign-design.md` | 514523a | 架构/数据模型/UI/验收标准 — 先读这个理解全貌 |
| **实施计划** | `docs/superpowers/plans/2026-06-28-recording-redesign.md` | d145042 | **你执行的依据 — 12 任务 TDD 拆解** |

**开工第一步:读完 spec(§〇~§七),再读 plan 全文。** plan 是逐任务可执行的,每步有代码 + 命令 + 预期。

### 2.2 必读 — 规范文档(codestable/,项目架构契约)

⚠️ **这是硬约束,违反即返工。** 路径 `codestable/`:

| 文档 | 为什么必读 | 重点 |
|---|---|---|
| `codestable/architecture/rewrite-target-structure.md` | feature 布局/命名/Electron 边界/分层契约 | :308-334 Electron 边界(platform 唯一入口);:152-176 feature 内部布局;:139-151 storage/display 归口 |
| `codestable/quality/rewrite-quality-rules.md` | R1-R19 硬规则 | **R5**(renderer 不碰 fs/path/ipcRenderer)、**R6**(IPC 粗粒度,不新增裸 IPC)、**R7**(单一 owner)、**R19**(静态 metadata from config 非 data stream) |
| `codestable/features/rewrite-storage-highspeed/rewrite-storage-highspeed-design.md` | 最近似的"原始字节落盘"analog | T2/T4 复用它的 WriteStream+滚动模式 |
| `codestable/reference/trick-preload-ipc-routing.md` | preload IPC 多通道路由 | T5 加 recording IPC 通道照此 |
| `codestable/reference/trick-main-handler-template.md` | 主进程 handler 模板 | T5 recording-handlers 照此 |

根目录 `CLAUDE.md` 是总规范入口,尤其 :103-128(Electron 边界)、:90-96(存储独立 feature)、:275-284(shared 提取规则:2+ feature 出现才提取)。

### 2.3 必读 — 治理文档(会话治理 + 历史教训)

| 文档 | 为什么必读 |
|---|---|
| `.sessions/2026-06-10-ui-feature-bugs/S015-routing-tick-zombie-write-removal.md` | **S015 性能红线全文** — 本计划最关键的约束来源 |
| `.sessions/2026-06-10-ui-feature-bugs/decisions.md` **D013**(:793-859) | **唯一 records 写入口是 appendLocalRecords;禁止 routingTick 写盘** — T8 的 collect 必须遵守 |
| `.sessions/2026-06-11-display-group-management/topic-index.md` | 当前专题范围边界 + 不变量 |
| `.sessions/2026-06-11-display-group-management/voice.md` | 录制相关用户原话(S009/S010) |

### 2.4 必读 — 现有代码(理解复用点)

plan 里引用的关键文件(开工前抽查,不必全读):
- `rewrite/src-electron/main/storage-filter.ts` — T2/T4 复用的滚动写盘逻辑来源(全读,130 行)
- `rewrite/src/features/storage-highspeed/` — state/service/facade 模板,T6 照此
- `rewrite/src/runtime/routing-tick.ts` — T8 加 collect 调用的位置(全读)
- `rewrite/src/features/display/core/{types,defaults,normalize,clone}.ts` — T7 改 4 处(白名单模式,S010 教训)
- `rewrite/src/features/frame/components/FrameSelector.vue` — T9 改多选
- `rewrite/src/pages/DisplayPage.vue:426-487` — T10 要删的内联录制

---

## 三、执行流程(严格按序)

### 第 0 步:报到 + 验证(必做,session-governance Trigger 5)

1. 读 `.sessions/_registry.yaml` + `.sessions/2026-06-11-display-group-management/topic-index.md`
2. **验证本 handoff 至少 3 条事实声称**(见 §七验证清单,逐条核对代码)
3. 确认范围未违反 topic-index 的"明确不含"
4. 用 `using-superpowers` 或 `using-git-worktrees` 建隔离工作区(推荐 worktree)

### 第 1 步:用 executing-plans 执行计划

**用户选了内联执行(executing-plans),不是 subagent 驱动。** 用 `superpowers:executing-plans` skill。

按 plan 的 T1→T12 顺序执行:
- 每个任务内部是 TDD(先写失败测试 → 实现 → 测试通过 → commit)
- executing-plans 会按 checkpoint 批量执行,checkpoint 处停下让你 review
- **频繁 commit**(plan 每个任务都有 commit 步骤,别攒)

### 第 2 步:验收(对照 spec §六.2 + plan §验收清单)

- 全量测试 / tsc / lint 通过
- **S015 红线:目标 Linux 机实测卡顿**(§六,不能跳)
- storage-highspeed 重构无回归(T4)

### 第 3 步:治理落档(session-governance Trigger 2/4)

- 新建 `.sessions/2026-06-11-display-group-management/S012-realtime-recording-redesign.md`(S### 模板)
- 更新 `topic-index.md`(加 S012 进展线索 + 当前位置)
- 用户原话记 `voice.md`(本轮有原话,见 §八)
- 架构/数据模型决策落 `decisions.md` 新建 D###(二进制格式、独立路径、采集点 → D### 候选)
- ⚠️ 落档前重读 session-governance skill 规范 + D-template

---

## 四、设计已拍板的 8 项决定(不许重新讨论)

| # | 维度 | 决定 |
|---|---|---|
| 1 | 持久化 | 落盘到磁盘文件 |
| 2 | 架构 | 新建 receive 层录制(独立路径,复用 storage-highspeed 磁盘模式,不直接用它) |
| 3 | 录制模型 | 记整帧原始字节(bytes),查看时解析 |
| 4 | 选帧粒度 | 帧级(frameId),选中即录整帧 |
| 5 | 切路由 | 后台继续录制(状态全局,不在组件) |
| 6 | 文件格式 | 二进制紧凑格式 + 大小滚动 |
| 7 | 配置存放 | 扩展现有 DisplayPreferences |
| 8 | 范围 | 本轮只做录制;History 改造下一轮 |

**自检后补充(也已拍板):**
- 采集点 = routingTick 的 matched outcomes 处(选项A),renderer O(1) 条件 + fire-and-forget IPC,写盘在主进程
- 配置按钮位置 = 录制按钮右边(不是弹窗入口分散)
- 选帧列表 = 只列接收类型帧(复用 FrameSelector + `direction="receive"`)
- storage-highspeed 重构复用共享写盘工具(用户认可去重,有回归兜底)

详见 spec §一。

---

## 五、S015/D013 红线(最关键约束,违反即卡顿回归)

**这是本计划最高优先级的约束。** S015 是用户亲历的性能痛点("连串口立刻卡成一坨,断开立刻好,必须重启")。

### 卡顿根因(必须理解,才能不重蹈)
1. routingTick 每 tick 无条件 `fanOutToStorage` 写 records(D013 已删此路径)
2. records 数组无上限,N 只增不减
3. 攒批触发 `writeMaterial` → fake adapter 对整个 N 数组全量深拷贝 = O(N)
4. setInterval(100ms) 无并发锁,单 tick 超时后并发 tick 各抢深拷贝 → 雪崩冻屏

### 本计划如何守约(plan §二 + T8)
| S015 根因 | 本设计规避 |
|---|---|
| O(N) 整数组深拷贝 | 录制**不碰 storage-local 数组**,无数组增长 |
| routingTick 无条件写盘 | collect 是 **O(1) 条件判断**(录制关时第一行 return),写盘在主进程 |
| 无并发锁雪崩 | 主进程 WriteStream 顺序 append;renderer fire-and-forget 不收 |

### ⚠️ 验收红线(§六详述)
**即便架构上规避,必须在目标 Linux 机实测**:
- 录制关:routingTick 耗时基线 = 重构前
- 录制开:routingTick 耗时不显著上升,无 `[routingTick] slow over 5s` warn
- 切路由再回来:录制仍在继续

**不能仅凭 vitest 声称"完成"。** 若实测卡顿,记录 trace 用 `analyze-perf.py` 消化,回 T8 优化。

---

## 六、验收阈值契约(量化标准,不能用"看起来不错")

| 验证项 | PASS 标准 | 阈值来源 | 历史通过率 |
|--------|----------|---------|-----------|
| 诉求①切路由不中断 | 开录制→切别的页→切回:REC 计时/帧数继续(不重置) | spec §六.2 #1 | 待测 |
| 诉求②③只录选中帧 | 设置弹窗只列接收帧;选中的录、未选的不录;实测确认 .bin 内容只含选中帧 | spec §六.2 #2 | 待测 |
| 诉求④省空间 | 单帧二进制大小显著小于整表快照(量化:对比 N 字段×ISO 字符串) | spec §六.2 #3 | 待测 |
| 落盘 | `{userData}/dongfanghong/recordings/*.bin` 存在;关 App 重开文件还在 | spec §六.2 #4 | 待测 |
| **S015 卡顿红线** | 录制开 vs 关,routingTick 耗时无显著上升;无 `slow over 5s` warn | D013/S015 | 待测(目标机) |
| tsc | src 0 新错 | CLAUDE.md | 历史基线 |
| lint | 0 新增 error | CLAUDE.md | 历史基线 |
| storage-highspeed 回归 | T4 重构后其现有测试全过(基线通过数不变) | plan T4 | 待测 |
| 测试 | 相关单测+集成测试通过;无新增失败(基线失败除外) | CLAUDE.md | 11 failed baseline |

---

## 七、接收方验证(续接对话时必须完成)

- [ ] 已读取 `.sessions/2026-06-11-display-group-management/topic-index.md` 的不变量段落
- [ ] 已验证本文件中的至少 3 条关键事实声称:
  - 声称1:**spec 和 plan 已落档提交**(commit 514523a / d145042)→ 验证:`git log --oneline docs/superpowers/ | head -5`
  - 声称2:**routingTick 当前无写盘逻辑**(`routing-tick.ts:138-143` 注释明文说 D013 已删)→ 验证:读 `rewrite/src/runtime/routing-tick.ts` 确认无 fanOutToStorage
  - 声称3:**生产用 fake adapter(records 不落盘)**(`feature-wiring.ts:101`)→ 验证:读 `createDefaultStorageService` 确认 `createFakeLocalMaterialAdapter`
  - 声称4:**FrameSelector 是单选**(需 T9 扩展)→ 验证:读 `FrameSelector.vue` 确认无 multiple
- [ ] 已检查 `_registry.yaml` 中本专题(display-group-management)的 depends_on 和 conflicts_with
- [ ] 已确认当前范围未违反 topic-index"明确不含"(注意:History 页改造明确不在本轮范围)

---

## 八、用户原话(brainstorming 拍板依据,落档时记 voice.md)

本轮 brainstorming 的关键原话(实施落档时按 voice.md 格式记):

- "录制点了之后,换到别的页面,再换回去会发现录制取消了"(诉求①)
- "应该有个录制设置,只录设置的,不然太多了"(诉求②③)
- "录制感觉应该是记下来接收到的帧,而不是把整个表全都记下来?那太多了"(诉求③)
- "得好好讨论怎么存比较节省空间"(诉求④)
- **"可不可以只记录设置需要记录的接收帧(十六进制格式),然后看的时候直接解析?"** → 促成"记原始字节+查看时解析"模型(拍板依据)
- "1,我指的是直接记原始的十六进制值?这样比较简单?"(确认记原始字节)
- "subagent自检一下吧。尤其是看看规范,以及有没有重复代码。配置按钮放到录制按钮右边就行。里面只选择接收类型的帧。" → 触发自检 + UI 三决定
- "看着还行"(设计批准)
- "我不咋想自己看。你直接往下吧"(spec 批准,用户授权直接进 plan)
- "2,但我打算新对话去做,你给我交接文档"(选内联执行 + 新对话 + 要 handoff)
- "这个应该属于 2026-05-18-northbound-integration 吧?" → 触发专题归属核实(结论:不对,归 display-group-management)

---

## 九、已知债务(原则与现实差距,声明触发解决条件)

| 债务 | 原则 | 当前状态 | 触发解决条件 |
|------|------|---------|-------------|
| **History 页无法消费新录制格式** | 录制数据应能被 History 页查看 | 本轮录制出 `.bin`(二进制原始字节),但 History 页仍消费旧 `StorageLocalRecord.fields`(整表快照)→ 新录制数据暂无人消费 | 下一轮 spec:History 改造为"读 .bin → parseReceiveFrameFields 解析 → 画图"。**本债务是故意留的**(范围拆分决定) |
| **旁路 bug `HistoryPage.vue:15` 拼写错** | 属性名应与接口一致 | `runtime.features.storageLocalService`(接口是 `storageService` 无 Local)→ History 页一进可能 `undefined` 崩 | 本轮不顺带修(独立 bug)。用户决定是否单开。触发:用户进 History 页报错时 |

---

## 十、失败数据附录(避免重蹈覆辙)

### 方案:初版设计把写盘放进 routingTick(已被自检推翻)

- **核心失败机制**:违反 D013/S015 字面约束("禁止 routingTick 写盘")。即便逻辑上 O(1),踩了用户亲历的红线。
- **具体数据**:初版 plan 第 1 节画图 `routingTick → recordingBridge.filter → writeRecordingChunk`,子代理自检发现这与 D013 删除的 `fanOutToStorage` 路径同构。
- **已排除方向**:**任何"在 routingTick/receive 路径里写盘"的方案**,无论 O(1) 与否,都被 D013 否决。
- **可复用部分**:采集点仍在 routingTick(只读 outcomes,不写盘),写盘移到主进程。修订后通过。

### 方案:照搬 storage-highspeed 全套(已识别重复)

- **核心失败机制**:70-80% 结构性重复(storage-filter.ts 写盘+滚动 + state + facade + handler)。
- **已排除方向**:纯复制 storage-highspeed 模式建 recording。
- **可复用部分**:提取 `disk-rotation-writer` 共享工具(T2),storage-highspeed 和 recording 都 compose 它(T4 重构 storage-filter)。

---

## 十一、边界红线(承 spec §六.3 + handoff H013)

- **禁止重新讨论已拍板的设计。**(8 项决定 + 自检补充,见 §四)
- **禁止在 brainstorming/设计阶段消耗时间。** 这两阶段已收口,直接执行 plan。
- **不碰 northbound feature**(另一专题的事)。
- **不碰 `_archive-legacy/` / `_wsl-claude-archive/_collection`**(用户明确不读,52 个旧 jsonl)。
- **不重新引入 routingTick 无条件写盘**(D013);renderer 不做数组累积/深拷贝(S015 根因)。
- **History 页改造不在本轮范围**(下一轮 spec)。
- 改治理文档前重读 session-governance skill(Trigger 2/4)。
- 大性能 trace(若有)不直接读上下文,用 `analyze-perf.py`(项目根)/ `analyze-longtask.py` 消化成摘要。

---

## 十二、后续自检要考虑什么(给你的清单)

执行过程中,在每个 checkpoint 用这些自检:

### 12.1 规范符合性自检(对照 §二.2)
- [ ] 新 feature `recording/` 布局符合 `rewrite-target-structure.md:152-176`(core/services/state/composables/index.ts)
- [ ] IPC 是粗粒度的(R6:recording 用 6 个方法 activate/deactivate/append/getStats/reset/updateConfig,不是每动作一个 IPC)
- [ ] renderer 全程不碰 fs/path/ipcRenderer(R5)
- [ ] 主进程 recording-writer 不含业务规则(只 append+滚动,业务判断在 renderer bridge)

### 12.2 S015 红线自检(对照 §五)
- [ ] T8 的 `collect` 第一行是 `if (!isRecording) return`(O(1) 早退)
- [ ] 录制代码不碰 `storage-local` 的 `appendLocalRecords`/records 数组(D013 单一入口)
- [ ] renderer 侧无数组累积/深拷贝(appendFrames 直接 fire-and-forget IPC)
- [ ] **目标机实测**(§六红线)未做就不声称完成

### 12.3 重复代码自检(对照 §二.4 + plan T2/T4)
- [ ] `disk-rotation-writer` 被 storage-filter 和 recording-writer 共同复用(不是两份拷贝)
- [ ] storage-filter 重构后,storage-highspeed 现有测试全过(基线通过数不变)

### 12.4 白名单同步自检(对照 plan T7,S010 教训)
- [ ] DisplayPreferences 加 recording 改了 **4 处**:types.ts(字段)、defaults.ts(默认)、normalize.ts(归一化)、clone.ts(深拷贝)。漏一处 → 旧数据迁移丢字段。

### 12.5 类型一致性自检
- [ ] `RecordingFrameInput` 单一来源(feature core/types.ts),shared/platform-bridge.ts 是结构等价副本(因 shared 不能 import feature)
- [ ] T3 的 recording-writer 入参用 `RecordingFrameInput`(不是另起 `RecordingWriteFrame`)

### 12.6 向后兼容自检
- [ ] FrameSelector 扩展多选后,现有单选调用方(AdvancedConfigPanel / TaskEditDialog / SendStepEditor)不报错(multiple 默认 false)
- [ ] DisplayPreferences 旧 snapshot(无 recording 字段)能被 normalize 补默认(T7 Step 6 迁移测试)

---

## 十三、产物引用速查

- **设计 spec**:`docs/superpowers/specs/2026-06-28-recording-redesign-design.md`(514523a)
- **实施计划**:`docs/superpowers/plans/2026-06-28-recording-redesign.md`(d145042)— **你的执行依据**
- **前序讨论 handoff**:`.sessions/2026-06-10-ui-feature-bugs/H013-display-recording-redesign-handoff.md`(已收口)
- **S015 全文**:`.sessions/2026-06-10-ui-feature-bugs/S015-routing-tick-zombie-write-removal.md`
- **D013**:`.sessions/2026-06-10-ui-feature-bugs/decisions.md:793-859`

**执行模式:内联执行(executing-plans skill),按 plan T1→T12 逐任务 TDD,checkpoint 处 review。开工先用 executing-plans skill。**
