# [S012] 持久化层与项目管理规范化

> 2026-05-15 | 基础设施阶段 | 已完成

## 目标

解决 progress-log 中识别的 P0 架构缺口——"零持久化"问题。此前所有 feature state（帧定义、连接配置、任务模板等）均为 JS 内存闭包，进程退出即丢失。同时将 `.sessions/` 过程日志从散文件升级为文件夹结构，建立规范化项目管理流程。

## 记录

### 1. 持久化层实现 `fdbfa6b`

10 个文件改动，+336 / -8 行。核心交付三件套：RealLocalMaterialAdapter、FeaturePersistence、LazyPersistence 启动加载。

#### 1.1 RealLocalMaterialAdapter

新增 `rewrite/src/features/storage-local-baseline/adapters/real-local-material-adapter.ts`（101 行），通过 FileFacade 实现真实本地文件读写，替代此前的内存 stub。设计意图来自 `rewrite-storage-local-baseline-design.md` 中定义的 adapter port 模式——adapter 只负责技术 I/O 转换和错误标准化，不解释业务 schema。

关键实现细节：

- **文件路径构造**：`baseDir/bucket/safeId.json`，id 经过 `replace(/[^a-zA-Z0-9._-]/g, '_')` 安全化处理，防止路径注入
- **readMaterial**：成功时返回 `{ ok: true, value }`；ENOENT 转为 `missing` 错误、JSON 解析失败转为 `corrupted` 错误、其余为 `unavailable`
- **writeMaterial**：JSON.stringify(value, null, 2) 格式化写入；写失败返回 `write-failed`
- **deleteMaterial**：软删除策略——将原始内容写入 `${id}.deleted` 文件（含 deletedAt 时间戳和 original 数据），而非直接删除。ENOENT 视为成功（幂等语义）
- **listMaterials**：读取 `bucket/_index.json` 获取 ID 列表；解析失败或文件不存在返回空数组而非错误

adapter 导出路径：`adapters/index.ts` → `storage-local-baseline/index.ts`，成为 storage feature 的公开 API。

#### 1.2 FeaturePersistence

新增 `rewrite/src/runtime/persistence.ts`（117 行），定义 feature 级别的持久化契约和实现。

接口定义：

```typescript
interface FeaturePersistence {
  load(): Promise<PersistedFeatureState>;
  saveFrames(): Promise<void>;
  saveConnections(): Promise<void>;
  saveSettings(): Promise<void>;
  saveAll(): Promise<void>;
}
```

`PersistedFeatureState` 包含三类数据：frames（帧定义 + selectedFrameId）、connectionConfigs（连接配置列表）、settings（设置快照）。

`PersistenceStateSources` 定义数据来源回调：`getFrameSnapshot`、`getConnectionConfigs`、`getSettingsSnapshot`，由调用方注入各 feature service 的 snapshot 方法。

存储路径：`${dataDir}/state/frames.json`、`${dataDir}/state/connections.json`、`${dataDir}/state/settings.json`。

核心函数 `createFeaturePersistence(fileFacade, dataDir, sources)` 返回 FeaturePersistence 实现：
- `load()` 并发读取三个文件，用类型守卫（isFrameData/isConnectionData/isSettingsData）验证数据结构，格式不符的返回 undefined 而非抛异常
- `save*()` 系列方法从 sources 回调获取快照，序列化后写入
- `saveAll()` 用 Promise.all 并发保存三类数据
- 读写均使用 `safeReadJson`/`safeWriteJson`，ENOENT 不报错，其余错误 console.error 后静默返回

文件末尾附带 `createNoOpPersistence()` 作为 fallback。

#### 1.3 启动加载（LazyPersistence 模式）

`rewrite/src/app/rewriteRuntime.ts` 引入 LazyPersistence 模式解决异步初始化的时序问题。

问题背景：`bootstrapRewriteRuntime()` 同步创建 runtime 对象并返回，但持久化数据需要异步读取文件。如果等待加载完成再返回 runtime，会阻塞整个应用启动。

解决方案：LazyPersistence 是 FeaturePersistence 的代理对象，初始持有 no-op delegate，在 `initPersistenceAsync` 完成后通过 `setDelegate()` 替换为真实 persistence。应用启动时立即获得可用的 runtime，持久化数据在后台加载完成后静默注入。

