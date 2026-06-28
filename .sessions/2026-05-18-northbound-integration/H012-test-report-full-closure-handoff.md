# H012 甲方用例报告第三层 TestReport 完整闭环(含联调)— 实施 Handoff

> 2026-06-28 | 实施型 handoff(范围已定,直接干,但要诚实标注每步验证)
> 派发对象: 新对话(用户手动开,复制本文件全部内容作为提示词)
> 关联专题: `.sessions/2026-05-18-northbound-integration/`
> 编号说明: northbound 专题 H### 最大已到 H011(docking-history-inmemory-refactor),本文件 H012。**新对话报到时仍务必先看 topic-index 当前实际最大编号,按实际+1,别撞号。**

---

## ⚠️ 给新对话的第一句话

**你是一个被派来"实施 + 联调"的对话。** 用户已明确范围:"甲方那边,用例发完后需要的那个报告,得搞一搞" + 选了"完整闭环(含联调)"。范围清晰,不是讨论型。但**每一步都要诚实标注验证状态**——这个项目反复栽在"代码过了单测、prod 静默失败"(S014/S017 bug③ 同病),所以本任务的"联调"是最终判据,代码过单测不等于完成。

第一步:读完本文件 → 读现状代码/文档 → 按"你要做的事"分步实施 → 每步验证 → 最后联调。

## 一、你是谁 / 遵守什么

- 这是 **dongfanghong 项目**的 Vue3 + Electron 35 + Quasar + Pinia + TS 工业遥测上位机(重写版)。活代码在 `rewrite/`,`_archive-legacy/` 只读。
- 这是 **northbound feature**(对接甲方集成控制子系统 SOCC-CQ-CCS,我们是激光载荷测试子系统 SOCC-CQ-LAS)。
- **会话治理**:开工前读 `.sessions/_registry.yaml` + `.sessions/2026-05-18-northbound-integration/topic-index.md`(很长,重点看 S017 之后的"当前状态"和"已知未做")。
- **报到时编号**:看 topic-index 实际最大 S### 和 H###,+1,别撞号。northbound 专题当前最大大概是 S017(getTestCaseAll↔setTestTask 闭环首通)。H### 看列表。
- **诚实优先**:这是联调任务,代码过了不等于通了。真实联调(连甲方)的结论才是真相。连不上就直说连不上,不靠推断。

## 二、背景(甲方要的报告是三层)

甲方要求的用例执行报告分三层(见 `.sessions/2026-05-18-northbound-integration/topic-index.md` 的 S007 报告链路分析):

| 层 | 接口 | 内容 | 现状 |
|----|------|------|------|
| 第一层 | msgReport(`POST /api/report/msgReport`) | 实时进度,每 step 完成上报 | ✅ 已闭环含测试 |
| 第二层 | testCaseResultReport(`POST /api/report/testCaseResultReport`) | 任务终态 verdict(success/fail/tbd) | ✅ 已闭环含测试 |
| **第三层** | **TestReport.json**(FTP 上传 + `testDataFileTranslationComplete` 通知) | 详细报告(checkPoints 期望vs实测 / processAndDatas 每步配置+结果 / statisticsItems) | 🟡 **管道全铺好,水龙头没拧开,且零集成测试** |

**本任务 = 第三层 TestReport 完整闭环。** S017 已经把 getTestCaseAll↔setTestTask 闭环首通跑通(2026-06-24),所以"用例能发下来 + 能执行"已通,本任务专注"执行完的报告"。

## 三、根因 / 现状(已为主对话摸清,文件:行号准确)

### 第三层 TestReport 链路逐环状态(11 环,10 通 1 堵)

