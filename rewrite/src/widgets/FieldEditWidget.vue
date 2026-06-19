<script setup lang="ts">
import { computed } from 'vue';
import type { FrameFieldDefinition } from '@/features/frame';
import type { SendFieldValue } from '@/features/send';
import {
  isHexCapableField,
  valueToDisplayString,
  parseFieldInput,
} from '@/features/send';

// --- Types ---

interface FieldSection {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly fields: readonly FrameFieldDefinition[];
}

// --- Props & Emits ---

const props = defineProps<{
  readonly fields: readonly FrameFieldDefinition[];
  readonly values: Record<string, SendFieldValue>;
  readonly direction: 'send' | 'receive';
  readonly previewValues?: Readonly<Record<string, SendFieldValue>>;
  readonly previewMeta?: Readonly<Record<string, { matchedBranchIndex: number }>>;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  readonly stale?: boolean;
}>();

const emit = defineEmits<{
  'update:values': [values: Record<string, SendFieldValue>];
  'field-error': [payload: { fieldId: string; error: string | undefined }];
  'recalculate': [];
}>();

// --- Section definitions (O4: module-level constants) ---

const SECTION_DEFS = [
  { key: 'configurable', label: '可调参数', color: 'info' },
  { key: 'expression', label: '自动计算(只读)', color: 'warning' },
  { key: 'fixed', label: '固定字段(只读)', color: 'grey' },
] as const;

// --- Classification ---

function classifyField(field: FrameFieldDefinition): 'configurable' | 'expression' | 'fixed' {
  if (field.configurable) return 'configurable';
  if (field.expressionConfig) return 'expression';
  return 'fixed';
}

const sections = computed<readonly FieldSection[]>(() => {
  const buckets = new Map<string, FrameFieldDefinition[]>();
  for (const def of SECTION_DEFS) {
    buckets.set(def.key, []);
  }
  for (const field of props.fields) {
    const bucket = classifyField(field);
    buckets.get(bucket)!.push(field);
  }
  return SECTION_DEFS
    .map((def) => ({
      key: def.key,
      label: def.label,
      color: def.color,
      fields: buckets.get(def.key)!,
    }))
    .filter((section) => section.fields.length > 0);
});

// --- Helpers ---

const NUMERIC_DATA_TYPES = new Set([
  'uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32',
  'uint64', 'int64', 'float', 'double',
]);

function isNumericField(field: FrameFieldDefinition): boolean {
  return NUMERIC_DATA_TYPES.has(field.dataType);
}

function hasNonTrivialFactor(field: FrameFieldDefinition): boolean {
  return field.factor !== undefined && field.factor !== 1;
}

function resolveFieldInputValue(field: FrameFieldDefinition): SendFieldValue {
  return props.values[field.id] ?? field.defaultValue ?? '';
}

/** Read-only display value for the field (走 hex 口径,数值字段恒 0x 形式). */
function getDisplayValue(field: FrameFieldDefinition): string {
  const preview = props.previewValues?.[field.id];
  if (preview !== undefined && preview !== null) {
    return isHexCapableField(field)
      ? valueToDisplayString(preview, field, true)
      : String(preview);
  }
  if (field.defaultValue !== undefined) return String(field.defaultValue);
  return '--';
}

/** Dec box display (plain digit string, no scientific notation). */
function decBoxValue(field: FrameFieldDefinition): string {
  const v = resolveFieldInputValue(field);
  if (v === undefined || v === null || v === '') return '';
  return valueToDisplayString(v, field, false);
}

/** Hex box display WITHOUT the 0x prefix (prefix is rendered by q-input prefix slot). */
function hexBoxValue(field: FrameFieldDefinition): string {
  const v = resolveFieldInputValue(field);
  if (v === undefined || v === null || v === '') return '';
  const display = valueToDisplayString(v, field, true); // e.g. '0x1ACFFC1D'
  return display.startsWith('0x') ? display.slice(2) : display;
}

/** Tooltip text: full field name + description (if any). */
function tooltipText(field: FrameFieldDefinition): string {
  if (field.description) return `${field.name}\n${field.description}`;
  return field.name;
}

// --- Mutation ---

function onFieldChange(fieldId: string, value: SendFieldValue): void {
  emit('update:values', { ...props.values, [fieldId]: value });
}

function onDecInput(field: FrameFieldDefinition, raw: string | number | null): void {
  const text = raw === null ? '' : String(raw);
  const result = parseFieldInput(text, false, field);
  if (!result.ok) {
    emit('field-error', { fieldId: field.id, error: result.error });
    return;
  }
  emit('field-error', { fieldId: field.id, error: undefined });
  onFieldChange(field.id, result.value);
}

