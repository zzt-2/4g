# 设计:实时测试页录制功能重设计(H013 — 录制部分)

> 创建: 2026-06-28 | 状态: 设计已对齐(brainstorming 已完成,待 spec review)
> 类型: brainstorming → design(讨论型 handoff H013 的产物)
> 派生自: `.sessions/2026-06-10-ui-feature-bugs/H013-display-recording-redesign-handoff.md`
> 归口专题: `.sessions/2026-06-11-display-group-management/`(录制在 DisplayPage,见 handoff:7)
> 治理编号(实施落档时确认): **S012** in display-group-management
> 范围: **仅录制部分**;History 页查看器改造**不在本 spec 范围**(下一轮 spec)

---

## 〇、Direct contract / Boundary guards

(承 `CLAUDE.md:200-213` + `rewrite-quality-rules.md` R15,开工必读)

**Direct contract(本 spec 的设计来源):**
- 用户 4 条原话诉求(见 handoff §二):①切走再回来录制取消 ②要有录制设置只录设置的 ③录帧而非整表快照 ④省空间存法
- brainstorming 中用户拍板的 8 项决定(见下 §一)
- 用户本轮补充 3 条:配置按钮放录制按钮右边;选帧只列接收类型帧;录制采集点收 matched 帧(选项A)
- 本设计文档本身

**Boundary guards(不可违反的约束):**
- `codestable/architecture/rewrite-target-structure.md` — feature 布局/命名/Electron 边界/分层
- `codestable/quality/rewrite-quality-rules.md` — R3(core 可测)/R4(UI 非 workflow owner)/R5(Electron 边界)/R6(coarse IPC)/R7(单一 owner)/R19(静态 metadata from config 非 data stream)
- `.sessions/2026-06-10-ui-feature-bugs/S015-routing-tick-zombie-write-removal.md` + `decisions.md` D010/D013 — **禁止在 routingTick/receive 路径重新引入每帧写盘;唯一 records 写入口是 appendLocalRecords(路径A)**
- `codestable/features/rewrite-storage-highspeed/rewrite-storage-highspeed-design.md` — 最近似的磁盘写盘 analog(三层架构 + WriteStream + 滚动)
- `CLAUDE.md:103-128` — renderer 不碰 fs/path/ipcRenderer;经 platform facade;主进程可高频缓冲但不含业务规则

---

## 一、brainstorming 拍板的 8 项决定

| # | 维度 | 决定 |
|---|---|---|
| 1 | 持久化 | **落盘到磁盘文件**(接真写盘,跨会话保留) |
| 2 | 架构 | **新建 receive 层录制**(独立路径,复用 storage-highspeed 的磁盘写盘/滚动模式,不直接用它) |
| 3 | 录制模型 | **记整帧原始字节(bytes),查看时解析**(不是整表快照,不是已解析字段) |
| 4 | 选帧粒度 | **帧级(frameId)**,选中即录整帧所有字段 |
| 5 | 切路由 | **后台继续录制**(状态在全局,不在组件) |
| 6 | 文件格式 | **二进制紧凑格式** + 大小滚动 |
| 7 | 配置存放 | **扩展现有 DisplayPreferences** |
| 8 | 范围 | **本 spec 只做录制**;History 改造下一轮 |

**自检后的补充决定(用户拍板):**
- 采集点 = **routingTick 的 matched outcomes 处**(选项A):只录干净匹配帧,renderer 端 O(1) 条件 + fire-and-forget IPC,写盘在主进程。
- 配置按钮位置 = **录制按钮右边**(非弹窗入口分散)。
- 选帧列表 = **只列接收类型帧**(复用 `<FrameSelector direction="receive">`,零过滤代码)。

