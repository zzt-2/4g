import type { PersistedConfig } from '../composables/use-central-docking';
import type { DeviceInfoItem } from '@/features/northbound/core/types';
import type { CatalogMapping } from '../core/catalog-mapping';
import { readJsonWithBackup, writeJsonWithBackup, type JsonReadResult } from '@/shared/utils/json-storage';

/**
 * 中心对接数据文件持久化(S016)。
 *
 * 把对接配置 / 设备列表 / catalog 映射表从 localStorage 迁到文件(state/docking.json),
 * 走原子写 + .bak 损坏恢复,照 task-template-file-storage 同款范式。
 *
 * 3 份数据合写一个文件(单文件方案,强相关且量小):
 *   payload = { version, config, devices, catalogMappings }
 *
 * 同步读(内存缓存)+ 异步写(fire-and-forget):use-central-docking 在 setup 时同步要
 * 初始数据,bootstrap 必须先 hydrate 灌缓存,composable 再同步 loadXxx() 拿。
 *
 * 文件 missing 时从 localStorage 一次性迁移旧数据,迁完清 localStorage(跟 task 模板 S012 同套路)。
 * schema version 高于预期(未来回退)→ 不强行加载错格式,清空 + onDataLoss。
 * 损坏(主+备)→ onDataLoss 让用户感知(Quasar Notify)。
 */

const SCHEMA_VERSION = 1;

interface PersistedPayload {
  readonly version: number;
  readonly config: PersistedConfig | null;
  readonly devices: readonly DeviceInfoItem[];
  readonly catalogMappings: readonly CatalogMapping[];
}

export interface DockingFileStorageOptions {
  /** 损坏/schema 不匹配时回调,bootstrap 接 Quasar Notify 让用户感知。 */
  readonly onDataLoss?: (message: string) => void;
  /** localStorage 后端(用于一次性迁移)。生产用 globalThis.localStorage;测试可注入 fake。 */
  readonly localStorage?: LocalStorageBackend;
}

/** localStorage 最小抽象(便于测试注入 fake)。生产 = globalThis.localStorage。 */
export interface LocalStorageBackend {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

export interface FileAccess {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
}

export interface DockingFileStorage {
  /** 异步加载文件灌入内存缓存。bootstrap 在 use-central-docking 之前调。 */
  hydrate(): Promise<void>;
  loadConfig(): PersistedConfig | null;
  loadDevices(): DeviceInfoItem[];
  loadCatalogMappings(): CatalogMapping[];
  /** 同步更新缓存 + fire-and-forget 异步写文件。 */
  saveConfig(cfg: PersistedConfig): void;
  saveDevices(items: readonly DeviceInfoItem[]): void;
  saveCatalogMappings(items: readonly CatalogMapping[]): void;
}

/**
 * 延迟注入 holder(照 rewriteRuntime LazyPersistence 同款)。
 *
 * wireFeatures 同步初始化时无 fileFacade,先建空 delegate(loadXxx 返空/null、saveXxx 丢弃);
 * bootstrap 异步拿到 fileFacade + dataDir 后,创建真 storage + hydrate,再 setDelegate 注入。
 *
 * AppShell 保证 bootstrap ready resolve 前不渲染 router-view,所以 composable setup 时
 * delegate 一定已是真 storage(hydrate 完)。
 */
export class LazyDockingStorage implements DockingFileStorage {
  private delegate: DockingFileStorage = createEmptyDockingStorage();

  setDelegate(storage: DockingFileStorage): void {
    this.delegate = storage;
  }

