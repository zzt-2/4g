# 帧实例编辑弹窗重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重做 SendPage 帧实例编辑弹窗的输入交互与呈现——双输入框联动(Dec/Hex)、禁科学计数法、表达式结果手动计算按钮、字段 description 改 hover tooltip、表达式公式翻译显示、字段行布局重做。

**Architecture:** UI 层改动为主。`numeric-field-format.ts` 扩展显示口径(禁科学计数法 + 新增公式标签函数);求值层 `evaluateFieldExpressions` 透传 `matchedIndex`(零成本,已有);`FieldEditWidget.vue` 重写模板与 scoped CSS(双输入框、hover tooltip、公式显示);`SendPage.vue` 切换钮换为 committedValues 快照 + 计算按钮接线。不动发送管线、不动帧模板编辑器。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + Quasar + Vitest + SCSS tokens (`--rw-*`).

**Spec:** `docs/superpowers/specs/2026-06-19-field-edit-dialog-redesign-design.md`

**前置事实(已核对):**
- `evaluateConditional` (`rewrite/src/shared/expression/evaluate.ts:18-38`) 已返回 `matchedIndex`,但 `evaluateFieldExpressions` (`rewrite/src/features/send/core/frame-resolver.ts:238`) 调它后丢弃了 `matchedIndex`,只取 `value`。Task 1 透传它。
- `ExpressionDefinition` 结构(`rewrite/src/features/frame/core/types.ts:65-68`):`{ expressions: ConditionalExpressionDefinition[], variables: ExpressionVariableDefinition[] }`,其中 `ConditionalExpressionDefinition = { condition, expression }`,`ExpressionVariableDefinition = { identifier, sourceType, sourceId?, frameId?, fieldId? }`。
- 可 hex 字段类型:`uint8/int8/uint16/int16/uint32/int32/uint64/int64`(`numeric-field-format.ts:6-8` `INTEGER_TYPES`)。
- `numeric-field-format.spec.ts` 现有 18 用例,全部保留。

---

## File Structure

| 文件 | 责任 | 本轮改动 |
|------|------|---------|
| `rewrite/src/shared/expression/evaluate.ts` | 表达式求值(已返回 matchedIndex) | 不改 |
| `rewrite/src/features/send/core/frame-resolver.ts` | 字段表达式求值编排 | `evaluateFieldExpressions` 返回值透传 `matchedBranchIndex` |
| `rewrite/src/features/send/core/types.ts` | send core 类型 | 新增 `FieldExpressionEvaluation` 返回类型字段(若需) |
| `rewrite/src/features/send/composables/numeric-field-format.ts` | 数值显示/解析 util | `valueToDisplayString` Dec 分支禁科学计数法;新增 `fieldExpressionLabel` |
| `rewrite/src/features/send/composables/__tests__/numeric-field-format.spec.ts` | util 测试 | 补禁科学计数法 + `fieldExpressionLabel` 用例 |
| `rewrite/src/widgets/FieldEditWidget.vue` | 编辑弹窗主体 | 双输入框、删 description 常驻、hover tooltip、公式显示、计算按钮(stale)、scoped CSS |
| `rewrite/src/pages/SendPage.vue` | 调用方 | 删 Dec/Hex 切换钮;committedValues 快照 + stale + 计算按钮接线 |

---

## Task 1: 求值层透传 matchedBranchIndex

**Files:**
- Modify: `rewrite/src/features/send/core/frame-resolver.ts:210-250`
- Test: `rewrite/src/features/send/core/__tests__/frame-resolver.spec.ts`(若存在;否则就近测试)

**目标:** `evaluateFieldExpressions` 返回值带上命中的分支索引,供公式显示用真实命中分支。

- [ ] **Step 1: 读现状确认返回类型**

Read `rewrite/src/features/send/core/frame-resolver.ts:210-250`。现状返回 `{ value: SendFieldValue | null; issues: SendBuildIssue[] }`,`evalResult.matchedIndex` 在 238 行被丢弃。

- [ ] **Step 2: 写失败测试**

追加到 `frame-resolver` 的现有测试文件(若无则在 `__tests__/` 新建 `frame-resolver-expression.spec.ts`)。测试构造一个双分支表达式字段(`[{condition:'var1>0', expression:'var1+1'}, {condition:'true', expression:'0'}]`),变量 var1 来自某 source 字段,source 值设为 5(>0 命中第一条)。

```ts
import { describe, it, expect } from 'vitest';
import { evaluateFieldExpressions } from '../frame-resolver';
import type { SendFieldEncodingDef } from '../../types';
// 构造一个带双分支 expressionConfig 的 SendFieldEncodingDef
// 调 evaluateFieldExpressions(field, mergedVariables)
// expect(result.value).toBe(6)
// expect(result.matchedBranchIndex).toBe(0)
// 再把 source 值设为 -1(<=0,落 fallback),expect matchedBranchIndex === -1
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm --filter rewrite test -- --run frame-resolver`
Expected: FAIL — `matchedBranchIndex` 不存在于返回值。

- [ ] **Step 4: 改 `evaluateFieldExpressions` 透传 matchedIndex**

`rewrite/src/features/send/core/frame-resolver.ts:210-250`,返回类型加 `matchedBranchIndex: number`:

```ts
export function evaluateFieldExpressions(
  field: SendFieldEncodingDef,
  mergedVariables: VariableMap,
): { value: SendFieldValue | null; matchedBranchIndex: number; issues: SendBuildIssue[] } {
  const issues: SendBuildIssue[] = [];
  if (!field.expressionConfig) {
    return { value: null, matchedBranchIndex: -1, issues };
  }
  const { variables: evalVars, issues: resolveIssues } = resolveExpressionVariables(
    field.expressionConfig, mergedVariables,
  );
  issues.push(...resolveIssues);
  const branches = field.expressionConfig.expressions;
  const compileResult = compileConditional(branches);
  if (!compileResult.success) {
    issues.push({ severity: 'error', code: 'send.resolve.expressionCompile', fieldId: field.id, message: `Expression compile failed for field "${field.id}": ${compileResult.error}` });
    return { value: null, matchedBranchIndex: -1, issues };
  }
  const evalResult = evaluateConditional(compileResult.compiled, evalVars);
  if (!evalResult.success) {
    issues.push({ severity: 'error', code: 'send.resolve.expressionEval', fieldId: field.id, message: `Expression eval failed for field "${field.id}": ${evalResult.error}` });
    return { value: null, matchedBranchIndex: -1, issues };
  }
  return { value: evalResult.value, matchedBranchIndex: evalResult.matchedIndex, issues };
}
```

- [ ] **Step 5: 扫描 evaluateFieldExpressions 的其他调用方,确保兼容新增字段**

