<script setup lang="ts">
import { computed } from 'vue';
import { useReceiveFramesStore } from '../../../stores/frames/receiveFramesStore';
import type { ReceiveFrameStats } from '../../../types/frames/receive';
import FrameStructureViewer from 'src/components/frames/receive/FrameStructureViewer.vue';
import { useDataDisplayStore } from '../../../stores/frames/dataDisplayStore';
import { formatDuration } from '../../../utils/common/dateUtils';

// Store
const receiveFramesStore = useReceiveFramesStore();
const dataDisplayStore = useDataDisplayStore();

// 计算属性：记录统计信息
const recordingStats = dataDisplayStore.getRecordingStats();

// 计算属性：选中帧的统计信息
const selectedFrameStats = computed((): ReceiveFrameStats | null => {
  if (!receiveFramesStore.selectedFrameId) return null;
  return receiveFramesStore.frameStats.get(receiveFramesStore.selectedFrameId) || null;
});

// 计算属性：所有帧的统计汇总
const overallStats = computed(() => {
  const stats = Array.from(receiveFramesStore.frameStats.values());

  return {
    totalFrames: stats.length,
    totalReceived: stats.reduce((sum, stat) => sum + stat.totalReceived, 0),
    totalErrors: stats.reduce((sum, stat) => sum + stat.errorCount, 0),
    totalChecksumFailures: stats.reduce((sum, stat) => sum + stat.checksumFailures, 0),
    lastReceiveTime:
      stats.length > 0
        ? new Date(Math.max(...stats.map((s) => s.lastReceiveTime.getTime())))
        : null,
  };
});

// 计算属性：错误率
const errorRate = computed((): number => {
  if (overallStats.value.totalReceived === 0) return 0;
  return (overallStats.value.totalErrors / overallStats.value.totalReceived) * 100;
});

