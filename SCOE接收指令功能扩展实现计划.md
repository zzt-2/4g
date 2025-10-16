# SCOE 接收指令功能扩展实现计划

## 一、需求总结

### 1. 新增功能

- **发送帧（SEND_FRAME）**：接收指令 → 校验 → 解析参数 → 参数值赋给对应字段 → 立即发送帧实例
- **读取文件并发送（READ_FILE_AND_SEND）**：接收指令 → 校验 → 解析参数 → 读取文件 → 每行作为字段值 → 创建定时任务发送

### 2. 校验功能

- 支持多处校验位配置（`ChecksumConfig[]`）
- 算法：指定范围内所有字节累加后取模256
- 校验错误时：
  - 增加 `scoeStore.status.commandErrorCount`
  - 设置 `scoeStore.status.lastErrorReason = CHECKSUM_ERROR`
  - 记录到测试工具但不执行指令
  - 测试工具界面标红显示

### 3. 参数解析

- 从数据包中按 `offset` 和 `length` 提取数据
- 转为十六进制字符串与选项的 `receiveCode` 比对
- 匹配后取对应选项的 `value`
- 未匹配返回原始十六进制字符串

---

## 二、类型定义修改

### 1. `src/types/scoe/receiveCommand.ts`

#### 修改内容：

```typescript
// 1. 重命名并支持多处校验
export interface ChecksumConfig {
  enabled: boolean;
  offset: number; // 校验计算起始字节偏移
  length: number; // 计算字节数
  checksumOffset: number; // 校验位字节偏移
}

// 2. 扩展参数配置
export interface ScoeCommandParams {
  id: string;
  label: string;
  value: string;
  type: 'string' | 'number' | 'boolean';
  offset: number;
  length: number;
  targetInstanceId?: string; // 新增：目标帧实例ID
  targetFieldId?: string; // 新增：目标字段ID
  options: ScoeCommandParamsOption[];
}

// 3. 修改接收指令
export interface ScoeReceiveCommand {
  id: string;
  label: string;
  code: string;
  params?: ScoeCommandParams[]; // 改为数组
  function: ScoeCommandFunction;
  checksums: ChecksumConfig[]; // 改为数组，支持多处校验
  frameInstances?: SendFrameInstance[]; // 新增：存储完整的帧实例
}

// 4. 添加校验和错误枚举
export enum ScoeErrorReason {
  NONE = '无错误',
  SATELLITE_ID_NOT_FOUND = '请求加载卫星ID不存在',
  SATELLITE_CONFIG_INCOMPLETE = '请求加载卫星ID配置不完整',
  SATELLITE_ID_LOADING = '存在正在加载的卫星ID',
  COMMAND_CODE_NOT_FOUND = '不存在该指令码',
  CHECKSUM_ERROR = '校验和错误', // 新增
}

// 5. 修改默认创建函数
export function createDefaultReceiveCommand(id: string): ScoeReceiveCommand {
  return {
    id,
    label: `指令 ${id}`,
    code: '00',
    function: ScoeCommandFunction.CUSTOM,
    checksums: [], // 空数组
    params: [],
    frameInstances: [],
  };
}
```

### 2. `src/config/configDefaults.ts`

```typescript
// 新增：SCOE 参数文件基础路径
export const SCOE_PARAMS_BASE_PATH = 'params';
```

---

## 三、工具函数实现

### `src/utils/receive/scoeFrame.ts` 新增函数

#### 3.1 校验和计算（支持多处校验）

```typescript
/**
 * 验证多处校验和
 * @param data 数据包
 * @param checksums 校验配置数组
 * @returns 校验结果
 */
export function validateChecksums(
  data: Uint8Array,
  checksums: ChecksumConfig[],
): { valid: boolean; error?: string };
```

**逻辑**：

- 遍历所有启用的校验配置
- 对每个配置：累加指定范围字节 → 取模256 → 与校验位比对
- 任一校验失败则返回 `valid: false`

#### 3.2 参数解析

```typescript
/**
 * 从数据包中提取并解析参数
 * @param data 数据包
 * @param params 参数配置数组
 * @returns 解析后的参数映射
 */
export function extractAndResolveParams(
  data: Uint8Array,
  params: ScoeCommandParams[],
): Record<string, string>;
```

