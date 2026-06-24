# [S013] 登录 password 缺失修复 + 防御 + 离线接口研究

> 2026-06-23 | 排查 + 修复 + 调研 | active
> 边界护栏: codestable/quality/rewrite-frontend-conventions.md、CLAUDE.md §重写总原则
> 直接合同: S011(同 bug 历史)、topic-index 不变量、D001~D004

## 目标

① 修"目前又 tm 连不上了"(实为登录被拒——password 缺失,同 S011 复发);② 顺手做连不上也能推进的离线接口研究(controlTestTask action 矛盾 + getTestCaseAll 报文核对)。

## 记录

### 阶段 1 — 日志解读(两条独立问题,不混)

用户给了两段日志,**是两个独立问题**:

**日志 A(14:47)= 出站登录失败 = 本任务范围**
```
POST /auth/partner/login 参数:[{"username":"subsys","clientId":"...","grantType":"partner","tenantId":"000000"}]
参数校验异常
```
注意:请求体**只有 4 个字段,没有 password**。同 S011。

**日志 B(15:02)= 入站可达性失败 = NOT 本任务范围(单独排查)**
```
feign.RetryableException: 拒绝连接 executing POST http://127.0.0.1:5001/api/subSystem/getSubSysState
```
甲方 `platform-admin` Feign 调 `http://127.0.0.1:5001/...`。`127.0.0.1:5001` 是**甲方文档里的默认占位地址**(每份文档 url 栏都写这个)。说明甲方 DB 的 `t_sub_system.base_url` 回退成占位值了——S011 时改成了真实地址(10.105.65.174)+ 加了 80 端口防火墙规则,现在看着像回退。
按任务边界,入站连通性(NAT/防火墙/base_url)单独排查,不混进本轮。**留给用户**:确认甲方 `t_sub_system` 表里我们那条记录的 base_url 是否还是 `127.0.0.1:5001`。

### 阶段 2 — Phase 1 根因定位(追完整条链路)

日志铁证与 S011 完全一致。实测确认:`JSON.stringify({password:''})` → body **带** `"password":""`;`JSON.stringify({password:undefined})` → body **省略** password。**日志是后者**,说明 runtime `config.password` 是 `undefined`。

数据流完整追踪:

| 环节 | 文件:行 | 结论 |
|------|---------|------|
| ① UI 输入 | `DockingConfigDialog.vue:104-107` | password 输入框 → `patchField('password')` → emit ✓ |
| ② page 合并 | `CommandIngressPage.vue:561` | `Object.assign(docking.config, c)` ✓ 正确写回(含 password) |
| ③ 持久化 | `use-central-docking.ts:44-58` `persistConfig` | **❌ 漏存 password**(PersistedConfig 接口 + persistConfig 都没有此字段) |
| ④ 重新加载 | `use-central-docking.ts:125-128` | `{...DEFAULT(password:''), ...loadJson()}` |
| ⑤ 传 auth | `northbound-service.ts:670` `createAuthService(config.auth)` | 传 config.password |

**铁证缺陷(根因 b)**:`PersistedConfig` 接口(L22-33)和 `persistConfig`(L44-58)**从头就没有 password 字段**。git 历史证明这是 **S008(commit `56c1e05`, 2026-06-11)的原始遗漏,不是回归**——password 从第一天起就没被持久化。S011 时用户在 UI 手填 password 凑通,刷新即丢。

**`''` → `undefined` 的落差点**:按数据流,刷新后应是 `''`(默认值兜底),会带 `"password":""`,不该被省略。但日志显示省略,说明 runtime 是 `undefined`。这个落差无法从现有代码推出——可能因素:用户未在本次会话填 password / localStorage 有脏数据 / 运行时某路径置 undefined。**无论根因是哪个,持久化缺陷都必须修**(否则每次刷新都得重填)。

### 阶段 3 — Phase 3/4 修复(TDD)

