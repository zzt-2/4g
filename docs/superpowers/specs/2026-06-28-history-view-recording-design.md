# 设计:History 页查看录制数据(H014 续 — 录制格式演进 + History 读取层)

> 创建: 2026-06-28 续 | 状态: 设计已对齐(brainstorming 完成,待 spec review)
> 类型: brainstorming → design(讨论"历史怎么看录制数据"的产物)
> 归口专题: `.sessions/2026-06-11-display-group-management/`(录制 + History 都属 display feature)
> 前序: 录制功能已完成(H014 实施完,见 `docs/superpowers/plans/2026-06-28-recording-redesign.md`)。本 spec 是其续接:让 History 页能查看录制出的 `.bin`。
> 影响 D002: 本 spec 推翻 D002 的"格式"部分(RCD1 升级为"RCD1 + 帧定义块"),需更新 D002。

---

## 〇、背景与本 spec 要解决什么

录制功能已落地:DisplayPage 录制钮 → routingTick 采集 matched 帧原始字节 → 主进程追加写 `.bin`(RCD1 格式)。用户实测录了 3 帧,落盘成功。

**但 History 页看不到这些数据。** 原因:
1. History 现在读的是 `StorageLocalRecord`(旧整表快照格式),读不了 `.bin`(原始字节格式)。
2. `.bin` 只存 `frameId`,解析时依赖**当前** frameReader 查帧定义——**帧定义以后改了,旧 .bin 就解不开**(漂移问题)。
3. HistoryPage.vue:15 有个拼写 bug(`storageLocalService`,接口是 `storageService`),进页就崩。

本 spec 解决这三件事 + 设计 History 读 `.bin` 的完整路径。

---

## 一、brainstorming 拍板的决定

| # | 维度 | 决定 | 依据 |
|---|---|---|---|
| 1 | 方向 | **接进现有 History 页**(不新建回放页) | 用户选 A |
| 2 | 新旧格式 | **旧 StorageLocalRecord 废弃,只读新 .bin** | 录制已改写 .bin,旧格式不再产生 |
| 3 | 格式演进 | **RCD1 基础 + session 头部帧定义块**(必填,不向后兼容老文件) | 防漂移;老 .bin 是测试数据,作废 |
| 4 | 实施路径 | **一轮全做**(格式 + 录制侧改 + History 读取层重写) | 用户选 A |
| 5 | 附带 | **修 HistoryPage.vue:15 拼写 bug**(前置,否则进页崩) | History 页根本打不开 |

### 自检推翻的方案(RCD2)及其教训

用户最初提"内嵌帧定义 + 分层目录 + 一帧一文件",我据此设计的 RCD2 被自检子代理读真实代码后**否决**,三个致命问题:
1. **索引块布局物理写不出来**:追加式 WriteStream(`flags:'a'`,见 `disk-rotation-writer.ts:143`)只能往尾追加,没法回头改前面的索引。要写索引只能 O(N) 每帧重写 = **正是 S015/D013 卡顿的罪魁**。
2. **多文件分流破坏单流模型**:同小时同帧一个文件 → N 种帧 = N 个并发流,`DiskRotationWriter` 只支持单流(`:56`)。
3. **分层目录搞坏滚动清理**:`cleanupOldFiles`(`:156-169`)平铺单目录不递归,日期目录下永远不删文件 → 磁盘无限增长。

**教训:设计存储格式前必须先确认写入原语的物理约束(追加 vs 随机访问)。** Option A(本 spec)规避了全部三个问题。

---

## 二、总体架构

```
录制侧(小改):                        History 侧(读取层重写):
  activate() 时                         HistoryPage.loadData()
    + 写 magic "RCD1"                     → 列 recordings/ 目录
    + 写【帧定义块】★新增                  → 按文件名 ISO 时间筛选时间范围
      (所有选中帧的 FrameAsset JSON)       → 逐文件读:
    + (之后帧记录流不变)                     读 magic → 读帧定义块(不依赖当前配置)
                                              → 用【内嵌帧定义】解析帧记录
  routingTick 采集 matched 帧               → parseReceiveFrameFields({frame, bytes})
    → 追加写帧记录(和现在完全一样)            → 产出 字段时间序列 → 喂进现有图表/统计/CSV
```

