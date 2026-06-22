/**
 * Scatter（星座图）采样值提取。
 *
 * 对接旧版 dataDisplayStore.extractValuesFromHex 语义：把 bytes 字段的 hex 字符串
 * 按 bitWidth 切成多个有符号采样值，供 scatter 图按 I/Q 配对画多点。
 *
 * 数据来源：receive field-parser 对 bytes 字段返回大写紧凑 hex（bytesToHex，
 * 如 [0x12,0x34,0xAB] → "1234AB"）。send 侧或手填值可能带 "0x" 前缀/小写，
 * 这里先归一化再去前缀，保证两种来源都能切。
 */

/**
 * 从 hex 字符串按 bitWidth 切出多个有符号采样值。
 *
 * @param hex      bytes 字段的 hex（可带 0x 前缀、任意大小写、可含空格）
 * @param bitWidth 每个采样值的位宽（1..32）
 * @returns 有符号采样值数组（补码转十进制）；bitWidth 越界或 hex 为空时返回 []
 */
export function extractValuesFromHex(hex: string, bitWidth: number): number[] {
  if (!hex || bitWidth <= 0 || bitWidth > 32) return [];

  // 归一化：去 0x 前缀、去空格、统一大写
  const normalized = hex.replace(/^0x/i, '').replace(/\s/g, '').toUpperCase();
  if (!normalized) return [];

  const values: number[] = [];
  const hexCharsPerValue = Math.ceil(bitWidth / 4);
  const maxValueCount = Math.floor(normalized.length / hexCharsPerValue);

  for (let i = 0; i < maxValueCount; i++) {
    const start = i * hexCharsPerValue;
    const chunk = normalized.slice(start, start + hexCharsPerValue);
    if (chunk.length < hexCharsPerValue) break;

    let value = parseInt(chunk, 16);
    if (Number.isNaN(value)) continue;

    // 有符号补码转换：bitWidth-1 位为符号位时，减去 2^bitWidth 得负值。
    // 对接旧版 dataDisplayStore.extractValuesFromHex 语义（所有值按有符号处理）。
    // 注意 JS 位运算限定 32-bit：bitWidth=32 时用 Number 算术避免溢出。
    const signThreshold = Math.pow(2, bitWidth - 1);
    const fullRange = Math.pow(2, bitWidth);
    if (value >= signThreshold) {
      value = value - fullRange;
    }

    values.push(value);
  }

  return values;
}
