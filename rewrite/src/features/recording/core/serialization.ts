// 录制数据二进制序列化(纯函数,无副作用,可单测)。
// 格式见 spec §三.3:文件头 4B ASCII magic "RCD1" + 帧记录逐帧 append。
//
// 文件头(写一次,文件首部):
//   [4B magic]  "RCD1"            ASCII,格式版本识别
//
// 单帧记录布局(小端,无对齐填充):
//   [4B capturedAt]  uint32   epoch 秒(秒级精度足够画图;省字节 vs ISO 字符串)
//   [2B frameIdLen]  uint16   frameId UTF-8 字节长度
//   [NB frameId]     utf8     frameId(如 "frame-001")
//   [2B byteLen]     uint16   原始帧字节长度
//   [MB rawBytes]    bytes    原始帧字节
//
// 每帧固定开销 ≈ 8 字节 + frameId 长度,比整表快照 × ISO 字符串 × UUID key
// 小一到两个数量级。帧自描述(frameId + bytes),查看时 frameId 反查帧定义 →
// parseReceiveFrameFields 解析(下一轮 History spec 用)。

// 文件头:4 字节 ASCII magic "RCD1"(版本 1)。
export const RECORDING_FILE_MAGIC = 'RCD1' as const;

export interface RecordingFrameRecord {
  /** 帧捕获时间(epoch 秒)。 */
  readonly capturedAt: number;
  /** 帧定义 id(反查帧定义用)。 */
  readonly frameId: string;
  /** 原始帧字节(查看时解析)。 */
  readonly bytes: readonly number[];
}

// 单帧记录编码。frameId/bytes 超 uint16 上限抛错(防写坏文件)。
export function encodeFrameRecord(frame: RecordingFrameRecord): Buffer {
  const frameIdBuf = Buffer.from(frame.frameId, 'utf8');
  if (frameIdBuf.length > 0xffff) {
    throw new Error(`frameId too long: ${frameIdBuf.length} bytes`);
  }
  if (frame.bytes.length > 0xffff) {
    throw new Error(`frame bytes too long: ${frame.bytes.length}`);
  }
  const buf = Buffer.allocUnsafe(4 + 2 + frameIdBuf.length + 2 + frame.bytes.length);
  let offset = 0;
  buf.writeUInt32LE(frame.capturedAt >>> 0, offset); offset += 4;
  buf.writeUInt16LE(frameIdBuf.length, offset); offset += 2;
  frameIdBuf.copy(buf, offset); offset += frameIdBuf.length;
  buf.writeUInt16LE(frame.bytes.length, offset); offset += 2;
  for (let i = 0; i < frame.bytes.length; i++) {
    buf[offset + i] = frame.bytes[i] & 0xff;
  }
  return buf;
}

// 文件头编码(4 字节 magic)。
export function encodeFileHeader(): Buffer {
  return Buffer.from(RECORDING_FILE_MAGIC, 'ascii');
}

// 从 magic 头之后的字节流解码所有完整帧记录。
// 尾部不完整的帧(如写盘中途)被丢弃,不抛错——流式 append 天然容忍。
//
// 注意:decode 函数用 DataView + TextDecoder(跨环境 Web 标准),不用 Node Buffer——
// 因为 decode 在渲染进程(浏览器,无 Buffer)跑(useHistoryData→recording-reader→这里)。
// encode 留在主进程用 Buffer(主进程有 Buffer)。
export function decodeFrameRecords(data: Uint8Array): RecordingFrameRecord[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder('utf8');
  const records: RecordingFrameRecord[] = [];
  let offset = 0;
  while (offset < view.byteLength) {
    if (offset + 4 > view.byteLength) break; // 不完整时间戳,丢弃尾部
    const capturedAt = view.getUint32(offset, true); offset += 4;
    if (offset + 2 > view.byteLength) break;
    const frameIdLen = view.getUint16(offset, true); offset += 2;
    if (offset + frameIdLen > view.byteLength) break;
    const frameId = decoder.decode(data.subarray(offset, offset + frameIdLen)); offset += frameIdLen;
    if (offset + 2 > view.byteLength) break;
    const byteLen = view.getUint16(offset, true); offset += 2;
    if (offset + byteLen > view.byteLength) break;
    const bytes = Array.from(data.subarray(offset, offset + byteLen)); offset += byteLen;
    records.push({ capturedAt, frameId, bytes });
  }
  return records;
}