**逻辑**：

- 遍历参数配置
- 提取字节 → 转十六进制 → 匹配选项 `receiveCode` → 返回选项 `value`
- 未匹配返回原始十六进制

#### 3.3 辅助函数

```typescript
/**
 * 字节数组转十六进制字符串
 */
export function bytesToHexString(bytes: Uint8Array): string;
```

---

## 四、指令执行器实现

### 1. `src/composables/scoe/commands/sendFrame.ts`（新建）

```typescript
export async function executeSendFrame(
  context: CommandExecutionContext,
): Promise<CommandExecutionResult>;
```

**参数传入方式**（参考 loadSatelliteId）：

```typescript
const { scoeStore, scoeFrameInstancesStore, params } = context;
const resolvedParams = params?.resolvedParams as Record<string, string> | undefined;
```

**执行逻辑**：

1. 获取 `command.frameInstances`
2. 遍历每个帧实例并深拷贝
3. 查找有 `targetFieldId` 的参数，将 `resolvedParams[paramId]` 赋给字段
4. 调用 `useUnifiedSender` 发送
5. 返回结果

### 2. `src/composables/scoe/commands/readFileAndSend.ts`（新建）

```typescript
export async function executeReadFileAndSend(
  context: CommandExecutionContext,
): Promise<CommandExecutionResult>;
```

**参数传入方式**：

```typescript
const { params } = context;
const resolvedParams = params?.resolvedParams as Record<string, string> | undefined;
```

**执行逻辑**：

1. 遍历 `command.params`，读取每个参数对应的文件
2. 文件路径：`getDataPath() + SCOE_PARAMS_BASE_PATH + resolvedParams[paramId]`
3. 使用 `filesApi.readFile` 读取文件
4. 解析文件内容为值数组
5. 构建 `FieldVariation[]` 和 `FrameInstanceInTask[]`
6. 调用 `createTimedMultipleTask` 创建任务
7. 调用 `startTask` 启动任务

### 3. 更新 `src/composables/scoe/useScoeCommandExecutor.ts`

注册执行器映射：

```typescript
import { executeSendFrame } from './commands/sendFrame';
import { executeReadFileAndSend } from './commands/readFileAndSend';

const executorMap = {
  // ... 现有
  [ScoeCommandFunction.SEND_FRAME]: executeSendFrame,
  [ScoeCommandFunction.READ_FILE_AND_SEND]: executeReadFileAndSend,
};
```

---

## 五、接收帧处理流程修改

### `src/stores/frames/receiveFramesStore.ts` - `handleScoeFrame`

**在 `if (!checkResult.commandCode)` 之后、`scoeStore.addReceiveData` 之前插入**：

```typescript
// 1. 校验和检查
const checksumResult = validateChecksums(data, checkResult.commandCode.checksums);
if (!checksumResult.valid) {
  console.warn('[SCOE] 校验和错误:', checksumResult.error);
  scoeStore.status.commandErrorCount++;
  scoeStore.status.lastErrorReason = ScoeErrorReason.CHECKSUM_ERROR;
  scoeStore.addReceiveData(
    Array.from(data)
      .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
      .join(''),
    false, // 校验失败
  );
  return true;
}

// 2. 参数解析
const resolvedParams: Record<string, unknown> = {};
if (checkResult.commandCode.params?.length) {
  const paramValues = extractAndResolveParams(data, checkResult.commandCode.params);
  Object.assign(resolvedParams, { resolvedParams: paramValues });
}

// 3. 添加卫星ID
if (checkResult.extractedSatelliteId) {
  resolvedParams.satelliteId = checkResult.extractedSatelliteId;
}

// 4. 记录接收数据（校验成功）
scoeStore.addReceiveData(
  Array.from(data)
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(''),
  true,
);

// 5. 执行指令
const result = await scoeCommandExecutor.executeCommand(checkResult.commandCode, resolvedParams);
```

---

## 六、Store 修改

### `src/stores/frames/scoeFrameInstancesStore.ts`

#### 新增状态：

```typescript
const expandedParamIds = ref<Set<string>>(new Set());
const expandedInstanceIds = ref<Set<string>>(new Set());
```

