# 设计:northbound ↔ task 对接闭环(v2)

> 2026-06-18 | 关联决策: D001 / D002 / D003
> 状态: 待二轮自检 + 用户复审
> 版本说明: v2 基于 v1 子agent 自检报告重写,修正 13 项问题(字段名对齐真实类型、补全遗漏字段、修正路径行号、修正报告现状误判、引入"可覆盖路径白名单"简化设计)

## 背景与目标

我们是甲方(集成控制子系统 SOCC-CQ-CCS)下挂的**激光载荷测试子系统(SOCC-CQ-LAS)**,与 Ka 载荷(KPS)等平级。需要打通与甲方的用例同步闭环。

**目标闭环**:

```
上报  getTestCaseAll:  TaskTemplate(标记上报的)→ 序列化 caseTemplate → 甲方存用例库
下发  setTestTask:     甲方编排执行 → 下发 testCaseInfo(含 inputPars)→ 反序列化成 TaskInstance(支持参数覆盖)→ 执行
回传  三层报告:        msgReport(进度) + testCaseResultReport(verdict) + TestReport.json(详细,FTP)
```

**核心模型(D003)**: 双向同源映射。parId 由我们定义,上报和下发两端共享同一份编码契约。甲方对 parId 透传不解析。

## 已确立的决策

| 决策 | 内容 |
|------|------|
| D001 | caseTemplate ↔ TaskTemplate;executionPlan.layers.nodes(testCaseId)↔ TaskInstance |
| D002 | getTestCaseAll 数据源 = `taskService.listTemplates()` 过滤上报标记 |
| D003 | 翻译双向同源;parId 我们定义;我们是 LAS,HAR 的 ka 数据无参考价值 |
| 方案A | 扁平定位路径编码,单一翻译器模块管两端 |
| 字段级标记 | 模板作者显式声明"可被甲方覆盖的字段路径"(白名单),未声明的一律不可改 |
| C1 | 报告三层全做,管线真实/数据来自 fake adapter |

## 核心设计:可覆盖路径白名单 + parId 编码

### 设计原则

v1 的错误:试图把 TaskDefinition 的所有字段都编码进 parId。v2 纠正:**只有模板作者显式加入白名单的字段,才会生成 parId、才允许甲方覆盖**。其余字段全部走模板快照恢复,不可改。

理由:
1. 东方红 TaskDefinition 结构复杂(steps 嵌套 + repeat/fieldVariations 复合对象 + schedule/errorPolicy),全编码会让 parId 体系复杂到不可维护
2. 甲方真正需要调的是少数"业务参数"(时长、阈值、功率等),不是执行编排逻辑
3. 白名单让"哪些暴露给甲方"成为**显式业务决策**,不靠编码规范隐式约束

### 数据结构:CustomerSyncMeta(挂在 TaskTemplate 上)

```ts
// task/core/types.ts 新增

export interface CustomerSyncMeta {
  /** 是否上报给甲方 */
  readonly enabled: boolean;
  /** 上次上报时间戳(ms)。上报后由系统回填 */
  readonly reportedAt?: number;
  /** 上报后甲方侧的用例外部ID。上报后由系统回填,下发时用它反查快照 */
  readonly outCaseId?: string;
  /** 可被甲方覆盖的字段路径白名单。未列入的字段,甲方下发时无法覆盖 */
  readonly overridablePaths?: readonly string[];
}
```

TaskTemplate 增加 `readonly customerSync?: CustomerSyncMeta;`(可选,默认 undefined = 不上报)。

### parId 路径格式

**用 step 的 `id` 定位(不用数组索引,更稳定)**,路径格式:

```
parId ::= {stepId}.{stepKind}.{字段路径}
```

字段路径按真实类型结构(见下方完整映射表)。示例:
```
steps[0] id="step-laser-on", kind=send, userFieldValues={power:50}
  → 白名单加 "step-laser-on.send.userFieldValues.power"
  → encode 生成 parId="step-laser-on.send.userFieldValues.power", value=50

steps[1] id="step-wait-temp", kind=wait-condition, conditions[0].threshold=80
  → 白名单加 "step-wait-temp.wait-condition.conditions[0].threshold"
  → encode 生成 parId="step-wait-temp.wait-condition.conditions[0].threshold", value=80

steps[2] id="step-delay", kind=delay, durationMs=5000
  → 白名单加 "step-delay.delay.durationMs"
  → encode 生成 parId="step-delay.delay.durationMs", value=5000
```

