# [S001] Checksum SUM32 / SUM16 实施

> 2026-06-12 | 实施 | active

## 目标

按已 approved 的 design 完成 `2026-06-12-checksum-sum32-sum16` feature 实施：
- 在 `CHECKSUM_METHODS` 加 `sum32` / `sum16`
- 在 `calculateChecksum` 加对应算法分支
- 在 `applyBuildPostPatch` 加 range 对齐校验（sum32 %4 / sum16 %2）
- 端序贯通：`field.bigEndian` 流到算法层
- UI 自动跟随（不动 `field-labels.ts` / `FrameFieldEditorDialog.vue`）

## 记录

### 直接合同

- `codestable/features/2026-06-12-checksum-sum32-sum16/checksum-sum32-sum16-design.md`
- `codestable/features/2026-06-12-checksum-sum32-sum16/checksum-sum32-sum16-checklist.yaml`

### 改动文件

| 文件 | 改动 |
|---|---|
| `rewrite/src/features/frame/core/types.ts` | `CHECKSUM_METHODS` 末尾追加 `'sum32'`, `'sum16'`（`'crc32'` 后、`'custom'` 前）— D6 |
| `rewrite/src/features/send/core/checksum.ts` | 新增 `checksumSum32` / `checksumSum16` 纯函数（DataView 读 word，`>>> 0` / `& 0xffff` 返回）— D3/D4；`ChecksumOptions` 加 `bigEndian?: boolean`；`calculateChecksum` 加 sum32/sum16 case，默认 `bigEndian=false`；`applyBuildPostPatch` 插入对齐校验 + 调 `calculateChecksum` 传 `{ bigEndian: field.bigEndian }` — D1/D2/D5 |
| `rewrite/src/features/send/__tests__/send-checksum-patch.spec.ts` | 新增 `describe('checksumSum32')` / `describe('checksumSum16')`；扩展 `describe('calculateChecksum')` 加 sum32/sum16 派发；扩展 `describe('applyBuildPostPatch')` 加对齐 error / 对齐通过 / 其他 method 不受影响 / sum32+sum16 端序跟随 field / 多 checksum 字段独立性 用例（+403 行） |
| `rewrite/src/features/send/__tests__/send-checksum-sum-word.spec.ts` | 新文件（283 行）：SUM32/SUM16 round-trip 集成 + 旧 frame 兼容性 |

### 关键决策落地

- **D1 端序**：`field.bigEndian` 通过 `ChecksumOptions.bigEndian` 流到 `checksumSum32` / `checksumSum16`。DataView 第二参数 `littleEndian = !bigEndian`，BE 字段按大端读 word
- **D2 对齐校验位置**：放在 `applyBuildPostPatch` 循环体内、`checksumBytes = result.slice(...)` 之前；用 `rangeLength = endByte - startByte` 判定（不依赖 slice 结果）；违者 push `send.build.checksumRangeUnaligned` error 并 continue，buffer 不被改写
- **D3 DataView 实现**：`new DataView(buf.buffer, buf.byteOffset + i, 4)` + `getUint32(0, !be)`；不用手动位运算
- **D4 Overflow mask**：sum32 `>>> 0`、sum16 `& 0xffff`，与 sum8 `& 0xff` 一致策略，不抛 error
- **D5 Error code**：`send.build.checksumRangeUnaligned`，与 `invalidChecksumRange` / `unsupportedChecksumFieldLength` / `checksumOverflow` 前缀风格一致
- **D6 枚举位置**：插在 `'crc32'` 和 `'custom'` 之间，custom 兜底放最后

### 验证证据

| 验证项 | 命令 | 结果 |
|---|---|---|
| checksum 单测 | `pnpm vitest run send-checksum-patch.spec.ts send-checksum-sum-word.spec.ts` | PASS (51) FAIL (0) |
| send feature 全测试 | `pnpm vitest run src/features/send/__tests__/` | PASS (105) FAIL (0) |
| 单独 lint 改动文件 | `npx eslint <4 个文件>` | No issues found |
| vue-tsc（过滤改动文件） | `npx vue-tsc --noEmit -p tsconfig.json` | 我文件零报错 |
| 全量 test baseline 对照 | `git stash` 后 `pnpm test` | 6 failures（与改后一致，pre-existing） |
| 全量 build baseline 对照 | `git stash` 后 `pnpm build` | `NON_EXTERNAL_SOURCE_PHASE_IMPORT`（pre-existing） |
| 自动跟随验证 | `git diff HEAD field-labels.ts` | 零修改 ✓ |

### 范围守护

- `field-labels.ts` 零修改（`CHECKSUM_METHOD_OPTIONS` 通过 `CHECKSUM_METHODS.map(...)` 自动包含新选项）
- `FrameFieldEditorDialog.vue` 本 session 零修改（working tree 中存在的 diff 来自 session 开始前的 pre-existing 改动）
- `sum8` / `xor8` / `crc16` / `crc32` 现有算法函数零修改
- `'custom'` method 仍走 `default` 分支返回 0
- `FrameChecksumDefinition` 结构未变
- schema version 未升（v1）

### Pre-existing baseline 失败（与本 feature 无关）

- 6 测试失败：`use-display-refresh.spec.ts` (4) / `frame-service-state-selector.spec.ts` (1) / `connection-core.spec.ts` (1) / `history-fieldname-resolution.spec.ts` (1) / receive 模块若干 / integration / runtime
- 1 lint 失败：`scripts/generate-dongfanghong-frames-json.ts` (TS project service 解析错误)
- 1 build 失败：rollup `NON_EXTERNAL_SOURCE_PHASE_IMPORT`

已通过 `git stash` + 改动文件 + 重跑测试的方式确认 baseline 状态一致。

## 后续

- **等待独立审查**：控制方按 `codestable/quality/rewrite-review-checklist.md` 流程开独立审查对话（结论四档 pass / pass-with-known-gaps / revise-required / blocked）
- **UI 手工验证待补**：本轮无浏览器环境，需在 dev 服务器手工确认 `FrameFieldEditorDialog` method 下拉显示 `SUM32` / `SUM16` 选项（设计上由 `CHECKSUM_METHOD_OPTIONS.map(...)` 自动跟随）
- **多 checksum 字段 range 重叠**：现状行为保留（design §2.2 known gap），未修复，未引入新问题，作为 future work
- **未提交 git**：按用户偏好，由控制方在审查通过后统一提交
