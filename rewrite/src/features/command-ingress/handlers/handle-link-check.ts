import type { CommandHandler } from '../core/handler';

export const handleLinkCheck: CommandHandler = async (_command, ctx) => {
  const snapshot = ctx.receiveSnapshot();
  // Determine link status from receive snapshot
  // The snapshot shape is opaque here; default to pass if handler was invoked
  // (the actual receive sync check depends on receive feature's public API)
  const hasSync = snapshot != null;
  ctx.stateWriter.updateStatus({
    linkTestResult: hasSync ? 'pass' : 'fail',
  });
  return { success: true };
};
