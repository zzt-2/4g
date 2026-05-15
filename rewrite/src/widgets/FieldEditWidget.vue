<script setup lang="ts">
import { computed } from 'vue';
import type { FrameFieldDefinition } from '@/features/frame';
import type { SendFieldValue } from '@/features/send';

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
}>();

const emit = defineEmits<{
  'update:values': [values: Record<string, SendFieldValue>];
}>();

// --- Section definitions (O4: module-level constants) ---

const SECTION_DEFS = [
  { key: 'configurable', label: '可调字段', color: 'info' },
  { key: 'expression', label: '计算参数', color: 'warning' },
  { key: 'fixed', label: '不可配置', color: 'grey' },
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
  const val = props.values[field.id];
  if (val !== undefined && val !== null) return String(val);
  return '--';
}

function resolveFieldInputValue(field: FrameFieldDefinition): SendFieldValue {
  return props.values[field.id] ?? field.defaultValue ?? '';
}

// --- Mutation ---

function onFieldChange(fieldId: string, value: SendFieldValue): void {
  emit('update:values', { ...props.values, [fieldId]: value });
}

function onNumericInput(field: FrameFieldDefinition, raw: string | number | null): void {
  if (raw === null || raw === '') {
    onFieldChange(field.id, '');
    return;
  }
  const num = Number(raw);
  onFieldChange(field.id, Number.isNaN(num) ? String(raw) : num);
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <template v-for="(section, si) in sections" :key="section.key">
      <q-separator v-if="si > 0" />

      <div class="flex flex-col gap-3">
        <q-badge :color="section.color" :label="section.label" />

        <div class="flex flex-col gap-3 pl-2">
          <template v-for="field in section.fields" :key="field.id">

            <!-- ===== Configurable — input ===== -->
            <template v-if="section.key === 'configurable' && field.inputType === 'input'">
              <div class="flex items-center gap-3">
                <span class="rw-text-label text-xs min-w-[80px]">
                  {{ field.name }}
                  <template v-if="hasNonTrivialFactor(field)">
                    &nbsp;(x{{ field.factor }})
                  </template>
                </span>
                <q-input
                  outlined
                  dense
                  :type="isNumericField(field) ? 'number' : 'text'"
                  :model-value="resolveFieldInputValue(field)"
                  class="flex-1"
                  @update:model-value="onNumericInput(field, $event)"
                />
                <span v-if="field.description" class="rw-text-desc text-xs">
                  {{ field.description }}
                </span>
              </div>
            </template>

            <!-- ===== Configurable — select ===== -->
            <template v-else-if="section.key === 'configurable' && field.inputType === 'select'">
              <div class="flex items-center gap-3">
                <span class="rw-text-label text-xs min-w-[80px]">
                  {{ field.name }}
                </span>
                <q-select
                  outlined
                  dense
                  emit-value
                  map-options
                  :options="field.options"
                  :model-value="resolveFieldInputValue(field)"
                  class="flex-1"
                  @update:model-value="onFieldChange(field.id, $event)"
                />
                <span v-if="field.description" class="rw-text-desc text-xs">
                  {{ field.description }}
                </span>
              </div>
            </template>

            <!-- ===== Configurable — radio ===== -->
            <template v-else-if="section.key === 'configurable' && field.inputType === 'radio'">
              <div class="flex flex-col gap-1">
                <span class="rw-text-label text-xs">
                  {{ field.name }}
                </span>
                <div class="flex items-center gap-3">
                  <q-radio
                    v-for="opt in field.options"
                    :key="opt.value"
                    dense
                    :val="opt.value"
                    :label="opt.label"
                    :model-value="resolveFieldInputValue(field)"
                    color="primary"
                    @update:model-value="onFieldChange(field.id, $event)"
                  />
                </div>
              </div>
            </template>

            <!-- ===== Read-only: expression or fixed ===== -->
            <template v-else>
              <div class="flex items-center gap-3">
                <span class="rw-text-label text-xs min-w-[80px]">
                  {{ field.name }}
                  <template v-if="hasNonTrivialFactor(field)">
                    &nbsp;(x{{ field.factor }})
                  </template>
                </span>
                <span class="rw-text-value text-sm">
                  {{ getDisplayValue(field) }}
                </span>
                <span v-if="field.description" class="rw-text-desc text-xs">
                  {{ field.description }}
                </span>
              </div>
            </template>

          </template>
        </div>
      </div>
    </template>
  </div>
</template>