### 完整字段映射表(基于真实类型 types.ts)

只有这些路径**支持覆盖**(其余字段一律从快照恢复,不可改):

| stepKind | 可覆盖路径 | 真实类型来源 | 值类型 |
|----------|-----------|-------------|--------|
| send | `{stepId}.send.userFieldValues.{fieldId}` | `SendStepConfig.userFieldValues: Record<string,string\|number\|boolean>` (types.ts:67) | string/number/boolean |
| send | `{stepId}.send.targetId` | `SendStepConfig.targetId?: string` (types.ts:66) | string |
| send | `{stepId}.send.repeat.intervalMs` | `StepRepeat.intervalMs: number` (types.ts:57) | number |
| send | `{stepId}.send.repeat.maxCount` | `StepRepeat.maxCount?: number` (types.ts:59) | number |
| wait-condition | `{stepId}.wait-condition.conditions[{idx}].threshold` | `ConditionTerm.threshold: string\|number` (types.ts:31) | string/number |
| wait-condition | `{stepId}.wait-condition.timeoutMs` | `WaitConditionConfig.timeoutMs?: number` (types.ts:76) | number |
| delay | `{stepId}.delay.durationMs` | `DelayStepConfig.durationMs: number` (types.ts:81) | number |

**不支持覆盖的字段**(从快照恢复,即使甲方下发也不接受):
- `frameId`(send/wait 的"做什么",改了语义错乱)
- `fieldId`/`operator`/`sourceId`/`logicOperator`(wait 条件的比对逻辑,不宜让甲方改)
- `fieldVariations`(step 级离散值列表,types.ts:71,复合结构)
- `variables`/`intervalAfterMs`(send 的次要配置)
- `onTimeout`(wait 的超时策略)
- `until`(repeat 的退出条件,含 ConditionTerm[]。注:wait 的 conditions[].threshold 可覆盖,但 repeat.until 整体不可覆盖——因 repeat 是 send 的执行编排逻辑,不宜暴露给甲方;wait 的 threshold 是纯业务阈值,故可覆盖。这是有意设计)
- TaskDefinition 顶层:`schedule`/`stopCondition`/`errorPolicy`/`defaultTargetId`(执行编排,不宜让甲方改)

### encode 算法(上报方向)

```
input: TaskTemplate(+ customerSync.overridablePaths)
output: CustomerTestCase(含 inputPars)

1. 取 definition 的深拷贝作为快照(存入快照存储,键 outCaseId)
2. 遍历 overridablePaths,每个 path:
   a. 按 path 在 definition 里定位取值(找不到则跳过 + warning)
   b. 生成 parId = path,path 本身就是 parId
   c. 收集 {parId, value}
3. inputPars = 收集结果
4. 组装 CustomerTestCase(见模块3 字段表)
```

### decode 算法(下发方向,参数覆盖)

```
input: TestCaseInfo(甲方下发) + TaskTemplate 快照(按 testCaseId=outCaseId 反查)
output: TaskDefinition(覆盖后)

1. 克隆快照的 definition(获得完整结构,含所有不可改字段)
2. 遍历 testCaseInfo.inputPars,每个 {parId, value}:
   a. 校验 parId 在快照的 overridablePaths 白名单内 → 不在则忽略 + 记 warning
   b. 按 parId 在 cloned definition 定位 → 覆盖值
   c. 路径不存在或类型不符 → 忽略 + 记 warning
3. 返回覆盖后的 definition
```

**覆盖失败处理**(修正 v1 问题8):decode 期间产生的 warning 不静默,而是**附在 instance 的元数据上**,影响 TestReport.json 的 processAndDatas(标注"参数覆盖失败:parId=xxx")。verdict 策略:若覆盖失败导致 step 无法正确执行,verdict 走 fail;若仅 warning 但 step 仍可跑(用快照默认值),verdict 正常但 msg 标记。

### 模板快照存储(选定方案)

**选定:localStorage 独立 key** `rw-task-reported-snapshots`,存 `{outCaseId: {templateId, definition, overridablePaths, reportedAt}}`。

理由:
- northbound-state 纯内存(进程重启丢失),不可用
- task-template-storage 存的是 TaskTemplate[],schema 不同,不宜混存
- 独立 key 隔离清晰,且可独立做 schema version + migration

