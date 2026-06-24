import { describe, it, expect, vi } from 'vitest';
import {
  createFeaturePersistence,
  createNoOpPersistence,
  type FeaturePersistence,
} from '../persistence';
import type { FileFacade } from '@/platform';
import type { FrameAsset } from '@/features/frame';
import type { TransportConfig } from '@/features/connection';

/**
 * persistence 层损坏恢复 + flushPending 测试(S012 根因 A2/A3)。
 * 用内存 fake fileFacade,模拟"主文件损坏 + bak 完整 → 恢复"。
 */
function makeMemoryFileFacade(initial: Record<string, string> = {}): FileFacade & {
  store: Map<string, string>;
} {
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
      // 用真实原子写模拟(.bak 在 writeJsonWithBackup 里调 readTextFile+writeTextFile)
      store.set(p, c);
    },
    async showSaveDialog() { return null; },
    async showOpenDialog() { return null; },
    async getUserDataPath() { return '/data'; },
  };
}

const fakeSources = {
  getFrameSnapshot: () => ({ frames: [] as FrameAsset[] }),
  getConnectionConfigs: () => [] as readonly TransportConfig[],
  getSettingsSnapshot: () => ({}) as Record<string, unknown>,
  getStorageHighspeedSnapshot: () => ({ config: null, rule: null }),
  getSendInstancesSnapshot: () => [],
  getDisplayPreferencesSnapshot: () => ({}) as never,
};

describe('createFeaturePersistence - corruption recovery via .bak', () => {
  it('主 frames 文件损坏 + frames.bak 完整 → load 恢复 bak 数据,不丢', async () => {
    const dataDir = '/data';
    const facade = makeMemoryFileFacade({
      [`${dataDir}/state/frames.json`]: '{CORRUPT',
      [`${dataDir}/state/frames.json.bak`]: JSON.stringify({ frames: [{ id: 'recovered' } as unknown as FrameAsset] }),
    });
    const p = createFeaturePersistence(facade, dataDir, fakeSources);

    const state = await p.load();

    expect(state.frames).toBeDefined();
    expect(state.frames!.frames.length).toBe(1);
  });

  it('主+备都损坏 → load 返回 undefined + 显眼 CORRUPTED 日志(不静默)', async () => {
    const dataDir = '/data';
    const facade = makeMemoryFileFacade({
      [`${dataDir}/state/frames.json`]: '{CORRUPT',
      [`${dataDir}/state/frames.json.bak`]: '{ALSO BAD',
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = createFeaturePersistence(facade, dataDir, fakeSources);

    const state = await p.load();

    expect(state.frames).toBeUndefined();
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join(' ');
    expect(logged).toContain('CORRUPTED');
    errorSpy.mockRestore();
  });

  it('saveXxx 写前把上次主文件备份到 .bak', async () => {
    const dataDir = '/data';
    const framesPath = `${dataDir}/state/frames.json`;
    const facade = makeMemoryFileFacade({
      [framesPath]: JSON.stringify({ frames: [{ id: 'old' } as unknown as FrameAsset] }),
    });
    const sources = {
      ...fakeSources,
      getFrameSnapshot: () => ({ frames: [{ id: 'new' } as unknown as FrameAsset] }),
    };
    const p = createFeaturePersistence(facade, dataDir, sources);

    await p.saveFrames();

    expect(facade.store.get(framesPath)).toContain('"new"');
    expect(facade.store.get(`${framesPath}.bak`)).toContain('"old"');
  });
});

describe('FeaturePersistence.flushPending', () => {
  it('createFeaturePersistence 暴露 flushPending,调它等价于 saveAll 全量落盘', async () => {
    const dataDir = '/data';
    const framesPath = `${dataDir}/state/frames.json`;
    const facade = makeMemoryFileFacade({});
    const sources = {
      ...fakeSources,
      getFrameSnapshot: () => ({ frames: [{ id: 'a' } as unknown as FrameAsset] }),
    };
    const p = createFeaturePersistence(facade, dataDir, sources);

    await p.flushPending();

    expect(facade.store.has(framesPath)).toBe(true);
  });

  it('createNoOpPersistence 也暴露 flushPending(no-op 不抛错)', async () => {
    const noop: FeaturePersistence = createNoOpPersistence();
    await expect(noop.flushPending()).resolves.toBeUndefined();
  });
});
