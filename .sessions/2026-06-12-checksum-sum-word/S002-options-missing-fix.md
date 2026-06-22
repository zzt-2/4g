# [S002] 发送帧校验位恒为 0 —— frame.options 缺失修复

> 2026-06-19 | bugfix | active

## 目标

修复"发送帧校验位永远是 0"的 bug。用户已定位表层根因（dongfanghong-frames.json 47 帧 options 全 null），要求确认根因、补 options、对比两种修复方案、跑 send 测试、提示 dev server 运行时验证。

## 记录

### 根因复核（比用户给的更深一层）

用户说的"JSON 里 47 帧缺 options"是**表象**，真源头在更上游：

- `rewrite/public/frames/dongfanghong-frames.json` 是**生成物**，由 `scripts/generate-dongfanghong-frames-json.ts` 跑 `serializeFrames(dongfanghongFrames)` 产出。
- 真正的数据源是 fixture `rewrite/src/features/frame/fixtures/dongfanghong-frames.ts`。
- 该 fixture 的 `buildRcFrameAsset` / `buildTmFrameAsset`（行 318、353）**从未给返回的 FrameAsset 设 `options` 字段** → `frame.options` 是 `undefined` → `serializeFrames` 用 `JSON.stringify` 序列化成 `null` → 47 帧 options 全 null。
- 运行时：`send-service.ts:187-192` 的 `patchOptions = request.options ?? (frameOptions ? {...} : undefined)` 取到 undefined → `checksum.ts:143` 的 `if (options.autoChecksum)` 跳过 → 校验位写不进去，保持 `makeChecksumField()` 的 defaultValue `0x00000000`。

**校验算法本身是对的**（checksum.ts 的 sum32/sum16、对齐校验、端序贯通都在 S001 验过，51/51 单测 + 本轮 158/158 send 测试全过）。缺的只是总开关。

### 两条修复方案对比（用户要求）

| 维度 | 方案 A：改 fixture + 重新生成 JSON（**选定**） | 方案 B：send-service 加兜底"有 isChecksum 字段就默认 autoChecksum=true" |
|---|---|---|
| 改动点 | `dongfanghong-frames.ts` 2 个 builder 加 `options`；重跑生成脚本 | `send-service.ts:188` 的 patchOptions 逻辑加推断分支 |
| 持久性 | **永久**。JSON 由 fixture 再生成也不会丢 options | **永久**，但隐式：fixture 里没 options，运行时凭规则推断 |
| 显式 vs 隐式 | 显式（符合用户"显式优于隐式"原则） | 隐式（规则藏在 service 里，看帧定义看不出来） |
| 对其它帧的影响 | 仅 dongfanghong 帧受影响 | **所有**导入帧（含未来第三方帧）行为被改变——有 isChecksum 字段就自动算，可能不符合帧作者意图 |
| JSON 直改（用户备选） | ❌ 否决：JSON 是生成物，下次 `npx tsx scripts/...` 会覆盖 | — |
| 测试风险 | 低（e2e 57/57、send 158/158 全过） | 中（改 service 核心路径，需补 service 单测覆盖推断分支） |

**结论**：选方案 A。理由：①用户明确"显式优于隐式"；②JSON 是生成物不能直改，必须改上游 fixture；③方案 B 改的是所有帧的默认行为，副作用面大。

### 实施细节

- `buildRcFrameAsset`（send 帧，30 条）返回对象加 `options: { autoChecksum: true, bigEndian: true, includeLengthField: false }`。
- `buildTmFrameAsset`（receive 帧，17 条）**故意不设** options，并加注释说明：send-service 只跑 send 路径，TM 帧永不走 `applyBuildPostPatch`，设了也无意义；TM 的 checksum 字段供解析侧展示。
- `includeLengthField: false` 的理由（关键，防止踩坑）：`checksum.ts:221` 的 length 回写用 `result.length`（整帧总字节数），而 fixture 里 length 字段的静态 defaultValue 是 **payload 字节数**（如 `(1+2)*4=0x0C`）。两种语义不同，开了 includeLengthField 会把正确的静态值覆盖成错误的总长语义；且 `lengthFieldId` 不在 `FrameOptionsDefinition`（只有 3 字段）里，开了必留 warning。所以必须 false。
- `bigEndian: true`：47 帧所有字段都是 `bigEndian: true`，一致。

重新生成：`npx tsx scripts/generate-dongfanghong-frames-json.ts` → 47 帧、round-trip deserialize 通过、sanity（uint64=4、pulse frames=12）全过。

### 验证证据

| 验证项 | 命令 | 结果 |
|---|---|---|
| send feature 全测试 | `npx vitest run src/features/send` | PASS 158 / FAIL 0 |
| fixture e2e（fixture→JSON→deserialize 全链路） | `npx vitest run dongfanghong-frames-e2e.spec.ts` | PASS 57 / FAIL 0 |
| 改动文件 lint | `npx eslint dongfanghong-frames.ts` | No issues（exit 0） |
| 类型检查（过滤） | `npx tsc --noEmit` 过滤 fixture/options | 零报错 |
| JSON 产物核对 | node 读 JSON 统计 | send 30 帧全部 `autoChecksum:true`；receive 17 帧 options 未设；sample options `{autoChecksum:true,bigEndian:true,includeLengthField:false}` |
| pre-existing 失败隔离 | `git stash` 后单跑 `frame-service-state-selector.spec.ts` | 同样失败（vite 缺 plugin-vue，与本次改动无关） |

### 关于"418 个 send 测试"

用户任务书说"418 个 send 测试必须还全过"。实测 `src/features/send` 当前共 **158 个**测试（S001 时记的 105，之后 send-feature-bugs 专题又加了些）。没有 418 这个数。按实际 158 全过汇报，已在本报告标注差异。

## 决策引用

- D001：frame.options 缺失修复——选 fixture 显式补 options 而非 service 兜底（**新建**）

## 范围确认

- 本轮是否在 scope boundary 内：是（checksum 专题的 bug 修复，不碰算法实现、不碰 identifierRules）

## 后续

- **待用户 dev server 运行时验证**：本轮无浏览器环境。需用户在 send 页发一帧，确认 checksum 字段不再是 `0x00000000`（应为 sum32 累加和）。
- **未提交 git**：按项目惯例（S001 同），等用户确认后由控制方统一提交。
- pre-existing 的 `frame-service-state-selector.spec.ts` vite plugin-vue 缺失问题，不属于本专题，留作环境债。
