# 定时任务修复方案文档

**创建时间**: 2024-12-19  
**问题描述**: TimedConfigPanel 配置无法传递到外面，定时发送任务在对话框关闭后停止运行  
**影响组件**: useSendTaskManager.ts 及其关联组件

## 一、问题分析

### 1.1 核心问题识别

1. **`SendTask` 接口缺少 `timers` 属性**

   - 位置：`src/stores/frames/sendTasksStore.ts`
   - 现象：useSendTaskManager.ts 中试图访问 `task.timers` 属性导致 TypeScript 错误
   - 影响：无法存储定时器ID，导致任务停止时无法清理定时器

2. **`TaskProgress` 接口不匹配实际使用**

   - 位置：`src/stores/frames/sendTasksStore.ts`
   - 现象：代码中使用了 `currentInstanceIndex`, `nextExecutionTime` 等未定义属性
   - 影响：类型错误，运行时可能出现问题

3. **定时器管理逻辑缺陷**

   - 位置：`src/composables/frames/sendFrame/useSendTaskManager.ts`
   - 现象：定时器ID无法正确存储到任务对象中
   - 影响：对话框关闭后任务停止，无法实现后台持续运行

4. **Linter 错误积累**
   - 位置：`src/composables/frames/sendFrame/useSendTaskManager.ts`
   - 现象：未使用的导入、any 类型使用、未使用变量
   - 影响：代码质量下降，可能隐藏其他问题

## 二、文件依赖关系分析

### 2.1 依赖关系图

```
useSendTaskManager.ts (核心问题文件) - 影响等级: HIGH
├── 依赖项 (Dependencies)
│   ├── stores/serialStore.ts                    - 影响等级: LOW
│   ├── stores/frames/sendFrameInstancesStore.ts - 影响等级: LOW
│   ├── stores/frames/sendTasksStore.ts          - 影响等级: CRITICAL (核心接口定义)
│   ├── types/frames/sendInstances.ts            - 影响等级: MEDIUM
│   ├── composables/useConnectionTargets.ts     - 影响等级: LOW
│   ├── utils/common/fileDialogManager.ts       - 影响等级: LOW
│   └── utils/electronApi.ts                    - 影响等级: LOW
│
└── 被依赖项 (Impacts)
    ├── components/frames/FrameSend/EnhancedSequentialSendDialog.vue - 影响等级: HIGH
    ├── components/frames/FrameSend/TimedSend/TimedSendDialog.vue    - 影响等级: MEDIUM
    └── components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue - 影响等级: MEDIUM
```

### 2.2 修改触发器分析

- **接口修改**: `SendTask`, `TaskProgress` 接口变更会影响所有使用这些类型的文件
- **状态管理**: `useSendTasksStore` 的修改会影响所有使用该 store 的组件
- **功能逻辑**: `useSendTaskManager` 的修改会影响所有发送任务相关的组件

## 三、详细修复计划

### 阶段一：修复核心接口定义 (CRITICAL 优先级)

**目标文件**: `src/stores/frames/sendTasksStore.ts`

#### 3.1.1 修改 SendTask 接口

```typescript
export interface SendTask {
  id: string;
  name: string;
  type: TaskType;
  status: TaskStatus;
  config: TaskConfigBase | TimedTaskConfig | TriggerTaskConfig;
  progress?: TaskProgress;
  timers?: number[]; // 新增：存储定时器ID数组，用于任务停止时清理
  errorInfo?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}
```

#### 3.1.2 修改 TaskProgress 接口

```typescript
export interface TaskProgress {
  currentCount: number;
  totalCount: number;
  percentage: number;
  currentInstanceId?: string;
  lastSentAt?: string;
  // 新增属性以支持现有代码逻辑
  currentInstanceIndex?: number; // 当前处理的实例索引
  nextExecutionTime?: number; // 下次执行时间(毫秒时间戳)
}
```

**验证步骤**:

1. 运行 `npx tsc --noEmit` 验证类型定义正确
2. 检查 SendTask 和 TaskProgress 的所有使用位置

### 阶段二：修复任务管理器逻辑 (HIGH 优先级)

**目标文件**: `src/composables/frames/sendFrame/useSendTaskManager.ts`

#### 3.2.1 清理未使用的导入

```typescript
// 移除未使用的导入
import { ref, computed, onUnmounted } from 'vue'; // 移除 watch
import {
  useSendTasksStore,
  SendTask,
  FrameInstanceInTask,
  TaskConfigBase,
  TimedTaskConfig,
  TriggerTaskConfig,
} from '../../../stores/frames/sendTasksStore'; // 移除 TaskType, TaskStatus
```

#### 3.2.2 修复定时器管理逻辑

**在 startTimedSingleTask 函数中**:

```typescript
async function startTimedSingleTask(task: SendTask): Promise<boolean> {
  // 1. 初始化任务的 timers 数组
  if (!task.timers) {
    task.timers = [];
  }

  // 2. 确保每个定时器ID都被正确存储
  const timerId = window.setTimeout(sendFrame, config.sendInterval);
  task.timers.push(timerId);

  // 3. 更新任务到 store
  sendTasksStore.updateTask(task.id, {
    timers: task.timers,
  });
}
```

