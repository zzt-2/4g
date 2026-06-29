import { describe, it, expect } from 'vitest';
import {
  serializeReportConfigs,
  parseReportConfigsFromJson,
  EXPORT_SCHEMA_VERSION,
} from '../services/report-config-io';
import type { ReportConfig } from '../core/report-config';

const config: ReportConfig = {
  templateId: 'tpl1',
  checkPoints: [{ id: 'i1', name: '载波同步', frameId: 'fA', fieldId: 'lock' }],
  statisticsItems: [{ id: 'i2', name: '误码率', frameId: 'fA', fieldId: 'ber' }],
  attachItems: [{ id: 'i3', name: '备注', frameId: 'fB', fieldId: 'note', msg: '说明' }],
};

describe('round-trip', () => {
  it('serialize then parse returns same configs', () => {
    const text = serializeReportConfigs([config]);
    const parsed = parseReportConfigsFromJson(text);
    expect(parsed).toEqual([config]);
  });
  it('serialized payload has version', () => {
    const text = serializeReportConfigs([config]);
    expect(JSON.parse(text).version).toBe(EXPORT_SCHEMA_VERSION);
  });
  it('serialized payload wraps configs under "configs"', () => {
    const text = serializeReportConfigs([config]);
    expect(JSON.parse(text).configs).toEqual([config]);
  });
  it('preserves order across multiple configs', () => {
    const other: ReportConfig = { templateId: 'tpl2', checkPoints: [], statisticsItems: [], attachItems: [] };
    const text = serializeReportConfigs([config, other]);
    const parsed = parseReportConfigsFromJson(text);
    expect(parsed.map(c => c.templateId)).toEqual(['tpl1', 'tpl2']);
  });
});

describe('parse errors', () => {
  it('rejects bad JSON', () => {
    expect(() => parseReportConfigsFromJson('{not json')).toThrow('JSON 格式错误');
  });
  it('rejects non-object payload (string)', () => {
    expect(() => parseReportConfigsFromJson('"hello"')).toThrow();
  });
  it('rejects missing version', () => {
    expect(() => parseReportConfigsFromJson(JSON.stringify({ configs: [] }))).toThrow('version');
  });
  it('rejects non-array configs', () => {
    expect(() => parseReportConfigsFromJson(JSON.stringify({ version: 1 }))).toThrow('数组');
  });
  it('rejects item missing templateId', () => {
    expect(() => parseReportConfigsFromJson(JSON.stringify({
      version: 1,
      configs: [{ checkPoints: [], statisticsItems: [], attachItems: [] }],
    }))).toThrow('templateId');
  });
  it('rejects item with bad checkPoints element', () => {
    const bad = JSON.stringify({
      version: 1,
      configs: [{ templateId: 't', checkPoints: [{ id: 'x' }], statisticsItems: [], attachItems: [] }],
    });
    expect(() => parseReportConfigsFromJson(bad)).toThrow();
  });
  it('rejects item missing one category', () => {
    const bad = JSON.stringify({
      version: 1,
      configs: [{ templateId: 't', checkPoints: [], statisticsItems: [] }], // 无 attachItems
    });
    expect(() => parseReportConfigsFromJson(bad)).toThrow();
  });
  it('error message names the offending item index', () => {
    const bad = JSON.stringify({
      version: 1,
      configs: [
        { templateId: 'ok', checkPoints: [], statisticsItems: [], attachItems: [] },
        { templateId: 'bad', checkPoints: [{ id: 'x' }], statisticsItems: [], attachItems: [] },
      ],
    });
    expect(() => parseReportConfigsFromJson(bad)).toThrow('第 2 项');
  });
});

describe('empty', () => {
  it('serialize empty array', () => {
    const text = serializeReportConfigs([]);
    expect(JSON.parse(text).configs).toEqual([]);
  });
  it('parse empty configs array', () => {
    expect(parseReportConfigsFromJson(JSON.stringify({ version: 1, configs: [] }))).toEqual([]);
  });
});
