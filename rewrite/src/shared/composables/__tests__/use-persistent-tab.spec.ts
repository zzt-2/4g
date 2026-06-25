import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { effect } from 'vue';
import { usePersistentTab } from '../use-persistent-tab';

// localStorage mock（沿用 catalog-mapping.spec.ts 的模式）
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((k: string) => store[k] ?? null),
  setItem: vi.fn((k: string, v: string) => {
    store[k] = v;
  }),
  removeItem: vi.fn((k: string) => {
    delete store[k];
  }),
  clear: vi.fn(() => {
    for (const k of Object.keys(store)) delete store[k];
  }),
};

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock);
  Object.keys(store).forEach((k) => delete store[k]);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const TABS = ['templates', 'executions'] as const;

describe('usePersistentTab', () => {
  it('初始无存储 → 取默认值', () => {
    const tab = usePersistentTab('task-active-tab', 'templates', TABS);
    expect(tab.value).toBe('templates');
  });

  it('初始有有效存储 → 取存储值（不回默认值）', () => {
    // 存储格式与写入侧一致（JSON.stringify），字符串值带引号
    store['task-active-tab'] = JSON.stringify('executions');
    const tab = usePersistentTab('task-active-tab', 'templates', TABS);
    expect(tab.value).toBe('executions');
  });

  it('初始存储是非法值（不在 validValues）→ 回退默认值', () => {
    store['task-active-tab'] = JSON.stringify('unknown-tab');
    const tab = usePersistentTab('task-active-tab', 'templates', TABS);
    expect(tab.value).toBe('templates');
  });

  it('初始存储是损坏 JSON → 回退默认值', () => {
    store['task-active-tab'] = '{not json';
    const tab = usePersistentTab('task-active-tab', 'templates', TABS);
    expect(tab.value).toBe('templates');
  });

  it('改值 → 写入 localStorage', () => {
    const tab = usePersistentTab('task-active-tab', 'templates', TABS);
    tab.value = 'executions';
    expect(localStorageMock.setItem).toHaveBeenCalledWith('task-active-tab', '"executions"');
  });

  it('新实例读回上次写入的值（跨"组件销毁/重建"持久化）', () => {
    const a = usePersistentTab('task-active-tab', 'templates', TABS);
    a.value = 'executions';
    // 模拟组件销毁后重建：new 一个 composable 读 localStorage
    const b = usePersistentTab('task-active-tab', 'templates', TABS);
    expect(b.value).toBe('executions');
  });

  it('watch 响应性：改值触发 effect', () => {
    const tab = usePersistentTab('task-active-tab', 'templates', TABS);
    let seen = '';
    effect(() => {
      seen = tab.value;
    });
    expect(seen).toBe('templates');
    tab.value = 'executions';
    expect(seen).toBe('executions');
  });

  it('localStorage.getItem 抛错 → 回退默认值，不崩', () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error('SecurityError: sandbox');
    });
    const tab = usePersistentTab('task-active-tab', 'templates', TABS);
    expect(tab.value).toBe('templates');
  });

  it('localStorage.setItem 抛错 → ref 仍更新（仅持久化失败，不崩）', () => {
    const tab = usePersistentTab('task-active-tab', 'templates', TABS);
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => {
      tab.value = 'executions';
    }).not.toThrow();
    expect(tab.value).toBe('executions');
  });
});
