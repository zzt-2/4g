import { describe, it, expect, vi } from 'vitest';
import {
  createReportConfigFileStorage,
  LazyReportConfigStorage,
} from '../services/report-config-file-storage';
import type { ReportConfig } from '../core/report-config';

/** 最小 file 抽象 fake:基于内存 store。ENOENT 用 message 含 'ENOENT' 判(json-storage isEnoent 兜底字符串)。 */
function mockFiles(store: Record<string, string> = {}) {
  return {
    readTextFile: vi.fn(async (path: string) => {
      if (store[path] === undefined) throw new Error('ENOENT: no such file');
      return store[path];
    }),
    writeTextFile: vi.fn(async (path: string, content: string) => {
      store[path] = content;
    }),
  };
}

const validConfig: ReportConfig = {
  templateId: 't',
  checkPoints: [{ id: 'i1', name: '载波同步', frameId: 'fA', fieldId: 'lock' }],
  statisticsItems: [],
  attachItems: [],
};

describe('createReportConfigFileStorage', () => {
  it('loadAll returns [] before hydrate', () => {
    const s = createReportConfigFileStorage(mockFiles({}), '/data');
    expect(s.loadAll()).toEqual([]);
  });

  it('getByTemplateId returns undefined before hydrate', () => {
    const s = createReportConfigFileStorage(mockFiles({}), '/data');
    expect(s.getByTemplateId('t')).toBeUndefined();
  });

  it('hydrate reads file into cache', async () => {
    const store = {
      '/data/state/report-configs.json': JSON.stringify({
        version: 1,
        configs: [validConfig],
      }),
    };
    const s = createReportConfigFileStorage(mockFiles(store), '/data');
    await s.hydrate();
    expect(s.loadAll()).toHaveLength(1);
    expect(s.loadAll()[0].templateId).toBe('t');
    expect(s.getByTemplateId('t')?.templateId).toBe('t');
  });

  it('saveAll updates cache synchronously and writes file', async () => {
    const files = mockFiles({});
    const s = createReportConfigFileStorage(files, '/data');
    s.saveAll([validConfig]);
    expect(s.loadAll()).toEqual([validConfig]); // 同步见
    await Promise.resolve(); // flush microtask(fire-and-forget write)
    expect(files.writeTextFile).toHaveBeenCalled();
    // 写的内容包含 version + configs
    const written = files.writeTextFile.mock.calls[0][1] as string;
    const parsed = JSON.parse(written);
    expect(parsed.version).toBe(1);
    expect(parsed.configs).toEqual([validConfig]);
  });

  it('hydrate creates empty when file missing', async () => {
    const s = createReportConfigFileStorage(mockFiles({}), '/data');
    await s.hydrate();
    expect(s.loadAll()).toEqual([]);
  });

  it('hydrate reports data loss on version-high schema', async () => {
    const onDataLoss = vi.fn();
    const store = {
      '/data/state/report-configs.json': JSON.stringify({ version: 999, configs: [] }),
    };
    const s = createReportConfigFileStorage(mockFiles(store), '/data', { onDataLoss });
    await s.hydrate();
    expect(s.loadAll()).toEqual([]);
    expect(onDataLoss).toHaveBeenCalledTimes(1);
  });

  it('hydrate reports data loss on malformed payload', async () => {
    const onDataLoss = vi.fn();
    const store = {
      '/data/state/report-configs.json': JSON.stringify({ version: 1, configs: 'not-array' }),
    };
    const s = createReportConfigFileStorage(mockFiles(store), '/data', { onDataLoss });
    await s.hydrate();
    expect(s.loadAll()).toEqual([]);
    expect(onDataLoss).toHaveBeenCalledTimes(1);
  });

  it('hydrate with seed skips file read', async () => {
    const files = mockFiles({}); // no file
    const s = createReportConfigFileStorage(files, '/data');
    await s.hydrate([validConfig]);
    expect(s.loadAll()).toEqual([validConfig]);
    expect(files.readTextFile).not.toHaveBeenCalled();
  });

  it('filters out malformed configs from file, keeps valid ones', async () => {
    const store = {
      '/data/state/report-configs.json': JSON.stringify({
        version: 1,
        configs: [
          validConfig,
          { templateId: 'bad', checkPoints: [{ id: 'x' }], statisticsItems: [], attachItems: [] }, // fieldId 缺
        ],
      }),
    };
    const s = createReportConfigFileStorage(mockFiles(store), '/data');
    await s.hydrate();
    expect(s.loadAll()).toHaveLength(1);
    expect(s.loadAll()[0].templateId).toBe('t');
  });
});

// 关键:LazyHolder 时序测试——这正是 S014/S017 漏掉的那条分支。
// S014(testCaseConfig) / S017(reportedSnapshotStorage) 都是"可选字段 + 单测手动传值 +
// runtime wiring 漏接 = 静默失败"。本 holder 必须显式测 hydrate 前(setDelegate 前)的行为。
describe('LazyReportConfigStorage (S014/S017 温床防护)', () => {
  it('returns [] / undefined before setDelegate (空壳阶段)', () => {
    const lazy = new LazyReportConfigStorage();
    expect(lazy.loadAll()).toEqual([]);
    expect(lazy.getByTemplateId('any')).toBeUndefined();
  });

  it('saveAll before setDelegate does not throw (丢弃,不崩)', () => {
    const lazy = new LazyReportConfigStorage();
    expect(() => lazy.saveAll([validConfig])).not.toThrow();
  });

  it('hydrate before setDelegate does not throw (no-op)', async () => {
    const lazy = new LazyReportConfigStorage();
    await expect(lazy.hydrate()).resolves.not.toThrow();
  });

  it('delegates to real storage after setDelegate', async () => {
    const store = {
      '/data/state/report-configs.json': JSON.stringify({
        version: 1,
        configs: [validConfig],
      }),
    };
    const real = createReportConfigFileStorage(mockFiles(store), '/data');
    await real.hydrate();
    const lazy = new LazyReportConfigStorage();
    lazy.setDelegate(real);
    expect(lazy.loadAll()).toHaveLength(1);
    expect(lazy.getByTemplateId('t')?.templateId).toBe('t');
  });

  it('saveAll after setDelegate writes through delegate', async () => {
    const files = mockFiles({});
    const real = createReportConfigFileStorage(files, '/data');
    const lazy = new LazyReportConfigStorage();
    lazy.setDelegate(real);
    lazy.saveAll([validConfig]);
    await Promise.resolve();
    expect(files.writeTextFile).toHaveBeenCalled();
  });
});
