---
doc_type: feature-design
feature: 2026-06-12-checksum-sum32-sum16
status: approved
summary: 在现有 FrameChecksumDefinition 框架上新增 SUM32（4B word 累加）和 SUM16（2B word 累加）两种 checksum 算法；range 字节长度非 method 要求倍数时报 SendBuildIssue error 阻断发送；checksum 配置仍归 frame field 级，不动 schema version、不动 UI 组件。
tags: [send, frame, checksum, algorithm]
---

# Checksum SUM32 / SUM16 design

## 0. 术语约定

| 术语 | 定义 | 防冲突结论 |
|------|------|-----------|
| checksum method | 帧字段上 `validOption.checksumMethod` 配置的算法标识 | 现状支持 `sum8` / `xor8` / `crc16` / `crc32` / `custom` 共 5 种 |
| SUM32 | 4 字节 word 累加和，结果 `& 0xffffffff` | 新增。和现状 `sum8`（字节累加 `& 0xff`）对称 |
| SUM16 | 2 字节 word 累加和，结果 `& 0xffff` | 新增。和 `sum8` 同模式 |
| range | checksum 计算覆盖的字节范围 `[startByte, endByte)` | 现状由 `startFieldIndex` / `endFieldIndex` 推导，不含 checksum 字段本身 |
| range alignment | range 字节长度是否符合 method 要求的倍数 | 新增校验维度。`sum32` 要求 `% 4 === 0`，`sum16` 要求 `% 2 === 0` |
| word endian | 多字节拼 word 时的字节序 | 现状 checksum 写入跟随 `field.bigEndian`；word 累加应一致 |

## 1. 决策与约束

### 需求摘要

- **做什么**：在 `CHECKSUM_METHODS` 加 `sum32` / `sum16` 两个枚举值；在 `calculateChecksum` 加对应算法分支；在 `applyBuildPostPatch` 加 range 对齐校验
- **为谁**：dongfanghong RS422 协议要求 32 位累加和校验（同事发现，原本只支持到字节级 sum8 和 CRC）
- **成功标准**：
  - 配置 `sum32` / `sum16` method 的 checksum 字段在帧构建时正确累加
  - range 字节长度非 method 要求倍数时 `applyBuildPostPatch` 返回 `send.build.checksumRangeUnaligned` error issue，由 send pipeline 阻断发送
  - 现有 sum8 / xor8 / crc16 / crc32 行为零变化
  - `FrameFieldEditorDialog` 的 method 下拉自动暴露 `SUM32` / `SUM16` 选项（UI 组件无改动）
- **明确不做**：
  - 不升 schema version（加可选枚举值天然向后兼容）
  - 不动 `FrameChecksumDefinition` 结构（`isChecksum` / `startFieldIndex` / `endFieldIndex` / `checksumMethod` 四字段不变）
  - 不改 `field-labels.ts` 和 `FrameFieldEditorDialog.vue`（`CHECKSUM_METHOD_OPTIONS` 通过 `CHECKSUM_METHODS.map(...)` 自动跟随）
  - 不实现 `'custom'` method 的运行时逻辑（沿用现状 `default: return 0`）
  - 不在 `calculateChecksum` 纯函数内抛错（保持可测试性，对齐校验由 `applyBuildPostPatch` 承担）
  - 不引入 `FrameChecksumDefinition.endian` 字段（端序复用 `field.bigEndian`）
  - 不动 `SendStepConfig`（checksum 配置仍归 frame field，非 task step）
  - 不引入跨字段 range 重叠检测（多 checksum 字段顺序依赖是现状行为，本 feature 保持，详见 §2.2 跨层纪律）

### 复杂度档位

走 Lane B 默认档位，无偏离。改动局限在 send feature 内部 + frame 类型枚举扩展。

### 关键决策

**D1: SUM32 / SUM16 端序跟随 `field.bigEndian`。**

理由：现状 length 字段写入（`setUint16` / `setUint32`）和 checksum 字段写入都跟随 `field.bigEndian`（`checksum.ts:150-158`）；word 累加读 word 时应保持同一端序语义。

替代方案：
- 固定 BE：违反 dongfanghong 协议可能存在的小端字段场景
- 固定 LE：同上
- 新增 `FrameChecksumDefinition.endian` 字段：端序归字段比归 checksum 配置更符合"字段属性"语义，且避免 schema 字段膨胀

