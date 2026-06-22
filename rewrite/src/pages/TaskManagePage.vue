<script setup lang="ts">
import { ref } from 'vue';
import TemplateListPage from '@/features/task/components/TemplateListPage.vue';
import ExecutionListPage from '@/features/task/components/ExecutionListPage.vue';

defineOptions({ name: 'TaskManagePage' });

const activeTab = ref<'templates' | 'executions'>('templates');

function onInstantiated(): void {
  // 实例化后自动切到执行 tab
  activeTab.value = 'executions';
}
</script>

<template>
  <q-page class="task-page min-h-full">
    <div class="flex items-center gap-3 p-4 rw-divider-b">
      <span class="rw-text-value text-h6">任务管理</span>
      <div class="flex-1" />
      <q-tabs
        v-model="activeTab"
        dense
        inline-label
        class="rw-text-value"
      >
        <q-tab name="templates" icon="o_inventory_2" label="模板管理" no-caps />
        <q-tab name="executions" icon="o_play_circle" label="执行监控" no-caps />
      </q-tabs>
    </div>

    <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <TemplateListPage
        v-if="activeTab === 'templates'"
        @instantiated="onInstantiated"
      />
      <ExecutionListPage v-else />
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.task-page {
  background: var(--rw-color-surface-app);
  display: flex;
  flex-direction: column;
}
</style>
