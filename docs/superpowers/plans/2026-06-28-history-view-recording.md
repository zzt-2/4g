# History 页查看录制数据 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 History 页能查看录制出的 `.bin`(原始帧字节)——录制格式升级为"RCD1 + session 头部帧定义块"(防帧定义漂移),History 读取层用内嵌帧定义解析,直接换新内部模型(帧×字段×时间点)。

**Architecture:** 录制侧小改(activate 时多写一段帧定义块,写入路径 O(1) 不变,S015 守约);History 侧重写读取层(主进程读 .bin → 解析帧定义块 → 用内嵌 FrameAsset 调 parseReceiveFrameFields → 字段时间序列)。**旧 StorageLocalRecord 格式废弃,不向后兼容老 .bin(测试数据作废)。CSV 导出本轮不做。**

**Tech Stack:** Vue3 + Quasar + TS + Electron 35(node:fs)+ vitest。目标 LINUX(银河麒麟)。

**Spec:** `docs/superpowers/specs/2026-06-28-history-view-recording-design.md`

**前置:** 录制功能已落地并合并(a3c9df1 Merge feat/recording-redesign)。本计划是 H014 续接。

---

## 文件结构(总览)

### 录制侧(小改)
- **改** `features/recording/core/serialization.ts` — 加帧定义块编解码纯函数
- **改** `features/recording/__tests__/serialization.spec.ts` — 加帧定义块往返测试
- **改** `src-electron/main/recording-writer.ts` — activate 写帧定义块
- **改** `shared/platform-bridge.ts` — `RecordingActivateRequest` 加 `frameDefinitions`
- **改** `features/recording/services/recording-service.ts` — start() 取选中帧定义传入
- **改** `runtime/bridges/recording-bridge.ts` 或 service — start 时拿帧定义(从 frameReader)

### History 读取侧(重写读取层)
- **新建** `features/recording/services/recording-reader.ts` — 读取服务(纯函数为主)
- **新建** `features/recording/__tests__/recording-reader.spec.ts` — 测试
- **改** `shared/platform-bridge.ts` — 加 read IPC 类型(listFiles/readFile)
- **改** `platform/recording.ts` + `platform/index.ts` — facade 加 read 方法
- **改** `src-electron/main/recording-handlers.ts` — 加 read IPC channel
- **改** `src-electron/main/recording-writer.ts`(或新 read 模块)— 主进程读 .bin
- **改** `src-electron/preload/index.ts` — 暴露 read API
- **改** `pages/history/useHistoryData.ts` — 数据源切到 recording-reader,内部模型换新
- **改** `pages/HistoryPage.vue` — 修拼写 bug(:15)+ 适配新数据源 + CSV 按钮置灰

### 治理
- **改** `.sessions/2026-06-11-display-group-management/decisions.md` — D002 更新格式部分

---

## 任务依赖图(实施顺序)

```
T1 (帧定义块编解码纯函数)     ── 无依赖
T2 (录制侧:activate 写帧定义块) ── 依赖 T1
T3 (主进程读 .bin + read IPC)    ── 依赖 T1
T4 (recording-reader 读取服务)    ── 依赖 T1,T3
T5 (useHistoryData 数据源切换)    ── 依赖 T4
T6 (HistoryPage 适配 + 修拼写 bug) ── 依赖 T5
T7 (回归 + 治理落档)              ── 依赖全部
```

---

## Task 1: 帧定义块编解码纯函数

**Files:**
- Modify: `rewrite/src/features/recording/core/serialization.ts`
- Modify: `rewrite/src/features/recording/__tests__/serialization.spec.ts`

加帧定义块的编码/解码纯函数。格式见 spec §三.1:`[uint16 count][count × (frameId + jsonLen + json)]`,外层由 recording-writer 包 `frameDefBlockLen`。

- [ ] **Step 1: 写失败测试 — 帧定义块编解码往返**

```ts
// 追加到 rewrite/src/features/recording/__tests__/serialization.spec.ts
import { encodeFrameDefinitions, decodeFrameDefinitions, type FrameDefinitionEntry } from '../core/serialization';

describe('recording frame-definition block', () => {
  it('encodes and decodes frame definitions round-trip', () => {
    const defs: FrameDefinitionEntry[] = [
      {
        frameId: 'frame-001',
        frameAssetJson: '{"id":"frame-001","name":"Status","direction":"receive","fields":[]}',
      },
      {
        frameId: 'wt-status',
        frameAssetJson: '{"id":"wt-status","name":"WT","direction":"receive","fields":[{"id":"f1","dataType":"uint8"}]}',
      },
    ];
    const encoded = encodeFrameDefinitions(defs);
    // count(2) + [frameIdLen(2)+frameId(9)+jsonLen(4)+json(63)] + [frameIdLen(2)+frameId(9)+jsonLen(4)+json(70)]
    const decoded = decodeFrameDefinitions(encoded);
    expect(decoded).toEqual(defs);
  });

  it('handles empty frame-definition set', () => {
    const encoded = encodeFrameDefinitions([]);
    // 仅 count=0,2 字节
    expect(encoded.length).toBe(2);
    expect(decodeFrameDefinitions(encoded)).toEqual([]);
  });

  it('handles frameId with multi-byte utf8 and large json', () => {
    const largeJson = '{"id":"x","fields":[' + '"a",'.repeat(500) + '"end"]}';
    const defs: FrameDefinitionEntry[] = [
      { frameId: '帧-测试', frameAssetJson: largeJson },
    ];
    const encoded = encodeFrameDefinitions(defs);
    const decoded = decodeFrameDefinitions(encoded);
    expect(decoded[0].frameId).toBe('帧-测试');
    expect(decoded[0].frameAssetJson).toBe(largeJson);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd rewrite && npx vitest run src/features/recording/__tests__/serialization.spec.ts`
