# SCOE 接收帧功能实现总结

## 📋 项目概述

本次实现了完整的 SCOE（卫星综合测试设备）帧接收、识别和指令执行功能。系统能够从 TCP Server 接收数据，自动识别 SCOE 帧格式，并根据功能码执行相应的指令。

---

## ✅ 已完成功能清单

### 1. 类型定义扩展

#### `src/types/scoe/index.ts`

- ✅ **ScoeGlobalConfig** 添加字节偏移量配置：
  - `messageIdentifierOffset`: 信息标识起始字节（默认：0）
  - `sourceIdentifierOffset`: 信源标识起始字节（默认：1）
  - `destinationIdentifierOffset`: 信宿标识起始字节（默认：2）
  - `modelIdOffset`: 型号ID起始字节（默认：3）
  - `satelliteIdOffset`: 卫星ID起始字节（默认：7）
  - `functionCodeOffset`: 功能码起始字节（默认：11）

#### `src/types/scoe/receiveCommand.ts`

- ✅ **ScoeErrorReason** 枚举：
  ```typescript
  enum ScoeErrorReason {
    NONE = '无错误',
    SATELLITE_ID_NOT_FOUND = '请求加载卫星ID不存在',
    SATELLITE_CONFIG_INCOMPLETE = '请求加载卫星ID配置不完整',
    COMMAND_CODE_NOT_FOUND = '未找到功能码对应的指令',
  }
  ```

---

### 2. SCOE 帧识别工具

#### `src/utils/receive/scoeFrame.ts`

**核心函数：**

```typescript
isScoeFrame(
  data: Uint8Array,
  loadedConfig: ScoeSatelliteConfig | undefined,
  globalConfig: ScoeGlobalConfig,
  scoeFramesLoaded: boolean
): ScoeFrameCheckResult
```

**识别流程：**

#### 第一步：验证功能码（总是执行）

```
功能码结构（4字节）：
┌─────────┬─────────┬─────────┬─────────┐
│ Byte 1  │ Byte 2  │ Byte 3  │ Byte 4  │
│ SCOE ID │ 指令码  │  0xAA   │  0xAA   │
└─────────┴─────────┴─────────┴─────────┘
```

- **Byte 1**: 匹配 `globalConfig.scoeIdentifier`（单字节）
- **Byte 2**: 指令码（在 receiveCommands 中匹配）
- **Byte 3-4**: 固定为 `0xAA`

#### 第二步：根据加载状态分支处理

**当 `scoeFramesLoaded = false` 时：**

- 仅识别指令码 `0x01`（加载卫星ID）
- 提取卫星ID（4字节）用于加载
- 其他指令码一律拒绝

**当 `scoeFramesLoaded = true` 时：**

- 验证三个标志字段（根据配置的识别开关）：
  - `recognitionMessageId` → 验证信息标识（1字节）
  - `recognitionSourceId` → 验证信源标识（1字节）
  - `recognitionDestinationId` → 验证信宿标识（1字节）
- 验证型号ID（4字节，全匹配）
- 验证卫星ID（4字节，全匹配）

**辅助函数：**

- `validateFunctionCode()` - 验证功能码
- `validateSingleByteField()` - 验证单字节字段
- `validateMultiByteField()` - 验证多字节字段
- `extractSatelliteId()` - 提取卫星ID

---

### 3. 指令执行器系统

#### `src/composables/scoe/commands/`

**架构设计：**

```
commands/
├── index.ts                  # 统一导出
├── loadSatelliteId.ts       # 加载卫星ID
├── unloadSatelliteId.ts     # 卸载卫星ID
├── healthCheck.ts           # 健康自检
├── linkCheck.ts             # 链路自检
└── customCommand.ts         # 自定义指令（扩展点）
```

#### 核心执行器：`loadSatelliteId.ts`

**执行逻辑：**

```typescript
1. 检查是否已有卫星ID加载
   └─ 如果已加载 → 直接返回成功

2. 验证卫星ID参数
   └─ 如果缺失 → 返回错误（SATELLITE_CONFIG_INCOMPLETE）

3. 查找对应的卫星配置
   └─ 根据提取的卫星ID查找 satelliteConfigs

4. 如果找不到配置
   └─ 错误计数 +1
   └─ lastErrorReason = SATELLITE_ID_NOT_FOUND

5. 验证配置完整性
   └─ 检查必填字段：messageIdentifier, sourceIdentifier,
      destinationIdentifier, modelId, satelliteId
   └─ 如果不完整 → SATELLITE_CONFIG_INCOMPLETE

6. 加载卫星ID
   └─ scoeFramesLoaded = true
   └─ loadedSatelliteId = targetConfig.satelliteId
   └─ satelliteIdRuntimeSeconds = 0
   └─ commandSuccessCount++
   └─ 选中该配置
```

