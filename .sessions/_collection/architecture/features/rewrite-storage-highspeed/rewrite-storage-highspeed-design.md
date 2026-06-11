---
doc_type: feature-design
feature: rewrite-storage-highspeed
status: implemented
date: 2026-05-25
summary: 高速存储三层架构 — 规则模型（renderer feature）+ 分流机制（main process data filter）+ Platform 文件流（WriteStream + 轮转）。已实施。
---

# Rewrite storage highspeed feature design

## 1. Direct contract

本设计只依据以下正式工件判断范围和完成度：

1. `.sessions/2026-05-21-missing-pages/S001-research-and-planning.md` §存储管理关键发现 + §存储管理补充 + §对话 D
2. `codestable/compound/2026-04-28-rewrite-execution-charter.md`
3. `codestable/architecture/rewrite-target-structure.md`
4. `codestable/architecture/rewrite-feature-boundaries.md`
5. `codestable/quality/rewrite-quality-rules.md`（R5 Electron 边界、R6 main scope、R7 单 owner）
6. `.sessions/2026-05-19-integration-testing/S004-legacy-observable-behaviors.md` §2.7（16 项存储行为）
7. `codestable/features/rewrite-storage-local-baseline/rewrite-storage-local-baseline-design.md`

## 2. Boundary guards

- 本轮是 Lane B/C 只设计不实施，产出 design + checklist，不写代码。
- 新代码落点是 `rewrite/src/features/storage-highspeed/` + platform 扩展 + main process 新增。
- 不修改 routing-tick、receive pipeline、connection feature 内部实现。
- 不设计 report delivery、northbound file delivery、TestReport、HTTP/FTP 或客户闭环。
- 不把高速存储等同于旧 send task、history、CSV 或 report。
- renderer 不直接访问 Node、Electron、`fs`、`path`、`ipcRenderer`。
- main process 只做 byte prefix comparison 执行和文件 I/O，不承载业务规则（匹配算法在 core/ 可独立测试，main 只调用编译结果）。
- 旧 `src/stores/highSpeedStorageStore.ts`、`src-electron/main/ipc/highSpeedStorageHandlers.ts`、`src-electron/main/ipc/networkHandlers.ts:505-517` 只作为 evidence，不作为新代码模板。

## 3. Evidence summary

### 3.1 旧系统关键证据

| 证据 | 来源 | 用途 |
|------|------|------|
| 单规则模型（1 条 FrameHeaderRule） | `src/stores/highSpeedStorageStore.ts` | 新系统对齐：单规则 + 多 headerPattern |
| 配置结构（enabled/rule/maxFileSize/enableRotation/rotationCount） | `src/types/serial/highSpeedStorage.ts` | 新系统类型参考 |
| 主进程 WriteStream + 轮转 + hex 写入 | `src-electron/main/ipc/highSpeedStorageHandlers.ts` | 新系统 main 实现参考 |
| 网络分流短路（shouldStore → storeData → return） | `src-electron/main/ipc/networkHandlers.ts:505-517` | 新系统分流机制参考 |
| UI 交互（master toggle/连接选择/帧头配置/文件大小/统计） | `src/components/storage/HighSpeedStoragePanel.vue` | UI 设计参考 |
| 帧头匹配（hex string → byte 数组 → 前缀比较） | `src-electron/main/ipc/highSpeedStorageHandlers.ts:77-96` | 匹配算法参考 |

### 3.2 新系统关键证据

| 证据 | 来源 | 影响 |
|------|------|------|
| drainAdapterEvents() 是唯一数据汇聚点 | `connection/services/connection-service.ts` | 分流钩子定位 |
| Platform 缺 createWriteStream/checkFileSize/ensureDir/listFiles/deleteFile | `platform/files.ts` | 需扩展 platform |
| storage-local-baseline 是 JSON 持久化，类型可复用 | `features/storage-local-baseline/` | 类型/模式参考 |
| R5 允许 main 做高频数据缓冲/批处理/分流 | `rewrite-quality-rules.md` | 分流在 main 的合规依据 |
| R5 禁止 main 承载业务规则/协议语义 | `rewrite-quality-rules.md` | 匹配算法必须在 core/ 可测试 |

