# Checksum SUM32 / SUM16 Feature 实施

> 状态: active | 创建: 2026-06-12 | 最后更新: 2026-06-19 S002 frame.options 缺失修复

## 进展线索

- **S001** 实施完成 (06-12)：按 design D1-D6 落地 sum32/sum16 算法 + 对齐校验 + 端序贯通。改动 3 文件 + 新增 1 测试文件（共 ~454 行）。checksum 单测 51/51 全过，send feature 全测试 105/105 全过。等待独立审查。
- **S002** bug 修复完成 (06-19)：发现 47 帧 frame 级 options 全缺失 → 校验位恒 0。根因在 fixture builder 从未设 options（JSON 是生成物，直改会被覆盖）。在 fixture 显式补 `options: {autoChecksum:true, bigEndian:true, includeLengthField:false}`（仅 send 30 帧；receive 17 帧故意不设）。send 测试 158/158、fixture e2e 57/57 全过。决策 D001。待用户 dev server 运行时验证。

## 已确认结论

- 直接合同：`codestable/features/2026-06-12-checksum-sum32-sum16/checksum-sum32-sum16-design.md` + `checksum-sum32-sum16-checklist.yaml`
- 实施严格按 design §2.3 挂载点清单：`frame/core/types.ts` + `send/core/checksum.ts` + 2 个测试文件
- 6 项设计决策（D1-D6）全部按 approved 落地，无临场扩范围、无自创抽象
- `field-labels.ts` 和 `FrameFieldEditorDialog.vue` 通过 `CHECKSUM_METHOD_OPTIONS.map(...)` 自动跟随，零修改
- Pre-existing baseline 失败（display/integration/runtime/scripts lint/rollup build）已通过 `git stash` 验证与本 feature 无关
- **D001 (06-19)**：frame.options 缺失修复选 fixture 显式补，不做 service 兜底（JSON 是生成物；显式优于隐式；includeLengthField 必须 false）

## 未决项

- **S002 待 dev server 运行时验证**：用户在 send 页发一帧，确认 checksum 字段不再是 0（应为 sum32 累加和）
- **等待独立审查**（S001）：控制方按 `rewrite-review-checklist.md` 流程开审查
- **UI 手工验证**（S001）：dev 服务器手工确认 method 下拉显示 SUM32 / SUM16
- **多 checksum range 重叠 known gap**：现状行为保留，未修复，作 future work

## 当前位置

S002 修复完成。fixture + JSON 改完、send 158/158 + fixture e2e 57/57 + lint + tsc 全过。未提交 git，等用户运行时验证后统一处理。pre-existing 的 `frame-service-state-selector.spec.ts`（vite 缺 plugin-vue）失败与本专题无关。
