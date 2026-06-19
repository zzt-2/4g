# SendPage UI 重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 SendPage 三栏高度链、重设计左栏帧列表、为实例编辑弹窗加十六进制双显并卡片化、右栏卡片化、表格操作列收纳,全部在现有 SCSS token 基线内。

**Architecture:** 不动 feature 业务逻辑(发送管线/表达式/可变参数)。新增一个纯函数 util `numeric-field-format.ts` 复用 `encode.ts` 的数值解析,统一 hex/dec 显示与输入口径,供编辑弹窗与右栏共用。UI 改动集中在 `SendPage.vue`、`FieldEditWidget.vue`、`instance-columns.ts` 三个文件 + 新 util。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + Quasar 组件 + SCSS token(`--rw-*`)+ Vitest。

**Spec:** `docs/superpowers/specs/2026-06-19-sendpage-ui-redesign-design.md`

**Key facts verified during planning:**
- `DataTable.vue` 用 `:style="{ maxHeight: containerHeight }"`(默认 `calc(100vh - 200px)`),不传会走默认值,不自适应 flex → SendPage 必须显式传 `container-height="100%"`。
- `encode.ts` 已有 `parseNumericValue`(行 32-38,支持 `0x` 前缀)与 `parseBigIntValue`(行 40-60)→ hex util 复用,不重造。
- `DisplayPage.vue` 是高度链范本:`q-page flex flex-col h-full` + scoped `min-height:0`。
- INTEGER_RANGES(encode.ts:18-25)与 BIGINT_RANGES(行27-30)可复用做范围校验。
- `SendFieldValue = number | string | boolean`(见 core/types)。
- **真实 CSS var 命名(已核对 app.scss:6-71)**:
  - spacing:`--rw-space-2`(8px)、`--rw-space-3`(12px)、`--rw-space-4`(16px)。无 `--rw-spacing-md`。
  - 字号:`--rw-font-size-caption`(12px)、`--rw-font-size-label`(13px)、`--rw-font-size-body`(14px)。
  - 字重:只有 `--rw-font-weight-regular`(400)和 `--rw-font-weight-semibold`(600)。**无 medium**。
  - 圆角:只有 `--rw-radius-panel`(8px)、`--rw-radius-control`(8px)。**无 `--rw-radius-sm`**。
  - **⚠️ `--rw-color-surface-elevated` 未在 app.scss 定义**(palette 有 slate-100 但没暴露成此 var)。SendPage 现有 hex-preview 用了它 → 实际回退透明。本计划统一用 `--rw-color-surface-app`(slate-100)做深一档背景。

---

## File Structure

| 文件 | 职责 | 动作 |
|------|------|------|
| `rewrite/src/features/send/composables/numeric-field-format.ts` | 纯函数:数值↔hex 字符串转换、输入解析、范围校验。复用 encode.ts 的解析常量。 | 新建 |
| `rewrite/src/features/send/composables/__tests__/numeric-field-format.spec.ts` | util 单测 | 新建 |
| `rewrite/src/features/send/index.ts` | 导出 util | 修改 |
| `rewrite/src/widgets/FieldEditWidget.vue` | badge→卡片、hex 双显、输入解析重写、grid 对齐 | 修改(大改) |
| `rewrite/src/pages/SendPage.vue` | 高度链、左栏、右栏卡片化、编辑弹窗结构、表格操作列收纳、右栏 fieldToHex 改用 util | 修改(大改) |
| `rewrite/src/features/send/components/instance-columns.ts` | 操作列宽度 200→80 | 修改 |

**不改**:`FrameFieldEditorDialog.vue`、`DataTable.vue`、`encode.ts`、发送管线。

---

## Task 1: 数值/hex 格式化 util(纯函数,TDD)

**Files:**
- Create: `rewrite/src/features/send/composables/numeric-field-format.ts`
- Test: `rewrite/src/features/send/composables/__tests__/numeric-field-format.spec.ts`
- Modify: `rewrite/src/features/send/index.ts`

这是编辑弹窗 hex 双显与右栏显示的基础。纯函数,无 Vue 依赖,易测。

- [ ] **Step 1: 写失败测试**

