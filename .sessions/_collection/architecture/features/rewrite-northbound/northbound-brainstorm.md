---
doc_type: feature-brainstorm
feature: rewrite-northbound
status: confirmed
summary: 甲方 HTTPS 闭环 — inbound translator（setTestTask→TaskDefinition）+ outbound translator（result→testCaseResultReport/msgReport）+ heartbeat/getSubSysState，平台层完全不含业务语义
tags: [northbound, customer-integration, https, task-translation]
---

# Northbound Feature Brainstorm

> Stage 0 | 2026-05-25 | 下一步：design

## 想做什么、为什么

甲方（集成测试系统）通过 HTTPS 接口控制我们的任务执行并接收结果上报。需要建 northbound feature 闭环这条链路：接收甲方指令 → 翻译为内部 TaskDefinition → 执行 → 收集结果 → 翻译为甲方格式 → POST 回传。

**起点材料**：
- `.sessions/2026-05-18-northbound-integration/S001-closed-loop-analysis.md` — 闭环分析 + 7 条架构决策已锁定 + 代码验证
- `codestable/compound/2026-04-28-northbound-overlap-and-gap-map.md` — overlap/gap 分析（边界参考仍有效）
- `codestable/features/rewrite-command-ingress/command-ingress-brainstorm.md` — SCOE→TaskDefinition 翻译模式可直接复用
- `codestable/features/rewrite-result/result-report-brainstorm.md` — result MVP 已实现，被动 API

**关键发现**：command-ingress 已实现完整的 SCOE 协议→TaskDefinition 翻译模式，northbound 的 inbound translator 可以复用相同思路。

## 考虑过的方向

### 方向 A：northbound 合并进 command-ingress
- 描述：甲方 HTTPS 作为 command-ingress 的第二个 ProtocolAdapter
- 价值：统一外部命令入口
- 代价：command-ingress 膨胀；SCOE 是字节流 consumer chain 模式，甲方 HTTPS 是 JSON server 模式，入站机制完全不同；改动面大
- 结论：否决。5/18 S001 已明确决策：northbound 独立 feature

### 方向 B：northbound 独立 feature + 平台层严格分离（选定）
- 描述：northbound 只做业务（翻译 + 会话 + 编排），HTTPS server/client 归 platform facade + main process，主进程不含任何甲方接口语义
- 价值：甲方改接口只动 northbound feature 内的 types + translator；HTTPS 库换掉只动 platform + main；改动不跨层传播
- 代价：需要先建 platform HTTPS facade（但这是基础设施投资，其他 feature 也会用到）
- 结论：选定

### 方向 C：先搭骨架等甲方 schema 全确认再实现
- 描述：只建目录结构和接口定义，翻译层全部 stub
- 价值：避免 schema 变动返工
- 代价：MVP 6 接口映射已确认（testCase=task），翻译逻辑可以先用内部类型，schema 确认后只改映射层
- 结论：否决。已确认的部分可以先做

## 已敲定的设计点

### 层级分离（已确认）

```
main process     → 纯传输层，只认 raw HTTP（method/url/headers/body）
                  不含任何甲方接口语义、不解析 JSON schema
preload          → 暴露 IPC bridge
platform facade  → 封装为通用 HttpRequest/HttpResponse（不含甲方语义）
northbound       → 唯一知道甲方接口的地方
                  inbound translator + outbound translator + session 管理
```

改动传播路径：甲方改接口 → 只动 `northbound/core/types.ts` + 两个 translator → 其他层不动。

### 类型策略（已确认）

- 甲方接口类型只定义一次，在 `northbound/core/types.ts`
- InboundRequest（setTestTask / controlTestTask / heartbeat / getSubSysState）
- OutboundResponse（testCaseResultReport / msgReport）
- 甲方枚举、错误码
- platform / main / IPC 只看到通用 HttpRequest / HttpResponse，不引用甲方类型
- 不在多个文件重复定义同类接口

### 入站模式差异（已确认）

| | SCOE（command-ingress） | 甲方 HTTPS（northbound） |
|---|---|---|
| 传输层 | TCP server，字节流 | HTTPS server，JSON |
| 入站机制 | TransportEventConsumer 链 | 独立 HTTP handler，不走 consumer chain |
| 协议识别 | 二进制协议头检查 | URL 路由 + JSON body |
| 与 runtime 关系 | routingTick 消费者 | 独立入站路径，不经过 routingTick |

### MVP 6 接口映射（已确认，来源 S001）

| 接口 | 方向 | 映射 |
|------|------|------|
| setTestTask | 甲方→我们 | testCaseInfo[] 每项 → 创建一个 task 实例 |
| controlTestTask | 甲方→我们 | abort→stop, pause→pause, continue→resume, stop→stop |
| testCaseResultReport | 我们→甲方 | task 终态 verdict → success/fail/tbd |
| msgReport | 我们→甲方 | step 完成 → stepInfo（需 task 加 step 事件 hook） |
| heartbeat | 甲方→我们 | 简单响应 |
| getSubSysState | 甲方→我们 | 状态查询响应 |

### 上游依赖现状（已确认）

| 依赖 | 当前状态 | 需要的改动 |
|------|---------|-----------|
| task service | 已实现，有 onSettled() | 需加 step 完成事件回调（~20 行） |
| result service | 已实现，被动 API | 需接线：onSettled → collectResult |
| platform facade | 只有 transport + file | 需新增 HTTPS server/client facade |
| command-ingress | 已实现 | 不改，可参考 translator 模式 |

### executionPlan 处理（已确认，来源 S001）

- parallel=true 层：同时 createTask + startTask 多个实例
- parallel=false 层：顺序执行，等前一个 onSettled 再启动下一个
- layers 按层序号顺序处理

### 甲方已确认（已确认，来源 S001）

- immediate 始终 true：收到 setTestTask 直接 createTask + startTask
- isEnd 始终 true：一次下发全部 testCaseInfo

## 选定方向与遗留问题

选定方向 B：northbound 独立 feature + 平台层严格分离。inbound translator 把甲方 JSON 翻译为 TaskDefinition（复用 command-ingress 的翻译模式），outbound translator 把 result 翻译为甲方 JSON。HTTPS server/client 封装在 platform facade，主进程不含业务语义。类型只在 northbound 定义一次。

**核心行为**：收到 setTestTask → 解析 executionPlan → 按层按 testCase 创建 task → 监听 onSettled → 收集 result → 翻译为 testCaseResultReport → POST 回甲方。heartbeat 和 getSubSysState 是简单查询 handler。

**明显不做**：testDataFileDelivery、详细 report、FTP 文件上传（MVP 阶段）、用例库管理、告警、升级运维。

**最大未知**：
1. HTTPS 库选型（Fastify / Express / 原生 Node）— design 阶段决定
2. step 完成事件 hook 怎么加进 task service 最小侵入 — design 阶段设计
3. taskId ↔ instanceId 映射表放在哪里（northbound 内部 state）— design 阶段决定
4. sessionId 生命周期管理 — design 阶段决定
5. TLS 配置（自签名 / 双向）— 运行时配置，不阻塞 design

**遗留给 design 的问题**：
- platform HTTPS facade 的具体 API 签名
- task step 事件 hook 的接口设计
- northbound feature 内部模块拆分（core/services/state/adapters）
- 与 runtime 的接线方式（northbound 不走 consumer chain，独立入站）
- 错误处理和重试策略（outbound POST 失败怎么办）