**D2: Range 对齐校验在 `applyBuildPostPatch` 内做，不在 `calculateChecksum` 内做。**

理由：
- `calculateChecksum` 是纯函数（`checksum.ts:60-82`），调用方除 `applyBuildPostPatch` 外没有别的使用点；让它抛错破坏纯函数可测试性
- `applyBuildPostPatch` 已是构帧期错误集中地，现有 `invalidChecksumRange` / `unsupportedChecksumFieldLength` / `checksumOverflow` 都在这里报
- `SendBuildIssue` 机制天然被 send pipeline 消费并阻断发送

替代方案：在 `frame-validation.ts` 加跨字段提前校验——更早拦截但跨层（field 级 schema 校验目前不查其他 field 的 offset/length，引入新维度）。

**D3: Word 拼接实现用 `DataView.getUint32(0, !be)` / `getUint16(0, !be)`。**

理由：DataView 原生支持 `littleEndian` 参数；不需要手动位运算（`<<` / `>>>`），可读性高且正确性有保障。`!be` 的语义：DataView 第二参数 `littleEndian` 表示"按小端读"，与 `field.bigEndian`（"数据是大端"）语义正好相反，所以取反——`bigEndian=true` → `littleEndian=false`（按大端读），`bigEndian=false` → `littleEndian=true`（按小端读）。

替代方案：手动 `(b[0] << 24) | (b[1] << 16) | ...`——可读性差，且 32 位运算要小心符号位。

**D4: Overflow 沿用 mask 策略，不抛 error。**

理由：现状 `checksumSum8` 用 `& 0xff` 静默截断（`checksum.ts:6`）；`sum32` 应 `>>> 0`（无符号 32 位），`sum16` 应 `& 0xffff`。累加天然可能溢出但 mask 是行业惯例。

替代方案：累加溢出时抛 `send.build.checksumOverflow`——但 checksum 字段 length 已经决定了存放上限（1/2/4 字节），现有 overflow 校验在写入前已检查（`checksum.ts:142-147`），不需要在算法层再检查一次。

**D5: Error code 用 `send.build.checksumRangeUnaligned`。**

理由：现状已有 `send.build.invalidChecksumRange` / `unsupportedChecksumFieldLength` / `checksumOverflow` / `lengthFieldIdMissing` / `lengthFieldNotFound`，前缀风格一致。`Unaligned` 比 `Misaligned` 更通用。

**D6: `sum32` / `sum16` 加在 `CHECKSUM_METHODS` 末尾，`'custom'` 之前。**

理由：`'custom'` 当前在最后位（`types.ts:20`），语义上是"用户自定义算法"占位；常规算法应集中在前部，custom 作为兜底放最后。新增算法插入 `'crc32'` 和 `'custom'` 之间。

### 前置依赖

无。本次改动完全局限在 send feature + frame 类型层，不依赖其他 feature 的未完成工作。

## 2. 名词与编排

### 2.1 名词层

#### 现状

| 值对象 | 位置 | 当前职责 |
|--------|------|---------|
| `CHECKSUM_METHODS` | `frame/core/types.ts:20` | `['sum8', 'xor8', 'crc16', 'crc32', 'custom'] as const` |
| `ChecksumMethod` | `frame/core/types.ts:29` | 上述数组的 union type |
| `FrameChecksumDefinition` | `frame/core/types.ts:45-50` | `{ isChecksum, startFieldIndex, endFieldIndex, checksumMethod? }` |
| `checksumSum8` / `checksumXor8` | `send/core/checksum.ts:3-13` | 字节级算法纯函数 |
| `checksumCrc16Modbus` / `checksumCrc32` | `send/core/checksum.ts:27-53` | CRC 算法纯函数，已有表驱动实现 |
| `calculateChecksum` | `send/core/checksum.ts:60-82` | 按 method 派发，支持 `startIdx` / `endIdx` slicing |
| `applyBuildPostPatch` | `send/core/checksum.ts:98-188` | 构帧后置补丁：autoChecksum 循环 + includeLengthField |
| `CHECKSUM_METHOD_OPTIONS` | `frame/components/field-labels.ts:57-60` | 从 `CHECKSUM_METHODS.map(t => ({ value: t, label: t.toUpperCase() }))` 自动生成 |
| `FrameFieldEditorDialog` 下拉 | `frame/components/FrameFieldEditorDialog.vue:314-326` | `<q-select :options="CHECKSUM_METHOD_OPTIONS">`，不直接引用 `CHECKSUM_METHODS` |

