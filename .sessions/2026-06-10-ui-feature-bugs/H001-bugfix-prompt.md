# Handoff: UI 与 Feature Bug 集中修复

> 来源: 全局指挥对话 | 交接目标: 新对话接收 bug 列表，按规范逐个修复
> 文件名: H001-bugfix-prompt.md

## 已完成边界

全局指挥已派 3 个 explore agent 完成根因分析，每个 bug 都有明确的代码定位和根因。

## 不要做什么

- 不临场扩大边界，修完已知 bug 就停
- 不把组件局部 ref 改成 Pinia 就完事——先分析哪种持久化方案最合适
- 不跳过前端规范检查
- 不为修 bug 引入新的架构抽象
- 不改 connection core 类型定义的可选性（remoteHost/remotePort），那会破坏其他消费方

## 必读

**动代码前必须用子 agent 并行读完以下文档：**

1. `codestable/quality/rewrite-frontend-conventions.md`（前端 UI 规范）
2. `codestable/quality/rewrite-frontend-checklist.md`（前端自检 checklist）
3. `codestable/reference/rewrite-frontend-quickref.md`（前端速查卡）
4. `codestable/quality/rewrite-quality-rules.md`（质量规则）
5. `codestable/architecture/rewrite-target-structure.md`（目标结构）

## 已知 Bug 清单（根因已确认）

### Bug 1：发送帧页面导航后状态丢失

**现象**：在发送帧页面双击侧栏指令创建实例，切到另一个页面再切回来，所有实例和选择都清空。

**根因**：
- `rewrite/src/features/send/composables/use-send-instances.ts:12-14` — `instances`、`selectedInstanceId` 是组件局部 ref，不是 Pinia store
- `rewrite/src/pages/SendPage.vue:206` — `selectedTargetId` 也是组件局部 ref
- `rewrite/src/app/AppShell.vue:64` — router-view 没有 keep-alive
- `rewrite/src/runtime/persistence.ts:5-9` — PersistedFeatureState 不包含 send state
- `use-send-instances.ts:17` — `load()` 是空 stub（注释写明 "no persistence until platform file facade is wired"）

**修复方向**：
- 方案 A：send state 提到 Pinia store（全局状态）
- 方案 B：router-view 加 keep-alive（最简但有副作用）
- 方案 C：持久化到文件（当前 load 是 stub，platform file facade 已 available）
- 建议：先分析哪个方案副作用最小，和用户确认后再修

**涉及文件**：
- `rewrite/src/features/send/composables/use-send-instances.ts`
- `rewrite/src/pages/SendPage.vue`
- `rewrite/src/app/AppShell.vue`（仅方案 B）
- `rewrite/src/runtime/persistence.ts`（仅方案 C）
- `rewrite/src/features/send/state/`（方案 A 可能需要新建 Pinia store）

### Bug 2：UDP 发不出去

**现象**：创建 UDP 连接后，在发送帧页面选择 UDP 输出口发送数据，发送失败。

**根因**：
- UDP 写入要求 `remoteHost` + `remotePort`，但类型定义里是 optional
- `rewrite/src/features/connection/adapters/real-network-adapter.ts:119-141` — adapter 层拦截：无 remote 配置时返回 write-failed
- `rewrite/src-electron/main/network-handlers.ts:585-596` — main process 层也拦截
- `rewrite/src/features/connection/components/NewConnectionDialog.vue:148-149` — UI 允许不填 remote 就创建 UDP 连接
- 用户创建了"能连上但发不出去"的 UDP

**修复方向**：
- 在 NewConnectionDialog 中，UDP 的 remoteHost/remotePort 改为必填（至少发帧场景需要）
- 或者在连接列表/选择器中标注 UDP 连接是否有 remote target
- 或者在 write 失败时给用户明确的 UI 反馈（而不是静默失败）

**涉及文件**：
- `rewrite/src/features/connection/components/NewConnectionDialog.vue`
- `rewrite/src/features/connection/adapters/real-network-adapter.ts`（错误信息可优化）
- `rewrite/src/pages/SendPage.vue`（可能需要展示 write 失败反馈）

### Bug 3：输出口选择器显示本机 IP

**现象**：配置了 UDP 本机 IP 和远程 IP 后，发送帧页面的输出口选择器显示的是本机 IP 而不是远程 IP。

**根因**：
- `rewrite/src/features/connection/core/lifecycle.ts:56-68` — `routeLabelForConfig()` 对 UDP 无 remote 时回退显示 `localHost:localPort`
- `rewrite/src/features/connection/core/lifecycle.ts:80` — `deriveTransportTarget()` 用 routeLabel 作为默认 label

**修复方向**：
- 优先显示 remoteHost:remotePort（如果有）
- 无 remote 时显示 localHost:localPort 但标注 "(仅监听)" 或类似提示
- 或者在 label 中同时显示两端：`local → remote`

**涉及文件**：
- `rewrite/src/features/connection/core/lifecycle.ts`

### Bug 4+：用户反馈的更多问题

对话过程中用户会追加更多 bug，按同样流程处理：
1. 先读代码定位根因
2. 分析修复方案
3. 和用户确认方案后修
4. 修完跑 build + lint

## 通用流程指令

### Phase 1：必读文档

动任何代码前，用子 agent 并行读完上面「必读」列出的 5 份文档。不读完不动手。

### Phase 2：逐个 Bug 修复

每个 bug 按 cs-issue 流程推进：

1. **定位**：根因已在上面给出，直接去对应文件读代码确认
2. **方案**：列 2-3 个修复方案，简述 trade-off，等用户确认
3. **实施**：按确认的方案修，不改范围外的代码
4. **验证**：`pnpm -C rewrite build` + `pnpm -C rewrite lint` + 相关测试
5. **自检**：每个 bug 修完后过一遍以下审查框架（不需要每条都展开，但必须过）：
   - 过度设计审查（5 维）：上游消费、下游需求、驱动真实性、链路位置、跨模块一致性
   - 代码精简审查（5 维）：层间增值、死 surface、传递函数、重复模式、过度抽象
   - Service Readiness Audit（5 项）：method 存在、签名对齐、副作用管理、selector 字段完整、read-for-edit 路径
   - 实施前检查（7 项）：直接合同、覆盖行为、feature 归口、public API、Electron 边界、特殊模块、验证路径

### Phase 3：收尾

- 跑完整 build + lint + test
- 产出实施摘要：Changed files / Verify evidence / Open issues
- 不提交（全局指挥对话统一提交）

## 约束

- 修改必须遵照 rewrite 前端规范：颜色走 token、间距走 UnoCSS、组件走 Quasar
- 不引入新依赖
- 不改 core 层的类型可选取性（那需要同步改所有消费方，范围太大）
- 修 UI 时必须检查硬编码颜色/间距（速查卡有检查清单）
- 每次 build/lint 通过才能宣称一个 bug 修复完成

## 子 agent 策略

- 必读文档：3 个子 agent 并行读（文档 1-2、3-4、5）
- 每个 bug 的代码定位：直接读已知文件，不需要额外 explore
- 多个 bug 如果修改不冲突，可以并行修
- 验证阶段：派独立 verifier agent 检查 build + lint + test 结果
