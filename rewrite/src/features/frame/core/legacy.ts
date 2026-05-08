import { normalizeFrame, isRecordCheck, createIssue } from './legacy-normalizers';
import { validateFrameAssetCollection } from './validation-frame';
import type { FrameAsset, LegacyFrameMigrationResult, ValidationIssue } from './types';

export function isLegacyFrameConfigJson(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => isRecordCheck(item) && Array.isArray(item.fields));
}

export function migrateLegacyFrameConfig(value: unknown): LegacyFrameMigrationResult {
  const issues: ValidationIssue[] = [];

  if (!Array.isArray(value)) {
    return {
      recognized: false,
      frames: [],
      issues: [createIssue('legacy.rootInvalid', 'legacy', '旧 frame 导入内容必须是数组')],
    };
  }

  const frames = value
    .map((item, index) => normalizeFrame(item, index, issues))
    .filter((frame): frame is FrameAsset => frame !== undefined);

  const validation = validateFrameAssetCollection(frames);

  return {
    recognized: true,
    frames,
    issues: [...issues, ...validation.issues],
  };
}
