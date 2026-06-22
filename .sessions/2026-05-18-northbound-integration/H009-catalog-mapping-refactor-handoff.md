# H009 — northbound↔task 对接:方向调整与交接

> 2026-06-19 | handoff | 状态:待新对话执行
> 上游:D001/D002/D003 + 本轮实施的 8 commit(已合 main,需回滚部分)+ 本轮讨论
> **本文档推翻了 D002 的部分决策,见"方向调整"**

## 背景:本轮做了什么 + 哪里错了

本轮(分支 feat/northbound-task-integration,已合 main,merge commit 7f0fd60)实施了一套对接闭环:
- testcase-sync-translator(encode/decode 翻译器)
- reported-snapshot-storage(快照存储)
- path-resolver(路径解析)
- report-data-collector(报告数据收集器)
- getTestCaseAll 改为从 listTemplates 序列化
- setTestTask 改为接 decode + 参数覆盖
- TemplateListPage 加了"上报给甲方"开关(❌ 方向错误,见下)
- test-report-generator 扩展 collected 字段

**实施在工程上是成立的**(375/380 测试通过,翻译器往返一致性验证过),但**有一个架构方向错误必须纠正**。

## 🔴 方向调整(推翻 D002 的耦合设计)

### 错误:D002 把"上报标记"挂在了 TaskTemplate 上

D002 让 TaskTemplate 带 `customerSync?: CustomerSyncMeta`(enabled/overridablePaths)。本轮 Task 1/8 据此实施:模板加字段 + UI 加开关。

**为什么错**:任务系统(task feature)本该只管"怎么执行任务"。把"要不要给甲方""甲方能改哪些字段"塞进 task 模板,是**跨职责耦合**——任务模板被迫关心甲方的存在。

### 正确方向(B 方案,用户确认):映射表归 command-ingress

**职责划分**:
- **task feature**:纯粹的执行引擎。TaskTemplate 只有 templateId/name/tags/definition/时间戳,**不带任何甲方字段**。已搞通(S009/H006),不动。
- **command-ingress feature**:负责"和甲方对接"。维护一张**"task 模板 → 甲方用例"映射表**,记录:哪些模板要上报、各自的可覆盖字段路径、上报后的 outCaseId 等。
- **northbound feature**:协议层。getTestCaseAll 从 command-ingress 拿映射表 + 从 task 拿模板定义,encode 成 caseTemplate。setTestTask 反向。

**数据流**:
```
task 模板(纯粹,无甲方字段)
  ↓ command-ingress 映射表(记录"模板X上报给甲方,可覆盖字段Y/Z")
  ↓ northbound encode(模板定义 + 映射规则 → caseTemplate)
  ↓ getTestCaseAll 返回甲方 + 存快照
  ↑ setTestTask 下发 → northbound decode(快照 + 映射规则 → 覆盖后的 definition)
  ↑ task createTask 执行
```

### 现状:command-ingress 已有对接基础设施

本轮发现 command-ingress **已经有完整的中心对接 UI 和数据流**(S008 做的):
- `use-central-docking.ts`:中心对接 composable,管 config/devices/catalog 三份数据 + localStorage 持久化
- `docking-labels.ts`:DEFAULT_DOCKING_CONFIG / MOCK_DEVICES / **DEFAULT_TEST_CATALOG**(V1.0.4 getTestCaseAll 格式的 mock 用例目录)
- `TEST_CATALOG_KEY = 'northbound-docking-test-catalog'`:用例目录的 localStorage key
- `updateTestCatalog(data)`:UI 编辑用例目录 JSON → 调 `northboundService.setTestCatalogData(data)` 喂数据
- UI:CommandIngressPage 有"用例目录"tab,是 JSON 编辑器(现在让用户手写 caseTemplate JSON)

**缺口**:用例目录现在是**手写 JSON**,没和 task 模板接起来。setTestCatalogData 喂的手写数据被 northbound 的 getTestCaseAll 直接用。

## 新对话要做的事(按顺序)

### 1. 回滚本轮的错误部分(Task 1 + Task 8 的 UI 耦合)

需要回滚/改:
- `task/core/types.ts`:**删 `CustomerSyncMeta` 接口 + TaskTemplate.customerSync 字段 + TaskInstanceState.source/customerTaskId 字段**(这几个是本轮加的耦合字段)
- `task/composables/use-template-editor.ts`:删 syncEnabled/overridablePathsText 状态 + save 里的 customerSync 写入 + openEdit/resetForm 里的加载
- `task/components/TemplateListPage.vue`:删"上报给甲方"开关 + 可覆盖路径编辑器

**保留**(这些方向对,不回滚):
- testcase-sync-translator(encode/decode)——但接口要改:入参从 TaskTemplate 改为(模板 + 映射规则)
- reported-snapshot-storage——保留,但 ReportedSnapshot 的 overridablePaths 改从映射表来
- path-resolver——完全保留(通用工具)
- report-data-collector + test-report-generator 扩展——完全保留(报告链路无关耦合问题)
- northbound-service 的 decode 接入(setTestTask)——保留,decode 入参调整
- CustomerResponse 加 datas 字段——保留

### 2. 在 command-ingress 建映射表

