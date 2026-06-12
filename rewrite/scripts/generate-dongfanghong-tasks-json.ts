/**
 * Generate UI-importable JSON for the 4 dongfanghong task templates.
 *
 * Usage (from rewrite/): npx tsx scripts/generate-dongfanghong-tasks-json.ts
 *
 * Output: public/frames/dongfanghong-tasks.json
 *
 * Output format (matches task-template-io.ts ExportedPayload):
 *   {
 *     "version": 1,
 *     "templates": TaskTemplate[]
 *   }
 *
 * UI 导入入口：parseImportedFile(file: Blob) -> Promise<TaskTemplate[]>
 *   位于 src/features/task/services/task-template-io.ts
 */

import { writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { dongfanghongTemplates, dongfanghongTemplateCount } from '../src/features/task/fixtures/dongfanghong-tasks';
import { validateTaskDefinition } from '../src/features/task/core';

const SCHEMA_VERSION = 1;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const outputPath = resolve(projectRoot, 'public/frames/dongfanghong-tasks.json');

// --- 1. validate each template's definition before serializing ---
for (const tpl of dongfanghongTemplates) {
  const issues = validateTaskDefinition(tpl.definition);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    console.error(`FAIL: template "${tpl.templateId}" has ${errors.length} validation error(s):`);
    for (const e of errors) {
      console.error(`  [${e.code}] ${e.message}`);
    }
    process.exit(1);
  }
}

// --- 2. serialize to { version, templates } envelope ---
const envelope = {
  version: SCHEMA_VERSION,
  templates: dongfanghongTemplates,
};

const json = JSON.stringify(envelope, null, 2);
writeFileSync(outputPath, json, 'utf8');

// --- 3. round-trip verify (mirrors parseImportedFile logic) ---
const readBack = readFileSync(outputPath, 'utf8');
const parsed = JSON.parse(readBack) as { version: unknown; templates: unknown };

if (parsed.version !== SCHEMA_VERSION) {
  console.error(`FAIL: version mismatch after read-back: got ${parsed.version as string}, expected ${SCHEMA_VERSION}`);
  process.exit(1);
}

if (!Array.isArray(parsed.templates)) {
  console.error('FAIL: templates field is not an array after read-back');
  process.exit(1);
}

if (parsed.templates.length !== dongfanghongTemplateCount) {
  console.error(
    `FAIL: template count mismatch after read-back: got ${parsed.templates.length}, expected ${dongfanghongTemplateCount}`,
  );
  process.exit(1);
}

// --- 4. re-validate after round-trip ---
for (const tpl of parsed.templates as Array<{ templateId: string; definition: import('../src/features/task/core').TaskDefinition }>) {
  const issues = validateTaskDefinition(tpl.definition);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    console.error(`FAIL: template "${tpl.templateId}" failed validation after round-trip:`);
    for (const e of errors) {
      console.error(`  [${e.code}] ${e.message}`);
    }
    process.exit(1);
  }
}

// --- 5. summary ---
const stepCountTotal = (parsed.templates as Array<{ definition: { steps: unknown[] } }>).reduce(
  (sum, tpl) => sum + tpl.definition.steps.length,
  0,
);

console.log('OK: dongfanghong-tasks.json generated');
console.log(`  path:        ${outputPath}`);
console.log(`  templates:   ${(parsed.templates as unknown[]).length} (expected ${dongfanghongTemplateCount})`);
console.log(`  steps total: ${stepCountTotal}`);
for (const tpl of parsed.templates as Array<{ templateId: string; definition: { steps: unknown[]; schedule: { kind: string }; errorPolicy: { onFailure: string } } }>) {
  console.log(
    `    - ${tpl.templateId}: ${tpl.definition.steps.length} steps, schedule=${tpl.definition.schedule.kind}, onFailure=${tpl.definition.errorPolicy.onFailure}`,
  );
}
console.log(`  bytes:       ${Buffer.byteLength(readBack, 'utf8')}`);
console.log(`  lines:       ${readBack.split('\n').length}`);
