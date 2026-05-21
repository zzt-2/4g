import { inject, provide, type InjectionKey } from 'vue';
import { createRewriteRuntime, type RewriteRuntime } from '@/runtime';
import { getTransportFacade, getFileFacade, type FileFacade } from '@/platform';
import { createRealSerialAdapter, createRealNetworkAdapter, createCompositeAdapter, type TransportConfig } from '@/features/connection';
import type { FrameAsset } from '@/features/frame';
import { createFeaturePersistence, type FeaturePersistence } from '@/runtime/persistence';

const rewriteRuntimeKey: InjectionKey<RewriteRuntime> = Symbol('rewrite-runtime');

export interface BootstrapResult {
  readonly runtime: RewriteRuntime;
  readonly mode: 'real' | 'noOp';
}

export class LazyPersistence implements FeaturePersistence {
  private delegate: FeaturePersistence = {
    async load() { return {}; },
    async saveFrames() {},
    async saveConnections() {},
    async saveSettings() {},
    async saveAll() {},
  };

  setDelegate(p: FeaturePersistence): void {
    this.delegate = p;
  }

  load() { return this.delegate.load(); }
  saveFrames() { return this.delegate.saveFrames(); }
  saveConnections() { return this.delegate.saveConnections(); }
  saveSettings() { return this.delegate.saveSettings(); }
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

  if (fileFacade) {
    initPersistenceAsync(runtime, fileFacade, lazyPersistence);
  }

  return { runtime, mode };
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
    });

    lazyPersistence.setDelegate(persistence);

    const framesData = await safeReadJson(fileFacade, `${dataDir}/state/frames.json`);
    if (isObjectWithArray(framesData, 'frames')) {
      const data = framesData as { frames: unknown[]; selectedFrameId?: string };
      runtime.features.frameService.replaceFrames(data.frames as FrameAsset[], data.selectedFrameId);
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
