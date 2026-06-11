import { describe, it, expect, beforeEach } from 'vitest';
import { createTaskTemplateStorage } from '../services/task-template-storage';
import { exportTemplates, parseImportedFile } from '../services/task-template-io';
import { timedTaskDef } from '../fixtures/task-fixtures';
import type { TaskTemplate } from '../core';

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

function makeMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear() { map.clear(); },
    getItem: (k) => map.get(k) ?? null,
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => { map.delete(k); },
    setItem: (k, v) => { map.set(k, v); },
  } as Storage;
}

describe('TaskTemplateStorage', () => {
  let kv: Storage;
  beforeEach(() => { kv = makeMemoryStorage(); });

  it('初始状态 loadAll 返回空数组', () => {
    const storage = createTaskTemplateStorage(kv);
    expect(storage.loadAll()).toEqual([]);
  });

  it('saveAll + loadAll 可循环', () => {
    const storage = createTaskTemplateStorage(kv);
    const templates = [makeTemplate(), makeTemplate({ templateId: 'tpl-2', name: 'B' })];
    storage.saveAll(templates);

    const loaded = storage.loadAll();
    expect(loaded.length).toBe(2);
    expect(loaded[0]!.templateId).toBe('tpl-1');
  });

  it('schema version 不匹配返回空数组', () => {
    kv.setItem('rw-task-templates', JSON.stringify({ version: 99, templates: [makeTemplate()] }));
    const storage = createTaskTemplateStorage(kv);
    expect(storage.loadAll()).toEqual([]);
  });

  it('JSON parse 错误降级返回空数组', () => {
    kv.setItem('rw-task-templates', '{not json');
    const storage = createTaskTemplateStorage(kv);
    expect(storage.loadAll()).toEqual([]);
  });

  it('templates 字段不是数组返回空', () => {
    kv.setItem('rw-task-templates', JSON.stringify({ version: 1, templates: 'not array' }));
    const storage = createTaskTemplateStorage(kv);
    expect(storage.loadAll()).toEqual([]);
  });

  it('saveAll 写入 JSON 包含 version 字段', () => {
    const storage = createTaskTemplateStorage(kv);
    storage.saveAll([makeTemplate()]);
    const raw = kv.getItem('rw-task-templates')!;
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(1);
    expect(Array.isArray(parsed.templates)).toBe(true);
  });
});

describe('task-template-io', () => {
  it('exportTemplates 产生 Blob，包含 version + pretty JSON', async () => {
    const templates = [makeTemplate()];
    const blob = exportTemplates(templates);
    expect(blob.type).toBe('application/json');
    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(parsed.version).toBe(1);
    expect(parsed.templates.length).toBe(1);
  });

  it('export -> import 循环一致', async () => {
    const original = [makeTemplate(), makeTemplate({ templateId: 'tpl-2' })];
    const blob = exportTemplates(original);
    const imported = await parseImportedFile(blob);
    expect(imported).toEqual(original);
  });

  it('schema version 不匹配抛错', async () => {
    const blob = new Blob([JSON.stringify({ version: 99, templates: [] })], { type: 'application/json' });
    await expect(parseImportedFile(blob)).rejects.toThrow(/schema 版本不匹配/);
  });

  it('templates 不是数组抛错', async () => {
    const blob = new Blob([JSON.stringify({ version: 1, templates: 'not array' })], { type: 'application/json' });
    await expect(parseImportedFile(blob)).rejects.toThrow(/不是数组/);
  });

  it('无效 JSON 抛错', async () => {
    const blob = new Blob(['{not json'], { type: 'application/json' });
    await expect(parseImportedFile(blob)).rejects.toThrow(/有效的 JSON/);
  });
});

describe('TaskService + templateStorage 集成', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  it('启动时从 storage 加载模板', async () => {
    const kv = makeMemoryStorage();
    const seedStorage = createTaskTemplateStorage(kv);
    seedStorage.saveAll([makeTemplate({ templateId: 'seed-1', name: 'Seed' })]);

    const { createTaskService } = await import('../services/task-service');
    const { createFakeSendService } = await import('../adapters/test-exports');
    const { createFakeReceiveEventSource } = await import('../adapters/test-exports');
    const service = createTaskService({
      sendService: createFakeSendService(),
      receiveEventSource: createFakeReceiveEventSource(),
      templateStorage: createTaskTemplateStorage(kv),
      now: () => '2026-06-11T00:00:00.000Z',
    });

    const list = service.listTemplates();
    expect(list.length).toBe(1);
    expect(list[0]!.templateId).toBe('seed-1');
  });

  it('createTemplate 后 debounce 写入 storage', async () => {
    const kv = makeMemoryStorage();
    const { createTaskService } = await import('../services/task-service');
    const { createFakeSendService } = await import('../adapters/test-exports');
    const { createFakeReceiveEventSource } = await import('../adapters/test-exports');
    const service = createTaskService({
      sendService: createFakeSendService(),
      receiveEventSource: createFakeReceiveEventSource(),
      templateStorage: createTaskTemplateStorage(kv),
      now: () => '2026-06-11T00:00:00.000Z',
    });

    service.createTemplate('A', timedTaskDef());

    // 还没到 500ms，应该没写入
    expect(kv.getItem('rw-task-templates')).toBeNull();

    // 等待 debounce
    await new Promise((r) => setTimeout(r, 550));
    const raw = kv.getItem('rw-task-templates');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.templates.length).toBe(1);
    expect(parsed.templates[0].name).toBe('A');
  });

  it('500ms 内多次变更只写一次', async () => {
    const kv = makeMemoryStorage();
    const { createTaskService } = await import('../services/task-service');
    const { createFakeSendService } = await import('../adapters/test-exports');
    const { createFakeReceiveEventSource } = await import('../adapters/test-exports');
    const service = createTaskService({
      sendService: createFakeSendService(),
      receiveEventSource: createFakeReceiveEventSource(),
      templateStorage: createTaskTemplateStorage(kv),
      now: () => '2026-06-11T00:00:00.000Z',
    });

    // 多次变更
    service.createTemplate('A', timedTaskDef());
    service.createTemplate('B', timedTaskDef());
    service.createTemplate('C', timedTaskDef());

    await new Promise((r) => setTimeout(r, 550));
    const raw = kv.getItem('rw-task-templates')!;
    const parsed = JSON.parse(raw);
    expect(parsed.templates.length).toBe(3);
  });
});
