import type { ParsedCommand } from '../core/protocol-adapter';
import type { CommandContext } from '../core/handler';

/**
 * Send acknowledgment frame via sendService after task completes successfully.
 * Uses successFrameId from command config (falling back to global config),
 * resolved through sendService.execute() which handles frame serialization
 * and connection write.
 */
export async function sendAckFrame(
  command: ParsedCommand,
  ctx: CommandContext,
): Promise<void> {
  const successFrameId =
    command.commandConfig.successFrameId ??
    ctx.stateReader.globalConfig().successFrameId;
  if (!successFrameId) return;

  const frame = ctx.frameReader.getFrame(successFrameId);
  if (!frame) return;

  await ctx.sendService.execute({
    frameId: successFrameId,
    targetId:
      command.commandConfig.frameMappings?.[0]?.targetId ||
      ctx.stateReader.globalConfig().udpTargetId,
    userFieldValues: {},
  });
}
