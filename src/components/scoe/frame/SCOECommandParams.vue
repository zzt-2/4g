<template>
  <div v-if="localCommand && shouldShow" class="flex-1 flex flex-col">
    <!-- 参数配置 -->
    <div class="bg-industrial-secondary border border-industrial rounded p-2">
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-sm font-medium text-industrial-primary flex items-center">
          <q-icon name="settings" size="xs" class="mr-1 text-blue-5" />
          参数配置
        </h4>
        <q-btn flat dense round size="xs" icon="add" color="positive" @click="store.addParam()">
          <q-tooltip>添加参数</q-tooltip>
        </q-btn>
      </div>

      <!-- 参数列表 -->
      <div v-if="localCommand.params?.length" class="space-y-2">
        <div v-for="param in localCommand.params" :key="param.id"
          class="bg-industrial-highlight border border-industrial rounded p-1">
          <!-- 参数行 -->
          <div class="flex items-center gap-2 flex-wrap">
            <!-- 标签 -->
            <q-input :model-value="param.label" dense outlined dark bg-color="industrial-panel" class="flex-1 text-xs"
              label="标签" hide-bottom-space
              @update:model-value="store.updateParam(param.id, { label: String($event || '') })" />

            <!-- 类型 -->
            <q-select :model-value="param.type" :options="paramTypeOptions" dense outlined dark option-value="value"
              option-label="label" emit-value map-options bg-color="industrial-panel" class="w-28 text-xs" label="类型"
              hide-bottom-space
              @update:model-value="store.updateParam(param.id, { type: $event as 'string' | 'number' | 'boolean' })" />

            <!-- 偏移 -->
            <q-input :model-value="param.offset" dense outlined dark bg-color="industrial-panel" class="w-16 text-xs"
              label="偏移" hide-bottom-space
              @update:model-value="store.updateParam(param.id, { offset: Number($event) || 0 })" />

            <!-- 长度 -->
            <q-input :model-value="param.length" dense outlined dark bg-color="industrial-panel" class="w-16 text-xs"
              label="长度" hide-bottom-space
              @update:model-value="store.updateParam(param.id, { length: Number($event) || 0 })" />

            <!-- 目标帧ID -->
            <q-select :model-value="param.targetInstanceId" :options="frameInstanceOptions" dense outlined dark
              option-value="id" option-label="label" emit-value map-options bg-color="industrial-panel"
              class="w-64 text-xs" label="目标帧" hide-bottom-space
              @update:model-value="store.updateParam(param.id, { targetInstanceId: $event || undefined })" />

            <!-- 字段ID -->
            <q-select :model-value="param.targetFieldId" :options="getFieldOptions(param.targetInstanceId)" dense
              outlined dark option-value="id" option-label="label" emit-value map-options bg-color="industrial-panel"
              class="w-64 text-xs" label="目标字段" hide-bottom-space
              @update:model-value="store.updateParam(param.id, { targetFieldId: $event || undefined })" />

            <!-- 编辑选项 -->
            <q-btn flat dense round size="xs" icon="edit" color="blue-5" @click="store.toggleParamExpansion(param.id)">
              <q-tooltip>{{ store.expandedParamIds.has(param.id) ? '收起选项' : '编辑选项' }}</q-tooltip>
            </q-btn>

            <!-- 删除 -->
            <q-btn flat dense round size="xs" icon="delete_outline" color="negative"
              @click="store.deleteParam(param.id)">
              <q-tooltip>删除</q-tooltip>
            </q-btn>
          </div>

          <!-- 展开的选项列表 -->
          <div v-if="store.expandedParamIds.has(param.id)" class="mt-2 p-2 bg-industrial-panel rounded">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs text-industrial-secondary">参数选项</span>
              <q-btn flat dense size="xs" icon="add" color="positive" label="添加选项"
                @click="store.addParamOption(param.id)" />
            </div>

            <div v-if="param.options?.length" class="space-y-1">
              <div v-for="(option, optIndex) in param.options" :key="optIndex"
                class="flex items-center gap-2 p-1 bg-industrial-highlight rounded">
                <!-- 标签 -->
                <q-input :model-value="option.label" dense outlined dark bg-color="industrial-panel"
                  class="flex-1 text-xs" placeholder="标签" hide-bottom-space
                  @update:model-value="store.updateParamOption(param.id, optIndex, { label: String($event || '') })" />

                <!-- 值 -->
                <q-input :model-value="option.value" dense outlined dark bg-color="industrial-panel"
                  class="flex-1 text-xs" placeholder="值" hide-bottom-space
                  @update:model-value="store.updateParamOption(param.id, optIndex, { value: String($event || '') })" />

                <!-- 接收码 -->
                <q-input :model-value="option.receiveCode" dense outlined dark bg-color="industrial-panel"
                  class="flex-1 text-xs" placeholder="接收码(hex)" hide-bottom-space
                  @update:model-value="store.updateParamOption(param.id, optIndex, { receiveCode: String($event || '') })" />

                <!-- 删除 -->
                <q-btn flat dense round size="xs" icon="delete_outline" color="negative"
                  @click="store.deleteParamOption(param.id, optIndex)">
                  <q-tooltip>删除</q-tooltip>
                </q-btn>
              </div>
            </div>
            <div v-else class="text-industrial-tertiary text-xs text-center py-1">
              暂无选项
            </div>
          </div>
        </div>
      </div>
      <div v-else class="text-industrial-tertiary text-xs text-center py-2">
        暂无参数配置
      </div>
    </div>

    <!-- 帧实例配置 -->
    <div class="bg-industrial-secondary border border-industrial rounded p-2">
      <div class="w-full flex items-center justify-between mb-2">
        <h4 class="text-sm font-medium text-industrial-primary flex items-center">
          <q-icon name="inventory" size="xs" class="mr-1 text-blue-5" />
          帧实例配置
        </h4>
        <div class="flex-1 max-w-120 flex no-wrap items-center justify-end gap-4">
          <template v-if="localCommand.function === ScoeCommandFunction.READ_FILE_AND_SEND">
            <q-label class="flex-1 truncate text-sm text-industrial-secondary">发送间隔: </q-label>
            <q-input v-model="localCommand.sendInterval" dense outlined dark bg-color="industrial-panel"
              class="flex-1 min-w-16 text-xs" hide-bottom-space
              @update:model-value="store.updateReceiveCommandField('sendInterval', Number($event) || undefined)">
              <template #append>
                <span class="text-xs text-industrial-secondary">ms</span>
              </template>
            </q-input>
          </template>
          <q-label class="flex-1 min-w-0 truncate text-sm text-industrial-secondary">选择帧: </q-label>
          <q-select v-model="selectedFrameId" :options="availableSendFrames" dense outlined dark option-value="id"
            option-label="name" emit-value map-options bg-color="industrial-panel" class="flex-1 flex-grow-3 text-xs"
            hide-bottom-space />
          <q-btn flat dense round size="xs" icon="add" color="positive" :disable="!selectedFrameId"
            @click="handleAddFrameInstance">
            <q-tooltip>添加实例</q-tooltip>
          </q-btn>
        </div>
      </div>

      <!-- 帧实例列表 -->
      <div v-if="localCommand.frameInstances?.length" class="space-y-2">
        <div v-for="(instance, index) in localCommand.frameInstances" :key="index"
          class="bg-industrial-panel border border-industrial rounded p-2">
          <!-- 实例行 -->
          <div class="h-32px flex items-center justify-between rounded">
            <div class="flex items-center gap-2">
              <q-icon name="list_alt" size="xs" class="text-industrial-accent" />
              <span class="text-xs text-industrial-primary">{{ instance.label || `实例 ${index + 1}` }}</span>
            </div>
            <div class="flex items-center gap-1">
              <div class="flex items-center gap-3 pr-6">
                <label class="text-xs text-industrial-secondary">发送目标: </label>
                <q-select v-model="instance.targetId" :options="connectionTargetsStore.availableTargets" dense outlined
                  dark option-value="id" option-label="name" emit-value map-options bg-color="industrial-panel"
                  class="q-input-class w-48 text-xs" placeholder="选择目标" hide-bottom-space>
                  <template #option="scope">
                    <q-item v-bind="scope.itemProps">
                      <q-item-section>
                        <q-item-label class="text-xs text-industrial-primary">{{ scope.opt.name }}</q-item-label>
                        <q-item-label caption class="text-2xs">
                          <span :class="scope.opt.status === 'connected' ? 'text-positive' : 'text-negative'">
                            {{ scope.opt.status === 'connected' ? '已连接' : '未连接' }}
                          </span>
                          <span v-if="scope.opt.description" class="ml-2 text-industrial-tertiary">
                            {{ scope.opt.description }}
                          </span>
                        </q-item-label>
                      </q-item-section>
                    </q-item>
                  </template>
                </q-select>
              </div>
              <!-- 编辑 -->
              <q-btn flat dense round size="xs" icon="edit" color="blue-5"
                @click="store.toggleInstanceExpansion(index)">
                <q-tooltip>{{ store.expandedInstanceIds.has(String(index)) ? '收起' : '编辑' }}</q-tooltip>
              </q-btn>
              <!-- 复制 -->
              <q-btn flat dense round size="xs" icon="content_copy" color="blue-grey"
                @click="store.duplicateFrameInstance(index)">
                <q-tooltip>复制</q-tooltip>
              </q-btn>
              <!-- 删除 -->
              <q-btn flat dense round size="xs" icon="delete_outline" color="negative"
                @click="store.deleteFrameInstanceFromCommand(index)">
                <q-tooltip>删除</q-tooltip>
              </q-btn>
            </div>
          </div>

          <!-- 展开的字段列表 -->
          <div v-if="store.expandedInstanceIds.has(String(index))" class="pt-2">
            <ConfigurableFieldsList :fields="instance.fields"
              @update:field-value="(fieldId, value) => store.updateFrameInstanceField(index, fieldId, value)" />
          </div>
        </div>
      </div>
      <div v-else class="text-industrial-tertiary text-xs text-center py-2">
        暂无帧实例
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useScoeFrameInstancesStore } from '../../../stores/frames/scoeFrameInstancesStore';
import { useFrameTemplateStore } from '../../../stores/framesStore';
import { ScoeCommandFunction } from '../../../types/scoe';
import ConfigurableFieldsList from './ConfigurableFieldsList.vue';
import { useConnectionTargetsStore } from 'src/stores/connectionTargetsStore';

