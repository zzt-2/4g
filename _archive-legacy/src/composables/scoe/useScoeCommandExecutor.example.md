# useScoeCommandExecutor 使用示例

## 基本用法

### 1. 在组件中引入并执行指令

```typescript
import { useScoeCommandExecutor } from '@/composables/scoe/useScoeCommandExecutor';
import { useScoeFrameInstancesStore } from '@/stores/frames/scoeFrameInstancesStore';

// 在 setup 中
const { executeCommand, executeCommandByCode, validateCommand } = useScoeCommandExecutor();
const scoeFrameInstancesStore = useScoeFrameInstancesStore();

// 执行指定的指令
const handleExecuteCommand = async () => {
  const command = scoeFrameInstancesStore.selectedReceiveCommand;
  if (!command) {
    console.error('未选中任何指令');
    return;
  }

  // 先验证
  const validation = validateCommand(command);
  if (!validation.valid) {
    console.error('指令验证失败:', validation.message);
    return;
  }

  // 执行指令
  const result = await executeCommand(command);

  if (result.success) {
    console.log('执行成功:', result.message);
  } else {
    console.error('执行失败:', result.message);
  }

  console.log('执行耗时:', result.duration, 'ms');
};

// 通过功能码执行
const handleExecuteByCode = async (code: string) => {
  const result = await executeCommandByCode(code);
  if (result) {
    console.log('执行结果:', result);
  } else {
    console.error('未找到对应的指令');
  }
};
```

### 2. 批量执行指令

```typescript
// 并行执行多个指令
const executeMultipleCommands = async () => {
  const commands = scoeFrameInstancesStore.receiveCommands;
  const results = await executeCommands(commands);

  const successCount = results.filter((r) => r.success).length;
  console.log(`成功执行 ${successCount}/${results.length} 个指令`);
};

// 顺序执行（一个接一个）
const executeSequentially = async () => {
  const commands = scoeFrameInstancesStore.receiveCommands;
  const results = await executeCommands(commands, true);

  // 顺序执行适合有依赖关系的指令
  // 例如：先加载卫星ID，再加载SCOE帧
};
```

## 添加新功能的步骤

### 步骤 1：在 `useScoeCommandExecutor.ts` 中添加执行器函数

```typescript
/**
 * 新功能：例如重启系统
 */
const executeRestartSystem: CommandExecutor = async (context) => {
  const { scoeStore } = context;

  try {
    // 1. 执行前置检查
    if (scoeStore.status.loadedSatelliteId) {
      return {
        success: false,
        message: '请先卸载卫星ID再重启系统',
      };
    }

    // 2. 调用实际的重启逻辑
    // await someRestartAPI();

    // 3. 更新状态
    // scoeStore.status.xxx = 'restarting';

    return {
      success: true,
      message: '系统重启成功',
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '重启失败',
    };
  }
};
```

### 步骤 2：在枚举中添加新功能（如果需要）

在 `src/types/scoe/receiveCommand.ts` 中：

```typescript
export enum ScoeCommandFunction {
  // ... 现有功能
  RESTART_SYSTEM = 'restart_system', // 新增
}

export const commandFunctionOptions = [
  // ... 现有选项
  { label: '重启系统', value: ScoeCommandFunction.RESTART_SYSTEM }, // 新增
];
```

### 步骤 3：更新执行器映射表

```typescript
const executorMap: Record<ScoeCommandFunction, CommandExecutor> = {
  // ... 现有映射
  [ScoeCommandFunction.RESTART_SYSTEM]: executeRestartSystem, // 新增
};
```

### 步骤 4：在编辑器中添加功能说明（可选）

在 `SCOEFrameInstanceEditor.vue` 中：

```typescript
const functionDescriptionMap: Record<ScoeCommandFunction, string> = {
  // ... 现有说明
  [ScoeCommandFunction.RESTART_SYSTEM]: '重启SCOE系统，清除所有运行状态', // 新增
};
```

**完成！** 现在新功能已经可以使用了。

## 实现具体功能的示例

### 示例 1：实现"加载卫星ID"功能

