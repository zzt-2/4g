import type { DeviceInfoItem } from '@/features/northbound/core/types';

// --- Status maps for StatusBadge ---

export const DOCKING_HTTPS_STATUS_MAP: Record<string, { label: string; color: string }> = {
  unknown: { label: '未连接', color: 'grey' },
  connected: { label: '已连接', color: 'positive' },
  disconnected: { label: '已断开', color: 'warning' },
  error: { label: '错误', color: 'negative' },
};

export const DOCKING_HEARTBEAT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  unknown: { label: '未知', color: 'grey' },
  active: { label: '活跃', color: 'positive' },
  inactive: { label: '静止', color: 'warning' },
};

export const DOCKING_DEVICE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  unknown: { label: '离线', color: 'grey' },
  online: { label: '在线', color: 'positive' },
  offline: { label: '离线', color: 'negative' },
};

export const VERDICT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  passed: { label: '通过', color: 'positive' },
  failed: { label: '失败', color: 'negative' },
  stopped: { label: '已停止', color: 'grey' },
};

// --- Sub-system type options ---

export const SUB_SYS_TYPE_OPTIONS = [
  { value: 'ADS', label: 'ADS — 馈电测试子系统' },
  { value: 'KPS', label: 'KPS — Ka载荷测试子系统' },
  { value: 'WER', label: 'WER — 路由交换测试子系统' },
  { value: 'FPS', label: 'FPS — 馈电测试子系统' },
  { value: 'LAS', label: 'LAS — 激光载荷测试子系统' },
  { value: 'SEU', label: 'SEU — 单粒子故障注入子系统' },
] as const;

// --- Default config ---

export const DEFAULT_DOCKING_CONFIG = {
  serverHost: '0.0.0.0',
  serverPort: 5001,
  customerBaseUrl: '',
  subSysType: 'LAS',
  subSysId: 'LAS_001',
  loginUrl: '',
  clientId: '6af72c14148848b9b1c08220a6d8ee54',
  username: 'subsys',
  password: '',
  grantType: 'partner',
  tenantId: '000000',
};

// --- Mock devices ---

export const MOCK_DEVICES: readonly DeviceInfoItem[] = [
  {
    name: '激光通信终端',
    deviceId: 'LAS_LCT_01',
    type: 'LCT',
    ip: '192.168.1.100',
    swVer: 'V1.0.0',
    status: 'online',
    pars: [],
  },
];

// --- Default test case catalog (V1.0.4 getTestCaseAll format) ---

export const DEFAULT_TEST_CATALOG: Record<string, unknown> = {
  datas: [{
    name: '激光链路测试', id: 'LAS_MENU_01', isParent: true,
    type: '', runSubSys: '', depSubSys: '', depSubNe: '',
    durate: 0, execSteps: '', remark: '',
    inputPars: [], preHandle: [], afterHandle: [],
    children: [{
      name: '激光通信测试', id: 'LAS_TC_001', isParent: false,
      type: 'land', runSubSys: 'LAS', depSubSys: '', depSubNe: '',
      durate: 60, execSteps: '1.发送帧;2.接收帧;3.校验结果',
      remark: 'Mock 测试用例',
      inputPars: [], preHandle: [], afterHandle: [],
      children: [],
    }],
  }],
};