const store = useScoeFrameInstancesStore();
const frameTemplateStore = useFrameTemplateStore();
const connectionTargetsStore = useConnectionTargetsStore();

const localCommand = computed(() => store.localReceiveCommand);

const shouldShow = computed(() => {
  return (
    localCommand.value?.function === ScoeCommandFunction.SEND_FRAME ||
    localCommand.value?.function === ScoeCommandFunction.READ_FILE_AND_SEND
  );
});

const paramTypeOptions = [
  { label: '字符串', value: 'string' },
  { label: '数字', value: 'number' },
  { label: '布尔', value: 'boolean' },
];

const availableSendFrames = computed(() => {
  return frameTemplateStore.frames.filter((frame) => frame.direction === 'send');
});

const selectedFrameId = ref<string>('');

const frameInstanceOptions = computed(() => {
  if (!localCommand.value?.frameInstances) return [];
  return localCommand.value.frameInstances.map((inst, index) => ({
    id: String(index),
    label: inst.label || `实例 ${index + 1}`,
  }));
});

const getFieldOptions = (targetInstanceId?: string) => {
  if (!targetInstanceId || !localCommand.value?.frameInstances) return [];
  const index = Number(targetInstanceId);
  const instance = localCommand.value.frameInstances[index];
  if (!instance) return [];
  return instance.fields
    .filter((field) => field.configurable)
    .map((field) => ({
      id: field.id,
      label: field.label,
    }));
};

const handleAddFrameInstance = () => {
  if (!selectedFrameId.value) return;
  const result = store.addFrameInstanceToCommand(selectedFrameId.value);
  if (result.success) {
    selectedFrameId.value = '';
  }
};
</script>

<style scoped lang="scss">
.q-input-class {
  :deep(.q-field__inner .q-field__control) {
    height: 32px !important;
    min-height: 0px !important;
  }

  :deep(.q-field__native) {
    height: 32px !important;
    min-height: 0px !important;
  }

  :deep(.q-field__marginal) {
    height: 32px !important;
    min-height: 0px !important;
  }
}
</style>