**其他执行器：**

- `unloadSatelliteId` - 卸载当前卫星ID，重置状态
- `healthCheck` - 系统健康检查（基于错误计数）
- `linkCheck` - 链路状态检查（基于加载状态）
- `customCommand` - 自定义指令扩展，可根据需求实现

---

### 4. 指令执行控制器

#### `src/composables/scoe/useScoeCommandExecutor.ts`

**核心接口：**

```typescript
interface CommandExecutionContext {
  command: ScoeReceiveCommand;
  startTime: number;
  scoeStore: ReturnType<typeof useScoeStore>;
  scoeFrameInstancesStore: ReturnType<typeof useScoeFrameInstancesStore>;
  params: Record<string, unknown>; // 支持传递额外参数（如卫星ID）
}

interface CommandExecutionResult {
  success: boolean;
  message: string;
  duration?: number;
  data?: Record<string, unknown>;
}
```

**主要方法：**

1. **`executeCommand(command, params?)`** - 执行指定指令

   - 更新 `lastCommandCode`（格式：`0x[SCOE_ID][指令码]AAAA`）
   - 增加 `commandReceiveCount`
   - 调用对应执行器
   - 记录执行时长
   - 处理异常并更新错误统计

2. **`executeCommandByCode(code, params?)`** - 通过功能码执行
   - 标准化功能码格式
   - 在 `receiveCommands` 中查找匹配指令
   - 调用 `executeCommand()`

**执行器映射表：**

```typescript
const executorMap = {
  LOAD_SATELLITE_ID: executeLoadSatelliteId,
  UNLOAD_SATELLITE_ID: executeUnloadSatelliteId,
  HEALTH_CHECK: executeHealthCheck,
  LINK_CHECK: executeLinkCheck,
  CUSTOM: executeCustomCommand,
};
```

---

### 5. 接收帧处理集成

#### `src/stores/frames/receiveFramesStore.ts`

**集成点：**

```typescript
const processDataInternal = async (
  source: 'serial' | 'network',
  sourceId: string,
  data: Uint8Array,
) => {
  // 更新全局统计
  globalStatsStore.incrementReceivedPackets();
  globalStatsStore.addReceivedBytes(data.length);

  // ⭐ SCOE 帧检测（仅处理 scoe-tcp-server）
  if (sourceId === 'scoe-tcp-server') {
    const scoeHandled = await handleScoeFrame(data);
    if (scoeHandled) {
      return; // 处理完毕，直接返回
    }
  }

  // 常规帧处理...
};
```

**`handleScoeFrame()` 流程：**

```
1. 初始化 SCOE 组件（延迟初始化避免循环依赖）
   ├─ scoeStore
   ├─ scoeFrameInstancesStore
   └─ scoeCommandExecutor

2. 调用 isScoeFrame() 识别
   └─ 传入：data, loadedConfig, globalConfig, scoeFramesLoaded

3. 如果不是 SCOE 帧
   └─ 记录日志，返回 false

4. 如果是 SCOE 帧
   ├─ 记录接收数据到测试工具（addReceiveData）
   ├─ 准备参数（extractedSatelliteId）
   ├─ 调用 executeCommandByCode()
   └─ 记录执行结果

5. 异常处理
   └─ 增加 commandErrorCount
```

---

### 6. UI 配置界面

#### `src/components/scoe/ConfigForm.vue`

**新增配置项：**

**操作按钮区域：**

- ✅ TCP连接按钮（连接/断开）
- ✅ 加载/卸载按钮（需选中配置）
- ✅ 保存按钮
- ✅ SCOE帧按钮

**配置展开区域（showConfigForm）：**

**第一行：TCP Server 配置**

- TCP Server IP地址
- 端口
- TCP自动连接开关

**第二行：UDP 配置**

- UDP IP地址
- UDP端口号

**第三行：三个标志的起始字节数** ⭐ 新增

- 信息标识偏移
- 信源标识偏移
- 信宿标识偏移