Create `rewrite/src/features/send/composables/__tests__/numeric-field-format.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  isHexCapableField,
  valueToDisplayString,
  formatCounterpart,
  parseFieldInput,
} from '../numeric-field-format';
import type { FrameFieldDefinition } from '@/features/frame';

function field(dataType: string): FrameFieldDefinition {
  return {
    id: 'f', name: 'f', dataType,
    length: 1, inputType: 'input', configurable: true,
    options: [], expressionConfig: null,
  } as unknown as FrameFieldDefinition;
}

describe('numeric-field-format', () => {
  describe('isHexCapableField', () => {
    it('true for integer input fields', () => {
      expect(isHexCapableField(field('uint8'))).toBe(true);
      expect(isHexCapableField(field('int32'))).toBe(true);
      expect(isHexCapableField(field('uint64'))).toBe(true);
    });
    it('false for float/double/bytes/non-input', () => {
      expect(isHexCapableField(field('float'))).toBe(false);
      expect(isHexCapableField(field('double'))).toBe(false);
    });
  });

  describe('valueToDisplayString', () => {
    it('dec mode shows decimal', () => {
      expect(valueToDisplayString(255, field('uint8'), false)).toBe('255');
    });
    it('hex mode shows 0x upper for uint32', () => {
      expect(valueToDisplayString(450184733, field('uint32'), true)).toBe('0x1ACFFC1D');
    });
    it('uint64 beyond safe int shows hex via bigint', () => {
      expect(valueToDisplayString('18446744073709551615', field('uint64'), true)).toBe('0xFFFFFFFFFFFFFFFF');
    });
    it('string non-numeric returns as-is', () => {
      expect(valueToDisplayString('hello', field('uint8'), false)).toBe('hello');
    });
    it('undefined returns empty', () => {
      expect(valueToDisplayString(undefined, field('uint8'), false)).toBe('');
    });
  });

  describe('formatCounterpart', () => {
    it('dec value → hex counterpart', () => {
      expect(formatCounterpart(255, field('uint8'), false)).toBe('Hex=0xFF');
    });
    it('hex value → dec counterpart', () => {
      expect(formatCounterpart(255, field('uint8'), true)).toBe('Dec=255');
    });
    it('uint64 dec → hex counterpart', () => {
      expect(formatCounterpart('18446744073709551615', field('uint64'), false)).toBe('Hex=0xFFFFFFFFFFFFFFFF');
    });
    it('returns empty for non-numeric', () => {
      expect(formatCounterpart('hello', field('uint8'), false)).toBe('');
    });
  });

  describe('parseFieldInput', () => {
    it('dec input parses to number', () => {
      expect(parseFieldInput('255', false, field('uint8'))).toEqual({ ok: true, value: 255 });
    });
    it('hex input "1acffc1d" in hex mode → number', () => {
      expect(parseFieldInput('1acffc1d', true, field('uint32'))).toEqual({ ok: true, value: 450184733 });
    });
    it('0x prefix parsed in dec mode too', () => {
      expect(parseFieldInput('0xFF', false, field('uint8'))).toEqual({ ok: true, value: 255 });
    });
    it('uint64 beyond safe int → bigint as string', () => {
      const r = parseFieldInput('FFFFFFFFFFFFFFFF', true, field('uint64'));
      expect(r.ok).toBe(true);
      expect(r.ok && r.value).toBe('18446744073709551615');
    });
    it('invalid hex returns ok:false', () => {
      expect(parseFieldInput('xyz', true, field('uint8'))).toEqual({ ok: false, error: '无法解析为数值' });
    });
    it('out of range returns ok:false', () => {
      expect(parseFieldInput('300', false, field('uint8')).ok).toBe(false);
    });
    it('empty input → ok:true, value empty string', () => {
      expect(parseFieldInput('', false, field('uint8'))).toEqual({ ok: true, value: '' });
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm -C rewrite test -- src/features/send/composables/__tests__/numeric-field-format.spec.ts`
Expected: FAIL — 模块不存在(import 报错)。

- [ ] **Step 3: 实现 util**

Create `rewrite/src/features/send/composables/numeric-field-format.ts`:

