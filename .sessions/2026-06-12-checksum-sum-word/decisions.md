# Decisions — Checksum SUM32/SUM16 Feature 实施

> 本专题拍板决策档案。每条 D### 永不删除，被取代时改 status。

## D001: frame.options 缺失修复——fixture 显式补 options，不做 service 兜底

> status: active
> date: 2026-06-19
> 取代：无
> 被取代：无

### 决策

dongfanghong 帧的 frame 级 `options`（autoChecksum 总开关）缺失，导致发送帧校验位恒 0。修复方式：在**真源头 fixture**（`dongfanghong-frames.ts` 的 builder）显式补 `options`，而非直接改生成物 JSON、也不在 send-service 加"有 isChecksum 字段就默认 autoChecksum"的兜底。

### 理由

1. **JSON 是生成物不是源头**：`public/frames/dongfanghong-frames.json` 由 `scripts/generate-dongfanghong-frames-json.ts` 从 fixture 生成。直改 JSON 会在下次重新生成时被覆盖，必须改上游 fixture。
2. **显式优于隐式**（用户原话约束）：帧要不要算校验位，应在帧定义里显式声明，而不是藏在 service 的推断规则里。看帧定义就能看出行为。
3. **副作用面**：service 兜底会改变**所有**导入帧（含未来第三方帧）的默认行为——只要帧里有 isChecksum 字段就自动算，可能违背帧作者意图。改 fixture 只影响 dongfanghong 帧。

### 排除的替代方案

- **直改 JSON**：否决。JSON 是生成物，重跑生成脚本即覆盖，不可持续。
- **send-service 加兜底推断**（`field.validOption.isChecksum` 存在则 `autoChecksum=true`）：否决。隐式、改全局默认行为、副作用面大。仅在"fixture 改不了（如第三方导入帧）"时才考虑此兜底，dongfanghong 帧是自有 fixture 不适用。

### 影响范围

- `rewrite/src/features/frame/fixtures/dongfanghong-frames.ts`：`buildRcFrameAsset`（send，30 帧）返回对象加 `options: { autoChecksum: true, bigEndian: true, includeLengthField: false }`；`buildTmFrameAsset`（receive，17 帧）故意不设（注释说明）。
- `rewrite/public/frames/dongfanghong-frames.json`：重新生成产物（send 30 帧 options 全写入）。
- **契约**：`FrameOptionsDefinition`（types.ts:88）三字段 `autoChecksum/bigEndian/includeLengthField` 全填。`lengthFieldId` 不在该结构里，故 includeLengthField 只能配 false（否则 checksum.ts:213 留 warning 且 length 语义错）。
- **不变量**：checksum.ts 算法实现不动（sum32/sum16/对齐/端序在 S001 已验）；identifierRules 不碰。

### 来源

S002（根因复核 + 方案对比）。用户约束："显式优于隐式"、"不要改 checksum.ts 的算法实现"。
触发原话: 无（技术推导为主，用户给的是"改 JSON 补 options"的方向建议，经复核发现 JSON 是生成物后修正为改 fixture）。