#### 变化

| 动作 | 内容 | 动机 |
|------|------|------|
| 扩展 | `CHECKSUM_METHODS` 末尾追加 `'sum32'`, `'sum16'`（`'crc32'` 后、`'custom'` 前） | D6 |
| 新增 | `checksumSum32(bytes, bigEndian): number` | 4B word 累加，`>>> 0` 返回无符号 32 位 |
| 新增 | `checksumSum16(bytes, bigEndian): number` | 2B word 累加，`& 0xffff` |
| 扩展 | `calculateChecksum` 加 `case 'sum32'` / `case 'sum16'` 分支，signature 加 `bigEndian?` 入参 | D1 / D3 |
| 扩展 | `ChecksumOptions` 加 `readonly bigEndian?: boolean` | D1 端序传递路径 |
| 扩展 | `applyBuildPostPatch` 在 `checksumBytes` 计算后立即校验对齐，违者 push issue 并 `continue` | D2 / D5 |
| 扩展 | `applyBuildPostPatch` 调 `calculateChecksum` 时传入 `{ bigEndian: field.bigEndian }` | D1 端序从 field 流到算法 |
| 自动跟随 | `CHECKSUM_METHOD_OPTIONS` 自动包含新选项 | `field-labels.ts` 不动 |
| 自动跟随 | `FrameFieldEditorDialog` 下拉自动暴露 `SUM32` / `SUM16` | UI 不动 |

#### 接口示例

**类型扩展**（`frame/core/types.ts:20`）：

```typescript
export const CHECKSUM_METHODS = [
  'sum8', 'xor8', 'crc16', 'crc32', 'sum32', 'sum16', 'custom'
] as const;
```

**算法实现**（`send/core/checksum.ts` 新增）：

```typescript
export function checksumSum32(
  bytes: readonly number[],
  bigEndian: boolean = false,
): number {
  let sum = 0;
  // 调用方保证 bytes.length % 4 === 0（对齐校验在 applyBuildPostPatch 完成）
  const buf = Uint8Array.from(bytes);
  for (let i = 0; i + 4 <= buf.length; i += 4) {
    const view = new DataView(buf.buffer, buf.byteOffset + i, 4);
    sum += view.getUint32(0, !bigEndian);
  }
  return sum >>> 0;
}

export function checksumSum16(
  bytes: readonly number[],
  bigEndian: boolean = false,
): number {
  let sum = 0;
  const buf = Uint8Array.from(bytes);
  for (let i = 0; i + 2 <= buf.length; i += 2) {
    const view = new DataView(buf.buffer, buf.byteOffset + i, 2);
    sum += view.getUint16(0, !bigEndian);
  }
  return sum & 0xffff;
}
```

**`calculateChecksum` 扩展**（`send/core/checksum.ts:60-82`）：

```typescript
export interface ChecksumOptions {
  readonly startIdx?: number;
  readonly endIdx?: number;
  readonly bigEndian?: boolean;  // 新增
}

export function calculateChecksum(
  bytes: readonly number[],
  kind: string,
  options?: ChecksumOptions,
): number {
  let slice = bytes;
  if (options?.startIdx !== undefined || options?.endIdx !== undefined) {
    slice = bytes.slice(options?.startIdx ?? 0, options?.endIdx);
  }
  const be = options?.bigEndian ?? false;
  switch (kind) {
    case 'sum8':
      return checksumSum8(slice);
    case 'xor8':
      return checksumXor8(slice);
    case 'crc16':
    case 'crc16-modbus':
      return checksumCrc16Modbus(slice);
    case 'crc32':
      return checksumCrc32(slice);
    case 'sum32':                                    // 新增
      return checksumSum32(slice, be);
    case 'sum16':                                    // 新增
      return checksumSum16(slice, be);
    default:
      return 0;
  }
}
```

