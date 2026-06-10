---
doc_type: feature-design
feature: rewrite-northbound-connectivity
status: approved
summary: 基于甲方 V1.0.4 接口文档和控制接口规范 V1.0，补齐信封字段、JWT 认证、心跳定时器和 9 个出站接口，跑通双向 HTTP 连通性
tags: [northbound, customer-integration, jwt, heartbeat, envelope, connectivity]
---

## 0. 术语约定

| 术语 | 定义 |
|------|------|
| 信封字段 | 甲方协议规定的公共字段：method, requestId, subSysType, subSysId, sessionId |
| 出站接口 | 我们主动 POST 给甲方的接口（9 个） |
| 入站接口 | 甲方 POST 给我们的接口（4 个已有） |
| auth service | JWT token 获取、缓存和刷新模块 |
| heartbeat timer | 定时向甲方发送心跳的定时器 |

## 1. 决策与约束

### 需求摘要

**做什么**：基于甲方新文档（接口设计 V1.0.4 + 控制接口规范 V1.0），补齐信封字段、JWT 认证、心跳定时器和 9 个出站接口翻译，跑通双向 HTTP 连通。内部 task/send/receive 可 mock。

**为谁**：甲方集成测试系统。

**成功标准**：
1. 启动应用 → JWT 登录成功 → token 缓存
2. 心跳定时 POST → 甲方收到正确格式心跳
3. 甲方 POST setTestTask → 我方收到请求 → 返回信封格式响应
4. task 完成 → 自动 POST testCaseResultReport → 甲方收到正确格式结果
5. step 完成 → 自动 POST msgReport → 甲方收到正确格式步骤信息
6. 可手动调用其余 6 个出站接口上报（mock 数据）

**明确不做**：
- 内部 task/send/receive/result 真实功能对接（mock 即可）
- HTTPS 支持（甲方控制规范写 HTTP，联调确认后决定）
- 入站路径前缀匹配（先按当前路径，联调时调）
- FTP 文件上传
- 报告对象生成（report feature 范围）
- UI 页面

### 复杂度档位

Lane B，但涉及甲方文档 → 不走 fast path，必须走完整 checklist。

### 质量约束（来自 rewrite-quality-rules）

- **R10**: northbound 只能读内部事实（task/result/report），不能反向写入
- **R11**: result/report/delivery 三分，交付失败不改写内部结果
- **R14**: 依赖注入显式，跨 feature 只走公开 API
- **R3**: core/ 纯 TS，不依赖 Vue/Pinia/Electron
- **测试**: core 单测必须通过；HTTP/FTP 交付需 customer validation，Vitest 不替代

### 关键决策

**D1: 出站走 HttpFacade，不改 main 进程**
- HttpClientConfig.headers 已有，main 透传，认证头在 service 层拼
- 好处：main 进程统一处理所有 HTTP，架构一致
- 来源：S004 brainstorm

**D2: Token 管理放 northbound/services/auth.ts**
- 甲方 JWT 认证是 northbound 特有，不属于平台层
- auth 自己管理 token 状态（缓存+过期），不污染 northbound-state
- 来源：S04 brainstorm

**D3: 认证头通过 HttpClientConfig.headers 透传**
- 链路：northbound service 拼 headers → HttpFacade → preload IPC → main → 甲方
- 不需要改 platform-bridge 类型、platform/http.ts、main/http-handlers.ts
- 来源：S04 brainstorm + 自检验证

**D4: 信封字段统一由 createEnvelope 生成**
- 所有出站翻译函数共用 createEnvelope(method, config)
- config 含 subSysType, subSysId, sessionId（由 NorthboundConfig 注入）
- requestId 每次调用生成随机数

**D5: 入站响应改为信封格式**
- 从 { code, msg, data } 改为 { method, requestId, subSysType, subSysId, sessionId, statusCode, msg }
- 入站解析时提取信封字段，回填到响应

**D6: 心跳用 shared/timer/TimerRegistry**
- groupId: 'northbound-heartbeat'，默认 15 秒
- start/stop 与 northbound service 生命周期绑定

**D7: 新出站接口先暴露方法，数据可 mock**
- NorthboundService 新增 6 个 report 方法（device/alarm/file/signal）
- 连通阶段调用方可传 mock 数据
- 后续对接真实 feature 时替换 mock 数据源

## 2. 直接合同与边界护栏

### 直接合同

