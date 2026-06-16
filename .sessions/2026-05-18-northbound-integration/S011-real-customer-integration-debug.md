# [S011] 甲方真实联调：从静态就绪到双向连通

> 2026-06-13 | 实施 + 联调 | active
> 直接合同: S008-docking-ui-design.md 第四轮、codestable/features/rewrite-northbound/*、rewrite/docs/甲方文档/集成系统控制接口规范V1.0.md、refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/
> 边界护栏: codestable/quality/rewrite-frontend-conventions.md、CLAUDE.md §重写总原则

## 目标

把已就绪的 northbound feature（12 入站 handler + 9 出站 translator + auth + heartbeat + FTP）跟甲方真实后端跑通。从笔记本本地访问甲方、到甲方反向调到我们、到具体接口能正确往返，逐层把"静态分析通过"变成"甲方联调通过"。

## 记录

### 阶段 1 — 网络拓扑与可达性分析

**用户初始困惑**：甲方文档里 IP 都写 `127.0.0.1`，他不确定两台校园网内的电脑能不能直连、HTTP/Electron 在中间怎么走、IP 自动获取怎么处理。之前他只接触过 fetch+HTTPS，没用 Electron 起 HTTP server。

**笔记本三张网卡实测**（`ipconfig`）：

| 网卡 | IP | 网段 | 备注 |
|---|---|---|---|
| 以太网（有线） | 192.168.0.243 | 192.168.0.0/24 | 网关 192.168.0.1（甲方办公室小路由） |
| 以太网 2 | 192.168.56.1 | 192.168.56.0/24 | VirtualBox host-only，忽略 |
| WLAN（无线校园网） | 10.63.198.175 | 10.63.0.0/16 | 校园网无线 |

**关键澄清**：之前 S008 第四轮看到的甲方日志里 IP `192.168.0.243` 就是笔记本有线网卡 IP，**甲方打的就是我们**；而 `10.15.5.53` 是甲方后端虚拟机在校园网内的 IP。两个方向是两个独立可达性问题：

| 方向 | 物理路径 | 状态 |
|---|---|---|
| 出站（笔记本 → 甲方 10.15.5.53:80） | WLAN 出校园网 → 路由不到 10.15.5.0/24 | 不通 |
| 入站（甲方 → 笔记本 192.168.0.243:80） | 甲方 Feign 走 LAN → 但 Windows 防火墙 + server 未启动 | 不通 |

### 阶段 2 — 内网穿透方案讨论

讨论了 5 个方案，按用户最终选型倒序：

| 方案 | 描述 | 用户判断 |
|---|---|---|
| **frp 反向暴露** | 公网服务器跑 frps，笔记本跑 frpc，把笔记本 80 暴露到公网 | 需要公网服务器，复杂 |
| **ngrok / cloudflared tunnel** | 一行命令得到公网域名 | 没采用 |
| **ZeroTier / Tailscale** | 双方都装，组虚拟局域网 | 没采用 |
| **校园网 AP 隔离** | 校园网无线经常开 client isolation，导致无线/有线客户端之间无法直连 | 提醒用户这是头号怀疑对象 |
| **虚拟机 NAT 端口转发** | 甲方虚拟机宿主机加 NAT 规则，880 → 虚拟机内 80 | **最终采用**（单向：让我们能访问甲方） |

**用户实际部署**：甲方虚拟机宿主机 IP `10.105.65.195`，通过 NAT 把宿主机 880 端口转发到虚拟机 80。笔记本通过 WLAN 能访问 `http://10.105.65.195:880/`（甲方前端 RuoYi 管理后台）。出站方向物理可达性解决。

入站方向暂时没解决，留到阶段 6 处理。

### 阶段 3 — UI 配置接通出站

把 CommandIngressPage "中心对接" 配置弹窗的默认值改对齐真实环境：

- `customerBaseUrl`: `http://10.105.65.195:880/partner-api/admin/`
- `loginUrl`: `http://10.105.65.195:880/partner-api/auth/partner/login`
- `clientId`: `6af72c14148848b9b1c08220a6d8ee54`
- `subSysType`: `laser`
- `subSysId`: `JG`
- `serverPort`: 80（原默认 5001，甲方打 80 → 改 80）

**两个 bug 在这里暴露**：

#### Bug 1：heartbeat body 里 subSysType 硬编码空串

**症状**：日志 `POST /admin/subSystem/heartbeat {method: 'heartbeat', subSysType: '', subSysId: 'JG', ...}` —— subSysType 是空串，应该是 `laser`。

**根因**：

- `rewrite/src/features/northbound/services/heartbeat-timer.ts:36`：构造 HeartbeatOutbound body 时 `subSysType: ''` 硬编码
- `rewrite/src/features/northbound/core/outbound-translator.ts:90`：`translateHeartbeat()` 同样硬编码（虽然没人调用，但保持一致也要修）

**修复**：

1. `HeartbeatTimer.start()` 签名增加 `subSysType: string` 参数（放到 `subSysId` 前）
2. 构造 body 时 `subSysType: currentSubSysType`（之前 `''`）
3. `northbound-service.ts` 两处 `heartbeatTimer.start()` 调用（L639 初始化、L481 setPars 重启）传 `config.subSysType` / `activeConfig.subSysType`
4. `translateHeartbeat()` 签名同步加 `subSysType` 参数
5. 测试 `outbound-translator.spec.ts:216` 更新

#### Bug 2：auth expire_in 字段读不到，token 0s

**症状**：`[northbound auth] 登录成功，token 有效期 0s`。

**误判**：最初以为是字段名不对，做了兼容：

```ts
const expireIn = (data.expire_in ?? data.expires_in ?? data.expireIn ?? data.expiresIn ?? 0) as number;
```

**实际根因**（阶段 4 才发现）：登录实际**失败了**（参数校验异常），返回错误响应被 auth.ts 当成"成功"解析。`data.access_token` 是 undefined，cachedToken=undefined，expireIn=0，console.log 还打印"登录成功"。这是误导日志。

**附带建议（未修）**：auth.ts 应该校验响应有没有 `access_token`，没有就抛错而不是误报成功。留待后续清理。

### 阶段 4 — 登录失败的真根因：password 缺失

**甲方后端日志**（关键证据）：

```
[PLUS]开始请求 => URL[POST /auth/partner/login],参数:[{"username":"subsys","clientId":"6af72c14148848b9b1c08220a6d8ee54","grantType":"partner","tenantId":"000000"}]
参数校验异常
```

**注意**：请求体里**没有 password 字段**！

**根因**：

1. UI 配置弹窗里 `password` 字段空着（`docking-labels.ts:64` 默认值 `password: ''`）
2. `JSON.stringify({ password: '' })` 在 JS 里会保留字段，但 `JSON.stringify({ password: undefined })` 会**自动省略**字段。auth.ts 传 `password: config.password`，如果 UI 没保存该字段，会变 undefined 被省略。
3. 甲方校验 password 必填，缺失就 400。

**修复方向**：UI 上填 password。但 password 是什么？阶段 5 解释。

### 阶段 5 — RuoYi Plus 认证机制（最关键发现）

**用户提问**：甲方是 RuoYi Plus，密码在哪改？用户管理还是个人中心？

**调研过程**：

1. 最初猜测 RuoYi 标准 sys_user 表 → 用户管理重置密码 → 拿明文
2. 但 V1.0 文档示例 `password: "f6c230cb7cf848439a4d52817dff6d"` 是 32 位 MD5，跟 RuoYi 标准明文登录不符
3. 让用户先在 用户管理 搜 `subsys`，看在不在

**用户改试 admin/admin123**（RuoYi 默认管理员凭据），甲方后端日志 NPE：

```
java.lang.NullPointerException: Cannot invoke "...LoginPartner.getUserId()" because "loginPartner" is null
    at org.dromara.auth.service.impl.PartnerAuthStrategy.login(PartnerAuthStrategy.java:53)
```

**SQL 日志直接揭示真相**（两步 Dubbo 调用）：

```sql
-- 第一步：OAuth2 client 注册（sys_client 表）
SELECT id, client_id, client_key, client_secret, grant_type, ...
FROM sys_client WHERE client_id = '6af72c14148848b9b1c08220a6d8ee54'

-- 第二步：第三方应用凭据（t_third_application 表）
SELECT app_id, app_name, app_key, app_secret, gps, status, ...
FROM t_third_application
WHERE del_flag = '0' AND (app_key = 'admin' AND app_secret = 'admin123')
```

**重大发现**：partner 登录不是 sys_user！是 `t_third_application` 表！

| 协议字段 | 实际映射 |
|---|---|
| `username` | `t_third_application.app_key` |
| `password` | `t_third_application.app_secret` |
| `clientId` | `sys_client.client_id` |
| `grantType='partner'` | RuoYi Plus 自定义 grantType，对应 `PartnerAuthStrategy` |

`app_secret='admin123'` 是 RuoYi Plus mapper 在缺失 password 时的默认值（不重要），SQL 查不到记录 → loginPartner=null → NPE。

**用户找到 sys_client 记录**（误导一步）：

```json
{
    "id": 4,
    "clientId": "6af72c14148848b9b1c08220a6d8ee54",
    "clientKey": "partner",
    "clientSecret": "partner123",
    "grantTypeList": ["partner"],
    "deviceType": "partner",
    "activeTimeout": 604800,
    "timeout": 604800,
    "status": "0"
}
```

但这是 sys_client（OAuth2 client 注册），第一步查询本来就过了。真问题是 t_third_application 表里没有对应记录。

**最终解决**：用户在 RuoYi Plus 后台找到第三方应用管理菜单，在 t_third_application 表里创建了一条记录，拿到 `app_key` + `app_secret`，UI 配置 password 字段填上 app_secret，登录成功。

**这个发现的价值**：之前 V1.0 文档示例的 `username="subsys" password="f6c230cb7cf848439a4d52817dff6d"` 误导了很久。文档示例是占位，不是真实凭据格式。真实机制是 RuoYi Plus 的 partner OAuth2 + 第三方应用凭据，需要甲方在 t_third_application 表里实际建记录。

### 阶段 6 — 入站连通：Windows 防火墙

登录通后，**甲方 Feign 调用仍然 Connect timed out**：

```
feign.RetryableException: Connect timed out executing POST http://192.168.0.243/api/testCase/getTestCaseAll
```

**演进过程**：

1. 用户改 `t_sub_system.base_url` 从 `192.168.0.243` 改成 `10.105.65.174`（这是新 IP，可能是用户重新配置或加了某种隧道后的）
2. 用户确认 "ip 能 ping 通"
3. 但 Feign POST 仍然 Connect timed out

**关键诊断**：`ping 通 ≠ HTTP 通`。ICMP（ping）和 TCP 80 是两个独立东西。Windows 默认**允许 ICMP**（所以 ping 通），但**拦截入站 TCP**（所以 HTTP 不通）。

**解决**：管理员 PowerShell 加防火墙规则：

```powershell
New-NetFirewallRule -DisplayName "Northbound HTTP 80" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
Test-NetConnection -ComputerName 10.105.65.174 -Port 80
```

`TcpTestSucceeded : True` 后，入站通。甲方成功打到我们的 handler。

### 阶段 7 — 联调初步跑通

**入站请求实测**（甲方实际打到我们的 body）：

```json
// getTestCaseAll
{"method":"getTestCaseAll","requestId":34,"subSysType":"laser","subSysId":"JG","sessionId":34,"ftpInfo":null}

// getSubSysState
{"method":"getSubSysState","requestId":37,"subSysType":"laser","subSysId":"JG","sessionId":37}
```

**V1.0.4 信封格式验证通过**：subSysType='laser'、subSysId='JG'、POST 方法、/api/ 前缀、envelope 字段都对齐。S008 第四轮拍的几个决策（短码 JG、小写 laser、/api/ 入站前缀）**被甲方实际流量印证正确**。

**联调结果**：

| 接口 | 状态 |
|---|---|
| heartbeat（出站） | ✓ 通 |
| login（出站） | ✓ 通（找到真实 app_key/app_secret 后） |
| getTestCaseAll（入站，handler 返回 mock） | ✓ 收到，但用例同步失败 |
| getSubSysState（入站，handler 返回 mock） | ✓ 收到，设备同步能用 |
| setTestTask（入站） | 未触发（甲方前端没找到下发入口） |

### 阶段 8 — 用例同步卡点（开放问题）

**用户报告**：设备同步能用，用例同步不太行。用户也没在甲方前端找到"同步任务"入口，疑问"难不成他们是自己编排"。

**讨论结论**：

1. **甲方不下发任务模板**（确认 S001 决策）：他们的"任务"概念是临时编排 executionPlan，每次执行才创建。S001 拍板的"testCase = 我们的 task 模板"映射继续成立。
2. **甲方前端要找"任务编排 / 测试执行 / 执行计划"类菜单**，不是"任务管理"或"任务同步"。
3. **用户提的设计想法**："我们的任务当他们的用例" — 这个方向是对的。回顾 S009 拍板：

| 我们 | 甲方 |
|---|---|
| **task 模板**（TaskTemplate，长期保存） | **用例**（testCase，长期保存） |
| **task 实例**（每次执行创建） | **测试任务实例**（executionPlan 跑起来时才有） |

所以 `getTestCaseAll` **应该返回 task 模板列表**，序列化成 V1.0.4 spec 格式。当前实现返回 `DEFAULT_TEST_CATALOG` mock，没接真实模板。

**用户参考数据**：用户贴了"另一家"（ka 子系统）在甲方系统里的用例 menu 列表（42 条顶层菜单），字段格式：

```json
{
    "menuId": 1780069365941,
    "subSysId": 1780069394660,
    "subSysName": "ka子系统导测",
    "outMenuId": "d33b322c840845078d05787f9c18d804",
    "outParentId": "0",
    "parentId": null,
    "parentMenuName": null,
    "menuName": "功能验证"
}
```

**这是甲方内部数据库存储格式**（t_out_menu 表），**不是协议格式**。甲方收到 getTestCaseAll 响应后会翻译成这种格式存。协议格式由 V1.0.4 spec 决定。

## 后续

### 本对话待提交（一次性 commit）

按全局规则每对话只提交一次。本对话改动：

- `rewrite/src/features/northbound/services/heartbeat-timer.ts`：start() 增加 subSysType 参数
- `rewrite/src/features/northbound/services/northbound-service.ts`：两处 heartbeatTimer.start() 调用传 subSysType
- `rewrite/src/features/northbound/core/outbound-translator.ts`：translateHeartbeat 签名对齐
- `rewrite/src/features/northbound/services/auth.ts`：expire_in 字段兼容 4 种命名
- `rewrite/src/features/northbound/__tests__/outbound-translator.spec.ts`：translateHeartbeat 测试更新
- `.sessions/2026-05-18-northbound-integration/S011-real-customer-integration-debug.md`（本文档）
- `.sessions/2026-05-18-northbound-integration/topic-index.md`（追加 S011 条目）

验证证据：northbound 62/62 tests pass，lint 0 issue。

### 新对话工作（范围预告）

**主题**：getTestCaseAll 响应格式设计 + task 模板序列化

**直接合同**：
- `rewrite/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/03-用例管理.md`（V1.0.4 spec）
- `codestable/features/rewrite-task/task-positioning-design.md`（S009 产出）
- 本 S011 笔记

**参考输入**：
- 用户贴的 ka 子系统 menu 数据（42 条顶层菜单）— 注意这是甲方内部存储格式，**不是协议格式**，仅作为甲方用例规模和层级深度的参考
- 当前 mock 实现 `docking-labels.ts:81 DEFAULT_TEST_CATALOG`
- 当前 stub handler 在 `northbound-service.ts` getTestCaseAll handler

**待澄清的设计问题**：
1. V1.0.4 spec 里 getTestCaseAll 响应到底有哪些字段？是 isParent/children 树形结构吗？
2. task 模板怎么序列化成 testCase？一对一无脑翻译，还是有过滤（只暴露某种 type 的模板）？
3. 用例同步"不太行"的具体根因 — 新对话开始时让用户先贴甲方前端报错、后端日志、我们响应体三个证据，再决定改协议格式还是改 mock 数据
4. 是否需要把 mock 完全换成真实 task 模板？还是 mock + 真实混合（先 mock 顶层菜单，子项用真实模板）？

**不做**：
- 真实用例执行（setTestTask → task 实例 → msgReport → verdict 上报），是再下一个对话
- 报告生成（TestReport.json + FTP 上传），S007/H004 已规划，待后续

### 留给新对话的"联调调试经验"

未来联调遇到 Connect timed out 时，按这个顺序排查：

1. **确认 IP 真的是目标机器**：`ipconfig` 看所有网卡，对照甲方日志 URL 里的 IP
2. **确认 ping vs HTTP 分开**：ping 通不代表端口通。Windows 防火墙默认拦入站 TCP，允许 ICMP
3. **确认 HTTP server 真启动**：浏览器本机访问 `http://localhost:port/`，看到任何 HTTP 响应（404/504 都行）才算 server 起来
4. **PowerShell 测端口**：`Test-NetConnection -ComputerName X.X.X.X -Port 80`
5. **加防火墙规则**：`New-NetFirewallRule -DisplayName "..." -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow`
6. **校园网无线 AP 隔离**：如果两个客户端都在无线网，互相 ping 不通，可能是 AP isolation
7. **内网穿透方向**：单向穿透只解决一个方向。双向闭环需要对称做或组虚拟局域网

RuoYi Plus partner 登录认证流程（关键经验）：

```
[笔记本] POST /partner/login {username, password, clientId, grantType='partner', tenantId}
    ↓
[sys_client 表] 验证 clientId（OAuth2 client 注册）→ ✓ 过
    ↓
[t_third_application 表] 查 app_key=username AND app_secret=password
    ├─ 找到 → 颁发 access_token，返回 expire_in
    └─ 找不到 → loginPartner=null → NPE（用户原始报错）
```

注意：partner 登录**不走 sys_user 表**，密码不能在"用户管理"里改，要去**第三方应用管理 / 合作伙伴应用管理**菜单（操作 t_third_application 表）。

V1.0 文档示例的 `password: "f6c230cb7cf848439a4d52817dff6d"` 是占位，不是真实凭据。真实凭据必须甲方在 t_third_application 表里实际建记录。
