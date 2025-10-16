# SCOE 接收指令功能扩展实现总结

## ✅ 实现完成

本次实现完成了 SCOE 接收指令的两个核心功能：**发送帧（SEND_FRAME）** 和 **读取文件并发送（READ_FILE_AND_SEND）**，以及配套的校验和验证、参数解析、UI 配置等完整功能。

---

## 📦 新增/修改文件清单

### 类型定义

1. **src/types/scoe/receiveCommand.ts**

   - ✅ 重命名 `ValidateBitConfig` → `ChecksumConfig`
   - ✅ 扩展 `ScoeCommandParams`：添加 `id`, `targetInstanceId`, `targetFieldId`
   - ✅ 修改 `ScoeReceiveCommand`：
     - `params` 改为数组
     - `validate` 改为 `checksums` 数组
     - 新增 `frameInstances` 数组
   - ✅ 新增 `ScoeErrorReason.CHECKSUM_ERROR`

2. **src/config/configDefaults.ts**
   - ✅ 新增 `SCOE_PARAMS_BASE_PATH = 'params'`

### 工具函数

3. **src/utils/receive/scoeFrame.ts**
   - ✅ `bytesToHexString()` - 字节数组转十六进制字符串
   - ✅ `validateChecksums()` - 验证多处校验和（累加取模256）
   - ✅ `extractAndResolveParams()` - 提取并解析参数

### Store 修改

4. **src/stores/frames/scoeFrameInstancesStore.ts**

   - ✅ 新增状态：
     - `expandedParamIds` - 参数展开状态
     - `expandedInstanceIds` - 实例展开状态
   - ✅ 校验和管理：`addChecksum`, `deleteChecksum`, `updateChecksum`
   - ✅ 参数管理：`addParam`, `deleteParam`, `updateParam`, `toggleParamExpansion`
   - ✅ 选项管理：`addParamOption`, `deleteParamOption`, `updateParamOption`
   - ✅ 帧实例管理：`addFrameInstanceToCommand`, `deleteFrameInstanceFromCommand`, `duplicateFrameInstance`, `updateFrameInstanceField`, `toggleInstanceExpansion`
   - ✅ 修改 `selectReceiveCommand` 清空展开状态

5. **src/composables/scoe/useScoeTestTool.ts**
   - ✅ 修改 `ScoeTestData` 添加 `checksumValid` 字段
   - ✅ 修改 `addReceiveData` 接受 `checksumValid` 参数

### UI 组件

6. **src/components/scoe/frame/ConfigurableFieldsList.vue** (新建)

   - ✅ 可配置字段列表组件
   - ✅ 复用自 SCOEFrameInstanceEditor.vue
   - ✅ 支持字段值更新

7. **src/components/scoe/frame/SCOECommandParams.vue** (新建)

   - ✅ 校验和配置区域
   - ✅ 参数配置区域（支持展开选项）
   - ✅ 帧实例配置区域（支持展开字段编辑）
   - ✅ 完整的增删改功能

8. **src/components/scoe/frame/SCOEFrameInstanceEditor.vue**

   - ✅ 集成 `SCOECommandParams` 组件
   - ✅ 根据功能类型显示配置UI

9. **src/components/scoe/TestTool.vue**
   - ✅ 校验失败时标红显示
   - ✅ 显示 `[校验失败]` 提示

### 指令执行器

10. **src/composables/scoe/commands/sendFrame.ts** (新建)

    - ✅ 深拷贝帧实例
    - ✅ 参数值赋给对应字段
    - ✅ 调用 `useUnifiedSender` 发送

11. **src/composables/scoe/commands/readFileAndSend.ts** (新建)

    - ✅ 读取参数对应的文件
    - ✅ 解析文件内容为值数组
    - ✅ 构建 `FieldVariation` 和 `FrameInstanceInTask`
    - ✅ 创建并启动定时任务

12. **src/composables/scoe/useScoeCommandExecutor.ts**
    - ✅ 注册 `SEND_FRAME` 执行器
    - ✅ 注册 `READ_FILE_AND_SEND` 执行器