Expected: FAIL — encodeFrameDefinitions/decodeFrameDefinitions 未导出

- [ ] **Step 3: 写实现**

追加到 `rewrite/src/features/recording/core/serialization.ts`:

```ts
// ───── 帧定义块(spec §三.1) ─────
// session 开始时一次性写,内嵌当时帧定义(防帧定义漂移)。
// 布局: [uint16 count][count × (uint16 frameIdLen + frameId + uint32 jsonLen + json)]
// 外层由 recording-writer 包 uint32 frameDefBlockLen(总长,不含本字段)。

export interface FrameDefinitionEntry {
  readonly frameId: string;
  readonly frameAssetJson: string; // 完整 FrameAsset 的 JSON 字符串
}

export function encodeFrameDefinitions(defs: readonly FrameDefinitionEntry[]): Buffer {
  let totalLen = 2; // count
  const parts: Buffer[] = [];
  for (const d of defs) {
    const frameIdBuf = Buffer.from(d.frameId, 'utf8');
    const jsonBuf = Buffer.from(d.frameAssetJson, 'utf8');
    if (frameIdBuf.length > 0xffff) throw new Error(`frameId too long: ${frameIdBuf.length}`);
    if (jsonBuf.length > 0xffffffff) throw new Error(`frame asset json too long: ${jsonBuf.length}`);
    const header = Buffer.allocUnsafe(2 + 4);
    header.writeUInt16LE(frameIdBuf.length, 0);
    header.writeUInt32LE(jsonBuf.length, 2);
    parts.push(header, frameIdBuf, jsonBuf);
    totalLen += header.length + frameIdBuf.length + jsonBuf.length;
  }
  const countBuf = Buffer.allocUnsafe(2);
  countBuf.writeUInt16LE(defs.length, 0);
  return Buffer.concat([countBuf, ...parts]);
}

export function decodeFrameDefinitions(data: Uint8Array): FrameDefinitionEntry[] {
  const buf = Buffer.from(data);
  if (buf.length < 2) throw new Error('frame-definition block truncated: missing count');
  const count = buf.readUInt16LE(0);
  let offset = 2;
  const defs: FrameDefinitionEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 2 > buf.length) throw new Error(`frame-definition block truncated: entry ${i} frameIdLen`);
    const frameIdLen = buf.readUInt16LE(offset); offset += 2;
    if (offset + frameIdLen > buf.length) throw new Error(`frame-definition block truncated: entry ${i} frameId`);
    const frameId = buf.subarray(offset, offset + frameIdLen).toString('utf8'); offset += frameIdLen;
    if (offset + 4 > buf.length) throw new Error(`frame-definition block truncated: entry ${i} jsonLen`);
    const jsonLen = buf.readUInt32LE(offset); offset += 4;
    if (offset + jsonLen > buf.length) throw new Error(`frame-definition block truncated: entry ${i} json`);
    const json = buf.subarray(offset, offset + jsonLen).toString('utf8'); offset += jsonLen;
    defs.push({ frameId, frameAssetJson: json });
  }
  return defs;
}

// 帧定义块 + 总长前缀(uint32 frameDefBlockLen)打包,供 writer 写入文件头(magic 之后)。
export function encodeFrameDefinitionBlock(defs: readonly FrameDefinitionEntry[]): Buffer {
  const inner = encodeFrameDefinitions(defs);
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32LE(inner.length, 0);
  return Buffer.concat([lenBuf, inner]);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd rewrite && npx vitest run src/features/recording/__tests__/serialization.spec.ts`
Expected: 全 PASS(原 6 个 + 新 3 个 = 9 个)

- [ ] **Step 5: Commit**

```bash
cd rewrite
git add src/features/recording/core/serialization.ts src/features/recording/__tests__/serialization.spec.ts
git commit -m "feat(recording): T1 帧定义块编解码纯函数 + 单测"
```

---

## Task 2: 录制侧 activate 写帧定义块

**Files:**
- Modify: `rewrite/src/shared/platform-bridge.ts`
- Modify: `rewrite/src-electron/main/recording-writer.ts`
- Modify: `rewrite/src/features/recording/services/recording-service.ts`
- Modify: `rewrite/src/runtime/bridges/recording-bridge.ts` 或 `recording-service.ts`

activate 时把选中帧的 FrameAsset JSON 写进文件头。需要 service 持有 frameReader,start() 时取帧定义传入 IPC。

- [ ] **Step 1: platform-bridge.ts — RecordingActivateRequest 加 frameDefinitions**

在 `rewrite/src/shared/platform-bridge.ts`,改 `RecordingActivateRequest`:

```ts
export interface RecordingActivateRequest {
  readonly fileConfig: {
    readonly maxFileSize: number;
    readonly enableRotation: boolean;
    readonly rotationCount: number;
  };
  // ★新增:session 开始时的帧定义快照(防漂移)。每条 = { frameId, frameAssetJson }。
  // 主进程写进 .bin 头部,History 读时用它解析,不依赖当前 frameReader。
  readonly frameDefinitions: readonly {
    readonly frameId: string;
    readonly frameAssetJson: string;
  }[];
}
```

