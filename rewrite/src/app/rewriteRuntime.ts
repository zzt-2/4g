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

    const framesData = await safeReadJson(fileFacade, `${dataDir}/state/frames.json`);
    if (isObjectWithArray(framesData, 'frames')) {
      const data = framesData as { frames: unknown[]; selectedFrameId?: string };
      runtime.features.frameService.replaceFrames(data.frames as FrameAsset[], data.selectedFrameId);
      runtime.features.receiveService.refreshFrameReferences();
    }

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
  try {
    const text = await fileFacade.readTextFile(filePath);
    return JSON.parse(text) as unknown;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ENOENT')) return null;
    console.error(`[bootstrap] Failed to load ${filePath}:`, msg);
    return null;
  }
}

function isObjectWithArray(value: unknown, key: string): boolean {
  if (value === null || typeof value !== 'object') return false;
  return Array.isArray((value as Record<string, unknown>)[key]);
}
