import type { ConnectionLifecycleStatus } from '../core';

export const connectionStatusMap: Record<ConnectionLifecycleStatus, { label: string; color: string }> = {
  connected: { label: '已连接', color: 'positive' },
  connecting: { label: '连接中', color: 'warning' },
  disconnecting: { label: '断开中', color: 'warning' },
  disconnected: { label: '未连接', color: 'grey' },
  idle: { label: '空闲', color: 'grey' },
  error: { label: '错误', color: 'negative' },
};
