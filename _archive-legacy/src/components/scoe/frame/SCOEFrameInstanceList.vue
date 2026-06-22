<template>
  <div class="bg-industrial-panel flex flex-col">
    <!-- 顶部控制区 -->
    <div class="flex flex-col bg-industrial-secondary p-3 gap-3 border-b border-industrial">
      <div class="flex items-center gap-2">
        <!-- 搜索框 -->
        <q-input v-model="searchText" class="flex-1" dense outlined dark
          :placeholder="scoeFrameInstancesStore.direction === 'send' ? '搜索帧实例...' : '搜索接收指令...'"
          bg-color="industrial-panel" input-class="text-industrial-primary text-sm">
          <template v-slot:prepend>
            <q-icon name="search" size="xs" />
          </template>
        </q-input>

        <!-- 导入导出按钮 -->
        <ImportExportActions :getData="handleGetScoeConfig" :setData="handleSetScoeConfig"
          storageDir="data/scoe/scoeConfigs" exportTitle="导出SCOE配置" importTitle="导入SCOE配置" />
      </div>

      <!-- 方向选择 -->
      <div class="flex gap-2">
        <q-btn
          :class="scoeFrameInstancesStore.direction === 'send' ? 'btn-industrial-primary' : 'btn-industrial-secondary'"
          size="sm" class="flex-1" @click="scoeFrameInstancesStore.direction = 'send'">
          <q-icon name="upload" class="mr-1" size="xs" />
          发送
        </q-btn>
        <q-btn
          :class="scoeFrameInstancesStore.direction === 'receive' ? 'btn-industrial-primary' : 'btn-industrial-secondary'"
          size="sm" class="flex-1" @click="scoeFrameInstancesStore.direction = 'receive'">
          <q-icon name="download" class="mr-1" size="xs" />
          接收
        </q-btn>
      </div>
    </div>

    <!-- 中间：帧实例/接收指令列表 -->
    <div class="flex-1 min-h-0 overflow-y-auto p-2">
      <div v-if="filteredInstances.length === 0"
        class="flex flex-col items-center justify-center h-full text-industrial-tertiary text-center py-8">
        <q-icon name="inbox" size="md" class="mb-2" />
        <div class="text-sm">{{ scoeFrameInstancesStore.direction === 'send' ? '暂无帧实例' : '暂无接收指令' }}</div>
      </div>

      <div v-else class="space-y-1">
        <div v-for="instance in filteredInstances" :key="instance.id"
          class="cursor-pointer rounded p-2 border transition-colors" :class="isSelected(instance.id)
            ? 'bg-industrial-highlight border-industrial-accent'
            : 'bg-industrial-secondary border-industrial hover:border-industrial-accent'
            " @click="handleSelectInstance(instance.id)">
          <div class="flex items-center gap-2">
            <div class="flex-1 min-w-0">
              <!-- 发送帧：显示ID和描述 -->
              <div v-if="scoeFrameInstancesStore.direction === 'send'">
                <div class="text-industrial-primary text-sm font-medium truncate">{{ instance.id }}</div>
                <div v-if="'description' in instance && instance.description"
                  class="text-industrial-secondary text-xs truncate mt-1">
                  {{ instance.description }}
                </div>
              </div>
              <!-- 接收指令：紧凑显示label和code -->
              <div v-else class="flex items-center gap-2">
                <div class="text-industrial-primary text-sm font-medium truncate flex-1">
                  {{ 'label' in instance ? instance.label : '' }}
                </div>
                <q-badge outline color="blue-5" class="text-xs font-mono">
                  {{ 'code' in instance ? instance.code.toUpperCase() : '' }}
                </q-badge>
              </div>
            </div>

            <div class="flex items-center gap-1">
              <!-- 复制按钮 -->
              <q-btn icon="content_copy" size="xs" flat round dense color="blue-5"
                @click.stop="handleCopyInstance(instance.id)">
                <q-tooltip>复制</q-tooltip>
              </q-btn>
              <!-- 删除按钮 -->
              <q-btn icon="delete" size="xs" flat round dense color="negative"
                @click.stop="handleDeleteInstance(instance.id)">
                <q-tooltip>删除</q-tooltip>
              </q-btn>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部：添加按钮 -->
    <div class="w-full bg-industrial-secondary p-3 border-t border-industrial">
      <!-- 发送帧：选择可用帧 -->
      <div v-if="scoeFrameInstancesStore.direction === 'send'" class="flex items-center gap-2">
        <q-select v-model="selectedFrameId" :options="availableFrameOptions" dense outlined dark option-value="value"
          option-label="label" emit-value map-options placeholder="选择可用的 SCOE 帧..." class="flex-1 min-w-0"
          bg-color="industrial-panel" popup-content-class="bg-industrial-panel max-h-280px overflow-y-auto">
          <template v-slot:prepend>
            <q-icon name="library_add" size="xs" />
          </template>
          <template v-slot:selected-item="scope">
            <div class="truncate">{{ scope.opt.label }}</div>
          </template>
        </q-select>
        <q-btn icon="add" color="positive" round dense :disable="!selectedFrameId" @click="handleAddInstance">
          <q-tooltip>添加帧实例</q-tooltip>
        </q-btn>
      </div>

      <!-- 接收指令：直接添加按钮 -->
      <div v-else class="flex items-center justify-center">
        <q-btn icon="add" label="添加接收指令" color="positive" class="flex-1" dense @click="handleAddReceiveCommand">
          <q-tooltip>添加新的接收指令</q-tooltip>
        </q-btn>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useQuasar } from 'quasar';
