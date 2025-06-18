# 高速存储连接ID匹配优化

## 背景问题

原始实现中，高速存储的连接ID选择存在匹配问题：

- **界面层**：使用手动输入连接ID，容易出错
- **匹配逻辑**：直接字符串匹配，无法处理复合ID格式
- **用户体验**：需要用户手动输入复杂的连接ID

## 实际连接ID格式分析

### 网络连接实际ID

```
conn_1749440546668_6trm91uxw  // 主连接ID
```

### useConnectionTargets生成的目标ID

```
network:conn_1749440546668_6trm91uxw:remote_1749452903711_io3wcx229
```

格式：`network:${主连接ID}:${远程主机ID}`

## 解决方案

### 1. 界面优化

- 移除手动输入连接ID字段
- 使用 `useConnectionTargets` 提供连接选择下拉框
- 只显示网络类型连接
- 自动刷新可用连接列表

### 2. ID解析逻辑

```typescript
// 解析useConnectionTargets格式的ID
private parseConnectionId(targetId: string): string {
  if (targetId.startsWith('network:')) {
    const parts = targetId.split(':');
    if (parts.length >= 2 && parts[1]) {
      return parts[1]; // 返回实际的连接ID
    }
  }
  return targetId;
}
```

### 3. 匹配流程

1. 用户在界面选择连接目标
2. 存储复合格式的目标ID
3. 数据接收时解析出实际连接ID
4. 与网络处理器的连接ID匹配

## 修改的文件

### 界面组件

- `src/components/storage/HighSpeedStoragePanel.vue`
  - 集成 `useConnectionTargets`
  - 替换手动输入为下拉选择
  - 添加连接状态显示

### 存储管理器

- `src-electron/main/ipc/highSpeedStorageHandlers.ts`
  - 添加 `parseConnectionId` 方法
  - 优化 `shouldStore` 匹配逻辑

## 使用流程

1. **选择连接**：从下拉框选择可用的网络连接
2. **配置规则**：设置规则名称和帧头模式
3. **启用存储**：开启存储功能
4. **自动匹配**：系统自动匹配网络数据并存储

## 技术优势

- **用户友好**：无需手动输入复杂ID
- **自动同步**：连接列表自动更新
- **格式兼容**：支持多种ID格式
- **错误减少**：避免手动输入错误

## 测试验证

1. 建立网络连接（UDP/TCP）
2. 在存储页面选择对应连接
3. 配置帧头模式（如 "AABBCC"）
4. 启用存储功能
5. 发送匹配数据验证存储效果
