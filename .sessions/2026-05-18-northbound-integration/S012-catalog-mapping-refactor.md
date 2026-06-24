# [S012] catalog mapping 归 command-ingress,回滚 task 耦合(H009 执行)

> 2026-06-22 | 实施(重构) | active
> 直接合同: H009-catalog-mapping-refactor-handoff.md(逐字读)
> 边界护栏: H009 §关键不变量 + D004 + CLAUDE.md §重写总原则

## 目标

执行 H009 handoff:把 2026-06-19 那轮对接(merge 7f0fd60,8 commit 已合 main)中"上报标记挂 TaskTemplate"的耦合设计回滚,改为 command-ingress feature 维护一张「task 模板 → 甲方用例」映射表(B 方案,用户已确认)。跨 3 feature 重构:task 回滚 + command-ingress 建映射表 + northbound 改数据源/接口。

## 记录

### Handoff 验证(Trigger 5)

报到确认:本任务归 northbound-integration 专题,本 session 编号 **S012**(S011 是最后一个),下一个 decision **D004**。

Inflation check:本 topic 已 11 个 S### + 多个 H/R(>=8,警告),但范围严格锁定 H009 B 方案,不扩大,不新增 H###。

验证 H009 的 6 条关键事实声称(全部 PASS):
- types.ts:194-203 CustomerSyncMeta + 212/219 customerSync 字段 — 吻合
- types.ts:185 source + 187 customerTaskId — 吻合,且生产代码 0 处消费(只在 northbound-state.ts 有独立映射)
- testcase-sync-translator.ts:42 入参 TaskTemplate + 52 overridablePaths 来源 — 吻合
- use-central-docking.ts 管 config/devices/catalog 三份数据 — 吻合
- catalog-mapping grep 0 匹配,从零建 — 吻合
- translator 10 测试 + service spec customerSync 用例需同步改 — 吻合

### 步骤 1 — 回滚 task 耦合

删的(只删 H009 点名的,不动批量功能):
- `task/core/types.ts`:CustomerSyncMeta 接口 + TaskTemplate.customerSync + TemplateUpdates.customerSync + TaskInstanceState.source + TaskInstanceState.customerTaskId
- `task/composables/use-template-editor.ts`:CustomerSyncMeta import + syncEnabled/overridablePathsText 状态 + resetForm/openEdit/save 里的 customerSync 逻辑 + return 暴露
- `task/components/TemplateListPage.vue`:"上报给甲方" toggle + 可覆盖路径 textarea

**注意**:TaskInstanceState.source / customerTaskId 在生产代码 0 处消费(grep 仅命中其它 feature 的帧 source:'local'),安全删。northbound 的 customerTaskId ↔ instanceId 映射在 northbound-state.ts 独立维护,**不依赖** TaskInstanceState 字段,删 task 侧字段不影响。

验收:task feature 跑 **271/271 通过**,grep customerSync/CustomerSyncMeta/customerTaskId 在 task feature 下 **0 匹配**。

### 步骤 2 — command-ingress 建映射表

新文件 `command-ingress/core/catalog-mapping.ts`:
- `CatalogMapping` 接口(templateId / enabled / overridablePaths / outCaseId? / reportedAt?)— **只存 templateId 字符串,不耦合 TaskTemplate 类型**
- localStorage key `northbound-docking-catalog-mappings`
- 纯函数 CRUD:upsertMapping / removeMapping / findMapping / selectEnabledMappings / markReported + load/persist + isCatalogMapping guard

挂进 `use-central-docking.ts`:加第四份数据 `catalogMappings`(跟 config/devices/catalog 同级管理),初始化时 loadCatalogMappings + setCatalogMappings,saveMapping/deleteMapping 走 syncMappings(更新 ref + 喂 service + 持久化)。

**注意**:composable 初始化立即 `northboundService.setCatalogMappings(initialMappings)`,保证 getTestCaseAll 数据源在 service 启动前就绑定。

