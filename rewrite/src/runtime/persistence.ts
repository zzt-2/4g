import type { FileFacade } from '@/platform';
import type { FrameAsset } from '@/features/frame';
import type { TransportConfig } from '@/features/connection';
import type { SendFrameInstance } from '@/features/send';
import type { DisplayPreferences } from '@/features/display';
import { readJsonWithBackup, writeJsonWithBackup } from '@/shared/utils/json-storage';

export interface PersistedFeatureState {
  readonly frames?: { readonly frames: readonly FrameAsset[]; readonly selectedFrameId?: string };
  readonly connectionConfigs?: readonly TransportConfig[];
  readonly settings?: Record<string, unknown>;
  readonly storageHighspeed?: { readonly config: unknown; readonly rule: unknown };
  readonly sendInstances?: readonly SendFrameInstance[];
  readonly displayPreferences?: DisplayPreferences;
}

export interface PersistenceStateSources {
  getFrameSnapshot(): { readonly frames: readonly FrameAsset[]; readonly selectedFrameId?: string };
  getConnectionConfigs(): readonly TransportConfig[];
  getSettingsSnapshot(): Record<string, unknown>;
  getStorageHighspeedSnapshot?(): { readonly config: unknown; readonly rule: unknown };
  getSendInstancesSnapshot(): readonly SendFrameInstance[];
  getDisplayPreferencesSnapshot?(): DisplayPreferences;
}

export interface FeaturePersistence {
  load(): Promise<PersistedFeatureState>;
  saveFrames(): Promise<void>;
  saveConnections(): Promise<void>;
  saveSettings(): Promise<void>;
  saveStorageHighspeed(): Promise<void>;
  saveSendInstances(): Promise<void>;
  saveDisplayPreferences(): Promise<void>;
  saveAll(): Promise<void>;
  /**
   * 确保所有最新快照落盘(S012 根因 A3)。
   * 当前实现 = saveAll(全量并发)。beforeunload 等关闭时机调它,即使异步被打断,
   * 已写的文件因原子写(A1)也是完整的,下次启动不丢。
   */
  flushPending(): Promise<void>;
}

function dataPath(dataDir: string, feature: string): string {
  return `${dataDir}/state/${feature}.json`;
}

/**
 * 读 JSON + .bak 损坏恢复(S012 根因 A2)。返回值归一化:
 * - ok / recovered → 取 value
 * - missing / corrupted → undefined(load 把 undefined 视为"该 feature 无数据")
 */
async function readPersistedValue(fileFacade: FileFacade, filePath: string): Promise<unknown | undefined> {
  const result = await readJsonWithBackup(fileFacade, filePath);
  if (result.status === 'ok' || result.status === 'recovered') return result.value;
  return undefined;
}

async function safeWriteJson(fileFacade: FileFacade, filePath: string, value: unknown): Promise<void> {
  try {
    await writeJsonWithBackup(fileFacade, filePath, value);
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
      const [frameData, connData, settingsData, storageHighspeedData, sendInstancesData, displayPrefsData] = await Promise.all([
        readPersistedValue(fileFacade, dataPath(dataDir, 'frames')),
        readPersistedValue(fileFacade, dataPath(dataDir, 'connections')),
        readPersistedValue(fileFacade, dataPath(dataDir, 'settings')),
        readPersistedValue(fileFacade, dataPath(dataDir, 'storage-highspeed')),
        readPersistedValue(fileFacade, dataPath(dataDir, 'send-instances')),
        readPersistedValue(fileFacade, dataPath(dataDir, 'display-preferences')),
      ]);

      return {
        frames: isFrameData(frameData) ? frameData as PersistedFeatureState['frames'] : undefined,
        connectionConfigs: isConnectionData(connData) ? (connData as { configs: readonly TransportConfig[] }).configs : undefined,
        settings: isSettingsData(settingsData) ? settingsData as Record<string, unknown> : undefined,
        storageHighspeed: isStorageHighspeedData(storageHighspeedData) ? storageHighspeedData as PersistedFeatureState['storageHighspeed'] : undefined,
        sendInstances: Array.isArray(sendInstancesData) ? sendInstancesData as readonly SendFrameInstance[] : undefined,
        displayPreferences: isDisplayPrefsData(displayPrefsData) ? displayPrefsData as PersistedFeatureState['displayPreferences'] : undefined,
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

    async saveDisplayPreferences(): Promise<void> {
      if (!sources.getDisplayPreferencesSnapshot) return;
      const prefs = sources.getDisplayPreferencesSnapshot();
      await safeWriteJson(fileFacade, dataPath(dataDir, 'display-preferences'), prefs);
    },

    async saveAll(): Promise<void> {
      await Promise.all([
        this.saveFrames(),
        this.saveConnections(),
        this.saveSettings(),
        this.saveStorageHighspeed(),
        this.saveSendInstances(),
        this.saveDisplayPreferences(),
      ]);
    },

    async flushPending(): Promise<void> {
      // 当前 saveAll 已是全量并发(不是 debounce 增量),flushPending 直接调它
      // 确保"所有最新快照落盘"。后续若引入 debounce 写队列,这里改为 flush 队列。
      await this.saveAll();
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

function isDisplayPrefsData(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createNoOpPersistence(): FeaturePersistence {
  return {
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
}
