import { describe, it, expect } from 'vitest';
import {
  upsertReportConfig,
  removeReportConfig,
  findReportConfig,
  createEmptyReportConfig,
  moveReportItem,
  isReportConfig,
  isReportItem,
} from '../core/report-config';
import type { ReportConfig, ReportItem } from '../core/report-config';

const item: ReportItem = { id: 'i1', name: '载波同步锁定', frameId: 'frameA', fieldId: 'lock' };
const config: ReportConfig = {
  templateId: 'tpl1',
  checkPoints: [item],
  statisticsItems: [],
  attachItems: [],
};

describe('isReportConfig', () => {
  it('passes valid config', () => {
    expect(isReportConfig(config)).toBe(true);
  });
  it('rejects missing templateId', () => {
    expect(isReportConfig({ ...config, templateId: undefined })).toBe(false);
  });
  it('rejects non-array checkPoints', () => {
    expect(isReportConfig({ ...config, checkPoints: 'x' })).toBe(false);
  });
  it('rejects item with bad fieldId', () => {
    const bad = { ...config, checkPoints: [{ ...item, fieldId: 1 }] };
    expect(isReportConfig(bad)).toBe(false);
  });
  it('accepts item with optional msg', () => {
    const withMsg: ReportConfig = { ...config, checkPoints: [{ ...item, msg: '说明' }] };
    expect(isReportConfig(withMsg)).toBe(true);
  });
  it('rejects null / non-object', () => {
    expect(isReportConfig(null)).toBe(false);
    expect(isReportConfig('x')).toBe(false);
  });
  it('rejects missing one of the three categories', () => {
    expect(isReportConfig({ templateId: 't', checkPoints: [] })).toBe(false);
  });
});

describe('CRUD', () => {
  it('upsertReportConfig appends new', () => {
    const next = upsertReportConfig([], config);
    expect(next).toHaveLength(1);
    expect(next[0].templateId).toBe('tpl1');
  });
  it('upsertReportConfig replaces in place by templateId (keeps position)', () => {
    const other: ReportConfig = { templateId: 'tpl2', checkPoints: [], statisticsItems: [], attachItems: [] };
    const updated: ReportConfig = { ...config, checkPoints: [] };
    const next = upsertReportConfig([config, other], updated);
    expect(next.map(c => c.templateId)).toEqual(['tpl1', 'tpl2']);
    expect(next[0].checkPoints).toEqual([]);
  });
  it('removeReportConfig by templateId', () => {
    const next = removeReportConfig([config], 'tpl1');
    expect(next).toEqual([]);
  });
  it('removeReportConfig no-op for unknown templateId', () => {
    const next = removeReportConfig([config], 'nope');
    expect(next).toEqual([config]);
  });
  it('findReportConfig by templateId', () => {
    expect(findReportConfig([config], 'tpl1')).toEqual(config);
    expect(findReportConfig([config], 'nope')).toBeUndefined();
  });
});

describe('createEmptyReportConfig', () => {
  it('creates empty config for templateId', () => {
    const empty = createEmptyReportConfig('tpl1');
    expect(empty).toEqual({
      templateId: 'tpl1',
      checkPoints: [],
      statisticsItems: [],
      attachItems: [],
    });
  });
});

describe('isReportItem', () => {
  it('rejects missing id', () => {
    expect(isReportItem({ ...item, id: undefined })).toBe(false);
  });
  it('rejects missing name', () => {
    expect(isReportItem({ ...item, name: undefined })).toBe(false);
  });
  it('rejects non-string frameId', () => {
    expect(isReportItem({ ...item, frameId: 1 })).toBe(false);
  });
  it('rejects non-string msg', () => {
    expect(isReportItem({ ...item, msg: 42 })).toBe(false);
  });
  it('accepts optional expectValue', () => {
    expect(isReportItem({ ...item, expectValue: '锁定' })).toBe(true);
  });
  it('rejects non-string expectValue', () => {
    expect(isReportItem({ ...item, expectValue: 42 })).toBe(false);
  });
});

describe('moveReportItem', () => {
  const items: ReportItem[] = [
    { id: 'a', name: 'A', frameId: 'f', fieldId: 'fld' },
    { id: 'b', name: 'B', frameId: 'f', fieldId: 'fld' },
    { id: 'c', name: 'C', frameId: 'f', fieldId: 'fld' },
  ];

  it('moves item up (swaps with previous)', () => {
    const next = moveReportItem(items, 'b', 'up');
    expect(next.map(i => i.id)).toEqual(['b', 'a', 'c']);
  });
  it('moves item down (swaps with next)', () => {
    const next = moveReportItem(items, 'b', 'down');
    expect(next.map(i => i.id)).toEqual(['a', 'c', 'b']);
  });
  it('returns original array when moving first item up (boundary)', () => {
    const next = moveReportItem(items, 'a', 'up');
    expect(next.map(i => i.id)).toEqual(['a', 'b', 'c']);
  });
  it('returns original array when moving last item down (boundary)', () => {
    const next = moveReportItem(items, 'c', 'down');
    expect(next.map(i => i.id)).toEqual(['a', 'b', 'c']);
  });
  it('returns original array when id not found', () => {
    const next = moveReportItem(items, 'nope', 'up');
    expect(next.map(i => i.id)).toEqual(['a', 'b', 'c']);
  });
});
