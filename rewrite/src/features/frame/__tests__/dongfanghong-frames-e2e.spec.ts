/**
 * 东方红帧定义端到端联调测试
 *
 * 覆盖：
 *   1. 全量 validate（53 条全部通过 validateFrameAssetCollection）
 *   2. send 帧编码往返（33 条 direction: 'send'，含 3 条测试帧）
 *   3. receive 帧解码往返（20 条 direction: 'receive'，含 3 条测试帧）
 *   4. uint64 端到端（comm_rx runtime 4 个合并后的 uint64 字段）
 *   5. B 类脉冲帧字节布局（16 字节，length word = 4）
 *   6. 测试帧收发回环（send 编码 → matchReceiveFrame 匹配 → parseReceiveFrameFields 解析）
 */

import { describe, expect, it } from 'vitest';

import { dongfanghongFrames } from '../fixtures/dongfanghong-frames';
import {
  validateFrameAssetCollection,
  type FrameAsset,
} from '../core';
import {
  buildFrame,
  frameToBuildInput,
  type SendBuildInput,
  type SendFieldValue,
} from '../../send/core';
import {
  parseReceiveFrameFields,
} from '../../receive/core/field-parser';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** 默认 fieldValues：每个 configurable 字段填 defaultValue（fallback '0'）。 */
function buildDefaultFieldValues(frame: FrameAsset): Record<string, SendFieldValue> {
  const values: Record<string, SendFieldValue> = {};
  for (const field of frame.fields) {
    const hasUserValue = field.configurable && field.defaultValue !== undefined;
    if (hasUserValue) {
      values[field.id] = field.defaultValue ?? '0';
    } else if (field.defaultValue !== undefined) {
      // skeleton fields（sync/length/header/checksum）也会用 defaultValue
      values[field.id] = field.defaultValue;
    }
  }
  return values;
}

/** 把 FrameAsset 转成 SendBuildInput，并填上默认值。 */
function frameToDefaultBuildInput(frame: FrameAsset): SendBuildInput {
  const { fields, totalByteLength } = frameToBuildInput(frame);
  return {
    fields,
    totalByteLength,
    fieldValues: buildDefaultFieldValues(frame),
  };
}

function sendFrames(): FrameAsset[] {
  return dongfanghongFrames.filter((f) => f.direction === 'send');
}

function receiveFrames(): FrameAsset[] {
  return dongfanghongFrames.filter((f) => f.direction === 'receive');
}

const sendFrameCount = sendFrames().length;
const receiveFrameCount = receiveFrames().length;
const totalFrameCount = dongfanghongFrames.length;

// ---------------------------------------------------------------------------
// 1. 全量 validate
// ---------------------------------------------------------------------------

