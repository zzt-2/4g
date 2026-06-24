import type { DisplayGroupConfig, DisplayGroupFrameEntry } from './types';

// 分组配置的 JSON 导入导出（纯函数，无 Vue 依赖，便于单测与复用）。
// 导出格式 = DisplayGroupConfig[] 的 JSON 数组；导入做结构校验后返回，frameId/fieldId
// 不做存在性校验——导入后引用不存在的帧由 emergent 分组逻辑正常降级。

export function serializeGroups(groups: readonly DisplayGroupConfig[]): string {
  return JSON.stringify(groups.map((g) => ({
    id: g.id,
    label: g.label,
    frames: g.frames.map((f) => ({ frameId: f.frameId, visibleFieldIds: [...f.visibleFieldIds] })),
  })), null, 2);
}

// 校验导入 JSON 结构：必须是数组，每项有 id/label/frames，frames 里每项有 frameId/visibleFieldIds。
// 结构非法时抛 Error（附人类可读原因）；调用方 try/catch 转成用户提示。
export function parseGroupsFromJson(text: string): DisplayGroupConfig[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON 格式错误，无法解析');
  }
  if (!Array.isArray(data)) throw new Error('内容应为分组数组');

  const result: DisplayGroupConfig[] = [];
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (!item || typeof item !== 'object') throw new Error(`第 ${i + 1} 项不是有效对象`);
    const g = item as Record<string, unknown>;
    if (typeof g.id !== 'string' || !g.id) throw new Error(`第 ${i + 1} 项缺少 id`);
    if (typeof g.label !== 'string') throw new Error(`第 ${i + 1} 项缺少 label`);
    if (!Array.isArray(g.frames)) throw new Error(`第 ${i + 1} 项 frames 不是数组`);

    const frames: DisplayGroupFrameEntry[] = [];
    for (let j = 0; j < g.frames.length; j++) {
      const f = g.frames[j] as Record<string, unknown>;
      if (!f || typeof f.frameId !== 'string') throw new Error(`第 ${i + 1} 项第 ${j + 1} 个帧缺少 frameId`);
      if (!Array.isArray(f.visibleFieldIds)) throw new Error(`第 ${i + 1} 项第 ${j + 1} 个帧 visibleFieldIds 不是数组`);
      frames.push({
        frameId: f.frameId,
        visibleFieldIds: (f.visibleFieldIds as unknown[]).filter((x): x is string => typeof x === 'string'),
      });
    }
    result.push({ id: g.id, label: g.label, frames });
  }
  return result;
}