- [ ] **Step 2: recording-writer.ts — activate 写帧定义块**

改 `rewrite/src-electron/main/recording-writer.ts` 的 `activate`:

```ts
import {
  encodeFileHeader, encodeFrameRecord, encodeFrameDefinitionBlock,
  type RecordingFrameRecord, type FrameDefinitionEntry,
} from '@/features/recording/core/serialization'

// activate 入参加 frameDefinitions
activate(
  fileConfig: RotationFileConfig,
  frameDefinitions: readonly { readonly frameId: string; readonly frameAssetJson: string }[],
): void {
  this.writer.activate(fileConfig)
  // 写文件头:magic + 帧定义块(总长前缀 + 内容)
  this.writer.writeItem(encodeFileHeader(), 0)
  const entries: FrameDefinitionEntry[] = frameDefinitions.map(d => ({
    frameId: d.frameId, frameAssetJson: d.frameAssetJson,
  }))
  this.writer.writeItem(encodeFrameDefinitionBlock(entries), 0)
  this.headerWritten = true
}
```

(注意:原来 `activate(fileConfig)` 单参,现在两参。调用方 T2 Step 4 改。)

`resetStats()` 里重写头时也要补帧定义块——但 reset 不一定有 frameDefinitions。简化:`resetStats` 后只重写 magic,帧定义块丢失(-reset 罕见,且后续文件本就该重新 activate)。resetStats 内补注释说明。

- [ ] **Step 3: recording-service.ts — 持有 frameReader,start() 取帧定义**

改 `rewrite/src/features/recording/services/recording-service.ts`:

```ts
import type { FrameAssetReader } from '@/features/frame'

export interface CreateRecordingServiceOptions {
  readonly platformFacade: RecordingPlatformFacade
  readonly state?: RecordingStateContainer
  readonly frameReader: FrameAssetReader   // ★新增:start 时取选中帧定义
}

export function createRecordingService(options: CreateRecordingServiceOptions): RecordingService {
  // ... 现有
  async start() {
    // ★取选中帧的 FrameAsset,序列化成 JSON 传给主进程
    const selected = config.selectedFrameIds
    const allFrames = options.frameReader.findFrames()
    const frameDefinitions = allFrames
      .filter(f => selected.includes(f.id))
      .map(f => ({ frameId: f.id, frameAssetJson: JSON.stringify(f) }))
    await options.platformFacade.activate({
      fileConfig: {
        maxFileSize: config.maxFileSizeMb * 1024 * 1024,
        enableRotation: config.enableRotation,
        rotationCount: config.rotationCount,
      },
      frameDefinitions,   // ★传入
    })
    state.setRecording(true)
  },
  // ... 其余不变
}
```

- [ ] **Step 4: feature-wiring.ts — 传 frameReader 给 recordingService**

在 `rewrite/src/runtime/feature-wiring.ts`,创建 recordingService 处加 `frameReader`(已存在的 frameService/frameReader):

```ts
const recordingService = createRecordingService({
  platformFacade: recordingFacade ?? { /* stub 不变 */ },
  frameReader,   // ★新增(同一作用域已有 frameReader/frameService)
});
```

(确认 frameReader 变量名——feature-wiring 里 L0 已建 frameService,可能用 frameService 充当 FrameAssetReader。按实际变量名。)

- [ ] **Step 5: recording-service.ts 加 read 代理方法(HistoryPage 经 service 调用)**

History 页通过 `runtime.features.recordingService` 读录制数据(它是 feature 的公共 API)。`listRecordingFiles`/`readRecordingFile` 在 RecordingPlatformFacade 上(T3),给 RecordingService 加转发方法:

```ts
// RecordingService 接口加:
listRecordingFiles(): Promise<readonly RecordingFileMeta[]>
readRecordingFile(filePath: string): Promise<{ readonly bytes: readonly number[]; readonly ok: boolean; readonly error?: string }>

// 实现(转发到 platformFacade):
listRecordingFiles() { return options.platformFacade.listRecordingFiles() },
readRecordingFile(filePath) { return options.platformFacade.readRecordingFile(filePath) },
```
(import RecordingFileMeta type。)这样 HistoryPage 用 `runtime.features.recordingService.listRecordingFiles()` 即可,无需暴露 facade。

- [ ] **Step 6: 跑测试确认无回归 + 录制功能正常**

Run: `cd rewrite && npx vitest run src/features/recording/ 2>&1 | tail -5`
Expected: 全 PASS。注意:recording-service 测试的 mock facade activate 现在收到 frameDefinitions 参数,若有断言可能需更新。

手动验证(若有条件):启动 App,选帧录制,确认 .bin 文件头部含帧定义块(用 T3 的 read 或十六进制查看)。否则靠 T3/T4 测试覆盖。

- [ ] **Step 7: Commit**

```bash
cd rewrite
git add src/shared/platform-bridge.ts src-electron/main/recording-writer.ts \
  src/features/recording/services/recording-service.ts src/runtime/feature-wiring.ts
git commit -m "feat(recording): T2 activate 写帧定义块(防漂移) + service read 代理方法"
```

---

## Task 3: 主进程读 .bin + read IPC 通道

