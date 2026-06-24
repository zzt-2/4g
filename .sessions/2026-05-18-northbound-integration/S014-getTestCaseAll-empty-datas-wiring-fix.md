# [S014] getTestCaseAll 响应 datas 永远空——testCaseConfig 漏接线修复

> 2026-06-23 | 修复(blocker) | active
> 2026-06-23 续接 | 协议理解纠正(发现 datas 该走 FTP 文件非响应体,详见 D006 + 本 note「协议理解纠正」段)
> 接 H010 handoff(S013 联调中发现)
> 边界护栏: codestable/quality/rewrite-frontend-conventions.md、CLAUDE.md §重写总原则
> 直接合同: H010 handoff、topic-index 不变量、D001/D002/D004/D006、03-用例管理.md、05-文件传输与结果上报.md

## 目标

修一个 blocker bug:用户点"用例同步",甲方后台收到的响应里**没有用例数据(datas 空)**,导致甲方前端"同步之后啥也没看见"。这是 S012 catalog-mapping 重构留下的运行时接线漏洞,单测全过却 runtime 失效。

## 现象(用户原话)

- "现在,到了之前的用例那块了?反正同步之后啥也没看见。不知道是ftp没弄还是啥"
- "映射表啥的都有。确认开了,我刚加的。"

## 铁证(甲方真实日志,2026-06-23 15:57:34)

```
FEIGN - 请求报文: getTestCaseAll, url=http://10.15.4.54:5001/api/testCase/getTestCaseAll,
  request={"method":"getTestCaseAll","requestId":50,"sessionId":50,"subSysId":"JG","subSysType":"laser"}
FEIGN - 响应报文: getTestCaseAll,
  response={"method":"getTestCaseAllResponse","msg":"ok","requestId":50,"sessionId":50,
            "statusCode":1,"subSysId":"JG","subSysType":"laser"}
```

**关键**:
- 响应**只有信封字段**(method/msg/requestId/sessionId/statusCode/subSysId/subSysType),**没有 `datas` 字段**。
- 请求 `request={...}` **没有 `ftpInfo` 字段** → 与 FTP 无关(见下方"FTP 疑问解答")。
- 我们 server 回了 `statusCode:1`(正常),说明 handler 跑通了、没抛错,只是用例数据为空。

## 根因(已验证,H010 三条事实声称全 PASS)

### 根因链

1. `runtime/feature-wiring.ts:183-189` 构造 `createNorthboundService({...})` 时**没有传 `testCaseConfig` 字段**(只有 5 个字段:taskService/resultService/httpFacade/ftpFacade/connectionSnapshot)。**[PASS 已验证]**
2. `northbound/services/northbound-service.ts:533`:
   ```ts
   if (!options.testCaseConfig) return null;
   ```
   运行时 `options.testCaseConfig` 是 `undefined` → **每一条映射都命中这行 return null**。**[PASS 已验证]**
3. L530 `enabledMappings.map(...).filter(non-null)` → testCases 永远是空数组。
4. L560 `buildResponse(envelope, 1, 'ok', testCases.length > 0 ? { datas: testCases } : undefined)` → `testCases.length > 0` 永远 false → 响应不带 datas。

### 为什么单测全过却没发现(S012 的盲区)

`northbound-service.spec.ts:857-861` 创建 service 时**手动传了 testCaseConfig**:
```ts
testCaseConfig: { subSysId:'LAS_001', subSysName:'激光', menuId:'m1', menuName:'功能', caseType:'orbit' },
```
单测绿,但 **runtime wiring(feature-wiring)漏传没被任何测试覆盖**。**[PASS 已验证]**

类型契约不一致:
- `NorthboundServiceOptions.testCaseConfig?`(types.ts / service.ts:82)类型**可选**
- 但 handler(northbound-service.ts:533)当**必填前置条件**用

这是经典的"类型说可选、实现当必填"契约裂缝,编译器抓不到,单测因为手动传值也抓不到,只在真实 runtime 暴露。

### 排除的可能(确认不是这些)

- ❌ **映射表空 / 没 enabled**:用户确认映射表有内容、enabled 开了(刚加的)。`configuredCatalogMappings` 也正确接进 service(use-central-docking 的 `syncMappings` → `setCatalogMappings`,S012 已验证)。**不是这个**。
- ❌ **模板找不到(L532 return null)**:即使模板都在,L533 在 L532 之后,testCaseConfig undefined 会先于模板查找把所有映射判 null。
- ❌ **FTP 没配**:见下方专门段落。

## ⚠️ 协议理解纠正(2026-06-23 续接,推翻上文"FTP 疑问解答")

