import type { ReceiveLifecycleStatus } from '../core';

export const receiveLifecycleMap: Record<ReceiveLifecycleStatus, { label: string; color: string }> = {
  idle: { label: '空闲', color: 'grey' },
  ready: { label: '就绪', color: 'info' },
  receiving: { label: '接收中', color: 'positive' },
  error: { label: '错误', color: 'negative' },
};
