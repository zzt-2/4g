# Send-Real 实现提示词

## 背景

send-real design 已 approved，checklist 已生成。你的任务是实现 checklist 中的全部步骤（s0-s7）。

**必读文档**（按顺序）：
1. `codestable/features/rewrite-send/send-real-design.md` — 完整设计，所有决策和验收场景
2. `codestable/features/rewrite-send/send-real-checklist.yaml` — 实现步骤和退出信号
3. `codestable/features/rewrite-send/send-real-brainstorm.md` — 事实证据（需要查数据时参考）

**关键代码文件**（启动时先读取）：
- `rewrite/src/features/send/core/types.ts` — 现有类型
- `rewrite/src/features/send/core/encode.ts` — 现有 buildFrame
- `rewrite/src/features/send/core/checksum.ts` — 现有 checksum
- `rewrite/src/features/send/core/validation.ts` — 现有验证
- `rewrite/src/features/send/services/send-service.ts` — 现有 pipeline（252行）
- `rewrite/src/features/send/adapters/ports.ts` — adapter 接口
- `rewrite/src/features/send/state/send-state.ts` — 状态管理
- `rewrite/src/features/send/selectors/send-selectors.ts` — selector
- `rewrite/src/features/send/__tests__/` — 现有测试
- `rewrite/src/features/frame/core/types.ts` — frame-real 类型定义（消费来源）
- `rewrite/src/shared/expression/types.ts` — 表达式引擎类型
- `rewrite/src/shared/expression/compile.ts` — compileConditional 签名
- `rewrite/src/shared/expression/evaluate.ts` — evaluateConditional 签名

## 关键设计决策（不要违反）

1. **表达式用 compileConditional + evaluateConditional**，不是 compileGroup。ExpressionDefinition 含多条件分支（如 `速度>0` / `速度<=0`），compileConditional 原生支持。不要手动展平分支。
2. **Factor 发送用 `/`**（`rawValue = value / factor`）。当前发送帧 factor 全为 1，实际无转换，但代码必须实现。
3. **checksumMethod 只有字段级来源**（validOption.checksumMethod），无帧级默认。
4. **checksum 值超出字段字节宽度时返回 build-error**，不截断。
5. **非 configurable 字段的用户输入静默忽略**，不 warning 不 error。
6. **Pipeline 是 9 步**（不是 10 步）：validate → resolve frame → resolve field values → apply factor → build buffer → post-build patch → resolve target → transport write → emit result。
7. **本期不做 FIFO queue**。直接 transport write。
8. **Post-build patch 合并 checksum + length 回填**，不是一个步骤。

## 实现步骤与 Agent 分工

### Round 1（并行，两个 agent）

**Agent A: s0 微重构**
- 将 `send-service.ts` 中的 `frameToBuildInput()` 提取到新文件 `core/frame-resolver.ts`
- 只搬不改行为
- 移动后运行 `pnpm -C rewrite test -- features/send` 确保全绿
- 更新相关 import

**Agent B: s1 扩展 core types**
- `SendFieldEncodingDef` 新增：factor(默认1), defaultValue?, configurable, expressionConfig?, validOption?
- `SendRequest` 迁移：`fieldValues` → `userFieldValues`（类型保持 `SendFieldValue = string|number|boolean`），新增 `variables?: VariableMap`，移除 `options`（checksum 由帧定义决定）
- 新增 `SendVariableProvider` adapter port 到 `adapters/ports.ts`
- 更新所有引用旧 `SendRequest` 字段的代码（service、tests、fixtures）使其编译通过
- 类型变更可能影响现有测试，先确保 TypeScript 编译通过

### Round 2（并行，两个 agent，等 Round 1 完成）

**Agent C: s2 core 纯函数**
在 `core/frame-resolver.ts` 中新增三个纯函数：

