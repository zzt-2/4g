# 串口帧发送功能设计文档

## 架构设计

根据架构层级规则，串口发送功能按以下方式规划：

### 1. 从帧实例提取有效数据的部分（核心转换逻辑）

- **文件位置**: `utils/frames/frameDataUtils.ts`
- **职责**: 纯函数，无状态，将帧实例转换为可发送的二进制数据
- **导出示例**: `export function frameToBuffer(frameInstance: FrameInstance): Uint8Array`
- **依赖**: 只依赖 types 中的类型定义

### 2. 串口通信 API（与硬件交互）

- **文件位置**: `electron/preload/api/serial.ts`
- **职责**: 提供与串口设备通信的接口
- **导出示例**: `export const sendData = (data: Uint8Array) => ipcRenderer.invoke('serial:send', data)`

### 3. 串口状态管理

- **文件位置**: `stores/serialStore.ts` (已有)
- **职责**: 管理串口连接状态、配置和基本操作

### 4. 串口操作逻辑（业务层）

- **文件位置**: `composables/useSerialCommunication.ts`
- **职责**: 协调帧数据和串口操作，处理发送逻辑
- **导出示例**: `export function useSerialCommunication() { return { sendFrameInstance } }`
- **依赖**: serialStore, frameDataUtils, types

### 5. 相关类型定义

- **文件位置**: `types/serial.ts` 和 `types/frames.ts`
- **职责**: 定义串口配置和帧数据相关类型

### 6. 配置和默认值

- **文件位置**: `config/serialDefaults.ts`
- **职责**: 存放串口通信的默认设置

## 数据流

1. 用户在 UI 选择帧实例，点击发送
2. 页面组件调用 composable 中的 sendFrameInstance 方法
3. composable 从 store 获取帧实例数据
4. 调用 utils 中的 frameToBuffer 将实例转换为二进制数据
5. 调用 API 发送数据到串口
6. 反馈发送结果到 UI

## 异常处理

- 串口未连接：在 composable 层检查，返回错误信息
- 数据转换错误：在 utils 层捕获，向上抛出有意义的错误
- 发送失败：在 API 层捕获硬件错误，向上返回错误码和描述
