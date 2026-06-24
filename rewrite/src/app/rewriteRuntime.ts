import { inject, provide, type InjectionKey } from 'vue';
import { createRewriteRuntime, type RewriteRuntime } from '@/runtime';
import { getTransportFacade, getFileFacade, type FileFacade } from '@/platform';
import { createRealSerialAdapter, createRealNetworkAdapter, createCompositeAdapter, type TransportConfig } from '@/features/connection';
import type { FrameAsset } from '@/features/frame';
import type { DisplayPreferences } from '@/features/display';
import { migrateDisplayPreferencesFromV1, validateChartSelectedItems } from '@/features/display';
import type { HighSpeedStorageConfig, FrameHeaderRule } from '@/features/storage-highspeed';
import type { SendFrameInstance } from '@/features/send';
import { restoreSendInstances, getSendInstancesSnapshot } from '@/features/send/composables/use-send-instances';
import { createFeaturePersistence, type FeaturePersistence } from '@/runtime/persistence';
import { readJsonWithBackup } from '@/shared/utils/json-storage';
import { decideFrameSeed } from '@/runtime/frame-seed';
import { deserializeFrames } from '@/features/frame';
import { createTaskTemplateFileStorage, createTaskTemplateStorage } from '@/features/task';
import { createDockingFileStorage } from '@/features/command-ingress/services/docking-file-storage';
import { createDockingTaskHistoryStorage } from '@/features/command-ingress/services/docking-task-history-storage';

const rewriteRuntimeKey: InjectionKey<RewriteRuntime> = Symbol('rewrite-runtime');

export interface BootstrapResult {
  readonly runtime: RewriteRuntime;
  readonly mode: 'real' | 'noOp';
  readonly ready: Promise<void>;
}

export class LazyPersistence implements FeaturePersistence {
  private delegate: FeaturePersistence = {
    async load() { return {}; },
    async saveFrames() {},
    async saveConnections() {},
    async saveSettings() {},
    async saveStorageHighspeed() {},
    async saveSendInstances() {},
    async saveDisplayPreferences() {},
    async saveAll() {},
    async flushPending() {},
  };

  setDelegate(p: FeaturePersistence): void {
    this.delegate = p;
  }

  load() { return this.delegate.load(); }
  saveFrames() { return this.delegate.saveFrames(); }
  saveConnections() { return this.delegate.saveConnections(); }
  saveSettings() { return this.delegate.saveSettings(); }
  saveStorageHighspeed() { return this.delegate.saveStorageHighspeed(); }
  saveSendInstances() { return this.delegate.saveSendInstances(); }
  saveDisplayPreferences() { return this.delegate.saveDisplayPreferences(); }
  saveAll() { return this.delegate.saveAll(); }
  flushPending() { return this.delegate.flushPending(); }
}

export function bootstrapRewriteRuntime(): BootstrapResult {
  const transportFacade = getTransportFacade();
  const fileFacade = getFileFacade();

  const serialAdapter = transportFacade
    ? createRealSerialAdapter({ transport: transportFacade })
    : undefined;
  const networkAdapter = transportFacade
    ? createRealNetworkAdapter({ transport: transportFacade })
    : undefined;
  const connectionAdapter = createCompositeAdapter({ serialAdapter, networkAdapter });
  const mode = transportFacade ? 'real' : 'noOp';

  const lazyPersistence = new LazyPersistence();
  const runtime = createRewriteRuntime({ connectionAdapter }, lazyPersistence);

  let ready: Promise<void>;
  if (fileFacade) {
    ready = initPersistenceAsync(runtime, fileFacade, lazyPersistence);
  } else {
    ready = Promise.resolve();
  }

  return { runtime, mode, ready };
}

