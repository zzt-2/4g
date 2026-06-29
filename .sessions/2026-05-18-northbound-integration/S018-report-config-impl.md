# S018 — 用例报告配置(TestReport 内容驱动)实施

> 2026-06-29 | 实施型 | 状态:待联调(代码过单测,联调留给用户)
> 分支:main(9 commit:8110097 → b2f04e6)
> 关联:H013(实施 handoff,本 session 执行)、D008(决策)、spec `2026-06-28-report-config-design.md`、plan `2026-06-29-report-config.md`

## 目标

执行 H013 handoff:按 D008 拍板的方向(报告内容配置驱动,推翻 H012 的执行链路采集),TDD 实施"每用例一份报告配置清单,task 跑完按清单从 DisplayService 取 displayValue 填甲方 TestReport 三类"。9 个 task 逐个 TDD + 每步验证,代码过单测后标"待联调"(联调是最终判据,不宣称完成)。

## 记录

### 起点:收 handoff 验证(Trigger 5)

读 H013 + spec + plan + topic-index + D004/D008。验证 10 条关键事实声称全部 PASS(feature-wiring 行号、displayService.getSourceFields、LazyDockingStorage 范式、field-parser 真源、listFieldReferences direction 参数、甲方文档三类字段语义等)。发现 3 个不阻塞的偏差:
- **工作树实际 clean**(handoff 第十一节说有 ~17 个 ui-feature-bugs WIP,实际已提交;前置清理工作已不需要做)
- **field-parser 在 `receive/core/` 非 `display/core/`**(spec 笔误,功能不变)
- **S### 文件 13 个**(≥8 触发 warn,但 D008 确认本任务是 H012 方向修正的既定收尾,未越界)

膨胀检查触发 warn 但不 BLOCK(<15)。范围在 D008 既定 boundary 内。

### 实施路径(9 task TDD)

按 plan Task 1→9 顺序,每个 task 走 RED(写失败测试)→ GREEN(实现)→ commit。

| Task | 内容 | 测试结果 |
|------|------|---------|
| 1 | ReportConfig 数据模型 + CRUD + 守卫(core/report-config.ts) | 22/22 |
| 2 | 导入导出 IO(serialize/parse + version 守卫 + 逐项错误) | 14/14 |
| 3 | 文件存储 + **LazyHolder(含 setDelegate 前后时序,防 S014/S017)** | 14/14 |
| 4 | generateTestReport 改造(reportConfig 驱动 + 清死代码) | 12/12 |
| 5 | northbound-service 接入 reportConfigProvider + displayFieldReader | 47/47(含 2 条 reportConfig 驱动集成) |
| 6 | feature-wiring 接线 + bootstrap hydrate | runtime 47/47 + tsc 0 |
| 7 | ReportConfigEditor UI(3 组件:Editor + CategoryEditor + FrameFieldPicker) | tsc 0 + lint 0 |
| 8 | 嵌入 CatalogMappingPanel + 持久化 + 导入导出回调 | tsc 0 + lint 0 |
| 9 | 全量回归 + 删 DEFAULT_MOCK_CONFIG + 治理落档 | 1967 passed / 11 baseline |

### 关键实施决策(过程中定的)

1. **测试目录位置**:plan 写 `core/__tests__/` 和 `services/__tests__/`,但项目惯例是测试全在顶层 `__tests__/`(catalog-mapping.spec 如此)。调整为顶层 `__tests__/`,与既有范式一致。
2. **DEFAULT_MOCK_CONFIG 删除**:Task 9 发现 lint 报它"未使用"。D008 明确废弃假数据(不再 fallback),且它是"甲方收到的假 checkPoints"源头。删常量,保留 TestReportMockConfig 类型(mockConfig 入参类型,接口兼容)。删后 12/12 测试仍过,0 新增失败。
3. **现有测试调整(诚实废弃 fallback 行为)**:Task 4 改 generateTestReport 后,3 条原测试断言的是已废弃的 mock fallback 行为("期望 4 个 mock checkPoint"、"deviceIds 含 ADS_LOCK_01"、"processAndDatas 3 步"),按 D008 改为断言诚实空着(三类空 / deviceIds 空 / processAndDatas 空)。这是设计变更的必然,非破坏——旧断言测的是要废弃的行为。
4. **northbound-service 集成测试触发链**:用 setTestTask 完整链路触发 settled(mock taskService.startTask 立即 onTaskSettled → handleTaskSettled → reportTaskResult → uploadTestReportAndNotify),测真实端到端而非直接调内部函数。instance mock 带 templateId(reportConfigProvider 按它查)。

### 防御性措施(防 S014/S017 同病)

本任务核心风险正是 S014(testCaseConfig)/S017(reportedSnapshotStorage)反复栽过的"可选字段 + 单测手动传值 + runtime wiring 漏接 = 静默失败"。专门针对:

