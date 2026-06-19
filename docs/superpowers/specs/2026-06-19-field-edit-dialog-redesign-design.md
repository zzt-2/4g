# 帧实例编辑弹窗重设计 — Design Spec

> 2026-06-19 | 阶段:设计 | 状态:待审阅
> 关联专题:`2026-06-10-ui-feature-bugs` S006 后续
> 前序 spec:`2026-06-19-sendpage-ui-redesign-design.md`(已实施)

## 背景

S006 完成了 SendPage 的整体 UI 重设计(高度链、左栏、表格操作列),并在编辑弹窗里实现了 hex 双显(单输入框 + Dec/Hex 切换钮)与三段卡片化。本轮是用户明确"压缩上下文后好好讨论编辑弹窗"的深度迭代,聚焦编辑弹窗内部的 **输入交互、信息密度、表达式呈现**。

## 用户反馈(原话映射)

| # | 反馈 | 现状痛点 |
|---|------|---------|
| F1 | "我希望不用换着选,左 dec,右 hex" | 单输入框 + 全局 Dec/Hex 切换钮,每次看进制要切换,割裂 |
| F2 | "输入框别默认用科学计数法(我 tm 十六进制被当科学计数法了?)" | 大数值字段渲染时 JS 转 `4.5e7` 形态,语义错乱 |
| F3 | "需要一个计算按钮,用来计算一次表达式" + "实时算太吵" | 表达式结果是 computed 实时跟算,改任一可调字段下游一串值闪跳 |
| F4 | "我说的备注是,每个字段下面那条,我不想要" | 每个字段下常驻 `field.description` 行(如位域说明、累加和公式),把列表撑长撑碎 |
| F5 | "表达式得显示" | 只读段表达式字段只显示结果值,不显示公式,用户不知值怎么来的 |
| F6 | "样式难看" → 字段行对齐间距 | grid 列定义与行间距视觉不齐 |

## 设计目标

不动发送管线、`resolveFieldValues`、表达式求值等业务逻辑。**只动编辑弹窗的 UI/输入/显示口径**:
1. 双输入框联动取代"单输入框 + 全局切换钮"
2. 禁用科学计数法显示
3. 表达式结果改"手动计算"语义,加全局计算按钮
4. 字段 description 改整行 hover tooltip,删常驻行
5. 表达式字段旁显示公式
6. 字段行布局与对齐重做

## 不变约束(沿用 S006 / 前序 spec)

- **不改 feature 逻辑**:发送管线、`resolveFieldValues`、表达式回写、可变参数不动。
- **不改 `FrameFieldEditorDialog.vue`**(帧模板字段定义编辑器,不在范围)。
- **样式基线**:所有视觉值走 `--rw-*` token,无新增硬编码 hex/rgb/裸 px。
- **存值类型不变**:hex 显示/输入只影响 UI 层,存值仍是 `number`(uint64 超 safe int 按现状存 string),与 S006 一致。

---

## 详细设计

### 1. 弹窗整体结构(`SendPage.vue:619-686`)

自上而下,**删除 Dec/Hex 切换钮**:

```
┌─ 编辑帧实例 ──────────────────────────────────┐
│ 名称  [___________________]   (必填,沿用)      │
│ 备注  [textarea autogrow]      (实例级,保留)    │
│                                                │
│ ┌ 可调参数 ────────────────  [计算] ┐  ← 计算钮在段标题行右侧
│ │ <双输入框字段行>                    │
│ └────────────────────────────────────┘
│ ┌ 自动计算(只读) ──────────────────┐  ← 表达式字段,含公式
│ │ <只读字段行 + 公式>                 │
│ └────────────────────────────────────┘
│ ┌ 固定字段(只读) ───────────────────┐
│ │ <只读字段行>                        │
│ └────────────────────────────────────┘
│                       [取消]  [确认]            │
└────────────────────────────────────────────────┘
```

变化点:
- 删除 `q-btn-toggle`(Dec/Hex 全局切换),双输入框后不需要。
- "可调参数"段标题行右侧新增"计算"按钮。
- 实例备注 textarea 保留不动。

