export interface StatLabel {
  readonly key: string;
  readonly label: string;
}

export const statsRow1: readonly StatLabel[] = [
  { key: 'runtimeSeconds', label: '累计秒' },
  { key: 'satelliteIdRuntimeSeconds', label: '卫星运行秒' },
  { key: 'commandReceiveCount', label: '指令接收总数' },
  { key: 'commandSuccessCount', label: '成功总数' },
  { key: 'commandErrorCount', label: '出错数' },
];

export const statsRow2: readonly StatLabel[] = [
  { key: 'lastCommandCode', label: '最后功能码' },
  { key: 'lastErrorReason', label: '错误原因' },
  { key: 'loadedSatelliteId', label: '已加载卫星ID' },
  { key: 'healthStatus', label: '健康状态' },
  { key: 'linkTestResult', label: '链路自检' },
];
