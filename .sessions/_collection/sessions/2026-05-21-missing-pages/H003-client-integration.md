# 对话：甲方接口联调

```
Lane B | 甲方接口联调 — 基于已有 northbound 框架对接甲方 HTTP 接口

## 背景
重写项目已有完整的 northbound feature 框架（4 接口 + 43 测试），
现在需要对接甲方实际接口。目标是快速跑通接口连通性，再逐步接真实数据。

## 必读（先读甲方文档，再读内部代码）
1. 甲方接口文档（用户会在对话中提供）
2. rewrite/src/features/northbound/（已有框架：core/translators/state/service）
3. rewrite/src-electron/main/http-handlers.ts（已有 HTTP server/client IPC）
4. rewrite/src/platform/http.ts（已有 HttpFacade）
5. rewrite/src/runtime/feature-wiring.ts（northbound wiring 部分）
6. .sessions/2026-05-18-northbound-integration/S001-closed-loop-analysis.md（已拍板决策）

## 已知甲方技术约束
- 协议：HTTP（非 HTTPS）
- 认证方式：请求 header 需放置两个参数
  - Authorization: Bearer + 空格 + 令牌
  - Clientid: 6af72c14148848b9b1c08220a6d8ee54
- 令牌（Bearer token）的具体值待甲方文档确认

## 已有内部框架能力
- inbound-translator: 甲方 JSON → TaskDefinition 翻译
- outbound-translator: 内部结果 → 甲方格式翻译
- northbound-state: testCaseId ↔ instanceId 映射
- northbound-service: 主编排（handleRequest → task → result → response）
- http-handlers: Electron main 进程 HTTP server（Node http 模块）
- onStepResult 回调: step 级事件推送

## 流程
1. 先读取甲方文档，与已有 inbound/outbound translator 对比，找出 schema 差异
2. 确认认证机制接入方式（当前 HTTP server 无认证，需加 header 校验/注入）
3. 列出 gap 清单：哪些 translator 字段需要改、哪些新增接口、认证怎么加
4. 按优先级实施：先跑通最简路径（收到请求 → 返回响应），再补完整逻辑
5. 验证：build + lint + 测试

## 注意
- 按 H001 §通用流程指令执行（Wave 1/2/3）
- 不改 task/send/receive feature 核心逻辑，只改 northbound 层
- 认证参数（token/clientid）应可配置，不硬编码
- 甲方 schema 以本次对话收到的文档为准，不以旧分析文档为准
```