> **本段推翻了本 note 早先版本里"datas 走响应体,FTP 是备用"的理解。那个理解是错的,详见 D006。**

### 我之前错在哪

我盯着代码静态结构(`northbound-service.ts:586` 把 datas 塞进响应体),脑补出"datas 是 HTTP 响应体字段,默认走响应体,FTP 是备用方案"。这个理解**从根上错了**,而且一错带出一串错。

### 文档铁证(03-用例管理.md)

文档第一句(L5)明确写:
> **"由于消息可能过大,所以采用 json 文件传输方式,文件后缀为 .json"**

也就是说 getTestCaseAll **本来就走 FTP 文件传输**,不是"备用"。

关键证据三连:
1. **L5**:"采用 json 文件传输方式" —— 默认就是文件传输
2. **L73-91 响应参数表**:**根本没有 `datas` 字段**!只有 method/requestId/subSysType/subSysId/sessionId/statusCode/msg。我之前以为"默认走 datas 响应体"是脑补,文档从没说过。
3. **L158-517**:"测试用例属性信息**文件格式**定义",L163 是 `{"datas":[...]}` —— **这个 `datas` 是 FTP 文件 `testcase_all.json` 里的内容,不是 HTTP 响应体字段!**

代码 L586 `buildResponse(envelope, 1, 'ok', { datas: testCases })` 把 datas 塞进响应体,是 **S006 mock 时代的错误实现**(当时没接 FTP,把文件内容硬塞进响应体测试用)。这个错误实现一路活到 S014,我盯着它看反而被它误导。

### 用户原话(2026-06-23 续接,纠正我)

- "你 tm 觉得我会跟你扯淡吗?这个流程是很明确的。因为他们用例都用的 tm 的 ftp,不然我在这折腾?" → 推翻我"FTP 是备用"的脑补
- "ftp配置我们自己设,我能看见用户密码和 ip 端口。然后,路径自己写,我们自己建路径,甲方通过 fileTranslationComplete 了解在哪" → FTP 地址/账号我们配,路径我们建,fileTranslationComplete 通知甲方
- "testDataFileTranslationComplete"(被问用哪个接口时,用户选了这个,但后续讨论指向通用版 fileTranslationComplete,见 D006 待澄清项)

### 正确的流程(用户描述 + 文档对齐,要实现的)

```
甲方: POST getTestCaseAll(请求体只有信封字段,不带 ftpInfo)
  ↓
我们 handleGetTestCaseAll:
  1. 取映射表 + 模板,encode 成 testCases 数组
  2. 序列化成文件内容: JSON.stringify({ datas: testCases })   ← 注意 {datas:[...]} 包裹
  3. FTP 上传到【我们自己配的 config.ftp】+【我们自己建的路径】:
     remotePath = `${config.ftp.basePath}/${yyyy-mm-dd}/testcase_all.json`
  4. 回应 getTestCaseAll: statusCode:1,响应体【无 datas】(只有信封字段)
  5. 主动调 fileTranslationComplete:
     tranType:'upload', result:'success', filePath:remotePath,
     fileType:??? (待联调), fileIndex:0 (文档说未携带填 0)
     → 告诉甲方"文件传完了,在这个路径",甲方自己去 FTP 取
```

### 代码现状 vs 正确流程(4 个 gap,待下一轮修)

| 步骤 | 应该 | 代码现状(northbound-service.ts) | gap |
|------|------|------|-----|
| 2. 序列化 | `{datas:[...]}` 包裹 | L579 `JSON.stringify(testCases)` 裸数组 | ❌ 缺包裹 |
| 3. FTP 上传 | 用 **config.ftp**(我们配的)+ basePath/日期/testcase_all.json | L571-580 用**请求里的 ftpInfo**(甲方给的),且文件名 testcase_all.json 但路径用 ftpInfo.dir | ❌ 地址源错 + 路径错 |
| 4. 回应 | statusCode:1,**无 datas** | L586 多塞了 `{datas:testCases}` | ❌ 多余字段 |
| 5. 通知 | 主动调 fileTranslationComplete | **完全没调**(reportFileTranslationComplete 方法存在但没接到 getTestCaseAll) | ❌ 流程断裂 |

### 顺带记录的早期错误认知(避免重蹈)

我这一大段讨论里犯的错误链,完整记录避免之后再掰扯:

