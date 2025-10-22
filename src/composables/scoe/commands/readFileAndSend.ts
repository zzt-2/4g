/**
 * 读取文件并发送帧指令执行器
 */

import type { CommandExecutionContext, CommandExecutionResult } from '../useScoeCommandExecutor';
import { useSendTaskManager } from '../../frames/sendFrame/useSendTaskManager';
import { deepClone } from '../../../utils/frames/frameUtils';
import { filesAPI } from '../../../api/common/filesApi';
import { pathAPI } from '../../../api/common/pathApi';
import { SCOE_PARAMS_BASE_PATH } from '../../../config/configDefaults';
import type { FrameInstanceInTask, FieldVariation } from '../../../stores/frames/sendTasksStore';

/**
 * 执行读取文件并发送帧指令
 * @param context 执行上下文
 * @returns 执行结果
 */
export async function executeReadFileAndSend(
  context: CommandExecutionContext,
): Promise<CommandExecutionResult> {
  const { command, params } = context;
  const resolvedParams = params?.resolvedParams as Record<string, string> | undefined;

  try {
    // 获取帧实例列表
    const frameInstances = command.frameInstances;
    if (!frameInstances || frameInstances.length === 0) {
      return {
        success: false,
        message: '未配置帧实例',
      };
    }

    if (!command.params || command.params.length === 0) {
      return {
        success: false,
        message: '未配置参数',
      };
    }

    // 获取数据路径
    const dataPath = await pathAPI.getDataPath();

    // 读取所有参数对应的文件
    const fieldVariationsMap: Record<string, string[]> = {};
    let maxLength = 0;

    for (const param of command.params) {
      if (!param.targetFieldId || !resolvedParams?.[param.id]) {
        continue;
      }

      if (resolvedParams[param.id]?.includes('.txt')) {
        // 拼接文件路径
        const filePath = await pathAPI.resolve(
          dataPath,
          SCOE_PARAMS_BASE_PATH,
          resolvedParams[param.id] || '',
        );

        // 读取文件
        const result = await filesAPI.readTextFile(filePath);
        if (!result.success || !result.content) {
          console.warn(`[SCOE] 读取文件失败: ${filePath}`, result.message);
          continue;
        }

        // 解析文件内容：按行分割，过滤空行
        const values = result.content
          .split(/[\n\r]+/)
          .map((v) => v.trim())
          .filter((v) => v !== '');

        fieldVariationsMap[param.id] = values;
        maxLength = Math.max(maxLength, values.length);
      } else {
        fieldVariationsMap[param.id] = resolvedParams[param.id]?.split(',') || [''];
        maxLength = Math.max(maxLength, fieldVariationsMap[param.id]?.length || 0);
      }
    }

    if (maxLength === 0) {
      return {
        success: false,
        message: '所有参数文件为空或读取失败',
      };
    }

    // 构建 FrameInstanceInTask 数组
    const frameInstanceInTasks: FrameInstanceInTask[] = [];

    for (const instance of frameInstances) {
      // 构建字段变化配置
      const fieldVariations: FieldVariation[] = [];

      for (const param of command.params) {
        if (param.targetFieldId && fieldVariationsMap[param.id]) {
          fieldVariations.push({
            fieldId: param.targetFieldId,
            values: fieldVariationsMap[param.id] || [],
          });
        }
      }

      // 深拷贝实例
      const instanceCopy = deepClone(instance);

      frameInstanceInTasks.push({
        id: `${Date.now()}_${Math.random()}`,
        instance: instanceCopy,
        targetId: instanceCopy.targetId || 'network:scoe-udp:scoe-udp-remote',
        interval: 0,
        enableVariation: fieldVariations.length > 0,
        fieldVariations: fieldVariations.length > 0 ? fieldVariations : [],
      });
    }

    // 创建并启动定时任务
    const { createTimedTask, startTask, getTaskByName, stopTask } = useSendTaskManager();

    const task = getTaskByName('SCOE读取文件并发送' + command.id);

    if (task) {
      stopTask(task.id);
    }

    const taskId = createTimedTask(
      frameInstanceInTasks,
      command.sendInterval || 1000, // 1秒间隔
      maxLength, // 重复次数为文件行数
      false, // 不是无限循环
      'SCOE读取文件并发送' + command.id,
    );

    if (!taskId) {
      return {
        success: false,
        message: '创建发送任务失败',
      };
    }

    const started = await startTask(taskId);
    if (!started) {
      return {
        success: false,
        message: '启动发送任务失败',
      };
    }

    return {
      success: true,
      message: `成功创建发送任务，将发送 ${maxLength} 轮数据`,
      data: {
        taskId,
        rounds: maxLength,
      },
    };
  } catch (error) {
    console.error('[SCOE] 读取文件并发送失败:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '读取文件并发送失败',
    };
  }
}