**schema version**:snapshots 存储加 `version: 1` 字段。migration 框架从零写(当前 task-template-storage 无 migration,只有 schema mismatch 清空——这是现状,本设计不依赖它,自己实现 snapshots 的版本管理)。

**清理策略**(YAGNI,后续再加):暂不做自动清理。模板数量有限,快照不会爆炸。可后续加"模板删除时清对应快照"。

## 模块清单

### 模块1:testcase-sync-translator(翻译器,新文件)

路径:`rewrite/src/features/northbound/core/testcase-sync-translator.ts`

```ts
// 上报: TaskTemplate → CustomerTestCase
export function encodeTaskTemplateToTestCase(
  template: TaskTemplate,
  config: NorthboundTestCaseConfig,
): { testCase: CustomerTestCase; snapshot: ReportedSnapshot };

// 下发: TestCaseInfo + 快照 → 覆盖后的 TaskDefinition
export function decodeTestCaseToTaskDefinition(
  testCaseInfo: TestCaseInfo,
  snapshot: ReportedSnapshot,
): { definition: TaskDefinition; warnings: OverrideWarning[] };

// outCaseId 生成
export function makeOutCaseId(templateId: string, reportedAt: number): string;

// 路径白名单校验工具(给 UI 用)
export function validateOverridablePath(def: TaskDefinition, path: string): boolean;
```

纯函数,无副作用,可单测。

**路径解析器选型(encode/decode 共用)**:用点 + 方括号语法(`stepId.send.userFieldValues.power` / `step-wait.wait-condition.conditions[0].threshold`)。实现采用一个**共享的路径解析函数模块**(自写轻量解析器,约 30 行;不引 lodash 以保持依赖最小)。encode(取值)和 decode(设值)**必须共用同一解析器**,保证两端语法一致。

**stepId ↔ stepKind 校验**:encode/decode 解析路径时,先按 stepId 找到 step,校验 `step.kind === path 里的 stepKind 段`;不一致 → 视为 path-not-found(跳过 + warning)。path 里的 stepKind 是冗余但提升可读性 + 防错。

**作者约束(写进 UI 提示)**:模板的 step.id 创建后**不得在编辑器里重命名**(改 id 会导致白名单路径失效)。SendStepEditor 等 step 编辑组件不暴露 id 编辑入口,或重命名时警告"将清空 customerSync.overridablePaths"。

### 模块2:类型定义(新,types.ts 扩展)

`rewrite/src/features/northbound/core/types.ts` 新增:

```ts
// 上报给甲方的用例(caseTemplate 结构,对齐 04-任务管理.md + HAR)
export interface CustomerTestCase {
  readonly outCaseId: string;
  readonly caseName: string;
  readonly caseType: string;
  readonly subSysId: string;
  readonly subSysName: string;
  readonly menuId: string;
  readonly menuName: string;
  readonly depSubSys?: string;
  readonly depSubNe?: string;
  readonly durate: number;
  readonly satelliteCount: number;
  readonly stationCount: number;
  readonly isParent: boolean;
  readonly inputPars: readonly InputPar[];
  readonly execSteps?: string;
  readonly remark?: string;
}

// 全局配置(laser 的 subSysId/menuId 等)
export interface NorthboundTestCaseConfig {
  readonly subSysId: string;
  readonly subSysName: string;
  readonly menuId: string;
  readonly menuName: string;
  readonly caseType: string;
  readonly depSubSys?: string;
  readonly depSubNe?: string;
}

// 上报快照
export interface ReportedSnapshot {
  readonly outCaseId: string;
  readonly templateId: string;
  readonly definition: TaskDefinition;  // 深拷贝
  readonly overridablePaths: readonly string[];
  readonly reportedAt: number;
}

// 覆盖警告
export interface OverrideWarning {
  readonly parId: string;
  readonly reason: 'not-in-whitelist' | 'path-not-found' | 'type-mismatch';
  readonly detail: string;
}
```

`task/core/types.ts` 新增 `CustomerSyncMeta`(见上方数据结构段)。

### 模块3:getTestCaseAll 接数据源(上报)

**现状(已核实)**:`northbound-service.ts:477` `handleGetTestCaseAll` 当前**只 FTP 上传 configuredTestCases,不返回 datas[] 给甲方**(response 只有 buildResponse ok)。`configuredTestCases` = `DEFAULT_TEST_CASES`(:411),`setTestCatalogData`(:417)。