1. **第一错**:以为 datas 是 HTTP 响应体字段,FTP 是备用方案。被代码 L586 的错误实现误导。
2. **第二错**:在第一错基础上,以为"甲方没带 ftpInfo 所以走不了 FTP,datas 空 bug 跟 FTP 无关"。实际是 datas 本就该走 FTP 文件,跟响应体无关。
3. **第三错**:把 fileTranslationComplete 当成"另一个独立场景(task 报告上报)",跟 getTestCaseAll 脱钩。实际它就是 getTestCaseAll 走 FTP 后的通知环节(同一条链)。
4. **第四错**:一度纠结"用 testDataFileTranslationComplete 还是 fileTranslationComplete"。这俩都是文件传完上报,但场景不同(见 D006 待澄清)。用户先说 testDataFileTranslationComplete,后讨论指向通用 fileTranslationComplete,需联调确认。

**根因总结**:被 S006 mock 时代的错误代码实现(L586 把 datas 塞响应体)带了节奏,没回到文档第一句"L5 采用 json 文件传输方式"重新校准。教训:**理解协议先读文档,不要先读代码**。代码可能错,文档(尤其甲方权威文档)是基准。

### FTP 配置 UI(下一轮做)

用户决定:DockingConfigForm 加 FTP 配置输入框(host/port/username/password/basePath),我们自己配甲方 vsftpd 的地址账号。`NorthboundConfig.ftp` 字段已存在(northbound-service.ts:54-60),但:
- **UI 没入口**(DockingConfigForm 现在只有登录那 6 个字段)
- **`saveConfigAndConnect` 没传 ftp**(use-central-docking.ts:229-243 构造 NorthboundConfig 时没带 ftp)

所以现在 task 跑完的 `uploadTestReportAndNotify`(L188-235)也走不通 —— L196 `if (!config?.ftp || !ftp) return` 永远早退。FTP 配置 UI 修好后,这条链(TestReport 上传 + testDataFileTranslationComplete)也能顺带通。

## 修复方案(testCaseConfig 漏传部分,已实施方案 A)

> ⚠️ 本段方案已实施(deriveTestCaseConfig + 删 options.testCaseConfig,northbound-service.spec 42/42 过)。
> **但这只解决了 datas 空 bug 的一部分根因**(testCases 数组产不出)。
> **更深层的协议理解错误(L586 把 datas 当响应体字段)见上方「协议理解纠正」+ D006,需下一轮重写 handleGetTestCaseAll**。
> 本段保留作为方案选型记录。

### 关键发现:H010 没提到的简化点

`start(config)` 时,northboundService 内部已存 `activeConfig: NorthboundConfig`(L669),而 `NorthboundConfig` **本身就带 `subSysId` 和 `subSysType`**(L51-52)——这俩值是用户在对接对话框填的(`subSysId:'JG'`, `subSysType:'laser'`)。

也就是说:**subSysId 的真源已经在 service 手里了,不需要重新从外面接线。**这让方案 A 比原设想更干净。

### `NorthboundTestCaseConfig` 字段来源分析

| 字段 | 来源 | 备注 |
|------|------|------|
| `subSysId` | ✅ `activeConfig.subSysId`(='JG',用户填的) | 真源,不硬编码 |
| `subSysName` | ❌ 不在 activeConfig | 激光子系统固定("激光载荷") |
| `menuId` / `menuName` | ❌ 不在 activeConfig | 激光子系统固定 |
| `caseType` | ❌ 不在 activeConfig | 固定值('orbit') |
| `depSubSys?` / `depSubNe?` | 可选 | 跳过 |

只有 subSysId 是真变量(用户填),其余都是激光子系统的固定身份信息。

### 方案对比

**方案 A(推荐):从 activeConfig 派生 + 激光默认常量**

在 `handleGetTestCaseAll` 内部从 `activeConfig.subSysId` 取真值,其余字段用激光子系统默认常量:
```ts
// 激光子系统的固定身份(非 subSysId 字段都固定)
const LASER_TEST_CASE_DEFAULTS = {
  subSysName: '激光载荷',
  menuId: 'laser-menu',
  menuName: '激光测试',
  caseType: 'orbit',
};
function deriveTestCaseConfig(cfg: NorthboundConfig): NorthboundTestCaseConfig {
  return { subSysId: cfg.subSysId, ...LASER_TEST_CASE_DEFAULTS };
}
```
- 优点:subSysId 用真源(用户填的 'JG'),不硬编码不脱节;激光字段固定是真固定(不是 hack);一次修好根因 + 契约不一致;`options.testCaseConfig` 参数可删,契约干净
- 改动:northbound-service.ts(删 L533 早退 + 加 derive + 删 options.testCaseConfig 字段)、types.ts(northbound-service options 无变化,删 import 可能)、feature-wiring.ts 不改
- 缺点:`menuId`/`caseType` 等若将来要变(如多菜单),需重构。但当前单一激光子系统,够用

**方案 C(临时):feature-wiring 硬编码**

