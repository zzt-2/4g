<template>
  <div class="flex gap-1">
    <q-btn
      flat
      round
      dense
      color="amber"
      :icon="frame.isFavorite ? 'star' : 'star_outline'"
      size="sm"
      @click.stop="handleAction(ACTIONS.FAVORITE)"
      class="bg-industrial-secondary hover:bg-industrial-highlight transition-colors opacity-80 hover:opacity-100"
    >
      <q-tooltip>{{ frame.isFavorite ? '取消收藏' : '收藏' }}</q-tooltip>
    </q-btn>

    <q-btn
      flat
      round
      dense
      color="primary"
      icon="edit"
      size="sm"
      @click.stop="handleAction(ACTIONS.EDIT)"
      class="bg-industrial-secondary hover:bg-industrial-highlight transition-colors opacity-80 hover:opacity-100"
    >
      <q-tooltip>编辑</q-tooltip>
    </q-btn>

    <q-btn
      flat
      round
      dense
      color="grey-6"
      icon="content_copy"
      size="sm"
      @click.stop="handleAction(ACTIONS.DUPLICATE)"
      class="bg-industrial-secondary hover:bg-industrial-highlight transition-colors opacity-80 hover:opacity-100"
    >
      <q-tooltip>复制</q-tooltip>
    </q-btn>

    <q-btn
      flat
      round
      dense
      color="negative"
      icon="delete"
      size="sm"
      @click.stop="confirmDelete"
      class="bg-industrial-secondary hover:bg-industrial-highlight transition-colors opacity-80 hover:opacity-100"
    >
      <q-tooltip>删除</q-tooltip>
    </q-btn>
  </div>
</template>

<script setup lang="ts">
import { useQuasar } from 'quasar';
import type { TableFrame } from './FrameTable.vue';

// 操作类型常量
const ACTIONS = {
  FAVORITE: 'favorite',
  EDIT: 'edit',
  DUPLICATE: 'duplicate',
  DELETE: 'delete',
} as const;

// 操作类型
type ActionType = (typeof ACTIONS)[keyof typeof ACTIONS];

const props = defineProps<{
  frame: TableFrame;
}>();

const emit = defineEmits<{
  action: [action: ActionType, frameId: string];
}>();

const $q = useQuasar();

const handleAction = (action: ActionType) => {
  emit('action', action, props.frame.id);
};

const confirmDelete = () => {
  $q.dialog({
    title: '确认删除',
    message: '确定要删除这个帧配置吗？此操作不可撤销。',
    cancel: true,
    persistent: true,
    dark: true,
    class: 'bg-industrial-panel border border-industrial',
  }).onOk(() => {
    emit('action', ACTIONS.DELETE, props.frame.id);
  });
};
</script>

<style scoped>
/* 使用工业主题样式，无需额外样式定义 */
</style>
