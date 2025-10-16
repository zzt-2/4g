/**
 * 卸载卫星ID指令执行器
 */

import type { CommandExecutionResult, CommandExecutionContext } from '../useScoeCommandExecutor';

/**
 * 执行卸载卫星ID指令
 * @param context 执行上下文
 * @returns 执行结果
 */
export async function executeUnloadSatelliteId(
  context: CommandExecutionContext,
): Promise<CommandExecutionResult> {
  const { scoeStore } = context;
  const previousSatelliteId = scoeStore.status.loadedSatelliteId;

  // 2. 卸载卫星ID
  scoeStore.status.scoeFramesLoaded = false;
  scoeStore.status.loadedSatelliteId = '';
  scoeStore.status.satelliteIdRuntimeSeconds = 0;

  return {
    success: true,
    message: `成功卸载卫星ID: ${previousSatelliteId}`,
    data: {
      previousSatelliteId,
    },
  };
}
