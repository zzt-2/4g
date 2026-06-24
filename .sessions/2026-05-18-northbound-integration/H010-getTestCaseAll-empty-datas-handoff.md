# [H010] getTestCaseAll 响应 datas 永远空——testCaseConfig 漏接线修复

> 2026-06-23 | 修复 handoff | S013 联调中发现,S012 catalog-mapping 重构遗留 bug
> 严重度: **blocker**——S012 的核心功能(getTestCaseAll 真实化)完全失效,映射表配得再对也没用
> 直接合同: 本 handoff、S013 note、topic-index 不变量、04-任务管理.md、03-用例管理.md、D002/D004

## 目标(一句话)

修 `feature-wiring.ts` 里 `createNorthboundService` 漏传 `testCaseConfig`,导致 `handleGetTestCaseAll` 的 L533 `if (!options.testCaseConfig) return null` 永远成立 → 所有映射都被跳过 → testCases 永远空 → getTestCaseAll 响应永远不带 datas → 甲方用例同步"啥也没看见"。

## 现象(用户原话)

"反正同步之后啥也没看见。不知道是ftp没弄还是啥"

## 铁证(甲方真实日志,2026-06-23 15:57:34)

```
FEIGN - 请求报文: getTestCaseAll, url=http://10.15.4.54:5001/api/testCase/getTestCaseAll,
  request={"method":"getTestCaseAll","requestId":50,"sessionId":50,"subSysId":"JG","subSysType":"laser"}
FEIGN - 响应报文: getTestCaseAll,
  response={"method":"getTestCaseAllResponse","msg":"ok","requestId":50,"sessionId":50,"statusCode":1,"subSysId":"JG","subSysType":"laser"}
```

**关键**:响应**只有信封字段**(method/msg/requestId/sessionId/statusCode/subSysId/subSysType),**没有 `datas` 字段**。我们的 server 回了 `statusCode:1`(正常),但用例数据是空的。

## 根因(已定位,代码 bug,非配置问题)

### 根因链(铁证)

1. `rewrite/src/runtime/feature-wiring.ts:183-189` `createNorthboundService({...})` 的参数对象里**没有 `testCaseConfig` 字段**:
   ```ts
   const northboundService = createNorthboundService({
     taskService,
     resultService,
     httpFacade: httpFacade!,
     ftpFacade: ftpFacade ?? undefined,
     connectionSnapshot: () => connectionService.getSnapshot(),
     // ❌ 缺 testCaseConfig
   });
   ```
2. `rewrite/src/features/northbound/services/northbound-service.ts:533`:
   ```ts
   if (!options.testCaseConfig) return null;
   ```
   `options.testCaseConfig` 是 `undefined` → **每一条映射都命中这行 return null**。
3. L530 `enabledMappings.map(...).filter(non-null)` → testCases 永远是空数组。
4. L560 `buildResponse(envelope, 1, 'ok', testCases.length > 0 ? { datas: testCases } : undefined)` → `testCases.length > 0` 永远 false → 响应不带 datas。

### 为什么单测全过却没发现(S012 的盲区)

`northbound-service.spec.ts:857-861` 创建 service 时**手动传了 testCaseConfig**:
```ts
testCaseConfig: { subSysId:'LAS_001', subSysName:'激光', menuId:'m1', menuName:'功能', caseType:'orbit' },
```
单测绿,但 **runtime wiring(feature-wiring)漏传没被任何测试覆盖**。类型签名 `NorthboundServiceOptions.testCaseConfig?` 是可选(L82),handler 却当**必填前置条件**用(L533)——**类型契约与运行时契约不一致**。

### 排除的可能(确认不是这些)

- ❌ **映射表空 / 没 enabled**:用户确认映射表有内容、enabled 开了(刚加的)。`configuredCatalogMappings` 也正确接进 service(use-central-docking 的 `syncMappings` → `setCatalogMappings`,S012 已验证)。**不是这个**。
- ❌ **模板找不到(L532 return null)**:即使模板都在,L533 在 L532 之后,testCaseConfig undefined 会先于模板查找把所有映射判 null。修了 testCaseConfig 后才需要查这行。
- ❌ **FTP 没配**(用户疑问"ftp 没弄"):日志请求 `request={...}` **没有 ftpInfo 字段**,所以 L545 `if (ftpInfo?.ip && options.ftpFacade)` 分支根本没进。**FTP 不是当前问题原因**。甲方这次期望数据走响应体 datas(L560 fallback),不走 FTP。FTP 是另一个独立问题(见下方"FTP 单独说明")。

