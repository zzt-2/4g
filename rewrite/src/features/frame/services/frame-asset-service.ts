import {
  migrateLegacyFrameConfig,
  validateFrameAssetCollection,
  type FrameAsset,
  type LegacyFrameMigrationResult,
  type ReadonlyFrameAsset,
  type ValidationIssue,
  type ValidationResult,
} from '../core';
import {
  findFrameAssets,
  getFrameAsset,
  getSelectedFrameAsset,
  listFrameAssetSummaries,
  selectFieldReferenceOptions,
  selectFrameReferenceOptions,
  type FrameAssetQuery,
  type FrameAssetSnapshot,
  type FrameAssetSummary,
  type FrameFieldReference,
  type FrameFieldReferenceQuery,
  type FrameReferenceOption,
} from '../selectors';
import { createFrameState, type FrameStateContainer, type FrameStateSnapshot } from '../state';

export interface FrameAssetReader {
  getSnapshot(): FrameAssetSnapshot;
  listFrames(query?: FrameAssetQuery): FrameAssetSummary[];
  findFrames(query?: FrameAssetQuery): ReadonlyFrameAsset[];
  getFrame(frameId: string): ReadonlyFrameAsset | undefined;
  getSelectedFrame(): ReadonlyFrameAsset | undefined;
  listFrameReferences(query?: FrameAssetQuery): FrameReferenceOption[];
  listFieldReferences(query?: FrameFieldReferenceQuery): FrameFieldReference[];
}

export interface FrameAssetOperationResult {
  readonly ok: boolean;
  readonly validation: ValidationResult;
  readonly snapshot: FrameStateSnapshot;
}

export interface FrameLegacyLoadResult extends FrameAssetOperationResult {
  readonly migration: LegacyFrameMigrationResult;
}

export interface FrameAssetService extends FrameAssetReader {
  replaceFrames(frames: readonly FrameAsset[], selectedFrameId?: string): FrameAssetOperationResult;
  loadLegacyFrameConfig(value: unknown, selectedFrameId?: string): FrameLegacyLoadResult;
  selectFrame(frameId: string | undefined): FrameAssetOperationResult;
  upsertFrame(frame: FrameAsset): FrameAssetOperationResult;
  removeFrame(frameId: string): FrameAssetOperationResult;
}

function hasError(issues: readonly ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

function validResult(): ValidationResult {
  return {
    valid: true,
    issues: [],
  };
}

function issue(
  code: string,
  path: string,
  message: string,
  severity: ValidationIssue['severity'] = 'error',
): ValidationIssue {
  return { code, path, message, severity };
}

function invalidResult(issues: ValidationIssue[]): ValidationResult {
  return {
    valid: false,
    issues,
  };
}

export function createFrameAssetReader(snapshotProvider: () => FrameAssetSnapshot): FrameAssetReader {
  return {
    getSnapshot() {
      const snapshot = snapshotProvider();
      return {
        frames: findFrameAssets(snapshot),
        ...(snapshot.selectedFrameId ? { selectedFrameId: snapshot.selectedFrameId } : {}),
      };
    },

    listFrames(query) {
      return listFrameAssetSummaries(snapshotProvider(), query);
    },

    findFrames(query) {
      return findFrameAssets(snapshotProvider(), query);
    },

    getFrame(frameId) {
      return getFrameAsset(snapshotProvider(), frameId);
    },

    getSelectedFrame() {
      return getSelectedFrameAsset(snapshotProvider());
    },

    listFrameReferences(query) {
      return selectFrameReferenceOptions(snapshotProvider(), query);
    },

    listFieldReferences(query) {
      return selectFieldReferenceOptions(snapshotProvider(), query);
    },
  };
}

export function createFrameAssetService(
  state: FrameStateContainer = createFrameState(),
): FrameAssetService {
  const reader = createFrameAssetReader(() => state.getSnapshot());

  return {
    ...reader,

    replaceFrames(frames, selectedFrameId) {
      const validation = validateFrameAssetCollection(frames);
      if (!validation.valid) {
        return {
          ok: false,
          validation,
          snapshot: state.getSnapshot(),
        };
      }

      return {
        ok: true,
        validation,
        snapshot: state.replaceFrames(frames, selectedFrameId),
      };
    },

    loadLegacyFrameConfig(value, selectedFrameId) {
      const migration = migrateLegacyFrameConfig(value);
      if (!migration.recognized || hasError(migration.issues)) {
        return {
          ok: false,
          validation: {
            valid: !hasError(migration.issues),
            issues: migration.issues,
          },
          migration,
          snapshot: state.getSnapshot(),
        };
      }

      return {
        ok: true,
        validation: {
          valid: true,
          issues: migration.issues,
        },
        migration,
        snapshot: state.replaceFrames(migration.frames, selectedFrameId),
      };
    },

    selectFrame(frameId) {
      if (frameId === undefined) {
        return {
          ok: true,
          validation: validResult(),
          snapshot: state.selectFrame(undefined),
        };
      }

      if (!getFrameAsset(state.getSnapshot(), frameId)) {
        return {
          ok: false,
          validation: invalidResult([
            issue('frame.selectionMissing', 'selectedFrameId', `未找到帧: ${frameId}`),
          ]),
          snapshot: state.getSnapshot(),
        };
      }

      return {
        ok: true,
        validation: validResult(),
        snapshot: state.selectFrame(frameId),
      };
    },

    upsertFrame(frame) {
      const validation = validateFrameAssetCollection([frame]);
      if (!validation.valid) {
        return {
          ok: false,
          validation,
          snapshot: state.getSnapshot(),
        };
      }

      return {
        ok: true,
        validation,
        snapshot: state.upsertFrame(frame),
      };
    },

    removeFrame(frameId) {
      return {
        ok: true,
        validation: validResult(),
        snapshot: state.removeFrame(frameId),
      };
    },
  };
}

export interface FrameAssetFile {
  schemaVersion: 1;
  frames: FrameAsset[];
}

export interface FrameDeserializeResult {
  ok: boolean;
  frames: FrameAsset[];
  issues: ValidationIssue[];
}

export function serializeFrames(frames: readonly FrameAsset[]): string {
  const file: FrameAssetFile = { schemaVersion: 1, frames: [...frames] };
  return JSON.stringify(file, null, 2);
}

export function deserializeFrames(text: string): FrameDeserializeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Try legacy path: the text might be a raw legacy array
    return tryLegacyDeserialize();
  }

  if (isFrameAssetFile(parsed)) {
    const validation = validateFrameAssetCollection(parsed.frames);
    return {
      ok: !hasError(validation.issues),
      frames: parsed.frames,
      issues: validation.issues,
    };
  }

  // No schemaVersion → legacy array or object
  const legacy = migrateLegacyFrameConfig(parsed);
  return {
    ok: legacy.recognized && !hasError(legacy.issues),
    frames: legacy.frames,
    issues: legacy.issues,
  };
}

function isFrameAssetFile(value: unknown): value is FrameAssetFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    (value as FrameAssetFile).schemaVersion === 1 &&
    'frames' in value &&
    Array.isArray((value as FrameAssetFile).frames)
  );
}

function tryLegacyDeserialize(): FrameDeserializeResult {
  return {
    ok: false,
    frames: [],
    issues: [issue('deserialize.parseError', 'input', 'JSON 格式错误，无法解析')],
  };
}
