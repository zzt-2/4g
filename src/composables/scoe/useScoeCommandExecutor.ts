/**
 * SCOE 接收指令执行器
 * 负责执行各种 SCOE 接收指令功能
 *
 * 设计原则：
 * 1. 每个功能独立封装，易于测试和维护
 * 2. 使用策略模式，通过 commandFunction 映射到具体执行函数
 * 3. 统一的返回值结构，便于错误处理和状态反馈
 * 4. 支持异步操作，可处理需要等待的操作
 * 5. 集中的错误处理和日志记录
 */

import { useScoeStore } from '../../stores/scoeStore';
import { useScoeFrameInstancesStore } from '../../stores/frames/scoeFrameInstancesStore';
import { ScoeCommandFunction, ScoeErrorReason, type ScoeReceiveCommand } from '../../types/scoe';
import {
  executeLoadSatelliteId,
  executeUnloadSatelliteId,
  executeHealthCheck,
  executeLinkCheck,
  executeCustomCommand,
} from './commands';
import { executeSendFrame } from './commands/sendFrame';
import { executeReadFileAndSend } from './commands/readFileAndSend';

/**
 * 指令执行结果
 */
export interface CommandExecutionResult {
  /** 是否成功 */
  success: boolean;
  /** 消息（成功或失败描述） */
  message: string;
  /** 执行耗时（毫秒） */
  duration?: number;
  /** 附加数据 */
  data?: Record<string, unknown>;
  /** 错误原因（失败时可选） */
  errorReason?: string;
}

/**
 * 指令执行上下文
 */
export interface CommandExecutionContext {
  /** 指令信息 */
  command: ScoeReceiveCommand;
  /** 开始时间 */
  startTime: number;
  /** SCOE Store */
  scoeStore: ReturnType<typeof useScoeStore>;
  /** SCOE 帧实例 Store */
  scoeFrameInstancesStore: ReturnType<typeof useScoeFrameInstancesStore>;
  /** 额外参数（用于传递指令特定数据，如卫星ID） */
  params: Record<string, unknown>;
}

/**
 * 指令执行函数类型
 */
type CommandExecutor = (context: CommandExecutionContext) => Promise<CommandExecutionResult>;

/**
 * SCOE 接收指令执行器 Composable
 */
export function useScoeCommandExecutor() {
  const scoeStore = useScoeStore();
  const scoeFrameInstancesStore = useScoeFrameInstancesStore();

  // ==================== 执行器映射表 ====================

  /**
   * 指令功能到执行器的映射
   */
  const executorMap: Record<ScoeCommandFunction, CommandExecutor> = {
    [ScoeCommandFunction.LOAD_SATELLITE_ID]: (context) => executeLoadSatelliteId(context),
    [ScoeCommandFunction.UNLOAD_SATELLITE_ID]: executeUnloadSatelliteId,
    [ScoeCommandFunction.HEALTH_CHECK]: executeHealthCheck,
    [ScoeCommandFunction.LINK_CHECK]: executeLinkCheck,
    [ScoeCommandFunction.SEND_FRAME]: executeSendFrame,
    [ScoeCommandFunction.READ_FILE_AND_SEND]: executeReadFileAndSend,
    [ScoeCommandFunction.CUSTOM]: executeCustomCommand,
  };

  // ==================== 核心执行方法 ====================

  /**
   * 执行指定的接收指令
   * @param command 要执行的指令
   * @param params 额外参数（可选）
   * @returns 执行结果
   */
  const executeCommand = async (
    command: ScoeReceiveCommand,
    params?: Record<string, unknown>,
  ): Promise<CommandExecutionResult> => {
    const startTime = performance.now();

    try {
      // 更新状态：记录最近一条指令功能码
      scoeStore.status.lastCommandCode = `${scoeStore.globalConfig.scoeIdentifier.toUpperCase().padStart(2, '0')}${command.code.replace(/^0x/i, '').toUpperCase().padStart(2, '0')}AAAA`;
      scoeStore.status.commandReceiveCount++;

      // 创建执行上下文
      const context: CommandExecutionContext = {
        command,
        startTime,
        scoeStore,
        scoeFrameInstancesStore,
        params: params || {},
      };

      // 获取对应的执行器
      const executor = executorMap[command.function];

      if (!executor) {
        scoeStore.status.commandErrorCount++;
        return {
          success: false,
          message: `未找到功能 ${command.function} 的执行器`,
          duration: performance.now() - startTime,
        };
      }

      // 执行指令
      console.log(`[SCOE] 开始执行指令: ${command.label} (${command.code})`, {
        function: command.function,
        params,
      });

      const result = await executor(context);

      // 计算执行时长
      const duration = performance.now() - startTime;
      result.duration = duration;

      // 统一更新状态计数器
      if (result.success) {
        scoeStore.status.commandSuccessCount++;
        scoeStore.status.lastErrorReason = ScoeErrorReason.NONE;
      } else {
        scoeStore.status.commandErrorCount++;
        // 如果执行器返回了错误原因，使用它；否则使用消息
        scoeStore.status.lastErrorReason = result.errorReason || result.message;
      }

      console.log(`[SCOE] 指令执行完成: ${command.label}`, {
        success: result.success,
        duration: `${duration.toFixed(2)}ms`,
        message: result.message,
      });

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : '未知错误';

      console.error(`[SCOE] 指令执行失败: ${command.label}`, error);

      scoeStore.status.commandErrorCount++;
      scoeStore.status.lastErrorReason = `执行异常: ${errorMessage}`;

      return {
        success: false,
        message: `执行失败: ${errorMessage}`,
        duration,
      };
    }
  };

  /**
   * 通过功能码查找并执行指令
   * @param code 功能码（单字节，如 "01"）
   * @param params 额外参数（可选）
   * @returns 执行结果，如果未找到指令则返回null
   */
  const executeCommandByCode = async (
    code: string,
    params?: Record<string, unknown>,
  ): Promise<CommandExecutionResult | null> => {
    const normalizedCode = code.replace(/^0x/i, '').toUpperCase().padStart(2, '0');
    const command = scoeFrameInstancesStore.receiveCommands.find((cmd) => {
      const cmdCode = cmd.code.replace(/^0x/i, '').toUpperCase().padStart(2, '0');
      return cmdCode === normalizedCode;
    });

    if (!command) {
      console.warn(`[SCOE] 未找到功能码为 ${code} 的指令`);
      scoeStore.status.commandErrorCount++;
      scoeStore.status.lastErrorReason = ScoeErrorReason.COMMAND_CODE_NOT_FOUND;
      return null;
    }

    return executeCommand(command, params);
  };

  // ==================== 导出 ====================

  return {
    // 核心执行方法
    executeCommand,
    executeCommandByCode,

    // 执行器映射（供扩展使用）
    executorMap,
  };
}
