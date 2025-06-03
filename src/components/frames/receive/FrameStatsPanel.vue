<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useReceiveFramesStore } from '../../../stores/receiveFrames';
import type { ReceiveFrameStats } from '../../../types/frames/receive';

// Store
const receiveFramesStore = useReceiveFramesStore();

// 本地状态
const refreshInterval = ref<NodeJS.Timeout | null>(null);
const isAutoRefresh = ref<boolean>(true);
const refreshRate = ref<number>(1000); // 1秒刷新一次

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

// 计算属性：校验失败率
const checksumFailureRate = computed((): number => {
  if (overallStats.value.totalReceived === 0) return 0;
  return (overallStats.value.totalChecksumFailures / overallStats.value.totalReceived) * 100;
});

// 计算属性：接收速率（每秒）
const receiveRate = computed((): number => {
  // 这里应该基于时间窗口计算，暂时返回模拟值
  return Math.floor(Math.random() * 10);
});

// 计算属性：连接状态
const connectionStatus = computed((): 'connected' | 'disconnected' | 'error' => {
  // 这里应该从串口状态获取，暂时返回模拟值
  return 'connected';
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

// 方法：获取状态颜色
const getStatusColor = (status: string): string => {
  switch (status) {
    case 'connected':
      return 'green';
    case 'disconnected':
      return 'grey';
    case 'error':
      return 'red';
    default:
      return 'grey';
  }
};

// 方法：获取状态图标
const getStatusIcon = (status: string): string => {
  switch (status) {
    case 'connected':
      return 'wifi';
    case 'disconnected':
      return 'wifi_off';
    case 'error':
      return 'error';
    default:
      return 'help';
  }
};

// 方法：重置统计
const resetStats = (): void => {
  if (!confirm('确定要重置所有统计信息吗？')) return;

  receiveFramesStore.frameStats.clear();
};

// 方法：重置选中帧统计
const resetSelectedFrameStats = (): void => {
  if (!receiveFramesStore.selectedFrameId) return;
  if (!confirm('确定要重置当前帧的统计信息吗？')) return;

  receiveFramesStore.frameStats.delete(receiveFramesStore.selectedFrameId);
};

// 方法：切换自动刷新
const toggleAutoRefresh = (): void => {
  isAutoRefresh.value = !isAutoRefresh.value;

  if (isAutoRefresh.value) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
};

// 方法：开始自动刷新
const startAutoRefresh = (): void => {
  if (refreshInterval.value) return;

  refreshInterval.value = setInterval(() => {
    // 这里可以触发数据更新
    // 暂时只是为了触发响应式更新
  }, refreshRate.value);
};

// 方法：停止自动刷新
const stopAutoRefresh = (): void => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value);
    refreshInterval.value = null;
  }
};

// 生命周期
onMounted(() => {
  if (isAutoRefresh.value) {
    startAutoRefresh();
  }
});

onUnmounted(() => {
  stopAutoRefresh();
});
</script>

