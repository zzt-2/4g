#!/usr/bin/env node

/**
 * One-time migration script: old framesConfig.json → new FrameAssetFile format.
 *
 * Usage:
 *   node scripts/migrate-frames.mjs
 *   node scripts/migrate-frames.mjs public/data/templates/framesConfig.json
 *   node scripts/migrate-frames.mjs input.json -o output.json
 *
 * Output defaults to stdout. Use -o to write to a file.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// --- helpers ---

function coerceToNumber(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function stringValue(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function booleanValue(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// --- field migration ---

function migrateOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.filter(isRecord).map((o) => ({
    value: stringValue(o.value),
    label: stringValue(o.label),
    ...(typeof o.isDefault === 'boolean' ? { isDefault: o.isDefault } : {}),
  }));
}

function migrateExpression(expr) {
  if (!isRecord(expr)) return undefined;
  const expressions = Array.isArray(expr.expressions)
    ? expr.expressions.filter(isRecord).map((e) => ({
        condition: stringValue(e.condition),
        expression: stringValue(e.expression),
      }))
    : [];
  const variables = Array.isArray(expr.variables)
    ? expr.variables.filter(isRecord).map((v) => ({
        identifier: stringValue(v.identifier),
        sourceType: stringValue(v.sourceType),
        ...(v.sourceId != null ? { sourceId: stringValue(v.sourceId) } : {}),
        ...(v.frameId != null ? { frameId: stringValue(v.frameId) } : {}),
        ...(v.fieldId != null ? { fieldId: stringValue(v.fieldId) } : {}),
      }))
    : [];
  return { expressions, variables };
}

function migrateField(field) {
  if (!isRecord(field)) return undefined;

  const dataType = stringValue(field.dataType, 'uint8');
  const inputType = stringValue(field.inputType, 'input');

  const result = {
    id: stringValue(field.id),
    name: stringValue(field.name),
    dataType,
    length: coerceToNumber(field.length, dataType === 'bytes' ? 1 : 0),
    ...(field.description ? { description: stringValue(field.description) } : {}),
    ...(field.defaultValue != null ? { defaultValue: stringValue(field.defaultValue) } : {}),
    inputType,
    configurable: booleanValue(field.configurable, false),
    options: migrateOptions(field.options),
    dataParticipationType: stringValue(field.dataParticipationType, 'direct'),
  };

  // validOption: string indices → number
  if (isRecord(field.validOption)) {
    result.validOption = {
      isChecksum: booleanValue(field.validOption.isChecksum, false),
      startFieldIndex: coerceToNumber(field.validOption.startFieldIndex, 0),
      endFieldIndex: coerceToNumber(field.validOption.endFieldIndex, 0),
      ...(field.validOption.checksumMethod ? { checksumMethod: stringValue(field.validOption.checksumMethod) } : {}),
    };
  }

  // expressionConfig
  if (inputType === 'expression' && field.expressionConfig) {
    const expr = migrateExpression(field.expressionConfig);
    if (expr) result.expressionConfig = expr;
  }

  // optional boolean flags
  if (typeof field.bigEndian === 'boolean') result.bigEndian = field.bigEndian;
  if (typeof field.isASCII === 'boolean') result.isASCII = field.isASCII;
  if (field.factor != null) result.factor = coerceToNumber(field.factor, 1);

  return result;
}

// --- identifier rule migration ---

function migrateIdentifierRule(rule) {
  if (!isRecord(rule)) return undefined;
  return {
    startIndex: coerceToNumber(rule.startIndex, 0),
    endIndex: coerceToNumber(rule.endIndex, 0),
    operator: stringValue(rule.operator, 'eq'),
    value: stringValue(rule.value),
    logicOperator: stringValue(rule.logicOperator, 'and'),
  };
}

// --- frame migration ---

function migrateFrame(frame) {
  if (!isRecord(frame)) return undefined;

  const rawFields = Array.isArray(frame.fields) ? frame.fields : [];

  const result = {
    id: stringValue(frame.id),
    name: stringValue(frame.name),
    direction: stringValue(frame.direction, 'send'),
    fields: rawFields.map(migrateField).filter(Boolean),
    ...(frame.description ? { description: stringValue(frame.description) } : {}),
    ...(frame.frameType ? { frameType: stringValue(frame.frameType) } : {}),
    ...(frame.protocol ? { protocol: stringValue(frame.protocol) } : {}),
    ...(typeof frame.isFavorite === 'boolean' ? { isFavorite: frame.isFavorite } : {}),
    ...(typeof frame.createdAt === 'string' ? { createdAt: frame.createdAt } : {}),
    ...(typeof frame.updatedAt === 'string' ? { updatedAt: frame.updatedAt } : {}),
  };

  // options
  if (isRecord(frame.options)) {
    result.options = {
      autoChecksum: booleanValue(frame.options.autoChecksum, true),
      bigEndian: booleanValue(frame.options.bigEndian, false),
      includeLengthField: booleanValue(frame.options.includeLengthField, false),
    };
  }

  // identifierRules
  if (Array.isArray(frame.identifierRules)) {
    const rules = frame.identifierRules.map(migrateIdentifierRule).filter(Boolean);
    if (rules.length > 0) result.identifierRules = rules;
  }

  return result;
}

// --- main ---

function main() {
  const args = process.argv.slice(2);
  let inputPath = resolve('public/data/templates/framesConfig.json');
  let outputPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' && args[i + 1]) {
      outputPath = args[++i];
    } else if (!args[i].startsWith('-')) {
      inputPath = resolve(args[i]);
    }
  }

  console.error(`Reading: ${inputPath}`);
  const raw = JSON.parse(readFileSync(inputPath, 'utf-8'));

  if (!Array.isArray(raw)) {
    console.error('Error: input must be a JSON array of frame definitions');
    process.exit(1);
  }

  const frames = raw.map(migrateFrame).filter(Boolean);

  // Count warnings
  let warningCount = 0;
  for (const [i, frame] of raw.entries()) {
    if (!isRecord(frame)) {
      console.error(`  WARNING: frame[${i}] is not an object, skipped`);
      warningCount++;
      continue;
    }
    // Check for fields with string startFieldIndex/endFieldIndex (converted)
    if (Array.isArray(frame.fields)) {
      for (const field of frame.fields) {
        if (isRecord(field) && isRecord(field.validOption)) {
          if (typeof field.validOption.startFieldIndex === 'string') warningCount++;
          if (typeof field.validOption.endFieldIndex === 'string') warningCount++;
        }
        if (field.dataParticipationType === undefined) warningCount++;
      }
    }
  }

  const output = { schemaVersion: 1, frames };
  const json = JSON.stringify(output, null, 2);

  if (outputPath) {
    writeFileSync(outputPath, json, 'utf-8');
    console.error(`Written: ${outputPath}`);
  } else {
    process.stdout.write(json + '\n');
  }

  console.error(`Migrated ${frames.length} frames (${warningCount} automatic conversions)`);
}

main();
