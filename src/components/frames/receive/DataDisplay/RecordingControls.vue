<script setup lang="ts">
import { computed } from 'vue';
import { useDataDisplayStore } from '../../../../stores/frames/dataDisplayStore';

const dataDisplayStore = useDataDisplayStore();

// 计算属性：记录统计信息
const recordingStats = dataDisplayStore.getRecordingStats();

// 格式化运行时间
const formatRunningTime = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  }
};

// 处理开始记录
const handleStartRecording = () => {
  dataDisplayStore.startRecording();
};

// 处理停止记录
const handleStopRecording = () => {
  dataDisplayStore.stopRecording();
};
</script>

<template>
  <div class="flex items-center space-x-4">
    <!-- 记录控制按钮 -->
    <div class="flex items-center space-x-2">
      <button
        v-if="!recordingStats.isRecording"
        class="btn-industrial-primary px-3 py-1.5 text-xs rounded flex items-center space-x-1"
        @click="handleStartRecording"
      >
        <i class="q-icon notranslate material-icons text-sm">play_arrow</i>
        <span>开始记录</span>
      </button>

      <button
        v-else
        class="btn-industrial-danger px-3 py-1.5 text-xs rounded flex items-center space-x-1"
        @click="handleStopRecording"
      >
        <i class="q-icon notranslate material-icons text-sm">stop</i>
        <span>停止记录</span>
      </button>
    </div>

    <!-- 记录状态信息 -->
    <div class="flex items-center space-x-4 text-xs text-industrial-secondary">
      <!-- 记录状态指示 -->
      <div class="flex items-center space-x-1">
        <i
          :class="[
            'q-icon notranslate material-icons text-xs',
            recordingStats.isRecording ? 'text-green-400' : 'text-gray-400',
          ]"
        >
          {{ recordingStats.isRecording ? 'fiber_manual_record' : 'stop' }}
        </i>
        <span>
          {{ recordingStats.isRecording ? '记录中' : '未记录' }}
        </span>
      </div>

      <!-- 记录计数 -->
      <span v-if="recordingStats.isRecording"> 记录: {{ recordingStats.recordCount }} </span>

      <!-- 运行时间 -->
      <span v-if="recordingStats.isRecording && recordingStats.runningTime > 0">
        时长: {{ formatRunningTime(recordingStats.runningTime) }}
      </span>

      <!-- 历史数据总数 -->
      <span v-if="recordingStats.totalRecords > 0"> 历史: {{ recordingStats.totalRecords }} </span>

      <!-- CSV批次数 -->
      <span v-if="recordingStats.csvBatchCount > 0">
        批次: {{ recordingStats.csvBatchCount }}
      </span>
    </div>
  </div>
</template>