### 3.3 行为基线覆盖

| 行为 | 覆盖方 |
|------|--------|
| STO-001~002（JSON 按小时存储 + 增量追加） | storage-local-baseline |
| STO-003（定时收集 1s + 定期持久化 5min + 小时切换） | **deferred** — 归 runtime 层 |
| STO-004（自动录制） | storage-local-baseline + settings |
| STO-005（环形缓冲 + 过期清理） | storage-local-baseline |
| STO-006~008（小时发现/批量加载/CSV 导出/CSV 格式） | storage-local-baseline |
| STO-009（帧头匹配 + 连接 ID 触发） | **本 feature** |
| STO-010（匹配数据不发渲染进程） | **本 feature** |
| STO-011（hex 文件格式） | **本 feature** |
| STO-012（文件轮转 100MB + 5 文件） | **本 feature** |
| STO-013（高速存储统计） | **本 feature** |
| STO-014（重置统计 = 删当前文件） | **本 feature** |
| STO-015（过期数据日级清理） | **deferred** — 可在后续迭代加 |
| STO-016（旧文件 gzip 压缩） | **deferred** — 可在后续迭代加 |

## 4. Design

### 4.1 Owner / not owner

| 分类 | storage-highspeed owner | storage-highspeed not owner |
| --- | --- | --- |
| 规则模型 | FrameHeaderRule 类型、验证、CRUD、启用/禁用决策。 | connection 的 transport target 管理、帧定义（frame feature）。 |
| 分流执行 | main process byte prefix filter 注册和执行。 | receive pipeline 内部逻辑、routing-tick 流程。 |
| 文件流 | WriteStream 创建、hex 写入、文件轮转、统计计数。 | 文件对话框、路径管理（归 platform/app shell）。 |
| 统计 | 运行时统计（帧数/字节数/文件大小/活跃状态）。 | 持久化历史查询（归 storage-local-baseline）。 |

### 4.2 架构决策

#### AD1: 新建独立 feature

`features/storage-highspeed/` 与 `storage-local-baseline` 并列。

理由：数据模型（流式追加 vs JSON Material）、生命周期（常驻活跃进程 vs 批量操作）、平台集成（main process filter + WriteStream vs adapter → JSON 文件）完全不同。feature boundaries 文档将 storage 领域概念上归属同一 owner，但实现上独立 feature 目录。

#### AD2: 匹配在 main，规则管理在 renderer

- **Renderer**：规则 CRUD、验证、启用/禁用决策、配置持久化。
- **Main**：接收编译后的规则（byte pattern 数组），执行 byte prefix comparison，分流 + 写文件。

R5 合规论证：
- R5 明文允许 main 承接"与平台资源绑定且性能压力明显的高频数据缓冲、批处理、聚合、节流、**队列和背压**"。byte prefix filter 是"数据分流/过滤"，属于此范围。
- 业务决策权（配什么规则、何时启用）完全在 renderer。main 只执行编译后的 pattern 比较。
- 匹配算法作为纯函数在 `core/matching.ts` 可独立测试，main 只是执行器。

**注册为 runtime 边界例外**：高速存储分流短路正常 receive/display/trigger 链，需在 runtime exception 登记表中显式注册。

#### AD3: 分流插入点 — transport handler 内、event buffer 前

```
serial/network handler 收到 data:
  1. storageFilter.shouldStore(connectionId, data)?
  2. YES → storeData(data) → return（不入 event buffer）
  3. NO  → eventBuffer.push(data) → 正常流程
```

匹配数据永远不进入 event buffer，零 renderer 开销。routing-tick、receive pipeline 完全无感知。

#### AD4: 粗粒度 typed Platform API

renderer 不控制文件级操作，只通过粗粒度 API 管理 filter 生命周期：

```typescript
interface StoragePlatformFacade {
  activateFilter(request: ActivateFilterRequest): Promise<ActivateFilterResult>
  deactivateFilter(): Promise<DeactivateFilterResult>
  getStats(): Promise<HighSpeedStorageStats>
  resetStats(): Promise<ResetStatsResult>
  updateConfig(config: FileConfigUpdate): Promise<UpdateConfigResult>
}
```

