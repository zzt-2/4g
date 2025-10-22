<template>
  <div class="bg-industrial-secondary border border-industrial rounded p-2">
    <div class="flex items-center justify-between mb-2">
      <h4 class="text-sm font-medium text-industrial-primary flex items-center">
        <q-icon name="check_circle" size="xs" class="mr-1 text-green-5" />
        执行成功条件配置
      </h4>
      <div class="flex items-center gap-2">
        <q-label class="text-xs text-industrial-secondary">超时时间:</q-label>
        <q-input v-if="localCommand" v-model="localCommand.completionTimeout" dense outlined dark
          bg-color="industrial-panel" class="w-24 text-xs" hide-bottom-space @update:model-value="
            store.updateReceiveCommandField('completionTimeout', Number($event) || 5000)
            ">
          <template #append>
            <span class="text-xs text-industrial-secondary">ms</span>
          </template>
        </q-input>
        <q-btn flat dense round size="xs" icon="add" color="positive" @click="store.addCompletionCondition()">
          <q-tooltip>添加条件</q-tooltip>
        </q-btn>
      </div>
    </div>

    <!-- 条件列表 -->
    <div v-if="localCommand?.completionConditions?.length" class="space-y-2">
      <div v-for="condition in localCommand?.completionConditions" :key="condition.id"
        class="bg-industrial-highlight border border-industrial rounded p-1">
        <!-- 条件行 -->
        <div class="flex items-center gap-2 flex-wrap">
          <!-- 标签 -->
          <q-input :model-value="condition.label" dense outlined dark bg-color="industrial-panel" class="flex-1 text-xs"
            label="标签" hide-bottom-space
            @update:model-value="store.updateCompletionCondition(condition.id, { label: String($event || '') })" />

          <!-- 来源帧 -->
          <q-select :model-value="condition.sourceFrameId" :options="receiveFrameOptions" dense outlined dark
            option-value="value" option-label="label" emit-value map-options bg-color="industrial-panel"
            class="w-48 text-xs" label="来源帧" hide-bottom-space @update:model-value="
              store.updateCompletionCondition(condition.id, { sourceFrameId: $event || '', sourceFieldId: '' })
              " />

          <!-- 来源字段 -->
          <q-select :model-value="condition.sourceFieldId"
            :options="getReceiveFrameFieldOptions(condition.sourceFrameId || '')" dense outlined dark
            option-value="value" option-label="label" emit-value map-options bg-color="industrial-panel"
            class="w-48 text-xs" label="来源字段" hide-bottom-space :disable="!condition.sourceFrameId"
            @update:model-value="store.updateCompletionCondition(condition.id, { sourceFieldId: $event || '' })" />

          <!-- 是否使用参数 -->
          <q-checkbox :model-value="condition.useParam" dense dark size="xs" label="使用参数" text-color="white"
            @update:model-value="
              store.updateCompletionCondition(condition.id, { useParam: Boolean($event) })
              " />

          <!-- 目标参数（使用参数时） -->
          <q-select v-if="condition.useParam" :model-value="condition.targetParamId" :options="paramOptions" dense
            outlined dark option-value="id" option-label="label" emit-value map-options bg-color="industrial-panel"
            class="w-64 text-xs" label="目标参数" hide-bottom-space
            @update:model-value="store.updateCompletionCondition(condition.id, { targetParamId: $event || undefined })" />

          <!-- 匹配符（不使用参数时） -->
          <q-select v-if="!condition.useParam" :model-value="condition.operator" :options="matchOperatorOptions" dense
            outlined dark option-value="value" option-label="label" emit-value map-options bg-color="industrial-panel"
            class="w-30 text-xs" label="匹配符" hide-bottom-space @update:model-value="
              store.updateCompletionCondition(condition.id, { operator: $event as MatchOperator })
              " />

          <!-- 目标值（不使用参数时） -->
          <q-input v-if="!condition.useParam" :model-value="condition.targetFixedValue" dense outlined dark
            bg-color="industrial-panel" class="w-32 text-xs" label="目标值" hide-bottom-space @update:model-value="
              store.updateCompletionCondition(condition.id, { targetFixedValue: String($event || '') })
              " />

          <!-- 编辑（使用参数时） -->
          <q-btn :disable="!condition.useParam" flat dense round size="xs" icon="edit" color="blue-5"
            @click="store.toggleConditionExpansion(condition.id)">
            <q-tooltip>{{
              store.expandedConditionIds.has(condition.id) ? '收起选项' : '编辑选项'
            }}</q-tooltip>
          </q-btn>

          <!-- 复制 -->
          <q-btn flat dense round size="xs" icon="content_copy" color="blue-grey"
            @click="store.duplicateCompletionCondition(condition.id)">
            <q-tooltip>复制</q-tooltip>
          </q-btn>

          <!-- 删除 -->
          <q-btn flat dense round size="xs" icon="delete_outline" color="negative"
            @click="store.deleteCompletionCondition(condition.id)">
            <q-tooltip>删除</q-tooltip>
          </q-btn>
        </div>

        <!-- 展开的选项列表（使用参数时） -->
        <div v-if="condition.useParam && store.expandedConditionIds.has(condition.id)"
          class="mt-2 p-2 bg-industrial-panel rounded">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-industrial-secondary">参数选项匹配规则（基于参数的选项）</span>
          </div>

          <div v-if="getParamOptionsForCondition(condition).length" class="space-y-1">
            <div v-for="(paramOption, optIndex) in getParamOptionsForCondition(condition)" :key="optIndex"
              class="flex items-center gap-2 p-1 bg-industrial-highlight rounded">
              <!-- 参数选项Label（只读显示） -->
              <div class="q-input-class flex-1 text-xs text-industrial-primary px-2">
                {{ paramOption.label }}
              </div>

              <!-- 参数选项Value（只读显示） -->
              <div class="q-input-class flex-1 text-xs text-industrial-secondary px-2 font-mono">
                参数值---- {{ paramOption.value }}
              </div>

              <!-- 匹配符 -->
              <q-select :model-value="getConditionOptionForParamValue(condition, paramOption.value)?.operator"
                :options="matchOperatorOptions" dense outlined dark option-value="value" option-label="label" emit-value
                map-options bg-color="industrial-panel" class="q-input-class w-28 text-xs" placeholder="匹配符"
                hide-bottom-space @update:model-value="
                  updateConditionOptionForParamValue(condition.id, paramOption.value, 'operator', $event as MatchOperator)
                  " />

              <!-- 匹配值 -->
              <q-input :model-value="getConditionOptionForParamValue(condition, paramOption.value)?.matchValue" dense
                outlined dark bg-color="industrial-panel" class="q-input-class flex-1 text-xs" placeholder="匹配值"
                hide-bottom-space @update:model-value="
                  updateConditionOptionForParamValue(condition.id, paramOption.value, 'matchValue', String($event || ''))
                  "><template #append>
                  <span class="text-sm">值</span>
                </template></q-input>
            </div>
          </div>
          <div v-else class="text-industrial-tertiary text-xs text-center py-1">该参数没有选项</div>
        </div>
      </div>
    </div>
    <div v-else class="text-industrial-tertiary text-xs text-center py-2">暂无完成条件</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useScoeFrameInstancesStore } from '../../../stores/frames/scoeFrameInstancesStore';
