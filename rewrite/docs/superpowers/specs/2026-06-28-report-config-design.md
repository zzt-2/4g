# 用例报告配置(TestReport 内容驱动)设计

> 2026-06-28 | 状态:待审 | 关联 topic: `2026-05-18-northbound-integration`
> 关联 session 笔记: H012(原 TestReport 闭环 handoff,本设计推翻其"从执行链路采集"方向)、S007(报告三层链路分析)
> 推翻: H012 的 reportDataCollector 接线方向(报告内容改为配置驱动,不再从 step 事件采集)

## 背景与问题

甲方 TestReport(第三层报告)的生成链路此前用一份写死的 `DEFAULT_MOCK_CONFIG`(`test-report-generator.ts:61-95`)产出假数据:不管 task 实际跑了什么,`checkPoints` 永远是"上电状态/载波同步锁定/帧同步锁定/误码率",`testValue` 永远是 `0x0001`/`0.2%`。甲方收到的就是这堆假报告。

H012 计划"接 reportDataCollector 从 task 执行链路采集真实数据",但 brainstorm 发现这个方向错误:

1. **抽象层错位**:reportDataCollector 从执行链路采的是"帧字段匹配结果",而甲方 checkPoints 要的是带业务语义的指标(载波同步锁定/误码率)。采集出来的字段名是 `step-N`、值是 `0x01`,没有业务意义。
2. **取值错位**:甲方历史收到的 testValue 是原始 `0x0001`,而用户实际想要的是表格显示的解析值("锁定"而非 `0x0001`)。
3. **缺配置维度**:用户需要"每个用例自己决定报告里报哪些字段、怎么编排",这不是执行链路能自动推断的,必须是一份独立配置。

## 目标

让每个用例能**单独配置一份报告内容清单**;task 跑完生成 TestReport 时,**按这份清单从接收帧字段值里取数,填进甲方的 checkPoints / statisticsItems / attachItems 三类**。报告内容从"写死假数据"变成"用户配置驱动 + 真实解析值"。

## 用户已确认的设计决策(brainstorm 结论)

| 维度 | 结论 |
|------|------|
| 配置归属 | 归 command-ingress feature;northbound 跨读(同 D004 / catalog-mapping 范式) |
| 配置粒度 | 每用例(task 模板)一份清单 |
| 数据独立性 | ReportConfig 是独立数据,**不塞进 CatalogMapping** |
| 清单结构 | 三类别(checkPoints / statisticsItems / attachItems),每类一个有序列表 |
| 项的类型 | 纯字段值(无文字类型);每项 = 名字 + 帧字段来源 + 可选说明 |
| 取值内容 | 取字段的 **displayValue**(解析值,如"锁定",非原始 `0x01`)——复用表格那边的解析 |
| 字段选择器 | 复用 wait-condition 那套"帧 + 字段"选择 UI |
| UI 入口 | 用例目录(CatalogMappingPanel)的映射展开区,内联在可覆盖字段下方 |
| UI 显示范围 | 只在**有映射的用例**下显示(`enabled=false` 停用的也能配) |
| 持久化 | 文件存储 `state/report-configs.json`(不新开 localStorage) |
| 导入导出 | 要,复用现有 `xxx-io.ts` 模式(参考 `group-io.ts`) |

## 不做(YAGNI)

- ❌ **不做文字类型项** —— 用户确认所有上报值都来自接收帧字段,无固定文字需求。
- ❌ **不做期望值/判定配置** —— checkPoint 的 expectValue / result 留空或不判定(纯取值)。用户明确"纯取值"。后续若要判定,属另一特性。
- ❌ **不动 catalog-mapping 的 overridablePaths** —— 那是"上报时甲方可覆盖哪些执行参数",方向是甲方→我们;报告配置是"我们报哪些实测值",方向相反。两份独立数据,互不影响。
- ❌ **不动 processAndDatas(每步执行轨迹)** —— 甲方报告要求,但本设计先留空/保留旧逻辑,待用户后续决定是否也改配置驱动。
- ❌ **不新建 feature** —— 报告配置归 command-ingress,不为它单独划地盘(同 D004 架构)。

