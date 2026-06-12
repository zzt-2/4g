# Checksum SUM32 / SUM16 Feature 实施

> 状态: active | 创建: 2026-06-12 | 最后更新: 2026-06-12 S001 实施完成

## 进展线索

- **S001** 实施完成 (06-12)：按 design D1-D6 落地 sum32/sum16 算法 + 对齐校验 + 端序贯通。改动 3 文件 + 新增 1 测试文件（共 ~454 行）。checksum 单测 51/51 全过，send feature 全测试 105/105 全过。等待独立审查。

## 已确认结论

- 直接合同：`codestable/features/2026-06-12-checksum-sum32-sum16/checksum-sum32-sum16-design.md` + `checksum-sum32-sum16-checklist.yaml`
- 实施严格按 design §2.3 挂载点清单：`frame/core/types.ts` + `send/core/checksum.ts` + 2 个测试文件
- 6 项设计决策（D1-D6）全部按 approved 落地，无临场扩范围、无自创抽象
- `field-labels.ts` 和 `FrameFieldEditorDialog.vue` 通过 `CHECKSUM_METHOD_OPTIONS.map(...)` 自动跟随，零修改
- Pre-existing baseline 失败（display/integration/runtime/scripts lint/rollup build）已通过 `git stash` 验证与本 feature 无关

## 未决项

- **等待独立审查对话**：控制方按 `rewrite-review-checklist.md` 流程开审查
- **UI 手工验证**：dev 服务器手工确认 method 下拉显示 SUM32 / SUM16（本轮无浏览器环境）
- **多 checksum range 重叠 known gap**：现状行为保留，未修复，作 future work

## 当前位置

S001 实施完成。改动文件 4 个（3 modified + 1 new），checksum 单测 51/51 全过、send feature 105/105 全过、改动文件 lint 零问题、vue-tsc 零报错。不提交 git，等控制方审查后统一处理。
