<template>
  <div class="bg-industrial-panel h-full flex flex-col">
    <!-- 顶部操作区 -->
    <div class="relative bg-industrial-secondary">
      <div class="flex flex-shrink-0 no-wrap items-center gap-6 p-4">
        <div class="flex items-center gap-2">
          <!-- SCOE标识 -->
          <div class="flex items-center gap-2">
            <label class="w-16 text-industrial-secondary text-sm whitespace-nowrap">SCOE标识:</label>
            <q-input v-model="scoeStore.globalConfig.scoeIdentifier" class="w-16" dense outlined
              bg-color="industrial-secondary" input-class="text-industrial-primary text-sm" />
          </div>

          <!-- 卫星ID -->
          <div class="flex items-center gap-2">
            <label class="w-16 text-industrial-secondary text-sm whitespace-nowrap">卫星ID:</label>
            <q-input v-model="localSatelliteConfig.satelliteId" class="w-24" dense outlined
              bg-color="industrial-secondary" input-class="text-industrial-primary text-sm"
              :disable="!scoeStore.selectedConfig" />
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex-1 max-w-130 flex items-center gap-2 ml-auto">
          <q-btn class="flex-1" size="sm" @click="showConfigForm = !showConfigForm">
            <q-icon name="settings" class="mr-1" />
            {{ showConfigForm ? '隐藏' : '显示' }}
          </q-btn>
          <q-btn class="flex-1" size="sm" :color="scoeStore.tcpConnected ? 'negative' : 'primary'"
            @click="scoeStore.checkTcpConnection">
            <q-icon name="wifi" class="mr-1" />
            {{ scoeStore.tcpConnected ? '断开' : '连接' }}
          </q-btn>
          <q-btn :disable="!scoeStore.selectedConfig" class="flex-1" size="sm"
            :color="scoeStore.status.scoeFramesLoaded ? 'negative' : 'primary'"
            @click="scoeStore.status.scoeFramesLoaded = !scoeStore.status.scoeFramesLoaded">
            <q-icon :name="scoeStore.status.scoeFramesLoaded ? 'file_upload' : 'file_download'" class="mr-1" />
            {{ scoeStore.status.scoeFramesLoaded ? '卸载' : '加载' }}
          </q-btn>
          <q-btn class="btn-industrial-primary flex-1" size="sm" :disable="!scoeStore.selectedConfig"
            @click="handleSave">
            <q-icon name="save" class="mr-1" />
            保存
          </q-btn>

          <q-btn class="btn-industrial-secondary flex-1" size="sm" :disable="!scoeStore.selectedConfig"
            @click="handleScoeFrame">
            <q-icon name="settings" class="mr-1" />
            设置
          </q-btn>
        </div>
      </div>

      <!-- 配置行 -->
      <div v-if="showConfigForm"
        class="absolute top-18 w-full z-100 flex flex-col items-start p-3 gap-3 border-3 border-solid border-industrial bg-industrial-secondary">
        <div class="flex no-wrap items-center gap-6">
          <!-- TCP Server IP -->
          <div class="flex items-center gap-2 w-64">
            <label class="flex-1 text-industrial-secondary text-sm whitespace-nowrap">TCP Server IP地址:</label>
            <q-input v-model="scoeStore.globalConfig.tcpServerIp" class="w-32" dense outlined
              bg-color="industrial-secondary" input-class="text-industrial-primary text-sm" />
          </div>

          <!-- TCP Server 端口 -->
          <div class="flex items-center gap-2 w-64">
            <label class="flex-1 text-industrial-secondary text-sm whitespace-nowrap">端口:</label>
            <q-input v-model="scoeStore.globalConfig.tcpServerPort" class="w-32" dense outlined
              bg-color="industrial-secondary" input-class="text-industrial-primary text-sm" />
          </div>

          <!-- 自动连接 -->
          <div class="flex items-center gap-2 w-64">
            <q-toggle v-model="scoeStore.globalConfig.tcpServerAutoConnect" color="green" size="sm" />
            <label class="text-industrial-secondary text-sm whitespace-nowrap">TCP自动连接</label>
          </div>
        </div>

        <div class="flex items-center gap-6">
          <!-- UDP IP地址 -->
          <div class="flex items-center gap-2 w-64">
            <label class="flex-1 text-industrial-secondary text-sm whitespace-nowrap">UDP IP地址:</label>
            <q-input v-model="scoeStore.globalConfig.udpIpAddress" class="w-32" dense outlined
              bg-color="industrial-secondary" input-class="text-industrial-primary text-sm" />
          </div>

          <!-- UDP端口号 -->
          <div class="flex items-center gap-2 w-64">
            <label class="flex-1 text-industrial-secondary text-sm whitespace-nowrap">UDP端口号:</label>
            <q-input v-model="scoeStore.globalConfig.udpPort" class="w-32" dense outlined
              bg-color="industrial-secondary" input-class="text-industrial-primary text-sm" />
          </div>
        </div>

        <!-- 第三行：三个标志的起始字节数 -->
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-2 w-64">
            <label class="flex-1 text-industrial-secondary text-sm whitespace-nowrap">信息标识偏移:</label>
            <q-input v-model.number="scoeStore.globalConfig.messageIdentifierOffset" class="w-32" dense outlined
              bg-color="industrial-secondary" input-class="text-industrial-primary text-sm" type="number" />
          </div>
          <div class="flex items-center gap-2 w-64">
            <label class="flex-1 text-industrial-secondary text-sm whitespace-nowrap">信源标识偏移:</label>
            <q-input v-model.number="scoeStore.globalConfig.sourceIdentifierOffset" class="w-32" dense outlined
              bg-color="industrial-secondary" input-class="text-industrial-primary text-sm" type="number" />
          </div>
          <div class="flex items-center gap-2 w-64">
            <label class="flex-1 text-industrial-secondary text-sm whitespace-nowrap">信宿标识偏移:</label>
            <q-input v-model.number="scoeStore.globalConfig.destinationIdentifierOffset" class="w-32" dense outlined
              bg-color="industrial-secondary" input-class="text-industrial-primary text-sm" type="number" />
          </div>
        </div>

        <!-- 第四行：型号ID、卫星ID和功能码的起始字节数 -->
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-2 w-64">
            <label class="flex-1 text-industrial-secondary text-sm whitespace-nowrap">型号ID偏移:</label>
            <q-input v-model.number="scoeStore.globalConfig.modelIdOffset" class="w-32" dense outlined
              bg-color="industrial-secondary" input-class="text-industrial-primary text-sm" type="number" />
          </div>
          <div class="flex items-center gap-2 w-64">
            <label class="flex-1 text-industrial-secondary text-sm whitespace-nowrap">卫星ID偏移:</label>
            <q-input v-model.number="scoeStore.globalConfig.satelliteIdOffset" class="w-32" dense outlined
              bg-color="industrial-secondary" input-class="text-industrial-primary text-sm" type="number" />
          </div>
          <div class="flex items-center gap-2 w-64">
            <label class="flex-1 text-industrial-secondary text-sm whitespace-nowrap">功能码偏移:</label>
            <q-input v-model.number="scoeStore.globalConfig.functionCodeOffset" class="w-32" dense outlined
              bg-color="industrial-secondary" input-class="text-industrial-primary text-sm" type="number" />
          </div>
        </div>

        <!-- 第五行：执行成功发送帧 -->
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-2 w-full">
            <label class="w-30 text-industrial-secondary text-sm whitespace-nowrap">执行成功发送帧:</label>
            <q-select v-model="scoeStore.globalConfig.successFrameId" :options="availableSendFrames" class="w-64" dense
              outlined clearable bg-color="industrial-secondary" option-value="id" option-label="name" emit-value
              map-options />
          </div>
        </div>
      </div>
    </div>

    <!-- 配置表单区域 -->
    <div class="flex-1 flex flex-col no-wrap min-h-0 overflow-y-auto p-4 gap-4">
      <div v-if="!scoeStore.selectedConfig"
        class="flex-1 flex flex-col items-center justify-center text-industrial-tertiary text-center">
        <q-icon name="settings" size="48px" class="mb-4" />
        <div class="text-lg mb-2">请选择配置项</div>
        <div class="text-sm">双击左侧列表中的配置项开始编辑</div>
      </div>

      <template v-else>
        <div class="w-full flex gap-4">
          <!-- SCOE 指令接收配置 -->
          <div class="flex-1 bg-industrial-secondary border border-industrial rounded p-4">
            <div class="flex no-wrap items-start justify-between">
              <h4 class="text-industrial-primary text-base font-medium pb-3 mt-2 flex items-center no-wrap">
                <q-icon name="download" class="mr-2" />
                指令接收配置
              </h4>
              <div class="flex no-wrap">
                <q-checkbox v-model="localSatelliteConfig.receiveConfig.recognitionMessageId" label="信息" />
                <q-checkbox v-model="localSatelliteConfig.receiveConfig.recognitionSourceId" label="信源" />
                <q-checkbox v-model="localSatelliteConfig.receiveConfig.recognitionDestinationId" label="信宿" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div v-for="(field, index) in receiveConfigFields" :key="field.key">
                <label class="block text-industrial-secondary text-sm mb-1"
                  :class="{ 'text-red-5': receiveConfigValidationErrors[index] }">{{ field.label }}</label>
                <q-input v-model="(localSatelliteConfig.receiveConfig as any)[field.key]"
                  :placeholder="field.placeholder" dense outlined bg-color="industrial-panel"
                  input-class="text-industrial-primary text-sm" :disable="field.disable" />
              </div>
            </div>
          </div>

          <!-- SCOE 遥测参数配置 -->
          <div class="flex-1 bg-industrial-secondary border border-industrial rounded p-4">
            <h4 class="text-industrial-primary text-base font-medium pb-3 mt-2 flex items-center">
              <q-icon name="upload" class="mr-2" />
              遥测参数配置
            </h4>

            <div class="grid grid-cols-2 gap-4">
              <div v-for="(field, index) in sendConfigFields" :key="field.key">
                <label class="block text-industrial-secondary text-sm mb-1"
                  :class="{ 'text-red-5': sendConfigValidationErrors[index] }">{{ field.label }}</label>
                <q-input v-model="(localSatelliteConfig.sendConfig as any)[field.key]" :placeholder="field.placeholder"
                  dense outlined bg-color="industrial-panel" input-class="text-industrial-primary text-sm"
                  :disable="field.disable" />
              </div>
            </div>
          </div>
        </div>

        <!-- 测试工具 -->
        <TestTool class="flex-1 min-h-300px p-3 bg-industrial-secondary" />
      </template>
    </div>

    <!-- SCOE 帧弹窗 -->
    <SCOEFrameDialog ref="scoeFrameDialogRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useScoeStore } from '../../stores/scoeStore';