- 本文档（northbound-connectivity-design.md）
- `codestable/features/rewrite-northbound/northbound-connectivity-checklist.yaml`
- 甲方接口设计 V1.0.4（`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计0526-V1.0.4.md`）
- 甲方控制接口规范 V1.0（`refactor/docs/甲方文档/集成系统控制接口规范V1.0.md`）

### 边界护栏

- `codestable/features/rewrite-northbound/northbound-design.md`（原始 northbound design）
- `.sessions/2026-05-18-northbound-integration/S004-connectivity-brainstorm.md`
- `.sessions/2026-05-18-northbound-integration/topic-index.md`
- `codestable/quality/rewrite-quality-rules.md`（R10/R11/R14）
- `codestable/quality/rewrite-review-checklist.md`

## 3. 改动范围

所有改动在 `rewrite/src/features/northbound/` 内部。不改 main 进程、platform 层、其他 feature。

| 文件 | 动作 | 说明 |
|------|------|------|
| `core/types.ts` | **重写** | 补信封类型 + 9 个出站类型 + 响应类型改造 |
| `core/outbound-translator.ts` | **扩展** | 已有 2 个函数改签名 + 新增 7 个翻译函数 |
| `core/inbound-translator.ts` | **小改** | 无（入站解析在 service 层做） |
| `services/auth.ts` | **新建** | JWT token 管理 |
| `services/heartbeat-timer.ts` | **新建** | 心跳定时器 |
| `services/northbound-service.ts` | **重写** | 集成 auth + heartbeat + 信封响应 + 新出站方法 |
| `state/northbound-state.ts` | **不改** | auth 状态由 auth service 自己管理 |
| `index.ts` | **更新** | 导出新类型和新模块 |

## 4. 详细设计

### 4.1 Types（core/types.ts）

#### 4.1.1 信封类型

```ts
/** 出站请求公共字段 */
interface OutboundEnvelope {
  readonly method: string;
  readonly requestId: number;
  readonly subSysType: string;
  readonly subSysId: string;
  readonly sessionId: number;
}

/** 入站请求公共字段 */
interface InboundEnvelope {
  readonly method: string;
  readonly requestId: number;
  readonly subSysType: string;
  readonly subSysId: string;
  readonly sessionId?: number;
}

/** 甲方标准响应 */
interface CustomerResponse {
  readonly method: string;       // {请求method}Response
  readonly requestId: number;    // 回填
  readonly subSysType: string;
  readonly subSysId: string;
  readonly sessionId: number;
  readonly statusCode: 1 | 2;    // 1=正常, 2=异常
  readonly msg: string;
}

/** 信封生成配置 */
interface EnvelopeConfig {
  readonly subSysType: string;
  readonly subSysId: string;
  readonly sessionId?: number;
}
```

#### 4.1.2 入站类型（保持不变）

SetTestTaskRequest、ExecutionPlanLayer、TestCaseInfo、TestCaseStep、WaitConditionDef、ControlTestTaskRequest 保持不变。HeartbeatRequest、GetSubSysStateRequest 保持空接口。

#### 4.1.3 出站类型（9 个）

以下类型均 extends OutboundEnvelope。字段严格按甲方文档 V1.0.4 定义。