**第四行：型号ID、卫星ID、功能码的起始字节数** ⭐ 新增

- 型号ID偏移
- 卫星ID偏移
- 功能码偏移

**样式调整：**

- 按钮区宽度：`max-w-100` → `max-w-130`
- 配置区高度：`-bottom-44` → `-bottom-56`

---

## 📊 数据流图

```
TCP Server 接收数据
        ↓
processDataInternal()
        ↓
sourceId === 'scoe-tcp-server'?
        ↓ Yes
handleScoeFrame()
        ↓
isScoeFrame() 识别
        ↓
┌───────┴───────┐
│               │
验证功能码       │
│               │
└───────┬───────┘
        ↓
scoeFramesLoaded?
        ↓
    ┌───┴───┐
    │       │
  false    true
    │       │
    │       └──> 验证标志、型号ID、卫星ID
    │
    └──> 仅识别 01（加载指令）
            ↓
        提取卫星ID
            ↓
executeCommandByCode()
            ↓
    查找对应指令执行器
            ↓
    executeLoadSatelliteId()
            ↓
    ┌───────────────┐
    │ 1. 查找配置    │
    │ 2. 验证完整性  │
    │ 3. 加载卫星    │
    │ 4. 更新状态    │
    └───────────────┘
            ↓
    更新 scoeStore.status
    ├─ commandReceiveCount++
    ├─ commandSuccessCount++
    ├─ lastCommandCode
    ├─ scoeFramesLoaded = true
    └─ loadedSatelliteId
```

---

## 🔧 关键技术点

### 1. 字节转换统一使用 hexCovertUtils

```typescript
import { convertToHex } from '../frames/hexCovertUtils';

// 单字节转十六进制
const byte1Hex = convertToHex(data[offset], 'uint8'); // "0A"

// 多字节拼接
const satelliteId = Array.from(data.slice(offset, offset + 4))
  .map((byte) => convertToHex(byte, 'uint8'))
  .join(''); // "0A0B0C0D"
```

### 2. 延迟初始化避免循环依赖

```typescript
// SCOE 相关依赖（延迟初始化）
let scoeStore: ReturnType<typeof useScoeStore> | null = null;
let scoeFrameInstancesStore: ReturnType<typeof useScoeFrameInstancesStore> | null = null;
let scoeCommandExecutor: ReturnType<typeof useScoeCommandExecutor> | null = null;

const initializeScoeComponents = () => {
  if (!scoeStore) {
    scoeStore = useScoeStore();
  }
  // ...
};
```

### 3. 统计信息位置

**✅ 正确位置：`scoeStore.status`**

- `commandReceiveCount` - 指令接收总计数
- `commandSuccessCount` - 指令执行成功总计数
- `commandErrorCount` - 指令执行出错计数
- `lastCommandCode` - 最近一条指令功能码（格式：`0x[SCOE_ID][指令码]AAAA`）
- `lastErrorReason` - 指令执行出错原因
- `scoeFramesLoaded` - SCOE帧是否加载
- `loadedSatelliteId` - 已加载卫星ID
- `satelliteIdRuntimeSeconds` - 当前卫星ID加载累计秒

**❌ 不在 `globalStatsStore` 中**

### 4. 字符串格式标准化

所有十六进制字符串处理统一使用：

```typescript
const normalized = value
  .replace(/^0x/i, '') // 移除 0x 前缀
  .toUpperCase() // 转大写
  .padStart(length, '0'); // 补齐前导零
```

---

## 📁 新增文件清单

```
src/
├── utils/receive/
│   └── scoeFrame.ts                          # SCOE帧识别工具 ⭐ 新增
│
├── composables/scoe/commands/                # 指令执行器目录 ⭐ 新增
│   ├── index.ts                              # 统一导出
│   ├── loadSatelliteId.ts                   # 加载卫星ID指令
│   ├── unloadSatelliteId.ts                 # 卸载卫星ID指令
│   ├── healthCheck.ts                       # 健康自检指令
│   ├── linkCheck.ts                         # 链路自检指令
│   └── customCommand.ts                     # 自定义指令
│
└── types/scoe/
    ├── index.ts                              # 添加字节偏移量配置
    └── receiveCommand.ts                     # 添加错误原因枚举
```

## 📝 修改文件清单

