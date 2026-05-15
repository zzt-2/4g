<script setup lang="ts">
import type { ConnectionSummary } from '@/features/connection';
import StatusBadge from '@/widgets/StatusBadge.vue';
import { connectionStatusMap } from './connectionStatusMap';

defineProps<{
  readonly summary: ConnectionSummary;
  readonly operating: boolean;
}>();

const emit = defineEmits<{
  connect: [];
  disconnect: [];
  remove: [];
}>();

function formatRoute(s: ConnectionSummary): string {
  if (s.kind === 'serial') return s.routeLabel;
  return s.routeLabel;
}
</script>

<template>
  <q-card flat bordered class="connection-card">
    <div class="connection-card__body">
      <div class="connection-card__left">
        <StatusBadge :status="summary.lifecycle" :status-map="connectionStatusMap" />
        <span class="connection-card__name">{{ summary.label }}</span>
        <span class="connection-card__route">{{ formatRoute(summary) }}</span>
      </div>
      <div class="connection-card__actions">
        <q-btn
          v-if="summary.lifecycle === 'connected'"
          flat
          dense
          color="primary"
          label="断开"
          :loading="operating"
          :disable="operating"
          @click="emit('disconnect')"
        />
        <q-btn
          v-else
          flat
          dense
          color="primary"
          label="连接"
          :loading="operating"
          :disable="operating"
          @click="emit('connect')"
        />
        <q-btn
          flat
          dense
          round
          icon="close"
          size="sm"
          :disable="operating"
          @click="emit('remove')"
        >
          <q-tooltip>删除</q-tooltip>
        </q-btn>
      </div>
    </div>
    <q-expansion-item
      v-if="summary.lifecycle === 'error' && summary.lastError"
      dense
      dense-toggle
      header-class="connection-card__error-toggle"
      class="connection-card__error"
    >
      <template #header>
        <span class="connection-card__error-summary text-negative">
          {{ summary.lastError.message }}
        </span>
      </template>
      <div class="connection-card__error-detail">
        <span>类型: {{ summary.lastError.kind }}</span>
        <span>时间: {{ summary.lastError.occurredAt }}</span>
      </div>
    </q-expansion-item>
  </q-card>
</template>

<style scoped lang="scss">
@use '../../../css/tokens' as tokens;

.connection-card {
  border-color: var(--rw-color-border-subtle);
  border-radius: var(--rw-radius-panel);
}

.connection-card__body {
  align-items: center;
  display: flex;
  gap: var(--rw-space-3);
  justify-content: space-between;
  padding: var(--rw-space-2) var(--rw-space-3);
}

.connection-card__left {
  align-items: center;
  display: flex;
  gap: var(--rw-space-2);
  min-width: 0;
}

.connection-card__name {
  color: var(--rw-color-text-primary);
  font-size: var(--rw-font-size-body);
  font-weight: var(--rw-font-weight-semibold);
  line-height: var(--rw-line-height-body);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connection-card__route {
  color: var(--rw-color-text-muted);
  font-size: var(--rw-font-size-caption);
  line-height: var(--rw-line-height-caption);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connection-card__actions {
  align-items: center;
  display: flex;
  flex-shrink: 0;
  gap: var(--rw-space-1);
}

.connection-card__error-toggle {
  padding-left: var(--rw-space-3);
}

.connection-card__error-summary {
  font-size: var(--rw-font-size-caption);
  line-height: var(--rw-line-height-caption);
}

.connection-card__error-detail {
  display: flex;
  flex-direction: column;
  font-size: var(--rw-font-size-caption);
  gap: var(--rw-space-1);
  line-height: var(--rw-line-height-caption);
  padding: var(--rw-space-1) var(--rw-space-3) var(--rw-space-2);
}
</style>
