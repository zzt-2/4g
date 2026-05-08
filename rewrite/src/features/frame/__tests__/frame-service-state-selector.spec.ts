import { describe, expect, it } from 'vitest';
import * as framePublicApi from '../index';
import { createFrameAssetService, deserializeFrames, serializeFrames } from '../services';
import { createFrameState } from '../state';
import type { FrameAsset } from '../core';
import {
  duplicateFieldNameFrameAsset,
  expressionFrameAsset,
  frameAssetWithIdentifierRules,
  legacyFrameConfigWithoutDataParticipationTypeSample,
  minimalFrameAsset,
} from '../fixtures/frame-fixtures';

describe('frame pure state pilot', () => {
  it('returns snapshot copies instead of the internal frame collection', () => {
    const state = createFrameState({
      frames: [minimalFrameAsset],
      selectedFrameId: minimalFrameAsset.id,
    });

    const snapshot = state.getSnapshot();
    const externalFrame = snapshot.frames[0] as FrameAsset;
    externalFrame.name = '外部修改不应写回';
    externalFrame.fields[0]!.name = '外部字段修改不应写回';

    const nextSnapshot = state.getSnapshot();
    expect(nextSnapshot.selectedFrameId).toBe(minimalFrameAsset.id);
    expect(nextSnapshot.frames[0]!.name).toBe(minimalFrameAsset.name);
    expect(nextSnapshot.frames[0]!.fields[0]!.name).toBe(minimalFrameAsset.fields[0]!.name);
  });

  it('clears selection when the selected frame is removed', () => {
    const state = createFrameState({
      frames: [minimalFrameAsset, expressionFrameAsset],
      selectedFrameId: expressionFrameAsset.id,
    });

    const snapshot = state.removeFrame(expressionFrameAsset.id);

    expect(snapshot.selectedFrameId).toBeUndefined();
    expect(snapshot.frames.map((frame) => frame.id)).toEqual([minimalFrameAsset.id]);
  });

  it('stores upserted frame copies instead of caller-owned objects', () => {
    const state = createFrameState({ frames: [minimalFrameAsset] });
    const nextFrame: FrameAsset = {
      ...expressionFrameAsset,
      fields: expressionFrameAsset.fields.map((field) => ({
        ...field,
        options: field.options.map((option) => ({ ...option })),
        ...(field.expressionConfig
          ? {
              expressionConfig: {
                expressions: field.expressionConfig.expressions.map((item) => ({ ...item })),
                variables: field.expressionConfig.variables.map((item) => ({ ...item })),
              },
            }
          : {}),
      })),
    };

    state.upsertFrame(nextFrame);
    nextFrame.name = '调用方后续修改不应写回';
    nextFrame.fields[0]!.name = '调用方字段后续修改不应写回';

    const snapshot = state.getSnapshot();
    expect(snapshot.frames.find((frame) => frame.id === expressionFrameAsset.id)?.name).toBe(
      expressionFrameAsset.name,
    );
    expect(
      snapshot.frames.find((frame) => frame.id === expressionFrameAsset.id)?.fields[0]?.name,
    ).toBe(expressionFrameAsset.fields[0]!.name);
  });
});

describe('frame asset service pilot', () => {
  it('rejects invalid replacement without mutating the current state', () => {
    const service = createFrameAssetService(
      createFrameState({
        frames: [minimalFrameAsset],
        selectedFrameId: minimalFrameAsset.id,
      }),
    );

    const result = service.replaceFrames([duplicateFieldNameFrameAsset]);

    expect(result.ok).toBe(false);
    expect(result.validation.issues.map((issue) => issue.code)).toContain('frame.fieldNameDuplicate');
    expect(service.getSnapshot().frames.map((frame) => frame.id)).toEqual([minimalFrameAsset.id]);
    expect(service.getSelectedFrame()?.id).toBe(minimalFrameAsset.id);
  });

  it('loads warning-only legacy migration results into frame state', () => {
    const service = createFrameAssetService();

    const result = service.loadLegacyFrameConfig(legacyFrameConfigWithoutDataParticipationTypeSample, '123');

    expect(result.ok).toBe(true);
    expect(result.migration.issues.map((issue) => issue.code)).toEqual([
      'legacy.dataParticipationDefaulted',
      'legacy.dataParticipationDefaulted',
    ]);
    expect(service.getSelectedFrame()?.id).toBe('123');
    expect(service.listFieldReferences({ frameId: '123' }).map((field) => field.fieldName)).toEqual([
      '111',
      '222',
    ]);
  });

  it('does not select a missing frame id', () => {
    const service = createFrameAssetService(
      createFrameState({
        frames: [minimalFrameAsset],
        selectedFrameId: minimalFrameAsset.id,
      }),
    );

    const result = service.selectFrame('missing-frame');

    expect(result.ok).toBe(false);
    expect(result.validation.issues).toEqual([
      {
        code: 'frame.selectionMissing',
        path: 'selectedFrameId',
        message: '未找到帧: missing-frame',
        severity: 'error',
      },
    ]);
    expect(service.getSelectedFrame()?.id).toBe(minimalFrameAsset.id);
  });
});

