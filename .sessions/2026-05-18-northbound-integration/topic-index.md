# 甲方对接闭环分析

> 状态: active | 创建: 2026-05-18 | 更新: 2026-06-16

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

- **甲方 testCase = 我们的 task（TaskDefinition）**
- 甲方的 executionPlan.layers 中每个 testCaseId → 我们创建一个 task 实例
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
**联调现状：heartbeat/login/getSubSysState ✓ 通；getTestCaseAll 收到但用例同步卡点。**
**已知未做:UI 配置页面美化、getTestCaseAll 响应格式对齐(转 H008 调研,待真实报文)、真实设备对接、真实用例执行、preHandle/afterHandle 翻译层、报告生成。**

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
- 后续:调研产出 → 主对话建 D### + 更新 topic-index → H009 实施 getTestCaseAll 真实化
