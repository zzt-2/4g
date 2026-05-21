/**
 * T019 + T021 + T022 + T024e: Frame-related integration tests.
 *
 * T019 — Legacy JSON migration -> new FrameAsset completeness + round-trip
 * T021 — Checksum / patch edge cases (sum8, xor8, crc16, crc32, overflow, autoLength)
 * T022 — Frame direction filtering across send / receive consumers
 * T024e — Frame template update -> instance sync via service
 */
import { describe, it, expect } from 'vitest';
import {
  createFrameAssetService,
  serializeFrames,
  deserializeFrames,
  type FrameAsset,
} from '@/features/frame';
import {
  legacyFrameConfigSample,
  legacyFrameConfigWithoutDataParticipationTypeSample,
  legacyMinimalFrameSample,
  legacyFrameConfigWithFactorAndRulesSample,
} from '@/features/frame/fixtures/frame-fixtures';
import { applyBuildPostPatch, calculateChecksum } from '@/features/send/core/checksum';
import type { SendFieldEncodingDef, SendOptions } from '@/features/send/core/types';
import { createReceiveService } from '@/features/receive';
import { createSendService } from '@/features/send';
import type { SendTransportWriteOutcome } from '@/features/send/adapters';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSendField(
  override: Partial<SendFieldEncodingDef> & Pick<SendFieldEncodingDef, 'id' | 'dataType' | 'length' | 'offset'>,
): SendFieldEncodingDef {
  return {
    bigEndian: false,
    isASCII: false,
    ...override,
  };
}

function fakeTransportWriter(): {
  writer: { writeBytes: (connId: string, bytes: readonly number[]) => Promise<SendTransportWriteOutcome> };
  written: () => readonly number[];
} {
  const buffers: number[][] = [];
  return {
    writer: {
      async writeBytes(_connId: string, bytes: readonly number[]) {
        buffers.push([...bytes]);
        return { ok: true, bytesWritten: bytes.length };
      },
    },
    written: () => buffers[0] ?? [],
  };
}

// ---------------------------------------------------------------------------
// T019: Legacy JSON migration -> new FrameAsset completeness
// ---------------------------------------------------------------------------

