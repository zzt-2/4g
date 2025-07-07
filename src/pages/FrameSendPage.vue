<script setup lang="ts">
import { ref, computed } from 'vue';
import { useFrameTemplateStore } from '../stores/frames/frameTemplateStore';
import { useSendFrameInstancesStore } from '../stores/frames/sendFrameInstancesStore';

import { useUnifiedSender } from '../composables/frames/sendFrame/useUnifiedSender';
import FrameFormatList from '../components/frames/FrameSend/FrameFormatList.vue';
import FrameInstanceList from '../components/frames/FrameSend/FrameInstanceList.vue';
import FrameInstanceEditor from '../components/frames/FrameSend/FrameInstanceEditor.vue';
import FramePreview from '../components/frames/FrameSend/FramePreview.vue';
import SendTargetSelector from '../components/frames/FrameSend/SendTargetSelector.vue';
import TimedSendDialog from '../components/frames/FrameSend/TimedSend/TimedSendDialog.vue';
import TriggerSendDialog from '../components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue';
import EnhancedSequentialSendDialog from '../components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue';
import ActiveTasksMonitor from '../components/frames/FrameSend/ActiveTasksMonitor.vue';
import ImportExportActions from '../components/common/ImportExportActions.vue';
import { useStorage } from '@vueuse/core';
// 导入将在稍后实现
// import { frameToBuffer } from '../utils/frameUtils';

// 获取Store实例
const frameTemplateStore = useFrameTemplateStore();
const sendFrameInstancesStore = useSendFrameInstancesStore();

// 使用连接目标组合式函数，为此页面指定唯一的存储键
const selectedTargetId = useStorage<string>('sendTargetId', '');

// 使用统一发送器
const { sendFrameInstance, isTargetAvailable } = useUnifiedSender();

// 本地UI状态
const searchQuery = ref('');
const isSending = ref(false);
const sendError = ref('');
const sortEnabled = ref(false);

// 对话框状态
const showTimedSendDialog = ref(false);
const showTriggerSendDialog = ref(false);
const showSequentialSendDialog = ref(false);
const showTaskMonitorDialog = ref(false);

// 筛选查询的帧模板
const filteredTemplates = computed(() => {
  const frames = frameTemplateStore.frames.filter((frame) => frame.direction === 'send');
  if (!searchQuery.value) return frames;

  const query = searchQuery.value.toLowerCase();
  return frames.filter(
    (frame) =>
      frame.id.toLowerCase().includes(query) ||
      frame.name.toLowerCase().includes(query) ||
      (frame.description && frame.description.toLowerCase().includes(query)),
  );
});

// 是否可以发送当前实例
const canSendInstance = computed(() => {
  const hasInstance = sendFrameInstancesStore.currentInstance !== null;
  const hasTarget = !!selectedTargetId.value;
  return hasInstance && hasTarget && !isSending.value;
});

// 关闭编辑对话框
function closeEditorDialog() {
  sendFrameInstancesStore.showEditorDialog = false;
  // 如果是新创建的实例但未保存，则删除它
  if (sendFrameInstancesStore.isCreatingNewInstance && sendFrameInstancesStore.currentInstanceId) {
    sendFrameInstancesStore.deleteInstance(sendFrameInstancesStore.currentInstanceId);
    sendFrameInstancesStore.setCurrentInstance(null);
  }
  sendFrameInstancesStore.isCreatingNewInstance = false;
}

// 保存编辑对话框
async function saveEditorDialog() {
  console.log('保存编辑对话框');

  try {
    // 使用store中的保存方法
    const result = await sendFrameInstancesStore.saveEditedInstance();
    if (result) {
      console.log('实例保存成功!');
      // 关闭对话框
      sendFrameInstancesStore.showEditorDialog = false;
      sendFrameInstancesStore.isCreatingNewInstance = false;
    } else {
      console.warn('保存实例失败');
    }
  } catch (error) {
    console.error('保存实例失败:', error);
  }
}

