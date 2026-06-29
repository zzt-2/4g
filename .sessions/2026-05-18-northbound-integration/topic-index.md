# 甲方对接闭环分析

> 状态: active | 创建: 2026-05-18 | 更新: 2026-06-29

## 子系统架构认知(D003,2026-06-18 确立)

- **甲方 = 集成控制子系统(SOCC-CQ-CCS)**,下挂 5 个平级二级子系统(附录 10-附录.md:141-156):
  Ka载荷(KPS) / 路由交换(WER) / 馈电(FPS) / **激光载荷(LAS,我们)** / 载荷测试
- **我们 = 激光载荷测试子系统(SOCC-CQ-LAS)**,是 5 个之一,与 ka 平级
- HAR(`rewrite/docs/10.15.5.53.har`)**全是 ka 子系统数据**(91 处 subSysName = "ka子系统",laser 0 处)
- ⚠️ 因此 HAR 的**字段值**(ka 的 Ping/FTP/流媒体参数)对我们无参考;**结构**(caseTemplate/task 四层模型)仍通用
- **用例同步方向**: 甲方前端点"用例同步"→ 调我们的 getTestCaseAll → 我们发过去(不是甲方填的)。parId 由我们定义,自然对应 laser frame(双向同源,见 D003)

## 专题目标

基于甲方 V1.0.1 接口文档（31 接口），确认"甲方控制我们任务、我们回传结果"这条链路是否闭环，识别断点，拍板决策，为后续 northbound feature 设计和实施做准备。

## 进展线索

### S001 — 闭环讨论与决策拍板
- 完整读入甲方文档并拆分为 11 个文件（31 接口），存放在 `rewrite/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/`
- 并行 3 个子 agent 读取：我方 6 份 northbound 文档、task 系统代码+设计、甲方 4 个核心接口详细规格
- 完成 5 个问题分析（Q1 闭环完整性、Q2 HTTPS 放哪、Q3 翻译层形状、Q4 与 command-ingress 关系、Q5 旧 gap 有效性）
- 代码级验证 result/task/platform 实际实现状态（另派 1 个 explore agent 查代码）
- 拍板所有核心决策（4 轮决策演进：初始 → testCase=task → verdict 依据确认 → 甲方回复）
- 产出甲方待确认 2 条 → 甲方回复 immediate=true/isEnd=true → 待确认项清零

## 已确认结论

### 核心映射

- **甲方 caseTemplate(getTestCaseAll 返回) = 我们的 TaskTemplate**(2026-06-17 D001 精确化;旧措辞"testCase = task(TaskDefinition)"已过时,TaskDefinition 是 TaskTemplate 内核非独立同步实体)
- 甲方的 executionPlan(task 下发,每个 caseId 节点)→ 我们创建一个 TaskInstance
- 四层厘清(R001): caseMenu(菜单,我们不持有)/ caseTemplate(用例,↔TaskTemplate)/ caseSet(用例集,暂不实现)/ task(执行编排,甲方建下发)
- task 典型 steps = send step（发帧）+ wait-condition step（等接收帧校验参数）
- verdict: wait-condition matched → success, timeout/不匹配 → fail, task 被 stop → tbd

### MVP 接口（6 个）

| 接口 | 方向 | 映射 | 状态 |
|------|------|------|------|
| setTestTask | 甲方→我们 | testCaseInfo[] 每项 → 一个 task | 逻辑通 |
| controlTestTask | 甲方→我们 | abort→stop, pause→pause, continue→resume, stop→stop | 通 |
| testCaseResultReport | 我们→甲方 | task 终态 verdict → success/fail/tbd | 有基础需接线 |
| msgReport | 我们→甲方 | step 完成 → stepInfo | 缺 step 事件（G1） |
| heartbeat | 甲方→我们 | 简单响应 | 需实现 |
| getSubSysState | 甲方→我们 | 状态查询响应 | 需实现 |

### executionPlan 处理

- parallel=true 层：同时 createTask + startTask 多个实例（task service 已支持多实例并行）
- parallel=false 层：顺序执行，等前一个 onSettled 再启动下一个
- layers 按层序号顺序处理

### 架构决策

- HTTPS server 放 main process（传输层），业务逻辑在 renderer，通过 IPC bridge 通信
- northbound 做独立 feature，不合并到 command-ingress
- 翻译层在 northbound feature 内（inbound-translator + outbound-translator）
- result 不需要改，northbound 自己接线：onSettled → collectResult() → 翻译 → POST

### 不做的

- 测试数据文件（testDataFileTranslationComplete）— 悄悄不做
- 精细测试报告（详细 checkPoints 对比、statisticsItems 等）— 糊弄版
- 用例库管理 / 独立用例实体
- FTP 文件上传（getTestCaseAll 的 FTP 暂不实现？待确认）

## 代码验证结果

### 已有基础

| 能力 | 文件 | 说明 |
|------|------|------|
| verdict 判断 | `result/core/judge.ts` | judgeCaseVerdict → passed/failed/stopped |
| task 终态感知 | `task-service.ts` | onSettled(), Promise resolve 机制 |
| step 结果实时写入 | `task-iteration-loops.ts:162/171/222` | 每 step 完成立刻 addStepResult() |
| platform bridge 模式 | `platform/index.ts` | transport + file facade |
| result service | `result/services/result-service.ts` | collectResult/getVerdict/getSnapshot/clear |

### 确认缺失

| 缺失 | 影响 | 改动范围 |
|------|------|---------|
| step 级事件通知 | msgReport 无驱动源 | task 执行循环加回调 hook |
| HTTPS outbound client | 无法向甲方 POST 数据 | platform facade 新增 |
| FTP 上传 | getTestCaseAll 文件上传无通道 | platform facade 新增 |
| result 自动收集 | 需手动调 collectResult | northbound feature 接线 |
| 报告生成 | 只有 placeholder | northbound feature 实现 |

## 甲方已确认

1. **immediate 始终 true** — 收到 setTestTask 直接 createTask + startTask，不需要延迟启动逻辑
2. **isEnd 始终 true** — 一次下发全部 testCaseInfo，不需要多批次拼装

甲方说明：接口参照了原入网认证的一二级接口，部分字段暂未用到。

## 待验证（G2、G5）

- **G2**: step 名称映射 — TaskStepDefinition/TaskStepResult 有没有 name/label 字段
- **G5**: getTestCaseAll — 需求变了（testCase=task），需确认甲方 JSON 格式哪些字段必须填