Run: `rg "evaluateFieldExpressions" rewrite/src`
检查所有调用方:它们解构的是 `{ value, issues }`,新增 `matchedBranchIndex` 不破坏解构,兼容。若某处用了返回类型做类型标注,补上新字段。

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm --filter rewrite test -- --run frame-resolver`
Expected: PASS。

- [ ] **Step 7: 运行全量 send 测试确认无回归**

Run: `pnpm --filter rewrite test -- --run src/features/send`
Expected: 全过。

- [ ] **Step 8: Commit**

```bash
git add rewrite/src/features/send/core/frame-resolver.ts rewrite/src/features/send/core/__tests__/
git commit -m "feat(send): evaluateFieldExpressions 透传 matchedBranchIndex 供公式显示"
```

---

## Task 2: valueToDisplayString Dec 分支禁科学计数法

**Files:**
- Modify: `rewrite/src/features/send/composables/numeric-field-format.ts:71-96`
- Test: `rewrite/src/features/send/composables/__tests__/numeric-field-format.spec.ts`

**目标:** 大数值(如 1e21 以上)显示为纯十进制串而非科学计数法。

- [ ] **Step 1: 写失败测试**

追加到 `numeric-field-format.spec.ts` 的 `valueToDisplayString` describe 块:

```ts
describe('valueToDisplayString - 禁科学计数法', () => {
  it('uint32 大值 Dec 显示纯数字串', () => {
    const f = field('uint32');
    expect(valueToDisplayString(4000000000, f, false)).toBe('4000000000');
  });
  it('uint64 超 safe int Dec 显示纯数字串', () => {
    const f = field('uint64');
    expect(valueToDisplayString('18446744073709551615', f, false)).toBe('18446744073709551615');
  });
  it('uint64 超 safe int Hex 显示 0x 串', () => {
    const f = field('uint64');
    expect(valueToDisplayString('18446744073709551615', f, true)).toBe('0xFFFFFFFFFFFFFFFF');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter rewrite test -- --run numeric-field-format`
Expected: FAIL — 现状 `String(4000000000)` 实际不会触发科学计数法(1e21 才触发),但 `String(1e21)` 会。调整测试用例确保覆盖:`valueToDisplayString(1e21, field('uint64'), false)` 期望 `'1000000000000000000000'`。现状会得 `'1e+21'`,FAIL。

修正测试用例:
```ts
it('uint64 超大值 Dec 不用科学计数法', () => {
  const f = field('uint64');
  expect(valueToDisplayString(1e21, f, false)).toBe('1000000000000000000000');
});
```

- [ ] **Step 3: 改 `valueToDisplayString` 的非 BigInt 分支**

`numeric-field-format.ts:87-95`,现状:
```ts
if (!isHexCapableField(f)) return String(v);
const num = toNumberOrNan(v);
if (Number.isNaN(num)) return String(v);
if (hexMode) {
  const neg = num < 0;
  const mag = Math.abs(num);
  return (neg ? '-0x' : '0x') + mag.toString(16).toUpperCase();
}
return String(num);
```

改为(Dec 分支用安全整数判断 + BigInt 兜底):

```ts
if (!isHexCapableField(f)) return String(v);
const num = toNumberOrNan(v);
if (Number.isNaN(num)) return String(v);
if (hexMode) {
  const neg = num < 0;
  const mag = Math.abs(num);
  // 大数 toString(16) 不会科学计数法,安全
  return (neg ? '-0x' : '0x') + Math.round(mag).toString(16).toUpperCase();
}
// Dec 分支:禁科学计数法。安全整数内 toString 安全;超安全范围走 BigInt 兜底。
if (Number.isSafeInteger(num)) return num.toString();
// 超出安全整数范围:用 BigInt 转纯十进制串(可能丢小数精度,但本分支仅整数类型)
try {
  const bi = BigInt(Math.trunc(num));
  return bi.toString(10);
} catch {
  return num.toString();
}
```

注意:Hex 分支补 `Math.round` 防止浮点尾差(如 449838109.0000001)。Dec 分支 BigInt 兜底覆盖 1e21 这类。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter rewrite test -- --run numeric-field-format`
Expected: 全过(含原 18 用例 + 新增)。

- [ ] **Step 5: Commit**

```bash
git add rewrite/src/features/send/composables/numeric-field-format.ts rewrite/src/features/send/composables/__tests__/numeric-field-format.spec.ts
git commit -m "fix(send): valueToDisplayString Dec 分支禁科学计数法 (BigInt 兜底)"
```

---

## Task 3: 新增 fieldExpressionLabel(公式翻译显示)

**Files:**
- Modify: `rewrite/src/features/send/composables/numeric-field-format.ts`
- Modify: `rewrite/src/features/send/index.ts`(若需导出)
- Test: `rewrite/src/features/send/composables/__tests__/numeric-field-format.spec.ts`

**目标:** 把表达式字段命中分支的 `expression` 串里的变量 identifier 翻译为来源字段名,返回 `值 = 公式` 的公式部分文本。

- [ ] **Step 1: 写失败测试**

追加到 `numeric-field-format.spec.ts`:

```ts
describe('fieldExpressionLabel', () => {
  const frameFields: FrameFieldDefinition[] = [
    { id: 'field-source', name: '源字段', dataType: 'uint8', length: 1, inputType: 'input', configurable: true, options: [] } as unknown as FrameFieldDefinition,
    { id: 'field-expr', name: '表达式字段', dataType: 'uint8', length: 1, inputType: 'expression', configurable: false, options: [], expressionConfig: {
        expressions: [
          { condition: 'var1 > 0', expression: 'var1 + 1' },
          { condition: 'true', expression: '0' },
        ],
        variables: [{ identifier: 'var1', sourceType: 'current_field', fieldId: 'field-source' }],
      } } as unknown as FrameFieldDefinition,
  ];

  it('命中第 0 分支:变量翻译为来源字段名', () => {
    const label = fieldExpressionLabel(frameFields[1]!, frameFields, 0);
    expect(label).toBe('源字段 + 1');
  });
  it('命中第 1 分支:无变量,原样返回', () => {
    const label = fieldExpressionLabel(frameFields[1]!, frameFields, 1);
    expect(label).toBe('0');
  });
  it('matchedIndex=-1(fallback):返回首条 + 标注', () => {
    const label = fieldExpressionLabel(frameFields[1]!, frameFields, -1);
    expect(label).toBe('源字段 + 1 (可能多分支)');
  });
  it('无 expressionConfig:返回空串', () => {
    const label = fieldExpressionLabel(frameFields[0]!, frameFields, 0);
    expect(label).toBe('');
  });
  it('变量 fieldId 映射不到字段:保留原 identifier', () => {
    const f = { ...frameFields[1]!, expressionConfig: {
        expressions: [{ condition: 'true', expression: 'varX * 2' }],
        variables: [{ identifier: 'varX', sourceType: 'current_field', fieldId: 'no-such-field' }],
      } } as unknown as FrameFieldDefinition;
    expect(fieldExpressionLabel(f, frameFields, 0)).toBe('varX * 2');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter rewrite test -- --run numeric-field-format`
Expected: FAIL — `fieldExpressionLabel` 未定义。

- [ ] **Step 3: 实现 fieldExpressionLabel**

在 `numeric-field-format.ts` 末尾追加:

```ts
import type { FrameFieldDefinition } from '@/features/frame';

/**
 * 构造表达式字段的公式显示文本(翻译后人话)。
 * 把命中分支 expression 串里的变量 identifier 替换为来源字段名。
 * @param matchedIndex 命中分支索引(-1 = fallback/未知)
 * @returns 公式文本,如 "源字段 + 1";无 expressionConfig 返回 ''
 */
export function fieldExpressionLabel(
  field: FrameFieldDefinition,
  allFields: readonly FrameFieldDefinition[],
  matchedIndex: number,
): string {
  const cfg = field.expressionConfig;
  if (!cfg || cfg.expressions.length === 0) return '';

  const branches = cfg.expressions;
  const idx = matchedIndex >= 0 && matchedIndex < branches.length ? matchedIndex : 0;
  const branch = branches[idx]!;
  let expr = branch.expression;

  // 变量 identifier → 来源字段名
  for (const v of cfg.variables) {
    if (!v.identifier) continue;
    const srcField = allFields.find((f) => f.id === v.fieldId);
    const replacement = srcField?.name ?? v.identifier;
    // 全词替换 identifier(避免 var1 替换破坏 var10)
    expr = expr.replace(new RegExp(`\\b${escapeRegExp(v.identifier)}\\b`, 'g'), replacement);
  }

  if (matchedIndex < 0 && branches.length > 1) {
    return `${expr} (可能多分支)`;
  }
  return expr;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

- [ ] **Step 4: 在 index.ts 导出 fieldExpressionLabel**

`rewrite/src/features/send/index.ts` 在 numeric-field-format 相关导出处加:
```ts
export { fieldExpressionLabel } from './composables/numeric-field-format';
```
(确认现有 `valueToDisplayString` 等的导出位置,紧随其后。)

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter rewrite test -- --run numeric-field-format`
Expected: 全过。

- [ ] **Step 6: Commit**

```bash
git add rewrite/src/features/send/composables/numeric-field-format.ts rewrite/src/features/send/composables/__tests__/numeric-field-format.spec.ts rewrite/src/features/send/index.ts
git commit -m "feat(send): fieldExpressionLabel 公式翻译显示 (变量→来源字段名)"
```

---

## Task 4: evaluateFieldPreviewForUI 暴露 matchedBranchIndex

**Files:**
- Modify: `rewrite/src/features/send/core/frame-resolver.ts:306-329`

**目标:** 现有 `evaluateFieldPreviewForUI`(FieldEditWidget 取预览值的入口)只返回 `{value, issues}`。加 `matchedBranchIndex` 透传,供公式显示用真实命中分支。

- [ ] **Step 1: 读现状**

`frame-resolver.ts:306-329`,`evaluateFieldPreview` → `resolveFieldValues` + `applyFactor`,内部未走 `evaluateFieldExpressions`(走的是 resolveFieldValues)。需确认 resolveFieldValues 对表达式字段是否调 evaluateFieldExpressions 并丢弃了 matchedIndex。

Run: `rg "evaluateFieldExpressions" rewrite/src/features/send/core/frame-resolver.ts`
读 resolveFieldValues 实现,找到调 evaluateFieldExpressions 的地方,确认 matchedBranchIndex 在哪被丢。

- [ ] **Step 2: 决定透传路径**

两种:
- (a) `resolveFieldValues` 返回值每个字段带 matchedBranchIndex(改动大,影响面广)
- (b) `evaluateFieldPreviewForUI` 对表达式字段额外单独调一次 `evaluateFieldExpressions` 拿 matchedBranchIndex(只影响 UI 预览路径,改动小)

**选 (b)**:UI 预览路径性能不敏感(字段数少),单独再求一次表达式拿分支索引,不影响 resolveFieldValues 主路径。

- [ ] **Step 3: 改 evaluateFieldPreviewForUI**

```ts
export function evaluateFieldPreviewForUI(
  frame: ReadonlyFrameAsset,
  fieldId: string,
  userFieldValues: Readonly<Record<string, SendFieldValue>>,
  variableProvider: SendVariableProvider,
  variables?: VariableMap,
): { value: SendFieldValue; matchedBranchIndex: number; issues: SendBuildIssue[] } {
  const { fields } = frameToBuildInput(frame);
  const field = fields.find((f) => f.id === fieldId);
  if (!field) return { value: 0, matchedBranchIndex: -1, issues: [] };
  const base = evaluateFieldPreview(field, userFieldValues, variableProvider, variables);
  // 表达式字段:额外求一次拿命中分支索引(仅 UI 用)
  let matchedBranchIndex = -1;
  if (field.expressionConfig) {
    const merged = mergeVariableMaps(variables ?? new Map(), buildMergedVariables(field, userFieldValues, variableProvider));
    const exprResult = evaluateFieldExpressions(field, merged);
    matchedBranchIndex = exprResult.matchedBranchIndex;
  }
  return { value: base.value, matchedBranchIndex, issues: base.issues };
}
```

**注意:** `buildMergedVariables` / `mergeVariableMaps` 是示例名,实施时读 resolveFieldValues 内部如何构造 mergedVariables,复用同样逻辑(可能就是 resolveExpressionVariables 的输出)。不要发明新逻辑,复用现有变量解析。若复用成本高,回退方案:matchedBranchIndex 在无法准确判定时返回 -1(公式显示走 "可能多分支" 标注),不阻塞。

- [ ] **Step 4: 更新调用方**

`use-frame-preview.ts:65-77` 的 `fieldPreviews.map` 现在 `fieldId/fieldName/value` 三字段,加 `matchedBranchIndex`:

```ts
const fieldPreviews = f.fields.map((field) => {
  const preview = evaluateFieldPreviewForUI(f, field.id, userFieldValues.value, NOOP_VARIABLE_PROVIDER);
  return {
    fieldId: field.id,
    fieldName: field.name,
    value: preview.value,
    matchedBranchIndex: preview.matchedBranchIndex,
  };
});
```

同步更新 `FramePreviewResult.fieldPreviews` 类型(`use-frame-preview.ts:16-20`)加 `readonly matchedBranchIndex: number`。

- [ ] **Step 5: 运行全量 send 测试**

Run: `pnpm --filter rewrite test -- --run src/features/send`
Expected: 全过(新增字段不破坏现有解构)。

- [ ] **Step 6: Commit**

```bash
git add rewrite/src/features/send/core/frame-resolver.ts rewrite/src/features/send/composables/use-frame-preview.ts
git commit -m "feat(send): evaluateFieldPreviewForUI 暴露 matchedBranchIndex"
```

---

## Task 5: FieldEditWidget 双输入框联动 + 删 description 常驻 + hover tooltip

**Files:**
- Modify: `rewrite/src/widgets/FieldEditWidget.vue`

**目标:** 可调数值字段改双输入框(左 Dec、右 Hex 带 0x 前缀);删三处 description 常驻行;字段行包 q-tooltip(hover 显示字段全名 + description)。

- [ ] **Step 1: 读现状 FieldEditWidget.vue 全文**

Read `rewrite/src/widgets/FieldEditWidget.vue`(271 行)。确认 props/emits/computed/模板/scoped CSS 当前结构。

- [ ] **Step 2: 改 script — 新增双输入解析入口**

替换 `onNumericInput`(123-132)为两个入口:

```ts
function onDecInput(field: FrameFieldDefinition, raw: string | number | null): void {
  const text = raw === null ? '' : String(raw);
  const result = parseFieldInput(text, false, field); // 固定 dec
  if (!result.ok) {
    emit('field-error', { fieldId: field.id, error: result.error });
    return;
  }
  emit('field-error', { fieldId: field.id, error: undefined });
  onFieldChange(field.id, result.value);
}

function onHexInput(field: FrameFieldDefinition, raw: string | number | null): void {
  const text = raw === null ? '' : String(raw);
  const result = parseFieldInput(text, true, field); // 固定 hex
  if (!result.ok) {
    emit('field-error', { fieldId: field.id, error: result.error });
    return;
  }
  emit('field-error', { fieldId: field.id, error: undefined });
  onFieldChange(field.id, result.value);
}
```

新增辅助:Hex 框显示值(去掉 0x 前缀,因为前缀由 q-input prefix 提供):

```ts
function hexBoxValue(field: FrameFieldDefinition): string {
  const v = resolveFieldInputValue(field);
  if (v === undefined || v === null || v === '') return '';
  const display = valueToDisplayString(v, field, true); // 形如 0x1ACFFC1D
  return display.startsWith('0x') ? display.slice(2) : display;
}
function decBoxValue(field: FrameFieldDefinition): string {
  const v = resolveFieldInputValue(field);
  if (v === undefined || v === null || v === '') return '';
  return valueToDisplayString(v, field, false);
}
```

- [ ] **Step 3: 改模板 — 可调数值字段双输入框**

替换 configurable + input 分支(模板 149-172)为:

```vue
<!-- ===== Configurable — numeric input (双输入框 Dec/Hex 联动) ===== -->
<template v-if="section.key === 'configurable' && field.inputType === 'input' && isHexCapableField(field)">
  <div class="field-row field-row--dual">
    <span class="field-row__label">{{ field.name }}<template v-if="hasNonTrivialFactor(field)">&nbsp;(x{{ field.factor }})</template></span>
    <q-input
      outlined dense
      placeholder="Dec"
      :model-value="decBoxValue(field)"
      :error="!!props.fieldErrors?.[field.id]"
      :error-message="props.fieldErrors?.[field.id]"
      class="field-row__dec"
      @update:model-value="onDecInput(field, $event)"
    />
    <q-input
      outlined dense
      prefix="0x"
      placeholder=".."
      :model-value="hexBoxValue(field)"
      :error="!!props.fieldErrors?.[field.id]"
      class="field-row__hex"
      @update:model-value="onHexInput(field, $event)"
    />
  </div>
  <q-tooltip v-if="field.description || field.name" max-width="280px" class="field-row__tooltip">
    <span class="font-weight-medium">{{ field.name }}</span>
    <template v-if="field.description"><br />{{ field.description }}</template>
  </q-tooltip>
</template>

<!-- ===== Configurable — non-hex input (float/double/string) 单框占满 ===== -->
<template v-else-if="section.key === 'configurable' && field.inputType === 'input'">
  <div class="field-row field-row--single">
    <span class="field-row__label">{{ field.name }}<template v-if="hasNonTrivialFactor(field)">&nbsp;(x{{ field.factor }})</template></span>
    <q-input
      outlined dense
      :type="isNumericField(field) ? 'number' : 'text'"
      :model-value="resolveFieldInputValue(field)"
      :error="!!props.fieldErrors?.[field.id]"
      :error-message="props.fieldErrors?.[field.id]"
      class="field-row__input field-row__input--span2"
      @update:model-value="onDecInput(field, $event)"
    />
  </div>
  <q-tooltip v-if="field.description || field.name" max-width="280px" class="field-row__tooltip">
    <span class="font-weight-medium">{{ field.name }}</span>
    <template v-if="field.description"><br />{{ field.description }}</template>
  </q-tooltip>
</template>
```

注意:`onDecInput` 对 float/double 用 hexMode=false 解析,等价原 onNumericInput(hexMode=false)。非数值 string 字段 parseFieldInput 会原样存串。

- [ ] **Step 4: 改模板 — select/radio + 只读段,统一加 tooltip、删 description 常驻行**

- select 分支(174-187):在 `.field-row` 后删 `<div v-if="field.description" ...>`,加同款 `<q-tooltip>`。
- radio 分支(189-202):外层加 `<q-tooltip>`。
- 只读段(204-216):删 `<div v-if="field.description" class="field-row__desc">`,`.field-row` 后加 `<q-tooltip>`。

(只读段的公式显示在 Task 6 加,本步只删 description 常驻 + 加 tooltip。)

- [ ] **Step 5: 改 scoped CSS — 双输入框 grid 三列**

替换 `.field-row` 相关样式(243-269):

```scss
.field-row {
  display: grid;
  grid-template-columns: minmax(72px, 96px) minmax(120px, 1fr) minmax(120px, 1fr);
  align-items: center;
  gap: var(--rw-space-2);
}
.field-row--single {
  /* 单框占满右侧两列 */
}
.field-row__input--span2 {
  grid-column: 2 / -1;
}
.field-row__label {
  font-size: var(--rw-font-size-caption);
  color: var(--rw-color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.field-row__dec { grid-column: 2; }
.field-row__hex { grid-column: 3; }
.field-row__value {
  font-size: var(--rw-font-size-body);
  color: var(--rw-color-text-primary);
  font-family: var(--rw-font-mono);
}
.field-row--readonly .field-row__value {
  background: var(--rw-color-surface-app);
  padding: var(--rw-space-0-5) var(--rw-space-2);
  border-radius: var(--rw-radius-control);
}
/* 删除 .field-row__desc(不再用) */
.field-row__tooltip {
  white-space: pre-line;
  font-size: var(--rw-font-size-caption);
}
```

确认 token:`--rw-font-mono` 若不存在,查 `_tokens.scss` 用实际 mono token 名(可能是 `--rw-font-family-mono`)。`--rw-space-0-5` 确认存在(S006 用过)。

- [ ] **Step 6: 运行类型检查**

Run: `pnpm exec vue-tsc --noEmit -p rewrite/tsconfig.json` 或若 vue-tsc 版本不兼容(S006 已知),用 `pnpm exec tsc --noEmit -p rewrite/tsconfig.json`
Expected: 0 errors。

- [ ] **Step 7: 运行 dev server 目检(手动)**

Run: `pnpm --filter rewrite dev`
打开 SendPage,点某实例"编辑",检查:
- 可调数值字段呈左右双框,左 placeholder Dec、右 prefix 0x。
- 改左框右框自动算,改右框左框自动算。
- 大数值显示纯数字串,无科学计数法。
- hover 字段行出 tooltip(字段名 + description)。
- 字段下不再有灰色 description 常驻行。

- [ ] **Step 8: Commit**

```bash
git add rewrite/src/widgets/FieldEditWidget.vue
git commit -m "feat(widget): FieldEditWidget 双输入框联动 + description 改 hover tooltip"
```

---

## Task 6: FieldEditWidget 表达式公式显示 + 只读段 hex 口径

**Files:**
- Modify: `rewrite/src/widgets/FieldEditWidget.vue`

**目标:** 只读段表达式字段显示 `值 = 公式`;只读段值走 hex 口径;stale 态灰显。

- [ ] **Step 1: 改 script — 引入 fieldExpressionLabel + 公式计算**

在 FieldEditWidget script 加 import 与 computed:

```ts
import { fieldExpressionLabel } from '@/features/send';
// ...

// 所有字段(供公式变量映射查来源字段名)
const allFields = computed(() => props.fields);

// 预览值里的 matchedBranchIndex(由 previewValues 传入,需扩展 previewValues 结构)
// 见 Task 7:previewValues 改为带 matchedBranchIndex 的结构
```

**关键依赖:** Task 4 让 `evaluateFieldPreviewForUI` 返回 matchedBranchIndex,但 FieldEditWidget 现在收的 `previewValues: Record<string, SendFieldValue>` 只有值。需扩展为带分支索引的结构。

**决策:** 新增 prop `previewMeta?: Readonly<Record<string, { matchedBranchIndex: number }>>`,由 SendPage 传入(从 use-frame-preview 的 fieldPreviews 提取)。避免改 previewValues 既有结构。

```ts
const props = defineProps<{
  // ... 现有
  readonly previewMeta?: Readonly<Record<string, { matchedBranchIndex: number }>>;
  readonly stale?: boolean; // 只读段是否 stale
}>();

function expressionFormula(field: FrameFieldDefinition): string {
  if (!field.expressionConfig) return '';
  const idx = props.previewMeta?.[field.id]?.matchedBranchIndex ?? -1;
  return fieldExpressionLabel(field, allFields.value, idx);
}
```

- [ ] **Step 2: 改模板 — 只读段表达式字段加公式**

只读段(204-216,现已是 field-row--readonly)扩展:

```vue
<!-- ===== Read-only: expression or fixed ===== -->
<template v-else>
  <div class="field-row field-row--readonly" :class="{ 'field-row--stale': props.stale }">
    <span class="field-row__label">{{ field.name }}<template v-if="hasNonTrivialFactor(field)">&nbsp;(x{{ field.factor }})</template></span>
    <span class="field-row__value">{{ getDisplayValue(field) }}</span>
    <span v-if="expressionFormula(field)" class="field-row__formula">= {{ expressionFormula(field) }}</span>
  </div>
  <q-tooltip v-if="field.description || field.name" max-width="280px" class="field-row__tooltip">
    <span class="font-weight-medium">{{ field.name }}</span>
    <template v-if="field.description"><br />{{ field.description }}</template>
  </q-tooltip>
</template>
```

注意:只读段字段行现在是三列 grid(label | value | formula),value 占第 2 列,formula 占第 3 列。`.field-row__value` 与 `.field-row__formula` 分别 `grid-column: 2` / `grid-column: 3`。

- [ ] **Step 3: 改 getDisplayValue — 只读段值走 hex 口径**

现状 `getDisplayValue`(88-105)对 isHexCapableField 已走 `valueToDisplayString(val, field, props.hexMode ?? false)`。但双输入框后已无 hexMode。改为**只读段恒 hex 显示**:

```ts
function getDisplayValue(field: FrameFieldDefinition): string {
  if (field.configurable) {
    const val = props.values[field.id];
    if (val !== undefined && val !== null) {
      return isHexCapableField(field) ? valueToDisplayString(val, field, false) : String(val);
    }
  }
  const preview = props.previewValues?.[field.id];
  if (preview !== undefined && preview !== null) {
    // 只读段恒 hex 显示(数值字段)
    return isHexCapableField(field) ? valueToDisplayString(preview, field, true) : String(preview);
  }
  if (field.defaultValue !== undefined) return String(field.defaultValue);
  return '--';
}
```

(configurable 分支理论上不会被只读段渲染走到,但保留 dec 兜底。)

- [ ] **Step 4: scoped CSS — 公式列 + stale 态**

追加:

```scss
.field-row__value {
  grid-column: 2;
  /* 已有样式 */
}
.field-row__formula {
  grid-column: 3;
  font-size: var(--rw-font-size-caption);
  color: var(--rw-color-text-muted);
  font-family: var(--rw-font-mono); /* 确认 token 名 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.field-row--stale .field-row__value {
  opacity: 0.5;
}
.field-row--stale::after {
  /* 角标 · 提示 stale —— 用伪元素或段级标记 */
  content: '·';
  color: var(--rw-color-status-warning);
  /* 位置定位按实际调整 */
}
```

注意 stale 角标的实现:更稳妥是在段标题加 stale 标记(见 Task 7 段标题渲染),而非每行伪元素。本步先做 value 灰显,段标题 stale 标记放 Task 7。

- [ ] **Step 5: 类型检查 + 目检**

Run 类型检查(同 Task 5 Step 6)。
Run dev server,检查只读段:表达式字段显示 `值 = 公式`,变量已翻译为字段名;值恒 hex 形态。

- [ ] **Step 6: Commit**

```bash
git add rewrite/src/widgets/FieldEditWidget.vue
git commit -m "feat(widget): 只读段表达式公式显示 + hex 口径 + stale 灰显"
```

---

## Task 7: SendPage 删切换钮 + committedValues 快照 + 计算按钮

**Files:**
- Modify: `rewrite/src/pages/SendPage.vue`

**目标:** 删 Dec/Hex 全局切换钮;新增 committedValues 快照(只读段依赖它而非 editValues);"可调参数"段标题右侧计算按钮;stale 态判定与传递。

- [ ] **Step 1: 读现状 SendPage 弹窗相关代码**

Read `rewrite/src/pages/SendPage.vue:265-341`(弹窗状态 + editPreviewValues)、`619-686`(弹窗模板)。

- [ ] **Step 2: 改 script — committedValues + stale**

替换 `editHexMode`(269)相关逻辑。新增:

```ts
const committedValues = ref<Record<string, SendFieldValue>>({});

const isStale = computed(() => {
  return JSON.stringify(editValues.value) !== JSON.stringify(committedValues.value);
});

const editPreviewValues = computed(() => {
  const frame = editFrame.value;
  if (!frame) return {};
  const { fields } = frameToBuildInput(frame);
  const resolved = resolveFieldValues(fields, committedValues.value, NOOP_VARIABLE_PROVIDER);
  const factored = applyFactor(fields, resolved.values);
  return factored.values;
});

// 预览元数据(matchedBranchIndex),供 FieldEditWidget 公式显示
const editPreviewMeta = computed<Record<string, { matchedBranchIndex: number }>>(() => {
  const frame = editFrame.value;
  if (!frame) return {};
  const meta: Record<string, { matchedBranchIndex: number }> = {};
  for (const field of frame.fields) {
    if (field.expressionConfig) {
      const preview = evaluateFieldPreviewForUI(frame, field.id, committedValues.value, NOOP_VARIABLE_PROVIDER);
      meta[field.id] = { matchedBranchIndex: preview.matchedBranchIndex };
    }
  }
  return meta;
});

function onRecalculate(): void {
  committedValues.value = { ...editValues.value };
}
```

**注意:** `evaluateFieldPreviewForUI`、`NOOP_VARIABLE_PROVIDER`、`resolveFieldValues`、`applyFactor`、`frameToBuildInput` 需 import 确认(SendPage 已有部分 import,补全)。

- [ ] **Step 3: 改 script — 打开/切换实例时初始化 committedValues**

找到打开编辑弹窗的函数(设置 editValues 的地方,搜索 `editValues.value =`)。在初始化 editValues 后同步:

```ts
committedValues.value = { ...初始值 }; // 与 editValues 同源初始化,首屏非 stale
```

`onEditDialogHide`(275-282)加 `committedValues.value = {};`。删 `editHexMode.value = false;`(不再用)。

- [ ] **Step 4: 改模板 — 删 Dec/Hex 切换钮**

`619-686`,删 `q-btn-toggle`(648-657)。FieldEditWidget 调用处(658-667)改为:

```vue
<FieldEditWidget
  :fields="editFrameFields"
  :values="editValues"
  :preview-values="editPreviewValues"
  :preview-meta="editPreviewMeta"
  :field-errors="editFieldErrors"
  :stale="isStale"
  direction="send"
  @update:values="editValues = $event"
  @field-error="onFieldError"
/>
```

删 `:hex-mode="editHexMode"`。

- [ ] **Step 5: 计算按钮放哪**

**决策:** 计算按钮需要触发 onRecalculate。但 FieldEditWidget 内部不知道父级 committedValues 机制。

两种放法:
- (a) 计算按钮放 SendPage 弹窗内(字段编辑区上方),FieldEditWidget 不管计算。
- (b) FieldEditWidget 发 `recalculate` 事件,按钮在 widget 内段标题旁,SendPage 监听。

**选 (b)**(spec §3.3:按钮在"可调参数"段标题行右侧,widget 内)。FieldEditWidget 加 emit:

```ts
const emit = defineEmits<{
  // ... 现有
  'recalculate': [];
}>();
```

模板:"可调参数"段标题区(SECTION_DEFS configurable 的 title 渲染处)右侧加按钮:

```vue
<div class="field-section__title-row">
  <span class="field-section__title">{{ section.label }}</span>
  <q-btn
    v-if="section.key === 'configurable'"
    flat dense no-caps size="sm"
    :color="props.stale ? 'primary' : 'grey'"
    label="计算"
    :class="{ 'has-dot': props.stale }"
    @click="emit('recalculate')"
  />
</div>
```

scoped CSS 加 `.has-dot::before` 红点(warning 色)。

SendPage 模板 FieldEditWidget 加 `@recalculate="onRecalculate"`。

- [ ] **Step 6: 类型检查 + 目检**

Run 类型检查。
Run dev server,检查:
- 切换钮消失。
- 改可调字段后,只读段不变(stale),段标题计算按钮高亮+红点。
- 点计算,只读段刷新,计算按钮恢复灰。

- [ ] **Step 7: Commit**

```bash
git add rewrite/src/pages/SendPage.vue
git commit -m "feat(send): 编辑弹窗 committedValues 快照 + 全局计算按钮 (手动提交)"
```

---

## Task 8: FieldEditWidget 计算按钮 UI 完善 + 段标题 stale 标记

**Files:**
- Modify: `rewrite/src/widgets/FieldEditWidget.vue`

**目标:** Task 7 把按钮接线到位后,本任务完善按钮样式(红点)与段标题 stale 视觉。

- [ ] **Step 1: scoped CSS — 段标题行布局 + 计算按钮红点**

```scss
.field-section__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--rw-space-2);
}
.field-section__title {
  font-size: var(--rw-font-size-caption);
  font-weight: var(--rw-font-weight-semibold);
  color: var(--rw-color-text-secondary);
}
.has-dot {
  position: relative;
}
.has-dot::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--rw-color-status-warning);
}
```

段标题模板改用 `.field-section__title-row` 包裹(替换原裸 `.field-section__title` div,见 143-144)。

- [ ] **Step 2: 只读段 stale 视觉 — 段级标记**

只读段(expression/fixed)在 stale 时段标题加灰。在 FieldEditWidget 的 sections computed 或模板里,对非 configurable 段加 stale 修饰类:

```vue
<div
  v-for="(section, si) in sections"
  :key="section.key"
  class="field-section"
  :class="[`field-section--${section.color}`, { 'field-section--stale': props.stale && section.key !== 'configurable' }]"
>
```

```scss
.field-section--stale {
  opacity: 0.7;
}
.field-section--stale .field-section__title::after {
  content: ' ·未重算';
  color: var(--rw-color-status-warning);
  font-weight: var(--rw-font-weight-regular);
}
```

- [ ] **Step 3: 目检全流程**

Run dev server,完整走一遍:
- 改可调字段 → 只读段整段灰 + 标题"·未重算" + 计算按钮红点高亮。
- 点计算 → 全部恢复。
- hover tooltip 正常。
- 双输入框联动正常。

- [ ] **Step 4: 运行全量测试**

Run: `pnpm --filter rewrite test -- --run`
Expected: 全过。

- [ ] **Step 5: 扫描硬编码视觉值**

Run: `rg "(#[0-9a-fA-F]{3,8}|rgb\(|[0-9]+px)" rewrite/src/widgets/FieldEditWidget.vue rewrite/src/pages/SendPage.vue`
Expected: 无新增(原有的若有,确认非本次引入)。

- [ ] **Step 6: Commit**

```bash
git add rewrite/src/widgets/FieldEditWidget.vue
git commit -m "style(widget): 计算按钮红点 + 只读段 stale 段级标记"
```

---

## Self-Review

**Spec coverage:**
- §1 弹窗结构(删切换钮、备注保留、计算按钮位置)→ Task 7 ✓
- §2 双输入框联动 + 进制识别 + 科学计数法 + 校验 + 非 hex 降级 → Task 2(科学计数法)+ Task 5(双输入框+降级)✓
- §3 全局计算按钮(手动提交、committedValues、stale)→ Task 7 ✓
- §4 description hover tooltip → Task 5 ✓
- §5 表达式公式显示(翻译、matchedBranchIndex)→ Task 1(透传)+ Task 3(label)+ Task 4(UI 暴露)+ Task 6(显示)✓
- §6 util 扩展 → Task 2 + Task 3 ✓
- §7 样式对齐 → Task 5(grid)+ Task 8(stale 标记)✓

**Placeholder scan:** Task 4 Step 3 有 `buildMergedVariables`/`mergeVariableMaps` 标注为示例名,已注明"实施时读 resolveFieldValues 内部复用,不要发明新逻辑",并给了回退方案(matchedBranchIndex=-1)。这是必要的技术探索指引而非占位符。其余无 TBD/TODO。

**Type consistency:**
- `matchedBranchIndex` — Task 1(frame-resolver)→ Task 4(evaluateFieldPreviewForUI)→ Task 6(previewMeta)→ Task 7(editPreviewMeta),命名一致 ✓
- `onRecalculate` / `recalculate` 事件 — Task 7 定义,emit 名 `recalculate`,handler `onRecalculate` ✓
- `previewMeta` prop — Task 6 定义,Task 7 传入 ✓
- `stale` prop — Task 6 引用,Task 7 传入 ✓
- `fieldExpressionLabel(field, allFields, matchedIndex)` — Task 3 定义,Task 6 调用,签名一致 ✓

无遗漏。