```ts
// 1. heartbeat
interface HeartbeatOutbound extends OutboundEnvelope {
  readonly method: 'heartbeat';
  readonly timer: number;
  readonly time: string;         // YYYY-MM-DDThh:mm:ss
}

// 2. testCaseResultReport
interface TestCaseResultReportOutbound extends OutboundEnvelope {
  readonly method: 'testCaseResultReport';
  readonly taskId: string;
  readonly testCaseId: string;
  readonly loopIndex: number;
  readonly result: 'success' | 'fail' | 'tbd';
  readonly msg: string;
}

// 3. msgReport — stepInfo 改为甲方 V1.0.4 格式
interface MsgReportOutbound extends OutboundEnvelope {
  readonly method: 'msgReport';
  readonly taskId: string;
  readonly testCaseId: string;
  readonly stepInfo: readonly StepInfoItem[];
}

interface StepInfoItem {
  readonly id: string;
  readonly name: string;
  readonly result?: 'success' | 'fail';
  readonly msg?: string;
  readonly msgTime: string;      // yyyy-MM-dd HH:mm:ss
}

// 4. deviceInfoReport
interface DeviceInfoReportOutbound extends OutboundEnvelope {
  readonly method: 'deviceInfoReport';
  readonly datas: readonly DeviceInfoItem[];
}

interface DeviceInfoItem {
  readonly name: string;
  readonly deviceId: string;
  readonly type: string;
  readonly ip?: string;
  readonly port?: number;
  readonly phoneNumber?: string;
  readonly imsi?: string;
  readonly departments?: string;
  readonly position?: string;
  readonly manufacturer?: string;
  readonly swVer: string;
  readonly status: 'online' | 'offline' | 'alarm' | 'error' | 'busying' | 'available';
  readonly remark?: string;
  readonly pars?: readonly DeviceParam[];
}

interface DeviceParam {
  readonly parId: string;
  readonly parName: string;
  readonly value: string;
  readonly unit: string;
}

// 5. deviceAlarmReport
interface DeviceAlarmReportOutbound extends OutboundEnvelope {
  readonly method: 'deviceAlarmReport';
  readonly datas: readonly DeviceAlarmItem[];
}

interface DeviceAlarmItem {
  readonly alarmId: string;
  readonly deviceId: string;
  readonly severity: 'critical' | 'major' | 'warn' | 'clear';
  readonly warnTime: string;
  readonly msg: string;
}

// 6. subSysAlarmReport
interface SubSysAlarmReportOutbound extends OutboundEnvelope {
  readonly method: 'subSysAlarmReport';
  readonly datas: readonly SubSysAlarmItem[];
}

interface SubSysAlarmItem {
  readonly alarmId: string;
  readonly severity: 'critical' | 'major' | 'warn' | 'clear';
  readonly warnTime: string;
  readonly msg: string;
}

// 7. testDataFileTranslationComplete
interface TestDataFileCompleteOutbound extends OutboundEnvelope {
  readonly method: 'testDataFileTranslationComplete';
  readonly taskId: string;
  readonly result?: 'success' | 'fail';
  readonly msg?: string;
  readonly testCaseId: readonly string[];
  readonly imsi?: string;
  readonly ueFlag?: '1' | '2';
  readonly ftpServerIP: string;
  readonly fileType: string;
  readonly filePath: string;
  readonly fileFormat?: 'pic' | 'voice' | '';
  readonly fileTitle?: string;
}

// 8. fileTranslationComplete
interface FileTranslationCompleteOutbound extends OutboundEnvelope {
  readonly method: 'fileTranslationComplete';
  readonly tranType: 'upload' | 'download';
  readonly result: 'success' | 'fail';
  readonly fileType: string;
  readonly fileIndex: number;
  readonly filePath: string;
  readonly ftpServerIp: string;
}

// 9. sigReport
interface SigReportOutbound extends OutboundEnvelope {
  readonly method: 'sigReport';
  readonly taskId: string;
  readonly testCaseId: string;
  readonly data: readonly SigReportDevice[];
}

interface SigReportDevice {
  readonly deviceCode: string;
  readonly sigLog: readonly SigLogEntry[];
}

interface SigLogEntry {
  readonly collectTime: string;
  readonly stIMSI: string;
  readonly direction: 'U' | 'D';
  readonly source: string;
  readonly destination: string;
  readonly protocol: 'NRRRC' | 'NRNAS' | 'SIP';
  readonly sig: string;
}
```

#### 4.1.4 删除旧类型

- 删除旧 `TestCaseResultReport`（改为 `TestCaseResultReportOutbound`）
- 删除旧 `MsgReport`（改为 `MsgReportOutbound`）
- 删除旧 `StepInfo`（改为 `StepInfoItem`）
- 删除旧 `CustomerResponse`（改为信封格式）

### 4.2 Auth 模块（services/auth.ts 新建）

```ts
interface AuthConfig {
  readonly loginUrl: string;      // 完整登录 URL
  readonly clientId: string;      // 6af72c14148848b9b1c08220a6d8ee54
  readonly username: string;      // subsys
  readonly password: string;      // f6c230cb7cf848439a4d52817dff6d
  readonly grantType: string;     // 'partner'
  readonly tenantId: string;      // '000000'
}

interface AuthService {
  getToken(): string | undefined;
  isAuthenticated(): boolean;
  login(): Promise<string>;
  ensureToken(): Promise<string>;
  logout(): void;
}

function createAuthService(httpFacade: HttpFacade, config: AuthConfig): AuthService
```

实现要点：
- login 通过 `httpFacade.sendRequest` POST `{ username, password, clientId, grantType, tenantId }` 到 `config.loginUrl`
- 解析响应 `data.access_token` 和 `data.expire_in`（604800 秒）
- 缓存 token + expiresAt，提前 1 小时视为过期
- ensureToken：未过期返回缓存 token，过期或无 token 则重新 login
- logout：清缓存
- 纯逻辑，无 timer，由调用方决定何时刷新

