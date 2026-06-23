# S016 — 中心对接数据文件持久化(localStorage → 文件)

> date: 2026-06-23
> topic: 甲方对接闭环分析
> 状态: 完成
> 关联: S012(文件持久化范式) / D004(数据归 command-ingress) / S013+S015(password/FTP 防御)

## 起因

用户报:"目前用例目录没有持久化,然后对接配置也是,重新安装后,就直接变回去了?这对吗?"

## 根因

S012 治本那次把 **task 模板**从 localStorage 迁到了文件持久化(`state/task-templates.json`,原子写 + `.bak` 损坏恢复 + 损坏弹通知)。但**中心对接相关的 4 份数据当时漏迁了**,还留在 localStorage:

| 数据 | localStorage key | 现状 |
|------|------------------|------|
| 对接配置(含 password/FTP) | `northbound-docking-config` | localStorage |
| 设备列表 | `northbound-docking-devices` | localStorage |
| catalog 映射表(用例目录真实数据源) | `northbound-docking-catalog-mappings` | localStorage |
| 旧 JSON 用例目录(已降级调试用) | `northbound-docking-test-catalog` | localStorage |

Electron 的 localStorage 存在 userData 的 LevelDB,清缓存 / 删 userData / 某些重装方式都会整丢。用户实测:用例目录、对接配置重装后没了,但任务模板还在——根因就是 task 模板已迁文件、这 4 份没迁。

**这不对,是遗漏。** topic-index 的"已知未做"清单之前没单列这条。

## 决策(brainstorm 拍板)

1. **迁移范围**:全部 4 份。旧 JSON 用例目录决定**删**而非迁(D004 后 handler 不读它,UI 0 入口,死代码)
2. **架构方向 A**:feature 内各自建 file-storage(照 task-template-file-storage 范式),不挂进 FeaturePersistence
3. **迁移路径**:文件 missing 时从 localStorage 自动读旧数据 → 写文件 → 清 localStorage(一次性,跟 task 模板 S012 同套路)
4. **feature 归属**:全归 command-ingress(data 归它管,northbound 只消费,守 D004 不变量)
5. **颗粒度**:单文件 `docking.json` 装 3 份数据(强相关且量小,task-template 也是"所有模板一个文件")

延续 S012 文件持久化范式,**不新建 D###**(非新决策)。

## 实施

### 新增

**`rewrite/src/features/command-ingress/services/docking-file-storage.ts`**
- `createDockingFileStorage(files, dataDir, options)` — 照 task-template-file-storage 范式
- payload = `{ version:1, config, devices, catalogMappings }` 单文件 `state/docking.json`
- 同步读(内存缓存)+ 异步写(fire-and-forget writeJsonWithBackup)
- `hydrate()`:文件正常→灌缓存;主损坏+bak可读→recovered+onDataLoss;主+备都坏→corrupted+onDataLoss;文件missing→localStorage 一次性迁移(写文件成功才清 localStorage,避免"清了没写成"丢数据)
- schema version 高于预期 → 清空 + onDataLoss(未来回退保护)
- **`LazyDockingStorage`** class — 照 rewriteRuntime `LazyPersistence` 同款的延迟注入 holder。wireFeatures 同步初始化时无 fileFacade,先建空 delegate;bootstrap 异步拿到 fileFacade + dataDir 后建真 storage + hydrate + `setDelegate` 注入

**`rewrite/src/features/command-ingress/__tests__/docking-file-storage.spec.ts`** — 12 个测试(TDD,覆盖 hydrate 正常/迁移/损坏恢复/schema/saveXxx)

### 改动

**`runtime/feature-wiring.ts`** — `RewriteWiredFeatures` 加 `dockingStorage: LazyDockingStorage` 字段;`wireFeatures` 建 `new LazyDockingStorage()`(空 delegate)