```typescript
import type { FrameFieldDefinition } from '@/features/frame';
import type { SendFieldValue } from '../core';

// Reuse the integer type set and ranges from encode layer to avoid divergence.
const INTEGER_TYPES = new Set([
  'uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32', 'uint64', 'int64',
]);
const BIGINT_TYPES = new Set(['uint64', 'int64']);

const INTEGER_RANGES: Record<string, readonly [number, number]> = {
  uint8: [0, 255],
  int8: [-128, 127],
  uint16: [0, 65535],
  int16: [-32768, 32767],
  uint32: [0, 4294967295],
  int32: [-2147483648, 2147483647],
};
const BIGINT_RANGES: Record<string, readonly [bigint, bigint]> = {
  uint64: [0n, 18_446_744_073_709_551_615n],
  int64: [-9_223_372_036_854_775_808n, 9_223_372_036_854_775_807n],
};

export interface ParsedInput {
  readonly ok: true;
  readonly value: SendFieldValue;
}
export interface ParsedError {
  readonly ok: false;
  readonly error: string;
}
export type ParseResult = ParsedInput | ParsedError;

/** A field can use hex display/input only if it is an integer numeric input field. */
export function isHexCapableField(f: FrameFieldDefinition): boolean {
  return INTEGER_TYPES.has(f.dataType);
}

function isEmpty(v: SendFieldValue | undefined): v is undefined | '' {
  return v === undefined || v === null || v === '';
}

function toBigintSafe(v: SendFieldValue): bigint | null {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'boolean') return v ? 1n : 0n;
  if (typeof v === 'number') return Number.isInteger(v) ? BigInt(v) : null;
  const str = String(v).trim();
  if (str === '') return null;
  if (/^-?0x[0-9a-f]+$/i.test(str)) {
    const negative = str.startsWith('-');
    try {
      const bi = BigInt(negative ? str.slice(1) : str);
      return negative ? -bi : bi;
    } catch { return null; }
  }
  if (/^-?\d+$/.test(str)) {
    try { return BigInt(str); } catch { return null; }
  }
  return null;
}

function toNumberOrNan(v: SendFieldValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const str = String(v).trim();
  if (/^0x[0-9a-f]+$/i.test(str)) return parseInt(str, 16);
  return Number(str);
}

/** Render a stored value to the input-box display string for the given mode. */
export function valueToDisplayString(
  v: SendFieldValue | undefined,
  f: FrameFieldDefinition,
  hexMode: boolean,
): string {
  if (isEmpty(v)) return '';
  if (BIGINT_TYPES.has(f.dataType)) {
    const bi = toBigintSafe(v);
    if (bi === null) return String(v);
    if (hexMode) {
      const neg = bi < 0n;
      const mag = neg ? -bi : bi;
      return (neg ? '-0x' : '0x') + mag.toString(16).toUpperCase();
    }
    return bi.toString(10);
  }
  if (!isHexCapableField(f)) return String(v);
  const num = toNumberOrNan(v);
  if (Number.isNaN(num)) return String(v);
  if (hexMode) {
    const neg = num < 0;
    const mag = Math.abs(num);
    return (neg ? '-0x' : '0x') + mag.toString(16).toUpperCase();
  }
  return String(num);
}

/** Render the "other side" hint, e.g. Dec value → "Hex=0xFF". Empty if not numeric. */
export function formatCounterpart(
  v: SendFieldValue | undefined,
  f: FrameFieldDefinition,
  hexMode: boolean,
): string {
  if (isEmpty(v)) return '';
  if (!isHexCapableField(f)) return '';
  if (BIGINT_TYPES.has(f.dataType)) {
    const bi = toBigintSafe(v);
    if (bi === null) return '';
    const neg = bi < 0n;
    const mag = neg ? -bi : bi;
    if (hexMode) return `Dec=${bi.toString(10)}`;
    return `Hex=${(neg ? '-0x' : '0x') + mag.toString(16).toUpperCase()}`;
  }
  const num = toNumberOrNan(v);
  if (Number.isNaN(num)) return '';
  if (hexMode) return `Dec=${num}`;
  const neg = num < 0;
  const mag = Math.abs(num);
  return `Hex=${(neg ? '-0x' : '0x') + mag.toString(16).toUpperCase()}`;
}

/** Parse a raw input string per mode + data type into a stored SendFieldValue. */
export function parseFieldInput(
  raw: string,
  hexMode: boolean,
  f: FrameFieldDefinition,
): ParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: '' };

  const hasHexPrefix = /^-?0x[0-9a-f]+$/i.test(trimmed);
  const useHex = hexMode || hasHexPrefix;

  if (BIGINT_TYPES.has(f.dataType)) {
    let bi: bigint | null = null;
    try {
      if (hasHexPrefix) {
        const negative = trimmed.startsWith('-');
        bi = BigInt(negative ? trimmed.slice(1) : trimmed);
        bi = negative ? -bi : bi;
      } else if (useHex && /^-?[0-9a-f]+$/i.test(trimmed)) {
        const negative = trimmed.startsWith('-');
        const body = negative ? trimmed.slice(1) : trimmed;
        bi = BigInt('0x' + body);
        bi = negative ? -bi : bi;
      } else if (/^-?\d+$/.test(trimmed)) {
        bi = BigInt(trimmed);
      }
    } catch { bi = null; }
    if (bi === null) return { ok: false, error: '无法解析为数值' };
    const range = BIGINT_RANGES[f.dataType];
    if (range && (bi < range[0] || bi > range[1])) {
      return { ok: false, error: `数值超出 ${f.dataType} 范围` };
    }
    // Store as string when beyond Number.MAX_SAFE_INTEGER, else number (matches existing uint64 storage).
    return { ok: true, value: Number.isSafeInteger(Number(bi)) ? Number(bi) : bi.toString(10) };
  }

  if (!isHexCapableField(f)) {
    // non-integer numeric (float/double) or unknown: store raw as-is string/number
    const num = Number(trimmed);
    return { ok: true, value: Number.isNaN(num) ? trimmed : num };
  }

  let num: number;
  if (hasHexPrefix) num = parseInt(trimmed, 16);
  else if (useHex) {
    if (!/^[0-9a-f]+$/i.test(trimmed)) return { ok: false, error: '无法解析为数值' };
    num = parseInt(trimmed, 16);
  } else {
    num = Number(trimmed);
    if (Number.isNaN(num)) return { ok: false, error: '无法解析为数值' };
  }
  const range = INTEGER_RANGES[f.dataType];
  if (range && (num < range[0] || num > range[1])) {
    return { ok: false, error: `数值超出 ${f.dataType} 范围` };
  }
  return { ok: true, value: num };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm -C rewrite test -- src/features/send/composables/__tests__/numeric-field-format.spec.ts`
Expected: PASS(全部用例)。

- [ ] **Step 5: 导出 util**

Modify `rewrite/src/features/send/index.ts` — 在 "Core pure functions" 导出块末尾(`applyBuildPostPatch,` 之后)追加:

```typescript
// Field formatting helpers (hex/dec display + input parse)
export {
  isHexCapableField,
  valueToDisplayString,
  formatCounterpart,
  parseFieldInput,
} from './composables/numeric-field-format';
export type { ParseResult, ParsedInput, ParsedError } from './composables/numeric-field-format';
```

- [ ] **Step 6: 提交**

```bash
git add rewrite/src/features/send/composables/numeric-field-format.ts rewrite/src/features/send/composables/__tests__/numeric-field-format.spec.ts rewrite/src/features/send/index.ts
git commit -m "feat(send): add numeric-field-format util for hex/dec display+parse"
```

