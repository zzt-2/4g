# bootstrap — Design

> Feature slug: `bootstrap`
> Wave: 0（基础，零依赖）
> 直接合同: codestable/compound/2026-05-07-runtime-next-phase-global-planning.md 第十三、十四节（item #1）
> 极小 feature：启动 + 驱动 + 测试骨架

---

## 一、目标

让 runtime 真正跑起来：

1. AppShell 启动时根据 platform bridge 是否存在，选择 real 或 noOp adapter
2. routingTick 以 setInterval 定时驱动
3. 一条端到端集成测试骨架（fake adapter → routingTick → receive → bridge emit）

---

## 二、现状

| 已有 | 文件 |
|------|------|
| `createRewriteRuntime()` 接受可选 `connectionAdapter`，默认 noOp | `runtime/index.ts` |
| `wireFeatures()` 完成 L0→L3 全部接线 | `runtime/feature-wiring.ts` |
| `routingTick()` 实现 drain→receive→match→emit | `runtime/routing-tick.ts` |
| `RealSerialAdapter` 封装 TransportFacade | `features/connection/adapters/real-serial-adapter.ts` |
| `FakeConnectionTransportAdapter` 完整 fake | `features/connection/adapters/fake-transport-adapter.ts` |
| `getTransportFacade()` 检测 bridge 存在性 | `platform/index.ts` |
| `provideRewriteRuntime()` 注入 Vue | `app/rewriteRuntime.ts` |
| `AppShell.vue` 调 `provideRewriteRuntime()` 但无 adapter 选择、无 tick 驱动、无 destroy | `app/AppShell.vue` |

**不存在：** result feature（端到端测试 skeleton 只覆盖到 bridge emit）

---

## 三、名词层

### 3.1 Adapter 选择

启动时检测 platform bridge，决定 adapter：

```typescript
// 返回值
interface BootstrapResult {
  readonly runtime: RewriteRuntime;
  readonly mode: 'real' | 'noOp';
}
```

- `getTransportFacade()` 非 null → `createRealSerialAdapter({ transport })` → mode: `'real'`
- `getTransportFacade()` 为 null → `createNoOpConnectionAdapter()`（runtime/index.ts 已有）→ mode: `'noOp'`

选择逻辑归 `app/`，不在 runtime 里。runtime 只负责接收 adapter 并使用。

### 3.2 Tick Driver

扩展 `RewriteRuntime` 接口：

```typescript
interface RewriteRuntime {
  // 已有
  getOverviewSnapshot(): RewriteRuntimeOverviewSnapshot;
  resetSettings(scope?: SettingsResetScope): RewriteRuntimeCommandResult;
  readonly features: RewriteWiredFeatures;
  routingTick(): Promise<RoutingTickResult>;
  destroy(): void;

  // 新增
  startTickDriver(intervalMs?: number): void;
  stopTickDriver(): void;
  readonly isTickDriverRunning: boolean;
}
```

默认间隔：`ROUTING_TICK_DEFAULT_INTERVAL_MS = 100`（10 Hz）。

- `startTickDriver`：setInterval 调用 `routingTick()`，error 不抛、不中断驱动
- `stopTickDriver`：clearInterval
- `destroy`：自动 stopTickDriver + 已有清理逻辑

### 3.3 AppShell 启动流程变更

```
AppShell.setup()
  → detectAdapter()
  → createRewriteRuntime({ connectionAdapter })
  → runtime.startTickDriver()      // 默认 100ms
  → provideRewriteRuntime(runtime)  // Vue 注入

AppShell.unmount()
  → runtime.destroy()               // 内部 stopTickDriver + 清理
```

---

## 四、编排层

### 4.1 文件变更

| 文件 | 变更 | 说明 |
|------|------|------|
| `runtime/index.ts` | 修改 | 添加 startTickDriver / stopTickDriver / isTickDriverRunning；destroy 自动停止 |
| `app/rewriteRuntime.ts` | 修改 | 新增 `bootstrapRewriteRuntime()`：检测 platform bridge → 选 adapter → 创建 runtime → 返回 BootstrapResult |
| `app/AppShell.vue` | 修改 | 调 `bootstrapRewriteRuntime()` 替代裸 `provideRewriteRuntime()`；`onUnmounted` 调 `destroy()` |
| `runtime/__tests__/bootstrap-integration.spec.ts` | 新增 | 端到端集成测试骨架 |

### 4.2 不改的文件

- `runtime/feature-wiring.ts`：接线逻辑不变
- `runtime/routing-tick.ts`：routingTick 逻辑不变
- `runtime/bridges/*`：所有桥不变
- `platform/*`：platform facade 不变
- `features/*`：所有 feature 内部不变

---

## 五、端到端集成测试骨架

测试路径：`runtime/__tests__/bootstrap-integration.spec.ts`

```
describe('bootstrap end-to-end integration')
  1. 创建 FakeConnectionTransportAdapter
  2. createRewriteRuntime({ connectionAdapter: fake })
  3. connect fake adapter → serial config
  4. pushData(fake, connectionId, bytes)
  5. runtime.routingTick()
  6. 断言 RoutingTickResult: ok=true, eventsRouted > 0
  7. 断言 receiveEventSourceBridge 收到 emit（通过 subscribe 回调验证）
```

task → send → result 链路：result feature 不存在，暂不覆盖。在测试中用注释标注未来扩展点。

---

## 六、约束

- runtime 保持 composition root，不建状态机 / 调度器 / 事件总线
- 不涉及任何业务逻辑改动
- tick driver 是纯驱动机制，不持有队列、不重试、不背压
- 不改任何 feature 内部代码
- 不涉及 Electron / preload / main 改动（real adapter 只是包装已有 TransportFacade）

---

## 七、验收标准

1. `pnpm -C rewrite build` 通过
2. `pnpm -C rewrite lint` 通过
3. AppShell 启动时选择 adapter 并创建 runtime
4. routingTick 以 setInterval 驱动，destroy 自动清理
5. 端到端集成测试骨架通过