import { useScoeFrameInstancesStore } from '../../stores/frames/scoeFrameInstancesStore';
import { useQuasar } from 'quasar';
import type { ScoeReceiveConfig, ScoeSatelliteConfig, ScoeSendConfig } from '../../types/scoe';
import {
  defaultScoeSatelliteConfig,
  receiveConfigFields,
  sendConfigFields,
} from '../../types/scoe';
import { deepClone } from 'src/utils/frames/frameUtils';
import SCOEFrameDialog from './frame/SCOEFrameDialog.vue';
import TestTool from './TestTool.vue';

const $q = useQuasar();
const scoeStore = useScoeStore();
const scoeFrameInstancesStore = useScoeFrameInstancesStore();

const showConfigForm = ref(false);

// SCOE 帧弹窗引用
const scoeFrameDialogRef = ref<InstanceType<typeof SCOEFrameDialog> | null>(null);

// 本地表单数据 - 合并为一个对象
const localSatelliteConfig = ref<ScoeSatelliteConfig>({ ...defaultScoeSatelliteConfig });
const sendConfigValidationErrors = computed(() => {
  return sendConfigFields.map(
    (field) =>
      field.must &&
      !(localSatelliteConfig.value.sendConfig as ScoeSendConfig)[field.key as keyof ScoeSendConfig],
  );
});