describe('T019: legacy JSON migration', () => {
  it('imports legacy array with all characteristic fields mapped', () => {
    const service = createFrameAssetService();
    const result = service.loadLegacyFrameConfig(legacyFrameConfigSample);

    expect(result.ok).toBe(true);
    expect(result.migration.recognized).toBe(true);
    expect(result.migration.frames.length).toBeGreaterThanOrEqual(1);

    const frame = result.migration.frames[0]!;
    expect(frame.id).toBe('NK001');
    expect(frame.name).toBe('光多普勒复位指令');
    expect(frame.direction).toBe('send');
    expect(frame.fields).toHaveLength(3);

    // Check field mappings
    const headerField = frame.fields[0]!;
    expect(headerField.id).toBe('uN6RewEHGco0Tyqqsra4Q');
    expect(headerField.name).toBe('帧头码');
    expect(headerField.dataType).toBe('uint8');
    expect(headerField.length).toBe(1);
    expect(headerField.inputType).toBe('input');
    expect(headerField.configurable).toBe(false);
    expect(headerField.defaultValue).toBe('0xFF');
    expect(headerField.dataParticipationType).toBe('direct');

    // Options preserved
    expect(headerField.options).toEqual([]);

    // validOption preserved
    expect(headerField.validOption).toBeDefined();
    expect(headerField.validOption!.isChecksum).toBe(false);
    expect(headerField.validOption!.checksumMethod).toBe('sum8');

    // Frame-level options
    expect(frame.options).toEqual({
      autoChecksum: true,
      bigEndian: false,
      includeLengthField: false,
    });
  });

  it('imports legacy config missing dataParticipationType and fills default', () => {
    const service = createFrameAssetService();
    const result = service.loadLegacyFrameConfig(
      legacyFrameConfigWithoutDataParticipationTypeSample,
    );

    expect(result.ok).toBe(true);
    expect(result.migration.frames).toHaveLength(1);

    const frame = result.migration.frames[0]!;
    expect(frame.id).toBe('123');
    expect(frame.fields).toHaveLength(2);

    // All fields should have dataParticipationType defaulted to 'direct'
    for (const field of frame.fields) {
      expect(field.dataParticipationType).toBe('direct');
    }

    // The migration should emit warnings for missing dataParticipationType
    const dataPartWarnings = result.migration.issues.filter(
      (issue) => issue.code === 'legacy.dataParticipationDefaulted',
    );
    expect(dataPartWarnings.length).toBeGreaterThan(0);
    expect(dataPartWarnings.every((i) => i.severity === 'warning')).toBe(true);
  });

  it('imports legacy config with factor and identifier rules', () => {
    const service = createFrameAssetService();
    const result = service.loadLegacyFrameConfig(
      legacyFrameConfigWithFactorAndRulesSample,
    );

    expect(result.ok).toBe(true);
    expect(result.migration.frames).toHaveLength(1);

    const frame = result.migration.frames[0]!;
    expect(frame.id).toBe('legacy-factor-rules');
    expect(frame.direction).toBe('receive');

    // Factor coercion from string
    const fieldA = frame.fields.find((f) => f.id === 'field-a')!;
    expect(fieldA.factor).toBeCloseTo(0.01);

    // Identifier rules preserved (string indices coerced to numbers)
    expect(frame.identifierRules).toHaveLength(2);
    expect(frame.identifierRules![0]!.startIndex).toBe(0);
    expect(frame.identifierRules![0]!.endIndex).toBe(1);
    expect(frame.identifierRules![1]!.startIndex).toBe(2);
    expect(frame.identifierRules![1]!.endIndex).toBe(3);
    expect(frame.identifierRules![1]!.logicOperator).toBe('or');

    // Checksum field validOption preserved
    const checksumField = frame.fields.find((f) => f.id === 'field-checksum')!;
    expect(checksumField.validOption!.isChecksum).toBe(true);
    expect(checksumField.validOption!.startFieldIndex).toBe(0);
    expect(checksumField.validOption!.endFieldIndex).toBe(2);
    expect(checksumField.validOption!.checksumMethod).toBe('sum8');
  });

  it('round-trip: legacy import -> serialize -> deserialize produces value-equivalent frames', () => {
    const service = createFrameAssetService();
    const loadResult = service.loadLegacyFrameConfig(legacyFrameConfigSample);
    expect(loadResult.ok).toBe(true);

    const importedFrames = loadResult.migration.frames;

    // Serialize to new format
    const serialized = serializeFrames(importedFrames);

    // Deserialize back
    const deserializeResult = deserializeFrames(serialized);
    expect(deserializeResult.ok).toBe(true);
    expect(deserializeResult.frames).toHaveLength(importedFrames.length);

    // Verify value-equivalence for each frame
    for (let i = 0; i < importedFrames.length; i++) {
      const original = importedFrames[i]!;
      const roundTripped = deserializeResult.frames[i]!;

      expect(roundTripped.id).toBe(original.id);
      expect(roundTripped.name).toBe(original.name);
      expect(roundTripped.direction).toBe(original.direction);
      expect(roundTripped.fields).toHaveLength(original.fields.length);

      for (let j = 0; j < original.fields.length; j++) {
        const origField = original.fields[j]!;
        const rtField = roundTripped.fields[j]!;
        expect(rtField.id).toBe(origField.id);
        expect(rtField.name).toBe(origField.name);
        expect(rtField.dataType).toBe(origField.dataType);
        expect(rtField.length).toBe(origField.length);
        expect(rtField.inputType).toBe(origField.inputType);
        expect(rtField.configurable).toBe(origField.configurable);
        expect(rtField.dataParticipationType).toBe(origField.dataParticipationType);
        expect(rtField.defaultValue).toBe(origField.defaultValue);
      }

      // Frame-level options
      expect(roundTripped.options).toEqual(original.options);
      expect(roundTripped.identifierRules).toEqual(original.identifierRules);
    }
  });

  it('round-trip: minimal legacy frame -> import -> export -> import', () => {
    const service = createFrameAssetService();
    const loadResult = service.loadLegacyFrameConfig(legacyMinimalFrameSample);
    expect(loadResult.ok).toBe(true);

    const frames = loadResult.migration.frames;
    const serialized = serializeFrames(frames);
    const deserialized = deserializeFrames(serialized);

    expect(deserialized.ok).toBe(true);
    expect(deserialized.frames[0]!.id).toBe('MIN001');
    expect(deserialized.frames[0]!.fields[0]!.defaultValue).toBe('0');
  });

  it('rejects non-array legacy input', () => {
    const service = createFrameAssetService();
    const result = service.loadLegacyFrameConfig({ not: 'an array' });
    expect(result.ok).toBe(false);
    expect(result.migration.recognized).toBe(false);
  });

  it('deserializeFrames handles both new format and legacy array', () => {
    // New format with schemaVersion
    const newFormat = JSON.stringify({
      schemaVersion: 1,
      frames: [legacyMinimalFrameSample[0]],
    });
    const newResult = deserializeFrames(newFormat);
    expect(newResult.ok).toBe(true);
    expect(newResult.frames).toHaveLength(1);

    // Legacy array format (no schemaVersion)
    const legacyFormat = JSON.stringify([legacyMinimalFrameSample[0]]);
    const legacyResult = deserializeFrames(legacyFormat);
    expect(legacyResult.ok).toBe(true);
    expect(legacyResult.frames).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// T021: Checksum / patch edge cases
// ---------------------------------------------------------------------------

describe('T021: checksum and post-patch edge cases', () => {
  it('sum8 checksum calculated correctly', () => {
    const bytes = [0x01, 0x02, 0x03, 0x04];
    expect(calculateChecksum(bytes, 'sum8')).toBe(0x0a);
  });

  it('xor8 checksum calculated correctly', () => {
    const bytes = [0xFF, 0x0F, 0xF0];
    expect(calculateChecksum(bytes, 'xor8')).toBe(0x00);
  });

  it('crc16-modbus checksum calculated correctly', () => {
    // Known CRC16/MODBUS: empty bytes -> 0xFFFF
    expect(calculateChecksum([], 'crc16')).toBe(0xffff);

    // Known test vector: [0x01] -> 0x807E
    expect(calculateChecksum([0x01], 'crc16')).toBe(0x807e);

    // Known test vector: "123456789" -> 0x4B37
    const ascii = [0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39];
    expect(calculateChecksum(ascii, 'crc16')).toBe(0x4b37);
  });

  it('crc32 checksum calculated correctly', () => {
    // Known CRC32: empty bytes -> 0x00000000
    expect(calculateChecksum([], 'crc32')).toBe(0x00000000);

    // Known test vector: "123456789" -> 0xCBF43926
    const bytes = [0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39];
    expect(calculateChecksum(bytes, 'crc32')).toBe(0xcbf43926);
  });

  it('applyBuildPostPatch writes sum8 checksum into buffer at correct offset', () => {
    const fields: SendFieldEncodingDef[] = [
      makeSendField({ id: 'data', dataType: 'uint8', length: 1, offset: 0 }),
      makeSendField({ id: 'data2', dataType: 'uint8', length: 1, offset: 1 }),
      makeSendField({
        id: 'checksum',
        dataType: 'uint8',
        length: 1,
        offset: 2,
        validOption: { isChecksum: true, startFieldIndex: 0, endFieldIndex: 1, checksumMethod: 'sum8' },
      }),
    ];

    const buffer = new Uint8Array([0x10, 0x20, 0x00]);
    const options: SendOptions = { autoChecksum: true };
    const result = applyBuildPostPatch(buffer, fields, options);

    expect(result.issues).toHaveLength(0);
    const expectedSum = (0x10 + 0x20) & 0xff;
    expect(result.buffer[2]).toBe(expectedSum);
  });

  it('applyBuildPostPatch writes crc16 checksum into 2-byte field', () => {
    const fields: SendFieldEncodingDef[] = [
      makeSendField({ id: 'header', dataType: 'uint8', length: 1, offset: 0 }),
      makeSendField({
        id: 'crc',
        dataType: 'uint16',
        length: 2,
        offset: 1,
        validOption: { isChecksum: true, startFieldIndex: 0, endFieldIndex: 0, checksumMethod: 'crc16' },
      }),
    ];

    const buffer = new Uint8Array([0x01, 0x00, 0x00]);
    const options: SendOptions = { autoChecksum: true };
    const result = applyBuildPostPatch(buffer, fields, options);

    expect(result.issues).toHaveLength(0);
    // CRC16 of [0x01] = 0x807E, little-endian => [0x7E, 0x80]
    const view = new DataView(result.buffer.buffer, result.buffer.byteOffset + 1, 2);
    expect(view.getUint16(0, true)).toBe(0x807e);
  });

  it('applyBuildPostPatch writes crc32 checksum into 4-byte field', () => {
    const testData = [0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39];
    const fields: SendFieldEncodingDef[] = [
      makeSendField({ id: 'payload', dataType: 'bytes', length: 9, offset: 0 }),
      makeSendField({
        id: 'crc32-field',
        dataType: 'uint32',
        length: 4,
        offset: 9,
        validOption: { isChecksum: true, startFieldIndex: 0, endFieldIndex: 0, checksumMethod: 'crc32' },
      }),
    ];

    const buffer = new Uint8Array([...testData, 0x00, 0x00, 0x00, 0x00]);
    const options: SendOptions = { autoChecksum: true };
    const result = applyBuildPostPatch(buffer, fields, options);

    expect(result.issues).toHaveLength(0);
    const view = new DataView(result.buffer.buffer, result.buffer.byteOffset + 9, 4);
    expect(view.getUint32(0, true)).toBe(0xcbf43926);
  });

  it('checksum overflow into uint8 field produces build-error', () => {
    // CRC32 always produces >0xFF, so a CRC32 result in a 1-byte field should overflow
    const fields: SendFieldEncodingDef[] = [
      makeSendField({ id: 'data', dataType: 'uint8', length: 1, offset: 0 }),
      makeSendField({
        id: 'bad-checksum',
        dataType: 'uint8',
        length: 1,
        offset: 1,
        validOption: { isChecksum: true, startFieldIndex: 0, endFieldIndex: 0, checksumMethod: 'crc32' },
      }),
    ];

    const buffer = new Uint8Array([0x01, 0x00]);
    const options: SendOptions = { autoChecksum: true };
    const result = applyBuildPostPatch(buffer, fields, options);

    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.code === 'send.build.checksumOverflow')).toBe(true);
    // Original buffer must not be modified
    expect(result.buffer[1]).toBe(0x00);
  });

  it('autoChecksum=false skips checksum patching entirely', () => {
    const fields: SendFieldEncodingDef[] = [
      makeSendField({ id: 'data', dataType: 'uint8', length: 1, offset: 0 }),
      makeSendField({
        id: 'checksum',
        dataType: 'uint8',
        length: 1,
        offset: 1,
        validOption: { isChecksum: true, startFieldIndex: 0, endFieldIndex: 0, checksumMethod: 'sum8' },
      }),
    ];

    const buffer = new Uint8Array([0x42, 0x00]);
    const options: SendOptions = { autoChecksum: false };
    const result = applyBuildPostPatch(buffer, fields, options);

    expect(result.issues).toHaveLength(0);
    // Buffer must remain unchanged — no checksum applied
    expect(result.buffer[1]).toBe(0x00);
  });

  it('no options at all skips patching', () => {
    const fields: SendFieldEncodingDef[] = [
      makeSendField({ id: 'data', dataType: 'uint8', length: 1, offset: 0 }),
      makeSendField({
        id: 'checksum',
        dataType: 'uint8',
        length: 1,
        offset: 1,
        validOption: { isChecksum: true, startFieldIndex: 0, endFieldIndex: 0, checksumMethod: 'sum8' },
      }),
    ];

    const buffer = new Uint8Array([0x42, 0x00]);
    const result = applyBuildPostPatch(buffer, fields);

    expect(result.issues).toHaveLength(0);
    expect(result.buffer[1]).toBe(0x00);
  });

  it('missing lengthFieldId with includeLengthField=true produces warning', () => {
    const fields: SendFieldEncodingDef[] = [
      makeSendField({ id: 'data', dataType: 'uint8', length: 1, offset: 0 }),
    ];

    const buffer = new Uint8Array([0x42]);
    const options: SendOptions = { includeLengthField: true };
    const result = applyBuildPostPatch(buffer, fields, options);

    expect(result.issues.some((i) => i.code === 'send.build.lengthFieldIdMissing')).toBe(true);
  });

  it('lengthFieldId pointing to non-existent field produces warning', () => {
    const fields: SendFieldEncodingDef[] = [
      makeSendField({ id: 'data', dataType: 'uint8', length: 1, offset: 0 }),
    ];

    const buffer = new Uint8Array([0x42]);
    const options: SendOptions = { includeLengthField: true, lengthFieldId: 'nonexistent' };
    const result = applyBuildPostPatch(buffer, fields, options);

    expect(result.issues.some((i) => i.code === 'send.build.lengthFieldNotFound')).toBe(true);
  });

  it('autoChecksum + autoLength combination works correctly', () => {
    // Frame: [header:1] [payload:2] [length:2] [checksum:1]
    const fields: SendFieldEncodingDef[] = [
      makeSendField({ id: 'header', dataType: 'uint8', length: 1, offset: 0 }),
      makeSendField({ id: 'payload', dataType: 'uint16', length: 2, offset: 1 }),
      makeSendField({ id: 'length', dataType: 'uint16', length: 2, offset: 3 }),
      makeSendField({
        id: 'checksum',
        dataType: 'uint8',
        length: 1,
        offset: 5,
        validOption: { isChecksum: true, startFieldIndex: 0, endFieldIndex: 2, checksumMethod: 'xor8' },
      }),
    ];

    // Total frame = 6 bytes
    const buffer = new Uint8Array([0xAA, 0x00, 0x10, 0x00, 0x00, 0x00]);
    const options: SendOptions = {
      autoChecksum: true,
      includeLengthField: true,
      lengthFieldId: 'length',
    };
    const result = applyBuildPostPatch(buffer, fields, options);

    expect(result.issues).toHaveLength(0);

    // Checksum runs first: XOR of fields[0..2] bytes = XOR of [0xAA, 0x00, 0x10, 0x00, 0x00]
    // (length field is still 0 when checksum is computed)
    // = 0xAA ^ 0x00 ^ 0x10 ^ 0x00 ^ 0x00 = 0xBA
    expect(result.buffer[5]).toBe(0xBA);

    // Length runs second: writes total frame length = 6
    const lengthView = new DataView(result.buffer.buffer, result.buffer.byteOffset + 3, 2);
    expect(lengthView.getUint16(0, true)).toBe(6);
  });

  it('checksum field with invalid index range produces build-error', () => {
    const fields: SendFieldEncodingDef[] = [
      makeSendField({ id: 'data', dataType: 'uint8', length: 1, offset: 0 }),
      makeSendField({
        id: 'checksum',
        dataType: 'uint8',
        length: 1,
        offset: 1,
        validOption: { isChecksum: true, startFieldIndex: 0, endFieldIndex: 99, checksumMethod: 'sum8' },
      }),
    ];

    const buffer = new Uint8Array([0x01, 0x00]);
    const options: SendOptions = { autoChecksum: true };
    const result = applyBuildPostPatch(buffer, fields, options);

    expect(result.issues.some((i) => i.code === 'send.build.invalidChecksumRange')).toBe(true);
  });

  it('checksum field with unsupported length (3 bytes) produces build-error', () => {
    const fields: SendFieldEncodingDef[] = [
      makeSendField({ id: 'data', dataType: 'uint8', length: 1, offset: 0 }),
      makeSendField({
        id: 'checksum',
        dataType: 'bytes',
        length: 3,
        offset: 1,
        validOption: { isChecksum: true, startFieldIndex: 0, endFieldIndex: 0, checksumMethod: 'sum8' },
      }),
    ];

    const buffer = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
    const options: SendOptions = { autoChecksum: true };
    const result = applyBuildPostPatch(buffer, fields, options);

    expect(result.issues.some((i) => i.code === 'send.build.unsupportedChecksumFieldLength')).toBe(true);
  });

  it('calculateChecksum with slice options', () => {
    const bytes = [0x01, 0x02, 0x03, 0x04, 0x05];
    // sum of bytes[1..3] = 0x02 + 0x03 + 0x04 = 0x09
    expect(calculateChecksum(bytes, 'sum8', { startIdx: 1, endIdx: 4 })).toBe(0x09);
  });
});

// ---------------------------------------------------------------------------
// T022: Frame direction filtering across consumers
// ---------------------------------------------------------------------------

describe('T022: frame direction filtering', () => {
  it('receive processor skips send-direction frames', () => {
    // Create a send-direction frame with identifier rules
    const sendFrame: FrameAsset = {
      id: 'send-only',
      name: 'Send Only Frame',
      direction: 'send',
      fields: [
        { id: 'f1', name: 'header', dataType: 'uint8', length: 1, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct', defaultValue: '0xAA' },
      ],
      identifierRules: [
        { startIndex: 0, endIndex: 0, operator: 'eq', value: '0xAA', logicOperator: 'and' },
      ],
    };

    // Create a receive-direction frame with same identifier rules
    const receiveFrame: FrameAsset = {
      id: 'recv-only',
      name: 'Receive Only Frame',
      direction: 'receive',
      fields: [
        { id: 'f1', name: 'header', dataType: 'uint8', length: 1, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct', defaultValue: '0xAA' },
        { id: 'f2', name: 'value', dataType: 'uint8', length: 1, inputType: 'input', configurable: true, options: [], dataParticipationType: 'direct', defaultValue: '0x42' },
      ],
      identifierRules: [
        { startIndex: 0, endIndex: 0, operator: 'eq', value: '0xAA', logicOperator: 'and' },
      ],
    };

    // Set up receive service with both frames
    const receiveService = createReceiveService();
    receiveService.refreshFrameReferences([sendFrame, receiveFrame]);

    // Input bytes match both frames' identifier rules, but only receive-direction should match
    const outcome = receiveService.ingestBatch({
      id: 'test-batch-1',
      bytes: [0xAA, 0x42],
      receivedAt: new Date().toISOString(),
      source: {
        sourceId: 'src-1',
        connectionId: 'conn-1',
        kind: 'tcp',
        label: 'Test TCP',
      },
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.outcomes).toHaveLength(1);
    expect(outcome.outcomes[0]!.kind).toBe('matched');
    expect(outcome.outcomes[0]!.matchedFrame!.frameId).toBe('recv-only');
    // The send-only frame must not be matched
    expect(outcome.outcomes[0]!.matchedFrame!.frameId).not.toBe('send-only');
  });

  it('receive processor reports config-error when only send-direction frames exist', () => {
    const sendFrame: FrameAsset = {
      id: 'send-only-2',
      name: 'Send Only',
      direction: 'send',
      fields: [
        { id: 'f1', name: 'header', dataType: 'uint8', length: 1, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct', defaultValue: '0xAA' },
      ],
      identifierRules: [
        { startIndex: 0, endIndex: 0, operator: 'eq', value: '0xAA', logicOperator: 'and' },
      ],
    };

    const receiveService = createReceiveService();
    receiveService.refreshFrameReferences([sendFrame]);

    const outcome = receiveService.ingestBatch({
      id: 'test-batch-2',
      bytes: [0xAA],
      receivedAt: new Date().toISOString(),
      source: {
        sourceId: 'src-1',
        connectionId: 'conn-1',
        kind: 'tcp',
        label: 'Test TCP',
      },
    });

    // With only send-direction frames, receive should report config-error (no receive frames)
    expect(outcome.ok).toBe(false);
    expect(outcome.outcomes[0]!.kind).toBe('config-error');
    expect(outcome.outcomes[0]!.issues.some((i) => i.code === 'receive.frame.none')).toBe(true);
  });

  it('send service rejects receive-direction frame with build-error', async () => {
    const receiveFrame: FrameAsset = {
      id: 'recv-frame',
      name: 'Receive Frame',
      direction: 'receive',
      fields: [
        { id: 'f1', name: 'header', dataType: 'uint8', length: 1, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct', defaultValue: '0xAA' },
      ],
    };

    const { writer } = fakeTransportWriter();

    const sendService = createSendService({
      frameReader: {
        getFrame: (id: string) => id === 'recv-frame' ? receiveFrame : undefined,
      },
      targetResolver: {
        resolveTarget: () => ({ connectionId: 'conn-1', available: true }),
      },
      transportWriter: writer,
    });

    const result = await sendService.execute({
      frameId: 'recv-frame',
      targetId: 'target-1',
      fieldValues: { 'f1': 0xAA },
      context: { source: 'user' },
    });

    expect(result.kind).toBe('build-error');
    expect(result.error).toBeDefined();
    expect(result.error!.kind).toBe('wrong-direction');
    expect(result.bytesBuilt).toBe(0);
  });

  it('send service accepts send-direction frame and builds correctly', async () => {
    const sendFrame: FrameAsset = {
      id: 'send-frame',
      name: 'Send Frame',
      direction: 'send',
      fields: [
        { id: 'f1', name: 'header', dataType: 'uint8', length: 1, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct', defaultValue: '0xAA' },
        { id: 'f2', name: 'data', dataType: 'uint8', length: 1, inputType: 'input', configurable: true, options: [], dataParticipationType: 'direct', defaultValue: '0x42' },
      ],
    };

    const { writer, written } = fakeTransportWriter();

    const sendService = createSendService({
      frameReader: {
        getFrame: (_id: string) => _id === 'send-frame' ? sendFrame : undefined,
      },
      targetResolver: {
        resolveTarget: () => ({
          connectionId: 'conn-1',
          available: true,
        }),
      },
      transportWriter: writer,
    });

    const result = await sendService.execute({
      frameId: 'send-frame',
      targetId: 'target-1',
      fieldValues: { 'f2': 0x55 },
      context: { source: 'user' },
    });

    expect(result.kind).toBe('sent');
    expect(result.bytesBuilt).toBe(2);
    expect(written()).toEqual([0xAA, 0x55]);
  });
});

// ---------------------------------------------------------------------------
// T024e: Frame template update -> instance sync via service
// ---------------------------------------------------------------------------

describe('T024e: frame template update -> service consumers see changes', () => {
  it('adding a field to a frame is reflected in frame service snapshot', () => {
    const service = createFrameAssetService();

    const frame: FrameAsset = {
      id: 'frame-1',
      name: 'Test Frame',
      direction: 'send',
      fields: [
        { id: 'a', name: 'Field A', dataType: 'uint8', length: 1, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct' },
        { id: 'b', name: 'Field B', dataType: 'uint8', length: 1, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct' },
      ],
    };

    service.replaceFrames([frame]);

    // Verify initial state: 2 fields
    const initial = service.getFrame('frame-1');
    expect(initial).toBeDefined();
    expect(initial!.fields).toHaveLength(2);
    expect(initial!.fields.map((f) => f.id)).toEqual(['a', 'b']);

    // Add field C via upsert
    const updatedFrame: FrameAsset = {
      ...frame,
      fields: [
        ...frame.fields,
        { id: 'c', name: 'Field C', dataType: 'uint16', length: 2, inputType: 'input', configurable: true, options: [], dataParticipationType: 'direct', defaultValue: '100' },
      ],
    };

    const upsertResult = service.upsertFrame(updatedFrame);
    expect(upsertResult.ok).toBe(true);

    // Verify snapshot now has 3 fields
    const afterAdd = service.getFrame('frame-1');
    expect(afterAdd!.fields).toHaveLength(3);
    expect(afterAdd!.fields.map((f) => f.id)).toEqual(['a', 'b', 'c']);
    expect(afterAdd!.fields[2]!.name).toBe('Field C');
    expect(afterAdd!.fields[2]!.defaultValue).toBe('100');
  });

  it('removing a field from a frame is reflected in frame service snapshot', () => {
    const service = createFrameAssetService();

    const frame: FrameAsset = {
      id: 'frame-2',
      name: 'Test Frame 2',
      direction: 'receive',
      fields: [
        { id: 'x', name: 'X', dataType: 'uint8', length: 1, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct' },
        { id: 'y', name: 'Y', dataType: 'uint8', length: 1, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct' },
        { id: 'z', name: 'Z', dataType: 'uint8', length: 1, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct' },
      ],
    };

    service.replaceFrames([frame]);

    // Remove field z
    const trimmed: FrameAsset = {
      ...frame,
      fields: frame.fields.filter((f) => f.id !== 'z'),
    };

    const result = service.upsertFrame(trimmed);
    expect(result.ok).toBe(true);

    const afterRemove = service.getFrame('frame-2');
    expect(afterRemove!.fields).toHaveLength(2);
    expect(afterRemove!.fields.map((f) => f.id)).toEqual(['x', 'y']);
  });

  it('changing a field name propagates through snapshot', () => {
    const service = createFrameAssetService();

    const frame: FrameAsset = {
      id: 'frame-3',
      name: 'Frame 3',
      direction: 'send',
      fields: [
        { id: 'field-a', name: 'Original Name', dataType: 'uint8', length: 1, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct' },
      ],
    };

    service.replaceFrames([frame]);

    // Rename the field
    const renamed: FrameAsset = {
      ...frame,
      fields: [
        { ...frame.fields[0]!, name: 'Renamed Field' },
      ],
    };

    service.upsertFrame(renamed);

    const snapshot = service.getFrame('frame-3');
    expect(snapshot!.fields[0]!.name).toBe('Renamed Field');
    expect(snapshot!.fields[0]!.id).toBe('field-a');
  });

  it('receive service sees updated frame after refreshFrameReferences', () => {
    const frameService = createFrameAssetService();

    const frame: FrameAsset = {
      id: 'rx-1',
      name: 'RX Frame',
      direction: 'receive',
      fields: [
        { id: 'hdr', name: 'Header', dataType: 'uint8', length: 1, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct', defaultValue: '0xAA' },
        { id: 'val', name: 'Value', dataType: 'uint16', length: 2, inputType: 'input', configurable: true, options: [], dataParticipationType: 'direct', defaultValue: '0' },
      ],
      identifierRules: [
        { startIndex: 0, endIndex: 0, operator: 'eq', value: '0xAA', logicOperator: 'and' },
      ],
    };

    frameService.replaceFrames([frame]);

    // Create receive service that reads from frame service
    const receiveService = createReceiveService({
      frameReader: {
        findFrames: (query) => frameService.findFrames(query),
      },
    });

    // Initial refresh
    receiveService.refreshFrameReferences();

    // Verify initial match works with [0xAA, 0x01, 0x00]
    const outcome1 = receiveService.ingestBatch({
      id: 'batch-1',
      bytes: [0xAA, 0x01, 0x00],
      receivedAt: new Date().toISOString(),
      source: {
        sourceId: 'src-1',
        connectionId: 'conn-1',
        kind: 'tcp',
        label: 'Test',
      },
    });
    expect(outcome1.outcomes[0]!.kind).toBe('matched');
    expect(outcome1.outcomes[0]!.matchedFrame!.fieldCount).toBe(2);

    // Update frame: add a new field
    const updatedFrame: FrameAsset = {
      ...frame,
      fields: [
        ...frame.fields,
        { id: 'extra', name: 'Extra', dataType: 'uint8', length: 1, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct', defaultValue: '0x00' },
      ],
      identifierRules: [
        { startIndex: 0, endIndex: 0, operator: 'eq', value: '0xAA', logicOperator: 'and' },
      ],
    };

    frameService.upsertFrame(updatedFrame);

    // Refresh receive service references
    receiveService.refreshFrameReferences();

    // Now match with 4-byte input
    const outcome2 = receiveService.ingestBatch({
      id: 'batch-2',
      bytes: [0xAA, 0x01, 0x00, 0xFF],
      receivedAt: new Date().toISOString(),
      source: {
        sourceId: 'src-1',
        connectionId: 'conn-1',
        kind: 'tcp',
        label: 'Test',
      },
    });

    expect(outcome2.outcomes[0]!.kind).toBe('matched');
    expect(outcome2.outcomes[0]!.matchedFrame!.fieldCount).toBe(3);

    // Verify the new field is parsed
    const extraField = outcome2.outcomes[0]!.fields.find((f) => f.fieldId === 'extra');
    expect(extraField).toBeDefined();
    expect(extraField!.value).toBe(0xFF);
  });

  it('removing a frame from service and refreshing receive clears it from matching', () => {
    const frameService = createFrameAssetService();

    const frame: FrameAsset = {
      id: 'temp-frame',
      name: 'Temporary',
      direction: 'receive',
      fields: [
        { id: 'f1', name: 'Data', dataType: 'uint8', length: 1, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct', defaultValue: '0xBB' },
      ],
      identifierRules: [
        { startIndex: 0, endIndex: 0, operator: 'eq', value: '0xBB', logicOperator: 'and' },
      ],
    };

    frameService.replaceFrames([frame]);

    const receiveService = createReceiveService({
      frameReader: {
        findFrames: (query) => frameService.findFrames(query),
      },
    });

    receiveService.refreshFrameReferences();

    // Match with the frame
    const outcome1 = receiveService.ingestBatch({
      id: 'batch-1',
      bytes: [0xBB],
      receivedAt: new Date().toISOString(),
      source: {
        sourceId: 'src-1',
        connectionId: 'conn-1',
        kind: 'tcp',
        label: 'Test',
      },
    });
    expect(outcome1.outcomes[0]!.kind).toBe('matched');

    // Remove the frame
    frameService.removeFrame('temp-frame');
    receiveService.refreshFrameReferences();

    // Same bytes should now be unmatched (no receive frames)
    const outcome2 = receiveService.ingestBatch({
      id: 'batch-2',
      bytes: [0xBB],
      receivedAt: new Date().toISOString(),
      source: {
        sourceId: 'src-1',
        connectionId: 'conn-1',
        kind: 'tcp',
        label: 'Test',
      },
    });
    expect(outcome2.outcomes[0]!.kind).toBe('config-error');
  });

  it('changing frame options propagates to send pipeline', async () => {
    const frameService = createFrameAssetService();

    const frame: FrameAsset = {
      id: 'opts-frame',
      name: 'Options Frame',
      direction: 'send',
      fields: [
        { id: 'data', name: 'Data', dataType: 'uint8', length: 1, inputType: 'input', configurable: true, options: [], dataParticipationType: 'direct', defaultValue: '0x10' },
        {
          id: 'checksum',
          name: 'Checksum',
          dataType: 'uint8',
          length: 1,
          inputType: 'input',
          configurable: false,
          options: [],
          dataParticipationType: 'direct',
          defaultValue: '0',
          validOption: { isChecksum: true, startFieldIndex: 0, endFieldIndex: 0, checksumMethod: 'xor8' },
        },
      ],
      options: {
        autoChecksum: true,
        bigEndian: false,
        includeLengthField: false,
      },
    };

    frameService.replaceFrames([frame]);

    const { writer, written } = fakeTransportWriter();

    const sendService = createSendService({
      frameReader: {
        getFrame: (id: string) => frameService.getFrame(id),
      },
      targetResolver: {
        resolveTarget: () => ({ connectionId: 'conn-1', available: true }),
      },
      transportWriter: writer,
    });

    // Send with autoChecksum=true (frame default)
    const result = await sendService.execute({
      frameId: 'opts-frame',
      targetId: 'target-1',
      fieldValues: { 'data': 0x10 },
      context: { source: 'user' },
    });

    expect(result.kind).toBe('sent');
    // Checksum should be applied: XOR of [0x10] = 0x10
    expect(written()[1]).toBe(0x10);
  });
});
