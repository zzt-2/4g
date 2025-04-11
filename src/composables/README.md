# Composables (组合式函数)

这个目录包含了所有的组合式函数（Composables），用于处理应用中的各种功能逻辑。组合式函数是 Vue 3 Composition API 的核心概念，使得逻辑可以跨组件复用。

## 目录结构

```
composables/
├── serial/           # 串口相关的组合式函数
│   ├── useSerialPort.ts    # 串口连接管理
│   ├── useDataMonitor.ts   # 数据监控
│   └── useDataSend.ts      # 数据发送
│
├── frames/           # 帧相关的组合式函数
│   ├── useFrameList.ts     # 帧列表管理
│   ├── useFrameEditor.ts   # 帧编辑器
│   └── useFrameParser.ts   # 帧解析器
│
├── settings/         # 设置相关的组合式函数
│   ├── useAppSettings.ts   # 应用设置
│   └── useSerialSettings.ts # 串口设置
│
└── window/           # 窗口相关的组合式函数
    └── useWindowControls.ts # 窗口控制
```

## 设计理念

组合式函数的设计遵循以下原则：

1. **单一职责原则**：每个组合式函数只处理一个特定的功能领域，如串口连接、数据监控等
2. **高内聚低耦合**：函数内部逻辑紧密关联，与外部的依赖降到最低
3. **状态与逻辑分离**：将状态管理与业务逻辑分开，使代码更易于理解和维护
4. **类型安全**：使用 TypeScript 类型系统确保代码的正确性和可靠性
5. **响应式设计**：充分利用 Vue 3 的响应式系统，使得状态变化能够自动触发视图更新

## 使用规范

1. 每个组合式函数应该：

   - 使用 `<script setup lang="ts">` 语法
   - 返回一个对象，包含状态和方法
   - 使用 `ref` 和 `computed` 管理本地状态
   - 使用 `storeToRefs` 从 store 中提取响应式状态

2. 命名规范：

   - 文件名使用 `use` 前缀
   - 组件名使用 PascalCase 命名
   - 使用描述性的变量名，配合辅助动词（例如：isLoading, hasError）

3. 类型安全：

   - 使用 TypeScript 类型定义
   - 为所有参数和返回值定义类型
   - 使用 `defineProps` 和 `defineEmits` 定义组件接口

4. 错误处理：
   - 使用 try-catch 处理异步操作
   - 提供有意义的错误信息
   - 在控制台记录错误

## 组合式函数详解

### 串口相关（serial）

- **useSerialPort**：

  - 管理串口连接状态和操作
  - 提供连接、断开、刷新端口等功能
  - 跟踪连接状态和错误信息

- **useDataMonitor**：

  - 监控和过滤串口数据
  - 支持不同格式（HEX、ASCII、UTF8）的数据显示
  - 提供数据导出功能（CSV、TXT、JSON）

- **useDataSend**：
  - 发送串口数据
  - 支持定时发送功能
  - 处理不同格式的数据发送

### 帧相关（frames）

- **useFrameList**：

  - 管理帧模板列表
  - 提供搜索和排序功能
  - 处理帧模板的删除操作

- **useFrameEditor**：

  - 创建和编辑帧模板
  - 管理字段操作（添加、删除、更新）
  - 保存和验证帧模板

- **useFrameParser**：
  - 解析接收到的数据
  - 将原始数据映射到帧模板
  - 提供解析结果的格式化

### 设置相关（settings）

- **useAppSettings**：

  - 管理应用全局设置
  - 处理主题、语言等首选项
  - 保存和加载用户配置

- **useSerialSettings**：
  - 管理串口特定设置
  - 配置波特率、数据位等参数
  - 保存默认串口配置

### 窗口相关（window）

- **useWindowControls**：
  - 处理窗口操作：最小化、最大化、关闭
  - 监听窗口状态变化
  - 提供窗口状态的响应式数据

## 示例

### 在组件中使用

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useSerialPort, useDataMonitor } from '../composables';

// 使用串口连接组合式函数
const {
  availablePorts,
  selectedPort,
  connectionStatus,
  connect,
  disconnect,
  refreshPorts,
  selectPort,
} = useSerialPort();

// 使用数据监控组合式函数
const { messages, messageFormat, filterDirection, clearMessages } = useDataMonitor();

// 计算属性
const isConnected = computed(() => connectionStatus.value === 'connected');
const hasMessages = computed(() => messages.value.length > 0);

// 方法
const handleConnect = async () => {
  try {
    await connect();
  } catch (error) {
    console.error('连接失败:', error);
  }
};

// 生命周期
onMounted(() => {
  refreshPorts();
});
</script>
```

### 组合多个组合式函数

```typescript
// 创建一个新的组合式函数，组合多个现有函数
export function useSerialManager() {
  // 复用现有组合式函数
  const portUtils = useSerialPort();
  const dataMonitor = useDataMonitor();
  const dataSender = useDataSend();

  // 添加新的计算属性
  const canSendData = computed(
    () => portUtils.connectionStatus.value === 'connected' && !dataSender.sendButtonDisabled.value,
  );

  // 添加新的方法
  const sendAndClear = async () => {
    await dataSender.send();
    dataSender.clearSendData();
  };

  return {
    // 暴露所有现有功能
    ...portUtils,
    ...dataMonitor,
    ...dataSender,

    // 暴露新增的功能
    canSendData,
    sendAndClear,
  };
}
```

## 注意事项

1. **避免副作用**：在组合式函数中避免直接修改 DOM 或全局状态
2. **清理资源**：使用 `onUnmounted` 清理事件监听器、定时器等资源
3. **保持一致性**：遵循相同的模式和命名约定，使代码更易于理解
4. **文档注释**：为每个函数和关键逻辑添加清晰的注释
5. **测试友好**：设计组合式函数时考虑到可测试性

## 常见问题与解决方案

1. **响应式丢失**：

   - 问题：从 store 中提取的状态失去响应性
   - 解决：使用 `storeToRefs` 而不是解构赋值

2. **类型错误**：

   - 问题：类型不匹配导致编译错误
   - 解决：确保类型定义正确，必要时使用类型断言

3. **内存泄漏**：

   - 问题：事件监听器或定时器未清理导致内存泄漏
   - 解决：在 `onUnmounted` 中清理资源

4. **状态共享**：
   - 问题：多个组件需要共享状态
   - 解决：使用 Pinia store 或 provide/inject