**Files:**
- Modify: `rewrite/src/shared/platform-bridge.ts` — 加 read 类型
- Modify: `rewrite/src-electron/main/recording-handlers.ts` — 加 read handlers
- Modify: `rewrite/src-electron/main/recording-writer.ts` 或新建 read 模块 — 主进程读文件
- Modify: `rewrite/src/platform/recording.ts` — facade 加 read 方法
- Modify: `rewrite/src/platform/index.ts` — 无需改(facade 同对象)
- Modify: `rewrite/src-electron/preload/index.ts` — 暴露 read API

主进程读 .bin 返回原始字节(number[] 经 IPC),renderer 端解析。**整文件读**(spec §5.1,最坏 2MB)。

- [ ] **Step 1: platform-bridge.ts — 加 read 类型**

在 `rewrite/src/shared/platform-bridge.ts`,Recording bridge 类型块加:

```ts
export interface RecordingFileMeta {
  readonly fileName: string;       // 如 "rec_2026-06-28T13-54-34-956Z.bin"
  readonly filePath: string;       // 完整路径
  readonly byteLength: number;
  readonly mtimeMs: number;        // 用于时间范围筛选/排序
}

// 在 RecordingBridge 接口加方法:
export interface RecordingBridge {
  // ... 现有 activate/deactivate/appendFrames/getStats/reset/updateConfig
  listRecordingFiles(): Promise<readonly RecordingFileMeta[]>;
  readRecordingFile(filePath: string): Promise<{ readonly bytes: readonly number[]; readonly ok: boolean; readonly error?: string }>;
}
```

- [ ] **Step 2: recording-handlers.ts — 加 read handlers**

在 `rewrite/src-electron/main/recording-handlers.ts` 加(read 用 fs,不经 recordingWriter):

```ts
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const IPC_RECORDING_LIST_FILES = 'recording:list-files'
const IPC_RECORDING_READ_FILE = 'recording:read-file'

const RECORDINGS_DIR = () => path.join(app.getPath('userData'), 'dongfanghong', 'recordings')

function handleListFiles(): { readonly files: import('@/shared/platform-bridge').RecordingFileMeta[] } {
  const dir = RECORDINGS_DIR()
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('rec_') && f.endsWith('.bin'))
      .map(f => {
        const fp = path.join(dir, f)
        const stat = fs.statSync(fp)
        return { fileName: f, filePath: fp, byteLength: stat.size, mtimeMs: stat.mtimeMs }
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
    return { files }
  } catch { return { files: [] } }
}

function handleReadFile(_e: Electron.IpcMainInvokeEvent, filePath: string): { bytes: number[]; ok: boolean; error?: string } {
  try {
    // 安全校验:文件必须在 recordings 目录下(防路径穿越)
    const dir = RECORDINGS_DIR()
    const resolved = path.resolve(filePath)
    if (!resolved.startsWith(dir)) return { bytes: [], ok: false, error: 'path outside recordings dir' }
    if (!resolved.startsWith('rec_') || !resolved.endsWith('.bin')) {
      const base = path.basename(resolved)
      if (!base.startsWith('rec_') || !base.endsWith('.bin')) return { bytes: [], ok: false, error: 'invalid filename' }
    }
    const buf = fs.readFileSync(resolved)
    return { bytes: Array.from(buf), ok: true }
  } catch (err) {
    return { bytes: [], ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// 在 registerRecordingHandlers() 里加:
ipcMain.handle(IPC_RECORDING_LIST_FILES, handleListFiles)
ipcMain.handle(IPC_RECORDING_READ_FILE, handleReadFile)

// 在 cleanupRecordingHandlers() 里加:
ipcMain.removeHandler(IPC_RECORDING_LIST_FILES)
ipcMain.removeHandler(IPC_RECORDING_READ_FILE)
```

> 安全校验写得保守一点:确认 filePath 在 recordings 目录下 + 文件名匹配 rec_*.bin。防恶意/误传路径穿越。实施时仔细测试这个校验(合法路径 PASS、`../etc/passwd` FAIL)。

- [ ] **Step 3: preload 暴露 read API**

在 `rewrite/src-electron/preload/index.ts`,recording 块加:

```ts
recording: {
  // ... 现有
  listRecordingFiles: () => ipcRenderer.invoke('recording:list-files'),
  readRecordingFile: (filePath) => ipcRenderer.invoke('recording:read-file', filePath),
},
```

- [ ] **Step 4: platform/recording.ts — facade 加 read 方法**

在 `rewrite/src/platform/recording.ts`,RecordingPlatformFacade 接口 + createRecordingFacade 加:

```ts
import type { RecordingFileMeta } from '@/shared/platform-bridge'
export type { RecordingFileMeta }

export interface RecordingPlatformFacade {
  // ... 现有
  listRecordingFiles(): Promise<readonly RecordingFileMeta[]>
  readRecordingFile(filePath: string): Promise<{ readonly bytes: readonly number[]; readonly ok: boolean; readonly error?: string }>
}

export function createRecordingFacade(bridge: RecordingBridge): RecordingPlatformFacade {
  return {
    // ... 现有
    listRecordingFiles: () => bridge.listRecordingFiles(),
    readRecordingFile: (filePath) => bridge.readRecordingFile(filePath),
  }
}
```

- [ ] **Step 5: main/index.ts 注册无需改**(registerRecordingHandlers 已含,只要 Step 2 在同一函数内加了 handle)

- [ ] **Step 6: tsc 检查**

