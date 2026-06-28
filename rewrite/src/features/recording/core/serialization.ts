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
export function decodeFrameRecords(data: Uint8Array): RecordingFrameRecord[] {
  const buf = Buffer.from(data);
  const records: RecordingFrameRecord[] = [];
  let offset = 0;
  while (offset < buf.length) {
    if (offset + 4 > buf.length) break; // 不完整时间戳,丢弃尾部
    const capturedAt = buf.readUInt32LE(offset); offset += 4;
    if (offset + 2 > buf.length) break;
    const frameIdLen = buf.readUInt16LE(offset); offset += 2;
    if (offset + frameIdLen > buf.length) break;
    const frameId = buf.subarray(offset, offset + frameIdLen).toString('utf8'); offset += frameIdLen;
    if (offset + 2 > buf.length) break;
    const byteLen = buf.readUInt16LE(offset); offset += 2;
    if (offset + byteLen > buf.length) break;
    const bytes = Array.from(buf.subarray(offset, offset + byteLen)); offset += byteLen;
    records.push({ capturedAt, frameId, bytes });
  }
  return records;
}
