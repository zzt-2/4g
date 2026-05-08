export function checksumSum8(bytes: readonly number[]): number {
  let sum = 0;
  for (const b of bytes) sum += b;
  return sum & 0xff;
}

export function checksumXor8(bytes: readonly number[]): number {
  let result = 0;
  for (const b of bytes) result ^= b;
  return result & 0xff;
}

const CRC16_MODBUS_TABLE = (() => {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
    table.push(crc);
  }
  return table;
})();

export function checksumCrc16Modbus(bytes: readonly number[]): number {
  let crc = 0xffff;
  for (const b of bytes) {
    crc = (crc >>> 8) ^ CRC16_MODBUS_TABLE[(crc ^ b) & 0xff]!;
  }
  return crc & 0xffff;
}

export function calculateChecksum(bytes: readonly number[], kind: string): number {
  switch (kind) {
    case 'sum8':
      return checksumSum8(bytes);
    case 'xor8':
      return checksumXor8(bytes);
    case 'crc16-modbus':
      return checksumCrc16Modbus(bytes);
    default:
      return 0;
  }
}