### 4.3 心跳定时器（services/heartbeat-timer.ts 新建）

```ts
interface HeartbeatTimer {
  start(subSysId: string, intervalSeconds?: number, onSend?: (body: HeartbeatOutbound) => Promise<void>): void;
  stop(): void;
  isRunning(): boolean;
}

function createHeartbeatTimer(): HeartbeatTimer
```

实现要点：
- 内部使用 `shared/timer/TimerRegistry`（groupId: 'northbound-heartbeat'）
- 每次触发：构造 HeartbeatOutbound（subSysId + timer + 当前时间），调用 onSend 回调
- 默认间隔 15 秒
- start 调用 TimerRegistry.register，stop 调用 TimerRegistry.clear
- 纯定时器，不直接调 httpFacade，通过 onSend 回调解耦

### 4.4 Outbound Translator 扩展（core/outbound-translator.ts）

#### 信封生成辅助

```ts
function createEnvelope(method: string, config: EnvelopeConfig): OutboundEnvelope {
  return {
    method,
    requestId: Math.floor(Math.random() * 2147483648),
    subSysType: config.subSysType,
    subSysId: config.subSysId,
    sessionId: config.sessionId ?? Math.floor(Math.random() * 2147483648),
  };
}
```

#### 已有函数改签名

```ts
// 之前: translateTaskResult(instance, verdict, testCaseId) → TestCaseResultReport
// 之后: translateTaskResult(instance, verdict, testCaseId, taskId, envelopeConfig) → TestCaseResultReportOutbound

// 之前: translateStepResult(instance, stepResult, testCaseId) → MsgReport
// 之后: translateStepResult(instance, stepResult, testCaseId, taskId, envelopeConfig) → MsgReportOutbound
```

#### 新增 7 个翻译函数

```ts
translateHeartbeat(subSysId: string, timer: number): HeartbeatOutbound
translateDeviceInfoReport(items: DeviceInfoItem[], config: EnvelopeConfig): DeviceInfoReportOutbound
translateDeviceAlarmReport(items: DeviceAlarmItem[], config: EnvelopeConfig): DeviceAlarmReportOutbound
translateSubSysAlarmReport(items: SubSysAlarmItem[], config: EnvelopeConfig): SubSysAlarmReportOutbound
translateTestDataFileComplete(file: TestDataFileCompleteOutbound, config: EnvelopeConfig): TestDataFileCompleteOutbound
translateFileTranslationComplete(file: Omit<FileTranslationCompleteOutbound, keyof OutboundEnvelope>, config: EnvelopeConfig): FileTranslationCompleteOutbound
translateSigReport(data: SigReportDevice[], taskId: string, testCaseId: string, config: EnvelopeConfig): SigReportOutbound
```

### 4.5 Service 层重写（services/northbound-service.ts）

#### Config 扩展

```ts
interface NorthboundConfig {
  readonly serverHost: string;
  readonly serverPort: number;
  readonly customerBaseUrl: string;   // http://ip/partner-api/admin/
  readonly subSysType: string;        // 如 'ADS'
  readonly subSysId: string;          // 如 'ADS_001'
  readonly auth: AuthConfig;
}
```

#### Service 接口扩展

```ts
interface NorthboundService {
  start(config: NorthboundConfig): Promise<void>;
  stop(): Promise<void>;
  isActive(): boolean;
  getSessionStatus(): NorthboundSessionSnapshot;
  handleStepResult(instanceId: string, result: TaskStepResult): void;

  // 新增：出站上报方法
  reportDeviceInfo(items: DeviceInfoItem[]): Promise<void>;
  reportDeviceAlarm(items: DeviceAlarmItem[]): Promise<void>;
  reportSubSysAlarm(items: SubSysAlarmItem[]): Promise<void>;
  reportTestDataFileComplete(file: Omit<TestDataFileCompleteOutbound, keyof OutboundEnvelope>): Promise<void>;
  reportFileTranslationComplete(file: Omit<FileTranslationCompleteOutbound, keyof OutboundEnvelope>): Promise<void>;
  reportSigReport(data: SigReportDevice[], taskId: string, testCaseId: string): Promise<void>;
}
```

#### 内部结构