## 数据模型

### ReportConfig(一份用例的报告配置)

```ts
/** 一个用例(模板)对应一份报告配置 */
interface ReportConfig {
  readonly templateId: string;                     // 关联哪个 task 模板(只存 id)
  readonly checkPoints: readonly ReportItem[];     // → 甲方 TestReport.checkPoints[]
  readonly statisticsItems: readonly ReportItem[]; // → 甲方 TestReport.statisticsItems[]
  readonly attachItems: readonly ReportItem[];     // → 甲方 TestReport.attachItems[]
}

/** 三种类别里每一项的统一结构 */
interface ReportItem {
  readonly id: string;       // 项的唯一 id(排序/编辑追踪用,nanoid 生成)
  readonly name: string;     // 这一项在报告里叫啥("载波同步锁定")→ checkPoint / itemName
  readonly frameId: string;  // 取值的帧
  readonly fieldId: string;  // 取值的字段(取该字段的 displayValue)→ testValue
  readonly msg?: string;     // 说明,可选 → msg(甲方三类都有 msg,均标可选)
}
```

**设计要点**:

- **三类别同构**:三类内部都用 `ReportItem`,填报告时再映射成甲方各自的字段名(`checkPoint` vs `itemName`)。统一内部模型,降低配置/编辑复杂度。
- **`frameId + fieldId` 组合定位**:正好对上 DisplayService 快照的 key `dataItemId = ${frameId}:${fieldId}`,取值时一步命中,无 fieldId 跨帧重名覆盖问题(对比 `receive-event-source-bridge` 用纯 fieldId 做 key 会重名覆盖,见 bridge.ts:8-11)。
- **`id` 用 nanoid**:排序/上下挪项时靠 id 追踪。

### 持久化文件(state/report-configs.json)

```ts
{
  version: 1,
  configs: ReportConfig[]
}
```

照 `task-template-file-storage.ts` 范式:带 `version`、atomic write(`writeJsonWithBackup`)、`.bak` 备份、启动时同步读。**不开新 localStorage key**(那是被废弃方向,S016 已把 4 份对接数据从 localStorage 迁到文件)。

**存储位置抉择(为什么单独文件,不合写进 docking.json)**:S016 已把对接的 4 份数据(config/devices/catalogMappings/legacy)合写进 `state/docking.json`(`docking-file-storage.ts`)。ReportConfig 是第 5 份,但选择**单独存 `state/report-configs.json`**,理由:
- docking.json 已是"对接配置"复合体,再加一份报告内容(可能很长,三类各 N 项)会让它更臃肿
- ReportConfig 的读写频率独立于对接配置(只在配报告时写、报告生成时读),独立文件读写互不锁
- 单独文件可直接编辑(你的需求"能直接改 json 文件"),不必混在复合 json 里翻找
- 走独立的 `report-config-file-storage.ts` + `LazyReportConfigStorage` holder(见接线缺口 2),与 docking-file-storage 同范式但独立实例

可被用户直接编辑文件(改完下次启动 atomic read 读到)。

### 导入导出文件格式

```ts
{
  version: 1,
  configs: ReportConfig[]   // 同持久化结构
}
```

`EXPORT_SCHEMA_VERSION = 1` 常量(参考 `task-template-io.ts:3`)。

## 数据流(报告生成)

```
task 跑完 settled
  → northbound uploadTestReportAndNotify(instance, verdict, testCaseId, taskId) 触发
  → 按 instance.templateId 读 ReportConfig(从 command-ingress 传入)
  → 对每个 ReportItem:
       key = `${frameId}:${fieldId}`
       去 DisplayService.getSourceFields() 查 key
       取 displayValue(如 "锁定")
  → 填进 TestReport:
       ReportConfig.checkPoints     → TestReport.checkPoints[]
       ReportConfig.statisticsItems → TestReport.statisticsItems[]
       ReportConfig.attachItems     → TestReport.attachItems[]
     映射: name → checkPoint/itemName ; 取到的值 → testValue ; msg → msg
  → generateTestReport → FTP 上传 → testDataFileTranslationComplete 通知
```

