import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDockingFileStorage } from '../services/docking-file-storage';
import type { PersistedConfig } from '../composables/use-central-docking';
import type { DeviceInfoItem } from '@/features/northbound/core/types';
import type { CatalogMapping } from '../core/catalog-mapping';

/**
 * 中心对接数据文件持久化(S016)。
 * 把对接配置 / 设备列表 / catalog 映射表从 localStorage 迁到文件(state/docking.json),
 * 走原子写 + .bak 损坏恢复,照 task-template-file-storage 同款范式。
 *
 * 3 份数据合写一个文件(单文件方案),payload = { version, config, devices, catalogMappings }。
 * 同步读(内存缓存)+ 异步写(fire-and-forget)。
 */
function makeConfig(overrides: Partial<PersistedConfig> = {}): PersistedConfig {
  return {
    serverHost: '0.0.0.0',
    serverPort: 5001,
    customerBaseUrl: 'http://ip/partner-api/',
    subSysType: 'laser',
    subSysId: 'JG',
    loginUrl: 'http://ip/partner-api/auth/partner/login',
    clientId: 'cid',
    username: 'subsys',
    password: 'secret',
    grantType: 'partner',
    tenantId: '000000',
    ftpHost: '10.0.0.1',
    ftpPort: 21,
    ftpUsername: 'ftp',
    ftpPassword: 'ftppw',
    ftpBasePath: '/laser',
    ...overrides,
  };
}

function makeDevice(overrides: Partial<DeviceInfoItem> = {}): DeviceInfoItem {
  return {
    name: '激光通信终端',
    deviceId: 'JG_LCT_01',
    type: 'LCT',
    ip: '192.168.1.100',
    swVer: 'V1.0.0',
    status: 'online',
    pars: [],
    ...overrides,
  };
}

function makeMapping(overrides: Partial<CatalogMapping> = {}): CatalogMapping {
  return {
    templateId: 'tpl-1',
    enabled: true,
    overridablePaths: [],
    ...overrides,
  };
}

interface FakeFileAccess {
  store: Map<string, string>;
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
}

function makeFakeFiles(initial: Record<string, string> = {}): FakeFileAccess {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    async readTextFile(p: string) {
      if (!store.has(p)) {
        const err = new Error(`ENOENT: ${p}`) as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      }
      return store.get(p)!;
    },
    async writeTextFile(p: string, c: string) {
      store.set(p, c);
    },
  };
}

const STORAGE_PATH = '/data/state/docking.json';