**自检发现(影响设计的关键事实):**
- ⚠️ 初版设计把写盘放进 routingTick → **违反 S015/D013**(已修订)。
- 与 storage-highspeed 有 **70-80% 结构性重复**(写盘+滚动+state+facade+handler)→ 提取共享工具消除。
- 帧方向已建模(`frame.direction: 'send'|'receive'`,`frame/core/types.ts:97`),receive 匹配器只匹配 receive 帧(`frame-matcher.ts:133`)。
- `getFileFacade().writeTextFile` 走 IPC + tmp-rename 整文件重写,**不能用于流式录制**(高频瓶颈)。

---

## 二、总体架构

录制从"组件级定时整表快照"重构为"**runtime 全局 + 事件驱动 + 原始字节 + 主进程写盘**"模型。**关键:录制是独立路径,不碰 storage-local 的 records 数组(D013 单一入口),不在 routingTick 里写盘。**

```
routingTick (renderer, 100ms setInterval, 现有热路径)
  → connection → receiveService.drainInputSource → outcomes
  → 现有 fanOut: display / task conditions
  → ★新增(仅录制开时一行 O(1)):recordingBridge.collect(outcomes)
        │  早退: !isRecording → return (O(1))
        │  判断: selectedFrameIds.has(frameId)  ← Set 查询 O(1)
        │  收集: matched 帧的 { frameId, bytes, capturedAt }
        ▼  fire-and-forget, 批量一个 IPC 消息
  platformFacade.recordingAppend(frames)  ──────────────→ 主进程
                                                            │
  src-electron/main/recording-writer                        │
   (包装 shared/disk-rotation-writer)  → O(1) 二进制 append + 大小滚动
```

### S015/D013 守约点(这是本设计的红线)

| S015 卡顿根因 | 本设计如何规避 |
|---|---|
| O(N) 整数组深拷贝(fanOutToStorage 旧路径) | **录制不碰 storage-local 数组**,无数组增长 |
| routingTick 每帧无条件写盘(僵尸写入) | 采集是 **O(1) 条件判断**(录制关时第一行 return),写盘在主进程 |
| 无并发锁 → tick 雪崩 | 写盘用主进程 WriteStream(顺序 append,天然序列化);renderer fire-and-forget 不收 |

**⚠️ 即便架构上规避,验收必须在目标 Linux 机实测卡顿**(H013:138 + S015 教训,见 §六验收红线)。

---

## 三、数据模型

### 3.1 录制配置(DisplayPreferences 扩展)

```ts
// features/display/core/types.ts 加:
interface DisplayPreferences {
  // ...现有字段
  recording: RecordingConfig   // ★新增,有默认值,迁移用 defaults
}

interface RecordingConfig {
  selectedFrameIds: string[]   // 选录哪些接收帧(frameId 级),从 FrameSelector(receive)选
  // 滚动/容量配置(复用 storage-highspeed 同款):
  maxFileSizeMb: number        // 默认 100
  enableRotation: boolean      // 默认 true
  rotationCount: number        // 默认 5
}
```

- 配置走现有持久化路径(`runtime/persistence.ts` + `app/rewriteRuntime.ts`),跨会话记住。
- **normalize/clone 白名单同步加 `recording`**(参考 S010 两层存储 bug 教训:normalize 漏字段 + clone 白名单漏字段)。

### 3.2 全局录制状态(独立 store,不在组件)

```ts
// features/recording/core/types.ts
interface RecordingState {
  isRecording: boolean
  recordCount: number           // 本 session 已录帧数
  sessionStartTime: number | null
  stats: RecordingStats         // 复用 storage-highspeed 的 Stats 形状(从主进程回传)
}
```

- 状态容器 `features/recording/state/recording-state.ts`(仿 storage-highspeed-state,immutable snapshot + setter)。
- **状态在全局,组件卸载不影响录制**(解决诉求①)。

### 3.3 二进制文件格式(紧凑,帧级)

每个录制 session 一个文件,路径 `{userData}/dongfanghong/recordings/rec_<ISO时间戳>.bin`。