### 取值真源(已查实)

- **displayValue 在 receive 阶段算好**:枚举 label 由 `field-parser.ts:148-156` 的 `labelFor`(`:150-153` 按 rawHex 匹配 `field.options[].value` 返回 `option.label`,如 0x01→"锁定")resolve;`parseReceiveFrameFields` 在 `:210` 处用 `displayValue: label ?? displayValueFor(field, value)` 组装。`field-parser.ts:128-146` 的 `displayValueFor` 处理 float(toFixed(2))/double/bytes 等格式。不是在 display 层才算。
- **全量快照在 DisplayService.buffer.sourceFields**:`receive-display-bridge.ts:55` `fanOutToDisplay` 产出 material → `display-service.ts:196-211` `ingestSourceMaterial` 按 dataItemId upsert 累积(保留最后已知值)。
- **读取接口**:`display-service.ts:251-256` `getSourceFields()` 返回全量快照深拷贝。报告生成时构 `Map<dataItemId, displayValue>` 一次,逐项查。
- **DisplayService 是纯 TS(非 reactive)**:northbound 纯 TS 链路可直接读,无 Vue 跨越。

### 接线缺口(2 类,已查实)

**缺口 1:displayService 没注入 northbound(简单)**
`feature-wiring.ts:237-246` 的 `createNorthboundService` 调用**没传 displayService**(displayService 早已建在 `:169`,只是没注入 northbound)。补传这一项,报告生成时即可 `getSourceFields()` 取值。displayService 是纯同步对象,L2 建好即可用,无时序坑。

**缺口 2:reportConfigProvider 的异步 hydrate 时序(要害,直接关系 S014/S017 温床)**

ReportConfig 走文件存储(`state/report-configs.json`),但 `feature-wiring.ts:114 wireFeatures` 是**同步初始化**(立即返回 WiredFeatures),而文件存储要 bootstrap **异步 hydrate**——这就是 S014/S017 静默失败的根:**同步建 service 时文件还没读到,provider 闭包读文件返回空,报告静默生成空三类**。

必须照项目既有的 **LazyHolder 模式**(不是新发明):
- `rewriteRuntime.ts:26` `LazyPersistence`(通用 holder:建空壳→bootstrap hydrate→`setDelegate`)
- `docking-file-storage.ts:71` `LazyDockingStorage`(同款,command-ingress 的对接存储就用这个,bootstrap 异步拿到 fileFacade+dataDir 后建真 storage+hydrate+setDelegate,见 `rewriteRuntime.ts:343`)

ReportConfig 照此建一个 `LazyReportConfigStorage` holder:
- `feature-wiring.ts` 同步建空壳 holder(`new LazyReportConfigStorage()`),northbound 的 `reportConfigProvider` 闭包调 `holder.getByTemplateId(templateId)`
- 空壳阶段:provider 返回 undefined(报告三类空,**这是诚实空着,不是 fallback 假数据**,与"不 fallback DEFAULT_MOCK_CONFIG"一致)
- bootstrap 异步读 `state/report-configs.json` + hydrate + `holder.setDelegate(realStorage)`,之后 provider 返回真实配置
- **接线测试必须覆盖"setDelegate 前 provider 返回 undefined"这条分支**(正是 S014/S017 漏掉的那条——别让它静默)

> 这就是为什么 spec 验收标准写"防 S014/S017 同病"——必须显式测 hydrate 前的 provider 行为,不是只测 hydrate 后。

### ReportConfig 传入 northbound 的注入

`NorthboundServiceOptions`(`northbound-service.ts:113-123`)新增可选字段:

```ts
readonly reportConfigProvider?: (templateId: string) => ReportConfig | undefined;
readonly displayFieldReader?: { getSourceFields(): readonly DisplayFieldMaterial[] };
```