---

## Task 2: FieldEditWidget 卡片化 + hex 双显

**Files:**
- Modify: `rewrite/src/widgets/FieldEditWidget.vue`(全文重写 template + script hex 部分)

依赖 Task 1 的 util。这是用户反馈最重的部分。先加 props(hexMode、errors)再重画 template。

- [ ] **Step 1: 扩展 props — 加 hexMode 与 fieldErrors**

在 `FieldEditWidget.vue` 的 `defineProps` 增加(在 `previewValues?` 后):

```typescript
  readonly hexMode?: boolean;
  readonly fieldErrors?: Readonly<Record<string, string>>;
```

在 `defineEmits` 增加:

```typescript
  'update:hexMode': [value: boolean];
  'field-error': [payload: { fieldId: string; error: string | undefined }];
```

- [ ] **Step 2: 引入 util 并替换 onNumericInput**

在 `<script setup>` 顶部 import 区加:

```typescript
import {
  isHexCapableField,
  valueToDisplayString,
  formatCounterpart,
  parseFieldInput,
} from '@/features/send';
```

删除旧的 `onNumericInput`(行 99-106),替换为:

```typescript
function onNumericInput(field: FrameFieldDefinition, raw: string | number | null): void {
  const text = raw === null ? '' : String(raw);
  const result = parseFieldInput(text, props.hexMode ?? false, field);
  if (!result.ok) {
    emit('field-error', { fieldId: field.id, error: result.error });
    return; // do not mutate value on parse error; keep last good value
  }
  emit('field-error', { fieldId: field.id, error: undefined });
  onFieldChange(field.id, result.value);
}
```

替换 `getDisplayValue`(行 78-87)为用 util 的版本:

```typescript
function getDisplayValue(field: FrameFieldDefinition): string {
  if (field.configurable) {
    const val = props.values[field.id];
    if (val !== undefined && val !== null) {
      return isHexCapableField(field)
        ? valueToDisplayString(val, field, props.hexMode ?? false)
        : String(val);
    }
  }
  const preview = props.previewValues?.[field.id];
  if (preview !== undefined && preview !== null) {
    return isHexCapableField(field)
      ? valueToDisplayString(preview, field, props.hexMode ?? false)
      : String(preview);
  }
  if (field.defaultValue !== undefined) return String(field.defaultValue);
  return '--';
}
```

新增 counterpart hint 计算辅助:

```typescript
function counterpartHint(field: FrameFieldDefinition): string {
  if (!isHexCapableField(field)) return '';
  const val = field.configurable ? props.values[field.id] : props.previewValues?.[field.id];
  return formatCounterpart(val, field, props.hexMode ?? false);
}
```

- [ ] **Step 3: 重写 template — badge 色块 → 分组卡片**

整个 `<template>` 替换为(注意:hex 切换按钮由父组件控制,本组件通过 emit 上报;卡片标题色条用 scoped class):

```vue
<template>
  <div class="flex flex-col gap-3">
    <div
      v-for="(section, si) in sections"
      :key="section.key"
      class="field-section"
      :class="`field-section--${section.color}`"
    >
      <q-separator v-if="si > 0" class="mb-1" />
      <div class="field-section__title">{{ section.label }}</div>
      <div class="field-section__body flex flex-col gap-2">
        <template v-for="field in section.fields" :key="field.id">

          <!-- ===== Configurable — input (numeric supports hex display) ===== -->
          <template v-if="section.key === 'configurable' && field.inputType === 'input'">
            <div class="field-row">
              <span class="field-row__label">{{ field.name }}
                <template v-if="hasNonTrivialFactor(field)">&nbsp;(x{{ field.factor }})</template>
              </span>
              <q-input
                outlined
                dense
                :type="isNumericField(field) && !isHexCapableField(field) ? 'number' : 'text'"
                :model-value="isHexCapableField(field)
                  ? valueToDisplayString(resolveFieldInputValue(field), field, props.hexMode ?? false)
                  : resolveFieldInputValue(field)"
                :hint="counterpartHint(field) || (field.description ? undefined : undefined)"
                :error="!!props.fieldErrors?.[field.id]"
                :error-message="props.fieldErrors?.[field.id]"
                class="field-row__input"
                @update:model-value="onNumericInput(field, $event)"
              />
            </div>
          </template>

          <!-- ===== Configurable — select ===== -->
          <template v-else-if="section.key === 'configurable' && field.inputType === 'select'">
            <div class="field-row">
              <span class="field-row__label">{{ field.name }}</span>
              <q-select
                outlined dense emit-value map-options
                :options="field.options"
                :model-value="resolveFieldInputValue(field)"
                class="field-row__input"
                @update:model-value="onFieldChange(field.id, $event)"
              />
            </div>
            <div v-if="field.description" class="field-row__desc">{{ field.description }}</div>
          </template>

          <!-- ===== Configurable — radio ===== -->
          <template v-else-if="section.key === 'configurable' && field.inputType === 'radio'">
            <div class="flex flex-col gap-1">
              <span class="field-row__label">{{ field.name }}</span>
              <div class="flex items-center gap-3">
                <q-radio
                  v-for="opt in field.options" :key="opt.value" dense
                  :val="opt.value" :label="opt.label"
                  :model-value="resolveFieldInputValue(field)" color="primary"
                  @update:model-value="onFieldChange(field.id, $event)"
                />
              </div>
            </div>
          </template>

          <!-- ===== Read-only: expression or fixed ===== -->
          <template v-else>
            <div class="field-row field-row--readonly">
              <span class="field-row__label">{{ field.name }}
                <template v-if="hasNonTrivialFactor(field)">&nbsp;(x{{ field.factor }})</template>
              </span>
              <span class="field-row__value font-mono">{{ getDisplayValue(field) }}</span>
            </div>
            <div v-if="field.description" class="field-row__desc">{{ field.description }}</div>
          </template>

        </template>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: 加 scoped 样式(token-backed)**

在 `FieldEditWidget.vue` 末尾追加(若无 `<style scoped lang="scss">` 则新建):

```vue
<style scoped lang="scss">
.field-section {
  padding: var(--rw-space-3);
  background: var(--rw-color-surface-base);
  border: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle);
  border-radius: var(--rw-radius-panel);
  border-left-width: 3px;
}
.field-section--info { border-left-color: var(--rw-color-status-info); }
.field-section--warning { border-left-color: var(--rw-color-status-warning); }
.field-section--grey { border-left-color: var(--rw-color-text-muted); }

