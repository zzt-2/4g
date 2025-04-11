/**
 * 串口数据相关的组合式API
 */
import { ref } from 'vue';
import { useSerialStore } from '../../stores/serialStore';
import { storeToRefs } from 'pinia';
import { formatTimestamp } from '../../utils/dateUtils';

// 定义监控数据项接口
export interface MonitorDataItem {
  timestamp: number;
  direction: 'rx' | 'tx';
  hexData: string;
  asciiData: string;
  utf8Data: string;
  rawData: Uint8Array;
}

export const useSerialData = () => {
  const serialStore = useSerialStore();

  // 从store中提取响应式状态
  const { isConnected, lastError } = storeToRefs(serialStore);

  // 本地状态
  const monitorData = ref<MonitorDataItem[]>([]);
  const maxBufferSize = ref(1000); // 最大缓冲区大小

  // 清除监控数据
  const clearMonitorData = () => {
    monitorData.value = [];
  };

  // 保存监控数据
  const saveMonitorData = (displayMode: 'hex' | 'ascii' | 'utf8' = 'hex') => {
    if (monitorData.value.length === 0) return;

    try {
      const content = monitorData.value
        .map((item) => {
          const timestamp = formatTimestamp(item.timestamp);
          let data;

          switch (displayMode) {
            case 'hex':
              data = item.hexData;
              break;
            case 'ascii':
              data = item.asciiData;
              break;
            case 'utf8':
              data = item.utf8Data;
              break;
            default:
              data = item.hexData;
          }

          return `${timestamp} [${item.direction.toUpperCase()}] ${data}`;
        })
        .join('\n');

      const currentDate = new Date();
      const dateStr = currentDate.toISOString().replace(/:/g, '-').slice(0, 19);
      const fileName = `serial_data_${dateStr}.txt`;

      serialStore.saveToFile(content, fileName);
    } catch (error) {
      console.error('保存监控数据失败:', error);
    }
  };

  // 向串口发送数据
  const sendDataToPort = (data: string, isHex: boolean = false) => {
    try {
      serialStore.sendData(data, isHex).then(() => {
        // 发送成功后，可以在这里添加数据到监控
      });
    } catch (error) {
      console.error('发送数据失败:', error);
    }
  };

  // 添加接收数据到监控
  const addReceivedData = (data: Uint8Array) => {
    if (!data || data.length === 0) return;

    const hexData = Array.from(data)
      .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');

    const asciiData = Array.from(data)
      .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.'))
      .join('');

    let utf8Data;
    try {
      utf8Data = new TextDecoder('utf-8').decode(data);
    } catch {
      utf8Data = asciiData;
    }

    const item: MonitorDataItem = {
      timestamp: Date.now(),
      direction: 'rx',
      hexData,
      asciiData,
      utf8Data,
      rawData: data,
    };

    addMonitorItem(item);
  };

  // 添加发送数据到监控
  const addSentData = (data: Uint8Array) => {
    if (!data || data.length === 0) return;

    const hexData = Array.from(data)
      .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');

    const asciiData = Array.from(data)
      .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.'))
      .join('');

    let utf8Data;
    try {
      utf8Data = new TextDecoder('utf-8').decode(data);
    } catch {
      utf8Data = asciiData;
    }

    const item: MonitorDataItem = {
      timestamp: Date.now(),
      direction: 'tx',
      hexData,
      asciiData,
      utf8Data,
      rawData: data,
    };

    addMonitorItem(item);
  };

  // 添加监控项
  const addMonitorItem = (item: MonitorDataItem) => {
    monitorData.value.push(item);

    // 限制缓冲区大小
    if (monitorData.value.length > maxBufferSize.value) {
      monitorData.value = monitorData.value.slice(-maxBufferSize.value);
    }
  };

  return {
    // 状态
    monitorData,
    isConnected,
    lastError,
    maxBufferSize,

    // 方法
    clearMonitorData,
    saveMonitorData,
    sendDataToPort,
    addReceivedData,
    addSentData,
  };
};