/** 文件后端 saveXxx 用 setTimeout 异步写,flush 它让测试断言文件已落盘。 */
function flushAsyncWrites(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// --- localStorage polyfill(测试环境无 localStorage) ---

interface LocalStorageLike {
  store: Map<string, string>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function makeFakeLocalStorage(initial: Record<string, string> = {}): LocalStorageLike {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => { store.set(k, v); },
    removeItem: (k) => { store.delete(k); },
  };
}

describe('createDockingFileStorage - hydrate 文件正常', () => {
  it('文件正常 → loadXxx 返回文件数据', async () => {
    const files = makeFakeFiles({
      [STORAGE_PATH]: JSON.stringify({
        version: 1,
        config: makeConfig({ serverHost: '1.2.3.4' }),
        devices: [makeDevice({ deviceId: 'D2' })],
        catalogMappings: [makeMapping({ templateId: 'tpl-file' })],
      }),
    });
    const storage = createDockingFileStorage(files, '/data', {
      localStorage: makeFakeLocalStorage(),
    });

    await storage.hydrate();

    expect(storage.loadConfig()?.serverHost).toBe('1.2.3.4');
    expect(storage.loadDevices()[0]!.deviceId).toBe('D2');
    expect(storage.loadCatalogMappings()[0]!.templateId).toBe('tpl-file');
  });

  it('未 hydrate 时 loadXxx 返回空(config null / 数组空)', () => {
    const files = makeFakeFiles();
    const storage = createDockingFileStorage(files, '/data', {
      localStorage: makeFakeLocalStorage(),
    });

    expect(storage.loadConfig()).toBeNull();
    expect(storage.loadDevices()).toEqual([]);
    expect(storage.loadCatalogMappings()).toEqual([]);
  });
});

describe('createDockingFileStorage - hydrate 文件 missing + localStorage 迁移', () => {
  beforeEach(() => {
    // 清全局(防跨用例污染)
    try { (globalThis as { localStorage?: unknown }).localStorage = undefined; } catch { /* noop */ }
  });

  it('文件 missing + localStorage 有旧数据 → 迁移到文件 + 清 localStorage', async () => {
    const files = makeFakeFiles();
    const ls = makeFakeLocalStorage({
      'northbound-docking-config': JSON.stringify(makeConfig({ subSysId: 'LEGACY' })),
      'northbound-docking-devices': JSON.stringify([makeDevice({ deviceId: 'LEGACY_DEV' })]),
      'northbound-docking-catalog-mappings': JSON.stringify([makeMapping({ templateId: 'tpl-legacy' })]),
    });
    const storage = createDockingFileStorage(files, '/data', { localStorage: ls });

    await storage.hydrate();

    expect(storage.loadConfig()?.subSysId).toBe('LEGACY');
    expect(storage.loadDevices()[0]!.deviceId).toBe('LEGACY_DEV');
    expect(storage.loadCatalogMappings()[0]!.templateId).toBe('tpl-legacy');
    await flushAsyncWrites();
    expect(files.store.has(STORAGE_PATH)).toBe(true);
    // 迁移成功后清 localStorage(避免双 source of truth)
    expect(ls.getItem('northbound-docking-config')).toBeNull();
    expect(ls.getItem('northbound-docking-devices')).toBeNull();
    expect(ls.getItem('northbound-docking-catalog-mappings')).toBeNull();
  });

  it('文件 missing + localStorage 全空 → 空缓存(不迁)', async () => {
    const files = makeFakeFiles();
    const ls = makeFakeLocalStorage();
    const storage = createDockingFileStorage(files, '/data', { localStorage: ls });

    await storage.hydrate();

    expect(storage.loadConfig()).toBeNull();
    expect(storage.loadDevices()).toEqual([]);
    expect(storage.loadCatalogMappings()).toEqual([]);
    await flushAsyncWrites();
    // 全空不写文件
    expect(files.store.has(STORAGE_PATH)).toBe(false);
  });

  it('文件 missing + localStorage 某 key 损坏 → 不影响其他 key 迁移', async () => {
    const files = makeFakeFiles();
    const ls = makeFakeLocalStorage({
      'northbound-docking-config': '{CORRUPT', // 这份坏
      'northbound-docking-devices': JSON.stringify([makeDevice({ deviceId: 'OK_DEV' })]),
      'northbound-docking-catalog-mappings': JSON.stringify([makeMapping({ templateId: 'tpl-ok' })]),
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = createDockingFileStorage(files, '/data', { localStorage: ls });

    await storage.hydrate();

    // 坏的那份当空,其余两份正常迁
    expect(storage.loadConfig()).toBeNull();
    expect(storage.loadDevices()[0]!.deviceId).toBe('OK_DEV');
    expect(storage.loadCatalogMappings()[0]!.templateId).toBe('tpl-ok');
    warnSpy.mockRestore();
  });

  it('文件已存在 + localStorage 有旧数据 → 不迁移(文件优先)', async () => {
    const files = makeFakeFiles({
      [STORAGE_PATH]: JSON.stringify({
        version: 1,
        config: makeConfig({ subSysId: 'FILE_WINS' }),
        devices: [],
        catalogMappings: [],
      }),
    });
    const ls = makeFakeLocalStorage({
      'northbound-docking-config': JSON.stringify(makeConfig({ subSysId: 'LEGACY' })),
    });
    const storage = createDockingFileStorage(files, '/data', { localStorage: ls });

    await storage.hydrate();

    expect(storage.loadConfig()?.subSysId).toBe('FILE_WINS');
    // 文件存在时 localStorage 不动(不读不迁不清)
    expect(ls.getItem('northbound-docking-config')).not.toBeNull();
  });
});

describe('createDockingFileStorage - hydrate 损坏恢复', () => {
  it('主文件损坏 + bak 完整 → recovered + onDataLoss 通知', async () => {
    const files = makeFakeFiles({
      [STORAGE_PATH]: '{CORRUPT',
      [`${STORAGE_PATH}.bak`]: JSON.stringify({
        version: 1,
        config: makeConfig({ subSysId: 'FROM_BAK' }),
        devices: [],
        catalogMappings: [],
      }),
    });
    const onLoss = vi.fn();
    const storage = createDockingFileStorage(files, '/data', {
      localStorage: makeFakeLocalStorage(),
      onDataLoss: onLoss,
    });

    await storage.hydrate();

    expect(storage.loadConfig()?.subSysId).toBe('FROM_BAK');
    expect(onLoss).toHaveBeenCalled();
  });

  it('主+备都损坏 → onDataLoss + 缓存空', async () => {
    const files = makeFakeFiles({
      [STORAGE_PATH]: '{CORRUPT',
      [`${STORAGE_PATH}.bak`]: '{ALSO BAD',
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onLoss = vi.fn();
    const storage = createDockingFileStorage(files, '/data', {
      localStorage: makeFakeLocalStorage(),
      onDataLoss: onLoss,
    });

    await storage.hydrate();

    expect(storage.loadConfig()).toBeNull();
    expect(storage.loadDevices()).toEqual([]);
    expect(storage.loadCatalogMappings()).toEqual([]);
    expect(onLoss).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('schema version 高于预期 → onDataLoss + 清空', async () => {
    const files = makeFakeFiles({
      [STORAGE_PATH]: JSON.stringify({
        version: 99,
        config: makeConfig(),
        devices: [],
        catalogMappings: [],
      }),
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onLoss = vi.fn();
    const storage = createDockingFileStorage(files, '/data', {
      localStorage: makeFakeLocalStorage(),
      onDataLoss: onLoss,
    });

    await storage.hydrate();

    expect(storage.loadConfig()).toBeNull();
    expect(onLoss).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('createDockingFileStorage - saveXxx 写文件', () => {
  it('saveConfig → 缓存即时更新 + 文件写入', async () => {
    const files = makeFakeFiles();
    const storage = createDockingFileStorage(files, '/data', {
      localStorage: makeFakeLocalStorage(),
    });
    await storage.hydrate();

    storage.saveConfig(makeConfig({ serverHost: '9.9.9.9' }));

    // 同步:缓存即时更新
    expect(storage.loadConfig()?.serverHost).toBe('9.9.9.9');
    await flushAsyncWrites();
    const raw = files.store.get(STORAGE_PATH);
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed.version).toBe(1);
    expect(parsed.config.serverHost).toBe('9.9.9.9');
  });

  it('saveDevices → 缓存即时更新 + 文件写入', async () => {
    const files = makeFakeFiles();
    const storage = createDockingFileStorage(files, '/data', {
      localStorage: makeFakeLocalStorage(),
    });
    await storage.hydrate();

    storage.saveDevices([makeDevice({ deviceId: 'NEW' })]);

    expect(storage.loadDevices()[0]!.deviceId).toBe('NEW');
    await flushAsyncWrites();
    const parsed = JSON.parse(files.store.get(STORAGE_PATH)!);
    expect(parsed.devices.length).toBe(1);
    expect(parsed.devices[0].deviceId).toBe('NEW');
  });

  it('saveCatalogMappings → 缓存即时更新 + 文件写入', async () => {
    const files = makeFakeFiles();
    const storage = createDockingFileStorage(files, '/data', {
      localStorage: makeFakeLocalStorage(),
    });
    await storage.hydrate();

    storage.saveCatalogMappings([makeMapping({ templateId: 'tpl-new' })]);

    expect(storage.loadCatalogMappings()[0]!.templateId).toBe('tpl-new');
    await flushAsyncWrites();
    const parsed = JSON.parse(files.store.get(STORAGE_PATH)!);
    expect(parsed.catalogMappings.length).toBe(1);
    expect(parsed.catalogMappings[0].templateId).toBe('tpl-new');
  });
});
