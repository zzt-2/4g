<script setup lang="ts">
import { computed } from 'vue';
import type { FrameFieldDefinition } from '@/features/frame';
import type { SendFieldValue } from '@/features/send';
import {
  isHexCapableField,
  valueToDisplayString,
  formatCounterpart,
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
  readonly hexMode?: boolean;
  readonly fieldErrors?: Readonly<Record<string, string>>;
}>();

const emit = defineEmits<{
  'update:values': [values: Record<string, SendFieldValue>];
  'update:hexMode': [value: boolean];
  'field-error': [payload: { fieldId: string; error: string | undefined }];
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

function resolveFieldInputValue(field: FrameFieldDefinition): SendFieldValue {
  return props.values[field.id] ?? field.defaultValue ?? '';
}

function counterpartHint(field: FrameFieldDefinition): string {
  if (!isHexCapableField(field)) return '';
  const val = field.configurable ? props.values[field.id] : props.previewValues?.[field.id];
  return formatCounterpart(val, field, props.hexMode ?? false);
}

// --- Mutation ---

function onFieldChange(fieldId: string, value: SendFieldValue): void {
  emit('update:values', { ...props.values, [fieldId]: value });
}

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
</script>

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
              <span class="field-row__label">
                {{ field.name }}
                <template v-if="hasNonTrivialFactor(field)">
                  &nbsp;(x{{ field.factor }})
                </template>
              </span>
              <q-input
                outlined
                dense
                :type="isNumericField(field) && !isHexCapableField(field) ? 'number' : 'text'"
                :model-value="isHexCapableField(field)
                  ? valueToDisplayString(resolveFieldInputValue(field), field, props.hexMode ?? false)
                  : resolveFieldInputValue(field)"
                :hint="counterpartHint(field) || undefined"
                :error="!!props.fieldErrors?.[field.id]"
                :error-message="props.fieldErrors?.[field.id]"
                class="field-row__input"
                @update:model-value="onNumericInput(field, $event)"
              />
            </div>
            <div v-if="field.description" class="field-row__desc">{{ field.description }}</div>
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
              <span class="field-row__label">
                {{ field.name }}
                <template v-if="hasNonTrivialFactor(field)">
                  &nbsp;(x{{ field.factor }})
                </template>
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
.field-row__input {
  width: 100%;
}
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
  padding: var(--rw-space-0-5) var(--rw-space-2);
  border-radius: var(--rw-radius-control);
}
</style>