新增 `catalog-mapping.spec.ts` 12 个单测(CRUD + 持久化往返 + 容错):**12/12 通过**。

### 步骤 3 — 翻译器接口改 + getTestCaseAll/decode 接入(TDD)

**TDD 红先**:改 testcase-sync-translator.spec.ts 的 10 个测试,入参从 `encodeTaskTemplateToTestCase(template, config)` 改为 `encodeSourceToTestCase(source, mapping, config)`。makeTemplate 拆成 makeSource(definition + 标识字段)+ makeMapping(可覆盖白名单)。新增 1 个不变量测试(snapshot.overridablePaths 来自 mapping 而非模板)。跑 → 10 failed 1 passed(预期)。

**绿后**:改 testcase-sync-translator.ts:
- 新增 `EncodeSource` 接口(definition / templateId / templateName / templateTags)— 刻意不导入 TaskTemplate(D004 不变量)
- `encodeTaskTemplateToTestCase` → `encodeSourceToTestCase(source, mapping, config)`
- overridablePaths 从 `mapping.overridablePaths` 来(旧 `template.customerSync?.overridablePaths` 删)
- decode 逻辑零改动(只读 snapshot.overridablePaths,来源已随 encode 改)
- makeOutCaseId / createPlaceholderFailDefinition / validateOverridablePath 不变

跑 → **11/11 通过**(原 10 + 新增 1 不变量)。

**getTestCaseAll 接入**:
- northbound-service.ts:加 `setCatalogMappings(mappings)` 接口方法 + `configuredCatalogMappings` 字段
- handleGetTestCaseAll 改:`selectEnabledMappings(configuredCatalogMappings)` → 对每条 enabled 映射 `taskService.getTemplate(templateId)` → encode → 存快照。模板已删的映射自动跳过。
- decode 链(setTestTask/createAndStartTask)零改动 — overridablePaths 随快照走(上报时由 encode 写入,来源已是 mapping)。

**service spec 改 2 个用例**:
- spec `:844` getTestCaseAll:从 listTemplates + customerSync filter 改为注入 catalogMappings(enabled/disabled/模板缺失三态),验证只 enabled 且模板存在的映射产出用例
- spec `:873` setTestTask decode:encode 调用改新签名(source + mapping)

跑 northbound 全套:**119/124 通过,5 failed 全在 heartbeat-timer.spec.ts(pre-existing baseline)**。已 git stash 对比确认 baseline 也是这 5 个,0 新增失败。

### 步骤 4 — UI 改造

`CommandIngressPage.vue` 的"用例目录"tab(按用户反馈 v2 重构):

**v1(初版,已推翻)**:外层 DataTable 正式表格 + 添加/编辑共用 dialog(q-select 单选 + 路径 textarea)+ 旧 JSON 编辑器降级为折叠调试用。用户反馈:"原始 json 那玩意去掉;不需要外面的正式表格,弄成可收缩简单列表;添加和编辑分开,添加做成多选任务的小列表;可覆盖字段只显示字段名不要完整路径"。

**v2(落地)**:
- **删掉**原始 JSON 调试编辑器(q-expansion-item 整段移除)+ 对应 testCatalogJson/handleSaveTestCatalog state
- **删掉**外层 DataTable 正式表格 + CATALOG_MAPPING_COLUMNS
- **添加 = 弹窗**:`q-dialog` 里 `v-for` 渲染所有任务模板(`taskService.listTemplates`),每条 `q-item` + `q-checkbox`,勾上即建 enabled 映射、取消即删(`toggleMapping`)。进入 catalog tab 时 watch 触发 `refreshTemplates` 刷新模板缓存
- **列表 = 可收缩**:`q-expansion-item` 每个映射一条,折叠头显示模板名 + 上报/停用 badge + 可覆盖字段数
- **编辑 = 展开内联**:展开后显示 enabled toggle + 可覆盖字段 chip 区(点击 chip 勾选/取消)+ 删除按钮
- **字段名 = 只显示末段**:`fieldName(path)` 取路径末段。chip 高亮区分已选/未选
- 候选字段从模板 send step 的 userFieldValues 派生;无候选时显示提示

