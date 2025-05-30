# 任务管理系统重设计需求文档

**创建时间**: 2024-12-19  
**问题类型**: 架构设计缺陷  
**影响范围**: 整个任务管理系统

## 一、当前问题分析

### 1.1 核心问题

**致命缺陷**: 任务生命周期与UI组件生命周期强耦合

在 `src/composables/frames/sendFrame/useSendTaskManager.ts` 第 1236-1245 行：

```typescript
onUnmounted(() => {
  // 停止所有正在运行的任务
  sendTasksStore.tasks.forEach((task) => {
    if (
      task.status === 'running' ||
      task.status === 'paused' ||
      task.status === 'waiting-trigger'
    ) {
      stopTask(task.id);
    }
  });
});
```

**问题链路**:

1. 用户在 `EnhancedSequentialSendDialog` 中创建并启动任务
2. 用户关闭对话框 → 组件被销毁
3. `useSendTaskManager` 的 `onUnmounted` 钩子触发
4. **强制停止所有运行中的任务**
5. 任务无法在后台继续执行

### 1.2 架构问题

1. **任务管理逻辑分散**

   - 任务创建在 `useSendTaskManager`
   - 任务存储在 `sendTasksStore`
   - 定时器管理在组件级 composable 中

2. **组件与业务逻辑强耦合**

   - 任务的执行依赖于组件存在
   - 关闭对话框 = 停止任务

3. **缺少全局任务监控**
   - 无法查看所有运行中的任务
   - 无法在不同界面间切换查看任务状态

## 二、目标需求

### 2.1 功能需求

1. **多任务并行执行**

   - ✅ 支持同时运行多个不同类型的任务
   - ✅ 每个任务独立执行，互不干扰
   - ✅ 支持单实例定时、多实例定时、触发等各种任务类型

2. **任务后台运行**

   - ✅ 关闭创建任务的对话框后，任务继续在后台执行
   - ✅ 任务的生命周期完全独立于UI组件
   - ✅ 定时器和任务状态持久化

3. **灵活的任务管理**

   - ✅ 可随时查看所有运行中的任务
   - ✅ 可在不同界面间切换观察任务执行情况
   - ✅ 可手动停止、暂停、恢复任何任务
   - ✅ 任务完成后自动清理或保留历史记录

4. **任务监控界面**
   - ✅ 全局任务监控面板
   - ✅ 实时显示任务状态、进度、错误信息
   - ✅ 支持按类型、状态筛选任务

### 2.2 技术需求

1. **架构解耦**

   - 任务管理完全独立于UI组件
   - 定时器和异步逻辑在 Store 层管理
   - 组件只负责UI展示和用户交互

2. **状态管理优化**

   - 任务状态集中管理
   - 支持状态持久化（可选）
   - 提供响应式的任务状态订阅

3. **错误处理和恢复**
   - 任务异常时不影响其他任务
   - 提供任务重试机制
   - 详细的错误日志和诊断信息

## 三、文件依赖关系分析

### 3.1 当前架构问题

```
当前架构 (有问题):
UI组件 → useSendTaskManager → sendTasksStore
   ↓         ↓                    ↓
组件销毁  定时器清理          任务被停止
```

### 3.2 核心依赖关系 (基于文件依赖关系图)

**useSendTaskManager.ts 的完整依赖网络**:

**直接依赖** (dependencies):

- `stores/serialStore.ts` - 串口通信
- `stores/frames/sendFrameInstancesStore.ts` - 帧实例管理
- `stores/frames/sendTasksStore.ts` - 任务状态管理
- `composables/useConnectionTargets.ts` - 连接目标管理
- `utils/common/fileDialogManager.ts` - 文件操作

**被影响的组件** (impacts):

- `components/frames/FrameSend/ActiveTasksMonitor.vue` - 任务监控面板
- `components/frames/FrameSend/EnhancedSequentialSendDialog.vue` - 多实例发送对话框
- `components/frames/FrameSend/TimedSend/TimedSendDialog.vue` - 定时发送对话框
- `components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue` - 触发发送对话框

### 3.3 具体影响分析

#### 3.3.1 直接影响的组件

1. **EnhancedSequentialSendDialog.vue** (HIGH影响)

   - **问题**: 关闭对话框会触发 onUnmounted → 停止所有任务
   - **修改需求**: 移除依赖组件生命周期的任务停止逻辑
   - **具体行为**:
     ```typescript
     // 当前行为 (有问题)
     function handleClose() {
       if (currentTaskId.value && isSending.value) {
         stopTask(currentTaskId.value); // 这里会停止任务
       }
       emit('close');
     }
     ```

2. **TimedSendDialog.vue** (HIGH影响)

   - **问题**: 同样存在关闭对话框停止任务的逻辑
   - **修改需求**: 提供"后台运行"选项，而不是强制停止

3. **TriggerSendDialog.vue** (HIGH影响)

   - **问题**: 触发任务也会因组件销毁而停止
   - **修改需求**: 支持后台持续监听触发条件

