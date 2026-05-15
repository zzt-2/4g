import type { FileFacade } from '@/platform';
import type { FrameAsset } from '@/features/frame';
import type { TransportConfig } from '@/features/connection';

export interface PersistedFeatureState {
  readonly frames?: { readonly frames: readonly FrameAsset[]; readonly selectedFrameId?: string };
  readonly connectionConfigs?: readonly TransportConfig[];
  readonly settings?: Record<string, unknown>;
}

export interface PersistenceStateSources {
  getFrameSnapshot(): { readonly frames: readonly FrameAsset[]; readonly selectedFrameId?: string };
  getConnectionConfigs(): readonly TransportConfig[];
  getSettingsSnapshot(): Record<string, unknown>;
}

export interface FeaturePersistence {
  load(): Promise<PersistedFeatureState>;
  saveFrames(): Promise<void>;
  saveConnections(): Promise<void>;
  saveSettings(): Promise<void>;
  saveAll(): Promise<void>;
}

function dataPath(dataDir: string, feature: string): string {
  return `${dataDir}/state/${feature}.json`;
}

async function safeReadJson(fileFacade: FileFacade, filePath: string): Promise<unknown | null> {
  try {
    const text = await fileFacade.readTextFile(filePath);
    return JSON.parse(text) as unknown;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ENOENT')) return null;
    console.error(`[persistence] Failed to read ${filePath}:`, msg);
    return null;
  }
}

async function safeWriteJson(fileFacade: FileFacade, filePath: string, value: unknown): Promise<void> {
  try {
    const text = JSON.stringify(value, null, 2);
    await fileFacade.writeTextFile(filePath, text);
  } catch (err: unknown) {
    console.error(`[persistence] Failed to write ${filePath}:`, err instanceof Error ? err.message : err);
  }
}

export function createFeaturePersistence(
  fileFacade: FileFacade,
  dataDir: string,
  sources: PersistenceStateSources,
): FeaturePersistence {
  return {
    async load(): Promise<PersistedFeatureState> {
      const [frameData, connData, settingsData] = await Promise.all([
        safeReadJson(fileFacade, dataPath(dataDir, 'frames')),
        safeReadJson(fileFacade, dataPath(dataDir, 'connections')),
        safeReadJson(fileFacade, dataPath(dataDir, 'settings')),
      ]);

      return {
        frames: isFrameData(frameData) ? frameData as PersistedFeatureState['frames'] : undefined,
        connectionConfigs: isConnectionData(connData) ? (connData as { configs: readonly TransportConfig[] }).configs : undefined,
        settings: isSettingsData(settingsData) ? settingsData as Record<string, unknown> : undefined,
      };
    },

    async saveFrames(): Promise<void> {
      const snapshot = sources.getFrameSnapshot();
      await safeWriteJson(fileFacade, dataPath(dataDir, 'frames'), snapshot);
    },

    async saveConnections(): Promise<void> {
      const configs = sources.getConnectionConfigs();
      await safeWriteJson(fileFacade, dataPath(dataDir, 'connections'), { configs });
    },

    async saveSettings(): Promise<void> {
      const snapshot = sources.getSettingsSnapshot();
      await safeWriteJson(fileFacade, dataPath(dataDir, 'settings'), snapshot);
    },

    async saveAll(): Promise<void> {
      await Promise.all([
        this.saveFrames(),
        this.saveConnections(),
        this.saveSettings(),
      ]);
    },
  };
}

function isFrameData(value: unknown): value is { frames: unknown[] } {
  if (value === null || typeof value !== 'object') return false;
  return Array.isArray((value as Record<string, unknown>).frames);
}

function isConnectionData(value: unknown): value is { configs: unknown[] } {
  if (value === null || typeof value !== 'object') return false;
  return Array.isArray((value as Record<string, unknown>).configs);
}

function isSettingsData(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export function createNoOpPersistence(): FeaturePersistence {
  return {
    async load() { return {}; },
    async saveFrames() {},
    async saveConnections() {},
    async saveSettings() {},
    async saveAll() {},
  };
}