.field-section__title {
  font-size: var(--rw-font-size-caption);
  font-weight: var(--rw-font-weight-semibold);
  color: var(--rw-color-text-secondary);
  margin-bottom: var(--rw-space-2);
}

.field-row {
  display: grid;
  grid-template-columns: minmax(80px, auto) 1fr;
  align-items: center;
  gap: var(--rw-space-2);
}
.field-row__label {
  font-size: var(--rw-font-size-caption);
  color: var(--rw-color-text-muted);
}
.field-row__input { width: 100%; }
.field-row__value {
  font-size: var(--rw-font-size-body);
  color: var(--rw-color-text-primary);
}
.field-row__desc {
  font-size: var(--rw-font-size-caption);
  color: var(--rw-color-text-secondary);
  grid-column: 1 / -1;
}
.field-row--readonly .field-row__value {
  background: var(--rw-color-surface-app);
  padding: 2px var(--rw-space-2);
  border-radius: var(--rw-radius-control);
}
</style>
```

> **注意:** 以上 token 名已核对 `app.scss:6-71` 真实定义。`--rw-color-surface-app`(slate-100)用于只读字段深一档背景,替代未定义的 `surface-elevated`。

- [ ] **Step 5: 类型检查**

Run: `pnpm -C rewrite build` 或 `pnpm -C rewrite tsc --noEmit`(若 tsc 脚本存在)
Expected: 0 error。若报 token 名未定义的 CSS 警告不影响 TS;TS error 必须修。

- [ ] **Step 6: 提交**

```bash
git add rewrite/src/widgets/FieldEditWidget.vue
git commit -m "feat(widget): FieldEditWidget 卡片化 + 数值字段 hex 双显"
```

---

## Task 3: SendPage 高度链修复

**Files:**
- Modify: `rewrite/src/pages/SendPage.vue`(行 328-333 template + scoped style)

先修地基,确保后续 UI 改动有正确的高度链。

- [ ] **Step 1: 改 q-page 与三栏容器**

`SendPage.vue` 行 328-333,把:

```vue
<q-page class="send-page min-h-full">
  <div class="flex h-full">
    <!-- Left column: frame format list (240px) -->
    <div class="w-[240px] flex-shrink-0 flex flex-col overflow-hidden">
```

改为:

```vue
<q-page class="send-page flex flex-col h-full">
  <div class="flex flex-1 min-h-0">
    <!-- Left column: frame format list (240px) -->
    <div class="w-[240px] flex-shrink-0 flex flex-col min-h-0 overflow-hidden">
```

- [ ] **Step 2: 中栏加 min-h-0**

行 437:

```vue
<div class="flex-1 flex flex-col overflow-hidden">
```

改为:

```vue
<div class="flex-1 flex flex-col min-h-0 overflow-hidden">
```

- [ ] **Step 3: 表格去死高度,改传 100%**

行 455,把:

```vue
container-height="calc(100vh - 100px)"
```

改为:

```vue
container-height="100%"
```

并用 flex 容器包裹 DataTable(在 `<div class="flex-1 flex flex-col min-h-0 overflow-hidden">` 内,DataTable 外包一层):

将 DataTable(行 449-487)整体用 `<div class="flex-1 min-h-0">...</div>` 包裹,使其撑满中栏剩余空间。

- [ ] **Step 4: scoped style 加 min-height:0**

行 635-638 `.send-page` 块,改为:

```scss
.send-page {
  background: var(--rw-color-surface-app);
  min-height: 0;
}
```

- [ ] **Step 5: 视觉验证(手动)**

Run: `pnpm -C rewrite dev`,打开 /send,加载多个帧模板。
Expected: 页面整体不滚动;左/中/右三栏各自独立滚动;缩小窗口到很小,中间表格内部滚动而非页面滚动。

- [ ] **Step 6: 提交**

```bash
git add rewrite/src/pages/SendPage.vue
git commit -m "fix(send): 三栏高度链修复,页面整体不滚动,各栏独立滚"
```

---

## Task 4: 左栏帧列表重设计

**Files:**
- Modify: `rewrite/src/pages/SendPage.vue`(行 361-433 左栏列表部分)

- [ ] **Step 1: 收藏分组项改为单行 ellipsis**

行 366-391(收藏分组 q-item),把双行 label 改单行。整个收藏分组 `q-item` 改为:

```vue
<q-item
  v-for="frame in favoriteFrames"
  :key="frame.id"
  clickable dense
  class="frame-item py-1 px-2"
  :title="frame.name"
  @click="onFrameClick(frame)"
  @dblclick="onFrameDblClick(frame)"
