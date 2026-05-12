# Send-real 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-08
> 关联方案 doc：codestable/features/rewrite-send/send-real-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：
- [x] SendFieldEncodingDef 扩展（core/types.ts）：新增 factor/defaultValue/configurable/expressionConfig/validOption → 代码实际行为一致，所有新字段类型与 FrameFieldDefinition 对齐
- [x] SendRequest 迁移（core/types.ts）：fieldValues→userFieldValues, 移除 options, 新增 variables, context 改可选 → 代码实际行为一致，所有引用点已更新
- [x] SendVariableProvider adapter port（adapters/ports.ts）：getVariables(): VariableMap → 代码实际行为一致，FakeVariableProvider 已实现
- [x] Checksum 扩展（core/checksum.ts）：checksumCrc32 + calculateChecksum range + applyBuildPostPatch → 代码实际行为一致

**名词层"现状 → 变化"逐项核对**：
- [x] FrameFieldDefinition 消费扩展：frameToBuildInput 消费 factor/expressionConfig/defaultValue/configurable/validOption → frame-resolver.ts 已实现
- [x] SendFieldEncodingDef 扩展：6 字段 → 12 字段 → types.ts 已落地
- [x] SendRequest 扩展：fieldValues → userFieldValues + variables → types.ts 已落地
- [x] VariableProvider：新增 adapter port → ports.ts 已落地
- [x] Checksum：新增 crc32 + range + 回填 → checksum.ts 已落地

**流程图核对**（第 2.2 节 mermaid 图）：
- [x] 9 步 pipeline 节点在 send-service.ts execute 方法中均有实际落点（validate→resolve frame→resolveFieldValues→applyFactor→buildFrame→applyBuildPostPatch→resolveTarget→transportWrite→emitResult）

## 2. 行为与决策核对

对照方案第 1 节 + 第 2.2 节：

**需求摘要逐项验证**：
- [x] 完整消费 frame-real 字段（factor/expressionConfig/defaultValue/configurable/validOption/autoChecksum/includeLengthField）→ frameToBuildInput + resolveFieldValues 已实现
- [x] 字段值解析（用户输入/表达式/默认/zero fill 四级优先级）→ resolveFieldValues 已实现
- [x] 表达式求值集成（compileConditional + evaluateConditional）→ evaluateFieldExpressions 使用 shared/expression
- [x] Factor 逆换算（raw = physical / factor）→ applyFactor 已实现，含 factor=0 防护
- [x] Post-build patch（checksum + length 回填）→ applyBuildPostPatch 已实现
- [x] Direction 过滤（direction='send'）→ send-service.ts step 2 已实现
- [x] VariableProvider adapter port → ports.ts + fake-variable-provider.ts 已实现
- [x] CRC32 算法补充 → checksumCrc32 已实现

**明确不做逐项核对**（第 1.2 节）：
- [x] SCOE 成功条件 → grep 确认 send core 无 SCOE 协议逻辑
- [x] northbound 回执 → SendResult 不含回执语义
- [x] 报告交付 → SendResult 不含 report 字段
- [x] 定时/触发/序列调度 → send 不含调度逻辑
- [x] UI 页面/表单 → send core/services 无 Vue 组件
- [x] 真实连接管理 → 全部通过 adapter port
- [x] custom checksum → calculateChecksum 无 custom 实现
- [x] 重试/超时策略 → transport write 失败直接返回错误
- [x] 表达式编译缓存 → 每次 execute 编译
- [x] FIFO 队列 → 直接 transport write，无队列

**关键决策落地**：
- [x] D1: 表达式用 compileConditional + evaluateConditional → evaluateFieldExpressions 直接调用
- [x] D2: Factor 发送用 `/` → applyFactor: rawValue / factor
- [x] D3: checksumMethod 字段级来源 → validOption.checksumMethod 唯一来源
- [x] D4: checksum 溢出返回 build-error → applyBuildPostPatch 检测 > maxForLength 返回 error
- [x] D5: 非 configurable 用户输入静默忽略 → resolveFieldValues 仅 configurable 字段接受用户值
- [x] D6: Pipeline 9 步 → send-service.ts execute 9 步
- [x] D7: 本期不做 FIFO → 直接 transport write
- [x] D8: Post-build patch 合并 checksum + length → applyBuildPostPatch 一个函数两个分支

**挂载点反向核对（可卸载性）**——对照第 2.3 节：
- [x] send service 创建（runtime/bootstrap 注入 frameReader + targetResolver + transportWriter + variableProvider）→ CreateSendServiceOptions 4 个必填 adapter
- [x] send public API 导出（features/send/index.ts）→ grep 确认外部只通过 index.ts 导入
- [x] send selector 消费（pages/widgets 通过 selector 读取）→ 4 个 selector 函数
- [x] task send-step 调用（task runtime 调用 execute(request)）→ Promise<SendResult> 接口
- [x] connection adapter 注入（runtime/bootstrap 提供 adapter 实现）→ 4 个 adapter port
- [x] **反向核查**：grep send feature 在外部的引用，均落在清单内挂载点
- [x] **拔除沙盘推演**：移除 send/ 目录 + index.ts 导出 + runtime 注入点 → send 能力完全消失，无残留

## 3. 验收场景核对

对照方案第 3 节关键场景清单：