设计"task 模板 → 甲方用例"映射表的数据结构(建议位置:`command-ingress` feature 内)。例如:

```ts
// command-ingress/core/catalog-mapping.ts(新)
export interface CatalogMapping {
  readonly templateId: string;          // 引用 task 模板(不耦合,只存 id)
  readonly enabled: boolean;            // 是否上报
  readonly overridablePaths: readonly string[];  // 甲方可覆盖字段
  readonly outCaseId?: string;          // 上报后系统回填
  readonly reportedAt?: number;
}
// 存储:localStorage key 'northbound-docking-catalog-mappings'
// 管理:command-ingress 的"用例目录"tab,从手写 JSON 改为"选模板 + 配可覆盖字段"的 UI
```

### 3. getTestCaseAll 改为:读映射表 + 读 task 模板 → encode

```
getTestCaseAll:
  1. command-ingress 读 catalogMappings(过滤 enabled=true)
  2. 对每个映射:task.getTemplate(templateId) 取模板定义
  3. encode(模板定义 + 映射规则) → caseTemplate + 存快照(overridablePaths 从映射表来)
  4. 返回 datas[]
```

### 4. setTestTask decode:overridablePaths 从快照(快照存的是映射表的值,上报时已写入)

decode 逻辑不变,只是 overridablePaths 的来源从"模板字段"变成"映射表"(上报时写入快照,下发时从快照读)。

### 5. UI:command-ingress 的"用例目录"tab 改造

从"手写 caseTemplate JSON"改为:
- 列表展示已映射的模板
- "添加映射":选 task 模板 + 勾可覆盖字段(从模板 definition 的 step/字段树选)
- 编辑/删除映射

## 关键不变量(本交接锁定)

- **task feature 永不感知甲方**:TaskTemplate 不带任何 customer/northbound 字段。本轮加的要删干净。
- **command-ingress 拥有映射**:哪些模板上报、可覆盖哪些字段,全在 command-ingress 的映射表里。
- **northbound 是协议层**:不持有业务规则,只做 encode/decode(规则从 command-ingress 传进来)。
- **翻译器往返一致性**:encode 生成的 parId,decode 必须能定位回。这个核心逻辑已验证(本轮 Task 4 的 10 个测试),保留。

## 本轮已成立的产出(保留,不回滚)

| 文件 | 状态 | 说明 |
|------|------|------|
| `northbound/core/path-resolver.ts` | ✅ 保留 | 通用路径解析,无关耦合 |
| `northbound/core/testcase-sync-translator.ts` | ⚠️ 改接口 | encode/decode 逻辑对,但入参从 TaskTemplate 改为(definition + mapping) |
| `northbound/services/reported-snapshot-storage.ts` | ✅ 保留 | 快照存储,无关耦合 |
| `northbound/services/report-data-collector.ts` | ✅ 保留 | 报告收集器,无关耦合 |
| `northbound/core/test-report-generator.ts` | ✅ 保留 | collected 字段扩展,无关耦合 |
| `northbound/services/northbound-service.ts`(decode 接入) | ⚠️ 微调 | overridablePaths 来源调整 |
| `northbound/core/types.ts`(CustomerTestCase/ReportedSnapshot/OverrideWarning/NorthboundTestCaseConfig) | ✅ 保留 | 协议类型,无关耦合 |
| `task/core/types.ts`(CustomerSyncMeta + source 字段) | ❌ **删** | 耦合,回滚 |
| `task/composables/use-template-editor.ts`(sync 状态) | ❌ **删** | 耦合,回滚 |
| `task/components/TemplateListPage.vue`(上报开关 UI) | ❌ **删** | 耦合,回滚 |

## 测试

- testcase-sync-translator.spec.ts:10 个测试要改(入参变了),但往返一致性的核心断言保留
- reported-snapshot-storage.spec.ts:5/5 保留
- path-resolver.spec.ts:6/6 保留
- report-data-collector.spec.ts:5/5 保留
- northbound-service.spec.ts:getTestCaseAll/setTestTask 相关测试改(数据源从模板字段改为映射表)

## 给下个对话的提示

1. **先回滚耦合部分**(task/core/types.ts 的 CustomerSyncMeta + use-template-editor + TemplateListPage UI),跑测试确认 task feature 干净
2. **再建 command-ingress 映射表**,改造"用例目录"tab
3. **改翻译器接口**(TaskTemplate → definition+mapping),改 getTestCaseAll/decode 接入
4. **治理**:本交接推翻 D002 的"挂 TaskTemplate"部分,需在 decisions.md 补 D004(映射表归 command-ingress)。D001/D003 不变(映射方向 + 双向同源仍成立)。
5. **联调待 NAT 恢复**:controlTestTask action 种类、8800/80 端口、getTestCaseAll/setTestTask 真实报文验证

## 用户原话(voice)

- "其实我不是很想把是否上报给甲方和任务模板那边耦合到一起,这不好"
- "现在指令接入、中心对接、用例目录那块你是不是完全没管?我设想的是让那块负责这个的"
- "任务那边我这段时间已经搞通了,现在就差甲方这边和任务那边对接了"
- [选择 B] 用例目录自动从 task 模板派生,映射规则在 command-ingress 配,task 模板不带甲方字段