## 甲方文档拆分

`rewrite/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/`

| 文件 | 接口数 | 内容 |
|------|--------|------|
| 00-index.md | - | 全部接口索引 |
| 01-概述与约定.md | - | 协议约定 |
| 02-设备管理.md | 5 | 设备信息、状态 |
| 03-用例管理.md | 7 | getTestCaseAll、文件上传下载、增删 |
| 04-任务管理.md | 3 | **setTestTask**、**controlTestTask**、ccSysGetFileRequest |
| 05-文件传输与结果上报.md | 3 | testDataFileTranslationComplete、fileTranslationComplete、**testCaseResultReport** |
| 06-告警上报.md | 2 | 设备告警、子系统告警 |
| 07-参数配置与查询.md | 4 | 参数转发、读写 |
| 08-系统维护.md | 4 | 升级、**heartbeat**、neControl、参数反馈 |
| 09-数据转发与实时上报.md | 3 | dataTransmit、**msgReport**、sigReport |
| 10-附录.md | - | 模板、编码表 |

## 未决项

- getTestCaseAll 是否纳入 MVP？甲方查用例，需要把 task 定义转成甲方 JSON 格式并通过 FTP 上传
- HTTPS 库选型（Fastify/Express）
- taskId ↔ instanceId 映射表放在哪里（northbound feature 内部？runtime？）
- sessionId 生命周期管理
- step 名称映射方案（G2 待验证）
- TLS 配置（自签名？双向？）

## 下一步

1. 完成 runtime 真实连接能力（串口/TCP mock → 真实）
2. 验证 G2（step 名称映射）和 G5（getTestCaseAll 格式）
3. 本地端到端验证：建 task → 发帧 → 收响应 → 条件匹配 → verdict
4. 以上全通后设计实施 northbound feature

### S002 — Northbound feature 实施
- 按 approved design + checklist 实施 8 步，全部完成
- 新增 northbound feature（types + translator + state + service）、platform HttpFacade、task onStepResult callback
- feature-wiring 注册 resultService + northboundService
- 43 个单元测试通过，build + lint 通过
- 5 项跨 feature 遗留详见 S002 §后续

### S003 — 甲方文档 V1.0.4 差异 + 控制接口规范分析
- 对比接口设计 V1.0.4（0526）与旧版 0513 实质差异
- 提炼控制接口规范 V1.0 关键内容（认证 + 9 上报接口）
- 关键发现：JWT Bearer 认证机制（全新）、上报路径 `/partner-api/admin/`、startTestCaseList 已删除确认
- 高影响变更：executionPlan 新增、设备信息批量查询、ftpServerIP、warnTime、msgReport 重构
- 新增待确认 5 项（甲方下发网关接入、HTTP/HTTPS、心跳、token 刷新、错误处理）

### S004 — 甲方接口连通性 Brainstorm
- 目标：跑通双向 HTTP 连通，内部功能可 mock
- 架构决策 4 条：出站走 HttpFacade 不改 main、Token 管理 northbound 内部、认证头 service 层拼、内部 mock
- 出站 9 个接口全部要做（已有 2 个 translator，需补 7 个 + token 管理 + 心跳定时器）
- 自检发现 3 个重大差异：types.ts 缺甲方公共信封字段（必须修）、入站路径和 HTTPS 需联调确认
- 状态：待用户审阅确认

### H001 — 甲方接口连通性实施 Handoff
- Design approved + checklist 就绪，交接给新对话实施
- 直接合同：northbound-connectivity-design.md + northbound-connectivity-checklist.yaml
- 8 个 steps（types→auth→translator→heartbeat→service→index→tests→verify）
- 不改 main/platform/其他 feature，不改 Vue/Pinia/Electron 依赖进入 core/

### S005 — Northbound Connectivity 实施 + 审查补测
- 按 H001 handoff 接续，读完全部必读文档后按 s1→s8 顺序实施
- s1 types.ts 重写（信封 + 9 出站类型）、s2 auth.ts 新建、s3 outbound-translator 扩展（createEnvelope + 7 新函数）、s4 heartbeat-timer 新建、s5 service 重写（auth + heartbeat + 信封响应 + 6 report 方法）、s6 index.ts 导出、s7 测试、s8 验证
- build + lint + test 通过（northbound 74 tests，0 新 error）
- 审查反馈：代码合规 PASS、类型对齐 PASS、测试覆盖部分不足（入站路由 0 覆盖）
- 补测：新增 9 个入站路由测试 + 3 个 report 方法测试 + 1 个 handleStepResult 正向测试，共 +32 tests
- 已知小问题：heartbeat-timer 内部构造冗余、postToCustomer 空 catch 无日志、inbound-translator pre-existing lint error
- checklist 全部 step=done、7 cross-cutting checks=pass

### S006 — Mock Task + 入站 Stub 补全
- 目标：甲方联调前补齐所有非 TBD 入站接口
- Mock task 执行：translateTestCaseToMockTaskDefinition（1.5s delay step），保留真实翻译函数供后续切换
- 7 个 stub handler（getDeviceList/getDeviceInfo/setDeviceInfo/getPars/setPars/dataTransmit/neControl）+ getTestCaseAll（含 FTP）
- FTP 基础设施：platform FtpFacade + main process basic-ftp + bridge + feature-wiring
- getSubSysState 补 mock 数据（swVer/status/data）
- build + lint + test 通过（1394 passed, 86 northbound tests）
- 审查：FtpUploadConfig 类型重复定义（minor）、getDeviceList mock 缺 antennaManu/antennaType（minor）
- 设计文档：`codestable/features/rewrite-northbound/northbound-stubs-and-ftp-design.md`

### H002 — Mock 数据真实化 Handoff
- 根据 激光接口信息表 把 mock 数据做得更真实
- 需讨论：MOCK_DEVICE 字段、MOCK_TEST_CASES 场景、getPars 参数、getSubSysState 自检信息
- 不能闭着眼做，先和用户讨论确认

### H003 — 甲方连通 UI Handoff
- 提供配置甲方连接参数 + 启动/停止服务的 UI
- 用户明确表示不知道当前 UI 怎么用，必须先讨论
- 需讨论：最少操作集、页面位置、配置持久化、使用流程、service readiness audit
- 必须先读前端规范再动手

## 当前状态