Run: `cd rewrite && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "recording" | head; echo done`
Expected: 无新错。

- [ ] **Step 7: Commit**

```bash
cd rewrite
git add src/shared/platform-bridge.ts src-electron/main/recording-handlers.ts \
  src-electron/preload/index.ts src/platform/recording.ts
git commit -m "feat(platform): T3 recording read IPC(list files + read .bin 整文件)"
```

---

## Task 4: recording-reader 读取服务(纯函数为主)

**Files:**
- Create: `rewrite/src/features/recording/services/recording-reader.ts`
- Create: `rewrite/src/features/recording/__tests__/recording-reader.spec.ts`

读 .bin 字节 → 解析帧定义块 + 帧记录 → 用内嵌帧定义调 parseReceiveFrameFields → 字段时间序列。

- [ ] **Step 1: 写失败测试 — 解析整文件**

```ts
// rewrite/src/features/recording/__tests__/recording-reader.spec.ts
import { describe, it, expect } from 'vitest';
import {
  parseRecordingFileBytes,
  parseRecordingToFieldSeries,
} from '../services/recording-reader';
import {
  encodeFileHeader,
  encodeFrameDefinitionBlock,
  encodeFrameRecord,
  type FrameDefinitionEntry,
} from '../core/serialization';
import type { FrameAsset } from '@/features/frame';

// 构造一个最小可解析的帧定义:uint8 字段 offset 0 length 1
const TEST_FRAME: FrameAsset = {
  id: 'tf', name: 'Test', direction: 'receive',
  fields: [{
    id: 'f1', name: 'Value', dataType: 'uint8', length: 1,
    inputType: 'manual', configurable: false, options: [], dataParticipationType: 'direct',
  }],
};

function buildBinFile(records: { capturedAt: number; bytes: number[] }[]): Uint8Array {
  const defEntries: FrameDefinitionEntry[] = [{ frameId: 'tf', frameAssetJson: JSON.stringify(TEST_FRAME) }];
  const parts = [
    encodeFileHeader(),
    encodeFrameDefinitionBlock(defEntries),
    ...records.map(r => encodeFrameRecord({ capturedAt: r.capturedAt, frameId: 'tf', bytes: r.bytes })),
  ];
  const totalLen = parts.reduce((s, b) => s + b.length, 0);
  const out = Buffer.concat(parts, totalLen);
  return out;
}

describe('recording-reader', () => {
  it('parses magic + frame-def block + records', () => {
    const bytes = buildBinFile([
      { capturedAt: 1000, bytes: [0x2a] },
      { capturedAt: 2000, bytes: [0x3b] },
    ]);
    const content = parseRecordingFileBytes(bytes);
    expect(content.frameDefs.has('tf')).toBe(true);
    expect(content.records).toHaveLength(2);
    expect(content.records[0]).toEqual({ capturedAt: 1000, frameId: 'tf', bytes: [0x2a] });
  });

  it('parses frame records into field time-series using embedded def', () => {
    const bytes = buildBinFile([
      { capturedAt: 1000, bytes: [0x2a] },
      { capturedAt: 2000, bytes: [0x3b] },
    ]);
    const content = parseRecordingFileBytes(bytes);
    const series = parseRecordingToFieldSeries(content, ['tf']);
    expect(series).toHaveLength(1); // 1 帧
    expect(series[0].frameId).toBe('tf');
    expect(series[0].fields).toHaveLength(1); // f1
    const f1 = series[0].fields[0];
    expect(f1.fieldId).toBe('f1');
    expect(f1.fieldName).toBe('Value');
    expect(f1.points).toEqual([
      { capturedAt: 1000, value: 0x2a },
      { capturedAt: 2000, value: 0x3b },
    ]);
  });

  it('throws on old-format file (no frame-def block)', () => {
    // 老 RCD1:只 magic + 帧记录,无帧定义块
    const oldBytes = Buffer.concat([
      encodeFileHeader(),
      encodeFrameRecord({ capturedAt: 1, frameId: 'tf', bytes: [0x01] }),
    ]);
    expect(() => parseRecordingFileBytes(oldBytes)).toThrow(/frame-def|old format/i);
  });

  it('returns empty when frameId not in selection', () => {
    const bytes = buildBinFile([{ capturedAt: 1, bytes: [0x01] }]);
    const content = parseRecordingFileBytes(bytes);
    const series = parseRecordingToFieldSeries(content, ['other-frame']);
    expect(series).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd rewrite && npx vitest run src/features/recording/__tests__/recording-reader.spec.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 写实现**

```ts
// rewrite/src/features/recording/services/recording-reader.ts
import {
  RECORDING_FILE_MAGIC,
  decodeFrameRecords,
  decodeFrameDefinitions,
  type RecordingFrameRecord,
  type FrameDefinitionEntry,
} from '../core/serialization';
import { parseReceiveFrameFields } from '@/features/receive';
import type { FrameAsset } from '@/features/frame';

export interface RecordingFileContent {
  /** 内嵌帧定义:frameId → FrameAsset(防漂移)。 */
  readonly frameDefs: Map<string, FrameAsset>;
  /** 帧记录(原始字节)。 */
  readonly records: readonly RecordingFrameRecord[];
}

export interface FieldTimePoint {
  readonly capturedAt: number;
  readonly value: number | string | null;
}

export interface FrameFieldSeries {
  readonly frameId: string;
  readonly fields: {
    readonly fieldId: string;
    readonly fieldName: string;
    readonly points: readonly FieldTimePoint[];
  }[];
}

