import type { SerialPortOptions } from '../../types/serial/serial';

/**
 * 串口配置相关的配置选项和辅助函数
 */
export function useSerialConfig() {
  // 波特率选项列表
  const baudRateOptions = [
    { label: '110', value: 110 },
    { label: '300', value: 300 },
    { label: '1200', value: 1200 },
    { label: '2400', value: 2400 },
    { label: '4800', value: 4800 },
    { label: '9600', value: 9600 },
    { label: '14400', value: 14400 },
    { label: '19200', value: 19200 },
    { label: '38400', value: 38400 },
    { label: '57600', value: 57600 },
    { label: '115200', value: 115200 },
    { label: '128000', value: 128000 },
    { label: '256000', value: 256000 },
    { label: '500000', value: 500000 },
    { label: '1000000', value: 1000000 },
  ];

  // 数据位选项列表
  const dataBitsOptions = [
    { label: '5', value: 5 },
    { label: '6', value: 6 },
    { label: '7', value: 7 },
    { label: '8', value: 8 },
  ];

  // 停止位选项列表
  const stopBitsOptions = [
    { label: '1', value: 1 },
    { label: '1.5', value: 1.5 },
    { label: '2', value: 2 },
  ];

  // 校验位选项列表
  const parityOptions = [
    { label: '无校验', value: 'none' },
    { label: '偶校验', value: 'even' },
    { label: '奇校验', value: 'odd' },
    { label: '标记校验', value: 'mark' },
    { label: '空格校验', value: 'space' },
  ];

  // 流控制选项列表
  const flowControlOptions = [
    { label: '无流控制', value: 'none' },
    { label: '硬件流控制', value: 'hardware' },
    { label: '软件流控制', value: 'software' },
  ];

  // 获取默认串口配置
  const getDefaultSerialOptions = (): SerialPortOptions => {
    return {
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
      autoOpen: false,
    };
  };

  return {
    // 选项列表
    baudRateOptions,
    dataBitsOptions,
    stopBitsOptions,
    parityOptions,
    flowControlOptions,

    // 辅助函数
    getDefaultSerialOptions,
  };
}