`uploadTestReportAndNotify` 里 `options.reportConfigProvider?.(instance.templateId)` 取配置(空壳阶段返回 undefined,见上)。`feature-wiring.ts:237-246` 把 `LazyReportConfigStorage` holder 和 `displayService`(`:169`)一并传进去。

## 架构分层(同 D004 不变量)

| feature | 职责 | 本特性做什么 |
|---------|------|-------------|
| **command-ingress** | 持有配置数据 + UI | 新建 `core/report-config.ts`(类型 + CRUD 纯函数 + isReportConfig 守卫)、`services/report-config-file-storage.ts`(文件存储)、`services/report-config-io.ts`(导入导出)、UI 加配置编辑区 |
| **northbound** | 协议层,只读消费 | `NorthboundServiceOptions` 加 `reportConfigProvider`;`uploadTestReportAndNotify` 按 ReportConfig 取值填报告。**不持有业务规则,配置从 command-ingress 传进来** |
| **task** | 纯执行引擎 | **零改动**(TaskTemplate 不加任何字段,守 D004) |
| **display** | 提供字段值快照 | 已有 `getSourceFields()`,**零改动**(feature-wiring 把 displayService 注入 northbound) |

## reportDataCollector 的处理

按本设计,报告内容由"配置清单 + DisplayService 取值"驱动,`report-data-collector.ts` 那套"从 step 事件采 wait/send"的逻辑**不再需要**:

- `feature-wiring.ts` **不接** reportDataCollector(H012 的"接水龙头"不做)。
- `northbound-service.ts:220` 的 `options.reportDataCollector?.collect(...)` 可选链自然短路,`collectedCheckPoints/collectedProcessSteps` 保持 undefined。
- `generateTestReport` 的 collected 分支不触发,改由本设计的 ReportConfig 驱动填三类。
- **report-data-collector.ts / report-data-collector.spec.ts 暂不删除**(避免本次范围爆炸),标记为 dead code,后续清理轮处理。**实施时注意:不要删 collector 的现有单测**(否则 baseline 会动),collector 相关代码全留着不碰。
- `test-report-generator.ts:134-136` 的三元两分支同体死代码,本次顺手清掉。**清理边界**:`:126` 定义的 `usingCollected` 变量、`collectedCheckPoints/collectedProcessSteps` 入参在三元的 collected 分支被删后会变成未使用——`usingCollected` 一并删,但 `collected*` 入参**保留**(接口兼容,实际 undefined 不触发)。

## generateTestReport 改造

`GenerateTestReportInput` 新增 ReportConfig 驱动的入参:

```ts
interface GenerateTestReportInput {
  // ... 现有(instance / verdict / testCaseId / taskId / config / mockConfig? / collected*?)保留
  /** 配置驱动的报告内容(三类)。提供时优先于 mockConfig 和 collected*。 */
  readonly reportConfig?: ReportConfig;
  /** 字段值快照,按 dataItemId(frameId:fieldId)取 displayValue。 */
  readonly displaySnapshot?: ReadonlyMap<string, string>;
}
```

generator 内,当 `reportConfig` 提供时:
- `checkPoints` = reportConfig.checkPoints 映射(name→checkPoint, 取值→testValue, msg→msg)
- `statisticsItems` / `attachItems` 同理
- **取值兜底**:`displaySnapshot.get(`${frameId}:${fieldId}`)` 取不到时,`testValue` 填空串 `''`(诚实标记"没采到",不编造);`msg` 为 undefined 时填 `''`(甲方 TestReportCheckPoint.msg 是必填 string)
- **优先级**:`reportConfig` 提供时 → 用它驱动三类;`reportConfig` undefined(空壳 holder 阶段或模板没配) → 三类全空 `[]`,**不 fallback 到 DEFAULT_MOCK_CONFIG**(诚实空着,不造假)。mockConfig/collected* 分支保留但实际不触发(collector 不接线)

## UI 形态

### 入口位置

`CatalogMappingPanel.vue` 的映射展开区(`:88-133`),在"可覆盖字段"区块**下方**新增"报告配置"区块(挂法 1:同一 expansion-item 内上下排列):

