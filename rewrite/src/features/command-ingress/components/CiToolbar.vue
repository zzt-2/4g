<script setup lang="ts">
// 指令接入页顶部 toolbar：一级分段控件（左）+ 按当前 tab 动态切换的操作按钮（右）。
// 砍掉原 H1「指令接入」（左侧导航已标当前页），单行约 48px，左右 px-6 padding。
// 按钮按 tab 切换解决"不知道按钮干嘛"——按钮天然带上下文。
// SCOE（monitor/config）→ 连接/断开/加载·卸载/保存配置；docking → 对接配置/断开/上报记录。

type CiTab = 'monitor' | 'config' | 'docking';

interface Props {
  /** 当前激活的一级 tab */
  modelValue: CiTab;
  // --- SCOE 按钮状态（monitor/config tab 显示）---
  scoeConnected: boolean;
  framesLoaded: boolean;
  isConnectLoading: boolean;
  isDisconnectLoading: boolean;
  isLoadLoading: boolean;
  isUnloadLoading: boolean;
  isSaveLoading: boolean;
  canLoadUnload: boolean;
  // --- Docking 按钮状态（docking tab 显示）---
  dockingActive: boolean;
  isDockingConnectLoading: boolean;
  isDockingDisconnectLoading: boolean;
  hasReportRecords: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [tab: CiTab];
  // SCOE actions
  'scoe-connect': [];
  'scoe-disconnect': [];
  'scoe-load': [];
  'scoe-unload': [];
  'scoe-save-config': [];
  // Docking actions
  'docking-open-config': [];
  'docking-disconnect': [];
  'docking-open-report': [];
}>();

const TABS: ReadonlyArray<{ value: CiTab; label: string }> = [
  { value: 'monitor', label: 'SCOE 运行与测试' },
  { value: 'config', label: 'SCOE 配置' },
  { value: 'docking', label: '中心对接' },
];
</script>

<template>
  <div class="ci-toolbar flex items-center justify-between px-6 py-2 rw-divider-b">
    <!-- 左：一级分段控件 -->
    <div class="rw-segmented" role="tablist">
      <button
        v-for="tab in TABS"
        :key="tab.value"
        type="button"
        role="tab"
        :aria-selected="modelValue === tab.value"
        :class="['rw-segmented__btn', { 'rw-segmented__btn--active': modelValue === tab.value }]"
        @click="emit('update:modelValue', tab.value)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 右：按当前 tab 动态切换的操作按钮 -->
    <div class="flex items-center gap-2">
      <!-- SCOE 按钮（monitor / config tab） -->
      <template v-if="modelValue === 'monitor' || modelValue === 'config'">
        <q-btn
          unelevated no-caps color="primary"
          label="连接"
          :loading="isConnectLoading"
          @click="emit('scoe-connect')"
        />
        <q-btn
          unelevated no-caps
          :color="scoeConnected ? 'grey' : 'primary'"
          label="断开"
          :disable="!scoeConnected"
          :loading="isDisconnectLoading"
          @click="emit('scoe-disconnect')"
        />
        <q-btn
          unelevated no-caps color="primary"
          :label="framesLoaded ? '卸载' : '加载'"
          :disable="!canLoadUnload"
          :loading="isLoadLoading || isUnloadLoading"
          @click="framesLoaded ? emit('scoe-unload') : emit('scoe-load')"
        />
        <q-btn
          unelevated no-caps color="primary"
          label="保存配置"
          :loading="isSaveLoading"
          @click="emit('scoe-save-config')"
        />
      </template>

      <!-- Docking 按钮（docking tab） -->
      <template v-else>
        <q-btn
          v-if="!dockingActive"
          unelevated no-caps color="primary"
          label="对接配置"
          @click="emit('docking-open-config')"
        />
        <q-btn
          v-else
          unelevated no-caps color="negative"
          label="断开"
          :loading="isDockingDisconnectLoading"
          @click="emit('docking-disconnect')"
        />
        <q-btn
          unelevated no-caps color="primary"
          label="上报记录"
          :disable="!hasReportRecords"
          @click="emit('docking-open-report')"
        />
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ci-toolbar {
  background: var(--rw-color-surface-header);
  // 钉在顶部，不被内容滚动带走
  flex-shrink: 0;
}
</style>
