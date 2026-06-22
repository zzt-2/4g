<script setup lang="ts">
// 批量设置发送目标弹窗（两页共用，S011 从两 page 内联抽出）。
// scope 控制文案差异：template → 「应用到选中模板的默认发送目标」；
//                       task     → 「应用到选中任务的默认发送目标（仅待启动状态可修改）」。
// 确认逻辑（applyDefaultTargetOverride + update）在父级 page，本组件只 emit confirm。

import SendTargetSelector from '@/features/send/components/SendTargetSelector.vue';
import type { ConnectionService } from '@/features/connection';

type Scope = 'template' | 'task';

interface Props {
  modelValue: boolean;
  /** 当前选中的目标 id（v-model 风格，父级持有） */
  targetId: string | null;
  connectionService: ConnectionService;
  /** 选中项数（文案显示） */
  selectedCount: number;
  /** 作用域：模板 / 任务（影响文案） */
  scope: Scope;
  /** task scope 专属：被跳过的非待启动任务数（仅 scope=task 时有意义） */
  skippedCount?: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:targetId': [value: string | null];
  confirm: [];
}>();

const isTaskScope = (): boolean => props.scope === 'task';
</script>

<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <q-card class="rw-dialog-md">
      <q-card-section>
        <div class="text-h6">批量设置发送目标</div>
        <div class="rw-text-desc text-caption mt-1">
          <template v-if="isTaskScope()">
            将应用到选中任务的<strong>默认发送目标</strong>，同时清空每个 send 步骤的单独覆盖，让所有 send 步骤统一回退到任务级。<br />
            <span class="text-warning">仅"待启动"状态的任务会被修改，其它状态自动跳过。</span>
          </template>
          <template v-else>
            将应用到选中的 {{ selectedCount }} 个模板的<strong>默认发送目标</strong>，同时清空每个 send 步骤的单独覆盖，让所有 send 步骤统一回退到任务级。
          </template>
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
