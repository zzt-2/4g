<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import { useAsyncAction, usePolling, useNotify } from '@/shared/composables';
import type { ConnectionSummary, TransportConfig } from '@/features/connection';
import ConnectionCard from '@/features/connection/components/ConnectionCard.vue';
import NewConnectionDialog from '@/features/connection/components/NewConnectionDialog.vue';

const $q = useQuasar();
const notify = useNotify();
const runtime = useRewriteRuntime();
const service = runtime.features.connectionService;

// --- State ---
const summaries = ref<readonly ConnectionSummary[]>([]);
const showNewDialog = ref(false);

const { execute, isOperating } = useAsyncAction();

// --- Derived ---
const serialSummaries = computed(() =>
  summaries.value.filter((s) => s.kind === 'serial'),
);

const networkSummaries = computed(() =>
  summaries.value.filter((s) => s.kind !== 'serial'),
);

// --- Polling ---
function refreshSummaries(): void {
  summaries.value = service.listConnectionSummaries();
}

const polling = usePolling(refreshSummaries, 500);

// --- Handlers ---
async function handleConnect(summary: ConnectionSummary): Promise<void> {
  await execute(summary.connectionId, async () => {
    const fact = service.getConnectionFact(summary.connectionId);
    if (!fact) return;
    const result = await service.connect(fact.config);
    if (result.ok) {
      notify.success(`${summary.label} 已连接`);
    } else {
      notify.error('连接失败', result.error?.message);
    }
  });
  refreshSummaries();
}

async function handleDisconnect(summary: ConnectionSummary): Promise<void> {
  await execute(summary.connectionId, async () => {
    const result = await service.disconnect(summary.connectionId);
    if (result.ok) {
      notify.success(`${summary.label} 已断开`);
    } else {
      notify.error('断开失败', result.error?.message);
    }
  });
  refreshSummaries();
}

function handleRemove(summary: ConnectionSummary): void {
  $q.dialog({
    title: '确认删除',
    message: `确定要删除连接「${summary.label}」吗？`,
    cancel: true,
    persistent: false,
  }).onOk(async () => {
    if (summary.lifecycle === 'connected') {
      await handleDisconnect(summary);
    }
    notify.info(`${summary.label} 已删除`);
    refreshSummaries();
  });
}

async function handleCreate(config: TransportConfig): Promise<void> {
  const result = await service.connect(config);
  if (result.ok) {
    notify.success('连接已创建');
  } else {
    notify.error('创建连接失败', result.error?.message);
  }
  refreshSummaries();
}

function refreshResources(): readonly { kind: string; id: string; label: string }[] {
  return service.discoverResources();
}

onMounted(() => {
  refreshSummaries();
  polling.start();
});
</script>

<template>
  <q-page class="connection-page">
    <section class="connection-page__content">
      <div class="connection-page__header">
        <h1 class="connection-page__title">连接管理</h1>
        <q-btn
          unelevated
          color="primary"
          icon="add"
          label="新建连接"
          @click="showNewDialog = true"
        />
      </div>

      <!-- Serial section -->
      <section v-if="serialSummaries.length > 0" class="connection-page__section">
        <h2 class="connection-page__section-title">串口连接</h2>
        <div class="connection-page__list">
          <ConnectionCard
            v-for="s in serialSummaries"
            :key="s.connectionId"
            :summary="s"
            :operating="isOperating(s.connectionId)"
            @connect="handleConnect(s)"
            @disconnect="handleDisconnect(s)"
            @remove="handleRemove(s)"
          />
        </div>
      </section>

      <!-- Network section -->
      <section v-if="networkSummaries.length > 0" class="connection-page__section">
        <h2 class="connection-page__section-title">网络连接</h2>
        <div class="connection-page__list">
          <ConnectionCard
            v-for="s in networkSummaries"
            :key="s.connectionId"
            :summary="s"
            :operating="isOperating(s.connectionId)"
            @connect="handleConnect(s)"
            @disconnect="handleDisconnect(s)"
            @remove="handleRemove(s)"
          />
        </div>
      </section>

      <!-- Empty state -->
      <div
        v-if="summaries.length === 0"
        class="connection-page__empty"
      >
        <q-icon name="link_off" size="48px" color="grey" />
        <p>暂无连接，点击「新建连接」开始</p>
      </div>
    </section>

    <NewConnectionDialog
      v-model="showNewDialog"
      :resources="refreshResources()"
      @create="handleCreate"
    />
  </q-page>
</template>

<style scoped lang="scss">
@use '../css/tokens' as tokens;

.connection-page {
  background: var(--rw-color-surface-app);
  min-height: 100%;
  padding: var(--rw-space-page);
}

.connection-page__content {
  display: grid;
  gap: var(--rw-space-4);
  margin: 0 auto;
  max-width: var(--rw-size-content-wide);
}

.connection-page__header {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.connection-page__title {
  color: var(--rw-color-text-primary);
  font-size: var(--rw-font-size-title-lg);
  font-weight: var(--rw-font-weight-semibold);
  line-height: var(--rw-line-height-title-lg);
  margin: 0;
}

.connection-page__section {
  display: grid;
  gap: var(--rw-space-2);
}

.connection-page__section-title {
  color: var(--rw-color-text-secondary);
  font-size: var(--rw-font-size-label);
  font-weight: var(--rw-font-weight-semibold);
  line-height: var(--rw-line-height-body);
  margin: 0;
  padding-bottom: var(--rw-space-1);
  border-bottom: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle);
}

.connection-page__list {
  display: grid;
  gap: var(--rw-space-2);
}

.connection-page__empty {
  align-items: center;
  color: var(--rw-color-text-muted);
  display: flex;
  flex-direction: column;
  font-size: var(--rw-font-size-body);
  gap: var(--rw-space-3);
  padding: var(--rw-space-6) 0;
}

@media (max-width: tokens.rw-breakpoint('page-compact')) {
  .connection-page {
    padding: var(--rw-space-page-compact);
  }
}
</style>
