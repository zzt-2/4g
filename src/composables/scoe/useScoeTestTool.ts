import { ref } from 'vue';
import type { HighlightConfig, HighlightConfigs } from 'src/types/scoe';
import { defaultHighlightConfigs, getHighlightColor } from 'src/types/scoe';

export interface DataSegment {
  label: string;
  text: string;
  highlight: boolean;
  color: string;
}

export interface ScoeTestData {
  timestamp: string;
  data: string;
  checksumValid?: boolean;
  failedReason?: string;
  segments: DataSegment[]; // 预计算的高亮段
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

  // 高亮配置（区分发送和接收）
  const highlightConfigs = ref<HighlightConfigs>(defaultHighlightConfigs);

  /**
   * 计算高亮段
   */
  const calculateSegments = (
    hexString: string,
    configs: HighlightConfig[],
    addSegments: boolean = true,
  ): DataSegment[] => {
    if (!configs || configs.length === 0 || !addSegments) {
      return [{ label: '', text: hexString, highlight: false, color: '' }];
    }

    // 创建一个数组来标记每个字符的高亮状态
    const charHighlights: Array<{ configIndex: number } | null> = new Array(hexString.length).fill(
      null,
    );

    // 为每个配置标记对应的字符范围
    configs.forEach((config, configIndex) => {
      const startChar = config.offset * 2; // 字节转换为字符位置
      const endChar = startChar + config.length * 2;

      for (let i = startChar; i < endChar && i < hexString.length; i++) {
        if (charHighlights[i] === null) {
          charHighlights[i] = { configIndex };
        }
      }
    });

    // 将连续的相同状态的字符合并成段
    const segments: DataSegment[] = [];
    let currentSegment: DataSegment | null = null;

    for (let i = 0; i < hexString.length; i++) {
      const char = hexString[i] || '';
      const highlight = charHighlights[i];
      const isHighlighted = highlight !== null;
      const color = isHighlighted && highlight ? getHighlightColor(highlight.configIndex) : '';
      const label = isHighlighted && highlight ? configs[highlight.configIndex]?.name || '' : '';

      if (
        currentSegment &&
        currentSegment.highlight === isHighlighted &&
        currentSegment.color === color
      ) {
        // 继续当前段
        currentSegment.text += char;
      } else {
        // 开始新段
        if (currentSegment) {
          segments.push(currentSegment);
        }
        currentSegment = {
          label: label,
          text: char,
          highlight: isHighlighted,
          color: color,
        };
      }
    }

    // 添加最后一段
    if (currentSegment) {
      segments.push(currentSegment);
    }

    return segments.length > 0
      ? segments
      : [{ label: '', text: hexString, highlight: false, color: '' }];
  };

  /**
   * 添加发送数据
   */
  const addSendData = (data: string, addSegments: boolean = true) => {
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
      segments: calculateSegments(data, highlightConfigs.value.sendConfigs, addSegments),
    });

    // 限制记录行数
    if (sendDataList.value.length > maxRecordLines.value) {
      sendDataList.value = sendDataList.value.slice(0, maxRecordLines.value);
    }
  };

  /**
   * 添加接收数据
   */
  const addReceiveData = (
    data: string,
    checksumValid: boolean = true,
    failedReason: string = '',
    addSegments: boolean = true,
  ) => {
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
      segments: calculateSegments(data, highlightConfigs.value.receiveConfigs, addSegments),
      failedReason,
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

  /**
   * 添加高亮配置
   * @param type 配置类型：'send' 或 'receive'
   */
  const addHighlightConfig = (
    type: 'send' | 'receive',
    config: Omit<HighlightConfig, 'id'>,
  ): string => {
    const configList =
      type === 'send' ? highlightConfigs.value.sendConfigs : highlightConfigs.value.receiveConfigs;
    const newId =
      configList.length > 0
        ? (Math.max(...configList.map((c) => parseInt(c.id) || 0)) + 1).toString()
        : '1';

    const newConfig: HighlightConfig = {
      ...config,
      id: newId,
    };

    configList.push(newConfig);
    return newId;
  };

  /**
   * 更新高亮配置
   * @param type 配置类型：'send' 或 'receive'
   */
  const updateHighlightConfig = (
    type: 'send' | 'receive',
    id: string,
    updates: Partial<HighlightConfig>,
  ) => {
    const configList =
      type === 'send' ? highlightConfigs.value.sendConfigs : highlightConfigs.value.receiveConfigs;
    const config = configList.find((c) => c.id === id);
    if (config) {
      Object.assign(config, updates);
    }
  };

  /**
   * 删除高亮配置
   * @param type 配置类型：'send' 或 'receive'
   */
  const deleteHighlightConfig = (type: 'send' | 'receive', id: string) => {
    const configList =
      type === 'send' ? highlightConfigs.value.sendConfigs : highlightConfigs.value.receiveConfigs;
    const index = configList.findIndex((c) => c.id === id);
    if (index !== -1) {
      configList.splice(index, 1);
    }
  };

  /**
   * 加载高亮配置
   */
  const loadHighlightConfigs = (configs: HighlightConfigs | undefined) => {
    highlightConfigs.value = configs || defaultHighlightConfigs;
  };

  return {
    sendDataList,
    receiveDataList,
    maxRecordLines,
    sendStopped,
    receiveStopped,
    highlightConfigs,
    addSendData,
    addReceiveData,
    setMaxRecordLines,
    initialize,
    addHighlightConfig,
    updateHighlightConfig,
    deleteHighlightConfig,
    loadHighlightConfigs,
  };
}