### 2. 可调数值字段 — 双输入框联动(核心)

#### 2.1 字段行布局(紧凑无表头)

用户选定方案 B(紧凑无表头)。grid 三列:

```scss
.field-row {
  display: grid;
  grid-template-columns: minmax(72px, 96px) minmax(120px, 1fr) minmax(120px, 1fr);
  /* label列(定宽,长名截断+tooltip) | Dec列 | Hex列 */
  align-items: center;
  gap: var(--rw-space-2);
}
```
label 列定宽(72~96px),长字段名截断(`text-overflow: ellipsis`)。全名与 description 统一走**字段行的单一 `q-tooltip`**:tooltip 文本格式为 `字段全名`(+ 换行 + description,若有)。这样只有一处 hover 触发,不冲突。避免 `1fr` 时 label 列随窗口伸缩导致对齐不齐。

渲染(有值态):
```
同步字   [449838109    ]  0x[1ACFFC1D   ]
模块ID   [5            ]  0x[05         ]
计数器   [0            ]  0x[00         ]
```

渲染(空值态,靠 placeholder 识别进制):
```
新字段   [          Dec]  0x[          ..]
```

#### 2.2 进制识别与对侧标识

- **左 Dec 框**:`q-input type=text`,placeholder 文本 `Dec`。输入纯十进制数字串。
- **右 Hex 框**:`q-input` 带固定 prefix `0x`(q-input 的 `prefix` 属性),placeholder 文本 `..`。输入/显示十六进制(大写)。空值时显示 `0x`。
- 这样无需表头,首次进来也能凭 placeholder + `0x` 前缀区分左右进制。

#### 2.3 联动逻辑

- 改左 Dec → 解析为数值 → 右 Hex 自动重算为 `0x` 形式
- 改右 Hex(用户只输 `1ACFFC1D`,前缀 `0x` 是 q-input 固定 prefix 不参与输入)→ 解析为数值 → 左 Dec 自动重算
- 两框的 `model-value` 都从同一存储值派生(派生函数见 §6 复用),不引入第二份状态

#### 2.4 科学计数法禁用(核心修复 F2)

- **显示侧**:Dec 框值用"整数定长十进制串",不走 `Number.toString()`(它会对大数产生 `1e21+` 形态)。uint64 超 `Number.MAX_SAFE_INTEGER` 用 BigInt 的 `toString(10)`。
- **Hex 框**:`0x` + BigInt/number 的 `toString(16)` 大写,本就无科学计数法问题。
- 落实到 `numeric-field-format.ts` 的 `valueToDisplayString`:Dec 分支对 number 类型补充"安全整数检查 + BigInt 兜底",避免 `Number.toString` 触发科学计数法。

#### 2.5 范围/解析校验

- 复用 `parseFieldInput`,但分两个入口:
  - `onDecInput(field, raw)`:固定 `hexMode=false` 调用 `parseFieldInput`
  - `onHexInput(field, raw)`:固定 `hexMode=true` 调用 `parseFieldInput`(raw 是用户在 `0x` 前缀后输入的十六进制串)
- 超范围 → `field-error` emit,对应框红色 error-message,不改写存储值(沿用现状"解析失败保留上次好值"语义)。

#### 2.6 非 hex 字段降级

- **float/double**(`isHexCapableField` 返回 false 的数值类型):只渲染左 Dec 单框,占满 Dec+Hex 两列(`grid-column: 2 / -1`)。实际帧暂无 float/double 字段,但类型支持需保留。
- **select / radio**:占满右侧两列,沿用现状控件。

### 3. 全局"计算"按钮(核心修复 F3)

#### 3.1 交互语义(手动提交)

- 表达式/只读段**不再实时跟算**。改为:可调字段值存入后,**只读段保持上一次"计算"结果**,直到用户点"计算"按钮才以当前所有可调字段值重算。
- **stale 标记**:可调字段有未提交改动时,所有只读段进入 stale 态(值灰显 + 段标题加 `·` 角标),提示"参数已改,结果未重算"。
- 点"计算" → 跑一次 `resolveFieldValues` + `applyFactor` → 更新只读段展示值 → 清除 stale。