>
  <q-item-section avatar class="frame-item__avatar">
    <q-icon name="o_star" size="xs" color="warning" />
  </q-item-section>
  <q-item-section>
    <q-item-label class="frame-item__name">{{ frame.name }}</q-item-label>
  </q-item-section>
  <q-item-section side>
    <q-btn flat round dense size="xs"
      :icon="frame.isFavorite ? 'o_star' : 'o_star_border'"
      :color="frame.isFavorite ? 'warning' : 'grey'"
      @click.stop="toggleFavorite(frame)" />
  </q-item-section>
</q-item>
```

- [ ] **Step 2: 全部分组项同样改单行**

行 401-426(全部 q-item)同样改造,avatar 图标对未收藏用 `o_bookmark_border`:

```vue
<q-item
  v-for="frame in otherFrames"
  :key="frame.id"
  clickable dense
  class="frame-item py-1 px-2"
  :title="frame.name"
  @click="onFrameClick(frame)"
  @dblclick="onFrameDblClick(frame)"
>
  <q-item-section avatar class="frame-item__avatar">
    <q-icon :name="frame.isFavorite ? 'o_star' : 'o_bookmark_border'" size="xs"
      :color="frame.isFavorite ? 'warning' : 'grey'" />
  </q-item-section>
  <q-item-section>
    <q-item-label class="frame-item__name">{{ frame.name }}</q-item-label>
  </q-item-section>
  <q-item-section side>
    <q-btn flat round dense size="xs"
      :icon="frame.isFavorite ? 'o_star' : 'o_star_border'"
      :color="frame.isFavorite ? 'warning' : 'grey'"
      @click.stop="toggleFavorite(frame)" />
  </q-item-section>
</q-item>
```

- [ ] **Step 3: scoped style 加 frame-item 样式**

`.send-page` 块后追加:

```scss
.frame-item__name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--rw-font-size-body);
  color: var(--rw-color-text-primary);
}
.frame-item__avatar {
  min-width: 24px;
}
.frame-item:hover {
  background: var(--rw-color-surface-selected);
}
```

- [ ] **Step 4: 视觉验证**

Run dev,确认:所有帧项高度一致;长名省略+悬停 tooltip;无"N 个字段"行;收藏与未收藏视觉区分清晰。

- [ ] **Step 5: 提交**

```bash
git add rewrite/src/pages/SendPage.vue
git commit -m "feat(send): 左栏帧列表单行 ellipsis,去字段数,统一高度"
```

---

## Task 5: 编辑弹窗接 hex 切换 + flex 滚动

**Files:**
- Modify: `rewrite/src/pages/SendPage.vue`(编辑弹窗行 579-631 + script hexMode/fieldErrors 状态)

- [ ] **Step 1: 加 hexMode 与 fieldErrors 状态**

script 区(行 262-266 editValues 等附近)加:

```typescript
const editHexMode = ref(false);
const editFieldErrors = ref<Record<string, string>>({});
```

`onEditDialogHide`(行 271-276)追加清空:

```typescript
editHexMode.value = false;
editFieldErrors.value = {};
```

- [ ] **Step 2: FieldEditWidget 传 props 并接收事件**

行 605-613 的 `<FieldEditWidget>` 改为:

```vue
<FieldEditWidget
  :fields="editFrameFields"
  :values="editValues"
  :preview-values="editPreviewValues"
  :hex-mode="editHexMode"
  :field-errors="editFieldErrors"
  direction="send"
  @update:values="editValues = $event"
  @update:hex-mode="editHexMode = $event"
  @field-error="(p) => {
    if (p.error) editFieldErrors = { ...editFieldErrors, [p.fieldId]: p.error };
    else { const n = { ...editFieldErrors }; delete n[p.fieldId]; editFieldErrors = n; }
  }"
/>
```

- [ ] **Step 3: 弹窗顶部加 hex 切换按钮(可调字段卡上方)**

在 FieldEditWidget 包裹层(行 605 的 `<div v-if="editFrameFields.length > 0">`)内,FieldEditWidget 前加 hex 切换条:

```vue
<div v-if="editFrameFields.length > 0" class="flex-1 min-h-0 overflow-y-auto mt-2">
  <div class="flex items-center justify-end mb-2">
    <q-btn-toggle
      v-model="editHexMode"
      no-caps dense unelevated toggle-color="primary"
      :options="[{label:'Dec', value:false},{label:'Hex', value:true}]"
      size="sm"
    />
  </div>
  <FieldEditWidget ... />