4. **ActiveTasksMonitor.vue** (MEDIUM影响)
   - **当前作用**: 显示活动任务，但无法控制任务生命周期
   - **增强需求**: 成为真正的全局任务管理界面

#### 3.3.2 间接影响的文件

1. **FrameSendPage.vue** (父页面)

   - **影响**: 需要集成新的任务监控界面
   - **修改**: 添加全局任务监控入口

2. **sendTasksStore.ts** (核心Store)

   - **影响**: 需要承担更多任务执行职责
   - **修改**: 添加后台任务执行引擎

3. **sendFrameInstancesStore.ts** (数据源)
   - **影响**: 任务执行时需要访问实例数据
   - **修改**: 确保数据访问的稳定性

## 四、详细修改计划

### 阶段一：移除组件级任务清理 (CRITICAL)

**目标**: 修复关闭对话框停止任务的问题

#### 4.1.1 useSendTaskManager.ts 修改

**文件**: `src/composables/frames/sendFrame/useSendTaskManager.ts`

**修改**:

```typescript
// 🚫 移除这段代码 (第1236-1244行)
onUnmounted(() => {
  sendTasksStore.tasks.forEach((task) => {
    if (
      task.status === 'running' ||
      task.status === 'paused' ||
      task.status === 'waiting-trigger'
    ) {
      stopTask(task.id);
    }
  });
});
```

**影响分析**: 移除后，所有使用此 composable 的组件都不会在卸载时自动停止任务

#### 4.1.2 组件行为适配修改

**需要修改的组件**:

1. **EnhancedSequentialSendDialog.vue**

   - **当前问题**: `handleClose()` 中强制停止任务
   - **修改策略**: 提供用户选择（继续后台运行 or 停止任务）
   - **具体修改**:
     ```typescript
     // 新的关闭处理逻辑
     async function handleClose() {
       if (currentTaskId.value && isSending.value) {
         // 弹出确认对话框，让用户选择
         const shouldContinue = await showTaskContinueDialog();
         if (!shouldContinue) {
           stopTask(currentTaskId.value);
         }
       }
       emit('close');
     }
     ```

2. **TimedSendDialog.vue**

   - **修改**: 同样添加用户选择逻辑
   - **增强**: 显示"任务将在后台继续运行"提示

3. **TriggerSendDialog.vue**
   - **修改**: 对于触发任务，默认后台运行
   - **提示**: 显示"触发监听已启动，将在后台运行"

### 阶段二：Store 层任务引擎 (HIGH)

**目标**: 将任务执行逻辑移到 Store 层

#### 4.2.1 sendTasksStore.ts 增强

**文件**: `src/stores/frames/sendTasksStore.ts`

**新增功能**:

1. **全局定时器管理**

   ```typescript
   // 全局定时器管理
   const globalTimers = new Map<string, number[]>();

   function addTaskTimer(taskId: string, timerId: number): void {
     if (!globalTimers.has(taskId)) {
       globalTimers.set(taskId, []);
     }
     globalTimers.get(taskId)!.push(timerId);
   }

   function clearTaskTimers(taskId: string): void {
     const timers = globalTimers.get(taskId);
     if (timers) {
       timers.forEach((id) => clearTimeout(id));
       globalTimers.delete(taskId);
     }
   }
   ```

2. **后台任务执行引擎**

   ```typescript
   // 后台任务管理
   const backgroundTasks = ref<Set<string>>(new Set());

   function setTaskBackground(taskId: string): void {
     backgroundTasks.value.add(taskId);
   }

   function removeTaskBackground(taskId: string): void {
     backgroundTasks.value.delete(taskId);
   }
   ```

3. **任务执行引擎**

   ```typescript
   // 独立的任务执行方法
   function executeTimedTask(taskId: string): void {
     // 从 useSendTaskManager 移过来的执行逻辑
   }

   function executeTriggerTask(taskId: string): void {
     // 触发任务执行逻辑
   }
   ```

#### 4.2.2 useSendTaskManager.ts 重构

**修改策略**:

- 保留任务创建接口
- 移除定时器管理逻辑 → 移到 Store
- 移除 onUnmounted 清理 → 由 Store 管理
- 添加后台运行控制接口

### 阶段三：全局任务监控 (MEDIUM)

**目标**: 创建独立的任务监控界面

#### 4.3.1 新建全局任务监控组件

**新文件**: `src/components/common/TaskMonitor.vue`

**功能设计**:

1. **全局任务列表**: 显示所有运行中的任务
2. **任务控制**: 停止、暂停、恢复任何任务
3. **实时状态**: 任务进度、错误信息、执行时间
4. **筛选功能**: 按类型、状态、创建时间筛选
5. **任务详情**: 点击任务查看详细信息

#### 4.3.2 ActiveTasksMonitor.vue 增强

**修改**: 从简单的监控面板升级为完整的任务管理界面
**新增功能**:

- 任务创建入口
- 批量操作（停止所有、清理完成任务）
- 任务导入/导出

### 阶段四：组件行为优化 (LOW)

**目标**: 优化任务创建对话框的用户体验

#### 4.4.1 对话框关闭行为优化

**所有任务创建对话框的统一优化**:

1. **任务创建成功后的提示**:

   ```vue
   <q-banner v-if="taskCreated" class="text-positive">
     <template v-slot:avatar>
       <q-icon name="check_circle" color="positive" />
     </template>
     任务已创建并开始执行
     <template v-slot:action>
       <q-btn flat label="查看任务" @click="openTaskMonitor" />
       <q-btn flat label="后台运行" @click="runInBackground" />
     </template>
   </q-banner>
   ```

2. **关闭确认对话框**:
   ```vue
   <q-dialog v-model="showCloseConfirm">
     <q-card>
       <q-card-section>
         <div class="text-h6">任务正在运行</div>
       </q-card-section>
       <q-card-section>
         任务将继续在后台运行，您可以随时通过任务监控查看进度。
       </q-card-section>
       <q-card-actions align="right">
         <q-btn flat label="停止任务" color="negative" @click="stopAndClose" />
         <q-btn flat label="后台运行" color="primary" @click="backgroundAndClose" />
       </q-card-actions>
     </q-card>
   </q-dialog>
   ```

#### 4.4.2 页面集成优化

**FrameSendPage.vue 修改**:

1. 添加全局任务监控区域
2. 提供快速访问任务监控的入口
3. 显示当前运行任务数量

## 五、完整影响文件列表

### 5.1 必须修改的文件 (P0-P1)

```yaml
核心文件:
  - src/composables/frames/sendFrame/useSendTaskManager.ts (移除onUnmounted)
  - src/stores/frames/sendTasksStore.ts (添加后台执行引擎)

组件文件:
  - src/components/frames/FrameSend/EnhancedSequentialSendDialog.vue (关闭行为)
  - src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue (关闭行为)
  - src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue (关闭行为)
  - src/components/frames/FrameSend/ActiveTasksMonitor.vue (功能增强)

新增文件:
  - src/components/common/TaskMonitor.vue (全局任务监控)
  - src/composables/useGlobalTaskManager.ts (全局任务管理)
```

### 5.2 可能需要调整的文件 (P2-P3)

```yaml
页面文件:
  - src/pages/FrameSendPage.vue (集成任务监控)

存储文件:
  - src/stores/frames/sendFrameInstancesStore.ts (数据访问优化)
  - src/stores/serialStore.ts (确保稳定性)

工具文件:
  - src/utils/common/fileDialogManager.ts (任务配置导入导出)
  - src/composables/useConnectionTargets.ts (连接稳定性)
```

## 六、实施优先级

### P0 - 立即修复 (关键问题)

- [x] 移除 `useSendTaskManager.ts` 中的 `onUnmounted` 任务清理

### P1 - 核心功能 (本周完成)

- [ ] Store 层任务引擎实现
- [ ] 定时器管理重构
- [ ] 后台任务运行能力
- [ ] 组件关闭行为适配

### P2 - 用户体验 (下周完成)

- [ ] 全局任务监控界面
- [ ] 对话框行为优化
- [ ] 任务状态持久化

### P3 - 增强功能 (后续迭代)

- [ ] 任务重试机制
- [ ] 任务调度优化
- [ ] 性能监控和分析

## 七、验收标准

### 7.1 功能验收

1. **后台运行测试**

   - [ ] 创建定时任务 → 关闭对话框 → 任务继续运行
   - [ ] 创建多个任务 → 同时运行 → 相互独立

2. **任务管理测试**

   - [ ] 全局任务监控可显示所有任务
   - [ ] 可从监控界面控制任务（停止/暂停/恢复）
   - [ ] 任务状态实时更新

3. **稳定性测试**
   - [ ] 长时间运行任务不崩溃
   - [ ] 大量并发任务性能稳定
   - [ ] 页面刷新后任务状态恢复

### 7.2 代码质量验收

1. **架构清晰**

   - [ ] UI组件与业务逻辑解耦
   - [ ] Store层职责明确
   - [ ] 定时器管理集中化

2. **错误处理完善**
   - [ ] 任务异常不影响其他任务
   - [ ] 详细的错误日志
   - [ ] 优雅的降级处理

## 八、风险评估

### 8.1 技术风险

- **中等风险**: Store层重构可能影响现有功能
- **缓解**: 分阶段实施，保持向后兼容

### 8.2 用户体验风险

- **低风险**: 界面变化相对较小
- **缓解**: 保持现有操作流程，增强而非替换

### 8.3 性能风险

- **低风险**: 定时器管理优化可能提升性能
- **缓解**: 添加性能监控，及时发现问题

---

**下一步行动**: 根据此需求文档和依赖关系分析，立即开始 P0 级别的关键修复工作。
