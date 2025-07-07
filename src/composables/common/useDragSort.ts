import { ref, computed, readonly, Ref } from 'vue';

/**
 * 拖拽排序选项
 */
export interface DragSortOptions {
  /** 是否启用拖拽排序模式 */
  enabled: boolean;
  /** 拖拽时是否显示预览 */
  showPreview?: boolean;
  /** 预览的CSS类名 */
  previewClass?: string;
  /** 插入指示器的CSS类名 */
  dropIndicatorClass?: string;
}

/**
 * 拖拽状态
 */
export interface DragState {
  /** 是否正在拖拽 */
  isDragging: boolean;
  /** 被拖拽项的索引 */
  draggedIndex: number | null;
  /** 目标插入位置 */
  dropIndex: number | null;
  /** 拖拽偏移量 */
  offset: { x: number; y: number };
}

/**
 * 可复用的拖拽排序 Composable
 *
 * @param items 要排序的数组 ref
 * @param onReorder 重新排序回调函数
 * @param options 拖拽选项
 */
export function useDragSort<T>(
  items: Ref<T[]>,
  onReorder: (fromIndex: number, toIndex: number) => boolean | void,
  options: Ref<DragSortOptions> = ref({ enabled: false }),
) {
  // 拖拽状态
  const dragState = ref<DragState>({
    isDragging: false,
    draggedIndex: null,
    dropIndex: null,
    offset: { x: 0, y: 0 },
  });

  // 拖拽预览样式
  const previewStyle = ref<Record<string, string>>({});

  // 计算属性：当前被拖拽的项目
  const draggedItem = computed(() => {
    if (dragState.value.draggedIndex === null) return null;
    return items.value[dragState.value.draggedIndex] || null;
  });

  // 重置拖拽状态
  function resetDragState() {
    dragState.value = {
      isDragging: false,
      draggedIndex: null,
      dropIndex: null,
      offset: { x: 0, y: 0 },
    };
    previewStyle.value = {};
  }

  // 开始拖拽
  function startDrag(index: number, event: MouseEvent) {
    if (!options.value.enabled || index < 0 || index >= items.value.length) return;

    event.preventDefault();

    dragState.value = {
      isDragging: true,
      draggedIndex: index,
      dropIndex: index,
      offset: { x: 0, y: 0 },
    };

    const startX = event.clientX;
    const startY = event.clientY;
    const element = event.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();

    // 设置拖拽预览样式
    if (options.value.showPreview) {
      previewStyle.value = {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        pointerEvents: 'none',
        zIndex: '1000',
        opacity: '0.8',
      };
    }

    // 鼠标移动处理
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState.value.isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      dragState.value.offset = { x: deltaX, y: deltaY };

      // 更新预览位置
      if (options.value.showPreview) {
        previewStyle.value = {
          ...previewStyle.value,
          left: `${rect.left + deltaX}px`,
          top: `${rect.top + deltaY}px`,
        };
      }

      // 计算目标插入位置
      const container = element.parentElement;
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const relativeY = e.clientY - containerRect.top;

        // 简化的位置计算：基于鼠标在容器中的相对位置
        const itemHeight = rect.height + 4; // 假设项目间有4px间距
        let targetIndex = Math.floor(relativeY / itemHeight);

        // 如果鼠标在项目的下半部分，插入到下一个位置
        if (relativeY % itemHeight > itemHeight / 2) {
          targetIndex++;
        }

        // 限制在有效范围内
        targetIndex = Math.max(0, Math.min(targetIndex, items.value.length));

        dragState.value.dropIndex = targetIndex;
      }
    };

    // 鼠标释放处理
    const handleMouseUp = () => {
      if (
        dragState.value.isDragging &&
        dragState.value.draggedIndex !== null &&
        dragState.value.dropIndex !== null &&
        dragState.value.draggedIndex !== dragState.value.dropIndex
      ) {
        // 计算实际的目标索引（考虑移除原项目后的位置调整）
        let actualToIndex = dragState.value.dropIndex;
        if (dragState.value.draggedIndex < dragState.value.dropIndex) {
          actualToIndex--;
        }

        // 执行重新排序
        const result = onReorder(dragState.value.draggedIndex, actualToIndex);

        // 如果回调返回 false，表示排序失败，不更新状态
        if (result === false) {
          // 排序失败，可能需要显示错误信息
        }
      }

      resetDragState();

      // 移除事件监听器
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    // 添加事件监听器
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  // 获取项目的拖拽样式
  function getItemStyle(index: number) {
    if (dragState.value.draggedIndex === index && dragState.value.isDragging) {
      return {
        transform: `translate(${dragState.value.offset.x}px, ${dragState.value.offset.y}px)`,
        opacity: '0.5',
        zIndex: '999',
      };
    }
    return {};
  }

  // 获取项目的CSS类
  function getItemClass(index: number) {
    const classes: string[] = [];

    if (options.value.enabled && !dragState.value.isDragging) {
      classes.push('cursor-grab');
    }

    if (dragState.value.isDragging && dragState.value.draggedIndex === index) {
      classes.push('cursor-grabbing', 'select-none');
    }

    return classes.join(' ');
  }

  // 是否显示插入指示器
  function shouldShowDropIndicator(position: 'before' | 'after', index: number) {
    if (!dragState.value.isDragging || dragState.value.dropIndex === null) return false;

    if (position === 'before') {
      return dragState.value.dropIndex === index && dragState.value.draggedIndex !== index;
    } else {
      return dragState.value.dropIndex === index + 1 && dragState.value.draggedIndex !== index;
    }
  }

  // 切换拖拽模式
  function toggleDragMode() {
    options.value.enabled = !options.value.enabled;
    if (!options.value.enabled) {
      resetDragState();
    }
  }

  return {
    // 状态
    dragState: readonly(dragState),
    draggedItem,
    previewStyle: readonly(previewStyle),

    // 方法
    startDrag,
    resetDragState,
    getItemStyle,
    getItemClass,
    shouldShowDropIndicator,
    toggleDragMode,

    // 选项
    options,
  };
}