**入站 12/12 handler 就绪，出站 9/9 translator 就绪，auth + heartbeat + FTP 就绪。**
**S008 + H005 完成（中心对接 UI + TaskManagePage 重构）。**
**S009 + H006 完成（task 模板/实例分离 + 钩子机制 + 持久化 + UI 双 tab）。**
**S011 完成（甲方真实联调双向连通 + 2 个 bug 修复 + RuoYi Plus 认证机制 + 防火墙诊断）。**
**H008 + R001 + R002 + D001/D002/D003 完成（粒度调研 + setTestTask 协议层对齐 + 代码清理 + 工程量评估 + 子系统认知纠正:我们是 LAS,翻译是双向同源简单工程）。**
**对接闭环实施完成(2026-06-19,分支 feat/northbound-task-integration,8 commit,已合 main)：翻译器 encode/decode + getTestCaseAll + setTestTask decode + 报告收集器 + 模板上报开关 UI。375/380 测试通过。**
**⚠️ 2026-06-19 方向调整(H009):用户指出"上报标记挂 TaskTemplate"是错误耦合。正确方向:task 模板保持纯粹,command-ingress 维护"模板→用例"映射表(B 方案)。本轮 CustomerSyncMeta + 模板 UI 开关需回滚;翻译器/快照/路径/报告收集器保留。详见 H009。**
**S012 完成(2026-06-22,H009 执行):本轮 8 commit 的耦合部分已回滚(task feature 零甲方字段,grep 0 匹配);command-ingress 新建 catalog-mapping.ts 映射表(CatalogMapping + CRUD + localStorage)+ 挂进 use-central-docking 第四份数据;翻译器 encode 入参从 TaskTemplate 改为 (EncodeSource + mapping);getTestCaseAll 数据源改为映射表(selectEnabledMappings + getTemplate);用例目录 tab UI 从手写 JSON 改为"选模板 + 配可覆盖字段"列表式管理。1464/5(baseline 1463/5,0 新增失败)。D002 标记 partially-superseded,D004 新建。**
**S013 完成(2026-06-23):登录 password 缺失修复(S011 同 bug 复发)。根因 b 铁证——`persistConfig`/`PersistedConfig` 从 S008 起漏存 password(非回归);auth.ts 加两层防御(D005:password/username 非空前置校验 + access_token 缺失报错,杜绝 undefined 被 JSON.stringify 静默吞);DockingConfigDialog password 加必填 rules。northbound+CI 270/5(0 新增失败,5 failed 全 heartbeat-timer pre-existing baseline),lint 0,tsc 工具自身 bug 与本任务无关。离线研究:controlTestTask action 矛盾(文档参数表只列 abort vs 示例四种,代码按四种实现,stop/abort 语义待联调实测区分)+ getTestCaseAll 报文核对(runSubSys 必填级遗漏 + durate/satelliteCount/stationCount 硬编码,联调有字段校验反馈再补)。实测:登录通(token 604799s)、入站通(真实拓扑=甲方后端在桥接虚拟机 10.15.5.93,改 t_sub_system.base_url=http://10.15.4.54:5001 + 加 5001 防火墙规则)。联调顺带发现 S012 遗留 blocker bug → 开 H010 交接 S014。**
**联调现状：login/heartbeat/getSubSysState/getTestCaseAll(请求到达)✓ 通；getTestCaseAll 响应 datas 空(S014 第一层 testCaseConfig 已修但未联调;第二层 D006 协议理解错误待下一轮重写——datas 该走 FTP 文件非响应体);setTestTask 已实现(待联调)。**
**已知未做:UI 美化、真实设备对接、ExecutionListPage 来源标识、controlTestTask action 联调实测(文档矛盾待解)、getTestCaseAll 字段补全(runSubSys 等)、getTestCaseAll 协议流程重写(D006:FTP 上传 + fileTranslationComplete 通知,待下一轮)、FTP 配置 UI(DockingConfigForm 加 5 字段,顺带打通 TestReport 上传链)、fileType/fileIndex 字段联调确认。**
**S016 完成(2026-06-23):中心对接数据文件持久化。用户报"用例目录/对接配置重装就丢"——根因是 S012 治本时只迁了 task 模板,这 4 份(northbound-docking-config/devices/catalog-mappings/test-catalog)漏迁还留 localStorage。新建 command-ingress/services/docking-file-storage.ts(照 task-template 范式,3 份合写 state/docking.json + .bak + 原子写);LazyDockingStorage holder 照 LazyPersistence 延迟注入;bootstrap 加 hydrateDockingData;use-central-docking 加 storage 参数改调;顺带删死代码(DEFAULT_TEST_CASES/DEFAULT_TEST_CATALOG/setTestCatalogData/configuredTestCases 整条链)。docking-file-storage.spec 12/12 过,全量 1754/11(全 baseline,stash 0 新增),lint 0。延续 S012 文件持久化范式,不新建 D###。**
**D007 落档(2026-06-24):FTP 主动/被动模式联调踩坑。甲方 readRemoteFile 报 ConnectException 拒绝连接,经 telnet + 我方 curl + 甲方 worker curl + tcpdump 联调实测,定论病根在甲方 Java 代码走主动模式(数据通道服务端反向连客户端,穿不过"只放行 21"的隔离网络),正解是甲方加 `ftpClient.enterLocalPassiveMode();`,我方零改动。否决"关服务端被动模式"等 5 条错误排查路径,沉淀 curl 双端对比 + tcpdump 抓控制通道命令的定位 SOP。待办:抓甲方 Java 包坐实 + 甲方改代码后回归。**
**S017 完成(2026-06-24):getTestCaseAll↔setTestTask 完整闭环首通,修三段连环 bug。①(1a1b2e1)encode 文件字段名不符甲方 CaseInfoNode 契约——反编译 syncNode 字节码铁证:第一关 node.id 空+无 children→return,我方 outCaseId/caseName/caseType 全被 fastjson2 静默丢弃→insertCases=0。重命名 id/name/type、树形结构(菜单套用例)、inputPars 改 CaseInfoInputPar 兜底填(runSubSys 复用 subSysId)。id 放 outCaseId 保 decode 闭环,snapshot/decode 一字不动。②(c97a714)setTestTask executionPlan.nodes 对象格式未解析——文档 L353 写字符串,甲方实际发 {id,name,type} 对象,resolveNode 把对象当字符串查 Map→任务零创建。工程兜底兼容两种格式(责任在甲方契约漂移)。③(1655f88)reportedSnapshotStorage 未接线——feature-wiring 漏传可选字段,getTestCaseAll save / setTestTask load 双双可选链短路→snapshot missing→占位 fail 任务。同 S014 病:可选字段+单测手动传值+runtime 漏接=静默失败。实测闭环通:6 用例下发,decode 出 27 步真实 definition,lifecycle:running,串行编排(6 层逐层)符合设计。translator 12/12 + northbound-service 43/43。顺带:DEFAULT_DOCKING_CONFIG 填真实对接值(凭据⚠️已进 git 历史)、nanoid 漏声明 pre-existing(用户自修未提交)、electron 二进制被墙手动解压+path.txt。详见 S017-...md。**
**S018 完成(2026-06-29,代码待联调):用例报告配置(TestReport 内容驱动)实施,D008 落地。执行 H013 handoff,9 task TDD。报告内容由"每用例一份配置清单(checkPoints/statisticsItems/attachItems 三类)"驱动,task 跑完按清单从 DisplayService 取 displayValue 填甲方 TestReport。command-ingress 新建 report-config(CRUD+IO+文件存储+LazyReportConfigStorage holder)+ 3 UI 组件(direction:'receive' 字段选择);CatalogMappingPanel 嵌入报告配置编辑区 + 导入导出。northbound 加 reportConfigProvider + displayFieldReader 注入口;generateTestReport 清死代码,三类改配置驱动,无配置诚实空着(删 DEFAULT_MOCK_CONFIG 假数据常量)。feature-wiring 注入两 port(防 S014/S017 漏接)。防 S014/S017 同病:LazyReportConfigStorage 显式测 setDelegate 前返空分支。全量 1967 passed / 11 failed 全 pre-existing baseline(checkout a3d7cd3 对照 0 新增);tsc 0 / lint 0。守 D004(task/display 零改动)。状态:**待联调**——留给用户验三类 displayValue(锁定/0.2% 非 0x01)+ FTP 上传 + 甲方收到正确解析。无新建 D###。详见 S018-report-config-impl.md。**

### S017 — getTestCaseAll 契约对齐 + setTestTask 三段 bug 闭环修复
- 起因:联调机跑 getTestCaseAll + setTestTask,甲方日志 insertCases=0(用例没落库)+ 我方任务不执行。逐层排查发现**三个独立 bug 串联**,此前 setTestTask 从未真正执行过真实用例(前几轮 login/heartbeat/FTP/持久化都通了,但下发执行这一步是首次跑通)
- **Bug ①(1a1b2e1)encode 字段名不符 CaseInfoNode 契约**:反编译甲方 `syncNode` 字节码铁证——第一关 `node.id` 空+无 children→return,我方 outCaseId/caseName/caseType 被 fastjson2 静默丢弃→getId() 永远 null→6 节点全跳过。修:CustomerTestCase 重命名 id/name/type、树形(菜单套用例)、inputPars 改 CaseInfoInputPar 兜底(cnName 取 path 末段/defaultValue 取当前值/余空串)、runSubSys 复用 subSysId。**id 放 outCaseId 保 decode 闭环**(decode/load/loadAll/storage 全不动)
- **Bug ②(c97a714)executionPlan.nodes 对象格式未解析**:文档 L353 写字符串 `"TC-TLM-001"`,甲方实际发 `{id,name,type}` 对象,resolveNode 把对象当字符串查 Map→任务零创建→"没反应"。责任在甲方契约漂移。工程兜底:`typeof node==='string'?node:node.id`,兼容两种,任一方回退不受影响
- **Bug ③(1655f88)reportedSnapshotStorage 未接线**:feature-wiring 漏传可选字段,getTestCaseAll 的 `?.save` / setTestTask 的 `?.load` 双双可选链短路→snapshot missing→跑占位 fail 任务("一收到就停止")。**同 S014 病**:可选字段+单测手动传值+runtime wiring 漏接=静默失败。修:feature-wiring 创建 storage(默认 localStorage)并传入
- 实测闭环通:6 用例下发,testCaseId=templateId@reportedAt(=文件 id=快照反查键),decode 出 27 步真实 definition(1540 波长测试:mod off→...→comm-rx-reset),lifecycle:running。串行编排验证:6 层逐层,layer1 跑完(或停)才进 layer2,符合 processLayers 设计
- 验证:translator 12/12 + northbound-service 43/43;诊断日志(decode dump/loadAll dump/lifecycle dump)用完即撤(git checkout 回 HEAD)
- **教训**:① 可选字段+单测手动传值=静默失败温床(S014+本轮 bug③ 同病)② 甲方文档≠甲方实现(bug② 铁证),工程兜底+攒证据对齐两条腿 ③ 联调是唯一真相,前几轮单测全过但 setTestTask 从没真跑过 ④ 反编译是契约争议终审(bug①)
- 详见 S017-testcase-all-contract-and-settesttask-closed-loop.md

### S018 — 用例报告配置(TestReport 内容驱动)实施(D008 落地)
- 执行 H013 handoff,按 D008 方向(配置驱动,推翻 H012 执行链路采集)TDD 实施 9 个 task
- 收 handoff 验证 10 条事实声称全 PASS;发现 3 个不阻塞偏差(工作树实际 clean / field-parser 在 receive/core 非 display/core / S 文件 13 个触发 warn)
- 产出:command-ingress 新建 report-config.ts(CRUD+守卫)+ report-config-io.ts(导入导出)+ report-config-file-storage.ts(文件存储 + LazyReportConfigStorage holder);3 个 UI 组件(ReportConfigEditor/ReportCategoryEditor/FrameFieldPicker,direction:'receive');CatalogMappingPanel 嵌入报告配置编辑区 + 导入导出按钮
- northbound:NorthboundServiceOptions 加 reportConfigProvider + displayFieldReader;uploadTestReportAndNotify 按 reportConfig + displaySnapshot(从 displayService.getSourceFields 构 Map<dataItemId,displayValue>)取值填三类;generateTestReport 清死代码(usingCollected + 三元同体),三类改配置驱动,无配置诚实空着(不 fallback DEFAULT_MOCK_CONFIG,常量已删)
- runtime:feature-wiring 注入 reportConfigStorage holder + 两 port(:255-256,grep 确认防 S014/S017 漏接);rewriteRuntime 加 hydrateReportConfigData(照 hydrateDockingData 同款)
- **防 S014/S017 同病**:Task 3 LazyReportConfigStorage 显式测 setDelegate 前返空分支(正是 S014/S017 漏掉那条);Task 5 集成测试显式测空壳阶段三类空
- 验证:report-config 22/22 + io 14/14 + file-storage 14/14(含时序) + generateTestReport 12/12 + northbound-service 47/47(含 2 条 reportConfig 驱动)+ runtime 47/47;全量 1967 passed / **11 failed 全 pre-existing baseline**(checkout a3d7cd3 对照证实 0 新增失败);tsc 0 / lint 0
- **状态:待联调**(诚实红线:代码过单测不等于通,联调是最终判据)。留给用户:真实跑 task 验三类 displayValue(锁定/0.2% 非 0x01)+ FTP 上传 + 甲方收到正确解析三类
- 无新建 D###(D008 既定实施);守 D004(task/display 零改动)
- 详见 S018-report-config-impl.md

### S016 — 中心对接数据文件持久化(localStorage → 文件)
- 起因:用户报"用例目录没有持久化,对接配置也是,重新安装后就变回去了。这对吗?"
- **不对,是遗漏**。S012 治本只迁了 task 模板,中心对接 4 份数据(northbound-docking-config/devices/catalog-mappings/test-catalog)漏迁留 localStorage。Electron localStorage 存 userData 的 LevelDB,清缓存/删 userData/某些重装都会整丢
- brainstorm 拍板 5 点:① 全 4 份迁(旧 JSON catalog 决定删非迁,D004 后已死)② 架构 A(feature 内建 file-storage,不挂 FeaturePersistence)③ localStorage 自动迁移+清(跟 task 模板同套路)④ 全归 command-ingress(守 D004)⑤ 单文件 docking.json 装 3 份
- 实施:新建 docking-file-storage.ts(createDockingFileStorage + LazyDockingStorage holder);feature-wiring 加 dockingStorage 字段;rewriteRuntime 加 hydrateDockingData(紧跟 hydrateTaskTemplates);use-central-docking 加 storage 参数,初始化+CRUD 全改调 storage;CommandIngressPage 传 runtime.features.dockingStorage
- 时序关键:useCentralDocking 同步读,bootstrap 异步 hydrate——靠 AppShell `v-if="!hydrated"` 保证 ready 前不渲染 router-view,composable setup 时 setDelegate 已执行,无冲突
- 删死代码:docking-labels 的 DEFAULT_TEST_CATALOG;northbound 的 setTestCatalogData/configuredTestCases/DEFAULT_TEST_CASES(D004 后已死);旧 docking-config-persistence.spec(localStorage 路径已被 storage 取代,等价防御在 docking-file-storage.spec saveConfig 覆盖)
- 验证:docking-file-storage.spec 12/12;command-ingress+northbound 275/280(5 failed 全 heartbeat-timer baseline);全量 1754/11(全 baseline,stash 对照 0 新增);lint 0;vue-tsc 工具自身 bug(与本任务无关)
- 延续 S012 文件持久化范式,**不新建 D###**
- 详见 S016-docking-data-file-persistence.md

### S014 — getTestCaseAll datas 空:testCaseConfig 漏接线修复 + 协议理解纠正(D006)
- 接 H010 handoff(S013 联调中发现的 S012 遗留 bug)
- 现象:用户点"用例同步"后"啥也没看见"。铁证:甲方日志 15:57:34 响应只有信封字段无 datas,请求无 ftpInfo
- **第一层根因(已修)**:feature-wiring.ts:183-189 漏传 testCaseConfig → northbound-service.ts:533 `if(!options.testCaseConfig) return null` 永远命中 → testCases 空数组。类型契约裂缝:`testCaseConfig?` 可选但 handler 当必填,单测 spec:857-861 手动传值掩盖 runtime gap。**已修**:方案 A——deriveTestCaseConfig 从 activeConfig.subSysId 取真源 + 激光默认常量,删 options.testCaseConfig 死字段。northbound-service.spec 42/42 过,lint 0,全量 11 failed 全 baseline(stash 证实 0 新增)
- **⚠️ 第二层根因(协议理解错误,本轮发现,下一轮修,D006)**:datas **该走 FTP 文件**,不是 HTTP 响应体字段。文档铁证:03-用例管理.md L5"采用 json 文件传输方式"+ L73-91 响应表无 datas 字段 + L158-517 datas 是文件 testcase_all.json 内容。代码 L586 把 datas 塞响应体是 S006 mock 时代错误实现,我盯着它看反而被误导。用户原话"他们用例都用的 tm 的 ftp"纠正
- **D006 拍板的正确流程**:getTestCaseAll 收到 → 序列化 {datas:[...]} → FTP 上传到【config.ftp】+【basePath/yyyy-mm-dd/testcase_all.json】→ 回应 statusCode:1(响应体无 datas)→ 调 fileTranslationComplete(tranType:upload,filePath)通知甲方。FTP 地址我们自己配、路径我们自己建
- **4 个代码 gap 待下一轮修**:① L579 序列化缺 {datas} 包裹 ② L586 响应体多塞 datas ③ fileTranslationComplete 没接到 getTestCaseAll ④ FTP 地址源用错(用请求 ftpInfo,应 config.ftp)
- **FTP 配置 UI 待下一轮做**:DockingConfigForm 加 host/port/username/password/basePath 5 个输入框 + saveConfigAndConnect 传 ftp + 持久化。修好后 TestReport 上传链(uploadTestReportAndNotify L188)也能通
- **待联调确认字段**:fileType(文件类型标识表无 TestCase 类,先占位)、fileIndex(先填 0)、testDataFileTranslationComplete vs fileTranslationComplete(用户先答前者讨论指向后者)
- **教训**:理解协议先读文档,不要先读代码。代码可能错(S006 mock 残留),甲方权威文档是基准
- 状态:**testCaseConfig 修复(第一层)已完成并测试通过**;协议流程对齐(第二层 D006)+ FTP 配置 UI 留下一轮(S015 或 S014 续接)

### S007 — 报告链路分析
- 发现甲方要三层：msgReport（实时进度）+ testCaseResultReport（快速 verdict）+ TestReport.json FTP 文件（详细报告）
- TestReport.json 包含 checkPoints（期望vs实测）、processAndDatas（每步配置+结果）、statisticsItems
- 当前只有前两层，第 3 层（报告生成 + FTP 上传 + testDataFileTranslationComplete 通知）完全缺失
- 决策：报告先用 mock 数据占位，与 send/receive 帧结构解耦，两边独立做
- 帧数据后续接到 report-generator 的输入

### H004 — TestReport 生成 + FTP 上传 Handoff
- 补齐第 3 层：TestReport.json 生成 → FTP 上传 → testDataFileTranslationComplete 通知
- 核心模块：report-generator.ts（纯函数，输入 mock 数据，输出报告 JSON）
- 与帧结构完全解耦：report-generator 只依赖输入数据结构
- 已有 translator（translateTestDataFileComplete）和 FTP facade 可复用

### S008 — 中心对接 UI 设计与实施
- 现有 CommandIngressPage"中心对接"tab 是空壳（composable 全部 throw）
- Service 层零 gap，NorthboundConfig 9 字段完全对齐两份甲方文档
- 7 个设计决策：配置弹窗、任务列表、设备列表、上报弹窗、配置持久化、状态面板、连接流程
- 2026-06-10 完成：基础接线（composable 重写、配置弹窗、任务列表、上报弹窗、状态面板）
- 2026-06-11 补充：设备表可编辑 CRUD + 用例目录 JSON 编辑器 + 数据喂给 northbound service（setDeviceList/setTestCatalogData）+ localStorage 三份持久化（config/devices/catalog）
- northbound-service.ts 新增 setDeviceList/setTestCatalogData，handler 从可配置数据读取
- 内嵌 tab 从 2 变 3：任务列表 / 设备列表（可编辑）/ 用例目录（JSON 编辑器）
- lint 零新增 error
- 设计+实施文档：S008-docking-ui-design.md
- 2026-06-11 第三轮：Mock 状态审计（上报链路 real，用例/执行 mock），发现 Task step kind `o_send` vs `send` 不匹配 bug，Task UI 无法区分北向任务
- 2026-06-11 第四轮：HAR 真实流量比对（12 agent × 2 批），列出 12 BLOCKS + 25 AFFECTS_BEHAVIOR 偏差。决策：/admin/ 要加、subSysType 用 laser/ka 小写、subSysId 用 outSubSysId 短码、FTP 后续做、V1.0.4 > HAR 优先级。P1 修复清单 8 项 + P2 修复清单 2 项已锁定，按 3 批子 agent 派发（types+labels → translator+service → 验证）

### H005 — Task UI Overhaul 实施 Handoff
- TaskManagePage 全面修复 + 功能补全 + 组件化重构
- 9 处 o_send bug + 缺失的帧/字段/运算符选择器 + Phase 2 功能（repeat/exitCondition/fieldVariation）
- 6 个新组件：FrameSelector / ConditionTermEditor / SendStepEditor / WaitConditionStepEditor / DelayStepEditor / AdvancedConfigPanel
- 设计文档：`codestable/features/rewrite-task/task-ui-overhaul-design.md`
- Checklist：`codestable/features/rewrite-task/task-ui-overhaul-checklist.yaml`
- 12 步实施，s1→s12
- **2026-06-11 实施 + 审查完成**：
  - checklist 全部 done，lint 0 新错误，test 0 新失败
  - 三路独立审查（新组件 / 页面重构 / 跨模块集成）通过
  - 4 个 critical 代码质量问题（SendStepEditor 缺 props 声明 + null check；AdvancedConfigPanel exitConditions() 应改 computed + 内联 split/map/filter）
  - 发现 **DataCloneError 阻塞 bug**：use-task-editor 从 reactive ref 构建 TaskDefinition → 传入 service → task-state deepClone(structuredClone) 无法克隆 Vue Proxy → 保存失败。修复方向：composable 层 toRaw() 解包
  - 发现 **任务持久化缺失（设计 gap）**：当前任务完全无持久化，刷新即丢。task-real-brainstorm.md:265 写了"不做任务模板"但用户明确反对，是 brainstorm 阶段错误决策，需推翻
  - 用户反馈 UI 丑，待具体反馈
  - **三个问题待后续深度讨论**：DataCloneError 修复 / 任务持久化方案（localStorage vs 文件，模板 vs 实例 UI）/ UI 美化

### S009 — 任务定位讨论与钩子机制新发现
- 用户提出"任务定位模糊"根因问题，比持久化/UI 更根本
- 五点拍板：A 模板 / B 外封一层（大唐/SCOE 都是 task + 控制信封）/ C 同概念 / D 双 tab / E 钩子机制（事件流）
- 第一批 3 个 explore agent 调研：task 代码结构 / brainstorm 文档脉络 / 事件通知现状
- 关键发现：
  - TaskDefinition/TaskInstanceState 类型分离 ✓，但 service 层无"模板"概念，createTask 直接创建 instance
  - 无任何持久化代码
  - "不做任务模板"是 brainstorm 笔误/遗漏（从未在讨论中出现）
  - 钩子机制完全没在文档里提到，是设计盲区
  - 现有事件机制：硬编码回调注入 + 延迟绑定（stepResultHolder），单订阅者，无终态事件
- 设计产出：`codestable/features/rewrite-task/task-positioning-design.md` + checklist.yaml（M1-M4，s1-s4）
- 文档：S009-task-positioning-and-hook-mechanism.md
- **H006 实施 s1-s4 全部完成**（2026-06-11）：
  - s1 模板/实例分离 + DataCloneError 修复（types/state/service 改造 + deep-raw.ts）
  - s2 钩子机制（subscribe + 错误隔离 + northbound 事件驱动）
  - s3 持久化层（localStorage + JSON 导入导出 + debounce 500ms）
  - s4 UI 双 tab（TemplateListPage + ExecutionListPage + TaskManagePage 重构 + createBlankStepByKind）
  - 226 测试通过，lint 0 错误
  - 独立审查 revise-required → 修复 2 major（搜索失效、详情面板 stale data）+ 4 minor，已交付

### S011 — 甲方真实联调：从静态就绪到双向连通
- 目标：把已就绪的 northbound feature 跟甲方真实后端跑通
- 网络拓扑分析：笔记本三网卡（有线 192.168.0.243 / WLAN 10.63.198.175 / VBox 192.168.56.1），甲方虚拟机宿主机 10.105.65.195 通过 NAT 暴露 880→80
- 出站方案：单向 NAT 端口转发，笔记本访问 http://10.105.65.195:880/ 通
- 修两个 bug：heartbeat subSysType 硬编码空串（heartbeat-timer.ts + outbound-translator.ts）+ auth expire_in 字段兼容（4 种命名）
- 登录失败根因：不是字段名问题，是 password 缺失（JSON.stringify 自动省略 undefined）
- RuoYi Plus 认证机制深挖：partner 登录不走 sys_user，走 t_third_application 表（app_key=username, app_secret=password），sys_client 表只验证 clientId
- 用户在第三方应用管理菜单建记录后登录通
- 入站连通：Windows 防火墙拦入站 80，加规则 `New-NetFirewallRule -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow` 后通
- V1.0.4 信封格式被甲方实际流量印证（subSysType='laser'、subSysId='JG'、POST+/api/ 前缀全对）
- 联调结果：heartbeat/login/getSubSysState ✓，getTestCaseAll 收到但用例同步卡点（mock 数据可能不符 spec）
- 发现甲方不下发任务模板（确认 S001 决策），用户提"任务当用例"设计想法
- 留给新对话：getTestCaseAll 响应格式设计 + task 模板序列化（mock 换真实）

### H007 — getTestCaseAll 响应格式设计 Handoff
- 交接目标:把 getTestCaseAll 从 mock 换成真实 task 模板列表,对齐 V1.0.4 spec 让甲方用例同步跑通
- 已完成边界:联调网络/认证/heartbeat/getSubSysState 已通;2 个 bug 已修;task 模板基础设施(S009/H006)就绪
- 不要做:不要把甲方内部存储格式当协议格式;不要重新发明模板存储;不要碰联调网络层;不要做真实执行/报告生成
- 必读:本 handoff + S011 + V1.0.4 03-用例管理.md + S009 task-positioning-design
- 下一轮:先 brainstorm 协议字段 + 映射方案,再 design,再实现替换 mock,最后联调验证
- **2026-06-16 暂缓实施**:粒度方向需先用真实文档/报文厘清,转入 H008

### H008 — 甲方任务/用例/实例 粒度调研 Handoff
- 起因:用户对粒度方向困惑(任务↔实例 vs 任务↔用例),且发现旧文档/转述不足以下结论(HAR 已证明 V1.0.4 也不全准)
- 性质:**纯调研**,不改代码。产出"粒度映射方案 + 真实证据"
- 前提:用户先提供甲方最新接口文档 + 真实接口报文(getTestCaseAll 响应/setTestTask 请求体),用户说"让我去拿"
- 5 个必答问题:Q1 甲方几层概念 / Q2 getTestCaseAll 真实结构 / Q3 setTestTask 真实结构 / Q4 现有模型怎么映射 / Q5 4 个凑合方案
- 关键:topic-index:23 旧映射"testCase = task(TaskDefinition)"措辞过时,本调研厘清后由主对话更新为 D### 决策
- **2026-06-17 调研完成**:用户因 NAT 断无法新抓报文,但核查发现 0531 HAR 含完整甲方内部数据模型(caseMenu/caseTemplate/caseSet/task 四层),足够回答粒度问题。产出 R001。证据可靠度:高(真实流量>文档)。
- **关键发现**: 甲方四层概念厘清;用户"任务对应实例太麻烦"基于错误前提(真实是甲方 task 下发 N caseId → 我们 N TaskInstance);taskMonitor/{id} 实锤甲方 `POST /api/task/setTestTask` 下发(目标 127.0.0.1:8800,与 S011 的 80 端口有差异待联调确认)。
- **决策**: 新建 D001(caseTemplate↔TaskTemplate 映射确认 + 修正 topic-index:23 措辞)。用户拍板:getTestCaseAll 返回扁平 caseTemplate / 字段填空默认值 / caseSet 不支持。
- 后续: H009 实施 getTestCaseAll 真实化(替换 mock)

### R001 — 粒度调研结论(基于 0531 HAR)
- 证据: `rewrite/docs/10.15.5.53.har` 53 条**ka 子系统**前端流量(⚠️ 非 laser,见 D003),反推甲方 caseMenu/caseTemplate/caseTemplateParam/caseSet/task/taskFlowchart/taskMonitor/taskResult 数据模型
- 结论: 四层概念厘清(caseTemplate/task 结构通用,有效)+ 映射方案。详见 R001 正文与证据索引表
- **2026-06-17 二次核对**: 用户提醒 setTestTask 结论可疑,通读 04-任务管理.md 发现初版误把甲方 UI 模型当协议格式。已重写 Q3,代码 3 处 UI 残留已修复,northbound-service.spec 39/39 过
- **2026-06-18 D003 纠正**: HAR 字段值是 ka 的,对 laser 无参考(仅结构通用)
- 驱动决策: D001

### R002 — task 系统 ↔ 甲方协议 对接工程量评估(+ UI/UX 鸿沟 + 本地关联)
- 调研问题: 对接是不是"大工程"? UI 会不会兜不住? 和本地 task 咋关联?
- **⚠️ 2026-06-18 D003 推翻**: 翻译层"parId→frameId 站不住/中等工程"结论**错误**(基于 ka 数据对不上 laser frame)。正确: parId 由我们定义,双向同源,翻译天然成立(简单工程)
- **仍有效**: 与本地 task 关联验证(实例层已通/模板层断点)、UI/UX 鸿沟(northbound 0 个 .vue)、工程量拆块结构
- **与本地 task 关联(已验证)**: 实例层已打通(feature-wiring 同一 taskService);模板层断点(getTestCaseAll 用 configuredTestCases 非 TaskTemplate)
- **H009 数据源已定 D002**: getTestCaseAll 从 `listTemplates()` 序列化 + 上报标记
- UI 现状: northbound 0 个 .vue,step 编辑器完整可复用。frontend-design skill 暂不适用
- 关联: inbound-translator.ts:25-30 TODO / feature-wiring.ts:141,169,184

### D003 — 翻译层模型 = 双向同源映射(推翻 R002 翻译层结论)
- 核心认知: 我们是 5 个子系统之一(laser LAS),HAR 是 ka(KPS)兄弟的数据。用例由我们 getTestCaseAll 主动上报,parId 我们定义
- 翻译模型: 上报(TaskTemplate→caseTemplate,parId 按规范生成)↔ 下发(caseTemplate→TaskInstance,parId 反查),两端同源
- 推翻: R002 "翻译层站不住/领域知识密集" → "同源映射/简单工程"
- 不受影响: D001(映射方向)/D002(数据源)/本轮代码清理(setTestTask 协议层)
- 待 NAT 恢复后补: laser 的真实 caseTemplate 样本(HAR 只有 ka 的)

### H009 — 对接方向调整:映射表归 command-ingress(推翻 D002 耦合设计)
- 起因:用户指出"上报标记挂 TaskTemplate"是跨职责耦合,任务系统应纯粹
- 方向(B 方案):task 模板不带甲方字段;command-ingress 维护"模板→用例"映射表(enabled/overridablePaths/outCaseId);northbound 做 encode/decode
- 现状:command-ingress 已有中心对接 UI + 用例目录(S008),缺的是和 task 模板接起来
- 本轮已合 main 的代码:翻译器/快照/路径/报告收集器**保留**;CustomerSyncMeta + 模板 UI 开关**需回滚**
- 推翻 D002 的"挂 TaskTemplate"部分;D001/D003 不变
- 详见 H009-catalog-mapping-refactor-handoff.md

### S012 — catalog mapping 归 command-ingress(H009 执行 / D004)
- 执行 H009 handoff,跨 3 feature 重构
- 步骤 1 回滚 task 耦合:删 CustomerSyncMeta + TaskTemplate.customerSync + TemplateUpdates.customerSync + TaskInstanceState.source/customerTaskId;删 use-template-editor 的 syncEnabled/overridablePathsText 状态及 save/openEdit/resetForm 逻辑;删 TemplateListPage 上报开关 UI。task feature 271/271 过,grep customerSync 0 匹配
- 步骤 2 建映射表:新建 command-ingress/core/catalog-mapping.ts(CatalogMapping + 纯函数 CRUD + localStorage),挂进 use-central-docking 作第四份数据,12 个单测全过
- 步骤 3 翻译器接口改(TDD):encodeTaskTemplateToTestCase → encodeSourceToTestCase,入参 (EncodeSource + mapping);getTestCaseAll 数据源改 selectEnabledMappings + getTemplate;decode 链零改动。translator 11/11,northbound 全套 119/124(5 失败全 heartbeat-timer pre-existing baseline)
- 步骤 4 UI 改造:用例目录 tab 从手写 JSON 改为映射列表表格 + 添加/编辑 dialog(选模板 + enabled + 可覆盖路径 + 候选路径 chip 一键填);旧 JSON 编辑器降级为折叠调试用
- 验收:全套 1464 passed / 5 failed(baseline 1463/5,+1 通过 0 新增失败);lint 改动文件 0 error;vue-tsc 工具自身有 bug(与本任务无关)
- D002 标记 partially-superseded;D004 新建
- 详见 S012-catalog-mapping-refactor.md

### S013 — 登录 password 缺失修复 + 防御(D005)+ 离线接口研究
- 用户报"目前又 tm 连不上了",日志铁证=登录被拒(POST /auth/partner/login 请求体无 password,参数校验异常),同 S011 复发——非网络问题
- Phase 1 根因 b 铁证:`persistConfig`/`PersistedConfig`(use-central-docking.ts:22-58)从 S008(commit 56c1e05, 2026-06-11)起漏存 password(非回归),S011 时用户 UI 手填凑通、刷新即丢。`''`→`undefined` 运行时落差点未能从代码推出,但持久化缺陷无论根因是哪个都必须修
- Phase 3/4 修复(TDD):
  - auth.ts 加两层防御——login() 开头 password/username 非空前置校验(抛错不发请求)+ 响应 access_token 缺失报错(不把失败当成功,S011 bug #2)。auth.spec.ts +2 case,9/9 过
  - persistConfig 补 password 字段(PersistedConfig 接口 + 函数都加,导出供测试)。新建 docking-config-persistence.spec.ts(3 case),3/3 过
  - DockingConfigDialog password 输入框加必填 rules(UI 第一道校验)
- 验收:northbound+command-ingress 270/5(0 新增失败,5 failed 全 heartbeat-timer pre-existing baseline);lint 改动文件 0 error;tsc 改动文件 0 error(vue-tsc 工具自身 bug 与本任务无关)
- 离线研究(连不上也能做):① controlTestTask action 矛盾(文档参数表只列 abort vs 示例四种 pause/continue/stop/abort,代码按四种实现,task-service pauseTask/resumeTask 已完整实现;stop vs abort 语义代码无区分都映射 stopTask,联调实测后定);② getTestCaseAll 报文核对(encode 输出结构与文档基本对齐,但 runSubSys 必填级遗漏 + durate/satelliteCount/stationCount 硬编码,联调有字段校验反馈再补)。两项均不新建 D###(实测后补)
- D005 新建(auth 防御层);D001~D004 不变
- 两条日志=两个独立问题:日志 A 出站登录失败(本轮修)、日志 B 入站可达性(甲方 platform-admin Feign 调 127.0.0.1:5001 被拒,疑甲方 t_sub_system.base_url 回退占位值,按边界单独排查不混本轮)
- 详见 S013-login-password-defense-and-offline-research.md

### H010 — getTestCaseAll 响应 datas 永远空(testCaseConfig 漏接线,S012 遗留 blocker)
- 起因:S013 入站连通后,用户报"用例同步啥也没看见"。甲方日志(15:57)铁证:响应只有信封字段,无 datas
- 根因:`feature-wiring.ts:183-189` createNorthboundService 漏传 testCaseConfig → `northbound-service.ts:533` `if (!options.testCaseConfig) return null` 永远成立 → 所有映射判 null → testCases 空 → 响应不带 datas
- 单测盲区:`northbound-service.spec.ts:857-861` 手动传了 testCaseConfig 所以单测绿,但 runtime wiring 漏传无测试覆盖;类型 `testCaseConfig?` 可选但 handler 当必填前置条件(契约不一致)
- 不是 FTP 问题(甲方请求没带 ftpInfo,数据走响应体 datas);不是映射表问题(用户确认映射表有 enabled 项)
- 严重度:blocker——S012 核心功能(getTestCaseAll 真实化)完全失效
- 修复方向:方案 C 硬编码 laser 默认值先跑通 / 方案 A 从 docking config 派生正经接线 + service 加 setTestCaseConfig 方法
- 详见 H010-getTestCaseAll-empty-datas-handoff.md