| 环节 | 文件:行号 | 状态 |
|------|-----------|------|
| 数据结构定义 | `rewrite/src/features/northbound/core/test-report-generator.ts:5-59` | ✅ 对齐甲方 05 文档 |
| 生成器纯函数 `generateTestReport` | `test-report-generator.ts:114-164` | ✅ collected 优先 + mock fallback |
| mock 占位数据 `DEFAULT_MOCK_CONFIG` | `test-report-generator.ts:61-95` | ✅ 4 checkPoints + 3 steps 硬编码 |
| **真实数据采集器 `createReportDataCollector`** | `rewrite/src/features/northbound/services/report-data-collector.ts:18-77` | ✅ 写完,6 单测过(send→processSteps, wait→checkPoints) |
| step 数据入口接线 | `northbound-service.ts:270` `handleStepResult` 里 `options.reportDataCollector?.onStepResult(...)` | 🟡 可选链,runtime collector 是 undefined |
| settled 触发上传 | `northbound-service.ts:203` reportTaskResult → `:209-256 uploadTestReportAndNotify` | ✅ |
| collected 取数 | `northbound-service.ts:220` `options.reportDataCollector?.collect(...)` | 🟡 可选链短路,永远 undefined |
| generateTestReport 调用 | `northbound-service.ts:222-230` 传了 collected(但是 undefined) | ✅(但传的 undefined) |
| FTP 上传 | `northbound-service.ts:232-242` 路径 `${basePath}/TestReport_${taskId}.json` | ✅ |
| testDataFileTranslationComplete 通知 | `northbound-service.ts:244-252` fileType='TestReport' | ✅ |
| FTP 基础设施全链路 | `src-electron/main/ftp-handlers.ts:24-53` + preload `:216-220` + `platform/ftp.ts` | ✅ basic-ftp 真实接通 |
| **ftpFacade 注入** | `feature-wiring.ts:210` | ✅ 传了 |
| **❌ reportDataCollector 注入** | `feature-wiring.ts:206-215 createNorthboundService` | **❌ 没传!(致命缺口)** |
| **❌ 集成测试** | `northbound-service.spec.ts` | **❌ uploadTestReportAndNotify 零覆盖** |
| index.ts 导出 generateTestReport / createReportDataCollector | `northbound/index.ts:1-77` | ❌ 未导出(影响外部可测性) |

### 致命缺口详解(主对话已实锤)

`rewrite/src/runtime/feature-wiring.ts:206-215` `createNorthboundService` 调用:

```typescript
const northboundService = createNorthboundService({
  taskService,
  resultService,
  httpFacade: httpFacade!,
  ftpFacade: ftpFacade ?? undefined,
  connectionSnapshot: () => ...,
  reportedSnapshotStorage,
  batchRegistry,
  // ❌ reportDataCollector 没传!
});
```

- grep 全文件 `reportDataCollector` / `createReportDataCollector` **0 匹配** —— 没 import 也没传。
- 后果:`northbound-service.ts:220` `options.reportDataCollector?.collect(...)` 永远可选链短路 → `generateTestReport` 的 `collectedCheckPoints/collectedProcessSteps` 永远 undefined → **永远 fallback 到 DEFAULT_MOCK_CONFIG 硬编码 mock 数据**。任务真实跑了 27 步,TestReport 里写的还是"上电状态/载波同步/发送帧"那套假数据。
- **这是 S014/S017 bug③ 同病**:可选字段 + 单测手动传值 + runtime wiring 漏接 = 静默失败。`createReportDataCollector` 工厂存在、有 6 单测全过,但**从未被任何生产代码调用创建实例**。
- 集成测试零覆盖:spec 里触发 reportTaskResult 的测试(`northbound-service.spec.ts:1166` 附近)**没传 ftpFacade**,守卫 `if (!config?.ftp || !ftp) return`(`:217`)直接 return,TestReport 上传分支**从未被任何测试触发过**。

### 旁路发现的小问题(顺手清)

- `test-report-generator.ts:134-136` `usingCollected` 分支的 `.map` 和 fallback 分支**逻辑完全一样**(三元两分支同体),是死代码。不影响功能但该清理。
- `report-data-collector.ts:40/49/58` stepName 是 `step-${stepIndex}`(不是真实步骤名)。而 msgReport 那边 `translateStepResult`(`outbound-translator.ts:71`)取的是 `stepDef.name`。**两边取数逻辑不一致**——processAndDatas.stepName 甲方文档要的是真实步骤名("终端接入/进行ping操作"这种),collector 没从 stepDef.name 取。这是报告内容正确性问题,要修。

