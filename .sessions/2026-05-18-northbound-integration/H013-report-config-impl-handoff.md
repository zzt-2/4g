# H013 用例报告配置实施 Handoff(执行 S018 实施计划)

> 2026-06-29 | 实施型 handoff(范围已定,设计+计划已落档,直接干)
> 派发对象: 新对话(用户手动开,复制本文件全部内容作为提示词)
> 关联专题: `.sessions/2026-05-18-northbound-integration/`
> 编号说明: northbound 专题 H### 最大已到 H012,H### 本文件 H013。**报到时仍务必先看 topic-index 当前实际最大编号,+1,别撞号。**

---

## ⚠️ 给新对话的第一句话

**你是一个被派来"执行一份已写好的实施计划"的对话。** 设计和计划都已落档(spec + 9-task plan),你的任务就是按计划 TDD 逐 task 实施 + 每步验证。但**这不是无脑照抄**——计划里的 file:line 引用可能已漂移(自检阶段发现 feature-wiring 系统性 +4 偏移),测试代码里的 fixture 占位 `{ /* base fixtures */ }` 需要你读现有 spec 补全。每步都要诚实标注验证状态,联调是最终判据(见下"诚实红线")。

第一步:报到 → 读完本文件 + 所有必读文档 → 按 plan 的 Task 1→9 顺序 TDD 实施 → 每个 task 自检 → 最后标"待联调"。

---

## 一、你是谁 / 遵守什么

- 这是 **dongfanghong 项目**的 Vue3 + Electron + Quasar + Pinia + TS 工业遥测上位机(重写版)。活代码在 `rewrite/`,`_archive-legacy/` 只读。
- 这是 **northbound feature**(对接甲方集成控制子系统,我们是激光载荷测试子系统 LAS)。
- **会话治理**:开工前读 `.sessions/_registry.yaml` + `.sessions/2026-05-18-northbound-integration/topic-index.md`(重点看"当前状态"+"已知未做"+ D008)。
- **报到时编号**:看 topic-index 实际最大 S### 和 H###,+1。本任务应是 S018(实施笔记)+ H013(本文件)。
- **诚实优先**:这是含联调的任务,代码过了单测不等于通了。真实联调(连甲方)的结论才是真相。连不上就直说连不上,不靠推断。

## 二、背景(一段话)

甲方要的用例执行报告分三层。第三层 TestReport.json(FTP 上传 + 通知)的**管道**此前已铺好,但内容是写死的假数据(`DEFAULT_MOCK_CONFIG`:永远"上电状态/载波同步锁定/误码率"、testValue 永远 0x0001)。H012 原计划"接 reportDataCollector 从执行链路采集真实数据",经 brainstorm 验证为**错误方向**(采集的是帧字段匹配结果 step-N/0x01,无业务语义;且缺配置维度)。D008 拍板正确方向:**每用例一份配置清单驱动**,用户配三类(checkPoints/statisticsItems/attachItems)每类字段项,task 跑完按清单从 DisplayService 取 displayValue(解析值"锁定"非 0x01)填报告。配置归 command-ingress(D004 范式),northbound 跨读。

## 三、你必读的文档(按顺序,全部必读,不要跳)

### 1. 本任务的设计 spec + 实施计划(核心,必读)
- **`rewrite/docs/superpowers/specs/2026-06-28-report-config-design.md`** —— 设计全文(数据模型/数据流/接线缺口/UI/不做项/验收)。**这是权威设计,一切以它为准。**
- **`rewrite/docs/superpowers/plans/2026-06-29-report-config.md`** —— 9 个 task 的 TDD 实施步骤。**你照这个干。** 但注意:计划里的 file:line 可能漂移,测试 fixture 有占位需补全(见第六节"自检要点")。

