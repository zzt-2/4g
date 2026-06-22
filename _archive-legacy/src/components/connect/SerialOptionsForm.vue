<script setup lang="ts">
import { reactive, watch, computed } from 'vue';
import { useSerialStore } from '../../stores/serialStore';
import { useSerialConfig } from '../../composables/serial/useSerialConfig';
import type { SerialPortOptions } from '../../types/serial/serial';

// 新增props，接收要配置的端口路径
const props = defineProps<{
  portPath: string;
}>();

const serialStore = useSerialStore();
const {
  baudRateOptions,
  dataBitsOptions,
  stopBitsOptions,
  parityOptions,
  flowControlOptions,
  getDefaultSerialOptions,
} = useSerialConfig();

// 计算属性：当前串口的配置
const portOptions = computed(() => {
  return serialStore.portSerialOptions[props.portPath] || getDefaultSerialOptions();
});

// 计算属性：当前串口的连接状态
const isConnected = computed(() => {
  return serialStore.isPortConnected(props.portPath);
});

// 本地表单状态
const formState = reactive<SerialPortOptions>({
  baudRate: portOptions.value.baudRate || 9600,
  dataBits: portOptions.value.dataBits || 8,
  stopBits: portOptions.value.stopBits || 1,
  parity: portOptions.value.parity || 'none',
  flowControl: portOptions.value.flowControl || 'none',
  autoOpen: portOptions.value.autoOpen || false,
});

// 监听 store 中的配置变化，更新本地表单状态
watch(
  portOptions,
  (newOptions) => {
    Object.assign(formState, {
      baudRate: newOptions.baudRate || formState.baudRate,
      dataBits: newOptions.dataBits || formState.dataBits,
      stopBits: newOptions.stopBits || formState.stopBits,
      parity: newOptions.parity || formState.parity,
      flowControl: newOptions.flowControl || formState.flowControl,
      autoOpen: newOptions.autoOpen !== undefined ? newOptions.autoOpen : formState.autoOpen,
    });
  },
  { deep: true },
);

// 应用表单设置到 Store
const applySettings = () => {
  // 更新 Store 中的设置
  serialStore.setPortOptions(props.portPath, {
    ...formState,
  });
};

// 重置为默认设置
const handleReset = () => {
  serialStore.setPortOptions(props.portPath, getDefaultSerialOptions());
};

// 自动保存设置
watch(
  formState,
  () => {
    if (!isConnected.value) {
      applySettings();
    }
  },
  { deep: true },
);

// 是否显示高级选项
const showAdvanced = reactive({
  value: false,
});
</script>

<template>
  <div class="flex flex-col">
    <div class="flex justify-between items-center mb-2">
      <q-btn
        flat
        dense
        color="grey"
        :label="showAdvanced.value ? '隐藏高级选项' : '显示高级选项'"
        class="text-xs text-industrial-accent hover:bg-industrial-highlight"
        @click="showAdvanced.value = !showAdvanced.value"
      />
    </div>

    <div class="bg-industrial-panel rounded-lg p-3 border border-industrial">
      <div class="grid grid-cols-2 gap-3">
        <!-- 波特率 -->
        <div>
          <q-select
            v-model="formState.baudRate"
            :options="baudRateOptions"
            label="波特率"
            outlined
            dense
            dark
            emit-value
            map-options
            option-label="label"
            option-value="value"
            bg-color="rgba(16, 24, 40, 0.6)"
            :disable="isConnected"
          />
        </div>

        <!-- 数据位 -->
        <div>
          <q-select
            v-model="formState.dataBits"
            :options="dataBitsOptions"
            label="数据位"
            outlined
            dense
            dark
            emit-value
            map-options
            option-label="label"
            option-value="value"
            bg-color="rgba(16, 24, 40, 0.6)"
            :disable="isConnected"
          />
        </div>

        <!-- 停止位 -->
        <div>
          <q-select
            v-model="formState.stopBits"
            :options="stopBitsOptions"
            label="停止位"
            outlined
            dense
            dark
            emit-value
            map-options
            option-label="label"
            option-value="value"
            bg-color="rgba(16, 24, 40, 0.6)"
            :disable="isConnected"
          />
        </div>

        <!-- 校验位 -->
        <div>
          <q-select
            v-model="formState.parity"
            :options="parityOptions"
            label="校验位"
            outlined
            dense
            dark
            emit-value
            map-options
            option-label="label"
            option-value="value"
            bg-color="rgba(16, 24, 40, 0.6)"
            :disable="isConnected"
          />
        </div>

        <!-- 高级选项 -->
        <template v-if="showAdvanced.value">
          <!-- 流控制 -->
          <div class="col-span-2">
            <q-select
              v-model="formState.flowControl"
              :options="flowControlOptions"
              label="流控制"
              outlined
              dense
              dark
              emit-value
              map-options
              option-label="label"
              option-value="value"
              bg-color="rgba(16, 24, 40, 0.6)"
              :disable="isConnected"
            />
          </div>

          <!-- 自动打开 -->
          <div class="col-span-2">
            <q-toggle
              v-model="formState.autoOpen"
              label="连接时自动打开串口"
              color="blue-5"
              :disable="isConnected"
            />
          </div>
        </template>
      </div>

      <!-- 操作按钮 -->
      <div class="flex justify-end mt-4" v-if="!isConnected">
        <q-btn
          flat
          label="重置为默认设置"
          color="grey"
          class="text-xs mr-2 hover:bg-industrial-highlight"
          @click="handleReset"
        />
      </div>
    </div>
  </div>
</template>