**改动**:
1. 改为 `taskService.listTemplates()` 过滤 `customerSync?.enabled === true`
2. 逐个 `encodeTaskTemplateToTestCase` 生成 CustomerTestCase
3. 存快照到 localStorage
4. **response 加 datas[] 字段返回 CustomerTestCase 列表**(这是 v1 漏掉的关键工作——现有 handler 根本不返回用例数据)
5. 同时保留 FTP 上传(甲方可能双通道获取)

**caseTemplate 字段填充**(修正 v1 与 D002 不一致):

| 字段 | 来源 |
|------|------|
| outCaseId | makeOutCaseId(templateId, now) |
| caseName | template.name |
| caseType | config.caseType(laser 的,待联调确定具体值) |
| subSysId/subSysName/menuId/menuName | config(laser 的全局配置) |
| depSubSys/depSubNe | config |
| durate/satelliteCount/stationCount | 默认 600/1/1 |
| isParent | false |
| inputPars | encode 生成的 [{parId, value}] |
| execSteps | template.steps 的可读摘要。**算法**:遍历 steps,每步生成 `{kind} {frameId或标识}`,用 `; ` 连接,截断 200 字符。如 `"send rc-laser-on; wait-condition tm-temp; delay"`。kind 取 step.kind,frameId 取 send.config.frameId / wait 首条件的 frameId / delay 无 frameId。 |
| remark | template.tags.join(', ') 或空 |

configuredTestCases / setTestCatalogData / DEFAULT_TEST_CASES(S008 JSON 编辑器数据)**降级为调试用途**,不再作为 getTestCaseAll 数据源。

### 模块4:setTestTask 接翻译层(下发)

**现状(已核实)**:`northbound-service.ts:327`(processLayers 内 createAndStartTask)调 `translateTestCaseToMockTaskDefinition`(inbound-translator.ts:13,固定 1.5s delay)。

**改动**:
1. 按 testCaseId=outCaseId 从 localStorage 反查 ReportedSnapshot
2. 找到 → `decodeTestCaseToTaskDefinition(testCaseInfo, snapshot)` → 用覆盖后的 definition 创建实例
3. 找不到快照 → **fallback 策略修正**:不再静默用 mock 跑 success。改为 **verdict=fail** + msg 显式标注 "snapshot-missing: testCaseId=xxx 未找到上报快照,任务未执行"。
   - ⚠️ **不复用 stopped→tbd**(outbound-translator.ts:36-40 的 verdictMap 已占 tbd 语义="任务被 stop"),否则甲方看板无法区分"被 stop"和"快照缺失从未执行"。
   - emit 的 CaseVerdict.verdict = 'failed'(走 fail 分支,result=fail),由 msg 携带具体原因。
   - 保留 mock 函数但仅作为"错误占位"创建一个不执行的空实例(立即 fail),不再生成 1.5s delay 假执行。

### 模块5:报告管线接执行数据流(C1)

**现状(已核实,v1 误判已修正 + 二轮自检补充)**:
- ✅ `outbound-translator.ts`: `translateStepResult`(msgReport, :59)/ `translateTaskResult`(testCaseResultReport, :42)/ `translateTestDataFieldComplete`(testDataFileTranslationComplete, :128)——**三方法全在**
- ✅ `msgReport 已接通`:northbound-service.ts:636 已订阅 `onStepResult → translateStepResult → msgReport`
- ✅ `testCaseResultReport 已接通`:task 终态时触发
- ✅ **FTP 上传链路已接通**(二轮自检发现,v1/v2 初版均误判为"待接"):`northbound-service.ts:157-199` `uploadTestReportAndNotify` 已完整实现 `generateTestReport`(:167)→ `ftp.uploadFile`(:178)→ `reportTestDataFileComplete`(:187),且从 `reportTaskResult`(:151)自动触发
- ⚠️ `TestReport.json 用 mock 数据`:test-report-generator.ts:108 `generateTestReport` 用 `mockConfig`(DEFAULT_MOCK_CONFIG,默认假数据)

**真正待做(只剩"把真实数据喂给已接通的链路")**:

