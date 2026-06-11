<script setup lang="ts">
defineProps<{
  readonly step: { readonly durationMs: number };
  readonly stepName: string;
  readonly disable?: boolean;
}>();

const emit = defineEmits<{
  'update:step': [config: { durationMs: number }];
  'update:stepName': [name: string];
}>();
</script>

<template>
  <div class="flex flex-col gap-3">
    <q-input
      :model-value="stepName"
      :disable="disable"
      dense
      outlined
      label="步骤名称"
      @update:model-value="emit('update:stepName', $event ?? '')"
    />
    <q-input
      :model-value="step.durationMs"
      :disable="disable"
      dense
      outlined
      type="number"
      label="持续时间 (ms)"
      :rules="[(val: number) => val > 0 || '延时时间必须大于0']"
      @update:model-value="emit('update:step', { durationMs: Number($event) || 1000 })"
    />
  </div>
</template>
