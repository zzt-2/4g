<template>
  <div class="window-controls">
    <q-btn flat dense icon="remove" @click="minimize" />
    <q-btn flat dense icon="crop_square" @click="toggleMaximize" />
    <q-btn flat dense icon="close" @click="close" class="close-btn" />
  </div>
</template>

<script setup lang="ts">
import { useWindowControls } from '../../composables/window/useWindowControls';

const { minimize, toggleMaximize, close } = useWindowControls();
</script>

<style scoped lang="scss">
.window-controls {
  -webkit-app-region: no-drag;
  display: flex;
  gap: 4px;
}

.q-btn {
  min-height: 32px;
  min-width: 32px;
  color: #666;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }
}

.close-btn {
  &:hover {
    background: #e74c3c;
    color: white;
  }
}
</style>
