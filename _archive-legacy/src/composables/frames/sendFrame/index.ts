/**
 * 发送任务管理器模块导出
 */

// 主入口 - 完整功能的任务管理器
export { useSendTaskManager } from './useSendTaskManager';

// 功能模块 - 可以单独使用
export { useSendTaskCreator } from './useSendTaskCreator';
export { useSendTaskExecutor } from './useSendTaskExecutor';
export { useSendTaskController } from './useSendTaskController';
export { useSendTaskConfigManager } from './useSendTaskConfigManager';

// 类型定义导出
export type {
  SendTask,
  FrameInstanceInTask,
  TaskConfigBase,
  TimedTaskConfig,
  TriggerTaskConfig,
  TaskStatus,
  TaskType,
  TaskProgress,
} from '../../../stores/frames/sendTasksStore';