</div>
```

(把原 `rw-dialog-scroll-body` class 从该 div 移除,改用上面的 flex class。)

- [ ] **Step 4: 弹窗 body 容器改 flex 布局**

行 580-584 的 `q-card` 结构:确保 `q-card-section` 用 `flex flex-col`,FieldEditWidget 容器用 `flex-1 min-h-0 overflow-y-auto`,不再依赖 `.rw-dialog-scroll-body` 写死 60vh。验证:FieldEditWidget 那层 div 已是 `flex-1 min-h-0 overflow-y-auto`(Step 3 已加)。

- [ ] **Step 5: 右栏 fieldToHex 改用 util 统一口径**

script 顶部 import 区(行 16 附近)加:

```typescript
import { valueToDisplayString, isHexCapableField } from '@/features/send';
```

删除 `fieldToHex` 函数(行 293-299),所有引用处(行 526)替换为内联:

```vue
<span class="rw-text-value text-xs font-mono">{{
  isHexCapableField(field)
    ? valueToDisplayString(selectedInstance.userFieldValues[field.id], field, true)
    : (selectedInstance.userFieldValues[field.id] ?? '--')
}}</span>
```

- [ ] **Step 6: 视觉验证**

Run dev,打开编辑弹窗:点 Hex 切换,数值字段显示 0x 前缀;输入 `1acffc1d` 存为数值,右栏显示 `0x1ACFFC1D`;Dec 模式下方 hint 显示 `Hex=0xFF`;字段多时弹窗内滚动而非写死 60vh。

- [ ] **Step 7: 提交**

```bash
git add rewrite/src/pages/SendPage.vue
git commit -m "feat(send): 编辑弹窗 hex 双显切换 + flex 滚动 + 右栏口径统一"
```

---

## Task 6: 右栏卡片化

**Files:**
- Modify: `rewrite/src/pages/SendPage.vue`(行 491-575 右栏)

- [ ] **Step 1: 右栏发送区钉底**

行 491 右栏容器已是 `flex flex-col`,把内容区(实例信息/预览/参数/问题)包进 `<div class="flex-1 overflow-y-auto min-h-0">`,发送区(行 547-567)单独留 `flex-shrink-0` 在外。

结构调整:行 492-544 的 `<template v-if="selectedInstance">` 拆为两段——
- 上半(实例信息+预览+参数+问题)进 `flex-1 overflow-y-auto min-h-0`
- 下半(发送区)进 `flex-shrink-0`

- [ ] **Step 2: 四块分隔线 → 卡片 class**

为实例信息块(行 494)、预览块(行 510)、参数块(行 517)各加 class `send-panel`,删 `rw-divider-b`。构建问题块(行 532)不再单独成块,其内容合并进参数块行内。

各 `<div class="p-4 rw-divider-b">` → `<div class="send-panel">`。

- [ ] **Step 3: scoped style 加 send-panel**

```scss
.send-panel {
  background: var(--rw-color-surface-base);
  border: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle);
  border-radius: var(--rw-radius-panel);
  padding: var(--rw-space-3);
  margin-bottom: var(--rw-space-2);
}
.send-panel :first-child { margin-top: 0; }
```

- [ ] **Step 4: 构建问题合并进参数块**

把原构建问题块(行 532-544)的 issue 渲染逻辑移进参数块(行 517-529)内,参数行下方加:

```vue
<div v-if="fullPreview.issues.length > 0" class="mt-2">
  <div v-for="(issue, idx) in fullPreview.issues" :key="issueKeys[idx]"
    class="text-xs" :class="issue.severity === 'o_error' ? 'text-negative' : 'text-warning'">
    {{ issue.message }}
  </div>
</div>
```

- [ ] **Step 5: 视觉验证**

Run dev:右栏四卡片布局;发送区钉底始终可见;参数多时上方滚动,发送按钮不被推走。

- [ ] **Step 6: 提交**

```bash
git add rewrite/src/pages/SendPage.vue
git commit -m "feat(send): 右栏四块分隔线 → 卡片化,发送区钉底"
```

---

## Task 7: 表格操作列收纳

**Files:**
- Modify: `rewrite/src/features/send/components/instance-columns.ts`(操作列宽度)
- Modify: `rewrite/src/pages/SendPage.vue`(行 471-486 操作列 slot)

- [ ] **Step 1: 缩操作列宽度**

`instance-columns.ts` 行 73-74,把:

```typescript
style: 'width: 200px',
headerStyle: 'width: 200px',
```

改为:

```typescript
style: 'width: 80px',
headerStyle: 'width: 80px',
```

- [ ] **Step 2: 操作列 slot 改为 编辑按钮 + 菜单**

`SendPage.vue` 行 471-486 `body-cell-_actions` slot 替换为:

```vue
<template #body-cell-_actions="props">
  <q-td :props="props">
    <div v-if="!batchMode" class="flex items-center justify-center">
      <q-btn flat round dense icon="o_edit" size="sm" color="primary"
        @click.stop="onEditInstance(props.row)" />
      <q-btn flat round dense icon="o_more_vert" size="sm" color="grey">
        <q-menu anchor="bottom right" self="top right">
          <q-list dense style="min-width: 120px">
            <q-item clickable v-close-popup @click="onCloneInstance(props.row)">
              <q-item-section avatar><q-icon name="o_content_copy" size="xs" /></q-item-section>
              <q-item-section>复制</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="onMoveUp(props.row)" :disable="props.row._index <= 1">
              <q-item-section avatar><q-icon name="o_arrow_upward" size="xs" /></q-item-section>
              <q-item-section>上移</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="onMoveDown(props.row)" :disable="props.row._index >= tableRows.length">
              <q-item-section avatar><q-icon name="o_arrow_downward" size="xs" /></q-item-section>
              <q-item-section>下移</q-item-section>
            </q-item>
            <q-separator />
            <q-item clickable v-close-popup class="text-negative" @click="onRemoveInstance(props.row)">
              <q-item-section avatar><q-icon name="o_delete" size="xs" /></q-item-section>
              <q-item-section>删除</q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </q-btn>
    </div>
    <q-btn v-else flat round dense icon="o_edit" size="sm" color="primary" :disable="true" />
  </q-td>
