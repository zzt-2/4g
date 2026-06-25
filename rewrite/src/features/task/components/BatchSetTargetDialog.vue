<script setup lang="ts">
// 批量设置发送目标弹窗（模板批量专用，S011 从两 page 内联抽出；执行监控批量已移除）。
// 确认逻辑（applyDefaultTargetOverride + update）在父级 page，本组件只 emit confirm。

import SendTargetSelector from '@/features/send/components/SendTargetSelector.vue';
import type { ConnectionService } from '@/features/connection';

interface Props {
  modelValue: boolean;
  /** 当前选中的目标 id（v-model 风格，父级持有） */
  targetId: string | null;
  connectionService: ConnectionService;
  /** 选中项数（文案显示） */
  selectedCount: number;
}

defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:targetId': [value: string | null];
  confirm: [];
}>();
</script>

<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <q-card class="rw-dialog-md">
      <q-card-section>
        <div class="text-h6">批量设置发送目标</div>
        <div class="rw-text-desc text-caption mt-1">
          将应用到选中的 {{ selectedCount }} 个模板的<strong>默认发送目标</strong>，同时清空每个 send 步骤的单独覆盖，让所有 send 步骤统一回退到任务级。
        </div>
      </q-card-section>
      <q-card-section class="pt-0">
        <span class="rw-text-label text-xs">发送目标</span>
        <SendTargetSelector :model-value="targetId" :connection-service="connectionService" class="mt-1"
          @update:model-value="emit('update:targetId', $event)" />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat no-caps label="取消" v-close-popup />
        <q-btn unelevated no-caps color="primary" label="应用" :disable="!targetId" @click="emit('confirm')" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