**`applyBuildPostPatch` 对齐校验**（插入 `checksum.ts:137` 之后、`calculateChecksum` 调用之前）：

```typescript
const method = checksumMethod ?? 'sum8';

// 【新】Range 对齐校验
const rangeLength = endByte - startByte;
const expectedMultiple = method === 'sum32' ? 4 : method === 'sum16' ? 2 : 0;
if (expectedMultiple > 0 && rangeLength % expectedMultiple !== 0) {
  issues.push(makeIssue(
    'error',
    'send.build.checksumRangeUnaligned',
    `${method} requires range length to be a multiple of ${expectedMultiple} bytes (got ${rangeLength}).`,
    field.id,
  ));
  continue;
}

const checksumBytes = Array.from(result.slice(startByte, endByte));
const checksumValue = calculateChecksum(checksumBytes, method, {
  bigEndian: field.bigEndian,                      // 【新】端序从 field 流入
});
```

### 2.2 编排层

#### 主流程

```
build(buffer, fields, options)
  → applyBuildPostPatch(buffer, fields, options)
    → if options.autoChecksum:
        for each field where validOption?.isChecksum:
          1. validate range indices                   [现状]
          2. validate field length (1/2/4)            [现状]
          3. resolve method + compute rangeLength     [现状]
             (rangeLength = endField.offset + endField.length - startField.offset)
          4. 【新】validate range alignment             (sum32: rangeLength %4, sum16: %2; 其他 method expectedMultiple=0 跳过)
          5. slice checksumBytes from result           [现状]
          6. calculateChecksum(checksumBytes, method, { bigEndian })  [扩 signature: 加 bigEndian]
          7. validate overflow                         [现状]
          8. write checksum into result                [现状]
    → if options.includeLengthField:
        ... [现状不变]
```

#### 现状

`applyBuildPostPatch` 已是构帧期集中地，循环消费每个 `isChecksum` 字段并按声明顺序计算（多 checksum 字段从前到后依次算的需求已是现状行为）。本 feature 在循环体内插入一个新的校验分支，不动整体拓扑。

#### 变化

新增 step 4 对齐校验分支；step 6 扩 signature 传 `bigEndian`。其他步骤零变化。对齐校验只依赖 `rangeLength`（slice 之前即可计算），不依赖 checksumBytes 内容——意味着对齐失败时不必先 slice。

#### 跨层纪律

- **错误语义**：对齐校验报 `SendBuildIssue` error，由 send pipeline 阻断发送（与现有 `checksumOverflow` 等同机制）。`calculateChecksum` 保持纯函数不抛错
- **幂等性**：checksum 计算纯函数，相同输入相同输出；`applyBuildPostPatch` 不修改入参 buffer（拷贝后修改）
- **性能**：word 累加 O(n/4) 或 O(n/2)，单次构帧内调用次数等于 checksum 字段数（通常 1-2 个），可忽略
- **扩展点**：未来加新 method（如 `crc32c`）只需扩 `CHECKSUM_METHODS` + `calculateChecksum` case + 算法函数；如该方法有对齐要求，同步扩 `expectedMultiple` 判断
- **多 checksum 字段顺序依赖（现状行为，本 feature 保持）**：`applyBuildPostPatch` 在 `new Uint8Array(buffer)` 拷贝上循环写入。多个 checksum 字段按 `fields` 数组顺序依次处理；如果字段 B 的 range 包含字段 A 的 checksum 字节位置，且 A 在 B 之前被写入，则 B 计算时会读到 A 已写入的 checksum 值。这是**现状行为**（`checksum.ts:111-159`），本 feature 不引入新问题也不修复——若协议要求 checksum 字段互相独立，需在 frame 定义时让 range 不重叠。本 feature 新增测试覆盖"两个 sum 字段 range 不重叠"的常规场景；range 重叠场景作为 known gap 留作 future work（如需要可在 `frame-validation.ts` 加 warning）

### 2.3 挂载点清单