**文件头(写一次,文件首部):**
```
[4B magic]     "RCD1"          便于识别 + 格式版本
```

**单帧记录布局(小端,无对齐填充,逐帧 append):**
```
[4B capturedAt]   uint32   epoch 秒(秒级精度足够画图;省字节 vs ISO 字符串)
[2B frameIdLen]   uint16   frameId UTF-8 字节长度
[NB frameId]      utf8     frameId(如 "frame-001")
[2B byteLen]      uint16   原始帧字节长度
[MB rawBytes]     bytes    原始帧字节
```

- 每帧固定开销 ≈ 8 字节 + frameId 长度,比现状(整表快照 × ISO 字符串 × UUID key)小一到两个数量级。
- 单文件达 `maxFileSizeMb` → 滚动开新文件,保留最近 `rotationCount` 个(复用 `cleanupOldFiles` mtime 排序删最旧)。
- 帧自描述(frameId + bytes),查看时只需 frameId 反查帧定义 → `parseReceiveFrameFields({frame, bytes})` 解析(下一轮 History spec 用)。

### 3.4 录制桥(从 routingTick 采集)

```ts
// runtime/bridges/recording-bridge.ts
export class RecordingBridge {
  constructor(private recordingService: RecordingService) {}

  collect(outcomes: ReceiveBatchOutcome[]): void {
    if (!this.recordingService.isRecording()) return;       // O(1) 早退,录制关时几乎零开销
    const selected = this.recordingService.getSelectedFrameIds(); // Set 缓存,避免每帧重建
    const frames: RecordingFrameInput[] = [];
    for (const o of outcomes) {
      if (o.matchedFrame && selected.has(o.matchedFrame.frameId) && o.input?.bytes) {
        frames.push({
          frameId: o.matchedFrame.frameId,
          bytes: o.input.bytes,
          capturedAt: Math.floor(Date.now() / 1000),
        });
      }
    }
    if (frames.length) this.recordingService.appendFrames(frames); // fire-and-forget IPC
  }
}
```

- **关闭录制时:`collect` 第一行 return,O(1),几乎零开销。**
- `appendFrames` → `platformFacade.recordingAppend(frames)` → IPC → 主进程 `recordingWriter.write(frames)`(批量,减 IPC 次数)。

---

## 四、UI(DisplayPage 底栏)

### 4.1 底栏录制行布局

```
[🔴 录制钮 / ⬛ 停止钮] [⚙ 设置钮] | REC 1m23s · 142 帧 |  匹配率/总批次/已匹配(现有 stat)
```

- **录制钮**:圆钮(红 `fiber_manual_record` / 灰 `stop`),现有样式不变。
- **设置钮:紧跟录制钮右边**(q-btn,icon `tune`,size sm)。点击打开录制设置弹窗。
- REC 徽标 + 计时 + 帧数:`v-if="isRecording"`。
- 现有 stat(匹配率/总批次/已匹配)保持右侧。

### 4.2 录制设置弹窗(`RecordingConfigDialog.vue`)

内容:
- **帧选择**:**接收帧多选**。现有 `<FrameSelector>`(`frame/components/FrameSelector.vue`)是单选(`modelValue: string | null`,q-select 无 multiple),需扩展为多选(`modelValue: string[]`,q-select 加 `multiple` + `use-chips`)。`direction="receive"` —— **只列接收帧**(过滤逻辑复用,见 `listFrames({direction})`)。两种做法:(a) 给 FrameSelector 加可选 multiple 模式;(b) 弹窗内直接用 q-select。实施时定,倾向 (a) 以保持单一组件源。
- 滚动配置(可折叠):maxFileSize 滑块 / rotationCount 数字框。
- 确定:写回 `DisplayPreferences.recording`,经 `displayService.updatePreferences` 落盘。
- 单次 emit 原则(D003):多个字段变化合并成一次写回。

### 4.3 删除组件级录制

