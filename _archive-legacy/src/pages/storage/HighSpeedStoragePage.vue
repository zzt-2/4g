<template>
  <q-page class="bg-industrial-primary min-h-screen p-4">
    <div class="max-w-4xl mx-auto">
      <div class="page-header mb-6">
        <h1 class="text-industrial-primary text-2xl font-bold mb-2">高速存储管理</h1>
        <p class="text-industrial-secondary text-sm">
          配置和管理业务数据的高速存储功能，支持几百Mbps的网络数据存储
        </p>
      </div>

      <HighSpeedStoragePanel />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import HighSpeedStoragePanel from '../../components/storage/HighSpeedStoragePanel.vue';
</script>

<style scoped>
.status-badge {
  @apply px-2 py-1 rounded text-xs font-medium text-white;
}

.status-card,
.tips-card,
.usage-card {
  transition: all 0.2s ease-in-out;
}

.status-card:hover,
.tips-card:hover,
.usage-card:hover {
  border-color: #1a3663;
  background-color: #12233f;
}
</style>
