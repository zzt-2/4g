<script setup lang="ts">
// Tab2 右编辑区。两个独立卡片：基本信息 + 命令配置。
// 命令配置「待实现」占位本次不补功能，只做不刺眼样式（灰字 + 浅底）。
// 保存按钮在顶部 toolbar（CiToolbar 的 SCOE 组），作用于整个编辑区。
// editForm 由 page 通过 v-model 持有（保持 composable 的 watch selectedConfig 同步逻辑）。

import type { SatelliteConfig } from '@/features/command-ingress/core';

interface EditForm {
  messageIdentifier: string;
  sourceIdentifier: string;
  destinationIdentifier: string;
  modelId: string;
}

interface Props {
  config: SatelliteConfig | undefined;
  editForm: EditForm;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:editForm': [form: EditForm];
  'add-command': [];
}>();

// 局部更新 editForm 字段，单次 emit（D003 子组件单次 emit 原则）
function patchField(field: keyof EditForm, value: string): void {
  emit('update:editForm', { ...props.editForm, [field]: value });
}
</script>

<template>
  <div class="satellite-edit-panel flex-1 min-w-0 min-h-0 overflow-y-auto px-6 py-3">
    <template v-if="config">
      <!-- 卡片 1：基本信息 -->
      <section class="rw-panel-base rounded p-4 mb-4">
        <h3 class="satellite-edit-panel__card-title">基本信息</h3>
        <div class="flex flex-col gap-3">
          <q-input
            :model-value="editForm.messageIdentifier"
            dense outlined
            label="消息标识"
            :rules="[val => !!val || '请输入消息标识']"
            @update:model-value="(v: string | number | null) => patchField('messageIdentifier', String(v ?? ''))"
          />
          <q-input
            :model-value="editForm.sourceIdentifier"
            dense outlined
            label="源标识"
            :rules="[val => !!val || '请输入源标识']"
            @update:model-value="(v: string | number | null) => patchField('sourceIdentifier', String(v ?? ''))"
          />
          <q-input
            :model-value="editForm.destinationIdentifier"
            dense outlined
            label="目标标识"
            :rules="[val => !!val || '请输入目标标识']"
            @update:model-value="(v: string | number | null) => patchField('destinationIdentifier', String(v ?? ''))"
          />
          <q-input
            :model-value="editForm.modelId"
            dense outlined
            label="型号标识"
            :rules="[val => !!val || '请输入型号标识']"
            @update:model-value="(v: string | number | null) => patchField('modelId', String(v ?? ''))"
          />
        </div>
      </section>

      <!-- 卡片 2：命令配置（待实现占位保留） -->
      <section class="rw-panel-base rounded p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="satellite-edit-panel__card-title">命令配置</h3>
          <q-btn flat dense no-caps icon="o_add" label="添加命令" size="sm" color="primary" @click="emit('add-command')" />
        </div>

        <template v-if="config.commandConfigs.length > 0">
          <q-expansion-item
            v-for="cmd in config.commandConfigs"
            :key="cmd.id"
            dense
            switch-toggle-side
            :label="cmd.label || cmd.code"
            :caption="cmd.function"
            header-class="rw-text-value text-sm"
          >
            <div class="satellite-edit-panel__placeholder">
              命令详细编辑待实现（功能码: {{ cmd.code }}）
            </div>
          </q-expansion-item>
        </template>
        <div v-else class="satellite-edit-panel__placeholder text-center">暂无命令配置</div>
      </section>
    </template>

    <!-- 未选中态 -->
    <template v-else>
      <div class="rw-panel-base rounded p-8 text-center h-full flex flex-col items-center justify-center">
        <q-icon name="o_settings" size="48px" color="grey" />
        <p class="rw-text-label mt-4">请从左侧选择一个卫星配置进行编辑</p>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.satellite-edit-panel {
  &__card-title {
    color: var(--rw-color-text-primary);
    font-size: var(--rw-font-size-title-sm);
    font-weight: var(--rw-font-weight-semibold);
    line-height: var(--rw-line-height-title-sm);
    margin: 0 0 var(--rw-space-3) 0;
  }

  // 待实现占位：不刺眼（灰字 + 浅底）
  &__placeholder {
    color: var(--rw-color-text-muted);
    font-size: var(--rw-font-size-caption);
    padding: var(--rw-space-3);
    background: var(--rw-color-surface-app);
    border-radius: var(--rw-radius-control);
  }
}
</style>