## 四、你要做的事(按顺序,每步验证)

### 第 0 步:报到 + 读现状(必做)

1. 读 `.sessions/_registry.yaml` + `.sessions/2026-05-18-northbound-integration/topic-index.md`(重点读 S017 + "当前状态" + "已知未做")
2. 读上面"根因/现状"列的所有文件:行号(必读:`feature-wiring.ts:200-215` + `northbound-service.ts:186-256, 260-281` + `report-data-collector.ts` 全文 + `test-report-generator.ts` 全文)
3. 读甲方文档报告相关段落:
   - `rewrite/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-文件传输与结果上报.md` —— L1-185(testDataFileTranslationComplete 接口)+ L187-452(**TestReport.json 完整结构,这是报告内容的权威定义**)+ L455-594(fileTranslationComplete)+ L596-728(testCaseResultReport)
   - `rewrite/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/09-数据转发与实时上报.md` L188-330(msgReport,对比 stepName 取数)
4. 读 `.sessions/2026-05-18-northbound-integration/H004-test-report-handoff.md`(在仓库根 `.sessions/` 下,不在 rewrite/ 下)—— 当时规划的报告生成+FTP 链路(已基本落地,对照现状看哪些没做)

### 第 1 步:接上水龙头(核心修复,最小阻塞点)

在 `feature-wiring.ts:206-215` 给 `createNorthboundService` 传 `reportDataCollector`:

1. import `createReportDataCollector` from northbound feature
2. 创建实例:`const reportDataCollector = createReportDataCollector()`
3. 传入:`createNorthboundService({ ..., reportDataCollector })`
4. 验证:northbound-service.ts:220 的 `?.collect` 不再短路;`generateTestReport` 拿到真实 collected 数据

**这一步是"从 mock 走向真实"的唯一阻塞点。** 做完这一步,TestReport 才开始产真实数据。

### 第 2 步:修正报告内容(让数据正确)

对照甲方 05 文档 L187-452(TestReport.json 结构),逐项核对生成器输出:

1. **processAndDatas.stepName**:改 `report-data-collector.ts` 从 `stepDef.name` 取(不是 `step-${stepIndex}`),和 msgReport 的 translateStepResult 对齐
2. **checkPoints**:核对 collected 的 checkPoints 字段(expectValue/testValue/result)和甲方文档要求是否对齐。wait-condition step 的 matchedValue / 期望值 怎么映射到 checkPoint
3. **statisticsItems / attachItems / resources / testParsInfo / taskDatas**:目前生成器永远填 `[]`(`test-report-generator.ts:131/137/148/159`),类型是 `readonly unknown[]`。对照甲方文档看哪些是必选(必选就补真实数据)、哪些可选(可选就空着但要记录)
4. 清 `test-report-generator.ts:134-136` 死代码

**关键**:每改一项,对照甲方文档确认字段语义,别猜。甲方文档 ≠ 甲方实现(S017 教训:文档 L353 写字符串,实际发对象),所以联调时还要核对真实报文。

### 第 3 步:补集成测试(堵住静默失败温床)

这是本任务的重点之一(用户选了"完整闭环",零集成测试是当前最大风险):

1. 给 `uploadTestReportAndNotify`(`northbound-service.ts:209-256`)写集成测试:
   - mock ftpFacade,验证守卫不短路(传了 ftp + config.ftp)
   - 验证 generateTestReport 被调用且拿到真实 collected 数据(不是 mock)
   - 验证 ftp.uploadFile 被调,路径 `${basePath}/TestReport_${taskId}.json`
   - 验证成功后 reportTestDataFileComplete 被调(fileType='TestReport')
   - 验证失败 catch 不改内部 verdict(R11 原则,`:253-255`)
2. 给 reportDataCollector 接线写测试(确保 runtime wiring 不会再次漏接——这正是 S014/S017 反复栽的坑)
3. 全量测试过,stash baseline 比对确认 0 新增失败

