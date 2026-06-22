/**
 * 链路自检指令执行器
 */

import { useReceiveFramesStore } from 'src/stores/frames/receiveFramesStore';
import type { CommandExecutionResult, CommandExecutionContext } from '../useScoeCommandExecutor';
import { DataGroup, DataItem } from 'src/types/frames/receive';

/**
 * 执行链路自检指令
 * @param context 执行上下文
 * @returns 执行结果
 */
export async function executeLinkCheck(
  context: CommandExecutionContext,
): Promise<CommandExecutionResult> {
  const { scoeStore } = context;
  const receiveFramesStore = useReceiveFramesStore();

  let isLinkOk = true;
  receiveFramesStore.groups.forEach((group: DataGroup) => {
    group.dataItems.forEach((item: DataItem) => {
      if (item.label === '载波同步锁定' && item.value !== 1) {
        isLinkOk = false;
      }
      if (item.label === '定时同步锁定' && item.value !== 1) {
        isLinkOk = false;
      }
      if (item.label === '帧同步锁定' && item.value !== 1) {
        isLinkOk = false;
      }
    });
  });

  scoeStore.status.linkTestResult = isLinkOk ? 'pass' : 'fail';

  return {
    success: true,
    message: `链路自检完成，结果: ${scoeStore.status.linkTestResult}`,
    data: {
      linkTestResult: scoeStore.status.linkTestResult,
      scoeFramesLoaded: scoeStore.status.scoeFramesLoaded,
      loadedSatelliteId: scoeStore.status.loadedSatelliteId,
    },
  };
}
