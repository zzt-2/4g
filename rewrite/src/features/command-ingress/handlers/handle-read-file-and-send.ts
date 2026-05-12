import type { CommandHandler } from '../core/handler';
import { buildReadFileAndSendTask } from '../core/task-builder';

export const handleReadFileAndSend: CommandHandler = async (command, ctx) => {
  if (!ctx.stateReader.scoeFramesLoaded) {
    return { success: false, error: 'Satellite not loaded' };
  }

  // Find the file path from command params
  const fileParam = command.commandConfig.params?.find(
    (p) => p.value?.includes('.txt'),
  );
  if (!fileParam) {
    return { success: false, error: 'No file parameter found' };
  }

  const filePath = command.resolvedParams[fileParam.id] ?? fileParam.value;
  let fileLines: string[];
  try {
    fileLines = await ctx.platformFileReader(filePath);
  } catch (err) {
    return {
      success: false,
      error: `Failed to read file: ${(err as Error).message}`,
    };
  }

  if (fileLines.length === 0) {
    return { success: false, error: 'File is empty' };
  }

  const taskDef = buildReadFileAndSendTask(command, fileLines);
  const instance = ctx.taskService.createTask(taskDef);
  ctx.taskService.startTask(instance.instanceId);

  ctx.stateWriter.incrementReceiveCount();

  return { success: true, taskId: instance.instanceId };
};