## 修复方向(待 S014 拍板具体方案)

### 核心:给 testCaseConfig 一个来源

`NorthboundTestCaseConfig`(types.ts:354-362)字段:
```ts
subSysId, subSysName, menuId, menuName, caseType, depSubSys?, depSubNe?
```

这些值该从哪来?三个候选方案(S014 讨论拍板):

**方案 A:从 docking config 派生(推荐)**
docking config 已有 `subSysId`/`subSysType`(use-central-docking 的 DockingConfigForm)。testCaseConfig 的 subSysId 直接复用 docking 的 subSysId,subSysName 从 subSysType 映射(laser→"激光载荷")。menuId/menuName/caseType 用默认值或加到 docking config UI。
- 优点:单一数据源,不引入新配置入口
- 难点:docking config 在 renderer(composable),northboundService 在 runtime(feature-wiring)。需要在 `start()` 时把 testCaseConfig 传进 service,或 service 内部从 activeConfig 派生

**方案 B:加到 DockingConfigForm(新增配置项)**
DockingConfigForm 加 menuId/menuName/caseType/subSysName 字段,UI 加输入框。testCaseConfig 从 docking config 构造。
- 优点:用户完全可控
- 缺点:UI 变重,这些字段用户多半不懂(menuId 是啥?)

**方案 C:硬编码 laser 默认值(最小改动,临时)**
feature-wiring 直接写死 laser 的默认 testCaseConfig:
```ts
testCaseConfig: {
  subSysId: 'JG', subSysName: '激光载荷',
  menuId: 'laser-menu', menuName: '激光测试', caseType: 'orbit',
},
```
- 优点:1 行修好,立即可联调
- 缺点:硬编码,subSysId 'JG' 和 docking config 的可能不一致;菜单信息写死不灵活
- 适用:先让它跑起来,联调验证用例格式对不对,后面再改成方案 A

**建议**:先用方案 C 跑通联调(验证用例格式 + 找出其他隐藏问题),确认 getTestCaseAll 整条链通了之后,再按方案 A 正经接线。避免一次性改太多找不到新问题归因。

### 接口变更(feature-wiring + service)

无论哪个方案,都要在 service 层面让 testCaseConfig 可变(不能写死在 feature-wiring 构造时,因为 docking config 可能变)。推荐:
- `NorthboundService` 加 `setTestCaseConfig(config: NorthboundTestCaseConfig): void` 方法(类似已有的 `setCatalogMappings`/`setDeviceList`)
- `use-central-docking` 在 `saveConfigAndConnect` 时,从 docking config 构造 testCaseConfig 调 `northboundService.setTestCaseConfig(...)`
- feature-wiring 不再需要传 testCaseConfig(可选参数留空即可)

## FTP 单独说明(回答用户疑问)

**当前 getTestCaseAll 不走 FTP,所以 FTP 不是本次问题原因。** 但 FTP 是一个独立待确认项:

- V1.0.4 协议(`03-用例管理.md`)说用例数据可能过大走 FTP 文件(`testcase_all.json`)
- 但甲方这次请求**没带 ftpInfo**,期望走响应体 datas
- L545 的 FTP 上传分支只在 `ftpInfo?.ip` 有值时触发——目前甲方没给 ftpInfo,这分支永远不进
- **结论**:本次修复不需要碰 FTP。但如果甲方后续发请求带 ftpInfo,需要确认我们的 ftpFacade 能连上甲方的 FTP 服务器(ftpInfo.ip/port/username/password 甲方会随请求给)。这是另一个潜在断点,本次不管。

## 接收方验证(续接对话时必须完成)

- [ ] 已读取 topic-index 的不变量段落(D001~D005,H009 三层职责)
- [ ] 已验证本文件中的至少 3 条关键事实声称:
  - 声称1: feature-wiring.ts:183-189 的 createNorthboundService 调用没有 testCaseConfig 字段 → 验证:打开文件确认 [PASS/FAIL]
  - 声称2: northbound-service.ts:533 `if (!options.testCaseConfig) return null` 会让所有映射判 null → 验证:读 L523-561 确认数据流 [PASS/FAIL]
  - 声称3: northbound-service.spec.ts:857-861 单测手动传了 testCaseConfig,所以单测绿但 runtime 漏 → 验证:对比 spec 和 feature-wiring [PASS/FAIL]