async function initPersistenceAsync(
  runtime: RewriteRuntime,
  fileFacade: FileFacade,
  lazyPersistence: LazyPersistence,
): Promise<void> {
  try {
    const dataDir = await fileFacade.getUserDataPath();
    const persistence = createFeaturePersistence(fileFacade, dataDir, {
      getFrameSnapshot: () => runtime.features.frameService.getSnapshot(),
      getConnectionConfigs: () => runtime.features.connectionService.getSnapshot().configs as readonly TransportConfig[],
      getSettingsSnapshot: () => runtime.features.settingsService.getSnapshot() as unknown as Record<string, unknown>,
      getStorageHighspeedSnapshot: () => runtime.features.highSpeedStorageService.getSnapshot(),
      getSendInstancesSnapshot: () => getSendInstancesSnapshot(),
      getDisplayPreferencesSnapshot: () => runtime.features.displayService.getPreferences() as DisplayPreferences,
    });

    lazyPersistence.setDelegate(persistence);

    // frames seed 决策(S012 根因 B):frames.json 缺失/损坏/空 且 未初始化过 → seed 默认帧。
    // 用 .frames-initialized 标记区分"首次空"(seed)vs"用户清空"(不 seed),绝不覆盖用户数据。
    const framesPath = `${dataDir}/state/frames.json`;
    const initializedFlagPath = `${dataDir}/state/.frames-initialized`;
    const framesReadResult = await readJsonWithBackup(fileFacade, framesPath);
    const initializedFlagExists = await checkFileExists(fileFacade, initializedFlagPath);
    const shouldSeed = decideFrameSeed(framesReadResult, { initialized: initializedFlagExists });

    if (shouldSeed) {
      await seedDefaultFrames(runtime, fileFacade, framesPath, initializedFlagPath);
    } else if (framesReadResult.status === 'ok' || framesReadResult.status === 'recovered') {
      // 有可读数据(主文件 ok 或 bak 恢复)→ hydrate
      const data = framesReadResult.value as { frames?: unknown[]; selectedFrameId?: string } | null;
      if (data && Array.isArray(data.frames)) {
        runtime.features.frameService.replaceFrames(data.frames as FrameAsset[], data.selectedFrameId);
      }
    }
    // 无论 seed 还是 hydrate,都刷新帧引用(receive/display 等依赖帧的页面才能起得来)。
    runtime.features.receiveService.refreshFrameReferences();

    const connData = await safeReadJson(fileFacade, `${dataDir}/state/connections.json`);
    if (isObjectWithArray(connData, 'configs')) {
      const configs = (connData as { configs: unknown[] }).configs as TransportConfig[];
      for (const config of configs) {
        runtime.features.connectionService.upsertConfig(config);
        if (config.autoConnect) {
          await runtime.features.connectionService.connect(config).catch((err: unknown) => {
            console.error(`[bootstrap] Auto-connect failed for ${config.id}:`, err instanceof Error ? err.message : err);
          });
        }
      }
    }

    const settingsData = await safeReadJson(fileFacade, `${dataDir}/state/settings.json`);
    if (settingsData && typeof settingsData === 'object') {
      runtime.features.settingsService.replace(settingsData as Record<string, unknown>);
    }

    const hsData = await safeReadJson(fileFacade, `${dataDir}/state/storage-highspeed.json`);
    if (hsData && typeof hsData === 'object' && 'config' in (hsData as Record<string, unknown>)) {
      const d = hsData as { config: unknown; rule: unknown };
      const hs = runtime.features.highSpeedStorageService;
      hs.restoreState(d.config as HighSpeedStorageConfig, (d.rule as FrameHeaderRule) ?? null);
    }

    const siData = await safeReadJson(fileFacade, `${dataDir}/state/send-instances.json`);
    if (Array.isArray(siData)) {
      restoreSendInstances(siData as SendFrameInstance[]);
    }

    const dpData = await safeReadJson(fileFacade, `${dataDir}/state/display-preferences.json`);
    if (dpData && typeof dpData === 'object' && !Array.isArray(dpData)) {
      try {
        const migratedPatch = migrateDisplayPreferencesFromV1(dpData);
        const hydrated = runtime.features.displayService.updatePreferences(migratedPatch);
        // Validate static references against current frame definitions (drops/falls back on stale items)
        const validatedPrefs = validateChartSelectedItems(
          hydrated.snapshot.preferences as DisplayPreferences,
          runtime.features.frameReader,
        );
        if (validatedPrefs !== hydrated.snapshot.preferences) {
          runtime.features.displayService.updatePreferences({
            charts: validatedPrefs.charts.map((c) => ({
              title: c.title,
              selectedItems: c.selectedItems.map((it) => ({ ...it })),
              yAxis: { ...c.yAxis },
              performance: { ...c.performance },
            })),
          });
        }
      } catch (err: unknown) {
        console.error('[bootstrap] display preferences hydration failed:', err instanceof Error ? err.message : err);
      }
    }

    // 任务模板迁文件持久化(S012 根因 D):localStorage → state/task-templates.json,
    // 走原子写 + .bak 损坏恢复。损坏/丢失经 onDataLoss 弹 Quasar Notify 让用户感知。
    await hydrateTaskTemplates(runtime, fileFacade, dataDir);

    // 中心对接数据迁文件持久化(S016):对接配置/设备列表/catalog 映射表
    // localStorage → state/docking.json,跟 task 模板同套路。3 份合写一个文件。
    await hydrateDockingData(runtime, fileFacade, dataDir);

    // 中心下发任务批次历史持久化(spec: 任务批次历史面板):setTestTask 批次 + 每用例结果摘要
    // 存 state/docking-tasks.json。新数据(无 localStorage 旧后端),文件不存在 = 空数组。
    await hydrateDockingTaskHistory(runtime, fileFacade, dataDir);
  } catch (err: unknown) {
    console.error('[bootstrap] Persistence initialization failed:', err instanceof Error ? err.message : err);
  }
}