describe('dongfanghong-frames e2e: validation', () => {
  it(`validates all ${totalFrameCount} frames as a collection`, () => {
    expect(totalFrameCount).toBe(53);
    const result = validateFrameAssetCollection(dongfanghongFrames);
    if (!result.valid) {
      // 把 issue 摊开让 vitest 报告具体哪条帧失败
      const summary = result.issues
        .map((i) => `[${i.severity}] ${i.path}: ${i.message}`)
        .join('\n');
      throw new Error(`collection not valid:\n${summary}`);
    }
    expect(result.valid).toBe(true);
  });

  it(`covers ${sendFrameCount} send frames`, () => {
    expect(sendFrameCount).toBe(33);
  });

  it(`covers ${receiveFrameCount} receive frames`, () => {
    expect(receiveFrameCount).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// 2. send 帧编码往返（30 条）
// ---------------------------------------------------------------------------

describe('dongfanghong-frames e2e: send encode roundtrip', () => {
  for (const frame of sendFrames()) {
    it(`builds send frame "${frame.id}" with default values without error`, () => {
      const input = frameToDefaultBuildInput(frame);
      const output = buildFrame(input);

      // 字节长度 = sum(field.length)
      const expectedLength = frame.fields.reduce((sum, f) => sum + f.length, 0);
      expect(output.bytes.byteLength).toBe(expectedLength);

      // 不应有 error 级 issue
      const errors = output.issues.filter((i) => i.severity === 'error');
      expect(errors).toEqual([]);

      // sync（fields[0]，defaultValue 0x1ACFFC1D）必须编码到 byte 0..3（big-endian）
      const sync = frame.fields[0];
      expect(sync?.id).toBe('sync');
      expect(Array.from(output.bytes.slice(0, 4))).toEqual([0x1a, 0xcf, 0xfc, 0x1d]);

      // length 字段（fields[1]，big-endian uint32）应在 byte 4..7
      const lengthField = frame.fields[1];
      expect(lengthField?.id).toBe('length');
      const dv = new DataView(output.bytes.buffer, output.bytes.byteOffset, output.bytes.byteLength);
      const lengthWord = dv.getUint32(4, false);
      // length word = payload 字节数 = (1 header + N data word) * 4
      // 数据 word 数 = sum(数据字段 length) / 4（uint32=1word, uint64/bytes 占多 word）
      // 注意：脉冲帧 fields.length=4，数据 word = 0
      const dataByteCount = frame.fields
        .filter((f) => !['sync', 'length', 'header', 'checksum'].includes(f.id))
        .reduce((sum, f) => sum + f.length, 0);
      const expectedLengthWord = 4 + dataByteCount;
      expect(lengthWord).toBe(expectedLengthWord);

      // checksum 字段（fields 最后一个）应在 byte [totalByteLength-4 .. totalByteLength-1]
      const checksumField = frame.fields[frame.fields.length - 1];
      expect(checksumField?.id).toBe('checksum');
    });
  }
});

// ---------------------------------------------------------------------------
// 3. receive 帧解码往返（17 条）
// ---------------------------------------------------------------------------

describe('dongfanghong-frames e2e: receive decode roundtrip', () => {
  for (const frame of receiveFrames()) {
    it(`parses receive frame "${frame.id}" from zero-filled bytes without exception`, () => {
      const totalLength = frame.fields.reduce((sum, f) => sum + f.length, 0);
      const bytes = new Array(totalLength).fill(0);

      const outcome = parseReceiveFrameFields({ frame, bytes });

      // 不应抛异常（parseReceiveFrameFields 本身不 throw，但 issues 反映异常）
      // 这里只检查 direct 字段都被解析到（数量 = direct 字段数）
      const directFieldCount = frame.fields.filter(
        (f) => f.dataParticipationType === 'direct',
      ).length;
      expect(outcome.fields.length).toBe(directFieldCount);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. uint64 端到端
// ---------------------------------------------------------------------------

describe('dongfanghong-frames e2e: uint64 high/low merged field roundtrip', () => {
  // comm_rx runtime 的 4 个合并后 uint64 字段
  const commRxRuntime = dongfanghongFrames.find((f) => f.id === 'tm-comm-rx-runtime');
  const uint64FieldIds = [
    'pre-total-bit-count-sec',
    'pre-dec-err-bits-sec',
    'post-total-bit-count-sec',
    'post-dec-err-bits-sec',
  ];

  it('tm-comm-rx-runtime exists in fixture', () => {
    expect(commRxRuntime).toBeDefined();
  });

  it('uint64 fields are present as single uint64 fields (not high/low split)', () => {
    for (const id of uint64FieldIds) {
      const field = commRxRuntime!.fields.find((f) => f.id === id);
      expect(field, `field ${id} should exist`).toBeDefined();
      expect(field!.dataType).toBe('uint64');
      expect(field!.length).toBe(8);
    }
  });

  it('decodes a large uint64 (2^53+1) preserving full precision', () => {
    // 2^53+1 是 number 无法精确表示的最小整数，用 bigint 验证精度不丢
    const original = 9_007_199_254_740_993n;
    const field = commRxRuntime!.fields.find((f) => f.id === 'pre-total-bit-count-sec')!;
    const offset = commRxRuntime!.fields
      .slice(0, commRxRuntime!.fields.indexOf(field))
      .reduce((sum, f) => sum + f.length, 0);

    const totalLength = commRxRuntime!.fields.reduce((sum, f) => sum + f.length, 0);
    const bytes = new Array(totalLength).fill(0);
    // big-endian uint64
    const buf = new ArrayBuffer(8);
    new DataView(buf).setBigUint64(0, original, false);
    const u8 = new Uint8Array(buf);
    for (let i = 0; i < 8; i++) bytes[offset + i] = u8[i]!;

    const outcome = parseReceiveFrameFields({ frame: commRxRuntime!, bytes });
    const parsed = outcome.fields.find((f) => f.fieldId === 'pre-total-bit-count-sec');
    expect(parsed).toBeDefined();
    expect(parsed!.value).toBe(original.toString());
  });

  it('decodes all 4 merged uint64 fields preserving distinct large values', () => {
    // 给每个 uint64 字段填入不同的 2^53 以上的值
    const originals = [
      9_007_199_254_740_993n, // 2^53+1
      9_007_199_254_740_997n, // 2^53+5
      18_446_744_073_709_551_614n, // 2^64-2
      9_223_372_036_854_775_807n, // 2^63-1
    ];

    const totalLength = commRxRuntime!.fields.reduce((sum, f) => sum + f.length, 0);
    const bytes = new Array(totalLength).fill(0);

    for (let i = 0; i < uint64FieldIds.length; i++) {
      const fieldId = uint64FieldIds[i]!;
      const field = commRxRuntime!.fields.find((f) => f.id === fieldId)!;
      const offset = commRxRuntime!.fields
        .slice(0, commRxRuntime!.fields.indexOf(field))
        .reduce((sum, f) => sum + f.length, 0);
      const buf = new ArrayBuffer(8);
      new DataView(buf).setBigUint64(0, originals[i]!, false);
      const u8 = new Uint8Array(buf);
      for (let j = 0; j < 8; j++) bytes[offset + j] = u8[j]!;
    }

    const outcome = parseReceiveFrameFields({ frame: commRxRuntime!, bytes });
    for (let i = 0; i < uint64FieldIds.length; i++) {
      const parsed = outcome.fields.find((f) => f.fieldId === uint64FieldIds[i]);
      expect(parsed, `field ${uint64FieldIds[i]} should be parsed`).toBeDefined();
      expect(parsed!.value).toBe(originals[i]!.toString());
    }
  });
});

// ---------------------------------------------------------------------------
// 5. B 类脉冲帧字节布局
// ---------------------------------------------------------------------------

describe('dongfanghong-frames e2e: pulse frame byte layout', () => {
  // 抽 3 条不同模块的脉冲帧验证（adc/gt/cxp）
  const pulseFrames = ['rc-adc-pulse-reset', 'rc-gt-pulse-reset', 'rc-cxp-pulse-reset'];

  for (const frameId of pulseFrames) {
    it(`"${frameId}" builds to 16 bytes with length word = 4`, () => {
      const frame = dongfanghongFrames.find((f) => f.id === frameId);
      expect(frame, `${frameId} should exist`).toBeDefined();

      // B 类脉冲帧 fields = [sync, length, header, checksum]，无 payload
      const payloadFields = frame!.fields.filter(
        (f) => !['sync', 'length', 'header', 'checksum'].includes(f.id),
      );
      expect(payloadFields).toEqual([]);

      const input = frameToDefaultBuildInput(frame!);
      const output = buildFrame(input);

      // 4 个骨架字段 x 4 字节 = 16 字节
      expect(output.bytes.byteLength).toBe(16);

      // length word = 4（payload 仅含 header，1 header word x 4 字节）
      const dv = new DataView(output.bytes.buffer, output.bytes.byteOffset, output.bytes.byteLength);
      expect(dv.getUint32(4, false)).toBe(4);

      // sync 必须是 0x1ACFFC1D
      expect(dv.getUint32(0, false)).toBe(0x1ACFFC1D);

      // 不应有 error 级 issue
      const errors = output.issues.filter((i) => i.severity === 'error');
      expect(errors).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// 6. 测试帧收发回环（send 编码 → identifierRules 匹配 → parseReceiveFrameFields 解析）
// ---------------------------------------------------------------------------

describe('dongfanghong-frames e2e: test chart frame send/receive loopback', () => {
  // 3 对回环测试帧：同 header word0 的 send + receive
  const loopbackPairs = [
    { sendId: 'rc-test-waveform-6', recvId: 'tm-test-waveform-6' },
    { sendId: 'rc-test-waveform-8', recvId: 'tm-test-waveform-8' },
    { sendId: 'rc-test-constellation', recvId: 'tm-test-constellation' },
  ];

  // 内联 identifierRules 匹配（不 import frame-matcher，避免触发 .vue 解析链）。
  // 逻辑同 frame-matcher.isRuleMatched：把字节切片转 hex 与 rule.value 归一化比较。
  function ruleMatches(bytes: readonly number[], rule: { startIndex: number; endIndex: number; value: string }): boolean {
    const seg = bytes.slice(rule.startIndex, rule.endIndex + 1);
    const actualHex = seg.map((b) => b.toString(16).padStart(2, '0')).join('');
    const expectedHex = rule.value.replace(/^0x/i, '').toLowerCase().padStart(seg.length * 2, '0');
    return actualHex === expectedHex;
  }

  for (const { sendId, recvId } of loopbackPairs) {
    it(`"${sendId}" encodes bytes that match & parse via "${recvId}"`, () => {
      const sendFrame = dongfanghongFrames.find((f) => f.id === sendId);
      const recvFrame = dongfanghongFrames.find((f) => f.id === recvId);
      expect(sendFrame, `${sendId} should exist`).toBeDefined();
      expect(recvFrame, `${recvId} should exist`).toBeDefined();

      // send/receive header word0 必须逐字节相同（回环匹配的前提）
      const sendHeader = sendFrame!.fields.find((f) => f.id === 'header')!.defaultValue;
      const recvHeader = recvFrame!.fields.find((f) => f.id === 'header')!.defaultValue;
      expect(sendHeader).toBe(recvHeader);

      // 1) send 编码：用默认值构帧（autoChecksum 自动算校验位）
      const output = buildFrame(frameToDefaultBuildInput(sendFrame!));
      const errors = output.issues.filter((i) => i.severity === 'error');
      expect(errors, `${sendId} build should have no errors`).toEqual([]);

      const bytes = Array.from(output.bytes);
      const dv = new DataView(output.bytes.buffer, output.bytes.byteOffset, output.bytes.byteLength);
      expect(dv.getUint32(0, false)).toBe(0x1ACFFC1D);

      // 2) receive 匹配：send 编码出的字节必须命中 recvFrame 全部 identifierRules
      //    （sync[0:3] + header[8:11] 双 eq 规则）
      const rules = recvFrame!.identifierRules ?? [];
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) {
        expect(ruleMatches(bytes, rule), `rule ${rule.startIndex}-${rule.endIndex}=${rule.value} should match`).toBe(true);
      }

      // 3) 用 receive 帧解析字节流，direct 字段全部解析到
      const parsed = parseReceiveFrameFields({ frame: recvFrame!, bytes });
      const directFieldCount = recvFrame!.fields.filter(
        (f) => f.dataParticipationType === 'direct',
      ).length;
      expect(parsed.fields.length).toBe(directFieldCount);

      // 4) send 帧数据字段默认值经回环后被 receive 正确解析（抽样校验首个数据字段）
      const firstDataField = recvFrame!.fields.find(
        (f) => !['sync', 'length', 'header', 'checksum'].includes(f.id),
      )!;
      const sendFirstValue = sendFrame!.fields.find((f) => f.id === firstDataField.id)!.defaultValue;
      const parsedFirst = parsed.fields.find((f) => f.fieldId === firstDataField.id);
      expect(parsedFirst, `field ${firstDataField.id} should be parsed`).toBeDefined();
      // 按字段类型分支比对：
      //   - 数值字段(uint32 等)：defaultValue 是 0x... hex，解析侧 value 是无符号十进制，按数值 BigInt 比对
      //   - bytes 字段：解析侧 value 是大写紧凑 hex（无 0x），与 defaultValue 归一化后字符串比对
      if (firstDataField.dataType === 'bytes') {
        const normalizedDefault = (sendFirstValue as string).replace(/^0x/i, '').replace(/\s/g, '').toUpperCase();
        expect(parsedFirst!.value).toBe(normalizedDefault);
      } else {
        expect(BigInt(parsedFirst!.value as string)).toBe(BigInt(sendFirstValue as string));
      }
    });
  }
});
