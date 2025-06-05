# 触发帧选择功能测试

> 验证触发帧选择只显示接收帧的功能是否正常工作
> 创建时间: 2025-01-16

## 测试目标

验证在触发发送配置界面中，触发帧下拉框只显示方向为 `'receive'` 的帧，不显示发送帧。

## 测试前提条件

1. 系统中存在至少一个接收帧（`direction: 'receive'`）
2. 系统中存在至少一个发送帧（`direction: 'send'`）
3. 确保 `receiveFramesStore` 正确加载帧数据

## 测试步骤

### 步骤1：准备测试数据

确保 `frameTemplateStore.frames` 中包含以下类型的帧：

```typescript
// 接收帧示例
{
  id: 'receive_frame_1',
  name: '温度传感器数据',
  direction: 'receive',
  fields: [
    { id: 'temp_field', name: '温度值' },
    { id: 'humid_field', name: '湿度值' }
  ]
}

// 发送帧示例
{
  id: 'send_frame_1',
  name: '控制指令',
  direction: 'send',
  fields: [
    { id: 'cmd_field', name: '指令类型' }
  ]
}
```

### 步骤2：打开触发发送配置界面

1. 进入发送帧管理页面
2. 选择一个发送帧实例
3. 点击"触发发送设置"按钮
4. 打开 `TriggerSendDialog.vue` 组件

### 步骤3：验证触发帧下拉框

1. 定位到"触发帧（仅接收帧）"下拉框
2. 点击下拉框展开选项列表
3. 验证以下内容：
   - ✅ 只显示 `direction: 'receive'` 的帧
   - ✅ 不显示 `direction: 'send'` 的帧
   - ✅ 如果没有接收帧，显示"无可用的接收帧"
   - ✅ 标签显示为"触发帧（仅接收帧）"

### 步骤4：验证 ConditionTriggerPanel 组件

1. 切换到条件触发模式（如果有多种模式）
2. 验证条件触发面板中的触发帧选择器
3. 确认行为与主对话框一致

## 预期结果

### 正确行为

- 触发帧下拉框只显示接收帧
- 界面标签明确标识"仅接收帧"
- 空状态提示为"无可用的接收帧"
- 选择接收帧后，字段列表正确显示该帧的字段

### 错误行为（需要修复）

- 显示发送帧选项
- 显示所有类型的帧
- 空状态提示不准确
- 选择帧后字段不匹配

## 技术验证

### 代码层面验证

1. **TriggerSendDialog.vue**：

   ```typescript
   // 应该使用 receiveFramesStore.receiveFrames
   const frameOptions = computed(() =>
     receiveFramesStore.receiveFrames.map((frame) => ({
       id: frame.id,
       name: frame.name,
       fields:
         frame.fields?.map((field) => ({
           id: field.id,
           name: field.name,
         })) || [],
     })),
   );
   ```

2. **ConditionTriggerPanel.vue**：
   ```typescript
   // 应该有独立的 receiveFrameOptions 计算属性
   const receiveFrameOptions = computed(() =>
     receiveFramesStore.receiveFrames.map((frame) => ({
       id: frame.id,
       name: frame.name,
       fields:
         frame.fields?.map((field) => ({
           id: field.id,
           name: field.name,
         })) || [],
     })),
   );
   ```

### 数据流验证

1. `frameTemplateStore.frames` → 过滤 → `receiveFramesStore.receiveFrames`
2. `receiveFrames` → 映射 → `frameOptions/receiveFrameOptions`
3. 界面绑定到 `frameOptions/receiveFrameOptions`

## 故障排除

### 如果仍显示发送帧

1. 检查是否正确导入 `useReceiveFramesStore`
2. 确认使用 `receiveFramesStore.receiveFrames` 而非 `frameTemplateStore.frames`
3. 验证 `receiveFrames` 计算属性的过滤逻辑

### 如果没有显示任何帧

1. 检查 `frameTemplateStore.frames` 是否包含接收帧
2. 确认 `frame.direction === 'receive'` 的逻辑正确
3. 验证 `receiveFramesStore` 是否正确初始化

### 如果字段不匹配

1. 确认字段映射逻辑使用正确的数据源
2. 检查 `triggerFrameFields` 计算属性
3. 验证字段 ID 和名称的映射

## 测试完成标准

- [x] 触发帧下拉框只显示接收帧
- [x] 界面文本正确标识"仅接收帧"
- [x] 空状态提示准确
- [x] 字段选择逻辑正确
- [x] 多个组件行为一致
- [x] 没有控制台错误
- [x] 用户体验良好

## 补充说明

这个修改是为了确保触发监听机制的逻辑正确性。只有接收帧才能作为触发源，因为：

1. **数据流向**：接收帧处理接收到的数据，可以触发后续动作
2. **逻辑合理性**：发送帧用于发送数据，不应作为触发源
3. **用户体验**：减少选择混乱，避免配置错误

这个改进是触发监听机制实施计划中阶段六的重要组成部分。
