export function hexToBytes(hex: string): number[] {
  const cleaned = hex.replace(/\s/g, '');
  if (cleaned.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes.push(parseInt(cleaned.substring(i, i + 2), 16));
  }
  return bytes;
}