1. **数据收集器**(新):订阅 onStepResult,按 instanceId 累积 `processSteps`(sendResult.resolvedFieldValues) + `checkPoints`(wait 的 matched/timedOut + threshold)
2. **per-instance 收集数据存储**:扩展 northbound-state,加 `collectedReport: Map<instanceId, {processSteps[], checkPoints[]}>`。收集器在 onStepResult 时写入;onTaskSettled 触发 reportTaskResult → uploadTestReportAndNotify 时取出
3. **数据流贯通**:`reportTaskResult`(:151)→ `uploadTestReportAndNotify`(:157)链路增加从 northbound-state 取 collectedReport 的步骤 → 填入扩展后的 GenerateTestReportInput → generateTestReport 用真实数据(无 collected 时 fallback mockConfig,保持向后兼容)
4. **扩展 GenerateTestReportInput**(test-report-generator.ts:99):加 `collectedCheckPoints?: readonly TestReportCheckPoint[]` / `collectedProcessSteps?: readonly TestReportProcessAndData[]`(有则用真实,无则 fallback mockConfig)
5. **deviceIds 来源**:从 setTestTask 的 testCaseInfo.deviceIds 传入生成器(现 mock 写死 'ADS_LCT_01',test-report-generator.ts:94)

### 模块6:UI(H012 并入)

| UI 项 | 位置 | 说明 |
|-------|------|------|
| 模板"上报"开关 + 可覆盖路径编辑 | TemplateListPage 编辑区 | enabled 开关 + 路径白名单编辑器(从 step/字段树勾选) |
| 实例"来源"标识 | ExecutionListPage | TaskInstanceState 加 `source?: 'local'\|'northbound'` + customerTaskId?。需同步改 task-history-storage schema |
| northbound 连接状态 | CommandIngressPage 或状态条 | login/heartbeat 状态指示 |

**TaskInstanceState 加 source 字段的影响**:state + history 持久化 schema 都要改(v1 标"工作量小"低估了)。但工作量仍可控(加可选字段 + history migration)。

frontend-design skill 不启用(工业软件,功能 UI 需求)。

## 不做的事(YAGNI)

- ❌ 不支持 caseSet(协议层无此概念)
- ❌ 不做 caseMenu 分类树(D002 扁平上报)
- ❌ 不做真实设备对接(独立工程,fake adapter 够测管线)
- ❌ 不编码全部 TaskDefinition 字段(白名单只暴露业务参数)
- ❌ 不做快照自动清理(模板有限,后续再加)
- ❌ onSettled 已 @deprecated(task-service.ts:53),实现一律走 subscribe({onTaskSettled})

## 关于 fieldVariations(澄清子agent误报)

子agent 报告"types.ts 写 fieldVariations,运行时用 fieldResolvers,代码内部不一致"——**经核实此报告有误**。实际:`fieldVariations` 在 types.ts:71、task-step-executors.ts:39、task-iteration-loops.ts、SendStepEditor.vue、task-validation.ts:78 **全部一致使用**。只有注释(types.ts:266 等)提到过 fieldResolvers 这个旧词,是历史遗留措辞,不是运行时代码。**代码内部一致,无 bug**。本设计 fieldVariations 列入"不支持覆盖"字段。

## 风险与待联调项

| 项 | 风险 | 处置 |
|----|------|------|
| 白名单路径编辑器 UI 复杂度 | 中(要从 step/字段树勾选) | 可先做简单文本输入,后续优化为树选择 |
| controlTestTask action 种类 | 中(文档矛盾) | 联调实测。现状:协议侧 4 个 action(stop/abort/pause/continue)→ 内部 3 个调用(stopTask/pauseTask/resumeTask),stop 和 abort 同映射 stopTask(:353-355) |
| execSteps 甲方是否解析 | 未知 | 联调验证,先填可读摘要 |
| 8800 端口 vs 80 | 低 | 联调确认 |
| 快照重启后丢失(若 localStorage 失效) | 低 | decode 失败时 verdict=tbd,不假成功 |
| caseType 具体值 | 低 | 待联调确定 laser 的 caseType |

## 测试策略

1. **encode/decode 往返一致性**:encode(template) → inputPars → decode(inputPars, snapshot) = 原始(白名单内字段);白名单外字段不被覆盖
2. **参数覆盖**:mock inputPars 改值 → decode 后 definition 字段被正确覆盖
3. **覆盖失败处理**:非法 parId / 类型不符 → warning 产生 + verdict 受影响
4. **快照隔离**:模板修改后,老 outCaseId 下发仍用旧快照
5. **上报**:mock listTemplates(含 enabled/disabled)→ getTestCaseAll 返回正确 datas[]
6. **报告**:fake 事件流 → generateTestReport 用 collectedCheckPoints 而非 mockConfig
