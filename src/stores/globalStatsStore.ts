/**
 * 全局统计数据Store
 * 用于收集和管理系统运行时的各项统计数据
 */

import { defineStore } from 'pinia';
import { ref, computed, readonly } from 'vue';

export const useGlobalStatsStore = defineStore('globalStats', () => {
  // 系统统计
  const systemStats = ref({
    startTime: 0, // 启动时间戳
    uptime: 0, // 运行时间(秒)
  });

  // 通信统计
  const communicationStats = ref({
    sentPackets: 0, // 发送包数
    receivedPackets: 0, // 接收包数
    sentBytes: 0, // 发送字节数
    receivedBytes: 0, // 接收字节数
  });

  // 帧匹配统计
  const frameStats = ref({
    matchedFrames: 0, // 匹配成功的帧
    unmatchedFrames: 0, // 未匹配的帧
  });

  // 错误统计
  const errorStats = ref({
    communicationErrors: 0, // 通信错误数
    frameParseErrors: 0, // 帧解析错误数
  });

  let uptimeTimer: NodeJS.Timeout | null = null;

  // 计算属性：为表达式系统提供的统计选项
  const availableStats = computed(() => ({
    // 时间相关
    runtime: systemStats.value.uptime,

    // 通信统计
    sentPackets: communicationStats.value.sentPackets,
    receivedPackets: communicationStats.value.receivedPackets,
    totalPackets: communicationStats.value.sentPackets + communicationStats.value.receivedPackets,
    sentBytes: communicationStats.value.sentBytes,
    receivedBytes: communicationStats.value.receivedBytes,
    totalBytes: communicationStats.value.sentBytes + communicationStats.value.receivedBytes,

    // 帧匹配统计
    matchedFrames: frameStats.value.matchedFrames,
    unmatchedFrames: frameStats.value.unmatchedFrames,

    // 错误统计
    communicationErrors: errorStats.value.communicationErrors,
    frameParseErrors: errorStats.value.frameParseErrors,
    totalErrors: errorStats.value.communicationErrors + errorStats.value.frameParseErrors,
  }));

  // 初始化
  const initialize = (): void => {
    const now = Date.now();
    systemStats.value.startTime = now;

    // 启动运行时间定时器（每秒更新）
    uptimeTimer = setInterval(() => {
      systemStats.value.uptime = Math.floor((Date.now() - systemStats.value.startTime) / 1000);
    }, 1000);

    console.log('全局统计数据已初始化');
  };

  // 通信统计更新
  const incrementSentPackets = (): void => {
    communicationStats.value.sentPackets++;
  };

  const incrementReceivedPackets = (): void => {
    communicationStats.value.receivedPackets++;
  };

  const addSentBytes = (bytes: number): void => {
    communicationStats.value.sentBytes += bytes;
  };

  const addReceivedBytes = (bytes: number): void => {
    communicationStats.value.receivedBytes += bytes;
  };

  // 帧匹配统计更新
  const incrementMatchedFrames = (): void => {
    frameStats.value.matchedFrames++;
  };

  const incrementUnmatchedFrames = (): void => {
    frameStats.value.unmatchedFrames++;
  };

  // 错误统计更新
  const incrementCommunicationErrors = (): void => {
    errorStats.value.communicationErrors++;
  };

  const incrementFrameParseErrors = (): void => {
    errorStats.value.frameParseErrors++;
  };

  // 表达式系统获取统计值
  const getStatValue = (statKey: string): number => {
    return availableStats.value[statKey as keyof typeof availableStats.value] || 0;
  };

  // 重置所有统计
  const resetStats = (): void => {
    communicationStats.value = {
      sentPackets: 0,
      receivedPackets: 0,
      sentBytes: 0,
      receivedBytes: 0,
    };

    frameStats.value = {
      matchedFrames: 0,
      unmatchedFrames: 0,
    };

    errorStats.value = {
      communicationErrors: 0,
      frameParseErrors: 0,
    };

    console.log('所有统计数据已重置');
  };

  // 清理
  const cleanup = (): void => {
    if (uptimeTimer) {
      clearInterval(uptimeTimer);
      uptimeTimer = null;
    }
    console.log('全局统计数据已清理');
  };

  return {
    // 状态（只读）
    systemStats: readonly(systemStats),
    communicationStats: readonly(communicationStats),
    frameStats: readonly(frameStats),
    errorStats: readonly(errorStats),
    availableStats,

    // 方法
    initialize,
    cleanup,
    resetStats,
    getStatValue,

    // 更新方法
    incrementSentPackets,
    incrementReceivedPackets,
    addSentBytes,
    addReceivedBytes,
    incrementMatchedFrames,
    incrementUnmatchedFrames,
    incrementCommunicationErrors,
    incrementFrameParseErrors,
  };
});