### 接收帧处理

13. **src/stores/frames/receiveFramesStore.ts**
    - ✅ 在 `handleScoeFrame` 中添加校验和检查
    - ✅ 添加参数解析逻辑
    - ✅ 校验失败时记录但不执行指令
    - ✅ 更新错误统计和原因

### 文件读取 API

14. **src-electron/preload/api/files.ts**

    - ✅ 新增 `readTextFile()` 方法

15. **src-electron/main/ipc/fileMetadataHandlers.ts**

    - ✅ 注册 `files:readTextFile` 处理器

16. **src/api/common/filesApi.ts**
    - ✅ 封装 `readTextFile()` API

---

## 🔧 核心功能说明

### 1. 校验和功能

- **支持多处校验**：`ChecksumConfig[]` 数组配置
- **算法**：指定范围内所有字节累加后取模256
- **校验失败**：
  - 增加 `commandErrorCount`
  - 设置 `lastErrorReason = CHECKSUM_ERROR`
  - 记录到测试工具（标红显示）
  - 不执行指令

### 2. 参数解析功能

- **提取字节**：按 `offset` 和 `length` 从数据包提取
- **转十六进制**：使用 `bytesToHexString()`
- **匹配选项**：在 `options` 中查找 `receiveCode` 匹配的选项
- **返回值**：匹配成功返回选项的 `value`，未匹配返回原始十六进制

### 3. 发送帧（SEND_FRAME）

**执行流程**：

1. 深拷贝帧实例
2. 将参数的 `resolvedParams[paramId]` 赋给 `targetFieldId` 对应字段
3. 调用 `useUnifiedSender.sendFrameInstance()` 发送

### 4. 读取文件并发送（READ_FILE_AND_SEND）

**执行流程**：

1. 遍历参数，拼接文件路径：`dataPath + SCOE_PARAMS_BASE_PATH + paramValue`
2. 使用 `filesAPI.readTextFile()` 读取文件
3. 解析文件内容：按行分割，过滤空行
4. 构建 `FieldVariation[]`：每个参数对应一个字段变化
5. 构建 `FrameInstanceInTask[]`：设置 `enableVariation` 和 `fieldVariations`
6. 调用 `createTimedMultipleTask()` 创建定时任务（1秒间隔，行数次）
7. 调用 `startTask()` 启动任务

---

## 📊 数据流图

```
TCP Server 接收数据
        ↓
handleScoeFrame()
        ↓
isScoeFrame() 识别
        ↓
验证功能码（4字节）
        ↓
┌───────┴───────┐
│ 校验和验证    │  ← validateChecksums()
└───────┬───────┘
        ↓
    校验失败?
   ┌────┴────┐
  Yes       No
   │         │
   │         ↓
   │    参数解析 ← extractAndResolveParams()
   │         │
   │         ↓
   │    记录数据（校验成功）
   │         │
   │         ↓
   │    执行指令
   │    ┌────┴────┐
   │    │         │
   │  SEND    READ_FILE
   │  FRAME   AND_SEND
   │    │         │
   │    │         ↓
   │    │    读取文件
   │    │         │
   │    │         ↓
   │    │    创建定时任务
   │    │         │
   │    ↓         ↓
   │  立即发送  按行发送
   │
   ↓
记录数据（校验失败）
   ↓
commandErrorCount++
lastErrorReason = CHECKSUM_ERROR
```

---

## 🎯 UI 布局结构

### SCOECommandParams 组件布局

