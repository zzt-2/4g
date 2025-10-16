// SCOE相关类型定义

// 导出接收指令相关类型
export * from './receiveCommand';

export interface ScoeSendConfig {
  /** 卫星识别字 */
  satelliteIdentifier: string;
  /** 信息标识 */
  messageIdentifier: string;
  /** 信源标识 */
  sourceIdentifier: string;
  /** 信宿标识 */
  destinationIdentifier: string;
  /** UDP IP地址 */
  udpIpAddress: string;
  /** UDP端口号 */
  udpPort: number;
}

export interface ScoeReceiveConfig {
  /** 卫星识别字 */
  satelliteIdentifier: string;
  /** 信息标识 */
  messageIdentifier: string;
  /** 信源标识 */
  sourceIdentifier: string;
  /** 信宿标识 */
  destinationIdentifier: string;
  /** 型号ID */
  modelId: string;
  /** 卫星ID */
  satelliteId: string;
  /** 识别消息ID */
  recognitionMessageId: boolean;
  /** 识别信源ID */
  recognitionSourceId: boolean;
  /** 识别信宿ID */
  recognitionDestinationId: boolean;
}

export interface ScoeSatelliteConfig {
  /** 数据项ID（唯一标识） */
  id: string;
  /** 卫星ID */
  satelliteId: string;
  /** 发送配置 */
  sendConfig: ScoeSendConfig;
  /** 接收配置 */
  receiveConfig: ScoeReceiveConfig;
}

export interface ScoeStatus {
  /** 软件启动累计秒 */
  runtimeSeconds: number;
  /** 当前卫星ID加载累计秒 */
  satelliteIdRuntimeSeconds: number;
  /** 指令接收总计数 */
  commandReceiveCount: number;
  /** 指令执行成功总计数 */
  commandSuccessCount: number;
  /** 最近一条指令功能码 */
  lastCommandCode: string;
  /** 指令执行出错计数 */
  commandErrorCount: number;
  /** 指令执行出错原因 */
  lastErrorReason: string;
  /** 已加载配置的卫星ID */
  loadedSatelliteId: string;
  /** 健康状态 */
  healthStatus: 'unknown' | 'healthy' | 'error';
  /** 链路自检结果 */
  linkTestResult: 'unknown' | 'pass' | 'fail';
  /** SCOE帧是否加载 */
  scoeFramesLoaded: boolean;
}

export interface ScoeStatusUpdate {
  /** 指令接收总计数 */
  commandReceiveCount: number;
  /** 指令执行成功总计数 */
  commandSuccessCount: number;
  /** 最近一条指令功能码 */
  lastCommandCode: string;
  /** 指令执行出错计数 */
  commandErrorCount: number;
  /** 指令执行出错原因 */
  lastErrorReason: string;
}

export interface ScoeGlobalConfig {
  /** SCOE标识 */
  scoeIdentifier: string;
  /** TCP Server IP地址 */
  tcpServerIp: string;
  /** TCP Server 端口 */
  tcpServerPort: number;
  /** 是否自动连接 */
  tcpServerAutoConnect: boolean;
  /** UDP IP地址 */
  udpIpAddress: string;
  /** UDP端口号 */
  udpPort: number;

  // 字节偏移量配置
  /** 信息标识起始字节 */
  messageIdentifierOffset: number;
  /** 信源标识起始字节 */
  sourceIdentifierOffset: number;
  /** 信宿标识起始字节 */
  destinationIdentifierOffset: number;
  /** 型号ID起始字节 */
  modelIdOffset: number;
  /** 卫星ID起始字节 */
  satelliteIdOffset: number;
  /** 功能码起始字节 */
  functionCodeOffset: number;
}

export interface ScoeData {
  satelliteConfigs: ScoeSatelliteConfig[];
  globalConfig: ScoeGlobalConfig;
}

export const defaultScoeSatelliteConfig: ScoeSatelliteConfig = {
  id: '',
  satelliteId: '',
  sendConfig: {
    satelliteIdentifier: '',
    messageIdentifier: '',
    sourceIdentifier: '',
    destinationIdentifier: '',
    udpIpAddress: '',
    udpPort: 0,
  },
  receiveConfig: {
    satelliteIdentifier: '',
    messageIdentifier: '',
    sourceIdentifier: '',
    destinationIdentifier: '',
    modelId: '',
    satelliteId: '',
    recognitionMessageId: true,
    recognitionSourceId: true,
    recognitionDestinationId: true,
  },
};

export const defaultScoeStatus: ScoeStatus = {
  runtimeSeconds: 0,
  satelliteIdRuntimeSeconds: 0,
  commandReceiveCount: 0,
  commandSuccessCount: 0,
  lastCommandCode: '',
  commandErrorCount: 0,
  lastErrorReason: '无错误',
  loadedSatelliteId: '',
  healthStatus: 'unknown',
  linkTestResult: 'unknown',
  scoeFramesLoaded: false,
};

