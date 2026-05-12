import type { CommandHandler } from '../core/handler';

export const handleUnloadSatelliteId: CommandHandler = async (_command, ctx) => {
  if (!ctx.stateReader.scoeFramesLoaded) {
    return { success: false, error: 'No satellite loaded' };
  }

  ctx.stateWriter.resetRuntimeState();

  return { success: true };
};