| 挂载位置 | 动作 | 严重度 |
|---------|------|--------|
| `frame/core/types.ts:20`（`CHECKSUM_METHODS`） | 扩展数组 | blocker |
| `send/core/checksum.ts`（新增 `checksumSum32` / `checksumSum16`） | 新增函数 | blocker |
| `send/core/checksum.ts:55-58`（`ChecksumOptions`） | 加 `bigEndian?: boolean` | blocker |
| `send/core/checksum.ts:60-82`（`calculateChecksum`） | 加 sum32/sum16 case | blocker |
| `send/core/checksum.ts:131-139`（`applyBuildPostPatch` 循环体） | 插入对齐校验 + 调 `calculateChecksum` 传 bigEndian | blocker |
| `send/__tests__/send-checksum-patch.spec.ts` | 加新单测组 | blocker |
| `send/__tests__/send-checksum-sum-word.spec.ts`（新文件，或扩展现有 integration） | SUM32/16 round-trip 集成测试 | blocker |
| `send/fixtures/` 或 inline test data | 测试用 frame fixture | minor |
| `frame/components/field-labels.ts` | **不动**（自动跟随） | — |
| `frame/components/FrameFieldEditorDialog.vue` | **不动**（自动跟随） | — |

删除 feature 方式：从 `CHECKSUM_METHODS` 移除 `'sum32'` / `'sum16'`、删 `checksumSum32/16` 函数、撤 `ChecksumOptions.bigEndian`、撤 `applyBuildPostPatch` 对齐分支、删相关测试 → feature 完全消失。

### 2.4 推进策略

```
1. 类型层：CHECKSUM_METHODS 扩展
   退出信号：pnpm -C rewrite build 通过；现有测试不受影响

2. 算法层：checksumSum32/16 + calculateChecksum case + ChecksumOptions 加 bigEndian
   退出信号：新单测（算法正确性 + 端序 + overflow mask）通过

3. 对齐校验：applyBuildPostPatch 加 range 对齐分支 + 传 bigEndian 给 calculateChecksum
   退出信号：新单测（sum32 %4 错 / sum16 %2 错 / 正好对齐通过）通过

4. 集成测试：sum32/sum16 round-trip（fixture frame → build → 验证 checksum 字节）
   退出信号：集成测试通过；不依赖 setTimeout / 不复制生产代码

5. UI 验证（手工 checklist）：FrameFieldEditorDialog 打开 → checksum 配置 → method 下拉看到 SUM32/SUM16
   退出信号：浏览器手动验证两个新选项可见

6. 全量 lint + test
   退出信号：pnpm -C rewrite lint 零新增 error；pnpm -C rewrite test 零新增失败
```

### 2.5 结构健康度与微重构

#### 评估

| 文件 | 当前行数 | 改动密度 | 改后行数（估） |
|------|---------|---------|--------------|
| `frame/core/types.ts` | 127 | +0 行（数组内追加 2 个字符串字面量） | 127 |
| `send/core/checksum.ts` | 188 | +30 行（2 个算法函数 + calculateChecksum 2 case + applyBuildPostPatch 校验分支 + ChecksumOptions 1 字段） | ~218 |
| `send/__tests__/send-checksum-patch.spec.ts` | 361 | +120 行（新 describe 组） | ~480 |
| `send/__tests__/send-checksum-sum-word.spec.ts` | 0（新文件） | +80 行 | 80 |

#### 结论：不做微重构

所有改动文件远低于 500 行阈值；改动密度集中在 `checksum.ts` 单文件 +30 行，仍是单一职责（checksum 算法和构帧补丁）；测试文件 480 行属正常（现有 361 行已覆盖 5 种 method）。不拆分、不抽 helper、不引入新模块。

#### 超出范围的观察

- `applyBuildPostPatch` 函数较长（90 行），未来若再加 method 校验维度（如 CRC 多项式配置）可考虑抽 `validateChecksumField(field, fields)` helper。但本轮不重构。
- `CHECKSUM_METHOD_OPTIONS` 的 `label: t.toUpperCase()` 把 `sum32` 显示为 `SUM32`，符合常见协议文档写法。如未来需要中文 label（如"累加和32"），可改 `field-labels.ts` 加 label map，但本轮不做。

## 3. 验收契约

### 关键场景清单