- [x] **SC1** 基本构帧发送：SendRequest{frameId, targetId, userFieldValues 全部填} → buffer [0xFF, 0x01], kind='sent', stats 更新 → 证据：send-integration.spec.ts + send-service-state-selector.spec.ts
- [x] **SC2** 表达式字段求值：帧有 expressionConfig，variables 含所需变量 → 求值结果正确填入 buffer → 证据：send-frame-resolver.spec.ts + send-integration.spec.ts
- [x] **SC3** 表达式条件分支：多分支条件表达式，variables 含速度值 → 匹配正确分支 → 证据：send-frame-resolver.spec.ts + send-integration.spec.ts
- [x] **SC4** 表达式求值失败：语法错误/变量缺失 → zero fill + error issue，不阻断其他字段 → 证据：send-frame-resolver.spec.ts + send-integration.spec.ts
- [x] **SC5** Factor 逆换算：factor=0.1，用户输入 25.5 → rawValue=255 → 证据：send-frame-resolver.spec.ts
- [x] **SC6** Factor=1 无转换：factor=1 → 直接传值不做除法 → 证据：send-frame-resolver.spec.ts
- [x] **SC7** defaultValue fallback：无用户输入/无表达式/有 defaultValue → 使用默认值 → 证据：send-frame-resolver.spec.ts
- [x] **SC8** Zero fill warning：无用户输入/无表达式/无 defaultValue → 0 + warning → 证据：send-frame-resolver.spec.ts
- [x] **SC9** Auto checksum：autoChecksum=true + isChecksum 字段 → checksum 字段位置写入正确校验和 → 证据：send-checksum-patch.spec.ts + send-integration.spec.ts
- [x] **SC10** Auto length：includeLengthField=true + lengthFieldId → length 字段写入帧总长度（当前 lengthFieldId 未在 frame-real types 中存在，测试走 warning 路径）→ 证据：send-checksum-patch.spec.ts + send-integration.spec.ts
- [x] **SC11** Direction 过滤：direction='receive' → kind='build-error' → 证据：send-integration.spec.ts
- [x] **SC12** Target 不可用：targetId 不可用 → kind='target-unavailable' → 证据：send-integration.spec.ts + send-service-state-selector.spec.ts
- [x] **SC13** Transport 写入失败：transportWriter 抛错 → kind='transport-error' → 证据：send-integration.spec.ts + send-service-state-selector.spec.ts
- [x] **SC14** Configurable 优先级：非 configurable 有用户输入+表达式 → 用户输入被忽略 → 证据：send-frame-resolver.spec.ts + send-integration.spec.ts
- [x] **SC15** CRC32 checksum：checksumMethod='crc32' → CRC32 计算结果正确 → 证据：send-checksum-patch.spec.ts
- [x] **SC16** Checksum 溢出：结果超出字段宽度 → build-error → 证据：send-checksum-patch.spec.ts
- [x] **SC17** Length field 缺失：includeLengthField=true 但无 lengthFieldId → 跳过 + warning → 证据：send-checksum-patch.spec.ts

**前端改动**：本 feature 不含 UI 改动（设计 §1.2 明确排除），无浏览器验证需求。

## 4. 术语一致性

对照方案第 0 节 + 第 2.1 节命名 grep 代码：

- 构帧：代码中 frameToBuildInput/buildFrame 命名一致 ✓
- 值解析：代码中 resolveFieldValues 命名一致 ✓
- factor 逆换算：代码中 applyFactor，逻辑为 value / factor ✓
- checksum 回填：代码中 applyBuildPostPatch ✓
- VariableProvider：代码中 SendVariableProvider ✓
- transport-level queue：代码中未实现（设计排除）✓
- 防冲突：术语表中无禁用词 ✓

## 5. 架构归并

对照方案第 4 节（跨 feature 接口注册）：

- [x] rewrite-target-structure.md:140（send/ 行）：已更新为 9 步 pipeline 描述 + VariableProvider + 表达式求值集成 + FIFO 已推迟标注
- [x] rewrite-target-structure.md:397（构造发送字节位置示例）：已扩展为含表达式求值、factor 逆换算、checksum/length 回填
- [x] rewrite-feature-boundaries.md:113（send OwS 行）：不需要更新（pre-design 边界筛选器，已被 send-real design 取代）
- [x] rewrite-feature-interaction-matrix.md:130-138（send 作为生产者）：不需要更新（跨 feature 交互方向未改变）
- [x] 2026-04-28-rewrite-execution-charter.md：不需要更新（章程不跟踪 feature 内部 pipeline 细节）

**新增跨 feature 接口**（方案 §4.1）：
- [x] SendVariableProvider port：已归入 rewrite-target-structure.md send/ 行描述

## 6. requirement 回写

方案 frontmatter `requirement` 为空。send-real 是构帧管线能力的补齐实现，不新增用户可感知的 UI 能力，是对已有 send skeleton 的功能填充。

- [x] 无 requirement 回写：send-real 是现有 send feature 的实现补全，不新增独立用户可见能力。

## 7. roadmap 回写

方案 frontmatter 无 `roadmap` / `roadmap_item` 字段。

- [x] 非 roadmap 起头，跳过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- 候选 1：`FrameOptionsDefinition.lengthFieldId` 在 frame-real types 中尚未正式新增，send-real 通过 `as Record<string, unknown>` 安全读取。当 frame-real 补齐后需去掉类型断言。建议记入 AGENTS.md 或 cs-note。（建议放 cs-note）

## 9. 遗留

- 后续优化点：
  - `send-service.ts` execute 方法 ~145 行，接近 150 行上限，建议走 cs-refactor 拆为独立 step 函数
  - 表达式编译缓存（design 明确推迟）
  - Transport-level FIFO 队列（待并发调用方出现再加）
- 已知限制：
  - `FrameOptionsDefinition.lengthFieldId` 未在 frame-real types 中定义，length 回填走 warning 路径
  - c15 manual 页面可达：deferred（需 UI 页面实现）
  - c16 hardware 发送验证：deferred（需 connection-complete + 真实串口/网络）
- 实现阶段"顺手发现"列表：
  - 无