### 2. 治理文档(报到 + 守不变量)
- `.sessions/_registry.yaml`(本专题 active 状态 + depends_on)
- `.sessions/2026-05-18-northbound-integration/topic-index.md`(重点:S017 之后的"当前状态"+"已知未做")
- `.sessions/2026-05-18-northbound-integration/decisions.md` 的 **D004**(映射表归 command-ingress 不变量)+ **D008**(本任务决策,推翻 H012)

### 3. 你要照抄范式的现有代码(spec/plan 反复引用,必读)
| 范式 | 照抄文件 | 你的新文件对齐它 |
|------|---------|----------------|
| **CRUD 纯函数 + 守卫** | `rewrite/src/features/command-ingress/core/catalog-mapping.ts` | `core/report-config.ts` |
| **导入导出 IO**(serialize + parseFromJson + 逐项中文错误) | `rewrite/src/features/display/core/group-io.ts` | `services/report-config-io.ts` |
| **文件存储**(version + atomic write + .bak + hydrate) | `rewrite/src/features/task/services/task-template-file-storage.ts` | `services/report-config-file-storage.ts` |
| **LazyHolder 延迟注入** | `rewrite/src/features/command-ingress/services/docking-file-storage.ts:71-94`(`LazyDockingStorage` + `createEmptyDockingStorage`)+ `rewrite/src/app/rewriteRuntime.ts:26-39`(`LazyPersistence`)+ `:318-344`(`hydrateDockingData` 样板) | `LazyReportConfigStorage` |
| **northbound options 可选 port 注入** | `rewrite/src/features/northbound/services/northbound-service.ts:113-123`(看 batchRegistry 怎么进)+ `:237-246`(feature-wiring 怎么传) | reportConfigProvider/displayFieldReader 注入 |
| **导入导出 UI**(双路径 Electron/浏览器 + 确认框) | `rewrite/src/features/display/components/GroupConfigDialog.vue:145-225` | CommandIngressPage 的导入导出回调 |

### 4. 甲方文档(报告格式权威,对照字段语义)
- `rewrite/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-文件传输与结果上报.md` **L187-452**(TestReport.json 完整结构,checkPoints/statisticsItems/attachItems/testParsInfo 字段定义)—— 联调核对真实报文时回这里。

## 四、你要遵守的规范(不变量,违反会埋雷)

1. **D004 不变量**(三层职责):
   - **task feature 纯粹**:TaskTemplate **零甲方字段**(本任务 task feature 零改动,验证:grep task 模板无 reportConfig 字段)
   - **command-ingress 持配置 + UI**:报告配置数据 + 编辑 UI 都在这
   - **northbound 只读消费**:不持有业务规则,reportConfigProvider 从 command-ingress 传进来(type-only import,不耦合)
2. **D008 决策**:报告内容配置驱动(非执行链路采集);取 displayValue(非原始值);纯字段值无文字类型;不做期望/判定;reportDataCollector 不接线。
3. **S014/S017 教训(关键,反复栽过)**:**可选字段 + 单测手动传值 + runtime wiring 漏接 = 静默失败温床**。本任务 reportConfigProvider 必须走 **LazyHolder 时序模式**(同步建空壳 → bootstrap 异步 hydrate → setDelegate),**且必须测"setDelegate 前返回 undefined"这条分支**——这正是 S014/S017 漏掉的那条。
4. **导入导出规范**:走文件存储(`state/xxx.json` + atomic write + .bak),**不新开 localStorage**(那是被废弃方向,S016 已把对接数据迁文件)。导入用抛异常式校验 + 逐项中文错误(参考 group-io/task-template-io,不是 isXxx 守卫式——那是 localStorage 脏数据兼容用)。
5. **字段选择 `direction:'receive'`**:`listFieldReferences({ frameId, direction: 'receive' })`,**必须带 direction**,否则把 send 帧字段也列进候选,用户选错取不到值(对照 SendStepEditor.vue:40 用 direction:'send')。

## 五、诚实红线(违反=宣称完成的谎言)

