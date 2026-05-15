<script setup lang="ts">
interface SummaryMetric {
  readonly id: string;
  readonly label: string;
  readonly value: string | number;
  readonly caption?: string;
  readonly icon: string;
}

defineProps<{
  readonly metrics: readonly SummaryMetric[];
}>();
</script>

<template>
  <div class="summary-grid gap-3">
    <q-card v-for="metric in metrics" :key="metric.id" flat bordered class="summary-card">
      <q-card-section class="summary-card__content gap-3">
        <div class="summary-card__icon">
          <q-icon :name="metric.icon" class="summary-card__icon-symbol" />
        </div>
        <div class="summary-card__body">
          <div class="summary-card__label">{{ metric.label }}</div>
          <div class="summary-card__value mt-1.5">{{ metric.value }}</div>
          <div v-if="metric.caption" class="summary-card__caption mt-1">{{ metric.caption }}</div>
        </div>
      </q-card-section>
    </q-card>
  </div>
</template>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(var(--rw-size-metric-card-track), 1fr));
}

.summary-card {
  border-radius: var(--rw-radius-panel);
}

.summary-card__content {
  align-items: flex-start;
  display: flex;
  min-height: var(--rw-size-metric-card-min);
}

.summary-card__icon {
  align-items: center;
  background: var(--rw-color-surface-selected);
  border-radius: var(--rw-radius-control);
  color: var(--rw-color-action-primary);
  display: flex;
  flex: 0 0 var(--rw-size-metric-icon);
  height: var(--rw-size-metric-icon);
  justify-content: center;
}

.summary-card__icon-symbol {
  font-size: var(--rw-font-size-icon-md);
}

.summary-card__body {
  min-width: 0;
}

.summary-card__label {
  color: var(--rw-color-text-secondary);
  font-size: var(--rw-font-size-label);
  line-height: var(--rw-line-height-label);
}

.summary-card__value {
  color: var(--rw-color-text-primary);
  font-size: var(--rw-font-size-title-lg);
  font-weight: var(--rw-font-weight-semibold);
  line-height: var(--rw-line-height-title-lg);
  overflow-wrap: anywhere;
}

.summary-card__caption {
  color: var(--rw-color-text-subtle);
  font-size: var(--rw-font-size-caption);
  line-height: var(--rw-line-height-caption);
  overflow-wrap: anywhere;
}
</style>