import { useReceiveFramesStore } from '../../../stores/frames/receiveFramesStore';
import { matchOperatorOptions, MatchOperator } from '../../../types/scoe';

const store = useScoeFrameInstancesStore();
const receiveFramesStore = useReceiveFramesStore();

const localCommand = computed(() => store.localReceiveCommand);

// 接收帧选项
const receiveFrameOptions = computed(() => receiveFramesStore.availableReceiveFrameOptions);

// 根据选择的接收帧获取可用字段选项
const getReceiveFrameFieldOptions = computed(
  () => receiveFramesStore.getAvailableFrameFieldOptions,
);

// 参数选项
const paramOptions = computed(() => {
  if (!localCommand.value?.params) return [];
  return localCommand.value.params.map((param) => ({
    id: param.id,
    label: param.label,
  }));
});

// 获取条件对应参数的所有选项
const getParamOptionsForCondition = (condition: any) => {
  if (!condition.targetParamId || !localCommand.value?.params) return [];
  const param = localCommand.value.params.find((p) => p.id === condition.targetParamId);
  return param?.options || [];
};

// 获取某个参数值对应的条件选项
const getConditionOptionForParamValue = (condition: any, paramValue: string) => {
  if (!condition.options) return null;
  // 使用索引匹配：参数选项的索引对应条件选项的索引
  const param = localCommand.value?.params?.find((p) => p.id === condition.targetParamId);
  if (!param?.options) return null;
  const paramOptionIndex = param.options.findIndex((opt) => opt.value === paramValue);
  return condition.options[paramOptionIndex];
};

// 更新某个参数值对应的条件选项
const updateConditionOptionForParamValue = (
  conditionId: string,
  paramValue: string,
  field: 'operator' | 'matchValue',
  value: any,
) => {
  const condition = localCommand.value?.completionConditions?.find((c) => c.id === conditionId);
  if (!condition || !condition.targetParamId) return;

  const param = localCommand.value?.params?.find((p) => p.id === condition.targetParamId);
  if (!param?.options) return;

  const paramOptionIndex = param.options.findIndex((opt) => opt.value === paramValue);
  if (paramOptionIndex === -1) return;

  // 确保 options 数组足够长
  if (!condition.options) {
    condition.options = [];
  }
  while (condition.options.length <= paramOptionIndex) {
    condition.options.push({
      operator: MatchOperator.EQUAL,
      matchValue: '',
    });
  }

  // 更新对应索引的选项
  if (field === 'operator') {
    condition.options[paramOptionIndex]!.operator = value;
  } else {
    condition.options[paramOptionIndex]!.matchValue = value;
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
