<template>
  <div class="flex flex-col h-full w-full bg-[#0a1929] text-[#e2e8f0] overflow-hidden">
    <!-- 页面头部 -->
    <FrameEditorHeader
      :is-new-frame="isNewFrame"
      :protocol="(currentFrame?.protocol as any) || 'custom'"
      :device-type="(currentFrame?.deviceType as any) || 'sensor'"
      :has-changes="hasChanges"
      :is-frame-valid="isFrameValid"
      @go-back="goBack"
      @save="saveFrame"
      class="flex-shrink-0 w-full"
    />

    <!-- 主体内容 -->
    <div class="flex flex-1 w-full pt-3 overflow-hidden">
      <!-- 左侧面板 -->
      <div class="w-60 h-full flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
        <FrameBasicInfo />
      </div>

      <!-- 主要区域 -->
      <div
        class="flex-1 h-full flex flex-col rounded-md bg-[#12233f] border border-[#1a3663] overflow-hidden ml-2"
      >
        <!-- 字段编辑和列表区域 -->
        <div class="flex flex-1 max-h-[100vh] overflow-hidden">
          <!-- 字段列表组件 - 直接使用共享的 composable -->
          <FrameFieldList
            class="max-w-[25%] border-r border-[#1a3663] bg-[#0f2744] flex-shrink-0"
          />

          <!-- 字段编辑区域和字段预览区域的垂直分隔 -->
          <div class="flex-1 flex flex-col overflow-hidden">
            <!-- 字段编辑区域 - 直接使用共享的 composable -->
            <FrameFieldEditor class="flex-1 overflow-y-auto" />

            <!-- 字段结构预览区域 -->
            <div class="h-100 w-full border-t border-[#1a3663] p-3 flex-shrink-0">
              <FrameFieldPreview />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFrameEditor } from '../../composables/frames/useFrameEditor';
import { useNotification } from '../../composables/frames/useNotification';

// 导入组件
import FrameEditorHeader from '../../components/frames/FrameEdit/FrameEditorHeader.vue';
import FrameBasicInfo from '../../components/frames/FrameEdit/FrameBasicInfo.vue';
import FrameFieldEditor from '../../components/frames/FrameEdit/FrameFieldEditor.vue';
import FrameFieldList from '../../components/frames/FrameEdit/FrameFieldList.vue';
import FrameFieldPreview from '../../components/frames/FrameEdit/FrameFieldPreview.vue';

const route = useRoute();
const router = useRouter();
const { notifySuccess, notifyError, notifyWarning } = useNotification();

// 使用组合式函数
const editorComposable = useFrameEditor();

// 状态
const isNewFrame = computed(() => route.query.new === 'true');
const frameId = computed(() => route.query.id as string);
const hasChanges = computed(() => editorComposable.hasChanges.value);
const isFrameValid = computed(() => editorComposable.isValid.value);

// 从 composable 获取帧数据
const currentFrame = computed(() => editorComposable.currentFrame.value);

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
  if (hasChanges.value) {
    if (confirm('有未保存的更改，确定要离开吗？')) {
      router.push('/frames/list');
    }
  } else {
    router.push('/frames/list');
  }
};

const saveFrame = async () => {
  try {
    // 验证帧
    if (!isFrameValid.value) {
      notifyWarning('帧配置不完整，请检查');
      return;
    }

    const savedFrame = await editorComposable.saveFrame();
    if (savedFrame) {
      notifySuccess(`成功${isNewFrame.value ? '创建' : '更新'}帧配置`);
      router.push('/frames/list');
    } else {
      notifyError('保存失败');
    }
  } catch (error) {
    notifyError(`保存失败: ${error instanceof Error ? error.message : String(error)}`);
  }
};
</script>
