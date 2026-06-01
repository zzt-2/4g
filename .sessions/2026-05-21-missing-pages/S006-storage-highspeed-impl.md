# [S006] 高速存储 feature 实施

> 2026-05-25 | 实施 | 完成

## 目标

对话 E 执行：按对话 D 设计文档和 21 项 checklist 实施高速存储 feature。

## 记录

### 直接合同

- 对话 D 设计文档 + checklist
- 边界护栏：R5 + R6 + CLAUDE.md main 不承载业务逻辑

### 实施范围

按 checklist HSS-001~021 顺序实施：

**Layer 1: Renderer Feature (8 项)**
- HSS-001: core/types.ts — 5 个核心类型
- HSS-002: core/defaults.ts — defaultConfig + defaultStats
- HSS-003: core/matching.ts — compilePattern + matchesPrefix + matchFrameHeader
- HSS-004: core/validation.ts — validateHexPattern + validateRule
- HSS-005: state/ — 闭包式 immutable state container
- HSS-006: services/ — factory + facade 注入 + 完整 CRUD
- HSS-007: selectors/ — 4 个纯函数投影
- HSS-008: composables/ — Vue composable + 1s 轮询
- HSS-009: index.ts — public API barrel

**Layer 2: Platform (3 项)**
- HSS-010: platform/storage.ts — StoragePlatformFacade + createStorageFacade
- HSS-011: shared/platform-bridge.ts — StorageBridge 类型 + StorageActivateRequest/Stats/ConfigUpdate
- HSS-012: preload/index.ts — 5 个 IPC 通道 + contextBridge 暴露

**Layer 3: Main Process (4 项)**
- HSS-013: storage-filter.ts — StorageFilter 单规则类 + WriteStream + 轮转 + hex 写入
- HSS-014: storage-handlers.ts — 5 个 IPC handler 注册/清理
- HSS-015: serial-handlers.ts + network-handlers.ts — 3 个分流插入点（serial/TCP client/TCP server client/UDP）
- HSS-016: main/index.ts — 注册 + shutdown cleanup

**Runtime + Quality (6 项)**
- HSS-017: feature-wiring.ts — L0 层创建 highSpeedStorageService
- HSS-018: persistence.ts — storage-highspeed 持久化注册
- HSS-019: build + lint 通过
- HSS-020: 91 个新单元测试全部通过
- HSS-021: 边界例外已在设计文档中记录

### 新增文件

| 文件 | 用途 |
|------|------|
| features/storage-highspeed/core/types.ts | 核心类型 |
| features/storage-highspeed/core/defaults.ts | 默认值 |
| features/storage-highspeed/core/matching.ts | 帧头匹配纯函数 |
| features/storage-highspeed/core/validation.ts | 规则验证纯函数 |
| features/storage-highspeed/core/index.ts | core barrel |
| features/storage-highspeed/state/storage-highspeed-state.ts | 闭包式状态容器 |
| features/storage-highspeed/services/storage-highspeed-service.ts | Service factory |
| features/storage-highspeed/services/index.ts | service barrel |
| features/storage-highspeed/selectors/storage-highspeed-selectors.ts | 4 个 selector |
| features/storage-highspeed/selectors/index.ts | selector barrel |
| features/storage-highspeed/composables/use-highspeed-storage.ts | Vue composable |
| features/storage-highspeed/index.ts | Public API |
| platform/storage.ts | Storage facade |
| src-electron/main/storage-filter.ts | StorageFilter 类 |
| src-electron/main/storage-handlers.ts | IPC handlers |

### 修改文件

| 文件 | 改动 |
|------|------|
| shared/platform-bridge.ts | +StorageBridge 类型、+storage capability |
| platform/index.ts | +getStorageFacade/resetStorageFacade |
| preload/index.ts | +storageBridge 5 个 IPC 通道 |
| src-electron/main/serial-handlers.ts | +storageFilter.shouldStore 分流 |
| src-electron/main/network-handlers.ts | +3 处 storageFilter 分流 |
| src-electron/main/index.ts | +注册 + cleanup |
| runtime/feature-wiring.ts | +highSpeedStorageService |
| runtime/persistence.ts | +storage-highspeed 持久化 |

### 测试

| 测试文件 | 用例数 |
|---------|--------|
| __tests__/core-matching.spec.ts | 14 |
| __tests__/core-validation.spec.ts | 18 |
| __tests__/service.spec.ts | 34 |
| __tests__/selectors.spec.ts | 25 |
| **合计** | **91** |

### 验证证据

- `pnpm -C rewrite build` — Build succeeded
- `pnpm -C rewrite lint` — 0 新 error（9 个 pre-existing）
- `pnpm test` — 1350 passed / 1 failed（pre-existing connection-core.spec.ts stopBits 问题）

## 后续

- 对话 F：高速存储 UI 页面设计实施
- 修复 connection-core.spec.ts pre-existing 失败
