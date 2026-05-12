import type { CommandHandler } from '../core/handler';
import { buildSendFrameTask } from '../core/task-builder';

export const handleSendFrame: CommandHandler = async (command, ctx) => {
  if (!ctx.stateReader.scoeFramesLoaded) {
    return { success: false, error: 'Satellite not loaded' };
  }

  const taskDef = buildSendFrameTask(command);
  const instance = ctx.taskService.createTask(taskDef);
  ctx.taskService.startTask(instance.instanceId);

  ctx.stateWriter.incrementReceiveCount();

  return { success: true, taskId: instance.instanceId };
};