```
src/
├── composables/scoe/
│   └── useScoeCommandExecutor.ts            # 重构支持参数传递
│
├── stores/
│   └── frames/
│       └── receiveFramesStore.ts            # 集成SCOE帧处理
│
└── components/scoe/
    └── ConfigForm.vue                        # 添加字节偏移量配置UI
```

---

## 🧪 测试要点

### 1. SCOE 帧识别测试

**测试用例：**

```typescript
// 测试数据包（15字节示例）
const testData = new Uint8Array([
  0x01, // 信息标识
  0x02, // 信源标识
  0x03, // 信宿标识
  0x00,
  0x00,
  0x00,
  0x01, // 型号ID
  0x00,
  0x00,
  0x00,
  0x02, // 卫星ID
  0xaa, // SCOE标识（假设globalConfig.scoeIdentifier = "AA"）
  0x01, // 指令码 01（加载卫星ID）
  0xaa,
  0xaa, // 固定结尾
]);
```

**验证点：**

- ✅ 功能码第1字节匹配 SCOE标识
- ✅ 功能码第2字节正确提取为指令码
- ✅ 功能码第3、4字节为 0xAA
- ✅ 正确提取卫星ID（4字节）
- ✅ 根据 scoeFramesLoaded 状态正确分支

### 2. 指令执行测试

**场景1：首次加载（scoeFramesLoaded = false）**

- 接收指令码 01
- 提取卫星ID："00000002"
- 查找对应配置
- 验证配置完整性
- 设置 scoeFramesLoaded = true
- 更新统计信息

**场景2：已加载状态（scoeFramesLoaded = true）**

- 验证三个标志
- 验证型号ID和卫星ID
- 执行对应指令
- 更新统计信息

**场景3：错误处理**

- 卫星ID不存在 → SATELLITE_ID_NOT_FOUND
- 配置不完整 → SATELLITE_CONFIG_INCOMPLETE
- 功能码不存在 → COMMAND_CODE_NOT_FOUND

---

## 🎯 扩展指南

### 添加新的 SCOE 指令

**1. 在 `ScoeCommandFunction` 枚举中添加：**

```typescript
// src/types/scoe/receiveCommand.ts
export enum ScoeCommandFunction {
  // ... 现有指令
  NEW_COMMAND = 'new_command', // 新增
}
```

**2. 创建指令执行器：**

```typescript
// src/composables/scoe/commands/newCommand.ts
import type { CommandExecutionResult, CommandExecutionContext } from '../useScoeCommandExecutor';

export async function executeNewCommand(
  context: CommandExecutionContext,
): Promise<CommandExecutionResult> {
  const { scoeStore, params } = context;

  // 实现指令逻辑

  return {
    success: true,
    message: '指令执行成功',
  };
}
```

**3. 在执行器映射中注册：**

```typescript
// src/composables/scoe/useScoeCommandExecutor.ts
const executorMap = {
  // ... 现有映射
  [ScoeCommandFunction.NEW_COMMAND]: executeNewCommand,
};
```

**4. 在 SCOE 帧实例中添加对应指令配置**

---

## 📚 相关文档

- 文件依赖关系图.md - 查看模块间依赖关系
- 文件功能接口索引.md - 查看各模块导出接口
- MainLayout重构说明.md - 主布局相关说明

---

## ✅ 验收标准

- [x] TCP Server 能够接收数据
- [x] 正确识别 SCOE 帧格式
- [x] 功能码验证准确（4字节结构）
- [x] 根据加载状态正确分支处理
- [x] 指令码 01 能够加载卫星ID
- [x] 加载时验证配置完整性
- [x] 错误情况正确统计和记录
- [x] UI 配置界面功能完整
- [x] 所有代码通过 TypeScript 类型检查
- [x] 无 lint 错误

---

## 🚀 后续优化建议

1. **添加指令执行日志记录**

   - 记录每次指令执行的详细信息
   - 支持导出日志文件

2. **完善健康检查和链路检查**

   - 实现实际的系统健康检测逻辑
   - 实现网络链路质量检测

3. **添加指令执行超时机制**

   - 设置指令执行超时时间
   - 超时自动取消并记录

4. **支持指令批量执行**

   - 支持序列指令配置
   - 支持条件触发

5. **添加单元测试**
   - SCOE 帧识别测试
   - 指令执行器测试
   - 边界情况测试

---

**文档版本：** v1.0  
**创建日期：** 2025-10-15  
**最后更新：** 2025-10-15  
**维护者：** 开发团队