R6 合规：5 个 IPC 通道，粗粒度，无散落小调用。

**字节类型约定**：整个链路统一使用 `readonly number[]`，与现有 platform bridge 保持一致（`TransportBridgeEvent.bytes` 类型为 `readonly number[]`）。main process 内部可用 `Buffer`（Node.js），IPC 传输和 core/ 纯函数统一用 `readonly number[]`。不使用 `Uint8Array`。

#### AD5: 文件格式与旧系统相同

每帧一行大写 hex string（`AABBCCDD\n`）。向后兼容、人类可读、简单。

#### AD6: 统计在 main，renderer 定时轮询

- Main 维护计数器（帧数、字节数、文件大小、活跃状态）。
- Renderer 每 1 秒调 getStats() 刷新。
- 不逐帧跨 IPC 更新。

#### AD7: 配置单源真理在 renderer

- Renderer feature 拥有 config + rule 的唯一真理。
- 通过 activateFilter 把编译后的 rule 传给 main，main 不存 config 只存 active pattern。
- Config 持久化走现有 FeaturePersistence 机制。

#### AD8: 单规则 + 多 headerPattern

与旧系统一致：一条 FrameHeaderRule，包含多个 headerPattern（hex string 数组）。connectionId 标识目标连接。

不设计多规则数组。多规则可 future 扩展，当前无需求驱动。

#### AD9: routing-tick 无改动

分流在 platform 层（transport handler → filter → return），routing-tick 和 receive pipeline 完全不感知高速存储的存在。

### 4.3 三层架构

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Platform 文件流 (main process)                      │
│                                                              │
│ StorageFilter (src-electron/main/storage-filter.ts):         │
│   - activateFilter(): 接收 compiled rules → 存储 byte        │
│     pattern 数组                                             │
│   - shouldStore(connId, data): byte prefix comparison        │
│   - storeData(data): hex string → WriteStream → file         │
│   - checkRotation(): file size check → rotate if needed      │
│   - getStats(): 返回统计快照                                  │
│   - resetStats(): close stream + delete file + zero counters │
│   - cleanup(): app shutdown                                  │
│                                                              │
│ 集成点 (serial-handlers.ts / network-handlers.ts):            │
│   onData(connectionId, data):                                │
│     if filter.shouldStore(connectionId, data):               │
│       filter.storeData(data)                                 │
│       return  // 不入 eventBuffer                            │
│     eventBuffer.push(data)  // 正常流程                      │
│                                                              │
│ IPC Handlers (src-electron/main/storage-handlers.ts):         │
│   注册 5 个通道，委托 StorageFilter                          │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: Platform Facade (renderer)                          │
│                                                              │
│ StoragePlatformFacade (platform/storage.ts):                 │
│   - activateFilter / deactivateFilter / getStats /           │
│     resetStats / updateConfig                                │
│   - 通过 preload bridge IPC                                  │
│                                                              │
│ Preload Bridge (preload/index.ts 扩展):                      │
│   - storage: { activate, deactivate, getStats, reset,        │
│       updateConfig }                                         │
├─────────────────────────────────────────────────────────────┤
│ Layer 1: 规则模型 (renderer feature)                          │
│                                                              │
│ features/storage-highspeed/                                  │
│   core/                                                      │
│     types.ts    — Config, Rule, Stats, Status 类型            │
│     defaults.ts — 默认值 (maxFileSize=100, rotationCount=5)   │
│     matching.ts — matchFrameHeader() 纯函数                   │
│     validation.ts — validateRule() 验证                      │
│   services/                                                  │
│     storage-highspeed-service.ts                             │
│       - createService(options)                               │
│       - activate() / deactivate()                            │
│       - setRule() / updateRule() / deleteRule()              │
│       - refreshStats() / resetStats()                        │
│       - getSnapshot()                                        │
│   state/                                                     │
│     storage-highspeed-state.ts — config, rule, stats 状态    │
│   selectors/                                                 │
│     storage-highspeed-selectors.ts                           │
│       - storageStatus (disabled/ready/active)                │
│       - formattedStats (人类可读统计)                         │
│   composables/                                               │
│     use-highspeed-storage.ts — Vue composable for UI         │
│   index.ts — public API                                      │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 核心类型

