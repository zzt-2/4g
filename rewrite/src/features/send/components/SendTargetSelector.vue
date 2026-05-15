<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import type { ConnectionService, TransportTargetSnapshot } from '@/features/connection';

const props = defineProps<{
  readonly connectionService: ConnectionService;
  readonly modelValue: string | null;
  readonly disable?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
}>();

const targets = shallowRef<TransportTargetSnapshot[]>([]);
const selectedTargetId = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

function refreshTargets(): void {
  try {
    targets.value = props.connectionService.listTransportTargets();
  } catch (err) {
    console.warn('Failed to refresh targets', err);
    targets.value = [];
  }
}

// Refresh targets on mount and when connection state might change
watch(() => props.connectionService, () => {
  refreshTargets();
}, { immediate: true });

const targetOptions = computed(() =>
  targets.value.map((t) => ({
    value: t.targetId,
    label: `${t.label} (${t.kind})`,
    disable: !t.available,
  })),
);
</script>

<template>
  <q-select
    v-model="selectedTargetId"
    :options="targetOptions"
    :disable="disable"
    outlined
    dense
    emit-value
    map-options
    clearable
    placeholder="选择发送目标"
    class="w-full"
  >
    <template #prepend>
      <q-icon name="send" size="xs" />
    </template>
    <template #no-option>
      <div class="q-pa-sm rw-text-desc">
        暂无可用目标，请先连接设备
      </div>
    </template>
  </q-select>
</template>