export function provideRewriteRuntime(runtime: RewriteRuntime = createRewriteRuntime()): RewriteRuntime {
  provide(rewriteRuntimeKey, runtime);
  return runtime;
}

export function useRewriteRuntime(): RewriteRuntime {
  const runtime = inject(rewriteRuntimeKey);
  if (!runtime) {
    throw new Error('Rewrite runtime has not been provided.');
  }

  return runtime;
}

async function safeReadJson(
  fileFacade: { readTextFile(path: string): Promise<string> },
  filePath: string,
): Promise<unknown | null> {
  // 走带备份恢复的 readJsonWithBackup(S012 根因 A2):主文件损坏 → 尝试 .bak。
  // ok/recovered 返回 value;missing/corrupted 返回 null(corrupted 已在 json-storage
  // 内部 console.error,这里不重复日志)。
  const result = await readJsonWithBackup(fileFacade, filePath);
  if (result.status === 'ok' || result.status === 'recovered') return result.value;
  return null;
}

function isObjectWithArray(value: unknown, key: string): boolean {
  if (value === null || typeof value !== 'object') return false;
  return Array.isArray((value as Record<string, unknown>)[key]);
}

/** 文件是否存在(ENOENT → false,其他正常 → true)。读异常视为不存在,保守不 seed。 */
async function checkFileExists(fileFacade: { readTextFile(p: string): Promise<string> }, filePath: string): Promise<boolean> {
  try {
    await fileFacade.readTextFile(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * seed 默认帧(S012 根因 B):
 *   1. 从 main 进程读默认帧 JSON(fileFacade.getDefaultFrames,经 IPC)
 *   2. deserializeFrames 做 schema 校验(失败则放弃 seed,记错)
 *   3. replaceFrames 灌进 frame service + saveFrames 落盘
 *   4. 写 .frames-initialized 标记(下次启动 frames 空也不重复 seed)
 */
async function seedDefaultFrames(
  runtime: RewriteRuntime,
  fileFacade: FileFacade,
  framesPath: string,
  initializedFlagPath: string,
): Promise<void> {
  try {
    const json = await fileFacade.getDefaultFrames();
    const parsed = deserializeFrames(json);
    if (!parsed.ok || parsed.frames.length === 0) {
      console.error('[bootstrap] default frames seed skipped: parse failed or empty', parsed.issues);
      return;
    }
    runtime.features.frameService.replaceFrames(parsed.frames);
    // 落盘默认帧,下次启动 frames.json 就有数据了(走 fileFacade.writeTextFile 透明原子写 A1)。
    // 用 { frames: [...] } 形状,和 persistence.saveFrames 写的格式一致。
    await writeRawFile(fileFacade, framesPath, JSON.stringify({ frames: parsed.frames }, null, 2));
    // 写初始化标记(空内容即可,存在即代表"seed 过")
    await writeRawFile(fileFacade, initializedFlagPath, new Date().toISOString());
    console.info(`[bootstrap] seeded ${parsed.frames.length} default frames`);
  } catch (err: unknown) {
    console.error('[bootstrap] default frames seed failed:', err instanceof Error ? err.message : err);
  }
}

/** 薄封装:经 fileFacade.writeTextFile(透明走原子写 A1)写文本。 */
async function writeRawFile(fileFacade: FileFacade, filePath: string, content: string): Promise<void> {
  await fileFacade.writeTextFile(filePath, content);
}

/**
 * 任务模板 hydrate + 注入(S012 根因 D)。
 *
 * 流程:① 创建文件后端 storage(经 fileFacade 走原子写 + .bak 损坏恢复)
 *      ② storage.hydrate() 读文件;文件不存在时从旧 localStorage 一次性迁移
 *      ③ 注入 task-service:setTemplateStorage(后续 debounce 写入走文件) + hydrateTemplates(灌 state)
 *      ④ onDataLoss 弹 Quasar Notify 让用户感知损坏/丢失(数据丢失不再静默)
 *
 * Notify 用动态 import:bootstrap 在 AppShell setup 时跑,Quasar 此时可能未完全就绪,
 * try/catch 兜底(失败则只靠 storage 内的 console.error 可观测)。
 */
async function hydrateTaskTemplates(
  runtime: RewriteRuntime,
  fileFacade: FileFacade,
  dataDir: string,
): Promise<void> {
  const taskService = runtime.features.taskService;
  const storage = createTaskTemplateFileStorage(fileFacade, dataDir, {
    onDataLoss: (message) => {
      console.error('[bootstrap]', message);
      // best-effort 弹通知;Quasar 未就绪则跳过(console.error 已留痕)
      import('quasar')
        .then(({ Notify }) => {
          try {
            Notify.create({ type: 'warning', message: '任务模板', caption: message, timeout: 10000 });
          } catch {
            // Notify.create 失败(app 上下文未就绪)→ 忽略,console.error 已记录
          }
        })
        .catch(() => {
          // quasar 模块加载失败 → 忽略
        });
    },
    legacyStorage: createTaskTemplateStorage(),
  });

  await storage.hydrate();

  taskService.setTemplateStorage(storage);
  taskService.hydrateTemplates(storage.loadAll());
}

/**
 * 中心对接数据 hydrate + 注入(S016)。
 *
 * 跟 hydrateTaskTemplates 同套路:创建文件后端 storage(原子写 + .bak 损坏恢复),
 * hydrate 读文件 + localStorage 迁移,再 setDelegate 注进 runtime 的 LazyDockingStorage holder。
 * onDataLoss 弹 Quasar Notify 让用户感知损坏/丢失(数据丢失不再静默)。
 *
 * composable 从 runtime.features.dockingStorage 拿 holder,调 loadXxx/saveXxx——
 * AppShell 保证 ready resolve 前不渲染 router-view,所以 composable setup 时
 * delegate 一定已是真 storage(hydrate 完)。
 */
async function hydrateDockingData(
  runtime: RewriteRuntime,
  fileFacade: FileFacade,
  dataDir: string,
): Promise<void> {
  const storage = createDockingFileStorage(fileFacade, dataDir, {
    onDataLoss: (message) => {
      console.error('[bootstrap]', message);
      import('quasar')
        .then(({ Notify }) => {
          try {
            Notify.create({ type: 'warning', message: '中心对接数据', caption: message, timeout: 10000 });
          } catch {
            // Notify.create 失败(app 上下文未就绪)→ 忽略,console.error 已记录
          }
        })
        .catch(() => {
          // quasar 模块加载失败 → 忽略
        });
    },
    // 生产用 globalThis localStorage(storage 内部默认即取它,无需显式传)
  });

  await storage.hydrate();

  runtime.features.dockingStorage.setDelegate(storage);
}

/**
 * 中心下发任务批次历史 hydrate + 注入(spec: 任务批次历史面板)。
 *
 * 跟 hydrateDockingData 同套路:创建文件后端 storage(原子写 + .bak 损坏恢复),
 * hydrate 读文件(新数据无 localStorage 迁移,文件不存在 = 空数组),再 setDelegate 注进
 * runtime 的 LazyDockingTaskHistoryStorage holder。onDataLoss 弹 Quasar Notify 让用户感知。
 *
 * northbound 接入点(handleSetTestTask/createAndStartTask/reportTaskResult)从注入的 holder
 * 调 insertBatch/updateCase/recomputeBatchStatus——AppShell 保证 ready resolve 前不渲染 router-view,
 * 所以接入点被触发时 delegate 一定已是真 storage(hydrate 完)。
 */
async function hydrateDockingTaskHistory(
  runtime: RewriteRuntime,
  fileFacade: FileFacade,
  dataDir: string,
): Promise<void> {
  const storage = createDockingTaskHistoryStorage(fileFacade, dataDir, {
    onDataLoss: (message) => {
      console.error('[bootstrap]', message);
      import('quasar')
        .then(({ Notify }) => {
          try {
            Notify.create({ type: 'warning', message: '任务批次历史', caption: message, timeout: 10000 });
          } catch {
            // Notify.create 失败(app 上下文未就绪)→ 忽略,console.error 已记录
          }
        })
        .catch(() => {
          // quasar 模块加载失败 → 忽略
        });
    },
  });

  await storage.hydrate();

  runtime.features.dockingTaskHistoryStorage.setDelegate(storage);
}
