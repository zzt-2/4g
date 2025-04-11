<template>
  <div class="custom-titlebar">
    <div class="left-section">
      <q-btn flat dense icon="menu" @click="toggleDrawer" class="no-drag" />
      <div class="title">4G 上位机</div>
      <div class="divider"></div>
    </div>
    <WindowControls />
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import WindowControls from './WindowControls.vue';
const toggleDrawer = inject('toggleDrawer') as () => void;
</script>

<style scoped lang="scss">
.custom-titlebar {
  -webkit-app-region: drag;
  height: 32px;
  background: #f5f3e4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  color: #333;
  width: 100%;
  box-sizing: border-box;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.left-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.title {
  font-size: 14px;
  font-weight: 500;
}

.divider {
  height: 16px;
  width: 1px;
  background: #d4d1c0;
}
</style>
