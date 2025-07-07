/**
 * IPC处理器注册工具函数
 * 提供统一的IPC处理器注册和响应格式化功能
 */

import { ipcMain } from 'electron';
import { logError } from './errorUtils';

/**
 * 处理器函数类型定义
 */
export type HandlerFunction = (...args: any[]) => Promise<any> | any;

/**
 * 处理器集合接口
 */
export interface HandlerRegistry {
  [key: string]: HandlerFunction;
}

/**
 * 统一注册IPC处理器
 * @param handlers 处理器集合对象
 * @param prefix 频道前缀（可选）
 * @returns () => void 清理函数，用于取消注册
 */
export function registerHandlers(handlers: HandlerRegistry, prefix: string = ''): () => void {
  const registeredChannels: string[] = [];

  // 遍历并注册所有处理器
  for (const [key, handler] of Object.entries(handlers)) {
    const channel = prefix ? `${prefix}:${key}` : key;

    try {
      ipcMain.handle(channel, async (event, ...args) => {
        try {
          return await handler(event, ...args);
        } catch (error) {
          logError(`执行处理器失败: ${channel}`, error);
          throw error; // 让ipcMain处理并返回给渲染进程
        }
      });

      registeredChannels.push(channel);
    } catch (error) {
      logError(`注册处理器失败: ${channel}`, error);
    }
  }

  // 返回清理函数
  return () => {
    registeredChannels.forEach((channel) => {
      try {
        ipcMain.removeHandler(channel);
      } catch (error) {
        logError(`移除处理器失败: ${channel}`, error);
      }
    });
  };
}

/**
 * 创建处理器注册表，简化IPC处理器管理
 * @param basePrefix 基础频道前缀
 * @returns {register, handlers, registerAll} 注册方法和处理器集合
 */
export function createHandlerRegistry(basePrefix: string = '') {
  const handlers: HandlerRegistry = {};

  /**
   * 注册处理器方法
   * @param name 处理器名称
   * @param handler 处理器函数
   */
  const register = (name: string, handler: HandlerFunction) => {
    const fullName = basePrefix ? `${basePrefix}:${name}` : name;
    handlers[fullName] = handler;
  };

  return {
    register,
    handlers,
    registerAll: () => registerHandlers(handlers),
  };
}

/**
 * 创建统一的响应包装器，处理成功/失败情况
 * @param handler 原始处理函数
 * @returns 包装后的处理函数
 */
export function createResponseWrapper<T, A extends any[]>(
  handler: (...args: A) => Promise<T> | T,
): (...args: A) => Promise<{ success: boolean; data?: T; message?: string }> {
  return async (...args: A) => {
    try {
      const result = await handler(...args);
      return { success: true, data: result };
    } catch (error) {
      let message: string;
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === 'string') {
        message = error;
      } else {
        message = '操作失败';
      }
      logError('处理器执行失败', error);
      return { success: false, message };
    }
  };
}

/**
 * 注册渲染进程可以调用的API处理器
 * @param apiObject 包含API方法的对象
 * @param prefix API前缀
 * @returns () => void 清理函数
 */
export function registerApiHandlers(
  apiObject: Record<string, Function>,
  prefix: string,
): () => void {
  const handlers: HandlerRegistry = {};

  // 将对象中的方法转换为处理器
  for (const [key, method] of Object.entries(apiObject)) {
    if (typeof method === 'function') {
      // 使用响应包装器封装方法
      handlers[key] = createResponseWrapper(
        // 转发调用，移除事件参数
        (_, ...args: any[]) => method(...args),
      );
    }
  }

  return registerHandlers(handlers, prefix);
}

/**
 * 创建安全的IPC通道注册器，避免重复注册
 * @returns {register, cleanup} 注册方法和清理方法
 */
export function createIpcRegistry() {
  const registeredHandlers: Record<string, () => void> = {};

  return {
    /**
     * 注册IPC通道
     * @param prefix 通道前缀
     * @param handlers 处理器对象
     */
    register: (prefix: string, handlers: HandlerRegistry) => {
      // 如果已注册，先清除
      if (registeredHandlers[prefix]) {
        registeredHandlers[prefix]();
      }

      registeredHandlers[prefix] = registerHandlers(handlers, prefix);
    },

    /**
     * 清理所有注册的IPC通道
     */
    cleanup: () => {
      for (const cleanup of Object.values(registeredHandlers)) {
        cleanup();
      }
      // 清空注册表
      Object.keys(registeredHandlers).forEach((key) => {
        delete registeredHandlers[key];
      });
    },
  };
}