```typescript
// core/types.ts

interface HighSpeedStorageConfig {
  readonly enabled: boolean
  readonly maxFileSize: number        // MB, default 100
  readonly enableRotation: boolean    // default true
  readonly rotationCount: number      // default 5
}

interface FrameHeaderRule {
  readonly id: string
  readonly connectionId: string
  readonly headerPatterns: readonly string[]  // hex strings e.g. ["AABBCC", "DDEEFF"]
  readonly enabled: boolean
}

type StorageStatus = 'disabled' | 'no-rule' | 'rule-disabled' | 'ready' | 'active'

interface HighSpeedStorageStats {
  readonly totalFramesStored: number
  readonly totalBytesStored: number
  readonly currentFileSize: number
  readonly storageStartTime: string | null
  readonly lastStorageTime: string | null
  readonly isStorageActive: boolean
}

interface HighSpeedStorageState {
  readonly config: HighSpeedStorageConfig
  readonly rule: FrameHeaderRule | null
  readonly stats: HighSpeedStorageStats
  readonly isLoading: boolean
  readonly lastError: string | null
}
```

### 4.5 核心函数

```typescript
// core/matching.ts — 纯函数，可独立测试
// 字节类型用 readonly number[]，与 platform bridge (TransportBridgeEvent.bytes) 保持一致

/** 编译 hex pattern string 为 number[] */
function compilePattern(hexPattern: string): number[]

/** 检查 data 是否以 pattern 开头 */
function matchesPrefix(data: readonly number[], pattern: readonly number[]): boolean

/** 检查 data 是否匹配任一 pattern */
function matchFrameHeader(data: readonly number[], patterns: readonly (readonly number[])[]): boolean

// core/validation.ts — 纯函数

interface RuleValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
}

function validateRule(rule: FrameHeaderRule): RuleValidationResult
function validateHexPattern(pattern: string): string | null  // error message or null
```

### 4.6 Service API

```typescript
// services/storage-highspeed-service.ts

interface StorageHighspeedService {
  // 读取
  getSnapshot(): HighSpeedStorageState

  // 生命周期
  activate(): Promise<void>     // enabled=true + register rules with main
  deactivate(): Promise<void>   // enabled=false + unregister

  // 规则管理
  setRule(rule: Omit<FrameHeaderRule, 'id'>): Promise<void>
  updateRule(updates: Partial<FrameHeaderRule>): Promise<void>
  deleteRule(): Promise<void>

  // 统计
  refreshStats(): Promise<void>  // poll from main
  resetStats(): Promise<void>    // reset + delete file
}

interface CreateServiceOptions {
  readonly platformFacade: StoragePlatformFacade
  readonly onStateChange: (snapshot: HighSpeedStorageState) => void
}
```

Service 不经过 adapter 层——直接调用 StoragePlatformFacade。测试通过 facade test double 替换。

### 4.7 Platform API 详细设计

```typescript
// platform/storage.ts

interface ActivateFilterRequest {
  readonly connectionId: string
  readonly compiledPatterns: readonly (readonly number[])[]  // 每个 pattern 是预编译的 byte 数组
  readonly fileConfig: {
    readonly maxFileSize: number     // bytes
    readonly enableRotation: boolean
    readonly rotationCount: number
  }
}

interface ActivateFilterResult {
  readonly ok: boolean
  readonly error?: string
}

interface DeactivateFilterResult {
  readonly ok: boolean
  readonly error?: string
}

interface HighSpeedStorageStats {
  readonly totalFramesStored: number
  readonly totalBytesStored: number
  readonly currentFileSize: number
  readonly storageStartTime: string | null
  readonly lastStorageTime: string | null
  readonly isStorageActive: boolean
}

interface ResetStatsResult {
  readonly ok: boolean
  readonly error?: string
}

interface FileConfigUpdate {
  readonly maxFileSize?: number
  readonly enableRotation?: boolean
  readonly rotationCount?: number
}

interface UpdateConfigResult {
  readonly ok: boolean
  readonly error?: string
}

interface StoragePlatformFacade {
  activateFilter(request: ActivateFilterRequest): Promise<ActivateFilterResult>
  deactivateFilter(): Promise<DeactivateFilterResult>
  getStats(): Promise<HighSpeedStorageStats>
  resetStats(): Promise<ResetStatsResult>
  updateConfig(config: FileConfigUpdate): Promise<UpdateConfigResult>
}
```

