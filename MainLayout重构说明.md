# MainLayout 重构说明

## 重构目标

将 MainLayout.vue 中的所有业务逻辑提取到 composables 中，使主文件保持简洁清晰。

## 重构前后对比

### 重构前

- **MainLayout.vue**: 218 行
  - Template: 30 行
  - Script: 158 行（大量业务逻辑）
  - Style: 25 行

### 重构后

- **MainLayout.vue**: 76 行（减少 142 行，减少 65%）

  - Template: 30 行（保持不变）
  - Script: 16 行（只有引入和调用）
  - Style: 25 行（保持不变）

- **新增 Composables**:
  - `useFileDialog.ts`: 89 行
  - `useAppLifecycle.ts`: 106 行
  - `useLayoutDrawer.ts`: 23 行

## 文件结构

```
src/layouts/
├── MainLayout.vue (极简化，只有模板和调用)
├── useFileDialog.ts (文件对话框逻辑)
├── useAppLifecycle.ts (应用生命周期逻辑)
└── useLayoutDrawer.ts (抽屉/侧边栏逻辑)
```

## Composables 职责

### 1. useFileDialog.ts

**职责**：处理全局文件对话框的状态和事件

**功能**：

- 管理文件对话框状态（isOpen, title, storageDir, operation, requestId）
- 监听 EventBus 的 `FILE_DIALOG_OPEN` 事件
- 处理文件选择、创建和关闭事件
- 发送 `FILE_DIALOG_RESULT` 事件给 fileDialogManager

**导出**：

```typescript
{
  fileDialogState,        // 对话框状态
  handleFileSelect,       // 文件选择处理
  handleFileCreate,       // 文件创建处理
  handleFileDialogClose,  // 对话框关闭处理
}
```

### 2. useAppLifecycle.ts

**职责**：处理应用的初始化和清理逻辑

**功能**：

- `onBeforeMount`: 初始化所有 store
  - 加载帧模板和实例
  - 刷新串口列表
  - 初始化全局统计
  - 启动数据收集
  - 自动开始记录（如果配置了）
- `onUnmounted`: 清理资源
  - 停止数据记录
  - 停止数据收集
  - 清理统计数据
  - 保存配置

**导出**：

```typescript
{
  // 所有 store 实例
  receiveFramesStore,
  frameTemplateStore,
  sendFrameInstancesStore,
  serialStore,
  dataDisplayStore,
  settingsStore,
  globalStatsStore,
  scoeStore,
  connectionTargetsStore,
}
```

### 3. useLayoutDrawer.ts

**职责**：处理侧边栏/抽屉的状态和交互

**功能**：

- 管理抽屉状态（打开/关闭、宽度、mini模式）
- 提供切换抽屉的方法
- 通过 `provide` 向子组件提供 toggleDrawer 方法

**导出**：

```typescript
{
  leftDrawerOpen,  // 抽屉是否打开
  drawerWidth,     // 抽屉宽度
  miniState,       // 是否为 mini 模式
  toggleDrawer,    // 切换抽屉方法
}
```

## MainLayout.vue 简化后的代码

```vue
<script setup lang="ts">
import HeaderBar from '../components/layout/HeaderBar.vue';
import SidePanel from '../components/layout/SidePanel.vue';
import FileListDialog from '../components/common/FileListDialog.vue';
import { useFileDialog } from './useFileDialog';
import { useAppLifecycle } from './useAppLifecycle';
import { useLayoutDrawer } from './useLayoutDrawer';

// 抽屉/侧边栏逻辑
const { leftDrawerOpen, drawerWidth, miniState } = useLayoutDrawer();

// 文件对话框逻辑
const { fileDialogState, handleFileSelect, handleFileCreate, handleFileDialogClose } =
  useFileDialog();

// 应用生命周期逻辑
useAppLifecycle();
</script>
```

## 优势

### 1. 可维护性

- ✅ **职责单一**：每个 composable 只负责一个领域
- ✅ **易于定位**：需要修改某个功能，直接找对应的 composable
- ✅ **代码清晰**：MainLayout 只有模板和几行调用代码

### 2. 可测试性

- ✅ **独立测试**：每个 composable 可以独立测试
- ✅ **模拟简单**：不需要创建完整的组件实例
- ✅ **覆盖全面**：业务逻辑都在 composable 中，易于覆盖

### 3. 可复用性

- ✅ **逻辑复用**：composable 可以在其他组件中复用
- ✅ **组合灵活**：可以选择性地使用某些 composable
- ✅ **扩展方便**：添加新功能只需创建新的 composable

### 4. 可读性

- ✅ **一目了然**：MainLayout 的代码结构清晰
- ✅ **命名明确**：useFileDialog、useAppLifecycle 等名称表意清晰
- ✅ **注释完整**：每个 composable 都有详细的 JSDoc 注释

## 最佳实践

### 1. Composable 命名

- 使用 `use` 前缀
- 名称要准确描述功能
- 例如：`useFileDialog`、`useAppLifecycle`

### 2. Composable 组织

- 按功能领域分组
- 保持职责单一
- 相关逻辑放在同一个 composable 中

### 3. 导出内容

- 只导出必要的状态和方法
- 内部辅助函数不导出
- 使用解构导出，方便使用

### 4. 放置位置

- 通用 composables 放在 `src/composables/`
- 特定于某个组件的 composables 放在组件同目录
- 布局相关的 composables 放在 `src/layouts/`

## 未来扩展

如果需要添加新功能，只需：

1. 创建新的 composable 文件
2. 在 MainLayout.vue 中引入和调用
3. 在模板中使用导出的状态和方法

例如添加通知系统：

```typescript
// useNotifications.ts
export function useNotifications() {
  // ... 通知相关逻辑
}

// MainLayout.vue
import { useNotifications } from './useNotifications';
const { notifications, showNotification } = useNotifications();
```

## 总结

通过将业务逻辑提取到 composables：

- MainLayout.vue 从 218 行减少到 76 行（减少 65%）
- 代码结构更清晰，职责更明确
- 提高了可维护性、可测试性和可复用性
- 符合 Vue 3 Composition API 的最佳实践