- 删 `DisplayPage.vue:426-470` 全部内联录制逻辑 + `:485-487` 的 `onUnmounted(stopRecording)`(**这是诉求①根因**)。
- 改用 `useRecording()` composable(读全局 store),组件只负责显示和触发。
- 切路由不再 stopRecording(录制在 runtime 层,组件卸载无影响)。

---

## 五、接线 + 文件清单

### 5.1 新增文件

| 文件 | 职责 |
|---|---|
| `src-electron/main/shared/disk-rotation-writer.ts` | **提取的共享滚动写盘工具**(storage-highspeed 重构后也复用) |
| `src-electron/main/recording-writer.ts` | 包装共享工具 + 二进制序列化 |
| `src-electron/main/recording-handlers.ts` | IPC 处理(registerRecordingHandlers/cleanup) |
| `shared/platform-bridge.ts`(改) | 加 `RecordingBridge` 类型 + channel 常量 |
| `platform/recording.ts` | `RecordingPlatformFacade` |
| `platform/index.ts`(改) | `getRecordingFacade()` 缓存 |
| `src-electron/preload/index.ts`(改) | 暴露 recording API |
| `src-electron/main/index.ts`(改) | 注册/清理 recording handlers |
| `features/recording/core/types.ts` | 类型 |
| `features/recording/core/defaults.ts` | 默认配置 |
| `features/recording/core/serialization.ts` | 二进制编解码(纯函数,可单测) |
| `features/recording/state/recording-state.ts` | 状态容器 |
| `features/recording/services/recording-service.ts` | start/stop/appendFrames/getSnapshot |
| `features/recording/composables/use-recording.ts` | Vue composable |
| `features/recording/index.ts` | barrel |
| `features/recording/components/RecordingConfigDialog.vue` | 设置弹窗 |
| `runtime/bridges/recording-bridge.ts` | 从 routingTick 采集 |

### 5.2 改动已有文件

- `runtime/feature-wiring.ts` — 接线 RecordingService + bridge + facade(L0,数据流动前建好)
- `runtime/routing-tick.ts` — routingTick 末尾加 `recordingBridge.collect(outcomes)`(一行,录制关时 O(1) 早退)
- `runtime/index.ts` — teardown 时 stopRecording + deactivate writer
- `runtime/persistence.ts` + `app/rewriteRuntime.ts` — 持久化 RecordingConfig
- `features/display/core/types.ts` + normalize/clone — DisplayPreferences 加 `recording` 字段
- `features/display/services/display-service.ts` — getRecordingConfig/setRecordingConfig accessor
- `pages/DisplayPage.vue` — 删内联录制,改用 useRecording + 设置弹窗
- `src-electron/main/storage-filter.ts` — **重构为复用 disk-rotation-writer**(消除重复,见 §五.3)

### 5.3 去重:提取 disk-rotation-writer

自检实测:照搬 storage-highspeed 写盘模式有 70-80% 结构重复。核心重复在 `storage-filter.ts:162-204` 的 `initializeWriteStream`/`checkRotation`/`cleanupOldFiles`(全库唯一一份,无共享工具)。

**提取方案:**
- 新建 `src-electron/main/shared/disk-rotation-writer.ts`:参数化 `dir`/`filenamePrefix`/`extension`/`serialize(frame)→Buffer|string`/`fileConfig`,lift `initializeWriteStream`/`checkRotation`/`cleanupOldFiles`/stream-end/`mkdirSync`/`Stats` 接口。
- `storage-filter.ts` 重构为 compose:保留 `shouldStore`(pattern 匹配,storage-highspeed 专有)+ `storeData` 写+stats,`toHexString` 作为注入的 serializer。
- `recording-writer.ts` 同样 compose:raw-byte serializer + 二进制文件头。
- renderer 侧 facade/state/handler 模板是本项目每个 feature 都遵循的惯例,**不强行抽象**(file/http/ftp/storage 都重复,符合约定)。