describe('frame selector and public api pilot', () => {
  it('projects read-only summaries and field references for later consumers', () => {
    const service = createFrameAssetService(
      createFrameState({
        frames: [minimalFrameAsset, expressionFrameAsset],
        selectedFrameId: expressionFrameAsset.id,
      }),
    );

    expect(service.listFrames({ query: '表达式' })).toEqual([
      {
        id: expressionFrameAsset.id,
        name: expressionFrameAsset.name,
        direction: expressionFrameAsset.direction,
        fieldCount: expressionFrameAsset.fields.length,
        description: expressionFrameAsset.description,
        frameType: expressionFrameAsset.frameType,
        protocol: expressionFrameAsset.protocol,
        isFavorite: false,
      },
    ]);
    expect(service.listFrameReferences()).toEqual([
      {
        value: minimalFrameAsset.id,
        label: minimalFrameAsset.name,
        direction: minimalFrameAsset.direction,
        fieldCount: minimalFrameAsset.fields.length,
        isFavorite: false,
      },
      {
        value: expressionFrameAsset.id,
        label: expressionFrameAsset.name,
        direction: expressionFrameAsset.direction,
        fieldCount: expressionFrameAsset.fields.length,
        isFavorite: false,
      },
    ]);
    expect(service.listFieldReferences({ frameId: expressionFrameAsset.id }).map((item) => item.fieldId)).toEqual([
      'field-source',
      'field-expression',
    ]);
  });

  it('returns cloned frames from read selectors', () => {
    const service = createFrameAssetService(createFrameState({ frames: [minimalFrameAsset] }));

    const externalFrame = service.getFrame(minimalFrameAsset.id)! as FrameAsset;
    externalFrame.fields[0]!.name = '外部 selector 修改';

    expect(service.getFrame(minimalFrameAsset.id)!.fields[0]!.name).toBe(
      minimalFrameAsset.fields[0]!.name,
    );
  });

  it('deep-clones identifierRules so mutating the returned frame does not affect state', () => {
    const service = createFrameAssetService(
      createFrameState({ frames: [frameAssetWithIdentifierRules] }),
    );

    const externalFrame = service.getFrame(frameAssetWithIdentifierRules.id)! as FrameAsset;
    externalFrame.identifierRules![0]!.value = 'HACKED';
    externalFrame.identifierRules![1]!.startIndex = 999;

    const nextRead = service.getFrame(frameAssetWithIdentifierRules.id)!;
    expect(nextRead.identifierRules![0]!.value).toBe('0xAA');
    expect(nextRead.identifierRules![1]!.startIndex).toBe(2);
  });

  it('keeps projection mutations outside the backing state', () => {
    const service = createFrameAssetService(createFrameState({ frames: [minimalFrameAsset] }));

    const summaries = service.listFrames();
    const references = service.listFrameReferences();
    summaries[0]!.name = '外部 summary 修改';
    references[0]!.label = '外部 reference 修改';

    expect(service.listFrames()[0]!.name).toBe(minimalFrameAsset.name);
    expect(service.listFrameReferences()[0]!.label).toBe(minimalFrameAsset.name);
  });

  it('keeps the feature root public api read-only for this pilot', () => {
    const reader = framePublicApi.createFrameAssetReader(() => ({
      frames: [minimalFrameAsset],
      selectedFrameId: minimalFrameAsset.id,
    }));

    expect(reader.getSelectedFrame()?.id).toBe(minimalFrameAsset.id);
    expect(framePublicApi).toHaveProperty('createFrameAssetReader');
    expect(framePublicApi).not.toHaveProperty('createFrameAssetService');
    expect(framePublicApi).not.toHaveProperty('createFrameState');
  });
});

describe('frame serialization pilot', () => {
  it('serializes frames with schemaVersion: 1', () => {
    const json = serializeFrames([minimalFrameAsset]);
    const parsed = JSON.parse(json);

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.frames).toHaveLength(1);
    expect(parsed.frames[0]!.id).toBe(minimalFrameAsset.id);
  });

  it('round-trips frames through serialize then deserialize', () => {
    const frames = [minimalFrameAsset, expressionFrameAsset, frameAssetWithIdentifierRules];
    const json = serializeFrames(frames);
    const result = deserializeFrames(json);

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.frames).toHaveLength(3);
    expect(result.frames[0]!.id).toBe(minimalFrameAsset.id);
    expect(result.frames[1]!.id).toBe(expressionFrameAsset.id);
    expect(result.frames[2]!.id).toBe(frameAssetWithIdentifierRules.id);
  });

  it('round-trips preserves factor and identifierRules values', () => {
    const json = serializeFrames([frameAssetWithIdentifierRules]);
    const result = deserializeFrames(json);

    expect(result.ok).toBe(true);
    expect(result.frames[0]!.fields[1]!.factor).toBeCloseTo(0.01);
    expect(result.frames[0]!.identifierRules).toEqual(frameAssetWithIdentifierRules.identifierRules);
  });

  it('deserializes legacy JSON without schemaVersion through migration', () => {
    const legacyJson = JSON.stringify([
      {
        id: 'LEGACY',
        name: '旧格式帧',
        direction: 'send',
        fields: [
          { id: 'f1', name: '数据', dataType: 'uint8', length: 1, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct' },
        ],
        identifierRules: [],
      },
    ]);

    const result = deserializeFrames(legacyJson);

    expect(result.ok).toBe(true);
    expect(result.frames[0]!.id).toBe('LEGACY');
  });

  it('rejects invalid JSON text', () => {
    const result = deserializeFrames('not valid json');

    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain('deserialize.parseError');
    expect(result.frames).toEqual([]);
  });
});
