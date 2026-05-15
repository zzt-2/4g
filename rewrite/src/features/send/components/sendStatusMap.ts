import type { SendResultKind } from '../core';

// Module-level constant (O4) — send result status to UI label/color mapping
export const SEND_RESULT_STATUS_MAP: Record<SendResultKind, { label: string; color: string }> = {
  sent: { label: '已发送', color: 'positive' },
  'build-error': { label: '构建错误', color: 'negative' },
  'target-unavailable': { label: '目标不可用', color: 'warning' },
  'transport-error': { label: '传输错误', color: 'negative' },
  timeout: { label: '超时', color: 'warning' },
  cancelled: { label: '已取消', color: 'grey' },
};
