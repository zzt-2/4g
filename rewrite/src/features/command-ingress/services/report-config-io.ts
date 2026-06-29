/**
 * 报告配置导入导出(serialize / parse,纯函数,无 Vue 依赖)。
 *
 * 复用 group-io.ts / task-template-io.ts 的导入导出范式:
 * - 序列化为带 version 的 JSON 字符串(导入导出文件格式,同持久化结构)。
 * - 反序列化做严格结构校验,逐项抛人类可读中文错误(调用方 try/catch 转 notify)。
 *
 * 这是导入导出专用口(用户在 UI 点导出/导入),不是持久化读写(那走
 * report-config-file-storage.ts)。两者共享同样的 payload 形状。
 *
 * 冲突策略由调用方决定(UI 层按 templateId 替换),本模块只做纯结构校验。
 */
import type { ReportConfig } from '../core/report-config';
import { isReportConfig } from '../core/report-config';

export const EXPORT_SCHEMA_VERSION = 1;

interface ExportPayload {
  readonly version: number;
  readonly configs: readonly ReportConfig[];
}

/** 序列化为带 version 的 JSON 字符串(导入导出文件格式)。 */
export function serializeReportConfigs(configs: readonly ReportConfig[]): string {
  const payload: ExportPayload = { version: EXPORT_SCHEMA_VERSION, configs };
  return JSON.stringify(payload, null, 2);
}

/** 从 JSON 文本解析。结构非法/字段缺失抛 Error(附人类可读中文原因);调用方 try/catch 转 notify。 */
export function parseReportConfigsFromJson(text: string): ReportConfig[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON 格式错误，无法解析');
  }
  if (data == null || typeof data !== 'object') throw new Error('内容应为配置对象');
  const payload = data as Partial<ExportPayload>;
  if (typeof payload.version !== 'number') throw new Error('缺少 version 字段');
  if (!Array.isArray(payload.configs)) throw new Error('configs 应为数组');

  const result: ReportConfig[] = [];
  for (let i = 0; i < payload.configs.length; i++) {
    const c = payload.configs[i];
    if (!isReportConfig(c)) {
      throw new Error(`第 ${i + 1} 项配置结构不合法(templateId/三类/字段项缺失或类型错误)`);
    }
    result.push(c);
  }
  return result;
}