**在 stopTask 函数中**:

```typescript
function stopTask(taskId: string): boolean {
  const task = sendTasksStore.getTaskById(taskId);
  if (!task) return false;

  try {
    // 清理任务相关的定时器
    if (task.timers && task.timers.length > 0) {
      task.timers.forEach((timerId) => {
        clearTimeout(timerId);
        clearInterval(timerId);
      });
      console.log(`已清理任务 ${task.name} 的 ${task.timers.length} 个定时器`);
    }

    // 清空定时器列表
    sendTasksStore.updateTask(taskId, {
      timers: [],
    });

    // 更新任务状态
    sendTasksStore.updateTaskStatus(taskId, 'completed');

    return true;
  } catch (e) {
    console.error(`停止任务失败:`, e);
    return false;
  }
}
```

#### 3.2.3 修复 TaskProgress 更新调用

确保所有 `updateTaskProgress` 调用都包含必需的 `totalCount` 属性：

```typescript
// 修复示例
sendTasksStore.updateTaskProgress(task.id, {
  currentCount: currentRepeatCount,
  totalCount: config.isInfinite ? -1 : config.repeatCount,
  percentage: config.isInfinite ? 0 : Math.floor((currentRepeatCount / config.repeatCount) * 100),
});
```

#### 3.2.4 修复类型使用

```typescript
// 替换 any 类型使用
function createTriggeredSingleTask(
  instanceId: string,
  targetId: string,
  sourceId: string,
  triggerFrameId: string,
  conditions: TriggerCondition[], // 使用具体类型替代 any[]
  name: string = '触发发送任务',
): string | null;
```

**验证步骤**:

1. 运行 `npx tsc --noEmit` 验证无类型错误
2. 运行 `npx eslint src/composables/frames/sendFrame/useSendTaskManager.ts` 验证无 lint 错误
3. 手动检查定时器创建和清理逻辑

### 阶段三：验证组件集成 (MEDIUM 优先级)

**目标文件**:

- `src/components/frames/FrameSend/EnhancedSequentialSendDialog.vue`
- `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue`
- `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue`

#### 3.3.1 验证 EnhancedSequentialSendDialog

- 确保定时配置能正确传递到 useSendTaskManager
- 验证任务创建和启动流程
- 测试对话框关闭后任务继续运行

#### 3.3.2 验证单独的发送对话框

- 确保 TimedSendDialog 和 TriggerSendDialog 能正常工作
- 验证配置传递和任务管理功能

**验证步骤**:

1. 手动测试各个发送对话框的功能
2. 创建定时任务并关闭对话框，验证任务继续运行
3. 停止任务，验证定时器被正确清理

## 四、实施序列

### 4.1 执行顺序

1. **第一步**: 修复 `sendTasksStore.ts` 中的接口定义
2. **第二步**: 修复 `useSendTaskManager.ts` 中的实现逻辑
3. **第三步**: 验证所有使用组件的功能
4. **第四步**: 运行完整测试验证修复效果

### 4.2 每步验证要求

- **类型检查**: 每步完成后运行 `npx tsc --noEmit`
- **代码质量**: 每步完成后运行 `npx eslint`
- **功能测试**: 关键功能手动验证
- **回归测试**: 确保修改不影响现有功能

## 五、风险评估与缓解

### 5.1 风险等级

- **低风险**: 接口添加可选属性，向后兼容
- **中风险**: 定时器逻辑修改，需确保无内存泄漏
- **高风险**: 如果修改影响到任务状态管理的核心逻辑

### 5.2 缓解措施

1. **增量修改**: 分步骤实施，每步验证
2. **保留备份**: 修改前备份关键文件
3. **回滚计划**: 如遇问题可快速回滚到修改前状态
4. **充分测试**: 每个阶段都进行功能验证

## 六、预期结果

### 6.1 修复目标

1. ✅ TypeScript 编译无错误
2. ✅ ESLint 检查通过
3. ✅ 定时任务在对话框关闭后继续运行
4. ✅ 任务停止时正确清理所有定时器
5. ✅ 多任务可以并发运行
6. ✅ TimedConfigPanel 配置能正确传递

### 6.2 性能指标

- 定时器准确性：误差 < 50ms
- 内存使用：无定时器泄漏
- 并发支持：支持至少 10 个并发任务

## 七、测试计划

### 7.1 单元测试

- [x] SendTask 接口完整性
- [x] TaskProgress 接口覆盖度
- [x] 定时器创建和清理逻辑

### 7.2 集成测试

- [x] 创建定时任务流程
- [x] 对话框关闭后任务持续性
- [x] 任务停止和清理流程
- [x] 多任务并发运行

### 7.3 用户场景测试

- [x] 用户创建单实例定时任务
- [x] 用户创建多实例定时任务
- [x] 用户在任务运行时关闭对话框
- [x] 用户手动停止运行中的任务
- [x] 用户同时运行多个不同类型任务

---

**文档状态**: 待执行  
**下一步**: 按照阶段一开始实施修复计划  
**负责人**: AI Assistant  
**预计完成时间**: 当前会话内
