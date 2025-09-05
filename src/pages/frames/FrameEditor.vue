<template>
  <div class="flex flex-col h-full w-full bg-[#0a1929] text-[#e2e8f0] overflow-hidden">
    <!-- 页面头部 -->
    <FrameEditorHeader :is-new-frame="isNewFrame" :has-changes="editorStore.hasChanges"
      :is-frame-valid="editorStore.isValid" @go-back="goBack" @save="saveFrame" class="flex-shrink-0 w-full" />

    <!-- 主体内容 -->
    <div class="flex flex-1 w-full pt-3 overflow-hidden">
      <!-- 左侧面板 -->
      <div class="w-[15vw] h-full flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
        <FrameBasicInfo />
      </div>

      <!-- 主要区域 -->
      <div class="flex-1 h-full flex flex-col rounded-md bg-[#12233f] border border-[#1a3663] overflow-hidden ml-2">
        <!-- 字段编辑和列表区域 -->
        <div class="flex flex-1 max-h-[100vh] overflow-hidden">
          <!-- 字段列表组件 - 直接使用共享的 composable -->
          <FrameFieldList class="!max-w-[25%] w-[30%] border-r border-[#1a3663] bg-[#0f2744] flex-shrink-0"
            @edit-field="showFieldEditor" />

          <!-- 字段编辑区域和字段预览区域的垂直分隔 -->
          <div class="flex-1 flex flex-col overflow-hidden">
            <div class="h-full w-full border-t border-[#1a3663] p-3 flex-shrink-0">
              <FrameFieldPreview />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 字段编辑对话框 -->
    <q-dialog v-model="showFieldEditorDialog">
      <q-card class="flex flex-col no-wrap bg-[#0a1929] h-80vh" style="min-width: 60vw">
        <q-card-section class="flex justify-between items-center bg-[#12233f]">
          <div class="text-h6 text-[#93c5fd]">
            {{ fieldStore.editingFieldIndex === null ? '添加字段' : '编辑字段' }}
          </div>
        </q-card-section>

        <q-separator dark />

        <q-card-section class="q-pa-md overflow-hidden flex-grow">
          <FrameFieldEditor />
        </q-card-section>

        <q-separator dark />

        <q-card-actions align="right" class="bg-[#12233f] q-py-md space-x-6 pr-8">
          <q-btn flat label="取消" color="primary" @click="closeFieldEditor" />
          <q-btn label="保存" color="primary" @click="saveFieldAndClose" class="bg-[#3b82f6]" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFrameEditor } from '../../composables/frames/useFrameEditor';
import { useNotification } from '../../composables/frames/useNotification';

// 导入组件
import FrameEditorHeader from '../../components/frames/FrameEdit/FrameEditorHeader.vue';
import FrameBasicInfo from '../../components/frames/FrameEdit/FrameBasicInfo.vue';
import FrameFieldEditor from '../../components/frames/FrameEdit/FrameFieldEditor.vue';
import FrameFieldList from '../../components/frames/FrameEdit/FrameFieldList.vue';
import FrameFieldPreview from '../../components/frames/FrameEdit/FrameFieldPreview.vue';
import { useQuasar } from 'quasar';
import { useFrameEditorStore } from 'src/stores/framesStore';
import { useFrameFieldsStore } from 'src/stores/frames/frameFieldsStore';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const { notifySuccess, notifyError, notifyWarning } = useNotification();

// 使用组合式函数和store
const editorComposable = useFrameEditor();
const editorStore = useFrameEditorStore();
const fieldStore = useFrameFieldsStore();

// 状态
const isNewFrame = computed(() => route.query.new === 'true');
const frameId = computed(() => route.query.id as string);

// 字段编辑对话框状态
const showFieldEditorDialog = ref(false);

// 初始化编辑器
onMounted(() => {
  try {
    const id = frameId.value;
    const success = editorComposable.initEditor(isNewFrame.value ? undefined : id);

    if (!success) {
      notifyError('初始化编辑器失败');
      router.push('/frames/list');
    }
  } catch (error) {
    notifyError(`初始化失败: ${error instanceof Error ? error.message : String(error)}`);
    router.push('/frames/list');
  }
});

// 方法
const goBack = () => {
  if (editorStore.hasChanges) {
    $q.dialog({
      title: '提示',
      message: '有未保存的更改，确定要离开吗？',
      cancel: true,
      persistent: true,
      dark: true,
      class: 'bg-[#12233f]',
    }).onOk(() => {
      router.push('/frames/list');
    });
  } else {
    router.push('/frames/list');
  }
};

const saveFrame = async () => {
  try {
    // 验证帧
    if (!editorStore.isValid) {
      notifyWarning('帧配置不完整，请检查');
      return;
    }

    const savedFrame = await editorComposable.saveFrame();
    if ((savedFrame as { valid: boolean }).valid) {
      notifySuccess(`成功${isNewFrame.value ? '创建' : '更新'}帧配置`);
      router.push('/frames/list');
    } else {
      notifyError('保存失败, 错误信息: ' + (savedFrame as { errors: string[] }).errors.join(', '));
    }
  } catch (error) {
    notifyError(`保存失败: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// 显示字段编辑对话框
const showFieldEditor = (index: number | null) => {
  fieldStore.startEditField(index);
  showFieldEditorDialog.value = true;
};

// 关闭字段编辑对话框
const closeFieldEditor = () => {
  fieldStore.cancelEditField();
  showFieldEditorDialog.value = false;
};

// 保存字段并关闭对话框
const saveFieldAndClose = () => {
  // 利用FrameFieldEditor内部的保存逻辑
  const result = fieldStore.saveField();
  if (result) {
    notifySuccess(`${fieldStore.editingFieldIndex === null ? '添加' : '更新'}字段成功`);
    showFieldEditorDialog.value = false;
  } else {
    notifyError('字段验证失败，请检查字段数据');
  }
};
</script>
