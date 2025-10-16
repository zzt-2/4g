<template>
  <div class="bg-industrial-panel">
    <!-- 发送帧实例编辑 -->
    <div v-if="scoeFrameInstancesStore.localSendInstance && scoeFrameInstancesStore.direction === 'send'"
      class="flex flex-col h-full p-3">
      <!-- 实例基本信息和字段统计 - 紧凑横向布局 -->
      <div class="mb-2 p-2 border-b border-dashed border-industrial">
        <div class="flex items-center gap-4">
          <!-- ID编辑 -->
          <div class="flex items-center gap-2 flex-1">
            <div class="text-xs font-medium text-industrial-primary flex-shrink-0 flex items-center">
              <q-icon name="label" size="xs" class="mr-1 text-blue-5" />
              实例ID
            </div>
            <q-input v-model="scoeFrameInstancesStore.editedId" dense outlined dark bg-color="rgba(16, 24, 40, 0.6)"
              class="q-input-class text-xs" :rules="[(val) => val.trim().length > 0 || 'ID不能为空']"
              input-class="py-0.5 px-1" hide-bottom-space error-message="ID不能为空" />
          </div>

          <!-- 字段统计 -->
          <div v-if="configurableFields.length > 0" class="flex items-center gap-1 text-xs flex-shrink-0">
            <q-icon name="tune" size="xs" class="text-blue-5" />
            <span class="text-industrial-secondary">可配置字段: {{ configurableFields.length }}</span>
          </div>
        </div>
      </div>

      <!-- 无可配置字段提示 -->
      <div v-if="configurableFields.length === 0" class="flex items-center justify-center p-8 text-industrial-tertiary">
        <q-icon name="info" size="sm" class="mr-2" />
        <span class="text-sm">该帧实例没有可配置字段</span>
      </div>

      <!-- 可配置字段列表 -->
      <ConfigurableFieldsList v-else :fields="scoeFrameInstancesStore.localSendInstance?.fields || []"
        @update:field-value="handleValueChange" />
    </div>

    <!-- 接收指令编辑 -->
    <div v-else-if="scoeFrameInstancesStore.localReceiveCommand && scoeFrameInstancesStore.direction === 'receive'"
      class="flex flex-col h-full gap-4 p-4">
      <div class="flex gap-4">
        <!-- Label 编辑 -->
        <div v-if="localCommand" class="flex-1 flex flex-col gap-2">
          <label class="text-industrial-secondary text-sm font-medium">指令标签</label>
          <q-input v-model="localCommand.label" dense outlined dark bg-color="industrial-panel"
            input-class="text-industrial-primary" placeholder="输入指令标签..."
            @update:model-value="(val) => updateField('label', String(val || ''))" />
        </div>

        <!-- Code 编辑 -->
        <div v-if="localCommand" class="flex-1 flex flex-col gap-2">
          <label class="text-industrial-secondary text-sm font-medium">功能码（十六进制）</label>
          <q-input v-model="localCommand.code" dense outlined dark bg-color="industrial-panel"
            input-class="text-industrial-primary font-mono" placeholder="例如: abcd"
            @update:model-value="(val) => updateField('code', String(val || ''))">
            <template v-slot:prepend>
              <q-icon name="code" size="xs" /><span class="text-sm">0x</span>
            </template>
          </q-input>
          <div class="text-industrial-tertiary text-xs">输入格式：十六进制数，如 abcd</div>
        </div>

        <!-- Function 选择 -->
        <div v-if="localCommand" class="flex-1 flex flex-col gap-2">
          <label class="text-industrial-secondary text-sm font-medium">执行功能</label>
          <q-select v-model="localCommand.function" :options="functionOptions" dense outlined dark option-value="value"
            option-label="label" emit-value map-options bg-color="industrial-panel"
            popup-content-class="bg-industrial-panel"
            @update:model-value="(val) => updateField('function', String(val || ''))">
            <template v-slot:prepend>
              <q-icon name="settings" size="xs" />
            </template>
          </q-select>
          <div class="text-industrial-tertiary text-xs">
            选择该指令对应的执行功能
          </div>
        </div>
      </div>

      <!-- 校验和配置 -->
      <div class="mt-2 bg-industrial-secondary border border-industrial rounded p-2">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-xs font-medium text-industrial-primary flex items-center">
            <q-icon name="verified_user" size="xs" class="mr-1 text-blue-5" />
            校验和配置
          </h4>
          <q-btn flat dense round size="xs" icon="add" color="positive" @click="scoeFrameInstancesStore.addChecksum()">
            <q-tooltip>添加校验</q-tooltip>
          </q-btn>
        </div>

        <!-- 校验列表 -->
        <div v-if="localCommand?.checksums?.length" class="space-y-1">
          <div v-for="(checksum, index) in localCommand.checksums" :key="index"
            class="flex items-center gap-6 px-6 py-2 bg-industrial-highlight rounded text-xs">
            <!-- 启用开关 -->
            <q-checkbox :model-value="checksum.enabled" dense dark size="xs"
              @update:model-value="scoeFrameInstancesStore.updateChecksum(index, { enabled: $event })" />

            <!-- 偏移 -->
            <q-input :model-value="checksum.offset" type="number" dense outlined dark bg-color="industrial-panel"
              class="flex-1" label="偏移" hide-bottom-space
              @update:model-value="scoeFrameInstancesStore.updateChecksum(index, { offset: Number($event) || 0 })" />

            <!-- 长度 -->
            <q-input :model-value="checksum.length" type="number" dense outlined dark bg-color="industrial-panel"
              class="flex-1" label="长度" hide-bottom-space
              @update:model-value="scoeFrameInstancesStore.updateChecksum(index, { length: Number($event) || 0 })" />

            <!-- 校验位偏移 -->
            <q-input :model-value="checksum.checksumOffset" type="number" dense outlined dark
              bg-color="industrial-panel" class="flex-1" label="校验位偏移" hide-bottom-space
              @update:model-value="scoeFrameInstancesStore.updateChecksum(index, { checksumOffset: Number($event) || 0 })" />

            <!-- 删除 -->
            <q-btn flat dense round size="xs" icon="delete_outline" color="negative"
              @click="scoeFrameInstancesStore.deleteChecksum(index)">
              <q-tooltip>删除</q-tooltip>
            </q-btn>
          </div>
        </div>
        <div v-else class="text-industrial-tertiary text-xs text-center py-1">
          暂无校验配置
        </div>
      </div>

      <!-- 参数和帧实例配置 -->
      <SCOECommandParams />
    </div>

    <!-- 空状态提示 -->
    <div v-else class="flex flex-col items-center justify-center h-full p-4">
      <q-icon name="info" color="grey" size="2rem" class="opacity-50" />
      <div class="text-industrial-tertiary mt-2 text-center text-sm">请选择帧实例或接收指令进行编辑</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useScoeFrameInstancesStore } from '../../../stores/frames/scoeFrameInstancesStore';
import {
  commandFunctionOptions,
  type ScoeReceiveCommand,
} from '../../../types/scoe';
import SCOECommandParams from './SCOECommandParams.vue';
import ConfigurableFieldsList from './ConfigurableFieldsList.vue';

const scoeFrameInstancesStore = useScoeFrameInstancesStore();

// 计算属性：可配置字段
const configurableFields = computed(() => {
  if (!scoeFrameInstancesStore.localSendInstance) return [];
  return scoeFrameInstancesStore.localSendInstance.fields.filter(
    (field) => field.configurable && (field.dataParticipationType || 'direct') === 'direct',
  );
});

// 字段值更新处理
const handleValueChange = (fieldId: string, value: string | number | null) => {
  scoeFrameInstancesStore.updateFieldValue(fieldId, value);
};

// ==================== 接收指令编辑相关 ====================

// 本地接收指令（响应式）
const localCommand = computed(() => scoeFrameInstancesStore.localReceiveCommand);

// 功能选项
const functionOptions = commandFunctionOptions;

// 更新字段
const updateField = (field: keyof ScoeReceiveCommand, value: string) => {
  scoeFrameInstancesStore.updateReceiveCommandField(field, value);
};
</script>

<style></style>