// 解析整文件字节(magic + 帧定义块 + 帧记录)。
// 老格式(无帧定义块)抛错——调用方应 catch 跳过该文件(spec §3.4)。
export function parseRecordingFileBytes(data: Uint8Array): RecordingFileContent {
  const buf = Buffer.from(data);
  if (buf.length < 4 || buf.subarray(0, 4).toString('ascii') !== RECORDING_FILE_MAGIC) {
    throw new Error('not a recording file (bad magic)');
  }
  // 帧定义块:uint32 frameDefBlockLen + 内容
  if (buf.length < 8) throw new Error('old-format file (no frame-def block)');
  const blockLen = buf.readUInt32LE(4);
  const blockStart = 8;
  if (blockStart + blockLen > buf.length) {
    throw new Error('old-format file (no frame-def block)');
  }
  const defEntries: FrameDefinitionEntry[] = decodeFrameDefinitions(buf.subarray(blockStart, blockStart + blockLen));
  const frameDefs = new Map<string, FrameAsset>();
  for (const e of defEntries) {
    try {
      frameDefs.set(e.frameId, JSON.parse(e.frameAssetJson) as FrameAsset);
    } catch {
      // 单个帧定义 JSON 坏了跳过,不整文件失败
    }
  }
  const recordBytes = buf.subarray(blockStart + blockLen);
  const records = decodeFrameRecords(recordBytes);
  return { frameDefs, records };
}

// 用内嵌帧定义解析帧记录成字段时间序列。selectedFrameIds 过滤。
export function parseRecordingToFieldSeries(
  content: RecordingFileContent,
  selectedFrameIds: readonly string[],
): FrameFieldSeries[] {
  const selected = new Set(selectedFrameIds);
  const byFrame = new Map<string, RecordingFrameRecord[]>();
  for (const r of content.records) {
    if (!selected.has(r.frameId)) continue;
    if (!content.frameDefs.has(r.frameId)) continue; // 无定义,跳过
    const arr = byFrame.get(r.frameId) ?? [];
    arr.push(r);
    byFrame.set(r.frameId, arr);
  }

  const result: FrameFieldSeries[] = [];
  for (const [frameId, recs] of byFrame) {
    const frame = content.frameDefs.get(frameId)!;
    // 按时间排序
    const sorted = [...recs].sort((a, b) => a.capturedAt - b.capturedAt);
    // 每个 field 收集时间点
    const fieldMap = new Map<string, { fieldName: string; points: FieldTimePoint[] }>();
    for (const r of sorted) {
      const outcome = parseReceiveFrameFields({ frame, bytes: r.bytes });
      for (const f of outcome.fields) {
        const existing = fieldMap.get(f.id) ?? { fieldName: f.name ?? f.id, points: [] };
        existing.points.push({ capturedAt: r.capturedAt, value: f.value });
        fieldMap.set(f.id, existing);
      }
    }
    result.push({
      frameId,
      fields: Array.from(fieldMap.entries()).map(([fieldId, v]) => ({ fieldId, fieldName: v.fieldName, points: v.points })),
    });
  }
  return result;
}
```

> 注意:`parseReceiveFrameFields` 返回的 `ReceiveParsedFieldValue` 的字段名(id/name/value)以实际类型为准——实施时 Read `rewrite/src/features/receive/core/types.ts` 的 `ReceiveParsedFieldValue` 确认精确属性名,调整 Step 3 代码。这是本任务最需核对的点。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd rewrite && npx vitest run src/features/recording/__tests__/recording-reader.spec.ts`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
cd rewrite
git add src/features/recording/services/recording-reader.ts src/features/recording/__tests__/recording-reader.spec.ts
git commit -m "feat(recording): T4 recording-reader(解析 .bin→内嵌定义→字段时间序列)"
```

---

## Task 5: useHistoryData 数据源切换 + 内部模型换新

**Files:**
- Modify: `rewrite/src/pages/history/useHistoryData.ts`

数据源从 `storageService.listLocalRecords()` 切到 recording-reader,内部模型直接换"帧×字段×时间点"(不维持旧 StorageLocalRecord 形状,spec §5.2)。

- [ ] **Step 1: 读现状 + 改 composable 签名**

先完整读 `rewrite/src/pages/history/useHistoryData.ts`,理解现有 `useHistoryData(storageService, displayService, frameReader)` 的返回结构(itemHierarchy/enrichedCharts/chartStats/recordCount/timeRange 等)。

改签名:不再需要 storageService(数据源换了),frameReader 也不再需要(用内嵌定义)。新签名:
```ts
// recordingService 已有 listRecordingFiles/readRecordingFile 代理方法(T2 Step 5 加的)
export function useHistoryData(
  recordingService: RecordingService,   // 经它读录制文件
  displayService: DisplayService,
): UseHistoryDataReturn
```

- [ ] **Step 2: 重写 loadData — 从 recording-reader 加载**

```ts
async function loadData(): Promise<void> {
  loading.value = true;
  try {
    const fileList = await recordingService.listRecordingFiles();   // 经 service 代理(T2 Step 5)
    // 按时间范围筛选(用 mtimeMs 近似,或解析文件名 ISO 时间戳)
    const fromMs = timeRange.value.start.getTime();
    const toMs = timeRange.value.end.getTime();
    const inRange = fileList.filter(f => f.mtimeMs >= fromMs && f.mtimeMs <= toMs);

    fileSummaries.value = inRange;   // 替代 hourSummaries

    // 逐文件读 + 解析
    const allSeries: FrameFieldSeries[] = [];
    let totalRecords = 0;
    const seenFrameIds = new Set<string>();
    for (const f of inRange) {
      const result = await recordingService.readRecordingFile(f.filePath);
      if (!result.ok || result.bytes.length === 0) continue;
      try {
        const content = parseRecordingFileBytes(new Uint8Array(result.bytes));
        // 默认加载所有帧(用户在 hierarchy 里再选具体字段)
        const frameIds = [...content.frameDefs.keys()];
        const series = parseRecordingToFieldSeries(content, frameIds);
        for (const s of series) {
          seenFrameIds.add(s.frameId);
          totalRecords += s.fields.reduce((n, fld) => n + fld.points.length, 0);
        }
        allSeries.push(...series);
        // 累积成可查询的结构(按 frameId + fieldId 索引)
      } catch {
        // 老格式/坏文件跳过(spec §3.4)
        continue;
      }
    }

    // 存成内部模型(帧×字段×时间点)
    loadedSeries.value = mergeSeries(allSeries);
    recordCount.value = totalRecords;
    itemHierarchy.value = buildHierarchyFromSeries(loadedSeries.value);
    refreshCharts();
  } catch (err) {
    console.error('[useHistoryData] loadData error:', err);
  } finally {
    loading.value = false;
  }
}
```

- [ ] **Step 3: 重写 extractItemHierarchy / buildSeriesWithPoints — 新内部模型**

旧 `extractItemHierarchy(records)` 和 `buildSeriesWithPoints` 按 StorageLocalRecord 写,删掉。新写:

```ts
// 内部模型:加载后所有文件的字段时间序列,按 frameId 聚合。
interface LoadedFrameSeries {
  frameId: string;
  fields: Map<string, { fieldName: string; points: FieldTimePoint[] }>;
}

