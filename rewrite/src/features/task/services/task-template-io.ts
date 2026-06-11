import type { TaskTemplate } from '../core';

const EXPORT_SCHEMA_VERSION = 1;

interface ExportedPayload {
  readonly version: number;
  readonly templates: readonly TaskTemplate[];
}

/**
 * 把模板列表序列化为可下载的 JSON Blob（pretty print）。
 */
export function exportTemplates(templates: readonly TaskTemplate[]): Blob {
  const payload: ExportedPayload = {
    version: EXPORT_SCHEMA_VERSION,
    templates,
  };
  return new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
}

/**
 * 解析导入的 JSON 文件，返回 templates 数组。
 *
 * 校验：version 不匹配 / templates 不是数组 -> 抛错。
 * 冲突处理（同 templateId 已存在）由调用方决定策略。
 */
export async function parseImportedFile(file: Blob): Promise<readonly TaskTemplate[]> {
  const text = await file.text();
  let parsed: ExportedPayload;
  try {
    parsed = JSON.parse(text) as ExportedPayload;
  } catch (err) {
    throw new Error('导入文件不是有效的 JSON', { cause: err });
  }

  if (parsed.version !== EXPORT_SCHEMA_VERSION) {
    throw new Error(
      `导入文件 schema 版本不匹配：期望 ${EXPORT_SCHEMA_VERSION}，实际 ${parsed.version ?? '未知'}`,
    );
  }

  if (!Array.isArray(parsed.templates)) {
    throw new Error('导入文件 templates 字段不是数组');
  }

  return parsed.templates;
}