```
createNorthboundService(options):
  authService = createAuthService(httpFacade, config.auth)
  heartbeatTimer = createHeartbeatTimer()

  start(config):
    1. await authService.login()
    2. serverId = await httpFacade.startServer({ host, port })
    3. heartbeatTimer.start(config.subSysId, 15, (body) => postToCustomer('/subSystem/heartbeat', body))
    4. 注册 onRequest handler

  stop():
    1. heartbeatTimer.stop()
    2. httpFacade.stopServer(serverId)
    3. authService.logout()
    4. state.clear()

  postToCustomer(path, body):
    1. token = await authService.ensureToken()
    2. await httpFacade.sendRequest({
         url: config.customerBaseUrl + path,
         method: 'POST',
         headers: {
           Authorization: `Bearer ${token}`,
           Clientid: config.auth.clientId,
           'Content-Type': 'application/json',
         },
         body: JSON.stringify(body),
       })

  handleRequest(req):
    1. body = JSON.parse(req.body)
    2. envelope = extractEnvelope(body)  // 提取 method/requestId/subSysType/subSysId/sessionId
    3. 路由（URL 后缀匹配 or body.method）
    4. handler 返回 CustomerResponse（信封格式，回填 requestId 等）

  reportXxx(...):
    1. translateXxx(...) → OutboundType
    2. postToCustomer('/对应路径', outbound)
```

#### 入站路由改造

```ts
// 之前：精确匹配
case '/setTestTask':

// 之后：后缀匹配 + method 兜底
function resolveMethod(req: HttpRequest, body: { method?: string }): string | null {
  // 1. URL 后缀匹配
  const knownPaths = ['/setTestTask', '/controlTestTask', '/heartbeat', '/getSubSysState'];
  for (const p of knownPaths) {
    if (req.url.endsWith(p)) return p.slice(1); // 去掉 /
  }
  // 2. body.method 兜底
  if (body.method && typeof body.method === 'string') return body.method;
  return null;
}
```

#### 入站响应改造

```ts
function buildResponse(envelope: InboundEnvelope, statusCode: 1 | 2, msg: string): CustomerResponse {
  return {
    method: `${envelope.method}Response`,
    requestId: envelope.requestId,
    subSysType: envelope.subSysType,
    subSysId: envelope.subSysId,
    sessionId: envelope.sessionId ?? 0,
    statusCode,
    msg,
  };
}
```

### 4.6 Index 导出更新

新增导出：
- 所有新类型（信封类型 + 9 个出站类型 + 子类型）
- `createAuthService`、`AuthService`、`AuthConfig`
- `createHeartbeatTimer`、`HeartbeatTimer`
- `EnvelopeConfig`
- 新的 `CustomerResponse`

## 5. 测试计划

### 更新现有测试

| 测试文件 | 变更 |
|---------|------|
| `outbound-translator.spec.ts` | 适配新返回类型（带信封字段），更新 stepInfo 为 StepInfoItem 格式 |
| `northbound-service.spec.ts` | postToCustomer 验证 auth headers；响应格式验证信封结构；start 验证 auth.login；stop 验证 heartbeat.stop |
| `northbound-state.spec.ts` | 不变 |

### 新增测试

| 测试文件 | 覆盖 |
|---------|------|
| `auth.spec.ts` | login 成功/失败、token 缓存、ensureToken 过期重登录、logout 清缓存 |
| `heartbeat-timer.spec.ts` | start/stop、间隔配置、onSend 回调触发 |

### Fixture

- 甲方 9 个出站接口的 JSON 请求示例（从文档提取）作为 fixture
- 入站 4 个接口带信封字段的请求/响应对

### 不由测试覆盖的

- 真实 JWT 登录（需甲方环境）
- 心跳实际送达（需甲方环境）
- HTTPS 传输（当前不支持）

## 6. 验证

```bash
pnpm -C rewrite build
pnpm -C rewrite lint
pnpm -C rewrite test
```

手工验证（customer validation，不在自动化范围内）：
1. 配置甲方地址 → 启动应用 → 确认 token 登录成功
2. 观察心跳定时 POST
3. 模拟甲方 POST → 确认收到信封格式响应
4. 触发 task 完成 → 确认自动 POST testCaseResultReport
5. 手动调用 reportDeviceInfo 等 → 确认甲方收到正确格式

## 7. 实施顺序

1. **types.ts 重写** — 其他所有步骤的前置
2. **auth.ts 新建** — 出站请求的前置
3. **outbound-translator.ts 扩展** — 依赖 types
4. **heartbeat-timer.ts 新建** — 依赖 types + timer-registry
5. **northbound-service.ts 重写** — 依赖以上全部
6. **index.ts 更新** — 导出
7. **测试更新 + 新增**
8. **build + lint + test 验证**
