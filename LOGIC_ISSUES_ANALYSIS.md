# 任务管理逻辑问题分析

**分析目标**: 在不重构架构的前提下，分析移除 `onUnmounted` 清理逻辑后可能的问题

## 一、当前逻辑分析

### 1.1 现有机制

**定时器管理**:

- ✅ 每个任务的定时器存储在 `task.timers[]` 数组中
- ✅ `stopTask()` 会正确清理 `task.timers` 中的所有定时器
- ✅ 定时任务执行完成后会自动清理定时器

**任务状态管理**:

- ✅ 任务状态存储在 `sendTasksStore` 中，独立于组件
- ✅ 任务执行逻辑在 `useSendTaskManager` 中，使用闭包保存状态

## 二、移除 onUnmounted 后的逻辑问题

### 🚨 **潜在问题 1: 定时器泄漏** (MEDIUM)

**问题**:

- 组件销毁后，`useSendTaskManager` 的实例还在
- 如果任务异常中断，定时器可能没有被正确清理
- 页面刷新时，正在运行的定时器会丢失引用

**现状检查**:

```typescript
// ✅ 正常停止 - 定时器会被清理
function stopTask(taskId: string): boolean {
  if (task.timers && task.timers.length > 0) {
    task.timers.forEach((timerId) => {
      clearTimeout(timerId);
      clearInterval(timerId);
    });
  }
}

// 🚨 异常情况 - 可能泄漏
// 1. 页面刷新时正在运行的任务
// 2. 任务执行中出现 JavaScript 错误
// 3. 浏览器标签页关闭
```

**简单解决方案**:

```typescript
// 在应用初始化时添加页面卸载清理
window.addEventListener('beforeunload', () => {
  const store = useSendTasksStore();
  store.tasks.forEach((task) => {
    if (task.timers && task.timers.length > 0) {
      task.timers.forEach((timerId) => {
        clearTimeout(timerId);
        clearInterval(timerId);
      });
    }
  });
});
```

### 🚨 **潜在问题 2: 多实例冲突** (LOW)

**问题**:

- 移除 `onUnmounted` 后，多个对话框可能同时操作同一个任务
- 但检查代码发现，每个对话框创建的是独立的任务，不会冲突

**现状检查**:

```typescript
// ✅ 每次创建的是新任务，有独立ID
function createTimedSingleTask(...) {
  const task: SendTask = {
    id: nanoid(), // 🟢 每个任务有唯一ID
    ...
  };
}
```

### 🚨 **潜在问题 3: 任务状态同步** (LOW)

**问题**:

- 任务在后台运行时，如果重新打开对话框，状态可能不同步

**现状检查**:

```typescript
// ✅ 对话框通过 computed 实时获取任务状态
const currentTask = computed(() => {
  if (!currentTaskId.value) return null;
  return sendTasksStore.getTaskById(currentTaskId.value);
});

// ✅ 有状态监听机制
watch(
  currentTask,
  (task) => {
    if (!task) return;
    switch (task.status) {
      case 'running':
        isSending.value = true;
        break;
      case 'completed':
        isSending.value = false;
        break;
    }
  },
  { immediate: true, deep: true },
);
```

### 🚨 **潜在问题 4: 串口连接异常** (MEDIUM)

**问题**:

- 任务在后台运行时，如果串口连接断开，任务会持续尝试发送
- 可能导致大量错误日志

**现状检查**:

```typescript
// ✅ 发送前会检查连接状态
const success = await serialStore.sendFrameInstance(targetPath, instance);
if (!success) {
  throw new Error('帧发送失败'); // 🟢 会抛出错误
}

// 🚨 但定时任务会继续运行，不会因为发送失败而停止
```

**简单解决方案**:

```typescript
// 在发送失败时检查是否是连接问题
const success = await serialStore.sendFrameInstance(targetPath, instance);
if (!success) {
  // 检查连接状态，如果断开则暂停任务
  if (!serialStore.isPortConnected(targetPath)) {
    sendTasksStore.updateTaskStatus(task.id, 'paused');
    return; // 暂停执行
  }
}
```

## 三、实际验证测试

### 3.1 简单验证步骤

1. **基本后台运行测试**:

   - 创建定时任务 → 开始发送 → 关闭对话框 → 检查任务是否继续

2. **定时器清理测试**:

   - 开启任务 → 手动停止 → 检查浏览器开发者工具是否有活跃定时器

3. **状态同步测试**:
   - 任务运行中 → 重新打开对话框 → 检查状态是否正确显示

## 四、结论

### ✅ **逻辑上可行**

基于代码分析，**移除 onUnmounted 在逻辑上是可行的**：

1. **定时器管理**: 已有完善的清理机制
2. **任务状态**: 存储在 Store 中，独立于组件
3. **状态同步**: 已有响应式监听机制

### 🔧 **需要的简单修复**

只需要添加 2 个简单的保护措施：

1. **页面卸载清理**:

   ```typescript
   // 在 main.ts 中添加
   window.addEventListener('beforeunload', () => {
     // 清理所有定时器
   });
   ```

2. **连接异常处理**:
   ```typescript
   // 在发送失败时检查连接状态
   if (!serialStore.isPortConnected(targetPath)) {
     sendTasksStore.updateTaskStatus(task.id, 'paused');
   }
   ```

### 📋 **实施建议**

**最简单的实现路径**:

1. **立即执行**: 移除 `onUnmounted` 清理
2. **测试验证**: 创建任务 → 关闭对话框 → 验证继续运行
3. **添加保护**: 页面卸载清理 + 连接异常处理

**预期效果**: 可以实现您的需求，风险较低，不需要大幅重构。