**修复 1:`auth.ts` 加两层防御(S011 犯过、现在又犯,必须加)**
- password 缺失/空 → 抛明确错误("甲方对接未配置 password..."),不发会被省略的 body
- access_token 缺失 → 抛错(不把失败响应当成功,S011 bug #2:旧代码把 undefined token 当成功,打印误导性的"登录成功,token 有效期 0s")
- 测试:`auth.spec.ts` +2 case(undefined / 空串都抛错且不发请求),9/9 过

**修复 2:`persistConfig` 补 password 字段**
- `PersistedConfig` 接口 + `persistConfig` 函数都加 `password`
- `persistConfig` 导出供测试
- 测试:`docking-config-persistence.spec.ts` 新建,3 case(存 password / 保 5 个 auth 字段 / 往返不丢),3/3 过

**修复 3:UI 加 password 必填校验**
- `DockingConfigDialog.vue` password 输入框加 `:rules="[val => !!val || '请输入密码(甲方第三方应用 app_secret)']"`
- q-form 已有 @submit.prevent,校验不过时不触发 save-connect

### 阶段 4 — 离线研究

详见下方"离线研究产出"段。

## 离线研究产出

### 研究 1:controlTestTask action 矛盾分析

**文档(`04-任务管理.md`)内部矛盾**:

| 出处 | 列出的 action |
|------|--------------|
| **请求参数表**(L607) | 仅 `abort`(终止:任务及当正在执行的用例) |
| **请求消息示例**(L654-656) | `pause`(暂停) / `continue`(继续) / `stop`(停止任务) / `abort`(终止任务及用例) **四种** |

**代码实现**:

| 文件:行 | 实现 |
|---------|------|
| `types.ts:105` | `action: 'pause' \| 'continue' \| 'stop' \| 'abort'` 四种 |
| `northbound-service.ts:389-400` | `stop`/`abort` → `stopTask`;`pause` → `pauseTask`;`continue` → `resumeTask` |
| `task-service.ts:282-299` | `pauseTask`/`resumeTask` **已完整实现**(非 stub):pause→abort 当前执行循环+置 paused;resume→新信号+重启循环 |

**矛盾点清单**:

1. **文档参数表 vs 示例**:参数表只列 abort,示例列四种。**代码按示例(四种)实现**。风险:若甲方后端实际只支持 abort(按参数表),用户在甲方前端点 pause/continue/stop 时,我们 handler 会执行,但甲方侧可能根本不发这几种 action(取决于甲方前端按钮)。**联调时需实测甲方前端能发哪些 action**。
2. **stop vs abort 语义**:文档区分"stop=停止任务""abort=终止任务及当正在执行的用例",但**代码把两者都映射到 `stopTask`**(无区别)。若甲方真有 stop/abort 两种语义(abort 更激进,杀掉当前用例),我们应区分。当前 `stopTask` 的实现(L301-307)是 abort 当前循环——**实际行为更接近 abort,而非文档的 stop**。可能需要加一个"软停止"(stop=不杀当前用例,等其完成)的语义。联调实测后再定。
3. **handleCode 回填**:`handleCode: 0=ok, 1=busy, 2=env not ready`(types.ts:111),代码 L386/380 已对齐(unknown taskId→1, missing taskId→2)。✓ 与文档(L631)一致。

**结论 / 待联调实测项**(不新建 D###,联调有结果后再补):
- [ ] 甲方前端能发哪些 action(实测)
- [ ] stop vs abort 语义是否需要区分(实测甲方是否真发两种 + 行为差异)

**风险评级**:中。代码已覆盖文档示例的四种 action,即使甲方只支持 abort 也不会崩(只是 pause/continue/stop 的 handler 永不触发)。真正风险是 stop/abort 语义混淆——若甲方真区分,我们的 stopTask 行为偏 abort。

### 研究 2:getTestCaseAll 报文格式核对

文档(`03-用例管理.md`)定义了 getTestCaseAll 的**文件格式**(用例属性信息文件,L158-517)。核对代码 encode 输出(`testcase-sync-translator.ts` `encodeSourceToTestCase`)vs 文档字段:

| 文档字段(用例节点,L195-435) | 代码 `CustomerTestCase`(types.ts:334-351) | 状态 |
|------------------------------|------------------------------------------|------|
| `name`(用例名称) | `caseName`(= templateName) | ✓ 对齐 |
| `id`(用例id) | `outCaseId`(`templateId@timestamp`) | ✓ 我们用 outCaseId,甲方收到后生成内部 caseId(D002 策略) |
| `isParent`(是否菜单) | `isParent: false`(固定,我们是用例非菜单) | ✓ |
| `type`(land/orbit) | `caseType`(config 配置) | ✓ 来自 NorthboundTestCaseConfig |
| `runSubSys`(运行子系统) | **❌ 代码缺失** | ⚠️ 文档示例 `runSubSys:"ADS"`,代码没填。应填 laser 的 subSysType |
| `depSubSys`(配合子系统) | `depSubSys`(config 可选) | ✓ |
| `depSubNe`(依赖设备) | `depSubNe`(config 可选) | ✓ |
| `satelliteCount` | `satelliteCount: 1`(硬编码) | ⚠️ 硬编码 1,文档说在轨用例必选 |
| `stationCount` | `stationCount: 1`(硬编码) | ⚠️ 硬编码 1 |
| `durate`(执行时长秒) | `durate: 600`(硬编码) | ⚠️ 硬编码 600,应从模板或 config 来 |
| `execSteps` | `execSteps`(`summarizeExecSteps`,从 steps 生成) | ✓ |
| `remark` | `remark`(= templateTags join,或 undefined) | ✓ |
| `inputPars`(入参) | `inputPars`(从 overridablePaths 生成) | ✓ D003 同源映射 |
| `relationCaseSubSysType` | ❌ 缺 | 可选字段,本轮不支持(D002) |
| `relationCaseId` | ❌ 缺 | 可选字段,本轮不支持 |
| `satDiffManufacture` | ❌ 缺 | 可选字段 |
| `priority` | ❌ 缺 | 可选字段 |
| `checkPoints` | ❌ 缺 | D002 决定暂不支持(null) |
| `preHandle`/`afterHandle`/`fileHandle` | ❌ 缺 | 可选,本轮不支持 |

**差异清单(需修)**:
1. **`runSubSys` 缺失**:文档示例明确有(`runSubSys:"ADS"`),代码 `CustomerTestCase` 没此字段。这是**必填字段级别的遗漏**(文档菜单节点也填了 runSubSys)。建议:NorthboundTestCaseConfig 已有 subSysId/subSysName,补 `runSubSys`(= 我们 subSysType 'laser')。
2. **`durate`/`satelliteCount`/`stationCount` 硬编码**:应可配置(从 NorthboundTestCaseConfig 或模板元数据来),现在写死 600/1/1。联调时若甲方校验这些必填且对值敏感,需补。

**差异清单(可选,本轮不支持)**:relationCaseSubSysType / relationCaseId / satDiffManufacture / priority / checkPoints / preHandle / afterHandle / fileHandle——D002 已决定 checkPoints 不支持,其余为可选,文档标注"可选",甲方不校验也应能过。

**结论**:encode 输出**结构与文档基本对齐**,但有 1 个必填级遗漏(`runSubSys`)+ 3 个硬编码(`durate`/`satelliteCount`/`stationCount`)。联调时(getTestCaseAll 跑通后)若甲方报字段缺失/校验错,优先查这 4 个。不新建 D###(字段填充策略属 D002 范畴,实测后补)。

## 决策引用

- **D005(新建)**:auth 出站请求加显式前置校验(password/username 非空 + access_token 缺失报错),杜绝 undefined 被 JSON.stringify 静默吞掉。S011 犯过、S013 又犯,必须加防御层。详见 decisions.md。
- D001~D004:不变,本轮不碰映射/数据源/翻译层方向。

## 范围确认

- 本轮是否在 scope boundary 内:**是**。登录修复是 northbound 联调的延续(S011 同 bug),离线接口研究是 topic-index "未决项/下一步" 列出的工作。
- 未碰:catalog-mapping(S012/H009/D004 不变量)、持久化丢数据(独立任务)、入站连通性(日志 B,单独排查)、_archive-legacy。

## 后续

### 本对话待用户实测(登录修复验收)
1. 在对接配置弹窗填 password(第三方应用 app_secret)→ 点"保存并连接"
2. 看日志 `POST /auth/partner/login` 参数**有没有 password 字段**
3. 能否拿到 access_token(返回 200 + access_token)
4. 刷新页面后,确认 password 不丢(新 persistConfig 已存)

### 留给后续
- **入站可达性(日志 B)**:用户确认甲方 `t_sub_system.base_url` 是否回退成 `127.0.0.1:5001`。若是,改回真实地址 + 确认 80 端口防火墙规则(S011 经验)还在。
  - **2026-06-23 续:已解决**。真实拓扑:甲方后端在桥接虚拟机(`10.15.5.93`),非同机。`127.0.0.1` 在虚拟机内=虚拟机自己。改 `t_sub_system.base_url`=`http://10.15.4.54:5001`(笔记本有线 IP,与虚拟机同网段 10.15.4.0/23)+ 加 Windows 防火墙 5001 入站规则后,入站通(甲方 Feign 成功打到 getTestCaseAll/getSubSysState 并收到响应)。
- **controlTestTask 联调实测**:甲方前端能发哪些 action + stop/abort 语义是否需区分。
- **getTestCaseAll 字段补全**:`runSubSys` 必填级补 + 3 个硬编码可配置化(联调有字段校验反馈后再做)。
- **真实 laser caseTemplate 样本**(D003/R001 提到):NAT/登录通后抓 checklist。

### 🆕 本轮联调顺带发现(不在 S013 范围,已开 H010 交接 S014)

**getTestCaseAll 响应 datas 永远空——testCaseConfig 漏接线(S012 遗留 blocker bug)**

入站通了之后,用户报告"用例同步啥也没看见"。甲方日志(15:57)铁证:响应只有信封字段,**没有 datas**。定位根因:

- `feature-wiring.ts:183-189` 的 `createNorthboundService({...})` **没传 testCaseConfig**
- `northbound-service.ts:533` `if (!options.testCaseConfig) return null` → 所有映射都判 null → testCases 永远空 → 响应不带 datas
- 单测全过是因为 `northbound-service.spec.ts:857-861` 手动传了 testCaseConfig,**runtime wiring 漏传没被测试覆盖**(类型 `testCaseConfig?` 可选,handler 当必填前置条件——契约不一致)

**不是 FTP 问题**:甲方请求没带 ftpInfo,L545 FTP 分支没进;数据本该走响应体 datas(L560 fallback)。也不是映射表/模板问题(用户确认映射表有 enabled 项)。

详见 **H010-getTestCaseAll-empty-datas-handoff.md**。用户决定单独开 S014 修(严守 S013 边界)。修复方向见 H010(方案 C 硬编码先跑通 / 方案 A 从 docking config 派生正经接线)。
