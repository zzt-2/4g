# 预存问题记录 2026-05-08

> 来源：platform-network-transport feature 实现 + 审查过程中发现
> 优先级：均不阻塞当前 feature

## I1: connection public API 泄露 fake adapter factory

- 文件：rewrite/src/features/connection/__tests__/connection-state-service-selector.spec.ts:254
- 现象：`connectionPublicApi` 包含 `createFakeConnectionTransportAdapter`，但测试断言它不应存在
- 影响：public API 边界不干净，外部可能误用测试专用工厂
- 建议：检查 connection/index.ts export 列表，确认 fake adapter 是否误入 public API

## I2: task condition `any` operator 对 null 值行为不符预期

- 文件：rewrite/src/features/task/__tests__/task-core.spec.ts:261
- 现象：`evaluateCondition(waitConditions.any(), matchInputs.nullValue)` 返回 false，测试期望 true
- 影响：`any` operator 语义是否应匹配 null 值需确认——如果 any 意味"任何值包括 null"，当前实现有 bug
- 建议：确认 `any` operator 语义定义后再决定修测试还是修实现

## I3: real-serial-adapter toAdapterErrorKind 类型窄化失败

- 文件：rewrite/src/features/connection/adapters/real-serial-adapter.ts:23
- 现象：`TRANSPORT_ERROR_KIND_SET` 是 `Set<string>`，`Set.has()` 返回 boolean 但无法将 string 窄化为 TransportErrorKind
- 影响：tsc strict 模式下编译失败（build 用 esbuild 不触发，但 tsc --noEmit 会报错）
- 建议：改用类型谓词函数 `function isErrorKind(kind: string): kind is TransportErrorKind` 或在返回处加 `as TransportErrorKind`