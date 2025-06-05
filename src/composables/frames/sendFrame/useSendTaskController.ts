/**
 * 发送任务控制器 - 可组合函数
 *
 * 负责任务的控制操作（停止、暂停、恢复等）
 */
import { ref } from 'vue';
import { useSendTasksStore } from '../../../stores/frames/sendTasksStore';

/**
 * 任务控制器可组合函数
 */
export function useSendTaskController() {
  // 获取store实例
  const sendTasksStore = useSendTasksStore();

  // 本地状态
  const processingError = ref<string | null>(null);

  /**
   * 停止任务
   */
  function stopTask(taskId: string): boolean {
    const task = sendTasksStore.getTaskById(taskId);
    if (!task) {
      processingError.value = '找不到指定的任务';
      return false;
    }

    if (
      task.status !== 'running' &&
      task.status !== 'paused' &&
      task.status !== 'waiting-trigger'
    ) {
      return true; // 任务已经停止
    }

    try {
      // 清理任务相关的定时器
      if (task.timers && task.timers.length > 0) {
        task.timers.forEach((timerId) => {
          clearTimeout(timerId);
          clearInterval(timerId);
        });
      }

      // 清理触发监听器
      if (task.status === 'waiting-trigger') {
        console.log(`清理任务 ${task.name} 的触发监听器`);
        sendTasksStore.unregisterTaskTriggerListener(taskId);
      }

      // 更新任务状态
      sendTasksStore.updateTaskStatus(taskId, 'completed');

      console.log(`任务 ${task.name} 已停止`);
      return true;
    } catch (e) {
      console.error(`停止任务 ${task.name} 失败:`, e);
      processingError.value = e instanceof Error ? e.message : '停止任务失败';
      return false;
    }
  }

  /**
   * 暂停任务
   */
  function pauseTask(taskId: string): boolean {
    const task = sendTasksStore.getTaskById(taskId);
    if (!task || task.status !== 'running') {
      return false;
    }

    try {
      // 暂停定时器但不清除（保留用于恢复）
      if (task.timers && task.timers.length > 0) {
        // 注意：setTimeout/setInterval 暂停需要特殊处理
        // 这里只是简单地更新状态，具体的暂停逻辑需要在各个任务执行函数中实现
        console.log(`暂停任务 ${task.name} 的定时器，共 ${task.timers.length} 个`);
      }

      sendTasksStore.updateTaskStatus(taskId, 'paused');
      console.log(`任务 ${task.name} 已暂停`);
      return true;
    } catch (e) {
      console.error(`暂停任务 ${task.name} 失败:`, e);
      processingError.value = e instanceof Error ? e.message : '暂停任务失败';
      return false;
    }
  }

  /**
   * 恢复任务
   */
  function resumeTask(taskId: string): boolean {
    const task = sendTasksStore.getTaskById(taskId);
    if (!task || task.status !== 'paused') {
      return false;
    }

    try {
      // 恢复任务状态
      sendTasksStore.updateTaskStatus(taskId, 'running');
      console.log(`任务 ${task.name} 已恢复`);

      // 注意：具体的恢复逻辑需要在各个任务执行函数中实现
      // 这里只是更新状态，实际的定时器恢复需要重新启动任务

      return true;
    } catch (e) {
      console.error(`恢复任务 ${task.name} 失败:`, e);
      processingError.value = e instanceof Error ? e.message : '恢复任务失败';
      return false;
    }
  }

  /**
   * 停止所有正在运行的任务
   */
  function stopAllTasks(): number {
    let stoppedCount = 0;
    const tasks = sendTasksStore.tasks;

    tasks.forEach((task) => {
      if (
        task.status === 'running' ||
        task.status === 'paused' ||
        task.status === 'waiting-trigger'
      ) {
        if (stopTask(task.id)) {
          stoppedCount++;
        }
      }
    });

    console.log(`共停止了 ${stoppedCount} 个任务`);
    return stoppedCount;
  }

  /**
   * 获取正在运行的任务数量
   */
  function getRunningTasksCount(): number {
    return sendTasksStore.tasks.filter((task) => task.status === 'running').length;
  }

  /**
   * 获取所有活动任务（运行中、暂停、等待触发）
   */
  function getActiveTasksCount(): number {
    return sendTasksStore.tasks.filter((task) =>
      ['running', 'paused', 'waiting-trigger'].includes(task.status),
    ).length;
  }

  /**
   * 检查任务是否可以停止
   */
  function canStopTask(taskId: string): boolean {
    const task = sendTasksStore.getTaskById(taskId);
    if (!task) return false;

    return ['running', 'paused', 'waiting-trigger'].includes(task.status);
  }

  /**
   * 检查任务是否可以暂停
   */
  function canPauseTask(taskId: string): boolean {
    const task = sendTasksStore.getTaskById(taskId);
    if (!task) return false;

    return task.status === 'running';
  }

  /**
   * 检查任务是否可以恢复
   */
  function canResumeTask(taskId: string): boolean {
    const task = sendTasksStore.getTaskById(taskId);
    if (!task) return false;

    return task.status === 'paused';
  }

  /**
   * 强制清理任务定时器（用于紧急情况）
   */
  function forceCleanupTask(taskId: string): boolean {
    const task = sendTasksStore.getTaskById(taskId);
    if (!task) {
      processingError.value = '找不到指定的任务';
      return false;
    }

    try {
      // 强制清理所有定时器
      if (task.timers && task.timers.length > 0) {
        console.warn(`强制清理任务 ${task.name} 的 ${task.timers.length} 个定时器`);
        task.timers.forEach((timerId) => {
          clearTimeout(timerId);
          clearInterval(timerId);
        });
      }

      // 强制清理触发监听器
      if (task.status === 'waiting-trigger') {
        console.warn(`强制清理任务 ${task.name} 的触发监听器`);
        sendTasksStore.unregisterTaskTriggerListener(taskId);
      }

      // 清空定时器记录
      sendTasksStore.updateTask(taskId, {
        timers: [],
      });

      // 更新任务状态为错误状态
      sendTasksStore.updateTaskStatus(taskId, 'error', '任务被强制停止');

      console.log(`任务 ${task.name} 已被强制清理`);
      return true;
    } catch (e) {
      console.error(`强制清理任务 ${task.name} 失败:`, e);
      processingError.value = e instanceof Error ? e.message : '强制清理失败';
      return false;
    }
  }

  return {
    // 状态
    processingError,

    // 任务控制
    stopTask,
    pauseTask,
    resumeTask,
    stopAllTasks,
    forceCleanupTask,

    // 状态查询
    getRunningTasksCount,
    getActiveTasksCount,
    canStopTask,
    canPauseTask,
    canResumeTask,
  };
}