#### 修改现有方法：

```typescript
const selectReceiveCommand = (commandId: string) => {
  // ... 现有逻辑
  expandedParamIds.value.clear();
  expandedInstanceIds.value.clear();
};
```

#### 新增方法：

**参数管理**：

- `addParam()` - 添加参数
- `deleteParam(paramId)` - 删除参数
- `updateParam(paramId, updates)` - 更新参数
- `toggleParamExpansion(paramId)` - 切换参数展开状态

**选项管理**：

- `addParamOption(paramId)` - 添加选项
- `deleteParamOption(paramId, optionIndex)` - 删除选项
- `updateParamOption(paramId, optionIndex, updates)` - 更新选项

**校验和管理**：

- `addChecksum()` - 添加校验配置
- `deleteChecksum(checksumIndex)` - 删除校验配置
- `updateChecksum(checksumIndex, updates)` - 更新校验配置

**帧实例管理（接收指令用）**：

- `addFrameInstanceToCommand(frameId)` - 添加帧实例
- `deleteFrameInstanceFromCommand(instanceIndex)` - 删除帧实例
- `duplicateFrameInstance(instanceIndex)` - 复制帧实例
- `updateFrameInstanceField(instanceIndex, fieldId, value)` - 更新字段值
- `toggleInstanceExpansion(instanceIndex)` - 切换实例展开状态

---

## 七、UI 组件实现

### 1. 新建 `src/components/scoe/frame/ConfigurableFieldsList.vue`

**功能**：显示并编辑帧实例的可配置字段列表（复用自 SCOEFrameInstanceEditor.vue 34-73行）

**Props**：

```typescript
{
  fields: SendInstanceField[];
}
```

**Emits**：

```typescript
{
  'update:field-value': [fieldId: string, value: string | number | null];
}
```

---

### 2. 实现 `src/components/scoe/frame/SCOECommandParams.vue`

#### 布局结构：

```
┌─────────────────────────────────────────┐
│ 校验和配置                  [+ 添加校验] │
├─────────────────────────────────────────┤
│ 启用 | 偏移 | 长度 | 校验位偏移 | [删除] │
│ ...                                      │
├─────────────────────────────────────────┤
│ 参数配置                    [+ 添加参数] │
├─────────────────────────────────────────┤
│ ┌─ 参数行 ────────────────────────────┐ │
│ │ ID | 标签 | 类型 | 偏移 | 长度 |    │ │
│ │ 目标帧ID | 字段ID | [编辑选项] [删除] │ │
│ └─────────────────────────────────────┘ │
│   ┌─ 展开的选项列表 ─────────────────┐  │
│   │ 标签 | 值 | 接收码 | [删除]      │  │
│   │ [+ 添加选项]                     │  │
│   └──────────────────────────────────┘  │
├─────────────────────────────────────────┤
│ 帧实例配置      [选择帧] [+ 添加实例]  │
├─────────────────────────────────────────┤
│ ┌─ 帧实例行 ──────────────────────────┐ │
│ │ 实例名称    [编辑] [复制] [删除]    │ │
│ └─────────────────────────────────────┘ │
│   ┌─ 展开的字段列表 ─────────────────┐  │
│   │ <ConfigurableFieldsList />       │  │
│   └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**显示条件**：

```vue
v-if="localCommand.function === ScoeCommandFunction.SEND_FRAME || localCommand.function ===
ScoeCommandFunction.READ_FILE_AND_SEND"
```

---

### 3. 修改 `src/components/scoe/frame/SCOEFrameInstanceEditor.vue`

**118-121行替换为**：

```vue
<SCOECommandParams v-if="scoeFrameInstancesStore.localReceiveCommand" />
```

---

### 4. 修改 `src/composables/scoe/useScoeTestTool.ts`

**修改接口**：

```typescript
export interface ScoeTestData {
  timestamp: string;
  data: string;
  checksumValid?: boolean; // 新增
}
```

**修改方法签名**：

```typescript
const addReceiveData = (data: string, checksumValid: boolean = true) => {
  receiveDataList.value.unshift({
    timestamp: new Date().toLocaleString(/* ... */),
    data,
    checksumValid,
  });
  // ... 限制行数
};
```

---

### 5. 修改 `src/components/scoe/TestTool.vue`

**接收数据显示**：

```vue
<div
  v-for="(item, index) in receiveDataList"
  :key="index"
  :class="[
    'p-1 border border-dashed rounded text-xs',
    item.checksumValid === false
      ? 'border-negative bg-red-900/20'
      : 'border-industrial'
  ]"
