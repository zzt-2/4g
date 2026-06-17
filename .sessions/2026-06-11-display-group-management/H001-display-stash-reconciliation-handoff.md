# H001 — Display S007 stash 收口 Handoff

> 2026-06-17 | 修复 handoff | 状态: 待新对话执行
> 上游: S006 / S007 | 主对话统筹验证

## 背景:S007 卡在"半截"状态

display-group-management feature 经历 S001→S007 多轮修复。**S007(2026-06-12,v2 二次审查 5 项必改)的完整代码改动躺在 `stash@{0}` 里没提交,导致主干卡在 S006 + 半截 S007 的混合态,测试坏掉。**

主对话(2026-06-17)亲自核实了以下事实(均附证据):

1. **主干测试 4 个全挂** —— 实跑 `npx vitest run src/features/display/composables/__tests__/use-display-refresh.spec.ts`:
   ```
   4 failed → state.getTable1Rows is not a function
   ```
2. **主干 DisplayPage.vue 仍含 S006 的 page 层 enrich**(S007 要求删掉的):
   - 行 96 `fieldNameLookup = computed(...)`
   - 行 107 `function enrichRows(...)`
   - 行 253, 265 `return enrichRows(merged)`
3. **主干 composable 内部已调 `service.getTable1Rows()`(行 51),但对外返回的是旧的 `table1Rows` ref(行 166),没暴露 `getTable1Rows()` 方法** —— API 对不上测试。
4. **S007 完整修复在 `stash@{0}`**:`git stash show stash@{0} --stat` 显示 display 相关 6 文件:
   - `use-display-refresh.ts` +70
   - `DisplayPage.vue` -53(删 page 层 enrich)
   - `HistoryPage.vue`、`useHistoryData.ts`、`display-columns.ts`、design.md

## ⚠️ 关键风险:stash 是混合的

**`stash@{0}` 不是纯 display 改动**,它混着 send/encode、task/core/progress、AppShell 等约 59 个文件(WIP on main: 5f933c6)。**绝对不能 `git stash pop` 整个拿回来**,否则会把其它 feature 的半成品一起带进工作区。

正确做法:只取出 display 相关文件,或者直接按 S007 文档(`.sessions/2026-06-11-display-group-management/S007-v2-second-review-fixes.md`)手动应用那 5 项必改到主干。

## 调研任务:新对话要做的

### 必做(按顺序)

**S1. 摸清 stash@{0} 全貌**
- `git stash show stash@{0} --stat` 列全部文件,分类哪些是 display、哪些是别的 feature。
- 判断这些"别的 feature"改动是不是已经在主干(commit 5ab5f18 之后)了——如果已在主干,stash 里就是过时的 WIP,只需 display 部分;如果不在主干,要单独决策。

**S2. 取出 display 改动并应用**
两种路径,选其一:
- **路径 A(推荐,安全)**:用 `git checkout stash@{0} -- <display相关文件>` 逐文件取出,不动其它文件。取的文件清单见上方"6 文件"。
- **路径 B(手工)**:读 S007 文档的 5 项必改描述,手动改主干代码。适合路径 A 取出后冲突的情况。

**S3. 对齐 API + 修测试**
- 确保 composable 对外暴露 `getTable1Rows()` / `getTable2Rows()` 方法(返回深拷贝),删 `table1Rows` / `table2Rows` ref(或保留作内部)。
- 确保 DisplayPage.vue 删掉 `fieldNameLookup` + `enrichRows`,改用 composable 的方法。
- 跑 `npx vitest run src/features/display/composables/__tests__/use-display-refresh.spec.ts` → 必须 4/4 全绿。

**S4. 全量验证**
- `npx vitest run src/features/display` → display 全测试通过(S006 报 66 pass,S007 报 65 pass,以实际为准,0 fail)
- `npx vue-tsc --noEmit`(或 lint)→ display 相关文件 0 error
- 确认 HistoryPage.vue 的 emptyVariant、useHistoryData 的 getFieldName 降级值也已就位

**S5. 提交**
- 单独一个 commit:`fix(display): S007 二次审查修复收口( fieldName enrich 迁入 composable)`
- **不要混入其它 feature 改动**

### 不要做

- 不要 `git stash pop` 整个 stash
- 不要碰 stash 里的 send/encode/task/AppShell 等非 display 文件(那是别的线,留给对应专题)
- 不要重新设计 display 架构(S006/S007 已定型,本轮只收口)
- 不要在本轮做运行时手工验证(代码收口后,运行时验证是下一步,见"后续")

## 接收方验证(续接对话时必须完成)

- [ ] 已读取 topic-index 的不变量(S006/S007 已定结论 + 未决项)
- [ ] 已验证本文件至少 3 条关键事实声称:
  - 声称1: 主干 use-display-refresh.spec.ts 4 个测试全挂(state.getTable1Rows is not a function)→ 验证: [实跑测试]
  - 声称2: DisplayPage.vue 行 96-113 仍含 fieldNameLookup/enrichRows → 验证: [读文件]
  - 声称3: stash@{0} 含 display 6 文件改动 → 验证: [git stash show]
- [ ] 已确认 stash@{0} 是混合 stash,只取 display 部分
- [ ] 跑通 display 测试 0 fail 才算完成

## 已知债务

| 债务 | 原则 | 当前状态 | 触发解决条件 |
|------|------|---------|-------------|
| 主干 display 测试坏掉 | 测试应常绿 | 4/4 fail(API 不一致) | 本轮 S3 修复 |
| page 层 enrich 反模式 | 设计 5.5 要求 enrich 在 composable | 主干 DisplayPage 仍 enrich | 本轮 S007 收口 |
| 图表不出数据(运行时) | 需运行时验证 | 从未验证过上游 receive 是否有 matched 数据 | 本轮收口后,下一步运行时验证 |

## 后续

1. 本轮代码收口 + 测试转绿 + 提交后,回主对话
2. 主对话安排**运行时手工验证**:开真实连接 → 看 DisplayPage 顶部计数器(已匹配/未匹配)→ 确认 receive 有数据 → 选字段 → 看图表是否出点
3. 如果运行时仍不出数据,根因大概率在上游(receive 管线没 matched 数据,或帧定义没匹配),不在 display 代码——那时另开 receive 调试对话
