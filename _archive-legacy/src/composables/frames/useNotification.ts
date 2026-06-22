/**
 * 帧通知相关的可组合函数
 */
import { useQuasar } from 'quasar';
import type { QNotifyCreateOptions } from 'quasar';

/**
 * 通知管理
 * 提供统一的通知处理，便于后续扩展和统一样式
 */
export function useNotification() {
  const $q = useQuasar();

  /**
   * 显示成功通知
   * @param message 消息内容
   * @param options 其他选项
   */
  const notifySuccess = (message: string, options?: Partial<QNotifyCreateOptions>) => {
    $q.notify({
      type: 'positive',
      message,
      timeout: 2000,
      position: 'top',
      ...options,
    });
  };

  /**
   * 显示错误通知
   * @param message 消息内容
   * @param options 其他选项
   */
  const notifyError = (message: string, options?: Partial<QNotifyCreateOptions>) => {
    $q.notify({
      type: 'negative',
      message,
      timeout: 3000,
      position: 'top',
      actions: [{ icon: 'close', color: 'white' }],
      ...options,
    });
  };

  /**
   * 显示警告通知
   * @param message 消息内容
   * @param options 其他选项
   */
  const notifyWarning = (message: string, options?: Partial<QNotifyCreateOptions>) => {
    $q.notify({
      type: 'warning',
      message,
      timeout: 2500,
      position: 'top',
      ...options,
    });
  };

  /**
   * 显示信息通知
   * @param message 消息内容
   * @param options 其他选项
   */
  const notifyInfo = (message: string, options?: Partial<QNotifyCreateOptions>) => {
    $q.notify({
      type: 'info',
      message,
      timeout: 2000,
      position: 'top',
      ...options,
    });
  };

  /**
   * 显示帧操作成功通知
   * @param action 操作类型
   * @param frameName 帧名称
   */
  const notifyFrameSuccess = (action: '创建' | '更新' | '删除' | '复制', frameName: string) => {
    notifySuccess(`${action}帧「${frameName}」成功`);
  };

  /**
   * 显示字段操作成功通知
   * @param action 操作类型
   * @param fieldName 字段名称
   */
  const notifyFieldSuccess = (action: '添加' | '更新' | '删除' | '复制', fieldName: string) => {
    notifySuccess(`${action}字段「${fieldName}」成功`);
  };

  /**
   * 显示验证错误通知
   * @param errors 错误消息数组
   */
  const notifyValidationErrors = (errors: string[]) => {
    errors.forEach((error) => {
      notifyError(error);
    });
  };

  return {
    notifySuccess,
    notifyError,
    notifyWarning,
    notifyInfo,
    notifyFrameSuccess,
    notifyFieldSuccess,
    notifyValidationErrors,
  };
}
