// 录制文件读取服务(纯函数为主,可单测)。
// 读 .bin 整文件字节 → 解析 magic + 帧定义块 + 帧记录流 → 用内嵌帧定义调
// parseReceiveFrameFields → 字段时间序列。供 useHistoryData 消费(spec §五.1)。
//
// 核心原则:
// - 帧定义漂移根治:用文件头内嵌的帧定义解析,不依赖当前 frameReader。
// - 老格式(无帧定义块)抛错,调用方 catch 跳过(spec §3.4,不向后兼容)。
// - 整文件读:最坏 ~2MB,解码个位数毫秒(不引入 mmap/流式)。
import {
  RECORDING_FILE_MAGIC,
  decodeFrameRecords,
  decodeFrameDefinitions,
  type RecordingFrameRecord,
  type FrameDefinitionEntry,
} from '../core/serialization';
import { parseReceiveFrameFields } from '@/features/receive/core/field-parser';
import type { FrameAsset } from '@/features/frame';

/** 解析后的录制文件内容:内嵌帧定义 + 帧记录(原始字节)。 */
export interface RecordingFileContent {
  /** 内嵌帧定义:frameId → FrameAsset(防漂移)。 */
  readonly frameDefs: Map<string, FrameAsset>;
  /** 帧记录(原始字节,未解析)。 */
  readonly records: readonly RecordingFrameRecord[];
}

/** 单个字段时间序列中的一个时间点。 */
export interface FieldTimePoint {
  /** 帧捕获时间(epoch 秒,与录制时一致)。 */
  readonly capturedAt: number;
  /** 字段解析值(number/string/null)。 */
  readonly value: number | string | null;
}

/** 单帧的字段时间序列(每个 field 一组时间点)。 */
export interface FrameFieldSeries {
  readonly frameId: string;
  readonly fields: {
    readonly fieldId: string;
    readonly fieldName: string;
    readonly points: readonly FieldTimePoint[];
  }[];
}

// 解析整文件字节(magic + 帧定义块 + 帧记录)。
// 老格式(无帧定义块)抛错——调用方应 catch 跳过该文件(spec §3.4)。
export function parseRecordingFileBytes(data: Uint8Array): RecordingFileContent {
  const buf = Buffer.from(data);
  if (buf.length < 4 || buf.subarray(0, 4).toString('ascii') !== RECORDING_FILE_MAGIC) {
    throw new Error('not a recording file (bad magic)');
  }
  // 帧定义块:uint32 frameDefBlockLen(在 magic 之后)+ 内容
  if (buf.length < 8) {
    throw new Error('old-format file (no frame-def block)');
  }
  const blockLen = buf.readUInt32LE(4);
  const blockStart = 8;
  // blockLen 异常(超过文件剩余)→ 判定为老格式(magic 后直接是帧记录流,读出来的
  // frameDefBlockLen 其实是帧记录的前 4 字节,通常是个小数但偶发越界)。
  if (blockStart + blockLen > buf.length) {
    throw new Error('old-format file (no frame-def block)');
  }
  const defEntries: FrameDefinitionEntry[] = decodeFrameDefinitions(buf.subarray(blockStart, blockStart + blockLen));
  const frameDefs = new Map<string, FrameAsset>();
  for (const e of defEntries) {
    try {
      frameDefs.set(e.frameId, JSON.parse(e.frameAssetJson) as FrameAsset);
    } catch {
      // 单个帧定义 JSON 坏了跳过,不整文件失败(其余帧仍可解析)。
    }
  }
  const recordBytes = buf.subarray(blockStart + blockLen);
  const records = decodeFrameRecords(recordBytes);
  return { frameDefs, records };
}

// 用内嵌帧定义解析帧记录成字段时间序列。selectedFrameIds 过滤(只解析选中的帧)。
// 注意(易错点):ReceiveParsedFieldValue 的属性名是 fieldId/fieldName/value,
// 不是 id/name(见 receive/core/types.ts:88-102)。
export function parseRecordingToFieldSeries(
  content: RecordingFileContent,
  selectedFrameIds: readonly string[],
): FrameFieldSeries[] {
  const selected = new Set(selectedFrameIds);
  // 按 frameId 分组帧记录
  const byFrame = new Map<string, RecordingFrameRecord[]>();
  for (const r of content.records) {
    if (!selected.has(r.frameId)) continue;
    if (!content.frameDefs.has(r.frameId)) continue; // 无内嵌定义,跳过(漂移兜底)
    const arr = byFrame.get(r.frameId) ?? [];
    arr.push(r);
    byFrame.set(r.frameId, arr);
  }

  const result: FrameFieldSeries[] = [];
  for (const [frameId, recs] of byFrame) {
    const frame = content.frameDefs.get(frameId)!;
    // 按时间排序(帧记录可能因批处理乱序)
    const sorted = [...recs].sort((a, b) => a.capturedAt - b.capturedAt);
    // 每个 field 收集时间点
    const fieldMap = new Map<string, { fieldName: string; points: FieldTimePoint[] }>();
    for (const r of sorted) {
      const outcome = parseReceiveFrameFields({ frame, bytes: r.bytes });
      for (const f of outcome.fields) {
        const existing = fieldMap.get(f.fieldId) ?? { fieldName: f.fieldName, points: [] };
        existing.points.push({ capturedAt: r.capturedAt, value: f.value });
        fieldMap.set(f.fieldId, existing);
      }
    }
    result.push({
      frameId,
      fields: Array.from(fieldMap.entries()).map(([fieldId, v]) => ({
        fieldId,
        fieldName: v.fieldName,
        points: v.points,
      })),
    });
  }
  return result;
}
