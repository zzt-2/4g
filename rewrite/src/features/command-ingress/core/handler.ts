import type { TaskService } from '@/features/task';
import type { SendService } from '@/features/send';
import type { ConnectionService, ConnectionStateSnapshot } from '@/features/connection';
import type { FrameAssetReader } from '@/features/frame';
import type { ParsedCommand } from './protocol-adapter';
import type { CommandIngressStateReader, CommandIngressStateWriter } from './state';
import type { ScoeCommandFunction } from './types';

export interface CommandContext {
  readonly taskService: TaskService;
  readonly sendService: SendService;
  readonly frameReader: FrameAssetReader;
  readonly connectionService: ConnectionService;
  readonly connectionSnapshot: () => ConnectionStateSnapshot;
  readonly receiveSnapshot: () => unknown;
  readonly platformFileReader: (path: string) => Promise<string[]>;
  readonly stateReader: CommandIngressStateReader;
  readonly stateWriter: CommandIngressStateWriter;
}

export type CommandHandler = (
  command: ParsedCommand,
  ctx: CommandContext,
) => Promise<CommandResult>;

export interface CommandResult {
  readonly success: boolean;
  readonly error?: string;
  readonly taskId?: string;
}

export async function dispatchCommand(
  command: ParsedCommand,
  handlerMap: ReadonlyMap<ScoeCommandFunction, CommandHandler>,
  ctx: CommandContext,
): Promise<CommandResult> {
  const handler = handlerMap.get(command.commandFunction);
  if (!handler) {
    return { success: false, error: `No handler for: ${command.commandFunction}` };
  }
  return handler(command, ctx);
}
