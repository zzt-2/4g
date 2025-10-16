/**
 * 自定义指令执行器
 */

import type { CommandExecutionResult, CommandExecutionContext } from '../useScoeCommandExecutor';

/**
 * 执行自定义指令
 * @param context 执行上下文
 * @returns 执行结果
 */
export async function executeCustomCommand(
  context: CommandExecutionContext,
): Promise<CommandExecutionResult> {
  const { command } = context;

  // TODO: 根据具体需求实现自定义指令逻辑
  // 可以通过 command.code 来区分不同的自定义指令
  // 可以扩展 ScoeReceiveCommand 接口添加更多配置字段

  console.log(`执行自定义指令: ${command.label} (${command.code})`);

  return {
    success: true,
    message: `自定义指令 ${command.label} 执行完成`,
    data: {
      commandCode: command.code,
      commandLabel: command.label,
    },
  };
}
