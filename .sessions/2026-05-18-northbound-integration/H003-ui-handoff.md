# Handoff: 甲方连通 UI

> 来源: S005 + stub 补全 | 交接目标: 提供让用户配置甲方连接参数并启动 northbound 服务的 UI
> 文件名: H003-ui-handoff.md

## 已完成边界

- northbound service 全部就绪（12 入站 + 9 出站 + auth + heartbeat + FTP）
- `createNorthboundService` + `start(config)` / `stop()` API 已定义
- feature-wiring 已注册（但未连接到任何页面）
- 86 个 northbound 测试通过
- **当前没有任何 UI 页面**，用户无法配置参数、无法启动/停止连接

## 不要做什么

- 不要改 northbound service 的 API 接口（start/stop/handleStepResult 等）
- 不要改 auth、heartbeat、translator 的核心逻辑
- 不要把业务逻辑塞进 Vue 组件（组件只调 service，逻辑在 service 里）
- 不要硬编码甲方地址/凭据
- 不要跳过前端规范就动手写 UI

## 必读

**必须完整读完，不允许跳过：**

1. **前端 UI 规范** — `codestable/quality/rewrite-frontend-conventions.md`
2. **前端自检 checklist** — `codestable/quality/rewrite-frontend-checklist.md`
3. **前端速查卡** — `codestable/reference/rewrite-frontend-quickref.md`

**其他必读：**

4. **本 handoff**

5. **Northbound service API** — `rewrite/src/features/northbound/services/northbound-service.ts`
   - `NorthboundConfig`: serverHost, serverPort, customerBaseUrl, subSysType, subSysId, auth
   - `NorthboundService`: start(config), stop(), isActive(), getSessionStatus()
   - `AuthConfig`: loginUrl, clientId, username, password, grantType, tenantId

6. **Feature wiring** — `rewrite/src/runtime/feature-wiring.ts`
   - northbound service 当前如何创建和注册
   - 与其他 feature 的依赖关系

7. **现有页面结构** — `rewrite/src/pages/` 和 `rewrite/src/widgets/`
   - 了解现有页面风格和模式
   - 新页面应该和现有风格一致

8. **架构文档** — `codestable/architecture/rewrite-target-structure.md`
   - 页面层职责
   - feature service 消费模式

9. **规范** — `codestable/quality/rewrite-quality-rules.md`

## 需要讨论再决定的内容

**用户明确表示不知道当前 UI 怎么用，不确定什么样的 UI 合适。新对话必须先讨论以下问题，不能直接开始写页面：**

1. **最少需要什么操作？**
   - 填写甲方地址 + 端口 + 认证凭据
   - 填写本方 subSysType + subSysId
   - 启动 / 停止连接
   - 查看连接状态（在线/离线、当前心跳、已处理任务数）
   - 还有别的吗？

2. **放在哪？**
   - 新页面？还是嵌入现有设置页面？
   - 如果是独立页面，路由怎么安排？
   - 导航入口放哪？

3. **配置持久化？**
   - 甲方地址/凭据要不要保存？下次启动自动填？
   - 保存到哪里？（localStorage? 文件? Pinia store?）

4. **使用流程是什么？**
   - 打开页面 → 填配置 → 点"连接" → 看到状态变绿 → 就这样？
   - 需要看日志吗？需要看甲方请求历史吗？
   - 联调阶段 vs 正式使用阶段，UI 有区别吗？

5. **现有页面风格参考**
   - 先读现有页面代码，了解用了哪些 Quasar 组件和布局模式
   - 新页面要保持一致

6. **Service readiness audit**
   - 按规范，设计 UI 前必须审计 service API 是否满足 UI 消费需求
   - 缺什么先补 service，再写 UI

## 下一轮

1. 读完全部必读文档
2. **先和用户讨论上面 6 个问题**，确认 UI 形状
3. 做 service readiness audit（UI 需要但 service 不提供的操作）
4. 设计页面（composable + component 结构）
5. 实施
6. 验证（build + lint + 手工检查页面可用）