#### 3.2 技术实现

- 现状:`editPreviewValues` 是 `computed`,依赖 `editValues`。实时算。
- 改为:新增 `committedValues: Ref<Record<string, SendFieldValue>>`(已提交的可调字段值快照)。`editPreviewValues` 改为依赖 `committedValues` 而非 `editValues`。
- "计算"按钮 `@click`:把当前 `editValues` 深拷贝到 `committedValues`。
- stale 判定:`computed(() => !deepEqual(editValues, committedValues))`。
- 打开弹窗 / 切换编辑实例时:`committedValues` 初始化为当前 `editValues`(首屏非 stale)。

#### 3.3 计算按钮位置与状态

- 位置:"可调参数"段标题行右侧(`FieldEditWidget` 内,该段专属)。
- 状态:统一文案 `计算`;stale 时按钮高亮(primary 色)+ 右上小红点提示有未算改动;非 stale 时按钮 `flat` 弱化(非 disabled,可重复点)。
- 实施时 stale 红点用 `--rw-color-status-warning`,无新增色值。

### 4. 字段 description — 整行 hover tooltip(修复 F4)

#### 4.1 删除常驻行

- `FieldEditWidget.vue` 三处 `<div v-if="field.description" class="field-row__desc">` 全部删除。

#### 4.2 整行 hover tooltip

- 字段行(`.field-row`)外层包 `q-tooltip`(Quasar),仅当 `field.description` 存在时渲染:
  ```vue
  <div class="field-row">
    ...
    <q-tooltip v-if="field.description" max-width="280px">
      {{ field.description }}
    </q-tooltip>
  </div>
  ```
- 触发:鼠标进入字段行区域即显示(整行 hover),移开消失。无需点击、无需 `?` 图标。
- tooltip 内容支持换行(位域说明、多段公式),`white-space: pre-line`。
- 对可调字段(双输入框行)和只读字段行都适用。

### 5. 表达式字段 — 显示公式(修复 F5)

#### 5.1 公式数据来源

`field.expressionConfig: ExpressionDefinition`:
```ts
{
  expressions: ConditionalExpressionDefinition[];  // 多条件分支
  variables: ExpressionVariableDefinition[];       // 变量→来源字段映射
}
ConditionalExpressionDefinition { condition: string; expression: string }
```

#### 5.2 显示格式

只读段表达式字段行:
```
字段名   <结果值>  =  <公式>
```
示例:
```
同步字计算   0x1ACFFC1D  =  var1 + 1
长度字段     0x10         =  header + length
```

- **结果值**:走 hex 显示口径(与可调字段一致,显示 `0x..`)。
- **公式**:`expressionConfig.expressions` 中**命中条件的那一条**的 `expression` 字符串。
- **变量映射**:`variables` 中的 `identifier` 如果能映射到来源字段名(`fieldId` → 查 `frame.fields` 得 name),在显示时替换为字段名;映射不到则保留原 identifier。简化:`var1 + 1` 中 var1 来源是 field-source(名"源字段"),显示 `源字段 + 1`。
- **多分支命中判定**:沿用求值层已选中的分支(求值时本就要判定 condition)。若求值未暴露命中分支,回退显示第一条 expression(标注"(可能多分支)")。

#### 5.3 stale 态处理

stale 时表达式字段的结果值灰显 + `·` 角标,公式部分正常显示。点"计算"后结果值刷新。

### 6. 复用与工具函数扩展(`numeric-field-format.ts`)

S006 已建立的函数,本轮扩展:

| 函数 | 现状 | 本轮变更 |
|------|------|---------|
| `valueToDisplayString(v, f, hexMode)` | Dec 分支对 number 用 `String(num)`(大数触发科学计数法) | Dec 分支改为定长十进制:安全整数内 `num.toString()`,否则 BigInt 兜底 `toString(10)` |
| `formatCounterpart` | 为单输入框设计(给 hint) | **废弃**(双输入框后两框都是可编辑派生,不需要 hint)。保留函数体暂不删,避免破坏其他引用;但 FieldEditWidget 不再调用 |
| `parseFieldInput(raw, hexMode, f)` | 已支持 hex/dec 双模式 | 不变,复用。双输入框的两个入口分别固定 hexMode 调它 |
| **新增** `fieldExpressionLabel(field, frame)` | 无 | 提取公式显示文本(§5.2 逻辑),供 FieldEditWidget 调用 |

### 7. 样式与对齐(修复 F6)

字段行视觉统一:
- grid 三列,label 列右对齐文字,Dec/Hex 列左对齐,数值用 `font-mono`。
- 行间距 `--rw-space-2`;段内紧凑;段间用卡片(沿用 S006 的 `.field-section` 左色条)。
- Hex 框的 `0x` 前缀用 `--rw-color-text-muted` 弱化,值部分用 primary 文字色。
- stale 态:`.field-section--stale` 修饰类,只读段值 `opacity` 降到 token 化的弱化值,`·` 角标用 warning 色。
- 所有新增视觉值走 `--rw-*` token。

---

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `rewrite/src/widgets/FieldEditWidget.vue` | 双输入框联动、删 description 常驻行改 hover tooltip、表达式公式显示、计算按钮(stale 态)、grid 布局重做、scoped CSS 调整 |
| `rewrite/src/pages/SendPage.vue` | 删 Dec/Hex 切换钮、新增 `committedValues` + stale 逻辑、`editPreviewValues` 改依赖 committedValues、"计算"按钮事件接线 |
| `rewrite/src/features/send/composables/numeric-field-format.ts` | `valueToDisplayString` Dec 分支禁科学计数法;新增 `fieldExpressionLabel` |
| `rewrite/src/features/send/composables/__tests__/numeric-field-format.spec.ts` | 补禁科学计数法用例 + `fieldExpressionLabel` 用例 |

## 验收标准

1. 可调数值字段呈现左右双输入框(左 Dec、右 Hex 带 `0x` 前缀),无表头,靠 placeholder + 前缀识别。
2. 改左框右框自动算对侧,改右框左框自动算;两侧始终一致。
3. 大数值(如 `449838109`、`1acffc1d` 输入)显示为纯数字串/`0x` 串,**无科学计数法**。
4. 改可调字段后,只读段不立即变;点"计算"才刷新;stale 时只读段灰显 + 角标。
5. 字段下不再有常驻 description 行;hover 字段行出 tooltip 显示完整 description。
6. 表达式字段显示 `值 = 公式` 形态,变量尽量映射为来源字段名。
7. float/double(若有)与 select/radio 降级为单控件占满右侧。
8. 样式基线:无新增硬编码视觉值。
9. 现有 `numeric-field-format.spec.ts` 18 用例不回归;新增用例全过。

## 风险与权衡

| 风险 | 处理 |
|------|------|
| 双输入框联动改一侧时另一侧光标/焦点跳动 | 联动只更新对侧 `model-value`,不动当前聚焦框;Quasar q-input 受控值更新不抢焦点 |
| stale 快照 deepEqual 开销 | 字段数有限(个位数~十几),JSON.stringify 比较足够,无性能问题 |
| 表达式命中分支求值层未暴露 | 回退显示第一条 expression + 标注;若求值层可低成本暴露命中分支,优先用真实命中 |
| 删 `formatCounterpart` 调用后其他地方是否引用 | 扫描引用;S006 内只有 FieldEditWidget 用,SendPage 右栏 `fieldDisplayValue` 用的是 `valueToDisplayString` 不是 counterpart |

## 范围确认

本轮在 `2026-06-10-ui-feature-bugs` topic 的 S006 后续范围内(用户明确"编辑弹窗深度讨论留到压缩上下文后")。不改帧模板编辑器、不改发送管线。