**`app/rewriteRuntime.ts`** — bootstrap 末尾加 `await hydrateDockingData(runtime, fileFacade, dataDir)`(紧跟 `hydrateTaskTemplates` 之后)。`hydrateDockingData` 创建真 storage + onDataLoss 弹 Quasar Notify(同 task 模板套路)+ hydrate + `runtime.features.dockingStorage.setDelegate(storage)`

**`command-ingress/composables/use-central-docking.ts`** — composable 加 `storage: DockingFileStorage` 参数;初始化从 `storage.loadConfig()` / `loadDevices()` / `loadCatalogMappings()` 拿(不再读 localStorage);CRUD 函数(`saveConfigAndConnect` / `addDevice` / `updateDevice` / `removeDevice` / `syncMappings`)改调 `storage.saveXxx`;删 `PersistedConfig` 接口(迁到 storage 文件,re-export)/ `persistConfig` / `persistDevices` / `persistTestCatalog` / `loadJson` / localStorage key 常量 / `testCatalog` ref / `updateTestCatalog`

**`pages/CommandIngressPage.vue`** — `useCentralDocking(...)` 调用加 `runtime.features.dockingStorage` 参数

### 删除(死代码清理)

- `command-ingress/components/docking-labels.ts`:`DEFAULT_TEST_CATALOG` 导出
- `northbound/services/northbound-service.ts`:`setTestCatalogData` 方法 + 接口签名 + `configuredTestCases` 字段 + `DEFAULT_TEST_CASES` 常量(D004 之后已死,handler 不读)
- `command-ingress/__tests__/docking-config-persistence.spec.ts`:整文件删(S013/S015 的 localStorage password/FTP 防御测试,localStorage 路径已被 storage 取代,等价防御在 docking-file-storage.spec saveConfig 场景覆盖)

### 时序关键点

`useCentralDocking` 在 page setup 时**同步**调,要立即读 storage 数据。但 bootstrap hydrate 是**异步**的(`ready` Promise)。

解法:照 task 模板——`AppShell` 已有 `v-if="!hydrated"` 机制,**bootstrap ready resolve 前根本不渲染 router-view**。所以 `CommandIngressPage`(含 `useCentralDocking`)一定在 `ready`(含 `hydrateDockingData`)resolve 之后才 setup。composable setup 时 `dockingStorage.setDelegate` 已执行,delegate 已是真 storage(hydrate 完)。**时序无冲突,无需额外同步机制。**

## 验证

- `docking-file-storage.spec.ts` **12/12 过**
- command-ingress + northbound 全套 275/280(5 failed 全 heartbeat-timer pre-existing baseline,stash 对照铁证)
- 全量 **1754 passed / 11 failed**(11 全 baseline:heartbeat-timer 5 + tcp-receive/event-truncation/frame-service-state-selector 6,stash 对照 0 新增失败)
- lint 改动文件 **0 error**(修了 1 处 `PersistedConfig` unused import)
- vue-tsc 工具自身 bug(崩在 `buildInfoVersionMap.roots`,S013/S015 起就存在,与本任务无关);tsc 单文件跑改动文件无报错

## 影响

- ✅ 用户报的"用例目录/对接配置重装就丢"问题根治——3 份数据走文件 + `.bak`,跟 task 模板同可靠性
- ✅ 旧 localStorage 数据自动迁移(首次启动文件 missing 时),用户无感
- ✅ 死代码清理(DEFAULT_TEST_CASES/DEFAULT_TEST_CATALOG/setTestCatalogData 整条链)
- ✅ northbound service 接口更干净(少一个 setTestCatalogData)
- ⚠️ 北向死代码清理是顺手做的(D004 之后已死),不算 scope 蔓延

## 教训

- S012 治本时只迁了 task 模板,northbound/command-ingress 这 4 份当时没一起迁——**迁移要全盘扫,不能只迁最先暴露的那一个**。同类数据(localStorage 持久化)应该一次性全迁,否则会留"为什么这个在那个不在"的认知负担
- 落 topic-index 的"已知未做"清单要诚实——这条持久化遗漏之前没单列,是用户实测才发现的