H010 handoff 原推荐。feature-wiring.ts 构造时硬编码:
```ts
testCaseConfig: { subSysId: 'JG', subSysName: '激光载荷', menuId: 'laser-menu', ... },
```
- 优点:1 行改完立即可联调
- 缺点:subSysId 'JG' 写死,和用户在 docking config 填的可能脱节(现在都是 'JG' 没事,改了就错);契约不一致保留;联调完还得回头改成方案 A

**方案 B(最完整):加到对接对话框 UI**

DockingConfigForm 加 menuId/menuName/caseType/subSysName 字段,UI 加输入框。
- 缺点:UI 变重,这些字段用户多半不懂(menuId 是啥?);工程量最大;联调阶段不必要

### 建议

**方案 A**。理由:
1. 一次修好根因 + 契约不一致,不留尾巴(方案 C 还得回头)
2. subSysId 用真源,杜绝"改了 docking config 就脱节"的风险
3. 激光字段固定是真固定(单一激光子系统),不是 hack
4. 工程量比方案 B 小很多

## 接收方验证(已完成,H010 要求)

- [x] 已读取 topic-index 不变量(D001~D005,H009 三层职责)
- [x] 已验证 H010 三条事实声称:
  - 声称1: feature-wiring.ts:183-189 无 testCaseConfig → **PASS**(只有 5 个字段)
  - 声称2: northbound-service.ts:533 `if (!options.testCaseConfig) return null` 永远命中 → **PASS**(L533 在 map 内,options.testCaseConfig 运行时 undefined)
  - 声称3: spec:857-861 手动传 testCaseConfig 掩盖 runtime gap → **PASS**(对比 spec vs feature-wiring)
- [x] 已检查 _registry.yaml(本专题 active,无 depends_on)
- [x] 已确认范围未违反"明确不含"(不碰 catalog-mapping 方向 D004,不碰翻译 encode 逻辑 D003,不碰 FTP,只修 testCaseConfig 数据源接线)
- [x] 联调前置已满足:S013 登录修复合 + 入站可达性通(base_url=10.15.4.54:5001 + 防火墙)

## 范围确认

- 本轮 S014 实际完成了什么:**testCaseConfig 漏接线修复**(deriveTestCaseConfig + 删 options.testCaseConfig),northbound-service.spec 42/42 过,lint 0。这是 datas 空 bug 的**一部分根因**(序列化产不出 testCases)。
- 但本轮讨论后半段发现:**datas 空 bug 还有个更深层的协议理解错误**(L586 把 datas 当响应体字段,实际该走 FTP 文件)。**协议理解错误(D006)需要下一轮按正确流程重写 handleGetTestCaseAll + 加 FTP 配置 UI**。
- 本轮边界:S014 代码修复(testCaseConfig 部分)已完成并测试通过,但**不完整**(协议流程还没对齐)。下一轮(S015 或 S014 续接)做:重写 handleGetTestCaseAll 按 FTP 流程 + FTP 配置 UI。

## 待联调确认的字段细节(不阻塞下一轮代码框架)

| 字段 | 文档 | 代码现状 | 待澄清 |
|------|------|---------|--------|
| `fileType` | 文件类型标识表(01-概述与约定.md:160-228)无 TestCase 类型 | 无 | 先占位 `TestCase`,联调有反馈再改 |
| `fileIndex` | 文档说"中心下发时携带,未携带填 0"(05:502) | 无 | 先填 0 |
| `testDataFileTranslationComplete` vs `fileTranslationComplete` | 都是文件传完上报,字段不同(ftpServerIP 大写 vs ftpServerIp 小写 + tranType) | 两个方法都有(reportTestDataFileComplete / reportFileTranslationComplete) | 用户先说前者,讨论指向后者,联调确认 |

## 后续(超出本轮范围)

1. **下一轮核心**:重写 handleGetTestCaseAll 按 FTP 流程(序列化 {datas} + 上传 config.ftp/basePath/日期/testcase_all.json + 响应无 datas + 调 fileTranslationComplete)。详见 D006。
2. **FTP 配置 UI**:DockingConfigForm 加 host/port/username/password/basePath 5 个输入框 + saveConfigAndConnect 传 ftp + 持久化。修好后 TestReport 上传链(uploadTestReportAndNotify)也能通。
3. **controlTestTask action 矛盾**(S013 离线研究 1):文档参数表只列 abort vs 示例四种,待联调实测。
4. **getTestCaseAll 字段补全**(S013 离线研究 2):runSubSys 必填级遗漏 + durate/satelliteCount/stationCount 硬编码,联调有字段校验反馈再补。
5. **真实 laser caseTemplate 样本**:getTestCaseAll 通了之后,抓真实样本核对(D003/R001 提到 HAR 只有 ka 的)。