### 第 4 步:联调(最终判据)

**这是"完整闭环(含联调)"的核心。** 代码过了单测不等于通。联调步骤:

1. 确认联调环境(参考 S011/S013/S017 的联调记录,在 `.sessions/2026-05-18-northbound-integration/`):
   - 甲方后端在桥接虚拟机,base_url 配置、防火墙规则、token
   - 登录/heartbeat/getSubSysState/getTestCaseAll/setTestTask 已通(S017)
   - FTP 配置(DockingConfigForm 的 ftpHost/ftpPort/ftpUsername/ftpPassword/basePath)—— S014/D006 规划过"DockingConfigForm 加 5 字段",确认是否已接(若没接,这步要先把 FTP 配置 UI 做了)
2. 跑一个真实用例下发 → 执行 → 终态触发 reportTaskResult → uploadTestReportAndNotify
3. 验证:
   - 我方日志:TestReport.json 生成(内容是真实数据不是 mock)、FTP 上传成功、testDataFileTranslationComplete 发出
   - **甲方日志**:确认收到文件 + 通知(fileTranslationComplete/testDataFileTranslationComplete),文件内容能被甲方正确解析(S017 教训:反编译/抓包是契约争议终审)
4. 如果 FTP 上传失败:参考 D007(FTP 主动/被动模式联调踩坑,甲方 Java 走主动模式穿不过隔离网络,正解是甲方加 `ftpClient.enterLocalPassiveMode()`)——病根可能在甲方不在我们
5. 连不上就直说连不上,记录卡在哪,不靠推断说"应该通了"

### 第 5 步(如果联调通):核对甲方真实字段

甲方文档 ≠ 甲方实现(S017 铁证)。联调通后,核对甲方真实收到的 TestReport:
- 字段名是否和文档一致(S017 bug①:fastjson2 静默丢弃不符契约的字段)
- 必选字段是否齐全
- 把甲方反馈的字段校验问题记下来,补到报告生成器

## 五、验收标准

- ✅ reportDataCollector 接入 feature-wiring(第 1 步),TestReport 产真实数据
- ✅ 报告内容对照甲方 05 文档修正(stepName / checkPoints / 可选字段)
- ✅ uploadTestReportAndNotify 有集成测试覆盖(第 3 步)
- ✅ 全量测试过 + stash baseline 0 新增失败
- ✅ tsc / lint 0 新增错误
- ✅ **联调**:我方上传成功 + 甲方收到并正确解析(第 4 步)——这是最终判据,不通就标"待联调",不宣称完成
- ✅ 改了治理文档就按 session-governance 规范落档

## 六、完成后必须做

- 更新 `.sessions/2026-05-18-northbound-integration/topic-index.md`(进展线索 + 当前状态 + 已知未做更新)
- 若有架构/接线决策,落 decisions.md 新建 D### 并在 topic-index 引用
- 用户原话记 voice.md
- 不要碰 `_archive-legacy/`

## 七、边界红线

- **禁止只接 reportDataCollector 就宣称完成。** 用户选了"完整闭环含联调",联调是必做的最终判据。
- **禁止靠"单测过了"推断 prod 通。** 这个项目反复栽在静默失败(S014/S017),联调结论才是真相。
- **FTP 配置 UI 缺失要先确认。** S014/D006 规划过 DockingConfigForm 加 5 字段但可能没做——联调前确认,缺了要先补(否则 FTP 链路根本起不来)。
- **FTP 上传失败别急着改我方代码。** D007 证明病根常在甲方(主动模式穿不过隔离网络),先抓包/反编译坐实再动。
- **不要碰 display feature**(那是另一个对话的事:录制重设计)。
- **不要翻 `_wsl-claude-archive/_collection`**(52 个旧 jsonl,用户明确不读)。
- 报告接口协议以**甲方权威文档 + 联调真实报文**为准,不要以代码现状为准(S006 mock 残留可能误导,见 S014/D006 教训"理解协议先读文档不要先读代码")。