**回归风险:** storage-highspeed 重构后,其 `__tests__/` 全部回归必须通过。

---

## 六、测试 + 验收 + 边界

### 6.1 测试

- **纯函数单测**(高覆盖):
  - `serialization.ts`:二进制编解码往返 + 边界(空 frameId / 长帧 / magic 头)
  - `defaults.ts`:默认值
  - 配置 normalize:recording 字段合并
- **核心单测**:
  - `recording-service`:start/stop 状态机 + getSelectedFrameIds Set 缓存
  - `recording-bridge`:`collect` 分支(录制关早退 / 开但未选 / 选中命中 / matchedFrame 缺失 / bytes 缺失)
- **集成测试**:
  - `routing-tick`:录制关时 collect 不产生 IPC(性能回归守卫);录制开时只收选中帧
  - 回归:`appendLocalRecords`(D013 路径A)未被新代码触碰
- **主进程测试**:
  - `disk-rotation-writer`:append + 滚动触发 + cleanupOldFiles 删最旧
  - `recording-writer`:二进制格式写入 + 读回解析一致
- **回归**:storage-highspeed 重构后原有测试全过

### 6.2 验收标准

1. **诉求①**:录制开启 → 切到别的页 → 切回来,录制仍在进行(REC 计时/帧数继续)。✅
2. **诉求②③**:设置弹窗只列接收帧;选中的帧才被录;未选的不录。
3. **诉求④**:单帧存储大小 vs 现状,二进制格式显著更小(可量化对比)。
4. **落盘**:录制产生的 `.bin` 在 `{userData}/dongfanghong/recordings/`,重启 App 文件还在。
5. **⚠️ S015 验收红线**:目标 Linux 机实测,录制期间不引入卡顿(录制开 vs 关,routingTick 耗时对比)。
6. tsc src 0 错 / lint 0 新增 / 相关单测 + 集成测试通过。
7. storage-highspeed 重构后,其原有测试全过(无回归)。

### 6.3 边界红线

- **不碰** northbound feature / `_archive-legacy/` / `_wsl-claude-archive/_collection`。
- **不重新引入** routingTick 无条件写盘(D013);renderer 端不做数组累积/深拷贝(S015 根因)。
- **History 页改造不在本 spec 范围**(录制的 .bin 暂不被 History 消费——下一轮 spec)。
- 改治理文档前重读 session-governance;录制归 **display-group-management S012**(实施落档时再确认)。
- 大文件(新性能 trace)不直接读上下文,用 `analyze-perf.py` / `analyze-longtask.py` 消化。

### 6.4 旁路发现(不在本范围,留待决定)

- **`HistoryPage.vue:15` 拼写 bug**:`runtime.features.storageLocalService`(接口是 `storageService` 无 Local)→ History 页一进可能 `undefined` 崩。和录制重设计是两回事,但既然要动存储,实施时顺带确认。**不在本 spec 强制范围。**

---

## 七、brainstorming 留痕(决策依据)

- 用户原话诉求与 8 项决定的对应关系见 §一。
- 关键发现:项目已有 `storage-highspeed` 原始帧录制器(无 UI),但用户选择新建 receive 层录制(B 方案)——理由:按帧定义(名字)选比 hex 前缀友好、只录干净匹配帧、数据模型紧凑。
- 记原始字节 vs 记解析字段的取舍:记原始字节更紧凑(源头最简)+ 查看时用已有 `parseReceiveFrameFields` 解析(一次性成本),用户选了原始字节。
- D010 续接二轮曾否决"records 滚动上限",但前提(B 路径数据给 History 用)已被 S013/D013 证伪(僵尸写入),**否决逻辑失效,不约束本设计**。
- 采集点取舍:用户选选项A(routingTick matched 帧)而非选项B(传输层 tap),因为只录干净选中帧、兼容性更好。
