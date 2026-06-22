import { EventBus } from 'quasar';
import { onMounted, onUnmounted } from 'vue';

// 定义事件类型
export enum EventType {
  BOOKMARK_CREATED = 'bookmark-created',
  BOOKMARK_UPDATED = 'bookmark-updated',
  BOOKMARK_DELETED = 'bookmark-deleted',
  BOOKMARK_REFRESH = 'bookmark-refresh',
  CATEGORY_UPDATED = 'category-updated',
  MENU_UPDATED = 'menu-updated',
  SEARCH_UPDATED = 'search-updated',
  FILE_DIALOG_OPEN = 'file-dialog-open',
  FILE_DIALOG_RESULT = 'file-dialog-result',
}

// 创建事件总线实例
export const bus = new EventBus();

// 事件监听器包装函数
export const listenBusEvent = (event: EventType | string, callback: () => void) => {
  onMounted(() => {
    console.log('监听事件:', event);
    bus.on(event, callback);
  });
  onUnmounted(() => {
    bus.off(event, callback);
  });
};
