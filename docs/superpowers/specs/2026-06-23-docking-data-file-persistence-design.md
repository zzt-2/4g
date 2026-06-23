# 中心对接数据文件持久化设计

> date: 2026-06-23
> topic: 甲方对接闭环分析 (northbound-integration)
> status: design (待用户审)

## 背景与问题

S012 治本那次把 **task 模板**从 localStorage 迁到了文件持久化(`state/task-templates.json`,原子写 + `.bak` 损坏恢复 + 损坏弹通知)。但**中心对接相关的 4 份数据当时漏迁了**,还留在 localStorage:

| 数据 | localStorage key | 现状 |
|------|------------------|------|
| 对接配置(含 password/FTP) | `northbound-docking-config` | localStorage |
| 设备列表 | `northbound-docking-devices` | localStorage |
| catalog 映射表(用例目录真实数据源) | `northbound-docking-catalog-mappings` | localStorage |
| 旧 JSON 用例目录(已降级调试用) | `northbound-docking-test-catalog` | localStorage |

Electron 的 localStorage 存在 userData 的 LevelDB,清缓存 / 删 userData / 某些重装方式都会整丢。用户实测:**用例目录、对接配置重装后没了,但任务模板还在**——根因就是 task 模板已迁文件、这 4 份没迁。

用户决定:**做文件持久化迁移**。

## 决策

### 已确认的边界(用户拍板)

1. **迁移范围**:全部 4 份(旧 JSON catalog 决定**删**而非迁,见下)
2. **架构方向 A**:feature 内各自建 file-storage(照 task-template-file-storage 范式),不挂进 FeaturePersistence
3. **迁移路径**:文件 missing 时从 localStorage 自动读旧数据 → 写文件 → 清 localStorage(一次性,跟 task 模板 S012 同套路)
4. **feature 归属**:全归 command-ingress(data 归它管,northbound 只消费)
5. **旧 JSON catalog**:删。D004 之后 `handleGetTestCaseAll` 已不读它,UI 0 入口,是死代码

### 实际要持久化的 3 份数据

- 对接配置(`PersistedConfig`)— 单个对象
- 设备列表(`DeviceInfoItem[]`)— 数组
- catalog 映射表(`CatalogMapping[]`)— 数组

### 颗粒度:单文件 `docking.json` 装 3 份

3 份数据语义同属"中心对接配置",量小、强相关、CRUD 频率低。task-template 也是"所有模板一个文件"的同款决策。方案 2(3 个独立文件)对这点数据量是负收益,排除。

## 架构

### 新增文件

**`rewrite/src/features/command-ingress/services/docking-file-storage.ts`**

照 `task-template-file-storage.ts` 范式,一个 storage 类管 3 份数据:

```
state/docking.json       ← 主文件(原子写)
state/docking.json.bak   ← 备份(写前滑动复制)
```

payload 结构:

```ts
{
  version: 1,
  config: PersistedConfig | null,
  devices: DeviceInfoItem[],
  catalogMappings: CatalogMapping[],
}
```

### 接口(同步读 + 异步写,跟 task-template 同款)

```ts
export interface DockingFileStorage {
  hydrate(): Promise<void>;
  loadConfig(): PersistedConfig | null;
  loadDevices(): DeviceInfoItem[];
  loadCatalogMappings(): CatalogMapping[];
  saveConfig(cfg: PersistedConfig): void;        // 同步更新缓存 + fire-and-forget 写文件
  saveDevices(items: DeviceInfoItem[]): void;
  saveCatalogMappings(items: CatalogMapping[]): void;
}
```

**缓存模式**:内存缓存 + 同步读 + 异步写。`use-central-docking` 在 setup 时同步要初始数据,hydrate 必须在它之前由 bootstrap 完成、数据灌进缓存,composable 再同步 `loadXxx()` 拿。

### 复用现成基建(不重造)

- `readJsonWithBackup` / `writeJsonWithBackup`(`shared/utils/json-storage.ts`)— 主+备损坏恢复 + 原子写
- `FileAccess` 接口(只读/只写文本)— 跟 task-template 一致
- `onDataLoss` 回调 → bootstrap 接 Quasar Notify 弹窗(同 task-template)

### feature 边界(守 D004 不变量)

- **command-ingress 持有 storage**,数据归它管
- **northbound 只消费**:`setDeviceList` / `setCatalogMappings` 接口不变,northbound service 零改动
- 旧 JSON catalog 整条链删掉

## 数据流 & 生命周期

### 启动时序(bootstrap)

`rewriteRuntime.ts` 末尾加一步 `await hydrateDockingData(runtime, fileFacade, dataDir)`,紧跟 `hydrateTaskTemplates` 之后:

```
bootstrapRewriteRuntime()
  └─ initPersistenceAsync()
       ├─ ... (frames/connections/settings 等已有 hydrate)
       ├─ hydrateTaskTemplates()        ← 已有
       └─ hydrateDockingData()          ← 新增
            ├─ createDockingFileStorage(fileFacade, dataDir, { onDataLoss, legacy })
            ├─ await storage.hydrate()
            │    ├─ 文件存在 → 读 + parse + 校验 → 灌缓存
            │    ├─ 文件 missing + localStorage 有旧数据 → 迁移 + 写文件 + 清 localStorage
            │    └─ 文件 missing + localStorage 空 → 空缓存
            └─ runtime 暂存 storage 引用(供 composable 取)
```