const loadedSeries = shallowRef<LoadedFrameSeries[]>([]);

function buildHierarchyFromSeries(series: readonly LoadedFrameSeries[]): DataItemGroup[] {
  // 按帧分组 → 每帧下是字段(可勾选)。hierarchy: 帧(组)→ 字段(项)
  return series.map(s => ({
    groupId: s.frameId,
    label: s.frameId,   // TODO(R19): fieldName 解析成帧名,见下
    items: Array.from(s.fields.entries()).map(([fieldId, v]) => ({
      fieldId: `${s.frameId}:${fieldId}`,
      key: fieldId,
      dataType: 'numeric',
    })),
  }));
}
```

> 注意 R19(V5):label 不能泄漏 raw frameId/UUID。实施时从某处取帧显示名——但本轮内嵌定义里有 frame.name,加载时可缓存。或简化:label 暂用 frameId,标注 TODO,后续优化。实施时定。

- [ ] **Step 4: 重写 refreshCharts / enrichedCharts — 适配新模型**

`enrichedCharts` 基于 display preferences(charts 配置)+ selectedGlobalItems。改为从 loadedSeries 按 selectedItems 取时间点构建 ChartSeriesProjection。

(精确代码:对照现有 buildSeriesWithPoints 的输出形状,数据源从"遍历 records.fields 找 key"改成"从 loadedSeries 按 frameId:fieldId 取 points"。逻辑等价,数据源换。)

- [ ] **Step 5: 删除 storageService / frameReader 依赖**

useHistoryData 内部所有 `storageService.*` / `frameReader.*` 调用删除。import 清理。

- [ ] **Step 6: 跑现有 useHistoryData 测试(若有)+ 适配**

Run: `cd rewrite && npx vitest run src/pages/history/ 2>&1 | tail -10`
Expected: 现有测试可能因签名变化失败——逐个适配(改 mock,新数据源)。若无 useHistoryData 独立测试,靠 HistoryPage 集成 + T4 reader 单测覆盖。

- [ ] **Step 7: Commit**

```bash
cd rewrite
git add src/pages/history/useHistoryData.ts
git commit -m "feat(history): T5 useHistoryData 数据源切到 recording-reader + 内部模型换新"
```

---

## Task 6: HistoryPage 适配 + 修拼写 bug + CSV 置灰

**Files:**
- Modify: `rewrite/src/pages/HistoryPage.vue`

修 :15 拼写 bug(前置,进页崩)+ 适配新 useHistoryData 签名 + CSV 按钮置灰(本轮不做 CSV)。

- [ ] **Step 1: 修拼写 bug + 适配签名**

`rewrite/src/pages/HistoryPage.vue`:

```ts
// :15 修拼写(且 useHistoryData 不再需要 storageService)
const displayService = runtime.features.displayService;
// storageService 不再需要(数据源切 recording-reader)。删除 :15 的 storageLocalService 行。
const recordingService = runtime.features.recordingService;  // 经它读录制文件(T2 Step 5 代理了 read 方法)
const filesFacade = getFileFacade();

const history = useHistoryData(recordingService, displayService);  // 新签名
```

- [ ] **Step 2: CSV 按钮置灰**

`:113-120` 的导出 CSV 按钮:
```vue
<q-btn
  color="primary" no-caps outline
  icon="o_download"
  label="导出 CSV"
  class="full-width"
  disable                              <!-- ★本轮 CSV 不做,永久置灰 -->
  :disable="true"
