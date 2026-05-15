import type { HealthStatus, LinkTestResult } from '../core';

export const healthStatusMap: Record<HealthStatus, { label: string; color: string }> = {
  unknown: { label: '未知', color: 'grey' },
  healthy: { label: '正常', color: 'positive' },
  error: { label: '异常', color: 'negative' },
};

export const linkTestStatusMap: Record<LinkTestResult, { label: string; color: string }> = {
  unknown: { label: '未知', color: 'grey' },
  pass: { label: '通过', color: 'positive' },
  fail: { label: '失败', color: 'negative' },
};

export const commandResultMap: Record<string, { label: string; color: string }> = {
  success: { label: '成功', color: 'positive' },
  error: { label: '失败', color: 'negative' },
  pending: { label: '进行中', color: 'warning' },
};
