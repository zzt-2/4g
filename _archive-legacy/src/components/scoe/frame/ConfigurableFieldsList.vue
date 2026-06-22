<template>
  <div class="flex-1 min-h-0 space-y-1 overflow-y-auto">
    <div v-for="field in configurableFields" :key="field.id"
      class="border border-industrial rounded p-1 hover:border-industrial-accent transition-colors">
      <div class="flex items-center gap-3">
        <!-- 字段标签和类型 -->
        <div class="w-52 flex-shrink-0 flex items-center gap-2">
          <div class="text-xs font-medium text-industrial-primary truncate flex-1 cursor-pointer">
            {{ field.label }}
            <q-tooltip v-if="field.description || field.bigEndian === false">
              {{ field.label }}{{ field.bigEndian === false ? ' (小端)' : '' }}{{ field.description ? ': ' +
                field.description : '' }}
            </q-tooltip>
          </div>
          <q-badge outline color="blue-5" class="text-2xs px-1">{{ field.dataType }}</q-badge>
        </div>

        <!-- 输入控件 -->
        <div class="flex-1">
          <q-select v-if="field.inputType === 'select'" :model-value="field.value" :options="field.options" dense
            outlined dark emit-value map-options bg-color="industrial-panel" class="q-input-class"
            @update:model-value="$emit('update:field-value', field.id, $event)" />

          <q-option-group v-else-if="field.inputType === 'radio'" :model-value="field.value" :options="(field.options?.length ? field.options : defaultOptions).map(opt => ({
            label: opt.label, value: opt.value
          }))" class="q-input-class" type="radio" inline dense
            @update:model-value="$emit('update:field-value', field.id, $event)" />

          <q-input v-else :model-value="field.value" dense outlined dark bg-color="industrial-panel"
            class="q-input-class" @update:model-value="$emit('update:field-value', field.id, $event)" />
        </div>

        <!-- 十六进制显示 -->
        <div v-if="showHex(field.dataType)"
          class="flex-1 px-2 py-2 bg-industrial-highlight rounded font-mono text-xs text-industrial-accent">
          {{ field.isASCII ? 'ASCII' : 'HEX' }}: {{ getHexValue(field) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SendInstanceField } from '../../../types/frames/sendInstances';
import { convertToHex } from '../../../utils/frames/hexCovertUtils';

const props = defineProps<{
  fields: SendInstanceField[];
}>();

defineEmits<{
  'update:field-value': [fieldId: string, value: string | number | null];
}>();

const defaultOptions = [
  { value: '0', label: '0' },
  { value: '1', label: '1' },
];

const configurableFields = computed(() => {
  return props.fields.filter(
    (field) => field.configurable,
  );
});

const showHex = (dataType: string) =>
  ['uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32', 'uint64', 'int64', 'bytes'].includes(dataType);

const getHexValue = (field: SendInstanceField) => {
  if (!field) return '';

  try {
    let hex = convertToHex(field.value, field.dataType, field.length, field.isASCII);
    if (
      field.bigEndian === false &&
      ['uint16', 'int16', 'uint32', 'int32', 'uint64', 'int64'].includes(field.dataType)
    ) {
      hex = hex.match(/.{2}/g)?.reverse().join('') || hex;
    }
    return `0x${hex}`;
  } catch {
    return '';
  }
};
</script>

<style scoped lang="scss">
.q-input-class {
  :deep(.q-field__inner .q-field__control) {
    height: 32px !important;
    min-height: 0px !important;
  }

  :deep(.q-field__native) {
    height: 32px !important;
    min-height: 0px !important;
  }

  :deep(.q-field__marginal) {
    height: 32px !important;
    min-height: 0px !important;
  }
}
</style>