</template>
```

- [ ] **Step 3: 视觉验证**

Run dev:操作列只露编辑+更多按钮;点更多弹出菜单含复制/上移/下移/删除;功能与改动前一致。

- [ ] **Step 4: 提交**

```bash
git add rewrite/src/features/send/components/instance-columns.ts rewrite/src/pages/SendPage.vue
git commit -m "feat(send): 表格操作列 5 图标 → 编辑+菜单收纳"
```

---

## Task 8: 回归验证 + 样式基线扫描

**Files:** 无新改动,仅验证。

- [ ] **Step 1: 跑 send feature 测试**

Run: `pnpm -C rewrite test -- src/features/send/`
Expected: 全部 PASS(含 Task 1 新增的 numeric-field-format.spec.ts)。无回归。

- [ ] **Step 2: 跑 task + command-ingress 测试(确认无连带回归)**

Run: `pnpm -C rewrite test`
Expected: 无新增失败。已知 6 个预存失败(heartbeat-timer/connection-core)与本任务无关,排除。

- [ ] **Step 3: tsc 类型检查**

Run: `pnpm -C rewrite build`(或 tsc --noEmit)
Expected: 0 error。

- [ ] **Step 4: 样式基线扫描**

Run(检查无新增硬编码视觉值):

```bash
git diff main -- rewrite/src/pages/SendPage.vue rewrite/src/widgets/FieldEditWidget.vue | grep -E "#[0-9a-f]{3,6}|rgb\(|hsl\(|border:\s*[0-9]|padding:\s*[0-9]|font-size:\s*[0-9]"
```

Expected: 无输出(所有视觉值走 token)。Task 2/6 的 scoped style 用的是 `var(--rw-*)`,应无裸值。若 grep 命中,排查并改用 token。

- [ ] **Step 5: lint**

Run: `pnpm -C rewrite lint`
Expected: 0 新增 error。

- [ ] **Step 6: 手动端到端验证清单**

逐项确认(对照 spec §6 验证标准):
- [ ] 任意帧数量下页面整体不滚动,三栏独立滚,发送按钮始终可见
- [ ] 左栏所有帧项高度一致,长名 ellipsis+tooltip,无字段数行
- [ ] 编辑弹窗 Dec/Hex 切换;输入 `1acffc1d`(hex)存数值,右栏显示 `0x1ACFFC1D`
- [ ] 编辑弹窗三段卡片化;字段多时弹窗内滚动
- [ ] 右栏四卡片,发送区钉底,构建问题并入参数卡
- [ ] 表格操作列 ≤80px,菜单功能齐全

- [ ] **Step 7: 最终提交(若有 lint 修复)**

```bash
git add -A
git commit -m "test(send): 回归验证 + 样式基线扫描通过"
```

---

## Self-Review 结果

**Spec coverage(逐条对 spec §3):**
- 3.1 高度链 → Task 3 ✅
- 3.2 左栏 → Task 4 ✅
- 3.3.1 hex 双显机制 → Task 1(util)+ Task 2(显示)+ Task 5(切换/口径)✅
- 3.3.2 分组卡片 → Task 2 ✅
- 3.3.3 弹窗 flex 结构 → Task 5 ✅
- 3.4 右栏卡片 → Task 6 ✅
- 3.5 表格操作列收纳 → Task 7 ✅
- 3.6 视觉层次 → Task 2/4/6 的 scoped style(纵深/选中态/字号)✅

**Placeholder scan:** 各 scoped style 的 token 名已全部核对 `app.scss:6-71` 真实定义并替换(去掉了所有 fallback 占位)。发现并修正了一个隐藏问题:`--rw-color-surface-elevated` 从未在 app.scss 定义(SendPage 现有 hex-preview 用了它但实际回退透明),计划统一改用 `--rw-color-surface-app`。无 TBD/TODO 文字占位。类型签名一致(`ParseResult`/`parseFieldInput` 等在 Task 1 定义,Task 2/5 引用一致)。

**Type consistency:** `isHexCapableField`/`valueToDisplayString`/`formatCounterpart`/`parseFieldInput` 在 Task 1 定义,Task 2/5 引用名一致。`editHexMode`/`editFieldErrors` 在 Task 5 定义并使用。

**Scope:** 单一实现计划,8 个 task 顺序依赖(1→2→5,3 独立,4/6/7 独立,8 收尾),聚焦 SendPage UI,符合一个 plan。