- 🔴 **禁止只过单测就宣称完成。** 联调是最终判据。代码过单测后**标"待联调"**,不写"完成"。
- 🔴 **禁止靠推断说"应该通了"。** 连不上甲方就直说卡在哪。
- 🔴 **禁止 fallback 假数据。** 没配 ReportConfig 的用例,报告三类为空 `[]`(**不** fallback DEFAULT_MOCK_CONFIG)。诚实空着。
- 🔴 **不要碰** `_archive-legacy/`、display feature(录制重设计是另一专题)、工作树里 ui-feature-bugs 的未提交改动。
- 🔴 **reportDataCollector 死代码不删。** 那套逻辑废弃了,但文件/spec 留着(避免 baseline 动 + 范围爆炸)。`northbound-service.ts` 的 `?.collect` 可选链自然短路即可,别删字段定义和现有单测。

## 六、自检要点(后续自检必须考虑这些 — 你和你的 subagent 都要查)

这是本 handoff 的重点之一。每完成一个 task,或派 subagent 自检时,**必须覆盖以下检查**:

### A. 计划与实际代码的对齐(防 file:line 漂移)
- spec/plan 自检阶段已发现 `feature-wiring.ts` 行号系统性 **+4 偏移**(spec 写 :233-242 实际 :237-246,displayService 写 :165 实际 :169)。
- **自检必须核验**:plan 里所有 file:line 引用,对照实施时的实际行号。漂移属正常(文件在动),功能描述对就行,但行号要更新或以 grep 定位为准。

### B. 测试 fixture 占位补全(防假绿)
- plan 的 Task 4/5 测试代码里有 `{ /* base fixtures */ } as any` 和 `/* ...现有必填... */` 占位。
- **这是故意的**——我不知道现有 `test-report-generator.spec.ts` / `northbound-service.spec.ts` 顶部的 fixture 长啥样。
- **自检必须确认**:执行者读了现有 spec 顶部、把占位换成真实的 instance/verdict/config/helper 构造。占位没补全 = 测试在骗自己。

### C. 三大阻塞性问题(已在 spec 修订版解决,自检确认落实)
1. **LazyHolder 时序**:reportConfigProvider 走 LazyReportConfigStorage,测试覆盖"setDelegate 前返回 undefined"(Task 3 的 LazyReportConfigStorage 测试 + Task 5 的"空壳阶段返 undefined"集成测试)。**没覆盖这条 = 没防住 S014/S017 温床。**
2. **direction:'receive'**:FrameFieldPicker 的 listFieldReferences 必须带(Task 7 Step 4)。**不带 = UI 列错字段。**
3. **field-parser 行号**:displayValue 真源在 `field-parser.ts:148-156`(labelFor),不是 :210(:210 是调用点)。plan/D008 已修正,自检别再写错。

### D. 内部一致性
- 三类(checkPoints/statisticsItems/attachItems)的 `toItem` 映射:checkPoints 用 `'checkPoint'` nameField + 带 result 判定;statisticsItems/attachItems 用 `'itemName'` + 纯值无判定。**自检确认**这两条分支对齐甲方文档 L234-318(checkPoint 必带 result,statistics/attach 可不带)。
- ReportItem.msg 是可选(`string | undefined`),填报告时 `undefined → ''`(甲方 TestReportCheckPoint.msg 是必填 string)。**自检确认**兜底。
- displaySnapshot 取不到 fieldId → testValue 填空串 `''`(诚实标记"没采到",不编造)。**自检确认**。

### E. 范围/边界
- `usingCollected` 变量(`test-report-generator.ts:126`)在清死代码后也成死变量,**一并删**。但 `collectedCheckPoints/collectedProcessSteps` 入参**保留**(接口兼容,实际 undefined 不触发)。
- reportDataCollector 现有单测(`report-data-collector.spec.ts`)**不删不动**,否则 baseline 会动。
- task / display feature **零改动**(守 D004)。自检确认:grep task 模板无新字段、display 无改动。

