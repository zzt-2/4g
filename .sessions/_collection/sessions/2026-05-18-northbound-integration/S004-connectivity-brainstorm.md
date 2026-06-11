# [S004] 甲方接口连通性 Brainstorm

> 2026-06-10 | Brainstorm | 待审阅

## 目标

跑通甲方双向 HTTP 连通性（我们能收甲方请求、能给甲方上报），内部 task/send/receive 等功能可 mock。不考虑功能完整性，只求接口能通。

## 记录

### 已有代码事实

**整体架构（14 个 feature，L0-L5 分层装配）：**

```
platform/ (4 facade: transport, file, http, storage)
  ↓
runtime/ (feature-wiring L0→L5 + bridges + routing-tick + persistence)
  ↓
features/ (14 个业务特性)
  ↓
pages/ (10 个页面) + widgets/
```

**northbound feature 现状（L5 层）：**
- 入站 4 个 handler：`/setTestTask`、`/controlTestTask`、`/heartbeat`、`/getSubSysState`
- 出站 2 个 translator：testCaseResultReport、msgReport
- HTTP server/client 透传：renderer → IPC → main Node http
- feature-wiring 已注册，stepResult 回调已接线
- 43 测试通过，build + lint 通过

**HTTP 平台层现状：**
- main 进程 `http-handlers.ts`：入站有 30s 超时，出站无超时
- 只支持 `http`，不支持 `https`（类型声明了 TLS 但未实现）
- 无认证、无中间件、无拦截器
- HttpClientConfig 已有 `headers` 字段，main 进程原样透传

**甲方接入信息（控制接口规范 V1.0）：**
- 出站 base URL：`http://ip/partner-api/admin/`
- 认证：JWT Bearer（`auth/partner/login` → token，7 天有效）
- 请求头：`Authorization: Bearer {token}` + `Clientid: {clientId}`
- 固定凭据：username=`subsys`，clientId=`6af72c14148848b9b1c08220a6d8ee54`
- 9 个出站接口（全部是我们主动上报方向）

### 架构决策

| 编号 | 决策 | 理由 |
|------|------|------|
| D1 | 出站走 HttpFacade（不改用 fetch/axios 直连） | 整体架构统一，main 进程可统一处理超时/日志/认证，不改 main 代码 |
| D2 | Token 管理放 northbound feature 内部 | 甲方认证是 northbound 特有，不属于平台层 |
| D3 | 认证头在 northbound service 层拼，通过 HttpClientConfig.headers 透传 | headers 传递链路完整（renderer → preload → main），不需要改 platform |
| D4 | 内部功能 mock，只跑连通 | 连通优先于功能完整性 |

### 入站（甲方 → 我们）

- 最简假设：甲方直接 POST 到我们 HTTP server
- 当前 4 个 handler 已有路由，路径格式可能需联调时调整
- **未确认**：甲方实际 POST 过来时的 URL 路径格式（`/setTestTask` vs `/api/task/setTestTask`）

### 出站（我们 → 甲方）

9 个接口全部要做：

| 出站接口 | method | 对应内部能力 | 当前状态 |
|---------|--------|------------|---------|
| heartbeat | heartbeat | 定时保活 | 无，需新建定时器 |
| testCaseResultReport | testCaseResultReport | task 终态 verdict | 已有 translator |
| msgReport | msgReport | task step 结果 | 已有 translator |
| deviceInfoReport | deviceInfoReport | 设备/连接状态 | 无 |
| deviceAlarmReport | deviceAlarmReport | 设备告警 | 无 |
| subSysAlarmReport | subSysAlarmReport | 子系统告警 | 无 |
| testDataFileTranslationComplete | testDataFileTranslationComplete | 文件传输完成 | 无 |
| fileTranslationComplete | fileTranslationComplete | 文件传输完成 | 无 |
| sigReport | sigReport | 实时码流 | 无 |

### 需要新增的模块

| 模块 | 位置 | 职责 |
|------|------|------|
| token 管理 | `northbound/services/auth.ts` | 登录拿 JWT、缓存、到期重登录 |
| 心跳定时器 | `northbound/services/heartbeat-timer.ts` | 定时 POST heartbeat 到甲方 |
| 出站接口扩展 | `northbound/core/outbound-translator.ts` | 补齐剩余 7 个接口的 JSON 构造 |
| 类型补全 | `northbound/core/types.ts` | 补齐甲方公共信封字段 |

### 不改的模块

- `main/http-handlers.ts`（假设甲方用 HTTP，headers 透传已够用）
- `shared/platform-bridge.ts`
- `platform/http.ts`
- task/send/receive/result feature 核心逻辑

### 自检发现的差异

| 编号 | 问题 | 严重性 | 处理 |
|------|------|--------|------|
| X1 | main 只支持 http 不支持 https | 需确认 | 控制规范写 `http://`，先按 HTTP 做，联调时确认 |
| X2 | 入站路由路径可能与甲方不匹配 | 需确认 | 先按当前路径做，联调时调整 |
| X3 | types.ts 缺甲方公共字段（method/requestId/subSysType/subSysId/sessionId） | **必须修** | 不管甲方怎么变，信封字段跑不掉，必须补齐 |
| X4 | 出站无超时 | 低优 | 连通阶段可容忍，后续补 |

### 甲方公共信封字段（X3 详情）

甲方协议规定**每个请求和响应**都必须包含：

**请求通用字段：**
- `method`：接口方法名（如 `setTestTask`）
- `requestId`：0~2147483648，请求方生成，响应必须回填
- `subSysType`：二级子系统类型
- `subSysId`：二级子系统 ID（<=15 字符）
- `sessionId`：流程上下文 ID

**响应通用字段：**
- `method`：`{方法名}Response`
- `requestId`：回填
- `subSysType`、`subSysId`、`sessionId`：回填
- `statusCode`：1=正常，2=异常
- `msg`：信息，<=150 字符

当前 `types.ts` 的 `CustomerResponse`（`{ code, msg, data? }`）与甲方格式完全不同。

### 待向甲方确认（不阻塞开发）

1. 甲方下发接口（setTestTask 等）的实际 POST 路径格式
2. 出站协议是 HTTP 还是 HTTPS
3. 心跳双向互发 — 甲方发来的心跳也走网关吗？
4. token 过期时的错误处理
5. 乙方下发是否也需要认证（我们要校验甲方请求）

## 后续

- 用户审阅确认后进入 design 阶段
- 优先处理 X3（types.ts 公共字段补齐）—— 这是所有接口的基础
- X1、X2 等联调时确认