import { useScoeFrameInstancesStore } from '../../../stores/frames/scoeFrameInstancesStore';
import type { SendFrameInstance } from '../../../types/frames/sendInstances';
import type { ScoeReceiveCommand } from '../../../types/scoe';
import ImportExportActions from '../../common/ImportExportActions.vue';

const $q = useQuasar();
const scoeFrameInstancesStore = useScoeFrameInstancesStore();

// 搜索文本
const searchText = ref('');

// 选中的可用帧ID
const selectedFrameId = ref<string>('');

// 计算属性：当前显示的帧实例/接收指令列表
const currentInstances = computed<(SendFrameInstance | ScoeReceiveCommand)[]>(() => {
  if (scoeFrameInstancesStore.direction === 'send') {
    return scoeFrameInstancesStore.sendInstances;
  } else {
    return scoeFrameInstancesStore.receiveCommands;
  }
});

// 计算属性：过滤后的帧实例/接收指令列表
const filteredInstances = computed<(SendFrameInstance | ScoeReceiveCommand)[]>(() => {
  if (!searchText.value) return currentInstances.value;

  const searchLower = searchText.value.toLowerCase();

  if (scoeFrameInstancesStore.direction === 'send') {
    return currentInstances.value.filter((instance) => {
      const sendInstance = instance as SendFrameInstance;
      return (
        sendInstance.id.toLowerCase().includes(searchLower) ||
        sendInstance.description?.toLowerCase().includes(searchLower)
      );
    });
  } else {
    return currentInstances.value.filter((instance) => {
      const receiveCommand = instance as ScoeReceiveCommand;
      return (
        receiveCommand.label.toLowerCase().includes(searchLower) ||
        receiveCommand.code.toLowerCase().includes(searchLower)
      );
    });
  }
});

// 计算属性：可用帧选项
const availableFrameOptions = computed(() => {
  const frames =
    scoeFrameInstancesStore.direction === 'send'
      ? scoeFrameInstancesStore.availableSendFrames
      : scoeFrameInstancesStore.availableReceiveFrames;

  return frames.map((frame) => ({
    value: frame.id,
    label: `${frame.id} - ${frame.name}`,
  }));
});

// 判断是否选中
const isSelected = (instanceId: string) => {
  if (scoeFrameInstancesStore.direction === 'send') {
    return scoeFrameInstancesStore.selectedSendInstanceId === instanceId;
  } else {
    return scoeFrameInstancesStore.selectedReceiveCommandId === instanceId;
  }
};

// 选择帧实例/接收指令
const handleSelectInstance = (instanceId: string) => {
  if (scoeFrameInstancesStore.direction === 'send') {
    scoeFrameInstancesStore.selectSendInstance(instanceId);
  } else {
    scoeFrameInstancesStore.selectReceiveCommand(instanceId);
  }
};

// 添加发送帧实例
const handleAddInstance = () => {
  if (!selectedFrameId.value) return;

  const result = scoeFrameInstancesStore.addSendInstance(selectedFrameId.value);
  if (result.success) {
    $q.notify({
      type: 'positive',
      message: '帧实例添加成功',
      position: 'top-right',
    });
    selectedFrameId.value = '';
  } else {
    $q.notify({
      type: 'negative',
      message: result.message || '添加失败',
      position: 'top-right',
    });
  }
};

// 添加接收指令
const handleAddReceiveCommand = () => {
  scoeFrameInstancesStore.addReceiveCommand();
  $q.notify({
    type: 'positive',
    message: '接收指令添加成功',
    position: 'top-right',
  });
};

// 复制帧实例/接收指令
const handleCopyInstance = (instanceId: string) => {
  if (scoeFrameInstancesStore.direction === 'send') {
    scoeFrameInstancesStore.duplicateSendInstance(instanceId);
  } else {
    scoeFrameInstancesStore.duplicateReceiveCommand(instanceId);
  }
};

// 删除帧实例/接收指令
const handleDeleteInstance = (instanceId: string) => {
  const title = scoeFrameInstancesStore.direction === 'send' ? '确认删除帧实例' : '确认删除接收指令';
  const message = scoeFrameInstancesStore.direction === 'send' ? '确定要删除这个帧实例吗？' : '确定要删除这个接收指令吗？';

  $q.dialog({
    title,
    message,
    cancel: true,
    dark: true,
    persistent: false,
  }).onOk(() => {
    if (scoeFrameInstancesStore.direction === 'send') {
      scoeFrameInstancesStore.deleteSendInstance(instanceId);
      $q.notify({
        type: 'positive',
        message: '帧实例已删除',
        position: 'top-right',
      });
    } else {
      scoeFrameInstancesStore.deleteReceiveCommand(instanceId);
      $q.notify({
        type: 'positive',
        message: '接收指令已删除',
        position: 'top-right',
      });
    }
  });
};

const handleGetScoeConfig = () => {
  return { sendInstances: scoeFrameInstancesStore.sendInstances, receiveCommands: scoeFrameInstancesStore.receiveCommands };
};

const handleSetScoeConfig = async (data: unknown) => {
  const dataConfig = data as { sendInstances: SendFrameInstance[], receiveCommands: ScoeReceiveCommand[] };
  scoeFrameInstancesStore.sendInstances = dataConfig.sendInstances;
  scoeFrameInstancesStore.receiveCommands = dataConfig.receiveCommands;
};

</script>