### F. 接线完整性(防漏接)
自检 feature-wiring.ts 的 createNorthboundService 调用,**确认传了**:
- `reportConfigProvider`(闭包调 reportConfigStorage.getByTemplateId)
- `displayFieldReader`(= displayService,它的 getSourceFields() 已存在 display-service.ts:251)

**漏传任何一个 = 报告生成时取不到数据 = 静默失败。** 这正是 S014(漏传 testCaseConfig)/ S017(漏传 reportedSnapshotStorage)同病。

## 七、接口变更清单(实施产生的)

### 新增(command-ingress)
- `ReportConfig` / `ReportItem` 类型(`core/report-config.ts`)
- CRUD 纯函数:upsertReportConfig/removeReportConfig/findReportConfig/createEmptyReportConfig/moveReportItem/isReportConfig/isReportItem
- IO:`serializeReportConfigs`/`parseReportConfigsFromJson`/`EXPORT_SCHEMA_VERSION`(=1)
- 文件存储:`createReportConfigFileStorage`/`LazyReportConfigStorage`(state/report-configs.json, SCHEMA_VERSION=1)
- UI 组件:ReportConfigEditor.vue / ReportCategoryEditor.vue / FrameFieldPicker.vue

### 修改(northbound)
- `NorthboundServiceOptions` 加 `reportConfigProvider?` + `displayFieldReader?`
- `GenerateTestReportInput` 加 `reportConfig?` + `displaySnapshot?`
- `uploadTestReportAndNotify` 改用 reportConfig + displaySnapshot(移除 collected 取数)
- `generateTestReport` 三类改配置驱动;删 :126 usingCollected + :134-136 死代码

### 修改(runtime / page)
- feature-wiring.ts:加 reportConfigStorage holder + 注入两个 port
- rewriteRuntime.ts:加 hydrateReportConfigData
- CatalogMappingPanel.vue:嵌入 ReportConfigEditor + 导入导出按钮
- CommandIngressPage.vue:接持久化回调

## 八、失败数据附录(H012 是失败方向,记录避免重蹈)

**失败方向:H012 的"接 reportDataCollector 从执行链路采集"**

- **核心失败机制**:reportDataCollector 从 task 执行事件采的是"帧字段匹配结果"(`report-data-collector.ts:49` 确实产出 `checkPoint: 'step-N'`、`testValue: matchedValue`),而甲方 checkPoints 要带业务语义的指标(载波同步锁定/误码率)。采集出来的字段名是 `step-N`、值是 `0x01`,**没有业务意义**。
- **另一个错位**:执行链路采的值是原始值(0x01),用户要的是表格解析值("锁定")。两套数据源同根(receive outcome)但 displayValue 不在执行链路快照里(fieldValueProvider 只存 value 不存 displayValue,且 key 是纯 fieldId 会重名覆盖——receive-event-source-bridge.ts:8-11)。
- **被 ruled out**:执行链路自动采集、从 wait-condition step 派生 checkPoint(用户明确"字段不一定 wait,报告和 wait 完全无关")。
- **可复用部分**:report-data-collector.ts 的 onStepResult/collect 接口形状(但本任务不接它);TestReport 的类型定义(三类结构)。

## 九、已知债务(本任务不解决,诚实记录)

| 债务 | 原则/目标 | 当前状态 | 触发解决条件 |
|------|----------|---------|-------------|
| processAndDatas(每步执行轨迹) | 甲方报告要求 | 本任务留空([]),不配置驱动 | 用户后续决定要不要也改配置驱动 |
| checkPoint 的 expectValue / result 判定 | 甲方 checkPoint expectValue/result 标必选 | 本任务纯取值,这两项空/不判定 | 用户后续要"通过/不通过"判定时另起特性 |
| report-data-collector.ts dead code | 不再需要 | 保留文件 + 单测(避免 baseline 动) | 下一个清理轮统一删 |
| statisticsItems/attachItems 的 expectValue/result | 文档标可选 | 本任务不填 | 联调有甲方反馈再补 |
| resources/deviceIds/testParsInfo/initPars/setPars/step时间 | 执行链路产不出 | 留空 | 联调按甲方反馈决定是否补数据源 |