// ───── 帧定义块(spec §三.1) ─────
// session 开始时一次性写,内嵌当时帧定义(防帧定义漂移)。
// 录制时帧定义改了,旧 .bin 仍用它自己的内嵌定义解析,不依赖当前 frameReader。
//
// 布局: [uint16 count][count × (uint16 frameIdLen + frameId + uint32 jsonLen + json)]
// 外层由 encodeFrameDefinitionBlock 包 uint32 frameDefBlockLen(总长,不含本字段)。
// reader 解析时:magic → 读 frameDefBlockLen → 跳过那么多字节 → 剩余是帧记录流。

export interface FrameDefinitionEntry {
  /** 帧定义 id(与帧记录的 frameId 对应)。 */
  readonly frameId: string;
  /** 完整 FrameAsset 的 JSON 字符串(JSON.stringify(FrameAsset))。 */
  readonly frameAssetJson: string;
}

// 编码帧定义块内容(不含外层 frameDefBlockLen 前缀)。frameId/json 超长度上限抛错。
// 布局遵循 spec §三.1:每条 = [uint16 frameIdLen][frameId][uint32 jsonLen][json]
// (jsonLen 在 frameId 之后,与 decode 顺序一致;不在前面拼连续 header)。
export function encodeFrameDefinitions(defs: readonly FrameDefinitionEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const d of defs) {
    const frameIdBuf = Buffer.from(d.frameId, 'utf8');
    const jsonBuf = Buffer.from(d.frameAssetJson, 'utf8');
    if (frameIdBuf.length > 0xffff) {
      throw new Error(`frameId too long: ${frameIdBuf.length} bytes`);
    }
    if (jsonBuf.length > 0xffffffff) {
      throw new Error(`frame asset json too long: ${jsonBuf.length} bytes`);
    }
    const frameIdLenBuf = Buffer.allocUnsafe(2);
    frameIdLenBuf.writeUInt16LE(frameIdBuf.length, 0);
    const jsonLenBuf = Buffer.allocUnsafe(4);
    jsonLenBuf.writeUInt32LE(jsonBuf.length, 0);
    parts.push(frameIdLenBuf, frameIdBuf, jsonLenBuf, jsonBuf);
  }
  const countBuf = Buffer.allocUnsafe(2);
  countBuf.writeUInt16LE(defs.length, 0);
  return Buffer.concat([countBuf, ...parts]);
}

// 解码帧定义块内容。数据不完整(截断)抛错——帧定义块是 session 头部一次性写的,
// 正常文件不会截断;老格式(无帧定义块)在 reader 层读 frameDefBlockLen 时已判别。
export function decodeFrameDefinitions(data: Uint8Array): FrameDefinitionEntry[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder('utf8');
  if (view.byteLength < 2) {
    throw new Error('frame-definition block truncated: missing count');
  }
  const count = view.getUint16(0, true);
  let offset = 2;
  const defs: FrameDefinitionEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 2 > view.byteLength) {
      throw new Error(`frame-definition block truncated: entry ${i} frameIdLen`);
    }
    const frameIdLen = view.getUint16(offset, true); offset += 2;
    if (offset + frameIdLen > view.byteLength) {
      throw new Error(`frame-definition block truncated: entry ${i} frameId`);
    }
    const frameId = decoder.decode(data.subarray(offset, offset + frameIdLen)); offset += frameIdLen;
    if (offset + 4 > view.byteLength) {
      throw new Error(`frame-definition block truncated: entry ${i} jsonLen`);
    }
    const jsonLen = view.getUint32(offset, true); offset += 4;
    if (offset + jsonLen > view.byteLength) {
      throw new Error(`frame-definition block truncated: entry ${i} json`);
    }
    const frameAssetJson = decoder.decode(data.subarray(offset, offset + jsonLen)); offset += jsonLen;
    defs.push({ frameId, frameAssetJson });
  }
  return defs;
}

// 帧定义块 + 总长前缀(uint32 frameDefBlockLen)打包,供 writer 写入文件头(magic 之后)。
// reader 读 frameDefBlockLen 后跳过这么多字节即可定位帧记录流,无需额外 magic 分隔。
export function encodeFrameDefinitionBlock(defs: readonly FrameDefinitionEntry[]): Buffer {
  const inner = encodeFrameDefinitions(defs);
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32LE(inner.length, 0);
  return Buffer.concat([lenBuf, inner]);
}
