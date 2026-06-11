import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { FileFacade } from '@/platform';
import {
  createFeaturePersistence,
  createNoOpPersistence,
  type PersistenceStateSources,
} from '@/runtime/persistence';
import { LazyPersistence } from '@/app/rewriteRuntime';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockFileFacade(files: Record<string, string | Error>): FileFacade {
  return {
    readTextFile: vi.fn(async (path: string) => {
      const val = files[path];
      if (val === undefined) {
        const err = new Error('ENOENT: no such file');
        (err as unknown as { code: string }).code = 'ENOENT';
        throw err;
      }
      if (val instanceof Error) throw val;
      return val;
    }),
    writeTextFile: vi.fn(async () => {}),
    showSaveDialog: vi.fn(async () => null),
    showOpenDialog: vi.fn(async () => null),
    getUserDataPath: vi.fn(async () => '/test/data'),
  };
}

function defaultSources(overrides?: Partial<PersistenceStateSources>): PersistenceStateSources {
  return {
    getFrameSnapshot: () => ({ frames: [], selectedFrameId: undefined }),
    getConnectionConfigs: () => [],
    getSettingsSnapshot: () => ({}),
    getSendInstancesSnapshot: () => [],
    getDisplayPreferencesSnapshot: () => ({ groups: [], table1: { displayMode: 'table', selectedGroupId: '', selectedItems: [] }, table2: { displayMode: 'table', selectedGroupId: '', selectedItems: [] }, charts: [], scatter: { iSource: { groupId: '', dataItemId: '' }, qSource: { groupId: '', dataItemId: '' }, sampleCount: 256, bitWidth: 8, refreshIntervalMs: 100 }, refreshCadenceMs: 500 } as Record<string, unknown>),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// T007-1: NoOp persistence
// ---------------------------------------------------------------------------

describe('T007: Persistence startup recovery', () => {
  describe('createNoOpPersistence', () => {
    it('load returns empty object', async () => {
      const noOp = createNoOpPersistence();
      const state = await noOp.load();
      expect(state).toEqual({});
    });

    it('saveFrames does not throw', async () => {
      const noOp = createNoOpPersistence();
      await expect(noOp.saveFrames()).resolves.toBeUndefined();
    });

    it('saveConnections does not throw', async () => {
      const noOp = createNoOpPersistence();
      await expect(noOp.saveConnections()).resolves.toBeUndefined();
    });

    it('saveSettings does not throw', async () => {
      const noOp = createNoOpPersistence();
      await expect(noOp.saveSettings()).resolves.toBeUndefined();
    });

    it('saveAll does not throw', async () => {
      const noOp = createNoOpPersistence();
      await expect(noOp.saveAll()).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // LazyPersistence pattern (inlined — class not exported)
  // -------------------------------------------------------------------------

  describe('LazyPersistence pattern', () => {
    it('before setDelegate: load returns empty object', async () => {
      const lazy = new LazyPersistence();
      const result = await lazy.load();
      expect(result).toEqual({});
    });

    it('before setDelegate: save methods do not throw', async () => {
      const lazy = new LazyPersistence();
      await expect(lazy.saveFrames()).resolves.toBeUndefined();
      await expect(lazy.saveConnections()).resolves.toBeUndefined();
      await expect(lazy.saveSettings()).resolves.toBeUndefined();
      await expect(lazy.saveAll()).resolves.toBeUndefined();
    });

    it('after setDelegate: delegates to real persistence', async () => {
      const lazy = new LazyPersistence();
      const fakeFacade = createMockFileFacade({
        '/test/data/state/frames.json': JSON.stringify({ frames: [{ id: 'f1' }], selectedFrameId: 'f1' }),
        '/test/data/state/connections.json': JSON.stringify({ configs: [{ id: 'c1', kind: 'serial' }] }),
        '/test/data/state/settings.json': JSON.stringify({ theme: 'dark' }),
      });
      const real = createFeaturePersistence(fakeFacade, '/test/data', defaultSources());
      lazy.setDelegate(real);

      const state = await lazy.load();
      expect(state.frames).toBeDefined();
      expect(state.frames!.frames).toHaveLength(1);
      expect(state.frames!.selectedFrameId).toBe('f1');
      expect(state.connectionConfigs).toBeDefined();
      expect(state.connectionConfigs).toHaveLength(1);
      expect(state.settings).toBeDefined();
      expect((state.settings as Record<string, unknown>).theme).toBe('dark');
    });
  });

  // -------------------------------------------------------------------------
  // createFeaturePersistence: load scenarios
  // -------------------------------------------------------------------------

  describe('createFeaturePersistence: load', () => {
    it('with frames data: returns parsed frames', async () => {
      const framesData = { frames: [{ id: 'frame-1', name: 'TestFrame' }], selectedFrameId: 'frame-1' };
      const facade = createMockFileFacade({
        '/data/state/frames.json': JSON.stringify(framesData),
      });
      const persistence = createFeaturePersistence(facade, '/data', defaultSources());
      const state = await persistence.load();

      expect(state.frames).toBeDefined();
      expect(state.frames!.frames).toHaveLength(1);
      expect((state.frames!.frames as Record<string, unknown>[])[0].id).toBe('frame-1');
      expect(state.frames!.selectedFrameId).toBe('frame-1');
    });

    it('with no files (ENOENT): returns empty object without crashing', async () => {
      const facade = createMockFileFacade({});
      const persistence = createFeaturePersistence(facade, '/data', defaultSources());
      const state = await persistence.load();

      expect(state.frames).toBeUndefined();
      expect(state.connectionConfigs).toBeUndefined();
      expect(state.settings).toBeUndefined();
    });

    it('with corrupted JSON: returns empty for that feature', async () => {
      const facade = createMockFileFacade({
        '/data/state/frames.json': '{invalid json###',
        '/data/state/connections.json': JSON.stringify({ configs: [] }),
      });
      const persistence = createFeaturePersistence(facade, '/data', defaultSources());
      const state = await persistence.load();

      // Corrupted frames → undefined (not a valid frame object)
      expect(state.frames).toBeUndefined();
      // Valid connections data parsed correctly
      expect(state.connectionConfigs).toBeDefined();
      expect(state.connectionConfigs).toHaveLength(0);
    });

    it('concurrent load: three files read concurrently, one fails — other two succeed', async () => {
      const facade = createMockFileFacade({
        '/data/state/frames.json': JSON.stringify({ frames: [{ id: 'f1' }] }),
        '/data/state/settings.json': JSON.stringify({ key: 'value' }),
        // connections.json intentionally missing → ENOENT
      });
      const persistence = createFeaturePersistence(facade, '/data', defaultSources());
      const state = await persistence.load();

      expect(state.frames).toBeDefined();
      expect(state.frames!.frames).toHaveLength(1);
      expect(state.settings).toBeDefined();
      // connections missing → undefined
      expect(state.connectionConfigs).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // createFeaturePersistence: save scenarios
  // ---------------------------------------------------------------------------

  describe('createFeaturePersistence: save', () => {
    it('saveFrames calls getFrameSnapshot and writes correct JSON', async () => {
      const facade = createMockFileFacade({});
      const snapshot = { frames: [{ id: 'f1' } as Record<string, unknown>], selectedFrameId: 'f1' };
      const sources = defaultSources({
        getFrameSnapshot: () => snapshot,
      });
      const persistence = createFeaturePersistence(facade, '/data', sources);

      await persistence.saveFrames();

      expect(facade.writeTextFile).toHaveBeenCalledTimes(1);
      const [path, content] = (facade.writeTextFile as Mock).mock.calls[0] as [string, string];
      expect(path).toBe('/data/state/frames.json');
      const parsed = JSON.parse(content);
      expect(parsed.frames).toHaveLength(1);
      expect(parsed.selectedFrameId).toBe('f1');
    });

    it('saveConnections calls getConnectionConfigs and writes correct JSON', async () => {
      const facade = createMockFileFacade({});
      const configs = [{ id: 'c1', kind: 'serial' } as Record<string, unknown>];
      const sources = defaultSources({
        getConnectionConfigs: () => configs,
      });
      const persistence = createFeaturePersistence(facade, '/data', sources);

      await persistence.saveConnections();

      expect(facade.writeTextFile).toHaveBeenCalledTimes(1);
      const [path, content] = (facade.writeTextFile as Mock).mock.calls[0] as [string, string];
      expect(path).toBe('/data/state/connections.json');
      const parsed = JSON.parse(content);
      expect(parsed.configs).toHaveLength(1);
    });

    it('saveAll writes all files', async () => {
      const facade = createMockFileFacade({});
      const sources = defaultSources({
        getFrameSnapshot: () => ({ frames: [] }),
        getConnectionConfigs: () => [],
        getSettingsSnapshot: () => ({ key: 'val' }),
      });
      const persistence = createFeaturePersistence(facade, '/data', sources);

      await persistence.saveAll();

      const paths = (facade.writeTextFile as Mock).mock.calls.map((c: [string, ...unknown[]]) => c[0]);
      expect(paths).toContain('/data/state/frames.json');
      expect(paths).toContain('/data/state/connections.json');
      expect(paths).toContain('/data/state/settings.json');
      expect(paths).toContain('/data/state/send-instances.json');
      expect(paths).toContain('/data/state/display-preferences.json');
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('load with connection configs only', async () => {
      const facade = createMockFileFacade({
        '/data/state/connections.json': JSON.stringify({ configs: [{ id: 'c1', kind: 'tcp-client' }] }),
      });
      const persistence = createFeaturePersistence(facade, '/data', defaultSources());
      const state = await persistence.load();

      expect(state.frames).toBeUndefined();
      expect(state.connectionConfigs).toHaveLength(1);
      expect((state.connectionConfigs as Record<string, unknown>[])[0].kind).toBe('tcp-client');
    });

    it('load with settings only', async () => {
      const facade = createMockFileFacade({
        '/data/state/settings.json': JSON.stringify({ theme: 'light', fontSize: 14 }),
      });
      const persistence = createFeaturePersistence(facade, '/data', defaultSources());
      const state = await persistence.load();

      expect(state.frames).toBeUndefined();
      expect(state.connectionConfigs).toBeUndefined();
      expect(state.settings).toEqual({ theme: 'light', fontSize: 14 });
    });

    it('frames data without frames array is treated as invalid', async () => {
      const facade = createMockFileFacade({
        '/data/state/frames.json': JSON.stringify({ notFrames: true }),
      });
      const persistence = createFeaturePersistence(facade, '/data', defaultSources());
      const state = await persistence.load();

      expect(state.frames).toBeUndefined();
    });

    it('connections data without configs array is treated as invalid', async () => {
      const facade = createMockFileFacade({
        '/data/state/connections.json': JSON.stringify({ notConfigs: true }),
      });
      const persistence = createFeaturePersistence(facade, '/data', defaultSources());
      const state = await persistence.load();

      expect(state.connectionConfigs).toBeUndefined();
    });

    it('settings with any non-null object is valid', async () => {
      const facade = createMockFileFacade({
        '/data/state/settings.json': JSON.stringify({}),
      });
      const persistence = createFeaturePersistence(facade, '/data', defaultSources());
      const state = await persistence.load();

      expect(state.settings).toEqual({});
    });

    it('settings with null value is treated as invalid', async () => {
      const facade = createMockFileFacade({
        '/data/state/settings.json': 'null',
      });
      const persistence = createFeaturePersistence(facade, '/data', defaultSources());
      const state = await persistence.load();

      expect(state.settings).toBeUndefined();
    });
  });
});
