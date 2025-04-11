/**
 * 串口数据监控相关的组合式API
 */
import { ref, computed } from 'vue';
import { useSerialStore } from '../../stores/serialStore';
import { storeToRefs } from 'pinia';
import { bytesToHex, formatSerialMessage } from '../../utils/serialUtils';
import type {
  MessageDirection,
  MessageFormat,
  TimestampFormat,
  ExportFormat,
} from '../../types/serial';

export const useDataMonitor = () => {
  const serialStore = useSerialStore();

  // 从store中提取响应式状态
  const { messages, isRecording } = storeToRefs(serialStore);

  // 本地状态
  const messageFormat = ref<MessageFormat>('hex');
  const showTimestamps = ref(true);
  const timestampFormat = ref<TimestampFormat>('time');
  const autoScroll = ref(true);
  const filterDirection = ref<MessageDirection | 'all'>('all');
  const searchQuery = ref('');

  // 计算属性：过滤后的消息
  const filteredMessages = computed(() => {
    return messages.value.filter((msg) => {
      // 方向过滤
      if (filterDirection.value !== 'all' && msg.direction !== filterDirection.value) {
        return false;
      }

      // 搜索过滤
      if (searchQuery.value) {
        const formattedMsg = formatSerialMessage(msg.data, messageFormat.value);
        return formattedMsg.toLowerCase().includes(searchQuery.value.toLowerCase());
      }

      return true;
    });
  });

  // 清除消息
  const clearMessages = () => {
    serialStore.clearMessages();
  };

  // 切换记录状态
  const toggleRecording = () => {
    serialStore.toggleRecording();
  };

  // 导出消息记录
  const exportMessages = (exportFormat: ExportFormat = 'csv'): string => {
    if (messages.value.length === 0) {
      return '';
    }

    // 在switch外定义format变量
    const format = exportFormat as string; // 类型断言

    switch (exportFormat) {
      case 'csv':
        return exportMessagesAsCsv();
      case 'txt':
        return exportMessagesAsTxt();
      case 'json':
        return exportMessagesAsJson();
      default:
        throw new Error('不支持的导出格式：' + format);
    }
  };

  // 导出为CSV
  const exportMessagesAsCsv = (): string => {
    const headers = ['时间戳', '方向', '数据'];
    const rows = [headers.join(',')];

    filteredMessages.value.forEach((msg) => {
      const timestamp = new Date(msg.timestamp).toISOString();
      const direction = msg.direction === 'sent' ? '发送' : '接收';
      const data = formatSerialMessage(msg.data, messageFormat.value);

      // 转义CSV字段
      const escapeCsv = (value: string): string => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      };

      rows.push([timestamp, direction, escapeCsv(data)].join(','));
    });

    return rows.join('\n');
  };

  // 导出为文本
  const exportMessagesAsTxt = (): string => {
    const lines: string[] = [];

    filteredMessages.value.forEach((msg) => {
      const timestamp = new Date(msg.timestamp).toLocaleString();
      const direction = msg.direction === 'sent' ? '[发送]' : '[接收]';
      const data = formatSerialMessage(msg.data, messageFormat.value);

      lines.push(`${timestamp} ${direction} ${data}`);
    });

    return lines.join('\n');
  };

  // 导出为JSON
  const exportMessagesAsJson = (): string => {
    const jsonData = filteredMessages.value.map((msg) => {
      return {
        timestamp: msg.timestamp,
        direction: msg.direction,
        data: bytesToHex(msg.data, ''),
      };
    });

    return JSON.stringify(jsonData, null, 2);
  };

  return {
    // 状态
    messages: filteredMessages,
    isRecording,
    messageFormat,
    showTimestamps,
    timestampFormat,
    autoScroll,
    filterDirection,
    searchQuery,

    // 方法
    clearMessages,
    toggleRecording,
    exportMessages,
  };
};