export const defaultScoeStatusUpdate: ScoeStatusUpdate = {
  commandReceiveCount: 0,
  commandSuccessCount: 0,
  lastCommandCode: '',
  commandErrorCount: 0,
  lastErrorReason: '无错误',
};

export const defaultScoeGlobalConfig: ScoeGlobalConfig = {
  scoeIdentifier: '',
  tcpServerIp: '0.0.0.0',
  tcpServerPort: 8080,
  tcpServerAutoConnect: false,
  udpIpAddress: '',
  udpPort: 0,
  // 默认字节偏移量
  messageIdentifierOffset: 0,
  sourceIdentifierOffset: 1,
  destinationIdentifierOffset: 2,
  modelIdOffset: 3,
  satelliteIdOffset: 7,
  functionCodeOffset: 11,
};

// 表单字段配置类型
interface FormField {
  key: string;
  label: string;
  disable?: boolean;
  placeholder?: string;
  must?: boolean;
}

// 表单字段配置
export const sendConfigFields: FormField[] = [
  { key: 'satelliteIdentifier', label: '卫星识别字', disable: true, placeholder: '0xAAAA，不识别' },
  { key: 'messageIdentifier', label: '信息标识', must: true },
  { key: 'sourceIdentifier', label: '信源标识', must: true },
  { key: 'destinationIdentifier', label: '信宿标识', must: true },
  { key: 'udpIpAddress', label: 'UDP IP地址', placeholder: '192.168.1.100', must: true },
  { key: 'udpPort', label: 'UDP端口号', placeholder: '8080', must: true },
];

export const receiveConfigFields: FormField[] = [
  { key: 'satelliteIdentifier', label: '卫星识别字', disable: true, placeholder: '不配置' },
  { key: 'messageIdentifier', label: '信息标识', must: true },
  { key: 'sourceIdentifier', label: '信源标识', must: true },
  { key: 'destinationIdentifier', label: '信宿标识', must: true },
  { key: 'modelId', label: '型号ID', must: true },
  { key: 'satelliteId', label: '卫星ID', disable: true, placeholder: '同上卫星ID，不需填写' },
];

/**
 * 获取SCOE数据源选项
 * 结合loadedConfig和status的所有字段
 */
export function getScoeDataSourceOptions(): Array<{ label: string; value: string; group: string }> {
  return [
    // 状态信息
    { label: '软件启动累计秒', value: 'status.runtimeSeconds', group: '状态信息' },
    { label: '当前卫星ID加载累计秒', value: 'status.satelliteIdRuntimeSeconds', group: '状态信息' },
    { label: '指令接收总计数', value: 'status.commandReceiveCount', group: '状态信息' },
    { label: '指令执行成功总计数', value: 'status.commandSuccessCount', group: '状态信息' },
    { label: '最近一条指令功能码', value: 'status.lastCommandCode', group: '状态信息' },
    { label: '指令执行出错计数', value: 'status.commandErrorCount', group: '状态信息' },
    { label: '指令执行出错原因', value: 'status.lastErrorReason', group: '状态信息' },
    { label: '已加载卫星ID', value: 'status.loadedSatelliteId', group: '状态信息' },
    { label: '健康状态', value: 'status.healthStatus', group: '状态信息' },
    { label: '链路自检结果', value: 'status.linkTestResult', group: '状态信息' },
    { label: 'SCOE帧是否加载', value: 'status.scoeFramesLoaded', group: '状态信息' },

    // 配置信息 - 卫星ID
    { label: '配置-卫星ID', value: 'config.satelliteId', group: '配置信息' },

    // 配置信息 - 发送配置
    { label: '发送-卫星识别字', value: 'config.sendConfig.satelliteIdentifier', group: '发送配置' },
    { label: '发送-信息标识', value: 'config.sendConfig.messageIdentifier', group: '发送配置' },
    { label: '发送-信源标识', value: 'config.sendConfig.sourceIdentifier', group: '发送配置' },
    { label: '发送-信宿标识', value: 'config.sendConfig.destinationIdentifier', group: '发送配置' },

    // 配置信息 - 接收配置
    {
      label: '接收-卫星识别字',
      value: 'config.receiveConfig.satelliteIdentifier',
      group: '接收配置',
    },
    { label: '接收-信息标识', value: 'config.receiveConfig.messageIdentifier', group: '接收配置' },
    { label: '接收-信源标识', value: 'config.receiveConfig.sourceIdentifier', group: '接收配置' },
    {
      label: '接收-信宿标识',
      value: 'config.receiveConfig.destinationIdentifier',
      group: '接收配置',
    },
    { label: '接收-型号ID', value: 'config.receiveConfig.modelId', group: '接收配置' },
    { label: '接收-卫星ID', value: 'config.receiveConfig.satelliteId', group: '接收配置' },
  ];
}
