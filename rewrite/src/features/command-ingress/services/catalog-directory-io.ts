/**
 * 用例目录导入导出(S018 修正:整个用例目录 = catalog 映射 + 报告配置,不只报告配置)。
 *
 * 用户反馈:导入导出应该带整个用例目录(mappings + reportConfigs 合一),不能只带报告配置。
 * payload = { version, mappings: CatalogMapping[], reportConfigs: ReportConfig[] }。
 *
 * 复用 isCatalogMapping / isReportConfig 做逐项校验,结构非法抛人类可读中文错误(调用方 try/catch 转 notify)。
 * 冲突策略由调用方决定(UI 层按 templateId 替换合并)。
 */
import type { CatalogMapping } from '../core/catalog-mapping';
import type { ReportConfig } from '../core/report-config';
import { isCatalogMapping } from '../core/catalog-mapping';
import { isReportConfig } from '../core/report-config';

export const CATALOG_DIRECTORY_SCHEMA_VERSION = 1;

interface CatalogDirectoryPayload {
  readonly version: number;
  readonly mappings: readonly CatalogMapping[];
  readonly reportConfigs: readonly ReportConfig[];
}

export interface CatalogDirectory {
  readonly mappings: readonly CatalogMapping[];
  readonly reportConfigs: readonly ReportConfig[];
}

/** 序列化整个用例目录(mappings + reportConfigs)为带 version 的 JSON 字符串。 */
export function serializeCatalogDirectory(dir: CatalogDirectory): string {
  const payload: CatalogDirectoryPayload = {
    version: CATALOG_DIRECTORY_SCHEMA_VERSION,
    mappings: dir.mappings,
    reportConfigs: dir.reportConfigs,
  };
  return JSON.stringify(payload, null, 2);
}

/** 从 JSON 文本解析整个用例目录。结构非法/字段缺失抛 Error(附人类可读中文原因)。 */
export function parseCatalogDirectoryFromJson(text: string): CatalogDirectory {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON 格式错误，无法解析');
  }
  if (data == null || typeof data !== 'object') throw new Error('内容应为配置对象');
  const payload = data as Partial<CatalogDirectoryPayload>;
  if (typeof payload.version !== 'number') throw new Error('缺少 version 字段');
  if (!Array.isArray(payload.mappings)) throw new Error('mappings 应为数组');
  if (!Array.isArray(payload.reportConfigs)) throw new Error('reportConfigs 应为数组');

  // 逐项校验,过滤掉形状不合法的(单条坏不连累整份),保留合法的。
  const mappings = payload.mappings.filter(isCatalogMapping);
  const reportConfigs = payload.reportConfigs.filter(isReportConfig);

  if (mappings.length < payload.mappings.length) {
    console.warn('[catalog-directory] 过滤掉不合法的 mapping 项');
  }
  if (reportConfigs.length < payload.reportConfigs.length) {
    console.warn('[catalog-directory] 过滤掉不合法的 reportConfig 项');
  }

  return { mappings, reportConfigs };
}
