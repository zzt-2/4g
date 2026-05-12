import type { CommandHandler } from '../core/handler';

export const handleHealthCheck: CommandHandler = async (_command, ctx) => {
  const snapshot = ctx.connectionSnapshot();
  const hasConnected = snapshot.runtimeFacts.some(
    (f) => f.lifecycle === 'connected',
  );
  ctx.stateWriter.updateStatus({
    healthStatus: hasConnected ? 'healthy' : 'error',
  });
  return { success: true };
};
