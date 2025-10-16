import { onBeforeMount, onUnmounted } from 'vue';
import { useReceiveFramesStore } from 'src/stores/frames/receiveFramesStore';
import { useConnectionTargetsStore } from 'src/stores/connectionTargetsStore';
import { useFrameTemplateStore, useSendFrameInstancesStore } from 'src/stores/framesStore';
import { useSerialStore } from 'src/stores/serialStore';
import { useDataDisplayStore } from 'src/stores/frames/dataDisplayStore';
import { useSettingsStore } from 'src/stores/settingsStore';
import { useGlobalStatsStore } from 'src/stores/globalStatsStore';
import { useScoeStore } from 'src/stores/scoeStore';
import { useScoeFrameInstancesStore } from 'src/stores/frames/scoeFrameInstancesStore';

/**
 * 应用生命周期 Composable
 * 处理应用的初始化和清理逻辑
 */
export function useAppLifecycle() {
  const receiveFramesStore = useReceiveFramesStore();
  const frameTemplateStore = useFrameTemplateStore();
  const sendFrameInstancesStore = useSendFrameInstancesStore();
  const serialStore = useSerialStore();
  const dataDisplayStore = useDataDisplayStore();
  const settingsStore = useSettingsStore();
  const globalStatsStore = useGlobalStatsStore();
  const scoeFrameInstancesStore = useScoeFrameInstancesStore();
  const scoeStore = useScoeStore();
  const connectionTargetsStore = useConnectionTargetsStore();

  // 清理数据项值
  const clearDataItemValues = async (): Promise<void> => {
    try {
      console.log('页面卸载，开始清理接收帧数据项值...');

      // 使用store中的清理方法
      receiveFramesStore.clearDataItemValues();

      // 保存配置
      await receiveFramesStore.saveConfig();
      console.log('接收帧数据项值已清理并保存');
    } catch (error) {
      console.error('清理接收帧数据项值失败:', error);
    }
  };

  // 应用初始化
  onBeforeMount(async () => {
    try {
      await frameTemplateStore.fetchFrames();
      await sendFrameInstancesStore.fetchInstances();
      await receiveFramesStore.loadConfig();
      await serialStore.refreshPorts();
      await connectionTargetsStore.refreshTargets(); // 刷新可用的连接目标
      sendFrameInstancesStore.resetSendStats();

      // 初始化全局统计数据
      globalStatsStore.initialize();

      // 初始化SCOE状态
      await scoeFrameInstancesStore.initialize();
      await scoeStore.initialize();

      // 启动数据收集定时器（常开模式）
      dataDisplayStore.startDataCollection();

      // 根据设置自动开始记录
      if (settingsStore.autoStartRecording && !dataDisplayStore.recordingStatus.isRecording) {
        console.log('自动开始数据记录...');
        dataDisplayStore.startRecording();
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  });

  // 应用清理
  onUnmounted(() => {
    // 停止数据记录
    if (dataDisplayStore.recordingStatus.isRecording) {
      console.log('页面卸载，停止数据记录...');
      dataDisplayStore.stopRecording();
    }

    // 停止数据收集定时器
    dataDisplayStore.stopDataCollection();

    // 清理全局统计数据
    globalStatsStore.cleanup();

    clearDataItemValues();
  });

  return {
    // 暴露store实例，以便在需要时访问
    receiveFramesStore,
    frameTemplateStore,
    sendFrameInstancesStore,
    serialStore,
    dataDisplayStore,
    settingsStore,
    globalStatsStore,
    scoeStore,
    connectionTargetsStore,
  };
}