```typescript
const executeLoadSatelliteId: CommandExecutor = async (context) => {
  const { scoeStore } = context;

  try {
    // 1. 检查是否已加载
    if (scoeStore.status.loadedSatelliteId) {
      return {
        success: false,
        message: `已加载卫星ID: ${scoeStore.status.loadedSatelliteId}，请先卸载`,
      };
    }

    // 2. 获取选中的配置
    const selectedConfig = scoeStore.selectedConfig;
    if (!selectedConfig) {
      return {
        success: false,
        message: '未选择卫星配置',
      };
    }

    // 3. 调用加载API（假设有这个API）
    // const result = await scoeAPI.loadSatelliteId(selectedConfig.satelliteId);

    // 4. 更新状态
    scoeStore.status.loadedSatelliteId = selectedConfig.satelliteId;
    scoeStore.status.satelliteIdRuntimeSeconds = 0;

    return {
      success: true,
      message: `成功加载卫星ID: ${selectedConfig.satelliteId}`,
      data: {
        satelliteId: selectedConfig.satelliteId,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '加载失败',
    };
  }
};
```

### 示例 2：实现"健康自检"功能

```typescript
const executeHealthCheck: CommandExecutor = async (context) => {
  const { scoeStore } = context;

  try {
    // 1. 检查各个模块
    const checks = {
      tcpConnection: scoeStore.tcpConnected,
      udpConnection: scoeStore.udpConnected,
      satelliteLoaded: !!scoeStore.status.loadedSatelliteId,
      framesLoaded: scoeStore.status.scoeFramesLoaded,
    };

    // 2. 计算健康状态
    const allHealthy = Object.values(checks).every((v) => v);
    const someHealthy = Object.values(checks).some((v) => v);

    let healthStatus: 'healthy' | 'warning' | 'error';
    if (allHealthy) {
      healthStatus = 'healthy';
    } else if (someHealthy) {
      healthStatus = 'warning';
    } else {
      healthStatus = 'error';
    }

    // 3. 更新状态
    scoeStore.status.healthStatus = healthStatus;

    // 4. 生成报告
    const failedChecks = Object.entries(checks)
      .filter(([_, passed]) => !passed)
      .map(([name]) => name);

    return {
      success: allHealthy || someHealthy,
      message: allHealthy ? '系统健康' : `部分模块异常: ${failedChecks.join(', ')}`,
      data: {
        checks,
        healthStatus,
        failedChecks,
      },
    };
  } catch (error) {
    scoeStore.status.healthStatus = 'error';
    return {
      success: false,
      message: error instanceof Error ? error.message : '自检失败',
    };
  }
};
```

## 高级用法

### 1. 带进度回调的执行

```typescript
const executeWithProgress = async (
  command: ScoeReceiveCommand,
  onProgress: (progress: number) => void,
) => {
  // 可以扩展 CommandExecutionContext 来支持进度回调
  // 或者在具体的执行器中实现进度报告逻辑

  onProgress(0);
  const result = await executeCommand(command);
  onProgress(100);

  return result;
};
```

### 2. 带重试机制的执行

```typescript
const executeWithRetry = async (
  command: ScoeReceiveCommand,
  maxRetries = 3,
  retryDelay = 1000,
): Promise<CommandExecutionResult> => {
  let lastError: CommandExecutionResult | null = null;

  for (let i = 0; i < maxRetries; i++) {
    const result = await executeCommand(command);

    if (result.success) {
      return result;
    }

    lastError = result;
    console.warn(`执行失败，重试 ${i + 1}/${maxRetries}:`, result.message);

    if (i < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  return (
    lastError || {
      success: false,
      message: '重试次数已用尽',
    }
  );
};
```

### 3. 条件执行

```typescript
const executeConditionally = async (
  command: ScoeReceiveCommand,
  condition: () => boolean,
): Promise<CommandExecutionResult> => {
  if (!condition()) {
    return {
      success: false,
      message: '不满足执行条件',
    };
  }

  return executeCommand(command);
};

// 使用示例
const result = await executeConditionally(
  loadSatelliteIdCommand,
  () => !scoeStore.status.loadedSatelliteId,
);
```

## 最佳实践

1. **错误处理**: 每个执行器都应该有完善的 try-catch 错误处理
2. **状态更新**: 执行前后都要更新相应的状态
3. **日志记录**: 使用 console.log 记录关键步骤
4. **验证检查**: 执行前进行必要的前置条件检查
5. **返回详细信息**: 在 `data` 字段中返回有用的执行结果数据
6. **保持简洁**: 每个执行器专注于单一功能
7. **异步友好**: 所有执行器都是异步的，便于处理网络请求等操作

## 测试建议

```typescript
// 单元测试示例
describe('useScoeCommandExecutor', () => {
  it('应该成功执行健康自检', async () => {
    const { executeCommand } = useScoeCommandExecutor();

    const command: ScoeReceiveCommand = {
      id: '1',
      label: '健康自检',
      code: '0x01',
      function: ScoeCommandFunction.HEALTH_CHECK,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await executeCommand(command);

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('message');
    expect(result).toHaveProperty('duration');
  });
});
```