const receiveConfigValidationErrors = computed(() => {
  return receiveConfigFields.map(
    (field) =>
      field.must &&
      !(localSatelliteConfig.value.receiveConfig as ScoeReceiveConfig)[
      field.key as keyof ScoeReceiveConfig
      ],
  );
});

// 监听选中配置变化，更新本地表单数据
watch(
  () => scoeStore.selectedConfig,
  (newConfig) => {
    if (newConfig) {
      localSatelliteConfig.value = deepClone(newConfig);
    } else {
      localSatelliteConfig.value = { ...defaultScoeSatelliteConfig };
    }
  },
  { immediate: true },
);

// 保存配置
const handleSave = async () => {
  if (!scoeStore.selectedConfig) return;

  try {
    localSatelliteConfig.value.receiveConfig.satelliteId = localSatelliteConfig.value.satelliteId;

    // 更新卫星配置
    scoeStore.updateSatelliteConfig(scoeStore.selectedConfig.id, localSatelliteConfig.value);

    // 保存到文件
    const result = await scoeStore.saveCurrentConfig();

    if (result.success) {
      $q.notify({
        type: 'positive',
        message: '配置保存成功',
        position: 'top-right',
      });
    } else {
      throw new Error(result.message || '保存失败');
    }
  } catch (error) {
    $q.notify({
      type: 'negative',
      message: error instanceof Error ? error.message : '配置保存失败',
      position: 'top-right',
    });
  }
};

// SCOE帧处理
const handleScoeFrame = () => {
  if (scoeFrameDialogRef.value) {
    scoeFrameDialogRef.value.open();
  }
};

// 可用的发送帧选项
const availableSendFrames = computed(() => scoeFrameInstancesStore.availableSendFrames);
</script>
