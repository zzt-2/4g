export const SCHEDULE_KIND_MAP: Record<string, { label: string; color: string }> = {
  immediate: { label: '立即执行', color: 'primary' },
  timer: { label: '定时', color: 'info' },
  event: { label: '事件触发', color: 'warning' },
} as const;

export const SCHEDULE_KIND_OPTIONS = [
  { value: 'immediate', label: '立即执行' },
  { value: 'timer', label: '定时' },
  { value: 'event', label: '事件触发' },
] as const;