>
  <div class="text-industrial-secondary mb-1">
    {{ item.timestamp }}
    <span v-if="item.checksumValid === false" class="text-negative ml-2">
      [校验失败]
    </span>
  </div>
  <div class="text-industrial-primary font-mono break-all">{{ item.data }}</div>
</div>
```

---

### 6. 修改 `src/stores/scoeStore.ts`

**修改 `addReceiveData` 方法签名**：

```typescript
const addReceiveData = (data: string, checksumValid: boolean = true) => {
  testTool.addReceiveData(data, checksumValid);
};
```

---

## 八、文件读取实现

### 扩展 `src/api/common/filesApi.ts`

**确认现有是否支持读取文本文件**，如果没有则添加：

```typescript
readTextFile: (filePath: string) => {
  return window.electron?.files?.readFile(filePath);
};
```

---

## 九、实现顺序

1. ✅ 生成实现计划文档
2. ✅ 类型定义修改
   - ✅ `receiveCommand.ts`（ChecksumConfig[], params[], frameInstances[], CHECKSUM_ERROR）
   - ✅ `configDefaults.ts`（SCOE_PARAMS_BASE_PATH）
3. ✅ 工具函数实现
   - ✅ `scoeFrame.ts`（validateChecksums, extractAndResolveParams, bytesToHexString）
4. ✅ Store 修改
   - ✅ `scoeFrameInstancesStore.ts`（新增状态和方法）
   - ✅ `scoeStore.ts`（通过 useScoeTestTool 已支持）
5. ✅ 拆分组件
   - ✅ `ConfigurableFieldsList.vue`
6. ✅ 实现参数和帧实例UI
   - ✅ `SCOECommandParams.vue`
7. ✅ 修改编辑器
   - ✅ `SCOEFrameInstanceEditor.vue`
8. ✅ 实现指令执行器
   - ✅ `sendFrame.ts`
   - ✅ `readFileAndSend.ts`
9. ✅ 注册执行器
   - ✅ `useScoeCommandExecutor.ts`
10. ✅ 修改接收流程
    - ✅ `receiveFramesStore.ts`（handleScoeFrame）
11. ✅ 修改测试工具
    - ✅ `useScoeTestTool.ts`
    - ✅ `TestTool.vue`
12. ✅ 文件API确认
    - ✅ `filesApi.ts`（添加 readTextFile）
    - ✅ `fileMetadataHandlers.ts`（主进程处理器）
    - ✅ `preload/api/files.ts`（预加载脚本）

---

## 十、注意事项

1. **深拷贝**：发送帧前深拷贝帧实例
2. **错误处理**：文件读取失败、参数解析失败的容错
3. **类型安全**：避免 `any` 和 `@ts-expect-error`
4. **代码简洁**：减少冗余检验
5. **执行顺序**：校验 → 参数解析 → 赋值 → 发送
6. **校验和多处**：支持多个校验配置同时验证
7. **参数传入**：参考 `loadSatelliteId.ts` 的 `context` 结构
8. **展开状态**：存在 store，切换指令时清空

---

## 十一、测试场景

1. **校验功能**

   - 单处校验成功/失败
   - 多处校验全部成功
   - 多处校验部分失败 → 整体失败

2. **参数解析**

   - 单参数正确匹配
   - 多参数全部匹配
   - 无匹配选项 → 返回原始十六进制

3. **发送帧**

   - 参数值正确赋给字段
   - 多帧实例全部发送

4. **读取文件发送**

   - 文件正确读取和解析
   - 定时任务创建和执行
   - 字段值按行变化

5. **UI 交互**
   - 校验和配置增删改
   - 参数配置增删改
   - 选项展开/收起
   - 帧实例增删改复制
   - 字段编辑

---

**实现完成后更新 SCOE接收帧功能实现总结.md**
