<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  readonly status: string;
  readonly statusMap: Record<string, { label: string; color: string }>;
}>();

const info = computed(() => props.statusMap[props.status] ?? { label: props.status, color: 'grey' });
</script>

<template>
  <q-badge :color="info.color" outline class="status-badge">
    {{ info.label }}
  </q-badge>
</template>

<style scoped>
.status-badge {
  font-size: var(--rw-font-size-caption);
  font-weight: var(--rw-font-weight-semibold);
  letter-spacing: var(--rw-letter-spacing-normal);
  line-height: var(--rw-line-height-caption);
  padding: 2px 8px;
}
</style>