`use-central-docking` 改成从注入的 storage 同步 `loadXxx()` 拿初始值,不再直接读 localStorage。

### 运行时写入

composable 的 CRUD 函数改成调 storage 的 `saveXxx`:

```
用户改设备 → addDevice() → storage.saveDevices(next) → 内存缓存即时更新 + 异步写文件
                                                       └─ writeJsonWithBackup (原子写 + .bak)
```

写入失败不阻塞 UI(`saveXxx` 内 try/catch + console.error,跟 task-template 同款)。

### localStorage 一次性迁移(仅在文件 missing 时触发)

`hydrate()` 内:
- 文件 missing → 读 3 个 localStorage key(`northbound-docking-config` / `-devices` / `-catalog-mappings`)
- 任一非空 → 合成 payload 写文件 + 清 3 个 key(`localStorage.removeItem`)
- 全空 → 不迁移,缓存空

迁移只跑一次:文件存在后 localStorage 永不再读。

## 删除项 & 接口改动

### 删除(死代码清理)

- `use-central-docking.ts`:`TEST_CATALOG_KEY` / `persistTestCatalog` / `loadJson(TEST_CATALOG_KEY)` / `testCatalog` ref / `updateTestCatalog` / `setTestCatalogData` 调用 / 返回对象里的 `testCatalog` + `updateTestCatalog`
- `docking-labels.ts`:`DEFAULT_TEST_CATALOG` 导出
- `northbound-service.ts`:`configuredTestCases` 字段 / `setTestCatalogData` 方法 / `DEFAULT_TEST_CASES` 常量 / 接口里的 `setTestCatalogData` 签名

### 改动(localStorage → storage)

- `use-central-docking.ts`:
  - `loadJson<...>(CONFIG_KEY, {})` → `storage.loadConfig() ?? DEFAULT_DOCKING_CONFIG`
  - `loadJson(DEVICES_KEY, MOCK_DEVICES)` → `storage.loadDevices()`(空则用 MOCK_DEVICES 兜底,保持"首次启动有默认设备")
  - `loadCatalogMappings()` → `storage.loadCatalogMappings()`
  - `persistConfig` / `persistDevices` → 调 `storage.saveConfig` / `saveDevices`
  - `syncMappings` 里 `persistCatalogMappings` → `storage.saveCatalogMappings`
- `catalog-mapping.ts`:`loadCatalogMappings` / `persistCatalogMappings` / `CATALOG_MAPPINGS_KEY` **保留**(storage 迁移逻辑用),但 composable 不再直接调它们

### 不变

- northbound service 的 `setDeviceList` / `setCatalogMappings` 接口签名不变
- `NorthboundService` 类型对外不变
- feature-wiring 零改动

## 错误处理

(同 task-template 套路)

- **主文件损坏 + bak 可读** → `recovered`,数据不丢,`onDataLoss` 通知"主文件损坏已从备份恢复"
- **主+备都损坏** → `corrupted`,`onDataLoss` 通知"对接数据丢失",缓存置空(配置走默认值,设备走 MOCK_DEVICES)
- **schema version 高于预期**(未来回退)→ 不强加载,`onDataLoss` + 清空
- **写失败** → console.error,不阻塞 UI(内存缓存已更新,下次启动从文件读可能丢这次写入,但 `.bak` 兜底)

### 迁移防御

- localStorage 读 + JSON.parse 全包 try/catch,任一 key 坏了不影响其他 key
- 迁移成功才清 localStorage(写文件成功后再 `removeItem`),避免"清了没写成"丢数据
- parse 校验失败(不是合法 PersistedConfig/数组)→ 当空处理,不迁这份数据

## 测试

新建 `docking-file-storage.spec.ts`(TDD),mock `FileAccess`(in-memory map<path, string>,跟 `persistence.spec.ts` 同款)。覆盖:

1. `hydrate` 文件正常 → loadXxx 返回文件数据
2. `hydrate` 文件 missing + localStorage 有旧数据 → 迁移成功 + 清 localStorage
3. `hydrate` 文件 missing + localStorage 空 → 空缓存(配置 null / 设备空 / 映射空)
4. `hydrate` 主文件损坏 + bak 可读 → recovered,loadXxx 返回 bak 数据
5. `hydrate` 主+备都损坏 → onDataLoss 触发 + 缓存空
6. `hydrate` schema version 高 → onDataLoss + 清空
7. `saveConfig` → 缓存即时更新 + 文件写入(mock fileFacade 断言调用)
8. `saveDevices` / `saveCatalogMappings` 同上
9. 迁移时 localStorage 某 key 损坏 → 不影响其他 key 迁移

## 验证

- `docking-file-storage.spec.ts` 全绿
- northbound + command-ingress 现有 spec 不回归
- 全量 test 跑一遍,0 新增失败
- lint + tsc 改动文件 0 error

## 落档(session-governance)

northbound-integration topic 内改动,触发:
- **S016 note**(新建 `.sessions/.../S016-docking-data-file-persistence.md`)
- **topic-index.md** 加 S016 段 + 更新"当前状态"
- **voice.md** 收本轮原话

decisions.md 不新建 D###(延续 S012 文件持久化范式,非新决策)。

## 不做(YAGNI)

- 不挂进 FeaturePersistence(架构方向 A 已定,各 feature 自管)
- 不做 3 个独立文件(单文件已够,颗粒度负收益)
- 不迁旧 JSON catalog(死代码,删)
- 不改 northbound service 接口
- 不改 feature-wiring