function onHexInput(field: FrameFieldDefinition, raw: string | number | null): void {
  const text = raw === null ? '' : String(raw);
  const result = parseFieldInput(text, true, field);
  if (!result.ok) {
    emit('field-error', { fieldId: field.id, error: result.error });
    return;
  }
  emit('field-error', { fieldId: field.id, error: undefined });
  onFieldChange(field.id, result.value);
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      v-for="(section, si) in sections"
      :key="section.key"
      class="field-section"
      :class="[
        `field-section--${section.color}`,
        { 'field-section--stale': props.stale && section.key !== 'configurable' },
      ]"
    >
      <q-separator v-if="si > 0" class="mb-1" />
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
      <div class="field-section__body flex flex-col gap-2">
        <template v-for="field in section.fields" :key="field.id">

          <!-- ===== Configurable — numeric input (双输入框 Dec/Hex 联动) ===== -->
          <template v-if="section.key === 'configurable' && field.inputType === 'input' && isHexCapableField(field)">
            <div class="field-row">
              <span class="field-row__label">
                {{ field.name }}<template v-if="hasNonTrivialFactor(field)">&nbsp;(x{{ field.factor }})</template>
              </span>
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
              {{ tooltipText(field) }}
            </q-tooltip>
          </template>

          <!-- ===== Configurable — non-hex input (float/double/string) 单框占满 ===== -->
          <template v-else-if="section.key === 'configurable' && field.inputType === 'input'">
            <div class="field-row">
              <span class="field-row__label">
                {{ field.name }}<template v-if="hasNonTrivialFactor(field)">&nbsp;(x{{ field.factor }})</template>
              </span>
              <q-input
                outlined dense
                :type="isNumericField(field) ? 'number' : 'text'"
                :model-value="String(resolveFieldInputValue(field))"
                :error="!!props.fieldErrors?.[field.id]"
                :error-message="props.fieldErrors?.[field.id]"
                class="field-row__input field-row__input--span2"
                @update:model-value="onDecInput(field, $event)"
              />
            </div>
            <q-tooltip v-if="field.description || field.name" max-width="280px" class="field-row__tooltip">
              {{ tooltipText(field) }}
            </q-tooltip>
          </template>

          <!-- ===== Configurable — select ===== -->
          <template v-else-if="section.key === 'configurable' && field.inputType === 'select'">
            <div class="field-row">
              <span class="field-row__label">{{ field.name }}</span>
              <q-select
                outlined dense emit-value map-options
                :options="field.options"
                :model-value="resolveFieldInputValue(field)"
                class="field-row__input field-row__input--span2"
                @update:model-value="onFieldChange(field.id, $event)"
              />
            </div>
            <q-tooltip v-if="field.description || field.name" max-width="280px" class="field-row__tooltip">
              {{ tooltipText(field) }}
            </q-tooltip>
          </template>

          <!-- ===== Configurable — radio ===== -->
          <template v-else-if="section.key === 'configurable' && field.inputType === 'radio'">
            <div class="field-row field-row--single-row">
              <span class="field-row__label">{{ field.name }}</span>
              <div class="field-row__input field-row__input--span2 flex items-center gap-3">
                <q-radio
                  v-for="opt in field.options" :key="opt.value" dense
                  :val="opt.value" :label="opt.label"
                  :model-value="resolveFieldInputValue(field)" color="primary"
                  @update:model-value="onFieldChange(field.id, $event)"
                />
              </div>
            </div>
            <q-tooltip v-if="field.description || field.name" max-width="280px" class="field-row__tooltip">
              {{ tooltipText(field) }}
            </q-tooltip>
          </template>

          <!-- ===== Read-only: expression or fixed ===== -->
          <template v-else>
            <div class="field-row field-row--readonly">
              <span class="field-row__label">
                {{ field.name }}<template v-if="hasNonTrivialFactor(field)">&nbsp;(x{{ field.factor }})</template>
              </span>
              <span class="field-row__value font-mono">{{ getDisplayValue(field) }}</span>
            </div>
            <q-tooltip v-if="field.description || field.name" max-width="280px" class="field-row__tooltip">
              {{ tooltipText(field) }}
            </q-tooltip>
          </template>

        </template>
      </div>
    </div>
  </div>
</template>

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

// Stale mark on read-only sections (result not recalculated)
.field-section--stale {
  opacity: 0.7;
}
.field-section--stale .field-section__title::after {
  content: ' ·未重算';
  color: var(--rw-color-status-warning);
  font-weight: var(--rw-font-weight-regular);
}

.field-row {
  display: grid;
  grid-template-columns: minmax(72px, 96px) minmax(120px, 1fr) minmax(120px, 1fr);
  align-items: center;
  gap: var(--rw-space-2);
}
.field-row__label {
  font-size: var(--rw-font-size-caption);
  color: var(--rw-color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.field-row__dec {
  grid-column: 2;
  width: 100%;
}
.field-row__hex {
  grid-column: 3;
  width: 100%;
}
.field-row__input {
  width: 100%;
}
.field-row__input--span2 {
  grid-column: 2 / -1;
}
.field-row__value {
  grid-column: 2;
  font-size: var(--rw-font-size-body);
  color: var(--rw-color-text-primary);
}
.field-row--readonly .field-row__value {
  background: var(--rw-color-surface-app);
  padding: var(--rw-space-0-5) var(--rw-space-2);
  border-radius: var(--rw-radius-control);
}
.field-row__tooltip {
  white-space: pre-line;
  font-size: var(--rw-font-size-caption);
}

// Calculate button stale dot
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
</style>
