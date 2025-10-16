import { ref } from 'vue';

export interface ScoeTestData {
  timestamp: string;
  data: string;
  checksumValid?: boolean;
}

export function useScoeTestTool() {
  // 发送数据列表
  const sendDataList = ref<ScoeTestData[]>([]);

  // 接收数据列表
  const receiveDataList = ref<ScoeTestData[]>([]);

  // 最大记录行数
  const maxRecordLines = ref(30);

  // 发送是否停止
  const sendStopped = ref(false);

  // 接收是否停止
  const receiveStopped = ref(false);

  /**
   * 添加发送数据
   */
  const addSendData = (data: string) => {
    // 如果发送已停止，不记录数据
    if (sendStopped.value) {
      return;
    }
    const timestamp = new Date().toLocaleString('zh-CN', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });

    sendDataList.value.unshift({
      timestamp,
      data,
    });

    // 限制记录行数
    if (sendDataList.value.length > maxRecordLines.value) {
      sendDataList.value = sendDataList.value.slice(0, maxRecordLines.value);
    }
  };

  /**
   * 添加接收数据
   */
  const addReceiveData = (data: string, checksumValid: boolean = true) => {
    // 如果接收已停止，不记录数据
    if (receiveStopped.value) {
      return;
    }

    const timestamp = new Date().toLocaleString('zh-CN', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });

    receiveDataList.value.unshift({
      timestamp,
      data,
      checksumValid,
    });

    // 限制记录行数
    if (receiveDataList.value.length > maxRecordLines.value) {
      receiveDataList.value = receiveDataList.value.slice(0, maxRecordLines.value);
    }
  };

  /**
   * 设置最大记录行数
   */
  const setMaxRecordLines = (lines: number) => {
    if (lines < 1) {
      lines = 1;
    }
    if (lines > 10000) {
      lines = 10000;
    }
    maxRecordLines.value = lines;

    // 裁剪现有数据
    if (sendDataList.value.length > lines) {
      sendDataList.value = sendDataList.value.slice(0, lines);
    }
    if (receiveDataList.value.length > lines) {
      receiveDataList.value = receiveDataList.value.slice(0, lines);
    }
  };

  /**
   * 初始化（清空所有数据）
   */
  const initialize = () => {
    sendDataList.value = [];
    receiveDataList.value = [];
  };

  return {
    sendDataList,
    receiveDataList,
    maxRecordLines,
    sendStopped,
    receiveStopped,
    addSendData,
    addReceiveData,
    setMaxRecordLines,
    initialize,
  };
}