**v3(用户实测反馈修复,2026-06-22)**:
v2 实测两个 bug:
1. **点"保存字段"后实例自动收缩,再展开依然空白**:根因是草稿(`mappingDrafts` ref)与映射状态不同步 —— saveMappingDraft 写映射后 catalogMappings ref 重新赋值触发 v-for 重渲染,q-expansion-item 折叠;再展开 @show → initDraft 读到的是刚写的值,但草稿被 initDraft 覆盖前用户没看到勾选态。**修复**:删掉整个草稿机制,改为**即时持久化** —— `toggleField` 直接 read/write 映射(`isFieldChecked` 直接读 `docking.catalogMappings`,`toggleField` 直接 `docking.saveMapping`),无草稿无"保存字段"按钮。点 chip 即写,展开/折叠状态无关。
2. **字段名是 vol-auto 这种丑 id**:根因是 userFieldValues 的 key 是 fieldId 不是字段名。**修复**:`fieldGroups(tpl)` 用 `frameService.listFieldReferences({frameId})` 查帧定义,取 `fieldName`(友好名,如"调制开始")+ `frameName` 分组显示(参照 GroupConfigDialog.vue 的 chip 模式)。不在帧定义里的 key 回退到 key 本身。

### 验证小结

| 套件 | 结果 |
|------|------|
| task feature | 271/271 ✓(回滚后干净) |
| command-ingress | 140/140 ✓(128 旧 + 12 新 catalog-mapping) |
| northbound translator | 11/11 ✓(改签名 TDD + 新增 1 不变量) |
| 全套(baseline 对比) | 1464 passed / 5 failed(baseline 1463/5;+1 通过,0 新增失败) |
| 5 失败 | 全在 heartbeat-timer.spec.ts(pre-existing,与本任务无关) |
| lint(改动文件) | 0 error;全仓 5 error 全 pre-existing(改动净减 4 error) |

验收 grep:
- `customerSync`/`CustomerSyncMeta`/`customerTaskId`/`syncEnabled`/`overridablePathsText` 在 `rewrite/src/features/task/` → 0 匹配 ✓
- `encodeTaskTemplateToTestCase`(旧函数名)全仓 → 0 匹配 ✓

## 决策引用

- D001:caseTemplate ↔ TaskTemplate 映射(不变,active)
- D002:getTestCaseAll 数据源 = TaskTemplate 带上报标记(**部分被 D004 推翻**:上报标记不再挂 TaskTemplate;数据源仍是模板不变)→ 标记 partially-superseded
- D003:翻译层双向同源(不变,active)
- D004:映射表归 command-ingress(**新建**,推翻 D002 的耦合部分)

## 范围确认

- 本轮是否在 scope boundary 内:**是**。严格按 H009 §给下个对话的提示 的 4 步顺序(回滚 → 建映射表 → 改接口 → UI),未扩大。

## 后续

- **联调待 NAT 恢复**:getTestCaseAll/setTestTask 真实报文验证(本任务纯代码重构,不涉及真实甲方连通)
- **controlTestTask action 种类**(abort/pause/continue/stop 哪些甲方真支持)→ 联调实测后补 D###
- **configuredTestCatalog / setTestCatalogData** 仍保留在 service API(用户 v2 要求删掉 JSON 编辑器 UI,但 service 方法本身未删,留作内部 API);后续可彻底移除
- **映射表 outCaseId 回填**:目前 CatalogMapping 有 outCaseId/reportedAt 字段,但 encode 时没回写映射表(写的是快照)。若需要"映射表记住上次上报的 outCaseId",需在 getTestCaseAll 后调 markReported —— 本次未做,留后续(快照已足够支撑 decode 反查)
- **真实 step/字段树选择器**:当前候选路径只从 send step 的 userFieldValues 派生;wait-condition 的 conditions[].threshold 等需手填。后续可扩展为完整 definition 树选择 UI