- **Task 3 LazyReportConfigStorage 时序测试**:显式测 `setDelegate 前 loadAll 返 []` / `getByTemplateId 返 undefined` / `saveAll 不抛`——正是 S014/S017 漏掉的那条分支。
- **Task 5 集成测试**:显式测 `reportConfigProvider 返 undefined(空壳阶段)→ 三类空`,堵住 hydrate 前静默。
- **Task 6 接线**:grep 确认 feature-wiring 同时注入 reportConfigProvider(:255)和 displayFieldReader(:256),漏任一即静默失败。

### 验证阈值对照(handoff 第十节)

| 验证项 | 标准 | 结果 |
|--------|------|------|
| report-config 单测 | CRUD + 守卫 | ✅ 22/22 |
| report-config-io 单测 | round-trip + 逐项错误 | ✅ 14/14 |
| report-config-file-storage | **含 LazyHolder 时序** | ✅ 14/14 |
| generateTestReport | reportConfig 驱动三类 + 取不到空串 + 无配置空 | ✅ 12/12 |
| northbound-service 集成 | 填 displayValue + 空壳阶段返空 | ✅ 47/47 |
| feature-wiring 接线 | 两 port 都注入 | ✅ grep 确认 |
| 全量 vitest | 0 新增失败 | ✅ 11 failed 全 baseline(checkout a3d7cd3 对照证实) |
| tsc / lint | 0 新增错误 | ✅ 0 |
| **联调(最终判据)** | 我方上传 + 甲方收到三类 displayValue | ⏳ **留给用户** |

### 全量回归 baseline 对照(关键证据)

全量 1967 passed / 11 failed。11 failed 分布:heartbeat-timer 5 + frame-service-state-selector 1 + event-truncation 1 + tcp-receive-datapath 4。**git diff 证实我没碰过这 4 个失败文件**;进一步 `git checkout a3d7cd3 -- .` 回到实施前 baseline 跑这 4 个文件,**同样 11 failed**——铁证 0 新增失败。

## 决策引用

- D004:task 纯粹 + command-ingress 持配置 + northbound 跨读(本任务守此不变量:task/display 零改动,grep 确认)
- D008:报告内容配置驱动(本任务实施此决策)
- 无新建 D###(本任务是 D008 的既定实施,未产生新架构决策)

## 范围确认

- 本轮是否在 scope boundary 内:**是**(D008 既定方向,H012 修正收尾)
- 未违反"明确不含":task 模板无新字段、未新建 feature、未动 overridablePaths、未碰 _archive-legacy/display/ui-feature-bugs

## 后续

### 待联调(用户跑)
- 真实跑 task,确认 TestReport 三类字段值是 displayValue("锁定"/"0.2%")非原始值("0x01")
- FTP 上传成功 + 甲方收到并正确解析三类
- 核对甲方实际收到的字段格式(S017 教训:文档≠实现,联调核对)

### 已知债务(D008 spec 已记,本任务不解决)
- processAndDatas(每步执行轨迹)留空
- checkPoint expectValue/result 判定留空(纯取值)
- report-data-collector.ts dead code 保留(避免 baseline 动)
- statisticsItems/attachItems 的 expectValue/result 不填

### 治理提醒
- 本专题 S### 文件已达 14 个(本 session 后),逼近 15 BLOCK 阈值。后续如再开新 session 需注意范围收敛或考虑专题收尾。

---

## 续接:用户 dev 实测反馈三处修复(ec59ed3,2026-06-29)

用户跑 dev server 实测后报三个问题,systematic-debugging 定位根因后修复:

1. **reportConfigs prop 收到 undefined(Vue warn)**:根因——模板里写 `reportConfigs.value`,但 `reportConfigs` 是 setup 顶层 ref,Vue 模板自动解包,`.value` 变成访问数组的 `.value` 属性 = undefined。对照同文件 `allTemplates`(顶层 shallowRef,模板不带 .value)印证。改为 `reportConfigs`(不带 .value)。教训:顶层 ref 在模板里别加 .value(嵌套 ref 如 `docking.xxx.value` 才需要,因为对象属性不自动解包)。
2. **选帧后没变化(已选中仍空)**:根因——FrameFieldPicker 切帧时双 emit(`update:frameId` + `update:fieldId` 清空),ReportCategoryEditor 有两个独立 handler 各用**旧 item 闭包**派生新 item,第二次(fieldId 清空)用旧 frameId 覆盖了第一次设的新 frameId。改为单一 `update` 事件传 `(frameId, fieldId)` 元组,一次性更新。同 SendStepEditor 的"链式 emit stale 覆盖"病灶(ui-feature-bugs D003 记过类似)。
3. **导入导出范围变更(用户需求)**:用户要整个用例目录(映射+报告配置),不只报告配置。新建 `catalog-directory-io.ts`(组合 isCatalogMapping + isReportConfig 校验);删 `report-config-io.ts`(被取代);按钮改"导入/导出用例目录"。顺带 export catalog-mapping 的 isCatalogMapping(原内部函数)。

验证:tsc 0 + lint 0 + catalog-directory-io 8/8 + 受影响单测 57/57 全过。状态仍:**待联调**(UI 渲染/选帧/导入导出待用户 dev 再验)。