**核心原则:**
- **写入路径零改动**——还是单流追加,O(1) 每帧(S015/D013 守约)。
- **帧定义漂移根治**——录制开始时把当时帧定义快照写进文件头,读时用它解析,不依赖当前配置。
- **向后不兼容**——老 .bin(无帧定义块)直接作废,解析时遇到无帧定义块的文件报错跳过(不崩)。

---

## 三、新文件格式(RCD1 + 帧定义块)

### 3.1 文件布局

```
{userData}/dongfanghong/recordings/rec_<ISO时间戳>.bin   (目录结构不变)
```

**文件内部布局:**
```
[4B magic]   "RCD1"                          ASCII,格式识别(不变)
───── 帧定义块(★新增,session 开始时一次性写) ─────
[4B frameDefBlockLen]   uint32   帧定义块总字节长度(不含本字段和 magic)
[2B frameDefCount]      uint16   选中帧种类数 N
× N 个帧定义条目:
   [2B frameIdLen]  uint16
   [NB frameId]     utf8
   [4B jsonLen]     uint32   FrameAsset JSON 字节长度
   [JB frameAsset]  utf8     完整 FrameAsset 的 JSON(含所有字段定义)
───── 帧记录流(和现在完全一样,追加) ─────
× 每帧: [4B capturedAt uint32][2B frameIdLen][NB frameId][2B byteLen][MB rawBytes]
```

**分隔方案(关键):** 帧定义块用 `frameDefBlockLen`(uint32 总长)自描述。解析时:magic → 读 frameDefBlockLen → 读那么多字节作为帧定义块 → 剩余全是帧记录流。**无歧义,好测,无需额外 magic 分隔。**

### 3.2 为什么 magic 不升 RCD2

帧定义块是**一次性写完**的(activate 时所有选中帧一起写),不破坏追加流。版本号不升,因为:
- 写入路径不变(还是单流追加)。
- 帧定义块只是头部多了一段,帧记录流格式完全不变。
- 读取层用 `frameDefBlockLen` 自描述定位,不依赖版本号判断格式差异。

(若后续格式真要大改,届时升版本号 + 读 magic 后的版本字段。本次不必。)

### 3.3 帧定义序列化:JSON

`FrameAsset`(`frame/core/types.ts:94-107`)是 JSON 友好结构(全是基础类型 + 数组),直接 `JSON.stringify`。
- 实测单帧定义 1.7–7.8KB,中位数 ~2KB。
- 一个 session 选中 N 帧的帧定义块 ≈ N × 2KB,session 开始写一次,**不按小时/按帧记录重复**(这正是 Option A 对 RCD2 帧定义重复问题的修正)。

### 3.4 不向后兼容老文件

老 .bin(无帧定义块)直接作废。解析时:
- 读 magic → 读 frameDefBlockLen → 若 frameDefBlockLen 异常(如超过文件剩余字节)→ 判定为老格式 → **报错跳过该文件**(提示"旧格式录制文件无法查看,请重新录制"),不崩溃。
- 用户已知此约束(都是测试数据)。

---

## 四、录制侧改动(小)

### 4.1 activate 时写帧定义块

`recording-writer.ts` 的 `activate()`:
- 现状:写 magic 头。
- 改后:写 magic 头 → 写帧定义块(一次性)。
- **需要拿到选中帧的 FrameAsset**:activate 时由 `recording-service` 从 `frameReader.findFrames()` 取选中帧定义,经 IPC `activate` 请求传入主进程。

`RecordingActivateRequest`(`platform-bridge.ts`)加字段:
```ts
export interface RecordingActivateRequest {
  readonly fileConfig: { ... };
  readonly frameDefinitions: readonly FrameAsset[];   // ★新增:session 开始时的帧定义快照
}
```

`recording-bridge.ts` / `recording-service.ts`:`start()` 时从 `frameReader.findFrames()` 拿选中帧(id 在 `config.selectedFrameIds`),传给 `platformFacade.activate({ frameDefinitions })`。

### 4.2 serialization 加帧定义块编解码