// 方法：格式化时间差
const formatTimeDiff = (date: Date | null): string => {
  if (!date) return '从未';

  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return `${seconds}秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
  return `${Math.floor(seconds / 86400)}天前`;
};

// 方法：格式化数字
const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

// 方法：重置统计
const resetStats = (): void => {
  if (!confirm('确定要重置所有统计信息吗？')) return;

  receiveFramesStore.frameStats.clear();
  receiveFramesStore.groups.forEach((group) => {
    group.dataItems.forEach((item) => {
      item.value = null;
      item.displayValue = '';
    });
  });
};

// 方法：重置选中帧统计
const resetSelectedFrameStats = (): void => {
  if (!receiveFramesStore.selectedFrameId) return;
  if (!confirm('确定要重置当前帧的统计信息吗？')) return;

  receiveFramesStore.frameStats.delete(receiveFramesStore.selectedFrameId);
};
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- 标题栏 -->
    <div
      class="flex justify-between items-center p-3 border-b border-solid border-industrial bg-industrial-table-header"
    >
      <h6
        class="m-0 text-sm font-medium uppercase tracking-wider text-industrial-primary flex items-center"
      >
        <q-icon name="analytics" size="xs" class="mr-1 text-blue-5" />
        统计信息
      </h6>
    </div>

    <!-- 统计概览 -->
    <div class="flex-1 overflow-y-auto bg-industrial-secondary">
      <div class="flex flex-col h-full">
        <div class="flex-1 space-y-3 p-3">
          <!-- 总体统计 -->
          <div class="bg-industrial-panel rounded-lg p-3 border border-industrial">
            <div class="text-industrial-primary text-sm font-medium mb-3">总体统计</div>

            <div class="grid grid-cols-2 gap-3 text-xs">
              <div class="space-y-1">
                <div class="text-industrial-secondary">接收总数</div>
                <div class="text-industrial-primary font-mono text-lg">
                  {{ formatNumber(overallStats.totalReceived) }}
                </div>
              </div>

              <div class="space-y-1">
                <div class="text-industrial-secondary">错误总数</div>
                <div class="text-red-400 font-mono text-lg">
                  {{ formatNumber(overallStats.totalErrors) }}
                </div>
              </div>

              <div class="space-y-1">
                <div class="text-industrial-secondary">校验失败</div>
                <div class="text-orange-400 font-mono text-lg">
                  {{ formatNumber(overallStats.totalChecksumFailures) }}
                </div>
              </div>

              <div class="space-y-1">
                <div class="text-industrial-secondary">活跃帧数</div>
                <div class="text-blue-400 font-mono text-lg">
                  {{ overallStats.totalFrames }}
                </div>
              </div>
            </div>

            <!-- 错误率 -->
            <div class="mt-3 pt-3 border-t border-industrial">
              <div class="flex items-center justify-between text-xs">
                <span class="text-industrial-secondary">错误率</span>
                <span :class="errorRate > 5 ? 'text-red-400' : 'text-green-400'" class="font-mono">
                  {{ errorRate.toFixed(2) }}%
                </span>
              </div>
            </div>
          </div>

          <!-- 选中帧统计 -->
          <div
            v-if="receiveFramesStore.selectedFrameId"
            class="bg-industrial-panel rounded-lg p-3 border border-industrial"
          >
            <div class="flex items-center justify-between mb-3">
              <div class="text-industrial-primary text-sm font-medium">当前帧统计</div>
              <q-btn
                flat
                dense
                round
                size="sm"
                icon="clear"
                color="red"
                @click="resetSelectedFrameStats"
              >
                <q-tooltip>重置当前帧统计</q-tooltip>
              </q-btn>
            </div>

            <div v-if="selectedFrameStats" class="grid grid-cols-2 gap-3 text-xs">
              <div class="space-y-1">
                <div class="text-industrial-secondary">接收次数</div>
                <div class="text-industrial-primary font-mono text-lg">
                  {{ formatNumber(selectedFrameStats.totalReceived) }}
                </div>
              </div>

              <div class="space-y-1">
                <div class="text-industrial-secondary">错误次数</div>
                <div class="text-red-400 font-mono text-lg">
                  {{ selectedFrameStats.errorCount }}
                </div>
              </div>

              <div class="col-span-2 space-y-1">
                <div class="text-industrial-secondary">最后接收</div>
                <div class="text-industrial-secondary text-xs">
                  {{ formatTimeDiff(selectedFrameStats.lastReceiveTime) }}
                </div>
              </div>
            </div>

            <div v-else class="text-xs text-industrial-secondary text-center py-4">
              暂无统计数据
            </div>
          </div>

          <div class="overflow-hidden bg-industrial-panel">
            <FrameStructureViewer />
          </div>
          <!-- 记录控制区域 -->
          <div class="flex-shrink-0 p-3 border-t border-industrial bg-industrial-panel">
            <div class="space-y-3">
              <!-- 记录状态显示 -->
              <div v-if="recordingStats.isRecording" class="text-xs">
                <div class="flex items-center space-x-2 mb-2">
                  <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span class="text-green-400 font-medium">正在记录数据</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-industrial-secondary">
                  <div>运行时间: {{ formatDuration(recordingStats.runningTime) }}</div>
                  <div>记录数: {{ recordingStats.recordCount }}</div>
                </div>
              </div>

              <!-- 记录控制按钮 -->
              <div class="flex items-center justify-center gap-2">
                <q-btn
                  v-if="!recordingStats.isRecording"
                  flat
                  dense
                  size="sm"
                  icon="play_arrow"
                  color="green"
                  label="开始记录"
                  @click="dataDisplayStore.startRecording()"
                  class="text-xs"
                />
                <q-btn
                  v-else
                  flat
                  dense
                  size="sm"
                  icon="stop"
                  color="red"
                  label="停止记录"
                  @click="dataDisplayStore.stopRecording()"
                  class="text-xs"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部操作 -->
    <div class="p-3 border-t border-industrial bg-industrial-table-header">
      <div class="flex items-center justify-center">
        <q-btn
          flat
          dense
          size="sm"
          icon="clear_all"
          color="red"
          label="重置统计"
          @click="resetStats"
          class="text-xs"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 使用工业主题样式，无需额外样式定义 */
</style>
