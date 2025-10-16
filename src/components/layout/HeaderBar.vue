<template>
  <q-header class="bg-[#1e293b] shadow-sm" style="-webkit-app-region: drag">
    <q-toolbar class="h-[48px]">
      <div class="flex items-center" style="-webkit-app-region: no-drag">
        <div class="flex items-center justify-center h-[32px] w-[32px] bg-[#0f172a] rounded-md mr-3">
          <img src="../../assets/icons/logo.svg" alt="RS485" class="h-[20px] w-[20px]" />
        </div>
        <div class="text-[16px] font-medium text-white m-0 tracking-wide">激光链路标准测试设备</div>
      </div>

      <q-space />

      <!-- 状态指示灯 -->
      <StatusIndicators />

      <!-- 窗口操作按钮 -->
      <div class="flex items-center" style="-webkit-app-region: no-drag">
        <q-btn flat dense round class="w-[36px] h-[36px] text-[#94a3b8] hover:bg-[#334155]" @click="controls.minimize">
          <q-icon name="minimize" size="16px" />
        </q-btn>
        <q-btn flat dense round class="w-[36px] h-[36px] text-[#94a3b8] hover:bg-[#334155]"
          @click="controls.toggleMaximize">
          <q-icon name="crop_square" size="16px" />
        </q-btn>
        <q-btn flat dense round class="w-[36px] h-[36px] text-[#94a3b8] hover:bg-[#dc2626] hover:text-white"
          @click="controls.close">
          <q-icon name="close" size="16px" />
        </q-btn>
      </div>
    </q-toolbar>
  </q-header>
</template>

<script setup lang="ts">
import { useWindowControls } from '../../composables/window/useWindowControls';
import StatusIndicators from '../common/StatusIndicators.vue';

// 获取窗口控制函数
const controls = useWindowControls();
</script>
