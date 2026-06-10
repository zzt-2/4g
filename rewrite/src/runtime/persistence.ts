import type { FileFacade } from '@/platform';
import type { FrameAsset } from '@/features/frame';
import type { TransportConfig } from '@/features/connection';
import type { SendFrameInstance } from '@/features/send';

export interface PersistedFeatureState {
  readonly frames?: { readonly frames: readonly FrameAsset[]; readonly selectedFrameId?: string };
  readonly connectionConfigs?: readonly TransportConfig[];
  readonly settings?: Record<string, unknown>;
  readonly storageHighspeed?: { readonly config: unknown; readonly rule: unknown };
  readonly sendInstances?: readonly SendFrameInstance[];
}

export interface PersistenceStateSources {
  getFrameSnapshot(): { readonly frames: readonly FrameAsset[]; readonly selectedFrameId?: string };
  getConnectionConfigs(): readonly TransportConfig[];
  getSettingsSnapshot(): Record<string, unknown>;
  getStorageHighspeedSnapshot?(): { readonly config: unknown; readonly rule: unknown };
  getSendInstancesSnapshot(): readonly SendFrameInstance[];
}

export interface FeaturePersistence {
  load(): Promise<PersistedFeatureState>;
  saveFrames(): Promise<void>;
  saveConnections(): Promise<void>;
  saveSettings(): Promise<void>;
  saveStorageHighspeed(): Promise<void>;
  saveSendInstances(): Promise<void>;
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
      const [frameData, connData, settingsData, storageHighspeedData, sendInstancesData] = await Promise.all([
        safeReadJson(fileFacade, dataPath(dataDir, 'frames')),
        safeReadJson(fileFacade, dataPath(dataDir, 'connections')),
        safeReadJson(fileFacade, dataPath(dataDir, 'settings')),
        safeReadJson(fileFacade, dataPath(dataDir, 'storage-highspeed')),
        safeReadJson(fileFacade, dataPath(dataDir, 'send-instances')),
      ]);

      return {
        frames: isFrameData(frameData) ? frameData as PersistedFeatureState['frames'] : undefined,
        connectionConfigs: isConnectionData(connData) ? (connData as { configs: readonly TransportConfig[] }).configs : undefined,
        settings: isSettingsData(settingsData) ? settingsData as Record<string, unknown> : undefined,
        storageHighspeed: isStorageHighspeedData(storageHighspeedData) ? storageHighspeedData as PersistedFeatureState['storageHighspeed'] : undefined,
        sendInstances: Array.isArray(sendInstancesData) ? sendInstancesData as readonly SendFrameInstance[] : undefined,
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

    async saveStorageHighspeed(): Promise<void> {
      if (!sources.getStorageHighspeedSnapshot) return;
      const snapshot = sources.getStorageHighspeedSnapshot();
      await safeWriteJson(fileFacade, dataPath(dataDir, 'storage-highspeed'), snapshot);
    },

    async saveSendInstances(): Promise<void> {
      const instances = sources.getSendInstancesSnapshot();
      await safeWriteJson(fileFacade, dataPath(dataDir, 'send-instances'), instances);
    },

    async saveAll(): Promise<void> {
      await Promise.all([
        this.saveFrames(),
        this.saveConnections(),
        this.saveSettings(),
        this.saveStorageHighspeed(),
        this.saveSendInstances(),
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

function isStorageHighspeedData(value: unknown): value is { config: unknown; rule: unknown } {
  if (value === null || typeof value !== 'object') return false;
  return 'config' in (value as Record<string, unknown>);
}

export function createNoOpPersistence(): FeaturePersistence {
  return {
    async load() { return {}; },
    async saveFrames() {},
    async saveConnections() {},
    async saveSettings() {},
    async saveStorageHighspeed() {},
    async saveSendInstances() {},
    async saveAll() {},
  };
}