<template>
  <div class="h-full flex flex-col bg-industrial-secondary">
    <!-- 标题栏 - 压缩高度 -->
    <div class="p-2 border-b border-industrial">
      <div class="flex items-center justify-between mb-1">
        <h3 class="text-industrial-primary text-base font-medium">统计信息</h3>
        <div class="flex items-center space-x-1">
          <q-btn
            flat
            dense
            size="sm"
            :icon="isAutoRefresh ? 'pause' : 'play_arrow'"
            :color="isAutoRefresh ? 'orange' : 'green'"
            @click="toggleAutoRefresh"
          >
            <q-tooltip>{{ isAutoRefresh ? '暂停' : '开始' }}自动刷新</q-tooltip>
          </q-btn>

          <q-btn flat dense size="sm" icon="refresh" color="blue" @click="() => {}">
            <q-tooltip>手动刷新</q-tooltip>
          </q-btn>
        </div>
      </div>

      <div class="text-xs text-industrial-secondary">
        <span>{{ isAutoRefresh ? '自动刷新' : '已暂停' }}</span>
      </div>
    </div>

    <!-- 连接状态 - 压缩高度 -->
    <div class="p-2 border-b border-industrial">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <q-icon
            :name="getStatusIcon(connectionStatus)"
            :color="getStatusColor(connectionStatus)"
            size="16px"
          />
          <span class="text-industrial-primary text-sm font-medium">
            {{
              connectionStatus === 'connected'
                ? '已连接'
                : connectionStatus === 'disconnected'
                  ? '未连接'
                  : '连接错误'
            }}
          </span>
        </div>

        <div class="text-xs text-industrial-secondary">{{ receiveRate }}/秒</div>
      </div>
    </div>

    <!-- 统计概览 - 压缩内容 -->
    <div class="flex-1 overflow-y-auto">
      <div class="space-y-2 p-2">
        <!-- 总体统计 -->
        <div class="bg-industrial-panel rounded p-2">
          <div class="text-industrial-primary text-sm font-medium mb-2">总体统计</div>

          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="space-y-1">
              <div class="text-industrial-secondary">接收总数</div>
              <div class="text-industrial-primary font-mono">
                {{ formatNumber(overallStats.totalReceived) }}
              </div>
            </div>

            <div class="space-y-1">
              <div class="text-industrial-secondary">错误总数</div>
              <div class="text-red-400 font-mono">
                {{ formatNumber(overallStats.totalErrors) }}
              </div>
            </div>

            <div class="space-y-1">
              <div class="text-industrial-secondary">校验失败</div>
              <div class="text-orange-400 font-mono">
                {{ formatNumber(overallStats.totalChecksumFailures) }}
              </div>
            </div>

            <div class="space-y-1">
              <div class="text-industrial-secondary">活跃帧数</div>
              <div class="text-blue-400 font-mono">
                {{ overallStats.totalFrames }}
              </div>
            </div>
          </div>

          <!-- 错误率 -->
          <div class="mt-2 pt-2 border-t border-industrial-primary/20">
            <div class="flex items-center justify-between text-xs">
              <span class="text-industrial-secondary">错误率</span>
              <span :class="errorRate > 5 ? 'text-red-400' : 'text-green-400'">
                {{ errorRate.toFixed(2) }}%
              </span>
            </div>
          </div>
        </div>

        <!-- 选中帧统计 -->
        <div v-if="receiveFramesStore.selectedFrameId" class="bg-industrial-panel rounded p-2">
          <div class="flex items-center justify-between mb-2">
            <div class="text-industrial-primary text-sm font-medium">当前帧</div>
            <q-btn flat dense size="sm" icon="clear" color="red" @click="resetSelectedFrameStats">
              <q-tooltip>重置当前帧统计</q-tooltip>
            </q-btn>
          </div>

          <div v-if="selectedFrameStats" class="grid grid-cols-2 gap-2 text-xs">
            <div class="space-y-1">
              <div class="text-industrial-secondary">接收次数</div>
              <div class="text-industrial-primary font-mono">
                {{ formatNumber(selectedFrameStats.totalReceived) }}
              </div>
            </div>

            <div class="space-y-1">
              <div class="text-industrial-secondary">错误次数</div>
              <div class="text-red-400 font-mono">
                {{ selectedFrameStats.errorCount }}
              </div>
            </div>
          </div>

          <div v-else class="text-xs text-industrial-secondary text-center py-1">暂无统计数据</div>
        </div>
      </div>
    </div>

    <!-- 底部操作 - 压缩高度 -->
    <div class="p-2 border-t border-industrial bg-industrial-panel">
      <div class="flex items-center justify-between text-xs">
        <q-btn flat dense size="sm" icon="clear_all" color="red" label="重置" @click="resetStats" />

        <div class="text-industrial-secondary">{{ refreshRate / 1000 }}秒</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 使用工业主题样式，无需额外样式定义 */
</style>
