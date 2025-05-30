import { boot } from 'quasar/wrappers';
import { useSendTasksStore } from '../stores/frames/sendTasksStore';

export default boot(() => {
  console.log('Task Manager boot file initialized');

  // 添加页面卸载时的清理逻辑
  window.addEventListener('beforeunload', () => {
    try {
      const sendTasksStore = useSendTasksStore();

      console.log('页面即将卸载，开始清理所有任务定时器...');

      // 清理所有任务的定时器，防止内存泄漏
      let clearedTimersCount = 0;

      sendTasksStore.tasks.forEach((task) => {
        if (task.timers && task.timers.length > 0) {
          task.timers.forEach((timerId) => {
            clearTimeout(timerId);
            clearInterval(timerId);
            clearedTimersCount++;
          });

          console.log(`任务 ${task.name} 的 ${task.timers.length} 个定时器已清理`);
        }
      });

      console.log(`页面卸载清理完成，共清理了 ${clearedTimersCount} 个定时器`);
    } catch (error) {
      console.error('页面卸载清理失败:', error);
    }
  });

  // 添加页面隐藏时的处理（用户切换到其他标签页时）
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      console.log('页面隐藏，任务继续在后台运行');
    } else {
      console.log('页面重新可见');
    }
  });
});