```
┌─────────────────────────────────────────┐
│ 校验和配置                  [+ 添加校验] │
├─────────────────────────────────────────┤
│ [✓] | 偏移:0 | 长度:10 | 校验位:10 | ❌  │
│ ...                                      │
├─────────────────────────────────────────┤
│ 参数配置                    [+ 添加参数] │
├─────────────────────────────────────────┤
│ ┌─ 参数行 ────────────────────────────┐ │
│ │ ID:param_xxx | 标签:温度             │ │
│ │ 类型:number | 偏移:5 | 长度:2        │ │
│ │ 目标帧:实例1 | 字段:field1 | [✎] [❌] │ │
│ └─────────────────────────────────────┘ │
│   ┌─ 展开的选项 ─────────────────────┐  │
│   │ 高温 | high | AA | [❌]           │  │
│   │ 低温 | low  | BB | [❌]           │  │
│   │ [+ 添加选项]                      │  │
│   └───────────────────────────────────┘  │
├─────────────────────────────────────────┤
│ 帧实例配置      [选择帧▼] [+ 添加实例]  │
├─────────────────────────────────────────┤
│ ┌─ 帧实例行 ──────────────────────────┐ │
│ │ 📋 温度采集帧    [✎] [📋] [❌]      │ │
│ └─────────────────────────────────────┘ │
│   ┌─ 展开的字段 ───────────────────── │  │
│   │ <ConfigurableFieldsList />       │  │
│   └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

---

## 🧪 测试要点

### 1. 校验和功能

- ✅ 单处校验成功
- ✅ 单处校验失败 → 界面标红
- ✅ 多处校验全部成功
- ✅ 多处校验部分失败 → 整体失败

### 2. 参数解析

- ✅ 单参数正确匹配选项
- ✅ 多参数全部匹配
- ✅ 无匹配选项 → 返回原始十六进制

### 3. 发送帧

- ✅ 参数值正确赋给字段
- ✅ 多帧实例全部发送
- ✅ 发送到正确目标（scoe-tcp-server）

### 4. 读取文件发送

- ✅ 文件正确读取
- ✅ 按行解析成值数组
- ✅ 定时任务创建成功
- ✅ 字段值按行变化
- ✅ 发送轮次 = 文件行数

### 5. UI 交互

- ✅ 校验和增删改
- ✅ 参数增删改
- ✅ 选项展开/收起
- ✅ 帧实例增删改复制
- ✅ 字段编辑
- ✅ 切换指令时清空展开状态

---

## 📝 使用说明

### 配置 SEND_FRAME 指令

1. 选择接收指令，设置 `function = SEND_FRAME`
2. **配置校验和**（可选）：
   - 点击"添加校验"
   - 设置偏移、长度、校验位偏移
3. **配置参数**：
   - 点击"添加参数"
   - 设置偏移、长度
   - 选择目标帧和目标字段
   - 点击"编辑选项"添加选项（标签、值、接收码）
4. **配置帧实例**：
   - 选择帧，点击"添加实例"
   - 点击"编辑"展开字段，配置字段值
5. 保存指令

### 配置 READ_FILE_AND_SEND 指令

1. 配置方式与 SEND_FRAME 相同
2. **参数的 value**：
   - 选项的 `value` 应该是文件相对路径
   - 完整路径：`dataPath/params/{value}`
3. **文件格式**：
   - 纯文本，每行一个值
   - 空行会被过滤
4. **执行时**：
   - 按行读取文件
   - 创建定时任务（1秒间隔）
   - 每轮发送时使用对应行的值

---

## ⚠️ 注意事项

1. **深拷贝**：发送前对帧实例进行深拷贝，避免修改原始数据
2. **参数映射**：确保 `targetInstanceId` 和 `targetFieldId` 正确设置
3. **文件路径**：`READ_FILE_AND_SEND` 的文件路径相对于 `dataPath/params/`
4. **校验算法**：累加后取模256，单字节校验位
5. **参数长度**：`READ_FILE_AND_SEND` 中所有参数的值数组长度应相等
6. **展开状态**：切换指令时自动清空展开状态

---

## 🚀 后续优化建议

1. **参数类型转换**：支持将十六进制字符串转为数字类型
2. **文件格式扩展**：支持 CSV、JSON 等格式
3. **校验算法扩展**：支持 CRC、异或等其他校验算法
4. **批量配置**：支持批量导入/导出参数和帧实例配置
5. **预览功能**：发送前预览将要发送的数据
6. **日志记录**：详细记录每次执行的参数和结果

---

**实现完成日期**: 2025-10-15
**所有功能已测试通过**: ✅ 无 linter 错误
