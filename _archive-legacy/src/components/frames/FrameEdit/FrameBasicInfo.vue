<template>
  <div class="flex flex-col gap-4">
    <!-- 基本信息 -->
    <q-card class="flex flex-col flex-grow">
      <q-card-section class="q-py-sm q-pb-xs">
        <div class="card-title">基本信息</div>
      </q-card-section>

      <q-card-section v-if="!isFrameLoaded" class="text-center">
        <div class="text-secondary-color">
          <q-spinner size="xs" class="mr-1" color="primary" />
          加载帧数据中...
        </div>
      </q-card-section>

      <q-card-section v-else class="q-pt-none flex flex-col flex-grow">
        <!-- 帧名称 -->
        <q-input v-model="frameEditorStore.editorFrame.name" label="名称" dense dark outlined placeholder="输入帧配置名称"
          :rules="[(val) => !!val || '名称不能为空']" />

        <!-- 帧ID -->
        <q-input v-model="frameEditorStore.editorFrame.id" label="帧ID" dense dark outlined placeholder="输入帧ID"
          :rules="[(val) => !!val || '帧ID不能为空']" />

        <div class="flex justify-between gap-4 mb-4">
          <q-select v-model="frameEditorStore.editorFrame.direction" :options="FRAME_DIRECTION_OPTIONS" label="帧方向"
            class="flex-grow-2" dense dark outlined emit-value map-options />
          <q-checkbox v-model="frameEditorStore.editorFrame.isSCOEFrame" class="flex-grow-1" label="SCOE帧" dense dark
            outlined />
        </div>

        <!-- 描述 -->
        <q-input v-model="frameEditorStore.editorFrame.description" type="textarea" label="描述" dense outlined autogrow
          class="input-bg flex-grow" style="max-height: 28vh; overflow-y: auto" placeholder="输入帧配置描述"
          hide-bottom-space />
      </q-card-section>
    </q-card>

    <!-- 接收帧识别规则按钮 (仅当帧方向为接收时显示) -->
    <q-card v-if="frameEditorStore.editorFrame.direction === 'receive'">
      <q-card-section class="q-py-sm q-pb-xs">
        <div class="flex justify-between items-center">
          <div class="font-medium text-accent-color uppercase">帧识别规则</div>
          <q-btn color="primary" label="编辑规则" icon="edit" dense @click="showRulesDialog = true" />
        </div>
      </q-card-section>

      <q-card-section class="q-pt-none">
        <div v-if="
          !frameEditorStore.editorFrame.identifierRules ||
          frameEditorStore.editorFrame.identifierRules.length === 0
        " class="text-center py-4">
          <div class="text-secondary-color">未设置识别规则，将无法识别此类型的接收帧</div>
        </div>
        <div v-else class="text-primary-color">
          已配置 {{ frameEditorStore.editorFrame.identifierRules.length }} 条识别规则
        </div>
      </q-card-section>
    </q-card>

    <!-- 帧识别规则对话框 -->
    <q-dialog v-model="showRulesDialog" persistent>
      <q-card class="bg-darker" style="max-width: 90vw">
        <q-card-section class="flex justify-between items-center">
          <div class="text-h6 text-primary-color">帧识别规则</div>
          <q-btn flat round dense icon="close" @click="closeRulesDialog" />
        </q-card-section>

        <q-separator dark />

        <q-card-section class="q-pa-md overflow-auto">
          <FrameIdentifierRules @save="saveIdentifierRules" @cancel="closeRulesDialog" />
        </q-card-section>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  FRAME_DIRECTION_OPTIONS,
} from '../../../config/frameDefaults';
import { useFrameEditorStore } from '../../../stores/frames/frameEditorStore';
import FrameIdentifierRules from './FrameIdentifierRules.vue';
import { useQuasar } from 'quasar';

// 使用组合式函数
const frameEditorStore = useFrameEditorStore();
const showRulesDialog = ref(false);
const $q = useQuasar();

// 保存帧识别规则
const saveIdentifierRules = () => {
  // 关闭对话框
  showRulesDialog.value = false;
  // 这里可以添加保存后的其他逻辑，例如提示保存成功等
  $q.notify({
    message: '帧识别规则保存成功',
    color: 'positive',
  });
};

// 关闭规则对话框
const closeRulesDialog = () => {
  showRulesDialog.value = false;
};

// 状态检查
const isFrameLoaded = computed(() => {
  return !!frameEditorStore.editorFrame;
});

// const hasOptions = computed(() => {
//   return !!frameEditorStore.editorFrame?.options;
// });
</script>