  hydrate() { return this.delegate.hydrate(); }
  loadConfig() { return this.delegate.loadConfig(); }
  loadDevices() { return this.delegate.loadDevices(); }
  loadCatalogMappings() { return this.delegate.loadCatalogMappings(); }
  saveConfig(cfg: PersistedConfig) { this.delegate.saveConfig(cfg); }
  saveDevices(items: readonly DeviceInfoItem[]) { this.delegate.saveDevices(items); }
  saveCatalogMappings(items: readonly CatalogMapping[]) { this.delegate.saveCatalogMappings(items); }
}

/** 空 storage(wireFeatures 初始 delegate):loadXxx 返空/null,saveXxx 丢弃,hydrate no-op。 */
function createEmptyDockingStorage(): DockingFileStorage {
  return {
    async hydrate() { /* no-op */ },
    loadConfig: () => null,
    loadDevices: () => [],
    loadCatalogMappings: () => [],
    saveConfig: () => { /* discarded */ },
    saveDevices: () => { /* discarded */ },
    saveCatalogMappings: () => { /* discarded */ },
  };
}

// localStorage key(从 use-central-docking 迁移,迁移逻辑要保持一致)
const LEGACY_CONFIG_KEY = 'northbound-docking-config';
const LEGACY_DEVICES_KEY = 'northbound-docking-devices';
const LEGACY_MAPPINGS_KEY = 'northbound-docking-catalog-mappings';

export function createDockingFileStorage(
  files: FileAccess,
  dataDir: string,
  options: DockingFileStorageOptions = {},
): DockingFileStorage {
  const filePath = `${dataDir}/state/docking.json`;
  const onDataLoss = options.onDataLoss;
  const ls = options.localStorage ?? globalThis.localStorage ?? null;

  let configCache: PersistedConfig | null = null;
  let devicesCache: readonly DeviceInfoItem[] = [];
  let mappingsCache: readonly CatalogMapping[] = [];

  /** 解析 payload,严格校验 version + 三份数据形状。version 高于预期视为不可恢复。 */
  function parsePayload(value: unknown): { ok: true; payload: PersistedPayload } | { ok: false; reason: 'version-high' | 'malformed' } {
    if (value === null || typeof value !== 'object') return { ok: false, reason: 'malformed' };
    const p = value as Partial<PersistedPayload>;
    if (typeof p.version !== 'number') return { ok: false, reason: 'malformed' };
    if (p.version > SCHEMA_VERSION) return { ok: false, reason: 'version-high' };
    // config 允许 null(未配过对接);非 null 时必须是对象
    if (p.config !== null && p.config !== undefined && (typeof p.config !== 'object')) {
      return { ok: false, reason: 'malformed' };
    }
    if (p.devices !== undefined && !Array.isArray(p.devices)) return { ok: false, reason: 'malformed' };
    if (p.catalogMappings !== undefined && !Array.isArray(p.catalogMappings)) return { ok: false, reason: 'malformed' };
    return {
      ok: true,
      payload: {
        version: SCHEMA_VERSION,
        config: (p.config ?? null) as PersistedConfig | null,
        devices: (p.devices ?? []) as readonly DeviceInfoItem[],
        catalogMappings: (p.catalogMappings ?? []) as readonly CatalogMapping[],
      },
    };
  }

  function reportDataLoss(message: string): void {
    console.error(`[docking] data loss: ${message}`);
    onDataLoss?.(message);
  }

  function snapshot(): PersistedPayload {
    return {
      version: SCHEMA_VERSION,
      config: configCache,
      devices: devicesCache,
      catalogMappings: mappingsCache,
    };
  }

  async function writeToFile(): Promise<void> {
    try {
      await writeJsonWithBackup(files, filePath, snapshot());
    } catch (err) {
      console.error('[docking] file write failed:', err instanceof Error ? err.message : err);
    }
  }

  /** 从 localStorage 逐份读(任一损坏不影响其余),返回可用的迁移数据 + 是否有任一份非空。 */
  function readLegacy(): {
    config: PersistedConfig | null;
    devices: readonly DeviceInfoItem[];
    mappings: readonly CatalogMapping[];
    anyNonEmpty: boolean;
  } {
    let config: PersistedConfig | null = null;
    let devices: readonly DeviceInfoItem[] = [];
    let mappings: readonly CatalogMapping[] = [];
    let anyNonEmpty = false;

    if (ls) {
      // config:JSON 对象,parse 失败当 null(不迁这份)
      const rawConfig = ls.getItem(LEGACY_CONFIG_KEY);
      if (rawConfig) {
        try {
          const parsed = JSON.parse(rawConfig) as unknown;
          if (parsed !== null && typeof parsed === 'object') {
            config = parsed as PersistedConfig;
            anyNonEmpty = true;
          } else {
            console.warn('[docking] legacy config malformed, skip migrate');
          }
        } catch {
          console.warn('[docking] legacy config parse failed, skip migrate');
        }
      }
      // devices:JSON 数组,parse 失败当空
      const rawDevices = ls.getItem(LEGACY_DEVICES_KEY);
      if (rawDevices) {
        try {
          const parsed = JSON.parse(rawDevices) as unknown;
          if (Array.isArray(parsed)) {
            devices = parsed as readonly DeviceInfoItem[];
            anyNonEmpty = true;
          } else {
            console.warn('[docking] legacy devices malformed, skip migrate');
          }
        } catch {
          console.warn('[docking] legacy devices parse failed, skip migrate');
        }
      }
      // mappings:JSON 数组
      const rawMappings = ls.getItem(LEGACY_MAPPINGS_KEY);
      if (rawMappings) {
        try {
          const parsed = JSON.parse(rawMappings) as unknown;
          if (Array.isArray(parsed)) {
            mappings = parsed as readonly CatalogMapping[];
            anyNonEmpty = true;
          } else {
            console.warn('[docking] legacy mappings malformed, skip migrate');
          }
        } catch {
          console.warn('[docking] legacy mappings parse failed, skip migrate');
        }
      }
    }

    return { config, devices, mappings, anyNonEmpty };
  }

  return {
    async hydrate(): Promise<void> {
      const result: JsonReadResult = await readJsonWithBackup(files, filePath);

      if (result.status === 'ok' || result.status === 'recovered') {
        // recovered = 主文件损坏但 bak 救回。数据虽没丢,但发生了损坏事件,仍通知用户。
        if (result.status === 'recovered') {
          onDataLoss?.('docking.json 主文件损坏,已从备份恢复');
        }
        const parsed = parsePayload(result.value);
        if (parsed.ok) {
          configCache = parsed.payload.config;
          devicesCache = parsed.payload.devices;
          mappingsCache = parsed.payload.catalogMappings;
          return;
        }
        if (parsed.reason === 'version-high') {
          reportDataLoss(`docking.json schema version 高于预期(${SCHEMA_VERSION}),已重置为空`);
        } else {
          reportDataLoss('docking.json 数据格式异常,已重置为空');
        }
        configCache = null;
        devicesCache = [];
        mappingsCache = [];
        return;
      }

      // missing / corrupted(主+备都坏):corrupted 已在 readJsonWithBackup 内 console.error。
      if (result.status === 'corrupted') {
        reportDataLoss('docking.json 主+备均损坏,对接数据丢失');
      }

      // 文件不存在(或损坏后无数据):尝试从 localStorage 迁移旧数据(一次性)。
      const legacy = readLegacy();
      if (legacy.anyNonEmpty) {
        configCache = legacy.config;
        devicesCache = legacy.devices;
        mappingsCache = legacy.mappings;
        await writeToFile();
        // 迁移成功(文件已写)才清 localStorage,避免"清了没写成"丢数据
        if (ls) {
          ls.removeItem(LEGACY_CONFIG_KEY);
          ls.removeItem(LEGACY_DEVICES_KEY);
          ls.removeItem(LEGACY_MAPPINGS_KEY);
        }
        console.info('[docking] migrated legacy localStorage data to file');
        return;
      }

      configCache = null;
      devicesCache = [];
      mappingsCache = [];
    },

    loadConfig() {
      return configCache ? { ...configCache } : null;
    },

    loadDevices() {
      return [...devicesCache];
    },

    loadCatalogMappings() {
      return [...mappingsCache];
    },

    saveConfig(cfg) {
      configCache = { ...cfg };
      void writeToFile();
    },

    saveDevices(items) {
      devicesCache = [...items];
      void writeToFile();
    },

    saveCatalogMappings(items) {
      mappingsCache = [...items];
      void writeToFile();
    },
  };
}