// 发送当前帧实例
async function sendCurrentInstance() {
  if (!sendFrameInstancesStore.currentInstance || isSending.value || !selectedTargetId.value)
    return;

  isSending.value = true;
  sendError.value = '';

  try {
    console.log(
      '准备发送帧实例:',
      sendFrameInstancesStore.currentInstance,
      '到目标:',
      selectedTargetId.value,
    );

    // 检查目标是否可用
    const available = await isTargetAvailable(selectedTargetId.value);
    if (!available) {
      throw new Error('目标连接不可用，请检查连接状态');
    }

    // 使用统一发送器发送帧实例
    const result = await sendFrameInstance(
      selectedTargetId.value,
      sendFrameInstancesStore.currentInstance,
    );

    if (!result.success) {
      throw new Error(result.error || '帧发送失败');
    }

    console.log('帧发送完成:', result.message || '发送成功');
  } catch (err) {
    console.error('发送帧错误:', err);
    sendError.value = err instanceof Error ? err.message : '发送失败';
  } finally {
    isSending.value = false;
  }
}

// 打开定时发送对话框
function openTimedSendDialog() {
  if (!sendFrameInstancesStore.currentInstance) return;
  showTimedSendDialog.value = true;
}

// 关闭定时发送对话框
function closeTimedSendDialog() {
  showTimedSendDialog.value = false;
}

// 打开触发发送对话框
function openTriggerSendDialog() {
  if (!sendFrameInstancesStore.currentInstance) return;
  showTriggerSendDialog.value = true;
}

// 关闭触发发送对话框
function closeTriggerSendDialog() {
  showTriggerSendDialog.value = false;
}

// 打开顺序发送对话框
function openSequentialSendDialog() {
  showSequentialSendDialog.value = true;
}

// 关闭顺序发送对话框
function closeSequentialSendDialog() {
  showSequentialSendDialog.value = false;
}

// 打开任务监控对话框
function openTaskMonitorDialog() {
  showTaskMonitorDialog.value = true;
}

// 关闭任务监控对话框
function closeTaskMonitorDialog() {
  showTaskMonitorDialog.value = false;
}

// 数据处理函数
const handleGetInstancesData = () => {
  return sendFrameInstancesStore.instances;
};

// 切换排序模式
async function toggleSortMode() {
  // 如果当前是排序模式，退出时需要保存
  if (sortEnabled.value) {
    try {
      // 导入dataStorageAPI
      const { dataStorageAPI } = await import('../api/common');

      // 保存实例列表
      const result = await dataStorageAPI.sendInstances.saveAll(sendFrameInstancesStore.instances);
      if (result.success) {
        console.log('实例排序已保存');
      } else {
        console.error('保存实例排序失败:', result.message);
      }
    } catch (error) {
      console.error('保存实例排序失败:', error);
    }
  }

  sortEnabled.value = !sortEnabled.value;
}

const handleSetInstancesData = async (data: unknown) => {
  await sendFrameInstancesStore.importFromJSON(JSON.stringify(data));
};
</script>

