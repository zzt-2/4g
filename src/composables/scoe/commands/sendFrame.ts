/**
 * 发送帧指令执行器
 */

import type { CommandExecutionContext, CommandExecutionResult } from '../useScoeCommandExecutor';
import { useUnifiedSender } from '../../frames/sendFrame/useUnifiedSender';
import { useScoeFrameInstancesStore } from 'src/stores/frames/scoeFrameInstancesStore';

/**
 * 执行发送帧指令
 * @param context 执行上下文
 * @returns 执行结果
 */
export async function executeSendFrame(
  context: CommandExecutionContext,
): Promise<CommandExecutionResult> {
  const { command, params } = context;
  const resolvedParams = params?.resolvedParams as Record<string, string> | undefined;

  try {
    // 获取帧实例列表
    const frameInstances = useScoeFrameInstancesStore().receiveCommands.find(
      (cmd) => cmd.id === command.id,
    )?.frameInstances;
    if (!frameInstances || frameInstances.length === 0) {
      return {
        success: false,
        message: '未配置帧实例',
      };
    }

    const { sendFrameInstance } = useUnifiedSender();

    // 遍历每个帧实例
    frameInstances.forEach(async (instance) => {
      // 如果有参数，将参数值赋给对应字段
      if (command.params && resolvedParams) {
        for (const param of command.params) {
          if (param.targetFieldId && resolvedParams[param.id]) {
            const field = instance.fields.find((f) => f.id === param.targetFieldId);
            if (field) {
              field.value = resolvedParams[param.id] || '';
            }
          }
        }
      }

      // 发送帧实例
      await sendFrameInstance(instance.targetId || 'network:scoe-udp:scoe-udp-remote', instance);
      await new Promise((resolve) => setTimeout(resolve, command.sendInterval || 0));
    });

    return {
      success: true,
      message: `成功发送 ${frameInstances.length} 个帧实例`,
    };
  } catch (error) {
    console.error('[SCOE] 发送帧失败:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '发送帧失败',
    };
  }
}