| 场景 | 输入 | 期望可观察结果 |
|------|------|--------------|
| sum32 BE 4B 数据 | bytes=[0,0,0,1, 0,0,0,2], bigEndian=true | checksum=3 |
| sum32 LE 4B 数据 | bytes=[1,0,0,0, 2,0,0,0], bigEndian=false | checksum=3 |
| sum32 BE/LE 结果不同 | bytes=[1,2,3,4], BE vs LE | BE=`0x01020304 + ...`、LE=`0x04030201 + ...`，两者不等 |
| sum16 BE 2B 数据 | bytes=[0,1, 0,2], bigEndian=true | checksum=3 |
| sum16 LE 2B 数据 | bytes=[1,0, 2,0], bigEndian=false | checksum=3 |
| sum32 overflow mask | 多个 `0xFFFFFFFF` word 累加 | 结果 `>>> 0` 落在 `[0, 0xFFFFFFFF]` |
| sum16 overflow mask | 多个 `0xFFFF` word 累加 | 结果 `& 0xffff` 落在 `[0, 0xFFFF]` |
| sum32 range 非 4B 倍数 | range 字节长度 = 6 | `send.build.checksumRangeUnaligned` error issue，buffer 不被改写 |
| sum16 range 非 2B 倍数 | range 字节长度 = 3 | 同上 error issue |
| sum32 range 正好 4B 倍数 | range 字节长度 = 8 | 正常计算，零 issue |
| sum16 range 正好 2B 倍数 | range 字节长度 = 4 | 正常计算，零 issue |
| sum8 / crc32 等不受对齐校验影响 | 现有 method + 任意 range 长度 | 零对齐 issue（expectedMultiple=0 跳过） |
| 多 checksum 字段同帧 | 一帧含 sum32 + sum8 两个 checksum 字段 | 各自独立 range、独立计算、互不干扰 |
| checksum 写入端序跟随 field | sum32 字段 bigEndian=true，dataView 读出 BE | buffer 中 4 字节按 BE 排列 |
| FrameFieldEditorDialog 下拉 | 打开字段编辑器 → 启用 checksum → 点 method 下拉 | 选项列表含 `SUM32`、`SUM16`（自动） |
| 集成 round-trip sum32 | 构造 fixture frame（含 sum32 字段）→ `applyBuildPostPatch` → 验证 checksum 字节 | checksum 字节等于独立计算的预期值 |
| 集成 round-trip sum16 | 同上，sum16 字段 | 同上 |
| 旧 JSON 兼容 | 加载已有 frame（无 sum32/sum16 配置）→ build | 行为零变化 |
| 'custom' method 仍返回 0 | method='custom' | calculateChecksum 返回 0（现状不变） |
| 空 bytes 行为 | `checksumSum32([])` / `checksumSum16([])` | 返回 0（循环不进入，sum 初值 0），不抛错、不返回 NaN |

### 明确不做的反向核对项

实施完成后代码中**不应**出现：

- `CHECKSUM_METHODS` 之外的新 method 字面量散落（如硬编码 `'sum32'` 字符串在 switch case 之外）
- `calculateChecksum` 内的 `throw` 语句（保持纯函数）
- `FrameChecksumDefinition` 上的 `endian` 字段（端序走 `field.bigEndian`）
- `SendStepConfig` 上新增 checksum 字段（checksum 仍归 frame field）
- `field-labels.ts` 的 `CHECKSUM_METHOD_OPTIONS` 改动（应自动跟随）
- `FrameFieldEditorDialog.vue` 改动（应自动跟随）
- 任何对 sum8 / xor8 / crc16 / crc32 现有算法函数的修改
- schema version 提升（保持 v1）
- 新增 service / state container / 跨 feature 公共 API

## 4. 与项目级架构文档的关系

本 feature 改动局限在：

- `frame/core/types.ts` 单 enum 扩展（无新接口、无新模块）
- `send/core/checksum.ts` 单文件内部扩展（新函数 + 现有函数 signature 扩展）
- `send/__tests__/` 测试新增

无系统级可见变化：

- **名词**：不新增跨 feature 类型；`ChecksumMethod` union 自然扩展，下游消费方（`field-labels.ts`、`FrameFieldEditorDialog`）自动跟随
- **动词骨架**：`applyBuildPostPatch` 拓扑不变，循环内插一个分支
- **跨层纪律**：无新增跨 feature 约束；`SendBuildIssue` 机制沿用

`acceptance` 阶段核实后可跳过归并。