`serialization.ts` 加纯函数(可单测):
```ts
encodeFrameDefinitions(defs: readonly FrameAsset[]): Buffer   // 编码帧定义块
decodeFrameDefinitions(data: Uint8Array): FrameAsset[]       // 解码
```
帧定义块 = `[uint16 count][count × (frameId + jsonLen + json)]`,外层由 recording-writer 包上 `frameDefBlockLen`。

### 4.3 帧记录流不变

`encodeFrameRecord` / `decodeFrameRecords` 完全不动。写入路径 O(1) 追加,S015 守约。

---

## 五、History 读取层(重写核心)

### 5.1 新建 recording 读取服务

新建 `features/recording/services/recording-reader.ts`(纯函数为主,可测):
- `listRecordingFiles(dir): RecordingFileMeta[]` — 列 recordings/ 目录,按文件名 ISO 时间戳解析出起止时间。
- `readRecordingFile(path): RecordingFileContent` — 读文件:magic → 帧定义块 → 帧记录流,返回 `{ frameDefs: Map<frameId, FrameAsset>, records: RecordingFrameRecord[] }`。
- `parseRecordingToSeries(content, selectedItems): FieldTimeSeries[]` — 用内嵌帧定义 + `parseReceiveFrameFields({frame, bytes})` 把帧记录解析成字段时间序列。

平台层:`platform/recording.ts` 加 `listRecordingFiles()` / `readRecordingFile()` 方法(读文件在主进程,经 IPC)。`recording-handlers.ts` + preload 加对应 channel。

**读取粒度:整文件读取(非流式)。** 自检已验证单文件最坏 ~2MB(12 帧/秒 × 1 小时 × 单帧类型),解码个位数毫秒(`serialization.ts:58` 的 `decodeFrameRecords` 是紧凑线性扫描)。整文件读最简单、无边界条件。**不引入 mmap / 分块流式**——数据规模不值得。

### 5.2 useHistoryData 改数据源

`useHistoryData.ts` 的 `loadData()`:
- 现状:`storageService.listLocalRecords()` + `listHistoryHours()` + `loadHistoryMaterials()`。
- 改后:`recordingReader.listRecordingFiles()` → 按时间范围筛 → 逐文件 `readRecordingFile()` → `parseRecordingToSeries()` → 产出 `StorageLocalRecord` 兼容形状(或直接改内部模型为"字段时间序列")。
- `extractItemHierarchy` / `buildSeriesWithPoints`:**直接重写为新内部模型**(帧×字段×时间点),不复用旧 `StorageLocalRecord` 形状(旧格式已废弃,无需兼容形状)。hierarchy 按帧分组(frameId 天然可得),series 按字段×时间点组织。

> 决定(spec review 时已定):**内部模型直接换新**,不维持兼容形状。改动比"适配旧形状"大,但干净——旧 `StorageLocalRecord` 已废弃,没必要为它留适配层。

### 5.3 HistoryPage.vue 修拼写 bug

`HistoryPage.vue:15`:
```ts
const storageService = runtime.features.storageLocalService;  // ❌ 拼写错
```
改为(若 History 还需 storageService 做别的):
```ts
const storageService = runtime.features.storageService;       // ✅
```
**但要确认**:改完读取层后,History 是否还用 storageService。若读取层全切到 recording-reader,可能 HistoryPage 不再需要 storageService——届时连同 `CSVExportDialog` 的 `:storage-service` prop 一起改成传 recording-reader。spec 落实时定。

### 5.4 CSV 导出(本轮不做)

`CSVExportDialog` 现从 `StorageLocalRecord` 导(`:74 createCsvFromLocalRecords`,吃 `StorageRecordQuery` + fieldKeys)。改成从新格式导需要**重写 CSV 生成的数据源**(storage-local 专有逻辑) + 重做 composite id 映射——**复杂,非改个 prop 可比**。用户判定"麻烦先不管"。

**本轮 CSV 导出不做。** History 页 CSV 按钮可保留但置灰(或隐藏),提示"暂不支持新录制格式"。下轮单独做。`CSVExportDialog` 的 `storageService` prop 暂保留(它还依赖 storageService 做别的),不强行拆。

---

## 六、改动文件清单