>
  <q-tooltip>CSV 导出暂不支持新录制格式</q-tooltip>
</q-btn>
```
(CSVExportDialog 可保留挂载,但按钮置灰打不开。或直接 v-if 隐藏。倾向置灰 + tooltip,保留结构。)

- [ ] **Step 3: 适配 chartCount / configDialog / 其他依赖**

检查 HistoryPage 其他用到 `history.hourSummaries`(改名 fileSummaries?)、`storageService` 的地方,全部适配。

- [ ] **Step 4: 跑测试 + tsc + 手测**

Run: `cd rewrite && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "history" | head; npx vitest run src/pages/ 2>&1 | tail -5`
Expected: tsc 无新错;测试通过或仅预期的签名适配。

手测(关键):启动 App → 录几帧(确保新格式含帧定义块)→ 进 History 页 → 选时间范围 → 加载 → 选帧/字段 → 看到曲线。**这是端到端验收,务必做。**

- [ ] **Step 5: Commit**

```bash
cd rewrite
git add src/pages/HistoryPage.vue
git commit -m "feat(history): T6 HistoryPage 适配新数据源 + 修拼写 bug + CSV 置灰"
```

---

## Task 7: 全量回归 + 治理落档

**Files:**
- Modify: `.sessions/2026-06-11-display-group-management/decisions.md` (D002 更新)

- [ ] **Step 1: 全量测试回归**

Run: `cd rewrite && npx vitest run 2>&1 | tail -15`
Expected: 无新增失败。特别注意:
- recording 全过(T1/T4 新测试 + 原有)
- display 全过(T5/T6 改动)
- storage-local-baseline 测试不因 useHistoryData 改动受影响(它不该被碰)

- [ ] **Step 2: tsc + lint 全量**

Run: `cd rewrite && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -5; npx eslint src/ src-electron/ 2>&1 | tail -10`
Expected: tsc 0 新错;lint 0 新增 error。

- [ ] **Step 3: 端到端手测(必做)**

1. 启动 App,选帧录制几秒(确认 .bin 含帧定义块)。
2. 进 History 页(确认不再崩——拼写 bug 修复)。
3. 选包含录制时间的时间范围 → 加载。
4. 在左侧 hierarchy 展开帧 → 勾选字段 → 右侧出现曲线。
5. 确认曲线数据和实时显示一致。
6. (漂移测试)模拟改帧定义后,旧 .bin 仍正确解析(用内嵌定义)。
7. 老 .bin(无帧定义块)被跳过不崩。

- [ ] **Step 4: 治理落档 — 更新 D002**

读 `.sessions/2026-06-11-display-group-management/decisions.md` 的 D002,更新"格式"部分:
- 记录格式从"纯 RCD1"演进为"RCD1 + 帧定义块"
- 记录自检推翻 RCD2 的教训(索引块不可追加写、多文件分流破坏单流、分层目录搞坏滚动)
- 标注 D002 状态:`partially-superseded`(格式部分被本轮更新)

按 session-governance Trigger 2(D### 决策记录)规范。若格式演进本身够重要,可新建 D### 而非改 D002——实施时按 governance skill 判断。

- [ ] **Step 5: 新建/更新 S### session note**

按 S### 模板新建本轮 session note(S013?——确认 display-group-management 当前 max S 编号),记录本轮工作 + 决策引用 D002(更新)。

- [ ] **Step 6: 最终 Commit**

```bash
git add .sessions/2026-06-11-display-group-management/
git commit -m "docs(session): History 查看录制落档 + D002 格式更新"
```

---

## 验收清单(对照 spec §七.2)

- [ ] History 页能打开(拼写 bug 修复)
- [ ] History 能列出录制文件(时间选择器看到 session)
- [ ] History 能查看录制数据(选时间→加载→选帧/字段→曲线,数据正确)
- [ ] 帧定义漂移防护(改帧定义后旧 .bin 仍正确解析)
- [ ] 老 .bin 跳过不崩
- [ ] CSV 导出按钮置灰不崩(本轮不做)
- [ ] tsc/lint/测试通过
- [ ] 录制侧无回归(新 .bin 含帧定义块,录制功能正常)
- [ ] 治理落档(D002 更新 + S###)

---

## 边界红线(承 spec §七.3)

- 不重新引入 routingTick 写盘变更(D013);录制写入路径 O(1) 追加不变(S015)
- 不引入 SQLite(D006 原生模块 ABI 风险)
- 不做分层目录 / 索引块(自检否决)
- CSV 导出本轮不做(spec §5.4)
- 改治理文档前重读 session-governance
- 大性能 trace 不直接读上下文,用 analyze-perf.py 消化

---

## 实施需核对的关键点(易错)

1. **T4 Step 3**:`parseReceiveFrameFields` 返回的 `ReceiveParsedFieldValue` 精确属性名(id/name/value)——Read `receive/core/types.ts` 确认,调整 reader 代码。
2. ~~T6 Step 1~~ 已定:HistoryPage 经 `runtime.features.recordingService` 调用 read(T2 Step 5 给 service 加了代理方法),不直接碰 facade。
3. **T5 Step 3**:R19 约束——hierarchy label 不能泄漏 raw frameId/UUID。用内嵌 frame.name 或标注 TODO。
4. **T3 Step 2**:read IPC 安全校验(路径穿越防护)务必测试:合法 PASS、`../etc/passwd` FAIL。
