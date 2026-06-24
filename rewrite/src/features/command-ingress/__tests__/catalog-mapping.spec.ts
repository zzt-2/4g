import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  upsertMapping,
  removeMapping,
  findMapping,
  selectEnabledMappings,
  markReported,
  loadCatalogMappings,
  persistCatalogMappings,
  CATALOG_MAPPINGS_KEY,
} from '../core/catalog-mapping';
import type { CatalogMapping } from '../core/catalog-mapping';

// localStorage mock
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((k: string) => store[k] ?? null),
  setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
  removeItem: vi.fn((k: string) => { delete store[k]; }),
  clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
};

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock);
  Object.keys(store).forEach(k => delete store[k]);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const mappingOn: CatalogMapping = { templateId: 'tpl-on', enabled: true, overridablePaths: ['a.b'] };
const mappingOff: CatalogMapping = { templateId: 'tpl-off', enabled: false, overridablePaths: [] };

describe('upsertMapping', () => {
  it('adds new mapping', () => {
    const result = upsertMapping([], mappingOn);
    expect(result).toHaveLength(1);
    expect(result[0].templateId).toBe('tpl-on');
  });

  it('replaces existing by templateId', () => {
    const result = upsertMapping([mappingOn], { ...mappingOn, overridablePaths: ['x.y'] });
    expect(result).toHaveLength(1);
    expect(result[0].overridablePaths).toEqual(['x.y']);
  });

  it('replaces in place (keeps original index, no reorder)', () => {
    // 三条映射,替换中间那条 tpl-mid,结果顺序必须不变
    const a: CatalogMapping = { templateId: 'tpl-a', enabled: true, overridablePaths: [] };
    const mid: CatalogMapping = { templateId: 'tpl-mid', enabled: true, overridablePaths: [] };
    const c: CatalogMapping = { templateId: 'tpl-c', enabled: true, overridablePaths: [] };
    const result = upsertMapping([a, mid, c], { ...mid, overridablePaths: ['new.path'] });
    expect(result.map(m => m.templateId)).toEqual(['tpl-a', 'tpl-mid', 'tpl-c']);
    expect(result[1].overridablePaths).toEqual(['new.path']);
  });
});

describe('removeMapping', () => {
  it('removes by templateId', () => {
    const result = removeMapping([mappingOn, mappingOff], 'tpl-on');
    expect(result).toHaveLength(1);
    expect(result[0].templateId).toBe('tpl-off');
  });
});

describe('findMapping', () => {
  it('finds by templateId', () => {
    expect(findMapping([mappingOn, mappingOff], 'tpl-off')).toBe(mappingOff);
  });
  it('returns undefined when not found', () => {
    expect(findMapping([mappingOn], 'tpl-missing')).toBeUndefined();
  });
});

describe('selectEnabledMappings', () => {
  it('filters enabled only', () => {
    const result = selectEnabledMappings([mappingOn, mappingOff]);
    expect(result).toHaveLength(1);
    expect(result[0].templateId).toBe('tpl-on');
  });
});

describe('markReported', () => {
  it('fills outCaseId + reportedAt for matching templateId', () => {
    const result = markReported([mappingOn, mappingOff], 'tpl-on', 'OUT_123', 999);
    expect(result[0].outCaseId).toBe('OUT_123');
    expect(result[0].reportedAt).toBe(999);
    // 未匹配项不变
    expect(result[1]).toBe(mappingOff);
  });
  it('no-op when templateId missing', () => {
    const result = markReported([mappingOn], 'tpl-missing', 'OUT', 1);
    expect(result[0]).toBe(mappingOn);
  });
});

describe('persistence', () => {
  it('persists then loads round-trip', () => {
    persistCatalogMappings([mappingOn, mappingOff]);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      CATALOG_MAPPINGS_KEY,
      JSON.stringify([mappingOn, mappingOff]),
    );
    const loaded = loadCatalogMappings();
    expect(loaded).toHaveLength(2);
    expect(loaded[0]).toEqual(mappingOn);
  });

  it('load returns [] when key missing', () => {
    expect(loadCatalogMappings()).toEqual([]);
  });

  it('load returns [] on corrupt JSON', () => {
    store[CATALOG_MAPPINGS_KEY] = '{not json';
    expect(loadCatalogMappings()).toEqual([]);
  });

  it('load filters out malformed entries (keeps valid ones)', () => {
    // 混入一个 enabled 为字符串的非法项,应被过滤掉
    store[CATALOG_MAPPINGS_KEY] = JSON.stringify([
      mappingOn,
      { templateId: 'bad', enabled: 'true', overridablePaths: [] }, // enabled 不是 boolean
      'not-an-object',
    ]);
    const loaded = loadCatalogMappings();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].templateId).toBe('tpl-on');
  });
});