<template>
  <q-page class="p-4 h-full overflow-hidden bg-industrial-primary flex flex-col">
    <!-- 上部分：主要工作区域（3列布局） -->
    <div class="grid grid-cols-[240px_1fr_300px] gap-4 flex-1 min-h-0">
      <!-- 左侧帧格式列表 -->
      <div
        class="flex flex-col rounded-lg overflow-hidden border border-solid border-industrial bg-industrial-panel shadow-lg"
      >
        <div
          class="flex justify-between items-center p-3 border-b border-solid border-industrial bg-industrial-table-header"
        >
          <q-input
            v-model="searchQuery"
            dense
            placeholder="搜索帧格式..."
            outlined
            class="w-full mt-2 bg-industrial-secondary"
            dark
            bg-color="rgba(16, 24, 40, 0.6)"
          >
            <template #append>
              <q-icon name="search" class="text-blue-grey-6" />
            </template>
          </q-input>
        </div>
        <div class="flex-1 overflow-auto">
          <FrameFormatList :frames="filteredTemplates" />
        </div>
      </div>

      <!-- 中间发送实例列表 -->
      <div
        class="flex flex-col rounded-lg overflow-hidden border border-solid border-industrial bg-industrial-panel shadow-lg w-full"
      >
        <div
          class="flex justify-between items-center p-3 border-b border-solid border-industrial bg-industrial-table-header"
        >
          <div class="flex items-center">
            <h6
              class="m-0 text-sm font-medium uppercase tracking-wider text-industrial-primary flex items-center"
            >
              <q-icon name="list_alt" size="xs" class="mr-1 text-blue-5" />
              所有发送实例
            </h6>

            <!-- 任务监控按钮 -->
            <q-btn
              flat
              dense
              round
              color="blue-grey-6"
              icon="task_alt"
              class="ml-2"
              @click="openTaskMonitorDialog"
            >
              <q-tooltip>任务监控</q-tooltip>
            </q-btn>

            <!-- 顺序发送按钮 -->
            <q-btn
              flat
              dense
              round
              color="blue-grey-6"
              icon="queue_play_next"
              class="ml-2"
              @click="openSequentialSendDialog"
            >
              <q-tooltip>顺序发送</q-tooltip>
            </q-btn>
          </div>

          <!-- 实例操作按钮组 -->
          <div class="flex items-center gap-2">
            <!-- 导入导出按钮 -->
            <ImportExportActions
              :getData="handleGetInstancesData"
              :setData="handleSetInstancesData"
              storageDir="data/frames/sendInstances"
              exportTitle="导出帧实例配置"
              importTitle="导入帧实例配置"
            />

            <!-- 排序按钮 -->
            <q-btn
              flat
              dense
              :icon="sortEnabled ? 'done' : 'sort'"
              size="sm"
              :color="sortEnabled ? 'positive' : 'blue-4'"
              class="rounded-md hover:bg-blue-900 hover:bg-opacity-30"
              @click="toggleSortMode"
            >
              <q-tooltip>{{ sortEnabled ? '完成排序' : '启用排序' }}</q-tooltip>
            </q-btn>

            <!-- 批量编辑按钮 -->
            <q-btn
              flat
              dense
              icon="edit_note"
              size="sm"
              disable
              class="rounded-md text-blue-400 hover:bg-blue-900 hover:bg-opacity-30"
            >
              <q-tooltip>批量编辑（暂未实现）</q-tooltip>
            </q-btn>
          </div>
        </div>
        <div class="flex-1 overflow-auto w-full">
          <FrameInstanceList
            class="w-full h-full"
            :sort-enabled="sortEnabled"
            @toggle-sort="toggleSortMode"
          />
        </div>
      </div>

      <!-- 右侧帧预览组件 -->
      <div
        class="flex flex-col rounded-lg overflow-hidden border border-solid border-industrial bg-industrial-panel shadow-lg"
      >
        <div
          class="flex justify-between items-center p-3 border-b border-solid border-industrial bg-industrial-table-header"
        >
          <h6
            class="m-0 text-sm font-medium uppercase tracking-wider text-industrial-primary flex items-center"
          >
            <q-icon name="visibility" size="xs" class="mr-1 text-blue-5" />
            帧预览
          </h6>

          <!-- 高级发送选项 -->
          <div class="flex items-center" v-if="sendFrameInstancesStore.currentInstance">
            <q-btn
              flat
              dense
              round
              color="blue-grey-6"
              icon="schedule"
              class="mr-1"
              @click="openTimedSendDialog"
            >
              <q-tooltip>定时发送</q-tooltip>
            </q-btn>
            <q-btn
              flat
              dense
              round
              color="blue-grey-6"
              icon="sensors"
              @click="openTriggerSendDialog"
            >
              <q-tooltip>触发发送</q-tooltip>
            </q-btn>
          </div>
        </div>
        <div class="flex-1 overflow-auto flex flex-col">
          <FramePreview />
        </div>

        <!-- 发送按钮区域 -->
        <div
          class="p-3 bg-industrial-secondary border-t border-solid border-industrial"
          v-if="sendFrameInstancesStore.currentInstance"
        >
          <div class="flex flex-col">
            <!-- 错误提示 -->
            <div class="mb-2 text-center" v-if="sendError">
              <div
                class="inline-block bg-industrial-table-header text-red-6 text-xs py-1 px-2 rounded shadow-md"
              >
                {{ sendError }}
              </div>
            </div>

            <!-- 发送目标与按钮 -->
            <div class="flex gap-2 items-center">
              <SendTargetSelector v-model="selectedTargetId" :disabled="isSending" class="flex-1" />

              <q-btn
                color="primary"
                icon="send"
                :label="isSending ? '发送中...' : '发送帧'"
                :loading="isSending"
                :disable="!canSendInstance"
                @click="sendCurrentInstance"
                class="flex-none"
              >
                <template #loading>
                  <q-spinner-dots />
                </template>
              </q-btn>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 帧编辑对话框 -->
    <q-dialog v-model="sendFrameInstancesStore.showEditorDialog" persistent>
      <q-card style="width: 80vw; max-width: 90vw">
        <q-card-section class="overflow-auto p-0 bg-industrial-panel" style="max-height: 80vh">
          <FrameInstanceEditor />
        </q-card-section>

        <q-separator dark color="#2A2F45" />

        <q-card-actions align="right" class="bg-industrial-table-header py-2 px-4 rounded-b-lg">
          <q-btn
            flat
            label="取消"
            color="blue-grey"
            class="rounded-md px-4 bg-industrial-secondary bg-opacity-60 hover:bg-opacity-100"
            v-close-popup
            @click="closeEditorDialog"
          />
          <q-btn
            flat
            label="保存"
            color="primary"
            class="rounded-md px-4 ml-2 bg-blue-800 bg-opacity-40 hover:bg-opacity-70"
            @click="saveEditorDialog"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- 定时发送对话框 -->
    <q-dialog v-model="showTimedSendDialog" persistent>
      <q-card class="bg-industrial-secondary rounded-lg shadow-2xl border border-industrial">
        <TimedSendDialog
          :instance-id="sendFrameInstancesStore.currentInstanceId || ''"
          @close="closeTimedSendDialog"
          class="h-full w-full"
        />
      </q-card>
    </q-dialog>

    <!-- 触发发送对话框 -->
    <q-dialog v-model="showTriggerSendDialog" persistent>
      <q-card class="bg-industrial-secondary rounded-lg shadow-2xl border border-industrial">
        <TriggerSendDialog
          :instance-id="sendFrameInstancesStore.currentInstanceId || ''"
          @close="closeTriggerSendDialog"
          class="h-full w-full"
        />
      </q-card>
    </q-dialog>

    <!-- 顺序发送对话框 -->
    <q-dialog v-model="showSequentialSendDialog" persistent full-height>
      <q-card
        style="max-width: 80vw"
        class="bg-industrial-secondary rounded-lg shadow-2xl border border-industrial"
      >
        <EnhancedSequentialSendDialog @close="closeSequentialSendDialog" class="h-full w-full" />
      </q-card>
    </q-dialog>

    <!-- 任务监控对话框 -->
    <ActiveTasksMonitor
      v-model="showTaskMonitorDialog"
      :show-filters="true"
      @close="closeTaskMonitorDialog"
    />
  </q-page>
</template>

<style>
/* 使用UnoCSS，移除SCSS样式 */
.invisible {
  visibility: hidden;
}
.visible {
  visibility: visible;
  animation: fadeIn 0.3s ease;
}
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* 对话框样式 */
.frame-editor-dialog,
.timed-send-dialog,
.trigger-send-dialog,
.sequential-send-dialog {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