### 4.8 Main Process 实现设计

```typescript
// src-electron/main/storage-filter.ts

class StorageFilter {
  // 状态（单规则设计，扁平结构）
  private connectionId: string | null
  private patterns: (readonly number[])[]  // 预编译的 byte pattern 数组
  private writeStream: WriteStream | null
  private currentFilePath: string
  private fileConfig: FileConfig
  private stats: Stats
  private storageDir: string  // 内部解析: app.getPath('userData') + '/dongfanghong/business-data'

  // 核心 API
  activate(request: ActivateFilterRequest): void
  deactivate(): void
  shouldStore(connectionId: string, data: Buffer | readonly number[]): boolean
  storeData(data: Buffer | readonly number[]): void
  getStats(): HighSpeedStorageStats
  resetStats(): void
  updateConfig(config: FileConfigUpdate): void
  cleanup(): void

  // 内部方法
  private initializeWriteStream(): void
  private checkRotation(): void
  private cleanupOldFiles(): void
  private toHexString(data: Buffer | readonly number[]): string
}
```

集成点改造（serial-handlers.ts / network-handlers.ts）：

实际代码中数据到达形式为 `Buffer`，通过 `batchBuffer: number[]` + `scheduleBatchFlush` 批量发送到 renderer。分流必须在 `batchBuffer.push` 之前。

```typescript
// serial-handlers.ts — wirePortEvents() 内 port.on('data', ...) 改造:
port.on('data', (chunk: Buffer) => {
  // 高速存储分流（必须在入 batchBuffer 前）
  if (storageFilter.shouldStore(conn.config.id, chunk)) {
    storageFilter.storeData(chunk)
    return  // 不入 batchBuffer，不调 scheduleBatchFlush
  }
  for (let i = 0; i < chunk.length; i++) {
    conn.batchBuffer.push(chunk[i] as number)
  }
  scheduleBatchFlush(conn, win)
})

// network-handlers.ts — socket.on('data', ...) 同模式改造
```

注意：每个 chunk 独立匹配帧头前缀。如果一个协议帧跨多个 chunk，只有第一个（含帧头）被存储，后续 chunk 走正常流程。这与旧系统行为一致。

### 4.9 Runtime Wiring

高速存储 service 在 L0 层创建（需要在 connection 开始接收数据前就注册 filter）：

```
L0: frameService, settingsService, storageService, highSpeedStorageService
L1: connectionService  ← 数据开始流动
L2-L5: 不受影响
```

service 创建时从持久化加载 config + rule，如果 enabled=true 且 rule 存在，立即调用 activateFilter 注册 filter。

### 4.10 Selectors

```typescript
// selectors/storage-highspeed-selectors.ts

function selectStorageStatus(state: HighSpeedStorageState): StorageStatus
function selectFormattedStats(state: HighSpeedStorageState): FormattedStats
function selectCanActivate(state: HighSpeedStorageState): boolean
function selectRuleSummary(state: HighSpeedStorageState): RuleSummary | null
```

### 4.11 持久化

Config + Rule 通过 FeaturePersistence 机制保存（与其他 feature 一致）：
- Key: `storage-highspeed`
- Value: `{ config, rule }`
- Stats 不持久化（运行时态）
- 启动时从 persistence 加载 → 如果 enabled + hasRule → activateFilter

### 4.12 文件存储细节