```
[上报 toggle]
可覆盖字段(每帧分组 chip)         ← 现有,不动
─────────────────────
报告配置                          ← 新增
  检查点:
    [载波同步锁定 ▾ frame:field] [×]
    [误码率       ▾ frame:field] [×]
    [+ 添加检查点]
  统计项:
    [...]
    [+ 添加统计项]
  附加项:
    [...]
    [+ 添加附加项]
[删除映射]
```

### ReportItem 编辑行

每一项一行:`name` 输入框 + 帧选择 + 字段选择(复用 wait-condition 的 FrameSelector/字段选择组件) + 删除按钮。说明(msg)可选,做成 hover 编辑或次级行(避免主行过挤)。

### 字段选择来源

复用 `FrameSelector` + `frameService.listFieldReferences({ frameId, direction: 'receive' })` 枚举字段(同 task 模板编辑器的 wait-condition step;对照 SendStepEditor.vue:40 用 `direction:'send'` 枚举发帧字段)。可选字段 = 接收帧定义里的字段。**必须带 `direction:'receive'`**,否则会把 send 帧字段也列进候选,用户选了取不到值。

### 导入导出按钮

放在 CatalogMappingPanel 的工具栏(现有"添加映射"按钮旁边),或报告配置区块标题栏。参考 `GroupConfigDialog.vue:234-241`(o_upload / o_download 图标)。冲突策略:**按 templateId 替换**(导入的覆盖同名模板配置,没冲突的追加)。

## 测试

- **report-config.ts**:CRUD 纯函数 + isReportConfig 守卫(照 catalog-mapping.spec 模式)
- **report-config-io.ts**:序列化/反序列化 + version 守卫 + 逐项中文错误(照 group-io.spec 模式)
- **report-config-file-storage.ts**:读写 + version 校验 + .bak(照 task-template-file-storage.spec 模式)
- **generateTestReport**:新增 reportConfig 驱动分支测试(有配置→填真实值;无配置→三类空;取不到字段→空 testValue)
- **uploadTestReportAndNotify 集成测试**:mock displaySnapshot + reportConfigProvider,验证三类被正确填充 + FTP 上传 + 通知(堵 S014/S017 静默失败温床)
- **feature-wiring 接线测试**:验证 reportConfigProvider 和 displayService 都被注入(防 S014/S017 同病:可选字段 + 单测手动传值掩盖 runtime 漏接)
- **LazyReportConfigStorage holder 测试**:`setDelegate` 前 provider 返回 undefined(空壳阶段,防 S014/S017 静默失败温床);`setDelegate` 后返回真实配置;hydrate 后读到文件内容

## 验收标准

- ✅ 用例目录有映射的用例,展开后能配置报告清单(三类,每类有序字段项)
- ✅ ReportConfig 存 `state/report-configs.json`,能直接改文件
- ✅ 导入导出 JSON 工作(参考现有模式)
- ✅ task 跑完,报告的三类由 ReportConfig 驱动,填的是 displayValue 解析值
- ✅ 没配 ReportConfig 的用例,报告三类为空(不 fallback 假数据)
- ✅ reportDataCollector 不接线(不接 H012 的水龙头),processAndDatas 留空
- ✅ displayService 注入 northbound,取值链路通
- ✅ reportConfigProvider 走 LazyHolder 模式,**显式测 hydrate 前返回 undefined 的分支**(正是 S014/S017 漏掉的那条)
- ✅ 全量测试过 + stash baseline 0 新增失败;tsc / lint 0 新增错误
- ⏳ **联调**:我方上传成功 + 甲方收到并正确解析 —— 留给用户跑(代码过单测后标"待联调",不宣称完成)
- ✅ 改治理文档按 session-governance 规范落档

## 后续(本特性不做)

- processAndDatas(每步执行轨迹)是否也改配置驱动
- checkPoint 的 expectValue / result 判定逻辑(若用户后续要"通过/不通过"判定)
- report-data-collector.ts dead code 清理
- 联调核对甲方真实字段(S017 教训:文档≠实现,联调时核对甲方收到的三类是否被正确解析)
