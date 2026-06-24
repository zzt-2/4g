import { describe, it, expect, vi } from 'vitest';
import { createTaskTemplateFileStorage } from '../services/task-template-file-storage';
import type { TaskTemplate } from '../core';
import { timedTaskDef } from '../fixtures/task-fixtures';

/**
 * 任务模板文件持久化(S012 根因 D)。
 * 替代 localStorage 后端:存 state/task-templates.json,走原子写 + .bak 恢复。
 * 保持 TaskTemplateStorage 同步接口(loadAll/saveAll),内部用内存缓存 +
 * bootstrap 异步 hydrate 灌入 + saveAll fire-and-forget 异步写文件。
 */
function makeTemplate(overrides: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    templateId: 'tpl-1',
    name: 'TPL',
    tags: ['smoke'],
    definition: timedTaskDef(),
    createdAt: '2026-06-11T00:00:00.000Z',
    updatedAt: '2026-06-11T00:00:00.000Z',
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

const STORAGE_PATH = '/data/state/task-templates.json';

describe('createTaskTemplateFileStorage - hydrate + loadAll', () => {
  it('未 hydrate 时 loadAll 返回空(createTaskService 同步初始化用)', () => {
    const files = makeFakeFiles();
    const storage = createTaskTemplateFileStorage(files, '/data');

    expect(storage.loadAll()).toEqual([]);
  });

  it('hydrate 后 loadAll 返回灌入的模板', async () => {
    const files = makeFakeFiles();
    const storage = createTaskTemplateFileStorage(files, '/data');
    const templates = [makeTemplate(), makeTemplate({ templateId: 'tpl-2' })];

    await storage.hydrate(templates);

    const loaded = storage.loadAll();
    expect(loaded.length).toBe(2);
    expect(loaded[0]!.templateId).toBe('tpl-1');
  });
});

describe('createTaskTemplateFileStorage - saveAll 写文件', () => {
  it('saveAll 把模板序列化写入文件(含 version)', async () => {
    const files = makeFakeFiles();
    const storage = createTaskTemplateFileStorage(files, '/data');

    storage.saveAll([makeTemplate()]);
    await flushAsyncWrites();

    const raw = files.store.get(STORAGE_PATH);
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed.version).toBe(1);
    expect(parsed.templates.length).toBe(1);
  });

  it('saveAll 同步更新内存缓存(loadAll 立即可见)', () => {
    const files = makeFakeFiles();
    const storage = createTaskTemplateFileStorage(files, '/data');

    storage.saveAll([makeTemplate({ templateId: 'immediate' })]);

    expect(storage.loadAll()[0]!.templateId).toBe('immediate');
  });
});

describe('createTaskTemplateFileStorage - hydrate 损坏恢复', () => {
  it('文件损坏 + bak 完整 → hydrate 恢复 bak + 调 onDataLoss 通知', async () => {
    const files = makeFakeFiles({
      [STORAGE_PATH]: '{CORRUPT',
      [`${STORAGE_PATH}.bak`]: JSON.stringify({ version: 1, templates: [makeTemplate({ templateId: 'saved' })] }),
    });
    const onLoss = vi.fn();
    const storage = createTaskTemplateFileStorage(files, '/data', { onDataLoss: onLoss });

    await storage.hydrate();

    expect(storage.loadAll()[0]!.templateId).toBe('saved');
    expect(onLoss).toHaveBeenCalled();
  });

  it('文件+bak 都损坏 → hydrate 空 + 调 onDataLoss(用户可感知丢失)', async () => {
    const files = makeFakeFiles({
      [STORAGE_PATH]: '{CORRUPT',
      [`${STORAGE_PATH}.bak`]: '{ALSO BAD',
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onLoss = vi.fn();
    const storage = createTaskTemplateFileStorage(files, '/data', { onDataLoss: onLoss });

    await storage.hydrate();

    expect(storage.loadAll()).toEqual([]);
    expect(onLoss).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('createTaskTemplateFileStorage - 从 localStorage 一次性迁移', () => {
  it('文件不存在 + localStorage 有数据 → 迁移到文件 + loadAll 返回迁移的模板', async () => {
    const files = makeFakeFiles();
    const lsStore = new Map<string, string>([
      ['rw-task-templates', JSON.stringify({ version: 1, templates: [makeTemplate({ templateId: 'legacy' })] })],
    ]);
    const legacyStorage = makeLegacyStorage(lsStore);
    const storage = createTaskTemplateFileStorage(files, '/data', { legacyStorage });

    await storage.hydrate();

    expect(storage.loadAll()[0]!.templateId).toBe('legacy');
    await flushAsyncWrites();
    expect(files.store.has(STORAGE_PATH)).toBe(true);
    // 迁移后清空 localStorage(避免双 source of truth)
    expect(lsStore.get('rw-task-templates') ?? '').toBe('');
  });

  it('文件已存在 + localStorage 有数据 → 不迁移(文件优先,忽略 localStorage)', async () => {
    const files = makeFakeFiles({
      [STORAGE_PATH]: JSON.stringify({ version: 1, templates: [makeTemplate({ templateId: 'file-wins' })] }),
    });
    const lsStore = new Map<string, string>([
      ['rw-task-templates', JSON.stringify({ version: 1, templates: [makeTemplate({ templateId: 'legacy' })] })],
    ]);
    const legacyStorage = makeLegacyStorage(lsStore);
    const storage = createTaskTemplateFileStorage(files, '/data', { legacyStorage });

    await storage.hydrate();

    expect(storage.loadAll()[0]!.templateId).toBe('file-wins');
    expect(lsStore.get('rw-task-templates')).not.toBeNull();
  });
});

describe('createTaskTemplateFileStorage - schema version 不激进', () => {
  it('version 高于预期 → 清空 + 错误日志(未来版本回退,不强行加载错格式)', async () => {
    const files = makeFakeFiles({
      [STORAGE_PATH]: JSON.stringify({ version: 99, templates: [makeTemplate()] }),
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onLoss = vi.fn();
    const storage = createTaskTemplateFileStorage(files, '/data', { onDataLoss: onLoss });

    await storage.hydrate();

    expect(storage.loadAll()).toEqual([]);
    expect(onLoss).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

// --- helpers ---

function makeLegacyStorage(store: Map<string, string>): { loadAll(): readonly TaskTemplate[]; clear(): void } {
  return {
    loadAll() {
      const raw = store.get('rw-task-templates');
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw) as { version: number; templates: readonly TaskTemplate[] };
        if (parsed.version !== 1) return [];
        return parsed.templates;
      } catch {
        return [];
      }
    },
    clear() {
      store.set('rw-task-templates', '');
    },
  };
}

/** 文件后端 saveAll 用 setTimeout 异步写,flush 它让测试断言文件已落盘。 */
function flushAsyncWrites(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