启动流程 `bootstrapRewriteRuntime()`：
1. 同步创建 transportFacade、fileFacade、connectionAdapter
2. 创建 LazyPersistence，注入 `createRewriteRuntime()`
3. 立即返回 `{ runtime, mode }` 供应用使用
4. 若 fileFacade 存在，异步执行 `initPersistenceAsync`：
   - 调用 `fileFacade.getUserDataPath()` 获取数据目录
   - 创建 FeaturePersistence 实例，注入 frame/connection/settings 的 snapshot 回调
   - `lazyPersistence.setDelegate(persistence)` 替换 no-op delegate
   - 读取 `${dataDir}/state/frames.json`，若数据有效则调用 `frameService.replaceFrames()` 恢复帧定义
5. 全程 try-catch，初始化失败只 console.error 不阻塞启动

#### 1.4 Platform 层扩展

- `platform/files.ts`：FileFacade 接口新增 `getUserDataPath(): Promise<string>` 方法
- `shared/platform-bridge.ts`：FileBridge 接口新增 `getUserDataPath(): Promise<string>` 通道定义
- `src-electron/preload/index.ts`：preload 暴露 `getUserDataPath` IPC 通道
- `src-electron/main/file-handlers.ts`：main 进程新增 `file:get-user-data-path` handler，返回 `app.getPath('userData')/dongfanghong`；同时 `handleWriteTextFile` 增加 `fs.mkdir(path.dirname(filePath), { recursive: true })` 自动创建父目录

#### 1.5 Runtime 接口变更

`rewrite/src/runtime/index.ts`：RewriteRuntime 接口新增 `readonly persistence: FeaturePersistence` 字段；`createRewriteRuntime()` 新增可选 `persistence` 参数，默认使用 `createNoOpPersistence()`。feature-wiring 和测试 helpers 同步更新。

### 2. `.sessions/` 过程日志规范化

#### 2.1 建立 `.sessions/` 日志体系 `828c4a7`

- 新增 `.sessions/2026-05-15-progress-log.md`（58 行），作为全局状态盘点文件，记录截至 05-15 的已完成项、未完成项和发现的问题
- 搬移 `codestable/compound/2026-05-07-runtime-global-planning.md` → `.sessions/2026-05-07-runtime-global-planning/runtime-global-planning.md`，将跨对话规划文档从 codestable compound 归入 .sessions 过程管理

#### 2.2 progress-log 搬入文件夹 `befdafd`

将 `.sessions/2026-05-15-progress-log.md` 搬入 `.sessions/2026-05-15-progress-log/progress-log.md`，为后续追加文件（如对话 JSONL 摘要）预留目录空间。

#### 2.3 过程日志更新 `c94e099`

将 progress-log 从 58 行扩展到 118 行，补充 05-15 下午的 UI 审计 + 对标修复工作记录，包括：
- 47 项 UI 静态审计修复（P0/P1/P2 分级）
- 设计文档对标修复（2 组对话）
- 侧边栏 + icon 修复
- Service 完成度确认（10 个 feature service 层全部 100%）
- 发现的 P0 Bug（SendPage 帧列表过滤 direction 值错误）和 P0 架构缺口（零持久化）

### 3. 前端规范与审计文档 `92a51e9`

5 个文件，+663 / -1 行：

- `CLAUDE.md`：强制阅读语气升级，将 UI 相关文档的阅读要求从"建议"提升为"必须先读"
- `codestable/quality/rewrite-frontend-conventions.md`（+177 行）：O2 通用规则、composable 模式、v-for key 规范等前端编码规范
- `codestable/quality/rewrite-frontend-checklist.md`（+12 行）：A/I 检查组补充
- `codestable/reference/audit-fix-prompt-2026-05-14.md`（+328 行）：UI 审计修复提示词模板
- `codestable/reference/rewrite-frontend-quickref.md`（+141 行）：前端速查卡，含 shared/ API 索引、语义 class、高频违规清单、新页面检查清单

## 后续

- 持久化层当前只实现了 frames 的启动加载（`replaceFrames`），connections 和 settings 的启动恢复尚未接入，需在后续补全
- RealLocalMaterialAdapter 的 deleteMaterial 采用软删除（写 .deleted 文件），实际文件清理逻辑未实现
- 存储路径 `${userData}/dongfanghong/state/` 未在打包态下验证（runtime blocker）
- progress-log 在 05-18 甲方对接讨论后继续更新，记录了 northbound 闭环决策
- 持久化 save 的触发时机未设计——当前只有手动 save，缺少"何时自动持久化"的策略（如帧变更后自动保存、定时保存、退出前保存等）