- [ ] 已检查 _registry.yaml 中本专题的 depends_on 和 conflicts_with(本专题 active,无 depends_on)
- [ ] 已确认当前范围未违反"明确不含"(不碰 catalog-mapping 方向 D004,只接线 testCaseConfig 数据源)
- [ ] **联调前置**:S013 登录修复已合(实测 token 604799s),入站可达性已通(base_url=10.15.4.54:5001 + 防火墙规则)。这些是 getTestCaseAll 联调的前提,已满足。

## 验证阈值(修复后联调 PASS 标准)

| 验证项 | PASS 标准 | 阈值来源 | 历史通过率 |
|--------|----------|---------|-----------|
| getTestCaseAll 响应有 datas | 响应 JSON 含 `datas` 数组且 length≥1(对应 enabled 映射数) | 03-用例管理.md 文件格式 + L560 逻辑 | 0%(从未通过) |
| datas 内每条是合法 caseTemplate | 字段对齐 03-用例管理.md(S013 离线研究已核:runSubSys 必填级遗漏待补) | 文档 + testcase-sync-translator encode | 0% |
| 甲方前端能看见用例 | 同步后甲方用例列表出现新条目 | 用户实测 | 0% |
| 单测覆盖 runtime wiring | 新增测试:不传 testCaseConfig 时 getTestCaseAll 响应无 datas;传了之后有 | 防回归 | 待加 |

## 已知债务

| 债务 | 原则 | 当前状态 | 触发解决条件 |
|------|------|---------|-------------|
| testCaseConfig 漏接线 | runtime 必须和单测一样传 testCaseConfig,否则 getTestCaseAll 失效 | feature-wiring 漏传,单测手动传掩盖了 | **S014 必须修**(blocker) |
| 类型契约不一致 | testCaseConfig 类型可选(?)但 handler 当必填前置条件 | NorthboundServiceOptions.testCaseConfig? 可选,northbound-service.ts:533 当必填 | S014 修复时统一(要么类型必填,要么 handler 容错) |
| runSubSys 必填级遗漏 | encode 输出应含文档必填字段 | CustomerTestCase 无 runSubSys 字段(S013 离线研究 2 发现) | getTestCaseAll 联调通后,若甲方报字段缺失则补 |
| getTestCaseAll 单测不覆盖 runtime wiring | 单测应覆盖 feature-wiring 真实构造路径 | 只覆盖 createNorthboundService 直接构造 | S014 补 integration 测试或 wiring 断言 |

## 联调环境状态(S014 接手即可用,无需重新搭)

- **出站**:login ✓(S013 修复,token 604799s),heartbeat ✓
- **入站**:✓ 通。甲方 `t_sub_system.base_url` = `http://10.15.4.54:5001`(已改对),Windows 防火墙 5001 入站规则已加
- **拓扑**:笔记本有线 `10.15.4.54` 与甲方虚拟机 `10.15.5.93` 同网段(10.15.4.0/23),二层直连
- **映射表**:用户已在用例目录 tab 添加 enabled 映射(确认有内容、enabled 开)
- **getTestCaseAll**:请求能到 handler、响应能回(statusCode:1),但 datas 空——**就差 testCaseConfig 这一步**

## 不要做(边界)

- 不碰 catalog-mapping 方向(D004 不变量:映射表归 command-ingress,数据源是映射表)
- 不碰翻译层 encode 逻辑(D003 同源映射不变)——testCaseConfig 只是 encode 的全局配置输入,不是翻译逻辑
- 不碰 FTP(本次不走 FTP,见上方说明)
- 不碰登录/心跳/入站可达性(S013 + 配置已解决)
- 不重做 S012 已完成的工作(映射表 CRUD、翻译器接口改造、UI 改造都对,只是 runtime 接线漏了)

## 后续(超出 S014 范围的发现,S013 离线研究已记)

1. **controlTestTask action 矛盾**(topic-index S013):文档参数表只列 abort vs 示例四种,代码按四种实现,待联调实测甲方发哪些
2. **getTestCaseAll 字段补全**(topic-index S013):runSubSys 必填级遗漏 + durate/satelliteCount/stationCount 硬编码,联调通后若甲方报字段缺失再补
3. **真实 laser caseTemplate 样本**:getTestCaseAll 通了之后,抓真实样本核对(D003/R001 提到 HAR 只有 ka 的)

## 来源

- S013 联调(2026-06-23 15:57 甲方日志)
- S012 catalog-mapping 重构(遗留接线 bug)
- D002(getTestCaseAll 数据源)+ D004(映射表归 command-ingress)
- 用户原话"反正同步之后啥也没看见。不知道是ftp没弄还是啥"
