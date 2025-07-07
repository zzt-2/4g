/**
 * 通用定时器管理器类型定义
 */

// 定时器类型
export type TimerType = 'interval' | 'timeout' | 'delayed';

// 定时器状态
export type TimerStatus = 'idle' | 'running' | 'paused' | 'stopped';

// 定时器配置接口
export interface TimerConfig {
  id: string; // 定时器唯一标识
  type: TimerType; // 定时器类型
  interval: number; // 执行间隔（毫秒）
  delay?: number; // 延迟启动时间（毫秒，仅对delayed类型有效）
  autoStart?: boolean; // 是否自动启动
  maxExecutions?: number; // 最大执行次数（可选，超过后自动停止）
  eventChannel?: string; // 自定义事件通道名称（可选）
}

// 定时器信息接口
export interface TimerInfo extends TimerConfig {
  status: TimerStatus; // 当前状态
  executionCount: number; // 已执行次数
  lastExecutionTime: number | undefined; // 最后执行时间戳
  createdAt: number; // 创建时间戳
  startedAt: number | undefined; // 启动时间戳
}

// 定时器操作结果
export interface TimerOperationResult {
  success: boolean;
  message?: string;
  timerId?: string;
}

// 定时器事件数据
export interface TimerEventData {
  timerId: string; // 定时器ID
  executionCount: number; // 当前执行次数
  timestamp: number; // 执行时间戳
  interval: number; // 执行间隔
  payload?: unknown; // 可选的附加数据
}

// 定时器批量操作配置
export interface BatchTimerOperation {
  timerIds: string[]; // 定时器ID列表
  operation: 'start' | 'stop' | 'pause' | 'resume'; // 操作类型
}

// 定时器统计信息
export interface TimerStats {
  totalTimers: number; // 总定时器数量
  runningTimers: number; // 运行中的定时器数量
  pausedTimers: number; // 暂停的定时器数量
  stoppedTimers: number; // 停止的定时器数量
  totalExecutions: number; // 总执行次数
}
