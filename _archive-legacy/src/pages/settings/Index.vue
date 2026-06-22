<template>
  <div class="bg-industrial-primary min-h-screen">
    <!-- 页面头部 -->
    <div class="bg-industrial-secondary border-b border-industrial px-6 py-4">
      <div class="max-w-7xl mx-auto">
        <div class="flex items-center gap-3">
          <q-icon name="settings" size="md" class="text-industrial-accent" />
          <div>
            <h1 class="text-industrial-primary text-xl font-medium">系统设置</h1>
            <p class="text-industrial-tertiary text-sm">配置系统功能和应用选项</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 主要内容区域 -->
    <div class="max-w-7xl mx-auto p-6">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- 左列：数据设置 -->
        <div class="space-y-6">
          <!-- 数据记录设置 -->
          <div class="bg-industrial-panel border border-industrial rounded-lg overflow-hidden">
            <div class="bg-industrial-secondary px-4 py-3 border-b border-industrial">
              <h2 class="text-industrial-primary text-base font-medium flex items-center gap-2">
                <q-icon name="fiber_smart_record" size="sm" class="text-industrial-accent" />
                数据记录设置
              </h2>
            </div>

            <div class="p-4 space-y-4">
              <!-- 自动开始记录 -->
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <div class="text-sm text-industrial-primary font-medium">自动开始记录</div>
                  <div class="text-xs text-industrial-tertiary mt-1">
                    应用启动时自动开始数据记录
                  </div>
                </div>
                <q-toggle
                  v-model="settingsStore.autoStartRecording"
                  color="primary"
                  size="md"
                  class="ml-4"
                />
              </div>

              <!-- 保存间隔设置 -->
              <div class="space-y-3">
                <div class="flex items-center gap-3">
                  <div class="flex-1">
                    <label class="text-sm text-industrial-primary font-medium"
                      >历史数据保存间隔</label
                    >
                    <div class="text-xs text-industrial-tertiary mt-1">
                      设置历史数据文件的保存频率(可以是小数)
                    </div>
                  </div>
                  <q-input
                    v-model.number="settingsStore.csvSaveInterval"
                    dense
                    outlined
                    class="w-20"
                    input-class="text-industrial-primary text-center"
                  />
                  <span class="text-sm text-industrial-secondary">分钟</span>
                </div>
              </div>
            </div>
          </div>

          <!-- CSV导出设置 -->
          <div class="bg-industrial-panel border border-industrial rounded-lg overflow-hidden">
            <div class="bg-industrial-secondary px-4 py-3 border-b border-industrial">
              <h2 class="text-industrial-primary text-base font-medium flex items-center gap-2">
                <q-icon name="file_download" size="sm" class="text-industrial-accent" />
                CSV导出设置
              </h2>
            </div>

            <div class="p-4 space-y-4">
              <!-- 默认输出路径 -->
              <div class="space-y-3">
                <div>
                  <label class="text-sm text-industrial-primary font-medium">默认导出路径</label>
                  <div class="text-xs text-industrial-tertiary mt-1">设置CSV文件的默认保存位置</div>
                </div>
                <div class="flex gap-2">
                  <q-input
                    v-model="settingsStore.csvDefaultOutputPath"
                    placeholder="留空使用系统默认路径"
                    dense
                    outlined
                    class="flex-1"
                    input-class="text-industrial-primary"
                    style="background-color: rgba(15, 39, 68, 0.5)"
                  >
                    <template #prepend>
                      <q-icon name="folder" class="text-industrial-tertiary" />
                    </template>
                  </q-input>
                  <q-btn
                    unelevated
                    icon="folder_open"
                    class="btn-industrial-secondary"
                    @click="selectOutputDirectory"
                  >
                    <q-tooltip>选择文件夹</q-tooltip>
                  </q-btn>
                </div>
                <div class="text-xs text-industrial-tertiary">留空将使用系统默认的下载文件夹</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右列：系统设置 -->
        <div class="space-y-6">
          <!-- 状态指示灯配置 -->
          <div class="bg-industrial-panel border border-industrial rounded-lg overflow-hidden">
            <div class="bg-industrial-secondary px-4 py-3 border-b border-industrial">
              <h2 class="text-industrial-primary text-base font-medium flex items-center gap-2">
                <q-icon name="lightbulb" size="sm" class="text-industrial-accent" />
                状态指示灯
              </h2>
            </div>

            <div class="p-4 space-y-4">
              <!-- 启用状态指示灯 -->
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <div class="text-sm text-industrial-primary font-medium">启用状态指示灯</div>
                  <div class="text-xs text-industrial-tertiary mt-1">开启硬件状态指示灯功能</div>
                </div>
                <q-toggle
                  v-model="statusStore.settings.isEnabled"
                  color="primary"
                  size="md"
                  class="ml-4"
                />
              </div>

              <!-- 配置按钮 -->
              <div class="pt-2">
                <q-btn
                  unelevated
                  label="配置状态指示灯"
                  icon="settings"
                  class="btn-industrial-primary w-full"
                  @click="showConfigDialog = true"
                />
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="bg-industrial-panel border border-industrial rounded-lg overflow-hidden">
            <div class="bg-industrial-secondary px-4 py-3 border-b border-industrial">
              <h2 class="text-industrial-primary text-base font-medium flex items-center gap-2">
                <q-icon name="build" size="sm" class="text-industrial-accent" />
                系统操作
              </h2>
            </div>

            <div class="p-4 space-y-3">
              <q-btn
                unelevated
                label="重置所有设置"
                icon="refresh"
                class="btn-industrial-secondary w-full"
                @click="resetAllSettings"
              />
              <q-btn
                unelevated
                label="导出设置"
                icon="file_download"
                class="btn-industrial-secondary w-full"
                @click="exportSettings"
              />
              <q-btn
                unelevated
                label="导入设置"
                icon="file_upload"
                class="btn-industrial-secondary w-full"
                @click="importSettings"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 状态指示灯配置对话框 -->
    <StatusIndicatorConfigDialog v-model="showConfigDialog" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useQuasar } from 'quasar';
import { useStatusIndicatorStore } from '../../stores/statusIndicators';
import { useSettingsStore } from '../../stores/settingsStore';
import StatusIndicatorConfigDialog from '../../components/common/StatusIndicatorConfigDialog.vue';

// Stores
const statusStore = useStatusIndicatorStore();
const settingsStore = useSettingsStore();

// 本地状态
const showConfigDialog = ref(false);

const $q = useQuasar();

// 选择输出目录
const selectOutputDirectory = (): void => {
  $q.notify({
    type: 'info',
    message: '文件夹选择功能待实现',
    caption: '目前请手动输入路径',
    position: 'top',
  });
};

// 重置所有设置
const resetAllSettings = (): void => {
  $q.dialog({
    title: '重置设置',
    message: '确定要重置所有设置到默认值吗？此操作不可撤销。',
    cancel: true,
    persistent: true,
  }).onOk(() => {
    settingsStore.autoStartRecording = true;
    settingsStore.csvDefaultOutputPath = '';
    settingsStore.csvSaveInterval = 5;

    $q.notify({
      type: 'positive',
      message: '设置已重置',
      position: 'top',
    });
  });
};

// 导出设置
const exportSettings = (): void => {
  $q.notify({
    type: 'info',
    message: '导出设置功能待实现',
    position: 'top',
  });
};

// 导入设置
const importSettings = (): void => {
  $q.notify({
    type: 'info',
    message: '导入设置功能待实现',
    position: 'top',
  });
};
</script>

<style scoped>
/* 工业主题样式已通过预定义CSS类应用 */
</style>
