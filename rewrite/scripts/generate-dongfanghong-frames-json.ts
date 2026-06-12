/**
 * Generate UI-importable JSON for the 47 dongfanghong frame definitions.
 *
 * Usage (from rewrite/): npx tsx scripts/generate-dongfanghong-frames-json.ts
 *
 * Output: public/frames/dongfanghong-frames.json
 *
 * The output is exactly what serializeFrames(dongfanghongFrames) produces,
 * i.e. { schemaVersion: 1, frames: FrameAsset[] }. UI import consumes this
 * via deserializeFrames() in frame-asset-service.ts.
 */

import { writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { dongfanghongFrames, dongfanghongFrameCount } from '../src/features/frame/fixtures/dongfanghong-frames';
import {
  serializeFrames,
  deserializeFrames,
} from '../src/features/frame/services/frame-asset-service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const outputPath = resolve(projectRoot, 'public/frames/dongfanghong-frames.json');

// --- 1. serialize ---
const json = serializeFrames(dongfanghongFrames);
writeFileSync(outputPath, json, 'utf8');

// --- 2. verify round-trip ---
const readBack = readFileSync(outputPath, 'utf8');
const result = deserializeFrames(readBack);

if (!result.ok) {
  console.error('FAIL: deserializeFrames returned ok=false');
  for (const issue of result.issues) {
    console.error(`  [${issue.severity}] ${issue.path}: ${issue.message}`);
  }
  process.exit(1);
}

const errorCount = result.issues.filter((i) => i.severity === 'error').length;
if (errorCount > 0) {
  console.error(`FAIL: ${errorCount} error-severity issues after deserialize`);
  process.exit(1);
}

if (result.frames.length !== dongfanghongFrameCount) {
  console.error(
    `FAIL: frame count mismatch after deserialize: got ${result.frames.length}, expected ${dongfanghongFrameCount}`,
  );
  process.exit(1);
}

// --- 3. sanity: uint64 field count (comm_rx runtime has 4 merged uint64) ---
let uint64Count = 0;
for (const frame of result.frames) {
  for (const field of frame.fields) {
    if (field.dataType === 'uint64') uint64Count++;
  }
}

// --- 4. sanity: B-class pulse frames have only sync/length/header/checksum ---
const pulseFrameIds = result.frames
  .filter((f) => f.fields.every((fld) => ['sync', 'length', 'header', 'checksum'].includes(fld.id)))
  .map((f) => f.id);

console.log('OK: dongfanghong-frames.json generated');
console.log(`  path:        ${outputPath}`);
console.log(`  frames:      ${result.frames.length} (expected ${dongfanghongFrameCount})`);
console.log(`  uint64:      ${uint64Count}`);
console.log(`  pulse frames (4 skeleton fields only): ${pulseFrameIds.length}`);
for (const id of pulseFrameIds) {
  console.log(`    - ${id}`);
}
console.log(`  bytes:       ${Buffer.byteLength(readBack, 'utf8')}`);
console.log(`  lines:       ${readBack.split('\n').length}`);
