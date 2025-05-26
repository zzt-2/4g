/**
 * 错误处理工具函数
 * 提供统一的错误处理、日志记录和响应格式化功能
 */

// 用于记录错误的回调函数
type ErrorLoggerCallback = (prefix: string, error: unknown) => void;

// 全局错误处理配置
const errorConfig = {
  logger: console.error,
  // 可扩展更多全局配置
};

/**
 * 处理异步操作的错误和加载状态
 * @param operation 要执行的异步操作
 * @param errorMessage 出错时显示的信息
 * @param setLoading 设置加载状态的函数（可选）
 * @param setError 设置错误信息的函数（可选）
 * @returns Promise<T | null> 操作结果或null（发生错误时）
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  errorMessage: string,
  setLoading?: (loading: boolean) => void,
  setError?: (error: string | null) => void,
): Promise<T | null> {
  try {
    if (setLoading) setLoading(true);
    if (setError) setError(null);
    return await operation();
  } catch (err) {
    const msg = err instanceof Error ? err.message : errorMessage;
    if (setError) setError(msg);
    logError(errorMessage, err);
    return null;
  } finally {
    if (setLoading) setLoading(false);
  }
}

/**
 * 格式化错误响应对象
 * @param error 错误对象或消息
 * @param additionalInfo 附加信息（可选）
 * @returns 格式化的错误响应对象
 */
export function formatErrorResponse(
  error: unknown,
  additionalInfo?: string,
): { success: false; message: string } {
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    message = '发生未知错误';
  }

  if (additionalInfo) {
    message = `${additionalInfo}: ${message}`;
  }

  return { success: false, message };
}

/**
 * 统一的错误日志记录
 * @param prefix 日志前缀，通常是操作描述
 * @param error 错误对象或消息
 */
export function logError(prefix: string, error: unknown): void {
  let errorMessage: string;

  if (error instanceof Error) {
    errorMessage = `${error.message}\n${error.stack || '无堆栈信息'}`;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else {
    try {
      errorMessage = JSON.stringify(error);
    } catch {
      errorMessage = String(error);
    }
  }

  // 使用配置的日志记录器
  errorConfig.logger(`[错误] ${prefix}: ${errorMessage}`);
}

/**
 * 设置全局错误日志记录器
 * @param logger 日志记录回调函数
 */
export function setErrorLogger(logger: ErrorLoggerCallback): void {
  errorConfig.logger = logger;
}

/**
 * 包装函数，添加错误处理
 * @param fn 要包装的函数
 * @param errorMessage 错误消息前缀
 * @returns 包装后的函数
 */
export function withErrorHandler<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  errorMessage: string,
): (...args: Parameters<T>) => Promise<ReturnType<T> | null> {
  return async (...args: Parameters<T>): Promise<ReturnType<T> | null> => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(errorMessage, error);
      return null;
    }
  };
}

/**
 * 包装函数，添加错误响应格式化
 * @param fn 要包装的函数
 * @param errorMessage 错误消息前缀
 * @returns 包装后的函数
 */
export function withErrorResponse<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  errorMessage: string,
): (...args: Parameters<T>) => Promise<ReturnType<T> | { success: false; message: string }> {
  return async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(errorMessage, error);
      return formatErrorResponse(error, errorMessage);
    }
  };
}

/**
 * 创建错误对象并格式化消息
 * @param message 错误消息
 * @param code 错误代码（可选）
 * @param details 错误详情（可选）
 * @returns 格式化的Error对象
 */
export function createError(message: string, code?: string, details?: Record<string, any>): Error {
  const error = new Error(message);
  if (code) {
    (error as any).code = code;
  }
  if (details) {
    (error as any).details = details;
  }
  return error;
}

/**
 * 断言条件，不满足时抛出错误
 * @param condition 要检查的条件
 * @param message 条件不满足时的错误消息
 * @throws 如果条件不满足，抛出带有给定消息的Error
 */
export function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * 专用于IPC通信的错误处理
 * @param error 错误对象
 * @returns 适合IPC通信的错误响应对象
 */
export function formatIpcError(error: unknown): { success: false; error: string; code?: string } {
  if (error instanceof Error) {
    return {
      success: false,
      error: error.message,
      code: (error as any).code,
    };
  }
  return {
    success: false,
    error: typeof error === 'string' ? error : '未知错误',
  };
}
