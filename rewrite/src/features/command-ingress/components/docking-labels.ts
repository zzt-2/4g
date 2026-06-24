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
  { value: 'laser', label: '激光（laser）' },
  { value: 'ka', label: 'Ka 宽带（ka）' },
  { value: 'wer', label: '微波（wer）' },
  { value: 'fps', label: '导航（fps）' },
  { value: 'ads', label: '航空监视（ads）' },
  { value: 'seu', label: '星间激光（seu）' },
] as const;

// --- Default config ---

export const DEFAULT_DOCKING_CONFIG = {
  serverHost: '0.0.0.0',
  serverPort: 5001,
  customerBaseUrl: 'http://10.15.5.93/partner-api/',
  subSysType: 'laser',
  subSysId: 'JG',
  loginUrl: 'http://10.15.5.93/partner-api/auth/partner/login',
  clientId: '6af72c14148848b9b1c08220a6d8ee54',
  username: 'subsys',
  password: 'f6c230cb7cf848439a4d52817dff6d',
  grantType: 'partner',
  tenantId: '000000',
  // D006: FTP 配置(getTestCaseAll 用例数据走 FTP 文件传输 + TestReport 上传都用它)
  ftpHost: '10.15.5.93',
  ftpPort: 21,
  ftpUsername: 'ftpuser',
  ftpPassword: 'ABCXYZ123!@#',
  ftpBasePath: '/laser',
};

// --- Mock devices ---

export const MOCK_DEVICES: readonly DeviceInfoItem[] = [
  {
    name: '激光通信终端',
    deviceId: 'JG_LCT_01',
    type: 'LCT',
    ip: '192.168.1.100',
    swVer: 'V1.0.0',
    status: 'online',
    pars: [],
  },
];