### 录制侧(小改)
- `features/recording/core/serialization.ts` — 加帧定义块编解码纯函数
- `features/recording/__tests__/serialization.spec.ts` — 加帧定义块往返测试
- `src-electron/main/recording-writer.ts` — activate 写帧定义块
- `shared/platform-bridge.ts` — `RecordingActivateRequest` 加 `frameDefinitions`
- `platform/recording.ts` + `platform/index.ts` — facade 加 read 方法
- `src-electron/main/recording-handlers.ts` — 加 read IPC channel(粗粒度:list/read)
- `src-electron/preload/index.ts` — 暴露 read API
- `features/recording/services/recording-service.ts` — start() 传帧定义
- `runtime/bridges/recording-bridge.ts` — start 时取帧定义(或 service 内部做)

### History 侧(重写读取层)
- `features/recording/services/recording-reader.ts` — ★新建读取服务
- `features/recording/__tests__/recording-reader.spec.ts` — ★新建测试
- `pages/history/useHistoryData.ts` — 数据源切到 recording-reader
- `pages/HistoryPage.vue` — 修拼写 bug(:15)+ 适配新数据源(CSV prop 暂保留,按钮置灰)

### 治理
- `decisions.md` D002 — 更新"格式"部分(RCD1 → RCD1+帧定义块),记录自检推翻 RCD2 的教训

---

## 七、测试 + 验收

### 7.1 测试
- **纯函数单测**(高覆盖):
  - `serialization.ts` 帧定义块编解码往返 + 边界(空帧定义集、大 JSON、单帧)
  - `recording-reader.ts` readRecordingFile(用真实 .bin fixture:写一个含帧定义块的文件 → 读回 → 解析)
  - parseRecordingToSeries(多帧 × 多字段 → 时间序列)
- **集成测试**:
  - 录制 → 落盘 .bin → History 读取 → 图表数据正确(端到端)
  - 老 .bin(无帧定义块)被跳过不崩
  - 帧定义变化模拟:用旧帧定义录的 .bin,即使当前 frameReader 改了帧定义,History 仍用内嵌定义正确解析

### 7.2 验收标准
1. **History 页能打开**(拼写 bug 修复,:15)。
2. **History 能列出录制文件**:时间选择器能看到录过的 session。
3. **History 能查看录制数据**:选时间范围 → 加载 → 选帧/字段 → 看到曲线。数据正确(和实时显示一致)。
4. **帧定义漂移防护**:模拟帧定义变化后,旧 .bin 仍正确解析(用内嵌定义)。
5. **老 .bin 跳过不崩**(无帧定义块 → 报错跳过)。
6. **CSV 导出**:本轮不做(spec §5.4),按钮置灰/隐藏提示。验收时确认按钮不崩。
7. tsc src 0 错 / lint 0 新增 / 相关测试通过。
8. **录制侧无回归**:录制功能(诉求①②③④)仍正常,录制出的新 .bin 含帧定义块。

### 7.3 边界红线
- 不重新引入 routingTick 写盘变更(D013);录制写入路径 O(1) 追加不变(S015)。
- 不引入 SQLite(D006 原生模块 ABI 风险,子代理否决)。
- 不做分层目录 / 索引块(自检否决)。
- 改治理文档前重读 session-governance;D002 更新按 Trigger 2。

---

## 八、已确认的 spec review 决定

1. **帧定义块 frameDefBlockLen 用 uint32**——足够大(单 session 帧定义块顶多几十 KB)。✅
2. **内部模型直接换新**(帧×字段×时间点),不维持 `StorageLocalRecord` 兼容形状。✅(旧格式已废弃)
3. **CSV 导出本轮不做**——`createCsvFromLocalRecords` 是 storage-local 专有,重写数据源 = 麻烦,用户判定先不做。CSV 按钮置灰/隐藏。✅
4. **读取粒度 = 整文件读**——最坏 2MB,解码个位数毫秒,不引入 mmap/流式。✅(自检验证)
5. **HistoryPage storageService**:CSV 不做后,HistoryPage 是否还需要 storageService 待实施时确认;CSVExportDialog 的 `storageService` prop 暂保留(不强行拆)。
