<script setup lang="ts">
import { reactive, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import { useAsyncAction, useNotify } from '@/shared/composables';
import { deepClone } from '@/shared/utils/deep-clone';
import type { SettingsRecordingConfig, SettingsStorageConfig, SettingsGeneralConfig } from '@/features/settings';

const $q = useQuasar();
const notify = useNotify();
const runtime = useRewriteRuntime();
const settingsService = runtime.features.settingsService;

// ===== Business data =====
const recording = reactive<SettingsRecordingConfig>({
  autoStartRecording: false,
  csvDefaultOutputPath: '',
  csvSaveIntervalMinutes: 5,
});
const storage = reactive<SettingsStorageConfig>({
  maxHistoryHours: 24,
  enableAutoSave: true,
  enableHistoryStorage: true,
});
const general = reactive<SettingsGeneralConfig>({
  updateInterval: 1000,
});

// ===== Derived =====
const isDirty = computed(() => {
  const snapshot = settingsService.getSnapshot();
  return (
    recording.autoStartRecording !== snapshot.recording.autoStartRecording ||
    recording.csvDefaultOutputPath !== snapshot.recording.csvDefaultOutputPath ||
    recording.csvSaveIntervalMinutes !== snapshot.recording.csvSaveIntervalMinutes ||
    storage.maxHistoryHours !== snapshot.storage.maxHistoryHours ||
    storage.enableAutoSave !== snapshot.storage.enableAutoSave ||
    storage.enableHistoryStorage !== snapshot.storage.enableHistoryStorage ||
    general.updateInterval !== snapshot.general.updateInterval
  );
});

// ===== Validation =====
const csvIntervalError = computed(() => {
  const v = recording.csvSaveIntervalMinutes;
  if (!Number.isFinite(v) || v < 1) return '最小间隔为 1 分钟';
  return '';
});
const historyHoursError = computed(() => {
  const v = storage.maxHistoryHours;
  if (!Number.isFinite(v) || v < 1) return '最小保留 1 小时';
  return '';
});
const updateIntervalError = computed(() => {
  const v = general.updateInterval;
  if (!Number.isFinite(v) || v < 100) return '最小间隔为 100 毫秒';
  return '';
});
const hasValidationErrors = computed(
  () => !!csvIntervalError.value || !!historyHoursError.value || !!updateIntervalError.value,
);

// ===== Operations =====
const { execute: executeSave, isOperating: isSaving } = useAsyncAction();

function loadFromService(): void {
  const snapshot = settingsService.getSnapshot();
  Object.assign(recording, deepClone(snapshot.recording));
  Object.assign(storage, deepClone(snapshot.storage));
  Object.assign(general, deepClone(snapshot.general));
}

async function handleSave(): Promise<void> {
  await executeSave('settings-save', async () => {
    const result = settingsService.update({
      recording: { ...recording },
      storage: { ...storage },
      general: { ...general },
    });
    if (result.ok) {
      await runtime.persistence.saveSettings();
      notify.success('设置已保存');
    } else {
      const messages = result.validation.issues.map((i) => i.message).join('; ');
      notify.error('保存失败', messages);
    }
  });
}

function handleResetRecording(): void {
  $q.dialog({
    title: '确认重置',
    message: '确定要将录制设置恢复为默认值吗？',
    cancel: true,
    persistent: false,
  }).onOk(() => {
    settingsService.reset('recording');
    loadFromService();
    void runtime.persistence.saveSettings();
    notify.success('录制设置已重置');
  });
}

function handleResetStorage(): void {
  $q.dialog({
    title: '确认重置',
    message: '确定要将存储设置恢复为默认值吗？',
    cancel: true,
    persistent: false,
  }).onOk(() => {
    settingsService.reset('storage');
    loadFromService();
    void runtime.persistence.saveSettings();
    notify.success('存储设置已重置');
  });
}

function handleResetAll(): void {
  $q.dialog({
    title: '确认重置全部设置',
    message: '确定要将所有设置恢复为默认值吗？此操作不可恢复。',
    cancel: true,
    persistent: false,
  }).onOk(() => {
    settingsService.reset('all');
    loadFromService();
    void runtime.persistence.saveSettings();
    notify.success('全部设置已重置');
  });
}

onMounted(() => {
  loadFromService();
});
</script>

<template>
  <q-expansion-item
    default-opened
    label="应用设置"
    icon="settings_applications"
    header-class="settings-group__header"
  >
    <q-card class="settings-group__body q-pa-md">
      <q-form @submit.prevent="handleSave">
        <!-- Recording -->
        <div class="rw-text-label mb-2">录制</div>
        <div class="mb-3">
          <q-toggle
            v-model="recording.autoStartRecording"
            label="启动时自动开始录制"
          />
        </div>
        <div class="mb-3">
          <q-input
            v-model="recording.csvDefaultOutputPath"
            label="CSV 默认输出路径"
            dense
            outlined
            class="settings-group__field"
          />
        </div>
        <div class="mb-3">
          <q-input
            v-model.number="recording.csvSaveIntervalMinutes"
            type="number"
            label="CSV 保存间隔（分钟）"
            dense
            outlined
            min="1"
            :error="!!csvIntervalError"
            :error-message="csvIntervalError"
            class="settings-group__field"
          />
        </div>
        <div class="mb-2">
          <q-btn flat dense label="重置录制" color="warning" @click="handleResetRecording" />
        </div>

        <q-separator class="q-my-md" />

        <!-- Storage -->
        <div class="rw-text-label mb-2">存储</div>
        <div class="mb-3">
          <q-input
            v-model.number="storage.maxHistoryHours"
            type="number"
            label="历史数据保留时长（小时）"
            dense
            outlined
            min="1"
            :error="!!historyHoursError"
            :error-message="historyHoursError"
            class="settings-group__field"
          />
        </div>
        <div class="mb-3">
          <q-toggle
            v-model="storage.enableAutoSave"
            label="启用自动保存"
          />
        </div>
        <div class="mb-3">
          <q-toggle
            v-model="storage.enableHistoryStorage"
            label="启用历史存储"
          />
        </div>
        <div class="mb-2">
          <q-btn flat dense label="重置存储" color="warning" @click="handleResetStorage" />
        </div>

        <q-separator class="q-my-md" />

        <!-- General -->
        <div class="rw-text-label mb-2">通用</div>
        <div class="mb-3">
          <q-input
            v-model.number="general.updateInterval"
            type="number"
            label="数据更新间隔（毫秒）"
            dense
            outlined
            min="100"
            :error="!!updateIntervalError"
            :error-message="updateIntervalError"
            class="settings-group__field"
          />
        </div>

        <!-- Actions -->
        <div class="flex gap-2 q-mt-lg">
          <q-btn
            unelevated
            color="primary"
            label="保存设置"
            :loading="isSaving('settings-save')"
            :disable="!isDirty || hasValidationErrors"
            type="submit"
          />
          <q-btn
            flat
            label="重置全部"
            color="negative"
            @click="handleResetAll"
          />
        </div>
      </q-form>
    </q-card>
  </q-expansion-item>
</template>