1. `resolveFieldValues(fields, userFieldValues, variableProvider, variables?)` — 按优先级解析：
   - configurable && 有用户值 → 用用户值
   - 有 expressionConfig → 调用 evaluateFieldExpressions
   - 有 defaultValue → 解析默认值
   - 以上都没有 → zero fill + warning

2. `evaluateFieldExpressions(field, variables)` — 单字段表达式求值：
   - 读取 `field.expressionConfig.expressions`（条件分支数组）
   - `compileConditional(field.expressionConfig.expressions)` 编译
   - 合并变量：`request.variables` + `variableProvider.getVariables()` + 解析后的 expressionConfig.variables
   - `evaluateConditional(compiled, mergedVariables)` 求值
   - 成功 → 返回值，失败 → zero fill + error

3. `applyFactor(fields, fieldValues)` — 对非 bytes 且 factor !== 1 的字段做 `value / factor`

测试覆盖：SC2-SC8, SC14（见 design §3）
必须 `import` from `shared/expression`，不要自己实现表达式逻辑。

**Agent D: s3 checksum + post-build patch**

1. 新增 `checksumCrc32(bytes: readonly number[]): number`
2. 扩展 `calculateChecksum` 支持 `options?: { startIdx: number; endIdx: number }`
3. 新增 `applyBuildPostPatch(buffer, fields, frameOptions)`:
   - Checksum 回填：找 `validOption.isChecksum === true` 的字段，按范围计算，回填
   - Length 回填：通过 `frameOptions.lengthFieldId` 找字段，写入 buffer 总长度。lengthFieldId 缺失时跳过 + warning
   - Checksum 值超出字段宽度 → 返回 build-error

测试覆盖：SC9, SC10, SC15-SC17

### Round 3（单个 agent，等 Round 2 完成）

**Agent E: s4 pipeline 重写**
- 重写 `frameToBuildInput()`：消费 frame-real 全部字段（factor/expressionConfig/defaultValue/configurable/validOption/isASCII）
- 重排 `send-service.ts` pipeline 为 9 步
- 新增 `variableProvider` 到 `createSendService` options
- direction 检查：resolveFrame 后验证 `frame.direction === 'send'`
- 确保现有测试适配新 pipeline
- 运行 `pnpm -C rewrite test -- features/send`

### Round 4（并行，两个 agent，等 Round 3 完成）

**Agent F: s5 fixtures + fake adapters**
- 新增 `FakeVariableProvider`（返回预设变量 Map）
- 更新 `send-fixtures.ts`：
  - 含 expressionConfig 的字段（含多条件分支）
  - 含 factor 的字段
  - checksum 字段 + validOption
  - length 字段 + lengthFieldId
- 更新现有测试使用新 fixtures

**Agent G: s6 端到端集成测试**
用 fake adapter 跑完整 9 步 pipeline：
- 全用户输入发送（SC1）
- 表达式条件分支发送（SC2, SC3）
- 表达式失败 graceful degradation（SC4）
- checksum + length 回填发送（SC9, SC10）
- 错误路径：direction 错误（SC11）、target 不可用（SC12）、transport 失败（SC13）
- configurable 优先级（SC14）

### Round 5（单个 agent）

**Agent H: s7 静态扫描 + 最终验证**
- grep 确认 c1-c8 所有检查项
- 运行 `pnpm -C rewrite build`
- 运行 `pnpm -C rewrite lint`
- 运行 `pnpm -C rewrite test`（全量）
- 输出实施摘要：Changed files / Verify evidence / Open issues

## 约束

- core/ 下零 Vue/Pinia/Electron 依赖
- 零跨 feature 内部 import（不 import frame/connection/receive/task 的 internal）
- 零 SCOE 硬编码
- selector 返回值必须深拷贝
- stats 不写回 frame 定义
- 所有 transport 操作通过 adapter port
- 每个步骤完成后运行相关测试确认退出信号

## 验证命令

```bash
pnpm -C rewrite test -- features/send    # send 相关测试
pnpm -C rewrite build                     # 构建验证
pnpm -C rewrite lint                      # lint 检查
```
