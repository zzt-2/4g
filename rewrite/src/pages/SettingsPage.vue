<script setup lang="ts">
import ApplicationSettings from '@/pages/settings/ApplicationSettings.vue';
import ConnectionSettings from '@/pages/settings/ConnectionSettings.vue';
</script>

<template>
  <q-page class="settings-page p-6 min-h-full">
    <section class="settings-page__content gap-4 mx-auto">
      <h1 class="settings-page__title m-0">系统设置</h1>

      <q-list class="settings-page__groups rounded-borders">
        <ApplicationSettings />

        <ConnectionSettings />

        <q-expansion-item
          label="显示设置"
          icon="monitor"
          disable
          header-class="settings-page__placeholder-header"
        >
          <template #header>
            <q-item-section avatar>
              <q-icon name="monitor" />
            </q-item-section>
            <q-item-section>
              <q-item-label>显示设置</q-item-label>
              <q-item-label caption>即将推出</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-badge color="grey" label="未开放" />
            </q-item-section>
          </template>
        </q-expansion-item>

        <q-expansion-item
          label="状态指示"
          icon="traffic"
          disable
          header-class="settings-page__placeholder-header"
        >
          <template #header>
            <q-item-section avatar>
              <q-icon name="traffic" />
            </q-item-section>
            <q-item-section>
              <q-item-label>状态指示</q-item-label>
              <q-item-label caption>即将推出</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-badge color="grey" label="未开放" />
            </q-item-section>
          </template>
        </q-expansion-item>

        <q-expansion-item
          label="高级设置"
          icon="tune"
          disable
          header-class="settings-page__placeholder-header"
        >
          <template #header>
            <q-item-section avatar>
              <q-icon name="tune" />
            </q-item-section>
            <q-item-section>
              <q-item-label>高级设置</q-item-label>
              <q-item-label caption>即将推出</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-badge color="grey" label="未开放" />
            </q-item-section>
          </template>
        </q-expansion-item>
      </q-list>
    </section>
  </q-page>
</template>

<style scoped lang="scss">
.settings-page {
  background: var(--rw-color-surface-app);
}

.settings-page__content {
  display: grid;
  max-width: var(--rw-size-content-wide);
}

.settings-page__title {
  color: var(--rw-color-text-primary);
  font-size: var(--rw-font-size-title-lg);
  font-weight: var(--rw-font-weight-semibold);
  line-height: var(--rw-line-height-title-lg);
}

.settings-page__groups {
  background: var(--rw-color-surface-base);
  border: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle);
  border-radius: var(--rw-radius-panel);
}

.settings-page__placeholder-header {
  opacity: 0.5;
}

// Shared settings group styles (consumed by child components via :deep)
:deep(.settings-group__header) {
  font-weight: var(--rw-font-weight-semibold);
}

:deep(.settings-group__body) {
  border-top: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle);
}

:deep(.settings-group__field) {
  max-width: 400px;
}
</style>
