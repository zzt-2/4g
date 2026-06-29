import { describe, it, expect } from 'vitest';
import {
  serializeCatalogDirectory,
  parseCatalogDirectoryFromJson,
  CATALOG_DIRECTORY_SCHEMA_VERSION,
} from '../services/catalog-directory-io';
import type { CatalogMapping } from '../core/catalog-mapping';
import type { ReportConfig } from '../core/report-config';

const mapping: CatalogMapping = { templateId: 'tpl1', enabled: true, overridablePaths: ['a.b'] };
const reportConfig: ReportConfig = {
  templateId: 'tpl1',
  checkPoints: [{ id: 'i1', name: '载波同步', frameId: 'fA', fieldId: 'lock' }],
  statisticsItems: [],
  attachItems: [],
};

describe('catalog-directory-io round-trip', () => {
  it('serialize then parse returns same directory', () => {
    const text = serializeCatalogDirectory({ mappings: [mapping], reportConfigs: [reportConfig] });
    const parsed = parseCatalogDirectoryFromJson(text);
    expect(parsed.mappings).toEqual([mapping]);
    expect(parsed.reportConfigs).toEqual([reportConfig]);
  });
  it('serialized payload has version', () => {
    const text = serializeCatalogDirectory({ mappings: [], reportConfigs: [] });
    expect(JSON.parse(text).version).toBe(CATALOG_DIRECTORY_SCHEMA_VERSION);
  });
  it('handles empty directory', () => {
    const text = serializeCatalogDirectory({ mappings: [], reportConfigs: [] });
    const parsed = parseCatalogDirectoryFromJson(text);
    expect(parsed.mappings).toEqual([]);
    expect(parsed.reportConfigs).toEqual([]);
  });
});

describe('catalog-directory-io parse errors', () => {
  it('rejects bad JSON', () => {
    expect(() => parseCatalogDirectoryFromJson('{not json')).toThrow('JSON 格式错误');
  });
  it('rejects missing version', () => {
    expect(() => parseCatalogDirectoryFromJson(JSON.stringify({ mappings: [], reportConfigs: [] }))).toThrow('version');
  });
  it('rejects non-array mappings', () => {
    expect(() => parseCatalogDirectoryFromJson(JSON.stringify({ version: 1, reportConfigs: [] }))).toThrow('mappings');
  });
  it('rejects non-array reportConfigs', () => {
    expect(() => parseCatalogDirectoryFromJson(JSON.stringify({ version: 1, mappings: [] }))).toThrow('reportConfigs');
  });
  it('filters out malformed items, keeps valid ones', () => {
    const bad = JSON.stringify({
      version: 1,
      mappings: [
        mapping,
        { templateId: 'bad', enabled: 'true', overridablePaths: [] }, // enabled 非 boolean
      ],
      reportConfigs: [
        reportConfig,
        { templateId: 'bad', checkPoints: [{ id: 'x' }], statisticsItems: [], attachItems: [] }, // fieldId 缺
      ],
    });
    const parsed = parseCatalogDirectoryFromJson(bad);
    expect(parsed.mappings).toHaveLength(1);
    expect(parsed.mappings[0].templateId).toBe('tpl1');
    expect(parsed.reportConfigs).toHaveLength(1);
    expect(parsed.reportConfigs[0].templateId).toBe('tpl1');
  });
});
