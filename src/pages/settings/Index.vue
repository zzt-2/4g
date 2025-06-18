<template>
  <div class="bg-industrial-primary min-h-screen p-4">
    <div class="max-w-4xl mx-auto">
      <div class="page-header mb-6">
        <h1 class="text-industrial-primary text-2xl font-bold mb-2">系统设置</h1>
        <p class="text-industrial-secondary text-sm">配置系统功能和应用选项</p>
      </div>

      <!-- 状态指示灯配置 -->
      <div class="bg-industrial-panel border border-industrial rounded-lg p-4 mb-6">
        <h2 class="text-industrial-primary text-lg font-medium mb-3">状态指示灯</h2>

        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <q-toggle
              v-model="statusStore.settings.isEnabled"
              color="primary"
              class="text-industrial-secondary"
            />
            <span class="text-sm text-industrial-secondary">启用状态指示灯功能</span>
          </div>

          <q-btn
            unelevated
            label="配置状态指示灯"
            color="primary"
            size="sm"
            @click="showConfigDialog = true"
          />
        </div>
      </div>

      <!-- 其他系统设置 -->
      <div class="bg-industrial-panel border border-industrial rounded-lg p-4 mb-6">
        <h2 class="text-industrial-primary text-lg font-medium mb-3">应用设置</h2>
        <div class="text-industrial-secondary text-sm">其他系统配置选项将在这里显示...</div>
      </div>

      <!-- 状态指示灯配置对话框 -->
      <StatusIndicatorConfigDialog v-model="showConfigDialog" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useStatusIndicatorStore } from '../../stores/statusIndicators';
import StatusIndicatorConfigDialog from '../../components/common/StatusIndicatorConfigDialog.vue';

// Stores
const statusStore = useStatusIndicatorStore();

// 本地状态
const showConfigDialog = ref(false);
</script>

<style scoped>
/* 工业主题样式已通过预定义CSS类应用 */
</style>