- 目录：由 StorageFilter 内部解析，`path.join(app.getPath('userData'), 'dongfanghong', 'business-data')`。不经过 renderer，不在 ActivateFilterRequest 中传递。
- 文件名：`business_data_YYYY-MM-DDTHH-MM-SS-mmmZ.txt`
- 格式：每帧一行大写 hex string
- 轮转：文件大小 ≥ maxFileSize → 关闭当前 stream → 清理旧文件（保留 rotationCount 个最新）→ 创建新文件
- 统计估算：currentFileSize += dataSize * 2 + 1（hex + 换行符）

### 4.13 边界例外注册

高速存储分流短路正常 receive/display/trigger 链，需在 runtime exception 登记表中注册：

| 例外 | 描述 | 合规依据 |
|------|------|---------|
| 高速存储分流短路 | 匹配高速存储规则的数据在 main process 被 filter 拦截，不入 event buffer，不经过 receive pipeline 和 routing-tick | R5 允许 main 做高频数据分流；业务决策在 renderer；matching 算法在 core/ 可独立测试 |

## 5. Deferred items

| 项 | 原因 | 预计时机 |
|----|------|---------|
| STO-003 定时持久化（1s 收集 + 5min 持久化 + 小时切换） | 高速存储是流式写入（不经过 storage-local-baseline 的 material 机制），持久化模式不同 | runtime 层设计时处理 |
| STO-015 日级过期清理 | 旧系统有 day-based retention，新系统可复用 rotation 机制或独立实现 | 对话 E 实施时可加入 |
| STO-016 旧文件 gzip 压缩 | 性能优化项，非核心行为 | 对话 E 实施时可加入 |
| 多规则支持 | 旧系统单规则已满足需求，多规则无需求驱动 | Future，类型预留 |
| 二进制文件格式 | 当前 hex 格式满足需求，二进制是性能优化 | Future |
| 数据读取/回放 | 高速存储文件目前只写不读，读取和回放功能未定义 | Future |

## 6. Self-check results

### 6.1 架构合规

| 检查项 | 结论 |
|--------|------|
| Feature 归属 | PASS — 独立 feature，与 storage-local-baseline 并列 |
| Main/renderer 边界 (R5) | PASS（含边界例外） — 业务决策在 renderer，main 只执行 filter；显式注册 runtime exception |
| Main scope (R6) | PASS — 5 个粗粒度 IPC，无散落小调用 |
| 5 层结构 | PASS — core/service/state/selectors/composable |
| Typed IPC | PASS — preload bridge 暴露 typed API |

### 6.2 过度设计审查

| 维度 | 结论 |
|------|------|
| 上游消费 | PASS — 从 connection 消费 connectionId，从 platform 消费 facade |
| 下游需求 | PASS — UI 页面通过 composable 消费，runtime 通过 service 消费 |
| 驱动需求真实性 | PASS — 每个设计元素对应 STO-009~014 行为或旧系统证据 |
| 链路位置 | PASS — 匹配在 core/ 可测试，分流在 main 高效，规则管理在 renderer 合规 |
| 跨模块一致性 | PASS — 与 connection/storage-local-baseline 同模式 |

### 6.3 代码精简审查

| 维度 | 结论 |
|------|------|
| 层间增值 | PASS — 去掉 adapter 层，service 直接调 facade |
| 死 surface | PASS — 去掉 reader，service 暴露 getSnapshot |
| 传递函数 | PASS — 无透传层 |
| 重复模式 | PASS — matching 是 byte prefix 比较，与 receive/frame-matcher（协议识别、多算子）不同层次不同用途 |
| 过度抽象 | PASS — 单规则无 factory/strategy，platform API 粗粒度 |

### 6.4 覆盖度

| 行为 | 覆盖 |
|------|------|
| STO-009 帧头匹配 | core/matching.ts + main StorageFilter |
| STO-010 匹配数据不发渲染进程 | AD3 分流插入点 |
| STO-011 hex 文件格式 | AD5 |
| STO-012 文件轮转 | main StorageFilter rotation |
| STO-013 统计 | AD6 |
| STO-014 重置删文件 | resetStats IPC |
| STO-003/015/016 | Deferred，有明确理由和预计时机 |
