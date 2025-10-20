<template>
  <div class="bg-industrial-primary h-full flex p-4 gap-2">
    <!-- 左侧：卫星配置列表 -->
    <SatelliteConfigList
      class="w-64 flex-shrink-0 border border-solid border-industrial rounded-lg"
    />

    <!-- 中间：配置表单 -->
    <ConfigForm class="flex-1 min-w-0 border border-solid border-industrial rounded-lg" />

    <!-- 右侧：状态面板 -->
    <StatusPanel class="w-56 flex-shrink-0 border border-solid border-industrial rounded-lg" />
  </div>
</template>

<script setup lang="ts">
import SatelliteConfigList from '../components/scoe/SatelliteConfigList.vue';
import ConfigForm from '../components/scoe/ConfigForm.vue';
import StatusPanel from '../components/scoe/StatusPanel.vue';

// 页面标题
defineOptions({
  name: 'SCOEConfigPage',
});
</script>
