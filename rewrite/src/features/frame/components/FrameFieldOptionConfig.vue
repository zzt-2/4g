<script setup lang="ts">
import { computed } from 'vue';
import type { FrameOptionDefinition } from '@/features/frame';
import { useStableKeys } from '@/shared/composables';

const props = defineProps<{
  options: FrameOptionDefinition[];
  inputType: 'select' | 'radio';
}>();

const emit = defineEmits<{
  'update:options': [options: FrameOptionDefinition[]];
}>();

const { keys: optKeys, syncKeys: syncOptKeys } = useStableKeys('opt');

syncOptKeys(props.options);

const validationError = computed(() => {
  if (props.options.length < 2) return '至少需要 2 个选项';
  return '';
});

function addOption(): void {
  const next = [...props.options, { value: '', label: '' }];
  syncOptKeys(next);
  emit('update:options', next);
}

function removeOption(index: number): void {
  const next = [...props.options];
  next.splice(index, 1);
  syncOptKeys(next);
  emit('update:options', next);
}

function updateOption(
  index: number,
  patch: Partial<FrameOptionDefinition>,
): void {
  const next = [...props.options];
  next[index] = { ...next[index], ...patch };

  // Radio: only one default allowed
  if (patch.isDefault && props.inputType === 'radio') {
    for (let i = 0; i < next.length; i++) {
      if (i !== index) next[i] = { ...next[i], isDefault: false };
    }
  }

  emit('update:options', next);
}
</script>

<template>
  <div>
    <div class="rw-text-label text-caption mb-2">
      {{ inputType === 'select' ? '选择项' : '单选项' }}
    </div>

    <div
      v-for="(option, index) in options"
      :key="optKeys[index]"
      class="flex items-center gap-2 mb-1"
    >
      <q-input
        outlined
        dense
        :model-value="option.value"
        placeholder="值"
        class="flex-1"
        @update:model-value="(v: string) => updateOption(index, { value: v })"
      />
      <q-input
        outlined
        dense
        :model-value="option.label"
        placeholder="标签"
        class="flex-1"
        @update:model-value="(v: string) => updateOption(index, { label: v })"
      />
      <q-toggle
        :model-value="option.isDefault ?? false"
        label="默认"
        @update:model-value="(v: boolean) => updateOption(index, { isDefault: v })"
      />
      <q-btn
        flat
        round
        dense
        icon="o_delete"
        size="xs"
        color="negative"
        @click="removeOption(index)"
      />
    </div>

    <div v-if="validationError" class="text-xs rw-text-error mt-1">
      {{ validationError }}
    </div>

    <q-btn
      flat
      dense
      no-caps
      icon="o_add"
      label="添加选项"
      color="primary"
      size="sm"
      class="mt-1"
      @click="addOption"
    />
  </div>
</template>