## 十、验证阈值(实施完成的硬标准)

| 验证项 | PASS 标准 | 阈值来源 |
|--------|----------|---------|
| report-config 单测 | CRUD + 守卫全过 | Task 1 |
| report-config-io 单测 | round-trip + 逐项错误全过 | Task 2 |
| report-config-file-storage 单测 | **含 LazyHolder setDelegate 前后时序**(防 S014/S017)| Task 3 |
| generateTestReport 单测 | reportConfig 驱动三类 + 取不到值空串 + 无配置三类空 | Task 4 |
| northbound-service 集成测试 | uploadTestReportAndNotify 填 displayValue + 空壳阶段返空 | Task 5 |
| feature-wiring 接线 | reportConfigProvider + displayFieldReader 都注入(grep 确认)| Task 6 |
| 全量 vitest | 0 新增失败(stash baseline 对照) | Task 9 |
| tsc / lint | 0 新增错误 | Task 9 |
| **联调(最终判据)** | 我方上传成功 + 甲方收到三类正确解析 + displayValue 是"锁定"非 0x01 | **留给用户** |

## 十一、工作树状态提醒

当前 `main` 工作树有 **ui-feature-bugs 专题的 ~17 个未提交改动**(routing-tick/storage/display 等,见 `git status`)。这些**与本任务文件不重叠**,但混在一起。

**实施前必须处理**(plan 的"前置"已写):先把那堆 WIP **stash 或拆 commit**,确保本任务的每次 commit 干净、不混入无关改动。本任务要碰的文件(feature-wiring.ts / northbound-service.ts / test-report-generator.ts / command-ingress 新建文件 / CatalogMappingPanel.vue / CommandIngressPage.vue / rewriteRuntime.ts)目前**应是干净的**——实施前用 `git status` 确认这些文件没有未提交脏改动。

---

## 接收方验证(续接对话时必须完成)

- [ ] 已读取本文件全文
- [ ] 已读 spec(`2026-06-28-report-config-design.md`)+ plan(`2026-06-29-report-config.md`)
- [ ] 已读 topic-index 的不变量段落 + D004 + D008
- [ ] 已验证本文件中的至少 3 条关键事实声称(列出验证了哪些)
- [ ] 已检查 _registry.yaml 中本专题的 depends_on 和 conflicts_with
- [ ] 已确认当前范围未违反"明确不含"(task 模板纯度、不新建 feature、不动 overridablePaths)
- [ ] 已处理工作树(ui-feature-bugs WIP stash/commit)
- [ ] 已理解"诚实红线"(联调是最终判据,代码过单测标"待联调"不写"完成")

## 完成后必须做

- 更新 `topic-index.md`(进展线索 + 当前状态 + 已知未做更新)
- S018 实施笔记(若新建,记录实施过程 + 验证结果 + 联调结论)
- 用户原话记 voice.md(实施中用户的关键反馈/纠正)
- 不要碰 `_archive-legacy/`、display feature、ui-feature-bugs 的 WIP

## 最后一句话

这个项目反复栽在"代码过了单测、prod 静默失败"(S014/S017)。本任务的 LazyHolder 时序测试就是专门防这个的——**别跳过那条"setDelegate 前返 undefined"的测试**。它看起来多余(谁会在 hydrate 前就生成报告?),但正是这种"不会发生"的场景在 runtime wiring 漏接时静默吃掉真实数据。测它,不是为了"通过",是为了"将来谁改坏了立刻红"。
