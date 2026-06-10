# [S003] 甲方文档 V1.0.4 差异 + 控制接口规范 V1.0 分析

> 2026-06-10 | 分析 | 完成

## 目标

对比甲方新版接口设计文档（0526 V1.0.4）与旧版（0513）的差异，并提炼全新的《集成系统控制接口规范V1.0》关键内容，评估对 northbound 重写的影响。

## 记录

### 文档来源

- **接口设计文档**：`集成测试系统与各二级子系统接口设计0526-V1.0.4(1).docx`（pandoc 转 md）
- **控制接口规范**：`集成系统控制接口规范V1.0.docx`（pandoc 转 md）
- **旧版拆分**：`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/` + 主题拆解 + 甲方沟通拆解

### 一、接口设计文档 V1.0.4 vs 0513 实质差异

#### 必须调整（高影响）

| 差异 | 说明 | 影响 |
|------|------|------|
| startTestCaseList 已删除 | V1.0.1 删除，immediate=true 直接执行 | 与已确认决策一致，无需改动 |
| setTestTask 新增 executionPlan | 必选字段，含 layers 数组（layer/parallel/nodes） | task 模型需支持层级编排，inbound-translator 需解析 |
| 设备信息查询批量 | deviceId→deviceIds，data→datas 数组 | 类型定义和请求结构需更新 |
| 设备信息结构扩展 | 新增 port/phoneNumber/imsi/departments/position/manufacturer/antennaManu/antennaType | 设备相关类型需更新 |
| ftpServerIP 新增 | testDataFileTranslationComplete + fileTranslationComplete 新增必选字段 | outbound-translator 需携带 |
| warnTime 新增 | 设备告警 + 子系统告警新增必选告警时间 | 告警结构需更新 |
| 数据转发接口重构 | data 对象 → msgList 数组，字段名变化 | 如已实现数据转发消费需适配 |

#### 需关注（中影响）

| 差异 | 说明 |
|------|------|
| msgReport 结构完全重做 | 单条 title/msg/result → stepInfo 数组（id/name/result/msg/msgTime） |
| 新增 sigReport | 设备实时码流上报，高频实时接口 |
| 用例管理类接口全部 TBD | 联调初期不涉及 |
| payloadType 枚举新增 | 1:L, 2:Ka, 4:导航, 5:航空监视, 6:馈电, 7:星间激光, 8:综合处理, 0:与载荷无关 |
| inputPars 新增 cnName/type | 用例参数结构细化 |
| 软件升级/重启支持批量设备 | deviceId 变数组 |

#### 可暂缓（低影响）

- 术语更名（中心控制→集成控制）
- 附录设备类型填充
- 心跳矛盾未解决

### 二、控制接口规范 V1.0 关键内容

**文档性质**：甲方实际部署网关的接入速查表，与接口设计文档互补。

#### 认证机制（全新信息）

- 登录接口：`auth/partner/login`，POST
- 固定凭据：username=`subsys`，password=`f6c230cb7cf848439a4d52817dff6d`，clientId=`6af72c14148848b9b1c08220a6d8ee54`，grantType=`partner`，tenantId=`000000`
- 响应：`data.access_token`（JWT），有效期 7 天
- 所有业务请求头：`Authorization: Bearer {token}` + `Clientid: {clientId}`

#### 9 个上报接口

基础路径：`http://ip/partner-api/admin/`

| 接口 | method | URL 后缀 |
|------|--------|----------|
| 设备信息上报 | deviceInfoReport | deviceInfo/deviceInfoReport |
| 测试数据文件上传完成 | testDataFileTranslationComplete | report/testDataFileTranslationComplete |
| 文件传输完成 | fileTranslationComplete | report/fileTranslationComplete |
| 测试结果通知 | testCaseResultReport | report/testCaseResultReport |
| 设备告警上报 | deviceAlarmReport | deviceInfo/deviceAlarmReport |
| 子系统告警上报 | subSysAlarmReport | subSystem/subSysAlarmReport |
| 心跳 | heartbeat | subSystem/heartbeat |
| 用例步骤上报 | msgReport | report/msgReport |
| 设备实时码流上报 | sigReport | report/sigReport |

**全部为二级子系统主动上报方向**，method 名与接口设计文档一致。

#### 与接口设计文档的关系

| 维度 | 控制规范 V1.0 | 接口设计 V1.0.4 |
|------|---------------|-----------------|
| 路径前缀 | `/partner-api/admin/` | `/api/` |
| 协议 | HTTP | HTTPS |
| 认证 | JWT Bearer + Clientid | 无认证描述 |
| 覆盖 | 仅 9 个上报接口 | 全部 ~31 个接口 |
| 字段定义 | 无（只有 URL） | 完整 |

#### 对 northbound 架构的影响

1. **需新增 token 管理模块**：启动获取、缓存、到期前刷新/重新 login
2. **HTTP client 需 Bearer 认证拦截器**：自动注入 Authorization + Clientid header
3. **base URL 可配置**：生产 `/partner-api/admin/`，开发/测试可能不同
4. **凭据应可配置**：username/password/clientId 不硬编码

### 三、待向甲方确认

1. 甲方下发接口（setTestTask 等）的网关接入方式 — 是否也走 `/partner-api/`？是否有独立监听地址？
2. HTTP 还是 HTTPS？规范写 `http://`，接口设计写 `https://`
3. 心跳双向互发 — 甲方发来的心跳也走网关吗？
4. token 刷新策略 — 响应中 refresh_token=null，是否只能重新 login？
5. token 过期时返回什么？错误处理约定？

## 后续

- 将差异更新到 northbound 设计工件中（translator schema 更新、token 管理模块设计）
- 控制接口规范的上报接口 URL 和认证机制需纳入 platform HTTP facade 配置
- 甲方下发侧接入方式是后续联调的前置阻塞项
