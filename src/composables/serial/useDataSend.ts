/**
 * 串口数据发送相关的组合式API
 */
import { ref, computed } from 'vue';
import { useSerialStore } from '../../stores/serialStore';
import { storeToRefs } from 'pinia';
import type { MessageFormat } from '../../types/serial';

export const useDataSend = () => {
  const serialStore = useSerialStore();

  // 从store中提取响应式状态
  const { connectionStatus, isConnecting } = storeToRefs(serialStore);

  // 本地状态
  const sendData = ref('');
  const sendFormat = ref<MessageFormat>('hex');
  const sendInterval = ref(0);
  const sendIntervalId = ref<number | null>(null);
  const isSending = ref(false);

  // 计算属性：发送按钮状态
  const sendButtonDisabled = computed(() => {
    return connectionStatus.value !== 'connected' || isConnecting.value || !sendData.value.trim();
  });

  // 发送数据
  const send = async () => {
    if (sendButtonDisabled.value) return;

    try {
      // 将数据转换为适当的格式
      await serialStore.sendData(sendData.value, sendFormat.value === 'hex');
    } catch (error) {
      console.error('发送数据失败:', error);
    }
  };

  // 开始定时发送
  const startIntervalSend = () => {
    if (sendInterval.value <= 0 || isSending.value) return;

    isSending.value = true;
    // 使用箭头函数包装异步方法，避免Promise返回警告
    sendIntervalId.value = window.setInterval(() => {
      void send(); // 使用void操作符忽略Promise
    }, sendInterval.value);
  };

  // 停止定时发送
  const stopIntervalSend = () => {
    if (sendIntervalId.value) {
      window.clearInterval(sendIntervalId.value);
      sendIntervalId.value = null;
    }
    isSending.value = false;
  };

  // 清除发送数据
  const clearSendData = () => {
    sendData.value = '';
    stopIntervalSend();
  };

  return {
    // 状态
    sendData,
    sendFormat,
    sendInterval,
    isSending,
    sendButtonDisabled,

    // 方法
    send,
    startIntervalSend,
    stopIntervalSend,
    clearSendData,
  };
};
