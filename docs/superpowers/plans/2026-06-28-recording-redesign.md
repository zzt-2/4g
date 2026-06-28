# 实时测试页录制功能重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 DisplayPage 的组件级定时整表快照录制,重构为 runtime 全局 + 事件驱动 + 原始字节落盘的录制模型,解决"切走取消/太多/不落盘"三个核心诉求。

**Architecture:** 录制是独立路径——routingTick 的 matched outcomes 处 O(1) 条件采集 → fire-and-forget IPC → 主进程二进制 append 写盘(带大小滚动)。状态在全局 store(不在组件,切路由不中断)。选帧配置扩展进 DisplayPreferences。复用提取出的共享滚动写盘工具消除与 storage-highspeed 的 70-80% 重复。**不碰 storage-local records 数组(D013 单一入口),不在 routingTick 写盘(S015)。**

**Tech Stack:** Vue3 + Quasar + Pinia + TS + Electron 35(node:fs WriteStream)+ vitest。目标平台 LINUX(银河麒麟)。

**Spec:** `docs/superpowers/specs/2026-06-28-recording-redesign-design.md`

---

## 文件结构(总览)

### 主进程(src-electron/main/)
- **新建** `shared/disk-rotation-writer.ts` — 提取的共享滚动写盘工具(storage-highspeed 重构后复用)
- **新建** `recording-writer.ts` — 包装共享工具 + 二进制序列化
- **新建** `recording-handlers.ts` — IPC 处理(register/cleanup)
- **重构** `storage-filter.ts` — 改为 compose disk-rotation-writer(消除重复)

### 平台桥(shared/platform-bridge.ts + platform/)
- **改** `shared/platform-bridge.ts` — 加 RecordingBridge 类型 + channel 常量
- **新建** `platform/recording.ts` — RecordingPlatformFacade
- **改** `platform/index.ts` — getRecordingFacade() 缓存
- **改** `src-electron/preload/index.ts` — 暴露 recording API
- **改** `src-electron/main/index.ts` — 注册/清理 recording handlers

### feature(recording/)
- **新建** `core/types.ts` / `core/defaults.ts` / `core/serialization.ts`(纯函数,二进制编解码)
- **新建** `state/recording-state.ts`(状态容器)
- **新建** `services/recording-service.ts`
- **新建** `composables/use-recording.ts`
- **新建** `index.ts`(barrel)
- **新建** `components/RecordingConfigDialog.vue`(设置弹窗)

### display feature(配置扩展)
- **改** `features/display/core/types.ts` — DisplayPreferences 加 recording
- **改** `features/display/core/defaults.ts` — 默认 recording
- **改** `features/display/core/normalize.ts` — normalize recording
- **改** `features/display/core/clone.ts` — clone recording
- **改** `features/display/services/display-service.ts` — recording accessor

### runtime(接线)
- **新建** `runtime/bridges/recording-bridge.ts` — 从 routingTick 采集
- **改** `runtime/feature-wiring.ts` — 接线 RecordingService + bridge
- **改** `runtime/routing-tick.ts` — routingTick 末尾加 recordingBridge.collect
- **改** `runtime/index.ts` — teardown stopRecording
- **改** `runtime/persistence.ts` + `app/rewriteRuntime.ts` — 持久化 RecordingConfig

### 页面
- **改** `pages/DisplayPage.vue` — 删内联录制,改用 useRecording + 设置弹窗

---

## 任务依赖图(实施顺序)

```
T1 (serialization 纯函数)  ── 无依赖
T2 (disk-rotation-writer)  ── 无依赖
T3 (recording-writer 用 T2)  ── 依赖 T2
T4 (storage-filter 重构用 T2)  ── 依赖 T2
T5 (platform bridge + facade + IPC + preload)  ── 依赖 T3
T6 (recording feature: types/state/service/composable)  ── 依赖 T1,T5
T7 (DisplayPreferences 扩展 recording)  ── 无依赖(可并行 T1-T6)
T8 (recording-bridge + runtime 接线)  ── 依赖 T6
T9 (RecordingConfigDialog + FrameSelector 多选)  ── 依赖 T6,T7
T10 (DisplayPage 接线 + 删内联)  ── 依赖 T8,T9
T11 (持久化 RecordingConfig)  ── 依赖 T7
T12 (回归 + 目标机实测 + 治理落档)  ── 依赖全部
```

---

## Task 1: 二进制序列化纯函数(核心数据格式)

**Files:**
- Create: `rewrite/src/features/recording/core/serialization.ts`
- Create: `rewrite/src/features/recording/__tests__/serialization.spec.ts`

这是录制数据的核心格式,纯函数无依赖,先做。格式见 spec §三.3:文件头 magic `RCD1` + 帧记录(uint32 秒时间戳 + uint16 frameIdLen + frameId + uint16 byteLen + rawBytes)。

- [ ] **Step 1: 写失败测试 — magic 头 + 单帧编码往返**

```ts
// rewrite/src/features/recording/__tests__/serialization.spec.ts
import { describe, it, expect } from 'vitest';
import {
  RECORDING_FILE_MAGIC,
  encodeFileHeader,
  encodeFrameRecord,
  decodeFrameRecords,
} from '../core/serialization';

describe('recording serialization', () => {
  it('encodes and decodes file header + single frame round-trip', () => {
    const header = encodeFileHeader();
    expect(header.length).toBe(4);
    expect(Array.from(header)).toEqual([0x52, 0x43, 0x44, 0x31]); // 'R','C','D','1'

    const capturedAt = 1_718_000_000;
    const frameId = 'frame-001';
    const bytes = [0x1a, 0x2b, 0x3c];
    const record = encodeFrameRecord({ capturedAt, frameId, bytes });

    const full = Buffer.concat([header, record]);
    const decoded = decodeFrameRecords(full.subarray(4)); // skip magic
    expect(decoded).toHaveLength(1);
    expect(decoded[0]).toEqual({ capturedAt, frameId, bytes });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd rewrite && npx vitest run src/features/recording/__tests__/serialization.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 写最小实现**

```ts
// rewrite/src/features/recording/core/serialization.ts

// 文件头:4 字节 ASCII magic "RCD1"(版本 1)。
export const RECORDING_FILE_MAGIC = 'RCD1' as const;

export interface RecordingFrameRecord {
  readonly capturedAt: number; // epoch 秒
  readonly frameId: string;
  readonly bytes: readonly number[];
}

// 单帧记录布局(小端,无对齐填充):
// [4B capturedAt uint32][2B frameIdLen uint16][NB frameId utf8][2B byteLen uint16][MB rawBytes]
export function encodeFrameRecord(frame: RecordingFrameRecord): Buffer {
  const frameIdBuf = Buffer.from(frame.frameId, 'utf8');
  if (frameIdBuf.length > 0xffff) {
    throw new Error(`frameId too long: ${frameIdBuf.length} bytes`);
  }
  if (frame.bytes.length > 0xffff) {
    throw new Error(`frame bytes too long: ${frame.bytes.length}`);
  }
  const buf = Buffer.allocUnsafe(4 + 2 + frameIdBuf.length + 2 + frame.bytes.length);
  let offset = 0;
  buf.writeUInt32LE(frame.capturedAt >>> 0, offset); offset += 4;
  buf.writeUInt16LE(frameIdBuf.length, offset); offset += 2;
  frameIdBuf.copy(buf, offset); offset += frameIdBuf.length;
  buf.writeUInt16LE(frame.bytes.length, offset); offset += 2;
  for (let i = 0; i < frame.bytes.length; i++) {
    buf[offset + i] = frame.bytes[i] & 0xff;
  }
  return buf;
}

export function encodeFileHeader(): Buffer {
  return Buffer.from(RECORDING_FILE_MAGIC, 'ascii');
}

export function decodeFrameRecords(data: Uint8Array): RecordingFrameRecord[] {
  const buf = Buffer.from(data);
  const records: RecordingFrameRecord[] = [];
  let offset = 0;
  while (offset < buf.length) {
    if (offset + 4 > buf.length) break; // 不完整时间戳,丢弃尾部
    const capturedAt = buf.readUInt32LE(offset); offset += 4;
    if (offset + 2 > buf.length) break;
    const frameIdLen = buf.readUInt16LE(offset); offset += 2;
    if (offset + frameIdLen > buf.length) break;
    const frameId = buf.subarray(offset, offset + frameIdLen).toString('utf8'); offset += frameIdLen;
    if (offset + 2 > buf.length) break;
    const byteLen = buf.readUInt16LE(offset); offset += 2;
    if (offset + byteLen > buf.length) break;
    const bytes = Array.from(buf.subarray(offset, offset + byteLen)); offset += byteLen;
    records.push({ capturedAt, frameId, bytes });
  }
  return records;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd rewrite && npx vitest run src/features/recording/__tests__/serialization.spec.ts`
Expected: PASS

- [ ] **Step 5: 补边界测试 — 空 frameId / 长帧 / 多帧 / 截断尾部**

```ts
// 追加到 serialization.spec.ts 的 describe 块内
  it('handles empty frameId and empty bytes', () => {
    const record = encodeFrameRecord({ capturedAt: 100, frameId: '', bytes: [] });
    const decoded = decodeFrameRecords(record);
    expect(decoded).toEqual([{ capturedAt: 100, frameId: '', bytes: [] }]);
  });

  it('decodes multiple frames in sequence', () => {
    const r1 = encodeFrameRecord({ capturedAt: 1, frameId: 'a', bytes: [1] });
    const r2 = encodeFrameRecord({ capturedAt: 2, frameId: 'b', bytes: [2, 3] });
    const decoded = decodeFrameRecords(Buffer.concat([r1, r2]));
    expect(decoded).toHaveLength(2);
    expect(decoded[1].bytes).toEqual([2, 3]);
  });

  it('discards truncated tail (incomplete record)', () => {
    const full = encodeFrameRecord({ capturedAt: 1, frameId: 'a', bytes: [1, 2] });
    const truncated = full.subarray(0, full.length - 1); // 砍掉最后 1 字节
    const decoded = decodeFrameRecords(truncated);
    expect(decoded).toEqual([]); // 整帧不完整,丢弃
  });

  it('rejects frameId or bytes exceeding uint16 max', () => {
    expect(() =>
      encodeFrameRecord({ capturedAt: 1, frameId: 'x'.repeat(0x10000), bytes: [] }),
    ).toThrow(/frameId too long/);
  });
```

- [ ] **Step 6: 跑全部测试确认通过**

Run: `cd rewrite && npx vitest run src/features/recording/__tests__/serialization.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
cd rewrite
git add src/features/recording/core/serialization.ts src/features/recording/__tests__/serialization.spec.ts
git commit -m "feat(recording): T1 二进制序列化纯函数 + 单测"
```

---

## Task 2: 共享滚动写盘工具(去重核心)

**Files:**
- Create: `rewrite/src-electron/main/shared/disk-rotation-writer.ts`

把 `storage-filter.ts:162-204` 的 `initializeWriteStream`/`checkRotation`/`cleanupOldFiles` + stream-end + `mkdirSync` + `Stats` 接口提取成参数化工具。storage-highspeed(T4)和 recording(T3)都复用它。

- [ ] **Step 1: 写工具类(无测试,主进程 fs 逻辑靠集成测试覆盖,见 T3/T4 回归)**

```ts
// rewrite/src-electron/main/shared/disk-rotation-writer.ts
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { WriteStream } from 'node:fs'

export interface RotationFileConfig {
  readonly maxFileSize: number      // 字节
  readonly enableRotation: boolean
  readonly rotationCount: number
}

export interface RotationWriterStats {
  readonly totalItemsStored: number
  readonly totalBytesStored: number
  readonly currentFileSize: number
  readonly startTime: string | null
  readonly lastTime: string | null
  readonly isActive: boolean
}

interface RotationWriterOptions {
  /** userData 下的子目录,如 'dongfanghong/recordings'。 */
  readonly subDir: string
  /** 文件名前缀,如 'rec_' 或 'business_data_'。 */
  readonly filenamePrefix: string
  /** 文件扩展名(含点),如 '.bin' 或 '.txt'。 */
  readonly extension: string
}

const DEFAULT_STATS: RotationWriterStats = {
  totalItemsStored: 0,
  totalBytesStored: 0,
  currentFileSize: 0,
  startTime: null,
  lastTime: null,
  isActive: false,
}

export class DiskRotationWriter {
  private writeStream: WriteStream | null = null
  private currentFilePath = ''
  private fileConfig: RotationFileConfig = {
    maxFileSize: 100 * 1024 * 1024,
    enableRotation: true,
    rotationCount: 5,
  }
  private stats: RotationWriterStats = { ...DEFAULT_STATS }
  private readonly storageDir: string

  constructor(private readonly options: RotationWriterOptions) {
    this.storageDir = path.join(app.getPath('userData'), options.subDir)
  }

  activate(fileConfig: RotationFileConfig): void {
    this.deactivate()
    this.fileConfig = { ...fileConfig }
    this.stats = {
      ...DEFAULT_STATS,
      startTime: new Date().toISOString(),
      isActive: true,
    }
    fs.mkdirSync(this.storageDir, { recursive: true })
    this.initializeWriteStream()
  }

  deactivate(): void {
    this.endStream()
    this.stats = { ...this.stats, isActive: false }
  }

  /** 写入一段已序列化字节 + 累加 stats + 触发滚动。返回是否触发了滚动。 */
  writeItem(serialized: Buffer | string, itemByteCount: number): boolean {
    if (!this.writeStream) return false
    const data = typeof serialized === 'string' ? serialized : serialized
    this.writeStream.write(data)
    const writtenLen = typeof data === 'string' ? Buffer.byteLength(data) : data.length
    this.stats = {
      ...this.stats,
      totalItemsStored: this.stats.totalItemsStored + 1,
      totalBytesStored: this.stats.totalBytesStored + itemByteCount,
      currentFileSize: this.stats.currentFileSize + writtenLen,
      lastTime: new Date().toISOString(),
    }
    return this.checkRotation()
  }

  getStats(): RotationWriterStats {
    return { ...this.stats }
  }

  resetStats(): void {
    this.endStream()
    if (this.currentFilePath) {
      try { fs.unlinkSync(this.currentFilePath) } catch { /* ignore */ }
      this.currentFilePath = ''
    }
    const wasActive = this.stats.isActive
    this.stats = {
      ...DEFAULT_STATS,
      isActive: wasActive,
      startTime: wasActive ? new Date().toISOString() : null,
    }
    if (wasActive) this.initializeWriteStream()
  }

  updateConfig(config: Partial<RotationFileConfig>): void {
    if (config.maxFileSize !== undefined) this.fileConfig.maxFileSize = config.maxFileSize
    if (config.enableRotation !== undefined) this.fileConfig.enableRotation = config.enableRotation
    if (config.rotationCount !== undefined) this.fileConfig.rotationCount = config.rotationCount
  }

  cleanup(): void {
    this.endStream()
    this.stats = { ...this.stats, isActive: false }
  }

  private endStream(): void {
    if (this.writeStream) {
      this.writeStream.end()
      this.writeStream = null
    }
  }

  private initializeWriteStream(): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `${this.options.filenamePrefix}${timestamp}${this.options.extension}`
    this.currentFilePath = path.join(this.storageDir, filename)
    this.writeStream = fs.createWriteStream(this.currentFilePath, { flags: 'a' })
  }

  private checkRotation(): boolean {
    if (!this.fileConfig.enableRotation) return false
    if (this.stats.currentFileSize < this.fileConfig.maxFileSize) return false
    this.endStream()
    this.cleanupOldFiles()
    this.stats = { ...this.stats, currentFileSize: 0 }
    this.initializeWriteStream()
    return true
  }

  private cleanupOldFiles(): void {
    try {
      const prefix = this.options.filenamePrefix
      const ext = this.options.extension
      const files = fs.readdirSync(this.storageDir)
        .filter(f => f.startsWith(prefix) && f.endsWith(ext))
        .map(f => ({ name: f, time: fs.statSync(path.join(this.storageDir, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time)
      const toDelete = files.slice(this.fileConfig.rotationCount)
      for (const f of toDelete) {
        try { fs.unlinkSync(path.join(this.storageDir, f.name)) } catch { /* ignore */ }
      }
    } catch { /* ignore dir read errors */ }
  }
}
```

- [ ] **Step 2: 确认 tsc 无错**

Run: `cd rewrite && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "disk-rotation-writer" || echo "no errors in new file"`
Expected: "no errors in new file"(主进程 tsconfig 若不含此路径,跳过;靠后续集成测试覆盖)

- [ ] **Step 3: Commit**

```bash
cd rewrite
git add src-electron/main/shared/disk-rotation-writer.ts
git commit -m "feat(shared): T2 提取 disk-rotation-writer 共享滚动写盘工具"
```

---

## Task 3: recording-writer(主进程,用 T2 + T1 序列化)

**Files:**
- Create: `rewrite/src-electron/main/recording-writer.ts`

包装 DiskRotationWriter,注入二进制 serializer。会话开始时写 magic 文件头。

- [ ] **Step 1: 写 recording-writer**

```ts
// rewrite/src-electron/main/recording-writer.ts
import { DiskRotationWriter, type RotationFileConfig, type RotationWriterStats } from './shared/disk-rotation-writer'
import { encodeFileHeader, encodeFrameRecord, type RecordingFrameRecord } from '@/features/recording/core/serialization'
import type { RecordingFrameInput } from '@/shared/platform-bridge'

// 主进程直接引用 src/ 下的纯函数(Electron 主进程可走别名,见 tsconfig paths)。
// 若主进程 tsconfig 不含 @/ 别名,改为相对路径 require('../../../src/features/recording/core/serialization')。

class RecordingWriterImpl {
  private writer = new DiskRotationWriter({
    subDir: 'dongfanghong/recordings',
    filenamePrefix: 'rec_',
    extension: '.bin',
  })
  private headerWritten = false

  activate(fileConfig: RotationFileConfig): void {
    this.writer.activate(fileConfig)
    // 每个新文件写 magic 头
    this.writer.writeItem(encodeFileHeader(), 0)
    this.headerWritten = true
  }

  deactivate(): void {
    this.writer.deactivate()
    this.headerWritten = false
  }

  // 入参用 RecordingFrameInput(与 IPC bridge 类型一致,T5 定义),内部转 RecordingFrameRecord 序列化。
  writeFrames(frames: readonly RecordingFrameInput[]): void {
    if (!this.headerWritten) return
    for (const f of frames) {
      const record: RecordingFrameRecord = { capturedAt: f.capturedAt, frameId: f.frameId, bytes: f.bytes }
      const buf = encodeFrameRecord(record)
      this.writer.writeItem(buf, f.bytes.length)
    }
  }

  getStats(): RotationWriterStats {
    return this.writer.getStats()
  }

  resetStats(): void {
    this.writer.resetStats()
    if (this.headerWritten) {
      this.writer.writeItem(encodeFileHeader(), 0)
    }
  }

  updateConfig(config: Partial<RotationFileConfig>): void {
    this.writer.updateConfig(config)
  }

  cleanup(): void {
    this.writer.cleanup()
    this.headerWritten = false
  }
}

export const recordingWriter = new RecordingWriterImpl()
```

- [ ] **Step 2: 确认别名可用 — 检查主进程 tsconfig 是否有 @/ paths**

Run: `cd rewrite && cat tsconfig.json | grep -A5 "paths" || echo "no paths in tsconfig.json"; ls src-electron/tsconfig*.json 2>/dev/null`
- 若有 `@/*` → `src/*` 映射,无需改动。
- 若无:把 serialization 的导入改成相对路径,或确认 src-electron 有自己的 tsconfig 含 paths。按实际调整导入语句。

- [ ] **Step 3: Commit**

```bash
cd rewrite
git add src-electron/main/recording-writer.ts
git commit -m "feat(recording): T3 主进程 recording-writer(包装共享工具+二进制序列化)"
```

---

## Task 4: 重构 storage-filter 复用共享工具(消除重复 + 回归)

**Files:**
- Modify: `rewrite/src-electron/main/storage-filter.ts`

把 storage-filter 改为 compose DiskRotationWriter,保留 storage-highspeed 专有的 `shouldStore`(pattern 匹配)和 `toHexString`(serializer 注入)。**此任务必须保证 storage-highspeed 现有测试全过。**

- [ ] **Step 1: 先跑现有 storage-highspeed 测试,建立回归基线**

Run: `cd rewrite && npx vitest run src/features/storage-highspeed/ 2>&1 | tail -5`
Expected: 全 PASS。记下通过数(如 "X passed")。

- [ ] **Step 2: 重构 storage-filter.ts**

```ts
// rewrite/src-electron/main/storage-filter.ts
import {
  DiskRotationWriter,
  type RotationFileConfig,
  type RotationWriterStats,
} from './shared/disk-rotation-writer'

// storage-highspeed 沿用旧 Stats 形状(对外契约不变),内部映射到 RotationWriterStats。
interface Stats {
  totalFramesStored: number
  totalBytesStored: number
  currentFileSize: number
  storageStartTime: string | null
  lastStorageTime: string | null
  isStorageActive: boolean
}

const toStats = (s: RotationWriterStats): Stats => ({
  totalFramesStored: s.totalItemsStored,
  totalBytesStored: s.totalBytesStored,
  currentFileSize: s.currentFileSize,
  storageStartTime: s.startTime,
  lastStorageTime: s.lastTime,
  isStorageActive: s.isActive,
})

export class StorageFilter {
  private connectionId: string | null = null
  private patterns: (readonly number[])[] = []
  // 复用共享写盘工具;hex 文本行 = storage-highspeed 专有格式。
  private writer = new DiskRotationWriter({
    subDir: 'dongfanghong/business-data',
    filenamePrefix: 'business_data_',
    extension: '.txt',
  })

  activate(request: {
    readonly connectionId: string
    readonly compiledPatterns: readonly (readonly number[])[]
    readonly fileConfig: { readonly maxFileSize: number; readonly enableRotation: boolean; readonly rotationCount: number }
  }): void {
    this.deactivate()
    this.connectionId = request.connectionId
    this.patterns = [...request.compiledPatterns.map(p => [...p])]
    this.writer.activate(request.fileConfig as RotationFileConfig)
  }

  deactivate(): void {
    this.writer.deactivate()
    this.connectionId = null
    this.patterns = []
  }

  shouldStore(connectionId: string, data: Buffer | readonly number[]): boolean {
    if (!this.connectionId || this.connectionId !== connectionId) return false
    if (this.patterns.length === 0) return false
    const len = data.length
    for (const pattern of this.patterns) {
      if (len < pattern.length) continue
      let match = true
      for (let i = 0; i < pattern.length; i++) {
        if (data[i] !== pattern[i]) { match = false; break }
      }
      if (match) return true
    }
    return false
  }

  storeData(data: Buffer | readonly number[]): void {
    const hex = this.toHexString(data)
    // hex + '\n' 一行,与原格式完全一致
    this.writer.writeItem(hex + '\n', data.length)
  }

  getStats(): Stats {
    return toStats(this.writer.getStats())
  }

  resetStats(): void {
    this.writer.resetStats()
  }

  updateConfig(config: { readonly maxFileSize?: number; readonly enableRotation?: boolean; readonly rotationCount?: number }): void {
    this.writer.updateConfig(config)
  }

  cleanup(): void {
    this.writer.cleanup()
    this.connectionId = null
    this.patterns = []
  }

  private toHexString(data: Buffer | readonly number[]): string {
    if (Buffer.isBuffer(data)) return data.toString('hex').toUpperCase()
    return Buffer.from(data as readonly number[]).toString('hex').toUpperCase()
  }
}

export const storageFilter = new StorageFilter()
```

- [ ] **Step 3: 跑 storage-highspeed 测试确认无回归**

Run: `cd rewrite && npx vitest run src/features/storage-highspeed/ 2>&1 | tail -5`
Expected: 通过数与 Step 1 基线一致。若有失败,逐个排查(常见:`getStats()` 字段名映射、`resetStats` 后是否重置 startTime)。

- [ ] **Step 4: Commit**

```bash
cd rewrite
git add src-electron/main/storage-filter.ts
git commit -m "refactor(storage-highspeed): T4 重构 storage-filter 复用 disk-rotation-writer(消除重复)"
```

---

## Task 5: 平台桥 + facade + IPC + preload(主进程↔渲染通道)

**Files:**
- Modify: `rewrite/src/shared/platform-bridge.ts`
- Create: `rewrite/src/platform/recording.ts`
- Modify: `rewrite/src/platform/index.ts`
- Create: `rewrite/src-electron/main/recording-handlers.ts`
- Modify: `rewrite/src-electron/preload/index.ts`
- Modify: `rewrite/src-electron/main/index.ts`

建立 recording 的 IPC 通道(activate/deactivate/appendFrames/getStats/resetStats/updateConfig),仿 storage 的 5 方法模板。

- [ ] **Step 1: 加 RecordingBridge 类型到 platform-bridge.ts**

在 `rewrite/src/shared/platform-bridge.ts` 的 Storage bridge 类型块之后(约 line 223 后)加:

```ts
// --- Recording bridge types ---
// 实时录制:接收帧原始字节落盘(独立路径,不走 storage-local records,见 D013)。
// activate 开始一个录制 session(开新 .bin 文件 + 写 magic 头),
// appendFrames 追加帧,达到 maxFileSize 滚动。
//
// 注意:RecordingFrameInput 的领域定义在 features/recording/core/types.ts(T6),
// 这里 re-export 保持单一类型源(shared 层不能依赖 feature,故用结构等价的本地定义 + 注释指明)。

export interface RecordingFrameInput {
  readonly capturedAt: number;   // epoch 秒
  readonly frameId: string;
  readonly bytes: readonly number[];
}

export interface RecordingActivateRequest {
  readonly fileConfig: {
    readonly maxFileSize: number;
    readonly enableRotation: boolean;
    readonly rotationCount: number;
  };
}

export interface RecordingStats {
  readonly totalFramesStored: number;
  readonly totalBytesStored: number;
  readonly currentFileSize: number;
  readonly storageStartTime: string | null;
  readonly lastStorageTime: string | null;
  readonly isStorageActive: boolean;
}

export interface RecordingConfigUpdate {
  readonly maxFileSize?: number;
  readonly enableRotation?: boolean;
  readonly rotationCount?: number;
}

export interface RecordingBridge {
  activate(request: RecordingActivateRequest): Promise<{ readonly ok: boolean; readonly error?: string }>;
  deactivate(): Promise<{ readonly ok: boolean; readonly error?: string }>;
  appendFrames(frames: readonly RecordingFrameInput[]): Promise<{ readonly ok: boolean; readonly error?: string }>;
  getStats(): Promise<RecordingStats>;
  reset(): Promise<{ readonly ok: boolean; readonly error?: string }>;
  updateConfig(config: RecordingConfigUpdate): Promise<{ readonly ok: boolean; readonly error?: string }>;
}
```

并把 `recording?: RecordingBridge;` 加进 `RewritePlatformBridge` 接口(line 242-250),紧跟 `storage?: StorageBridge;` 之后。

- [ ] **Step 2: 创建 platform/recording.ts facade**

```ts
// rewrite/src/platform/recording.ts
import type {
  RecordingBridge,
  RecordingFrameInput,
  RecordingActivateRequest,
  RecordingStats,
  RecordingConfigUpdate,
} from '@/shared/platform-bridge'

export type { RecordingBridge, RecordingFrameInput, RecordingActivateRequest, RecordingStats, RecordingConfigUpdate }

export interface RecordingPlatformFacade {
  activate(request: RecordingActivateRequest): Promise<{ readonly ok: boolean; readonly error?: string }>
  deactivate(): Promise<{ readonly ok: boolean; readonly error?: string }>
  appendFrames(frames: readonly RecordingFrameInput[]): Promise<{ readonly ok: boolean; readonly error?: string }>
  getStats(): Promise<RecordingStats>
  reset(): Promise<{ readonly ok: boolean; readonly error?: string }>
  updateConfig(config: RecordingConfigUpdate): Promise<{ readonly ok: boolean; readonly error?: string }>
}

export function createRecordingFacade(bridge: RecordingBridge): RecordingPlatformFacade {
  return {
    activate: (request) => bridge.activate(request),
    deactivate: () => bridge.deactivate(),
    appendFrames: (frames) => bridge.appendFrames(frames),
    getStats: () => bridge.getStats(),
    reset: () => bridge.reset(),
    updateConfig: (config) => bridge.updateConfig(config),
  }
}
```

- [ ] **Step 3: platform/index.ts 加 getRecordingFacade(仿 getStorageFacade)**

在 `rewrite/src/platform/index.ts`:
- import 加 `RecordingBridge`(到 platform-bridge 的 import 列表)和 `createRecordingFacade, type RecordingPlatformFacade`。
- 文件末尾(仿 line 111-123 的 storage 块)加:

```ts
let cachedRecordingFacade: RecordingPlatformFacade | null = null;

export function getRecordingFacade(): RecordingPlatformFacade | null {
  if (cachedRecordingFacade) return cachedRecordingFacade;
  const bridge = getBridge();
  if (!bridge?.recording) return null;
  cachedRecordingFacade = createRecordingFacade(bridge.recording as RecordingBridge);
  return cachedRecordingFacade;
}

export function resetRecordingFacade(): void {
  cachedRecordingFacade = null;
}
```

并加 `export type { RecordingPlatformFacade } from './recording';`

- [ ] **Step 4: 创建 recording-handlers.ts(主进程 IPC)**

```ts
// rewrite/src-electron/main/recording-handlers.ts
import { ipcMain } from 'electron'
import { recordingWriter } from './recording-writer'
import type { RecordingFrameInput } from '@/shared/platform-bridge'

const IPC_RECORDING_ACTIVATE = 'recording:activate'
const IPC_RECORDING_DEACTIVATE = 'recording:deactivate'
const IPC_RECORDING_APPEND = 'recording:append'
const IPC_RECORDING_GET_STATS = 'recording:get-stats'
const IPC_RECORDING_RESET = 'recording:reset'
const IPC_RECORDING_UPDATE_CONFIG = 'recording:update-config'

function ok(): { ok: boolean; error?: string } { return { ok: true } }
function fail(err: unknown): { ok: boolean; error?: string } {
  return { ok: false, error: err instanceof Error ? err.message : String(err) }
}

function handleActivate(
  _e: Electron.IpcMainInvokeEvent,
  request: { readonly fileConfig: { readonly maxFileSize: number; readonly enableRotation: boolean; readonly rotationCount: number } },
): { ok: boolean; error?: string } {
  try { recordingWriter.activate(request.fileConfig); return ok() } catch (err) { return fail(err) }
}

function handleDeactivate(): { ok: boolean; error?: string } {
  try { recordingWriter.deactivate(); return ok() } catch (err) { return fail(err) }
}

function handleAppend(
  _e: Electron.IpcMainInvokeEvent,
  frames: readonly RecordingFrameInput[],
): { ok: boolean; error?: string } {
  try { recordingWriter.writeFrames(frames); return ok() } catch (err) { return fail(err) }
}

function handleGetStats() {
  return recordingWriter.getStats()
}

function handleReset(): { ok: boolean; error?: string } {
  try { recordingWriter.resetStats(); return ok() } catch (err) { return fail(err) }
}

function handleUpdateConfig(
  _e: Electron.IpcMainInvokeEvent,
  config: { readonly maxFileSize?: number; readonly enableRotation?: boolean; readonly rotationCount?: number },
): { ok: boolean; error?: string } {
  try { recordingWriter.updateConfig(config); return ok() } catch (err) { return fail(err) }
}

export function registerRecordingHandlers(): void {
  ipcMain.handle(IPC_RECORDING_ACTIVATE, handleActivate)
  ipcMain.handle(IPC_RECORDING_DEACTIVATE, handleDeactivate)
  ipcMain.handle(IPC_RECORDING_APPEND, handleAppend)
  ipcMain.handle(IPC_RECORDING_GET_STATS, handleGetStats)
  ipcMain.handle(IPC_RECORDING_RESET, handleReset)
  ipcMain.handle(IPC_RECORDING_UPDATE_CONFIG, handleUpdateConfig)
}

export function cleanupRecordingHandlers(): void {
  ipcMain.removeHandler(IPC_RECORDING_ACTIVATE)
  ipcMain.removeHandler(IPC_RECORDING_DEACTIVATE)
  ipcMain.removeHandler(IPC_RECORDING_APPEND)
  ipcMain.removeHandler(IPC_RECORDING_GET_STATS)
  ipcMain.removeHandler(IPC_RECORDING_RESET)
  ipcMain.removeHandler(IPC_RECORDING_UPDATE_CONFIG)
}
```

- [ ] **Step 5: preload 暴露 recording API**

在 `rewrite/src-electron/preload/index.ts`,仿 storage 的写法(约 line 222-238 那块,参考 contextBridge.exposeInMainWorld 暴露 storage 的模式)。加:

```ts
recording: {
  activate: (request) => ipcRenderer.invoke('recording:activate', request),
  deactivate: () => ipcRenderer.invoke('recording:deactivate'),
  appendFrames: (frames) => ipcRenderer.invoke('recording:append', frames),
  getStats: () => ipcRenderer.invoke('recording:get-stats'),
  reset: () => ipcRenderer.invoke('recording:reset'),
  updateConfig: (config) => ipcRenderer.invoke('recording:update-config', config),
},
```

(精确插入位置:找到 preload 里 `storage: { ... }` 块,在其后加 `recording` 块,确保挂在 `window[REWRITE_PLATFORM_BRIDGE_KEY]` 下。)

- [ ] **Step 6: main/index.ts 注册 + 清理 handlers**

在 `rewrite/src-electron/main/index.ts`,仿 `registerStorageHandlers()`/`cleanupStorageHandlers()`(约 line 56 注册、line 88-101 清理):
- import `registerRecordingHandlers, cleanupRecordingHandlers` from './recording-handlers'
- 在 registerStorageHandlers() 调用处后加 `registerRecordingHandlers()`
- 在 cleanup 处加 `cleanupRecordingHandlers()`
- 进程退出时调 `recordingWriter.cleanup()`(import from './recording-writer')

- [ ] **Step 7: tsc 检查 + Commit**

Run: `cd rewrite && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "recording|platform-bridge" | head; echo done`
Expected: 无新错。

```bash
cd rewrite
git add src/shared/platform-bridge.ts src/platform/recording.ts src/platform/index.ts \
  src-electron/main/recording-handlers.ts src-electron/preload/index.ts src-electron/main/index.ts
git commit -m "feat(platform): T5 recording IPC 通道(facade+bridge+handlers+preload)"
```

---

## Task 6: recording feature 主体(types/state/service/composable/barrel)

**Files:**
- Create: `rewrite/src/features/recording/core/types.ts`
- Create: `rewrite/src/features/recording/core/defaults.ts`
- Create: `rewrite/src/features/recording/core/index.ts`
- Create: `rewrite/src/features/recording/state/recording-state.ts`
- Create: `rewrite/src/features/recording/services/recording-service.ts`
- Create: `rewrite/src/features/recording/composables/use-recording.ts`
- Create: `rewrite/src/features/recording/index.ts`
- Create: `rewrite/src/features/recording/__tests__/recording-service.spec.ts`
- Create: `rewrite/src/features/recording/__tests__/recording-bridge.spec.ts`(占位,实现在 T8)

- [ ] **Step 1: 写 types.ts**

```ts
// rewrite/src/features/recording/core/types.ts
import type { RecordingStats } from '@/shared/platform-bridge'

// RecordingFrameInput 的领域定义在此处(feature 是单一类型源)。
// platform-bridge.ts 里的是结构等价副本(因 shared 层不能 import feature)。
export interface RecordingFrameInput {
  readonly capturedAt: number
  readonly frameId: string
  readonly bytes: readonly number[]
}

export interface RecordingConfig {
  /** 选录哪些接收帧(frameId 级)。空数组 = 不录任何帧。 */
  readonly selectedFrameIds: readonly string[]
  readonly maxFileSizeMb: number
  readonly enableRotation: boolean
  readonly rotationCount: number
}

export interface RecordingState {
  readonly isRecording: boolean
  readonly recordCount: number        // 本 session 已录帧数(内存计数,不等同磁盘)
  readonly sessionStartTime: number | null
  readonly stats: RecordingStats | null
}
```

- [ ] **Step 2: 写 defaults.ts**

```ts
// rewrite/src/features/recording/core/defaults.ts
import type { RecordingConfig } from './types'

export const DEFAULT_RECORDING_CONFIG: RecordingConfig = {
  selectedFrameIds: [],
  maxFileSizeMb: 100,
  enableRotation: true,
  rotationCount: 5,
}
```

- [ ] **Step 3: 写 state 容器(仿 storage-highspeed-state.ts)**

```ts
// rewrite/src/features/recording/state/recording-state.ts
import type { RecordingState, RecordingStats } from '../core'
import type { RecordingConfig } from '../core'

export interface RecordingStateContainer {
  getSnapshot(): RecordingState
  setRecording(on: boolean): RecordingState
  setRecordCount(count: number): RecordingState
  setStats(stats: RecordingStats | null): RecordingState
  reset(): RecordingState
}

export function createRecordingState(): RecordingStateContainer {
  let isRecording = false
  let recordCount = 0
  let sessionStartTime: number | null = null
  let stats: RecordingStats | null = null

  const snapshot = (): RecordingState => ({
    isRecording,
    recordCount,
    sessionStartTime,
    stats: stats ? { ...stats } : null,
  })

  return {
    getSnapshot: snapshot,
    setRecording(on) {
      isRecording = on
      if (on && sessionStartTime === null) sessionStartTime = Date.now()
      if (!on) { sessionStartTime = null; recordCount = 0 }
      return snapshot()
    },
    setRecordCount(count) {
      recordCount = count
      return snapshot()
    },
    setStats(next) {
      stats = next
      return snapshot()
    },
    reset() {
      isRecording = false
      recordCount = 0
      sessionStartTime = null
      stats = null
      return snapshot()
    },
  }
}
```

- [ ] **Step 4: 写 core/index.ts barrel**

```ts
// rewrite/src/features/recording/core/index.ts
export * from './types'
export * from './defaults'
export * from './serialization'
```

- [ ] **Step 5: 写 recording-service.ts**

```ts
// rewrite/src/features/recording/services/recording-service.ts
import type { RecordingPlatformFacade } from '@/platform/recording'
import type { RecordingFrameInput, RecordingConfig } from '../core'
import { DEFAULT_RECORDING_CONFIG } from '../core'
import type { RecordingStateContainer } from '../state/recording-state'
import { createRecordingState } from '../state/recording-state'

export interface RecordingService {
  getSnapshot(): ReturnType<RecordingStateContainer['getSnapshot']>
  /** 返回当前选中的 frameId Set(O(1) 查询),供 bridge 用。 */
  getSelectedFrameIds(): Set<string>
  isRecording(): boolean
  setConfig(config: RecordingConfig): void
  getConfig(): RecordingConfig
  start(): Promise<void>
  stop(): Promise<void>
  /** 追加帧(fire-and-forget IPC)。累加内存计数。 */
  appendFrames(frames: readonly RecordingFrameInput[]): Promise<void>
}

export interface CreateRecordingServiceOptions {
  readonly platformFacade: RecordingPlatformFacade
  readonly state?: RecordingStateContainer
}

export function createRecordingService(options: CreateRecordingServiceOptions): RecordingService {
  const state = options.state ?? createRecordingState()
  let config: RecordingConfig = { ...DEFAULT_RECORDING_CONFIG }
  // Set 缓存:config 变化时重建,避免 bridge 每帧重建 Set。
  let selectedSet = new Set(config.selectedFrameIds)

  return {
    getSnapshot: () => state.getSnapshot(),
    getSelectedFrameIds: () => selectedSet,
    isRecording: () => state.getSnapshot().isRecording,
    setConfig(next) {
      config = { ...next, selectedFrameIds: [...next.selectedFrameIds] }
      selectedSet = new Set(config.selectedFrameIds)
    },
    getConfig: () => ({ ...config, selectedFrameIds: [...config.selectedFrameIds] }),

    async start() {
      await options.platformFacade.activate({
        fileConfig: {
          maxFileSize: config.maxFileSizeMb * 1024 * 1024,
          enableRotation: config.enableRotation,
          rotationCount: config.rotationCount,
        },
      })
      state.setRecording(true)
    },

    async stop() {
      await options.platformFacade.deactivate()
      state.setRecording(false)
    },

    async appendFrames(frames) {
      if (frames.length === 0) return
      await options.platformFacade.appendFrames(frames)
      state.setRecordCount(state.getSnapshot().recordCount + frames.length)
    },
  }
}
```

- [ ] **Step 6: 写 use-recording.ts composable**

```ts
// rewrite/src/features/recording/composables/use-recording.ts
import { computed, onUnmounted, ref } from 'vue'
import type { RecordingService } from '../services/recording-service'

export function useRecording(service: RecordingService) {
  const snapshot = ref(service.getSnapshot())

  const sync = () => { snapshot.value = service.getSnapshot() }

  const isRecording = computed(() => snapshot.value.isRecording)
  const recordCount = computed(() => snapshot.value.recordCount)

  const recordElapsed = computed(() => {
    if (!snapshot.value.isRecording || !snapshot.value.sessionStartTime) return '--'
    const ms = Date.now() - snapshot.value.sessionStartTime
    if (ms < 1000) return `${ms}ms`
    if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`
    const m = Math.floor(ms / 60_000)
    const s = Math.floor((ms % 60_000) / 1000)
    return `${m}m ${s}s`
  })

  async function start() { await service.start(); sync() }
  async function stop() { await service.stop(); sync() }

  // 录制期间定时同步计数(主进程异步 append,内存计数在 service 里更新)
  let timer: ReturnType<typeof setInterval> | null = null
  function ensurePolling() {
    if (timer) return
    timer = setInterval(sync, 1000)
  }
  function stopPolling() {
    if (timer) { clearInterval(timer); timer = null }
  }
  // 简单策略:isRecording 切换时由 start/stop 控制 polling
  // (更精细可 watch isRecording,这里保持简单)
  const origStart = start
  const origStop = stop
  start = async function () { await origStart(); ensurePolling() }
  stop = async function () { await origStop(); stopPolling() }

  onUnmounted(() => stopPolling())

  return { isRecording, recordCount, recordElapsed, start, stop }
}
```

> 注意:`start`/`stop` 重新赋值在 TS strict 下需 `let`。实施时若 lint 报错,改为包装成具名函数调 ensurePolling/stopPolling。这里给出意图,实施者按 lint 调整。

- [ ] **Step 7: 写 feature index.ts barrel**

```ts
// rewrite/src/features/recording/index.ts
export * from './core'
export * from './state/recording-state'
export * from './services/recording-service'
export * from './composables/use-recording'
```

- [ ] **Step 8: 写 recording-service 测试(用 mock facade)**

```ts
// rewrite/src/features/recording/__tests__/recording-service.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { createRecordingService } from '../services/recording-service'
import type { RecordingPlatformFacade } from '@/platform/recording'

function mockFacade(): RecordingPlatformFacade {
  return {
    activate: vi.fn().mockResolvedValue({ ok: true }),
    deactivate: vi.fn().mockResolvedValue({ ok: true }),
    appendFrames: vi.fn().mockResolvedValue({ ok: true }),
    getStats: vi.fn().mockResolvedValue({
      totalFramesStored: 0, totalBytesStored: 0, currentFileSize: 0,
      storageStartTime: null, lastStorageTime: null, isStorageActive: false,
    }),
    reset: vi.fn().mockResolvedValue({ ok: true }),
    updateConfig: vi.fn().mockResolvedValue({ ok: true }),
  }
}

describe('recording-service', () => {
  it('start/stop toggles isRecording and calls facade activate/deactivate', async () => {
    const facade = mockFacade()
    const svc = createRecordingService({ platformFacade: facade })
    expect(svc.isRecording()).toBe(false)
    await svc.start()
    expect(svc.isRecording()).toBe(true)
    expect(facade.activate).toHaveBeenCalledTimes(1)
    await svc.stop()
    expect(svc.isRecording()).toBe(false)
    expect(facade.deactivate).toHaveBeenCalledTimes(1)
  })

  it('appendFrames increments recordCount and calls facade appendFrames', async () => {
    const facade = mockFacade()
    const svc = createRecordingService({ platformFacade: facade })
    await svc.appendFrames([
      { capturedAt: 1, frameId: 'a', bytes: [1] },
      { capturedAt: 2, frameId: 'b', bytes: [2] },
    ])
    expect(svc.getSnapshot().recordCount).toBe(2)
    expect(facade.appendFrames).toHaveBeenCalledTimes(1)
  })

  it('setConfig rebuilds selectedFrameIds Set for O(1) lookup', () => {
    const svc = createRecordingService({ platformFacade: mockFacade() })
    svc.setConfig({
      selectedFrameIds: ['frame-1', 'frame-2'],
      maxFileSizeMb: 50, enableRotation: true, rotationCount: 3,
    })
    const set = svc.getSelectedFrameIds()
    expect(set.has('frame-1')).toBe(true)
    expect(set.has('frame-3')).toBe(false)
  })

  it('appendFrames with empty array is a no-op (no IPC)', async () => {
    const facade = mockFacade()
    const svc = createRecordingService({ platformFacade: facade })
    await svc.appendFrames([])
    expect(facade.appendFrames).not.toHaveBeenCalled()
    expect(svc.getSnapshot().recordCount).toBe(0)
  })
})
```

- [ ] **Step 9: 跑测试 + tsc + lint + Commit**

Run: `cd rewrite && npx vitest run src/features/recording/__tests__/recording-service.spec.ts`
Expected: 4 PASS

```bash
cd rewrite
git add src/features/recording/
git commit -m "feat(recording): T6 feature 主体(types/state/service/composable)+单测"
```

---

## Task 7: DisplayPreferences 扩展 recording 配置

**Files:**
- Modify: `rewrite/src/features/display/core/types.ts`
- Modify: `rewrite/src/features/display/core/defaults.ts`
- Modify: `rewrite/src/features/display/core/normalize.ts`
- Modify: `rewrite/src/features/display/core/clone.ts`
- Modify: `rewrite/src/features/display/services/display-service.ts`

**关键:S010 教训——白名单 clone + 逐字段 normalize,加新字段必须改 4 处,否则迁移旧数据丢字段。**

- [ ] **Step 1: types.ts 加 RecordingConfig 引用 + DisplayPreferences 字段**

在 `rewrite/src/features/display/core/types.ts`:
- 顶部 import:`import type { RecordingConfig } from '@/features/recording/core/types';`
- 在 `DisplayPreferences` 接口(line 73-80)加字段:

```ts
export interface DisplayPreferences {
  readonly table1: TableDisplayPreference;
  readonly table2: TableDisplayPreference;
  readonly charts: readonly ChartInstancePreference[];
  readonly scatter: ScatterDisplayPreference;
  readonly refreshCadenceMs: number;
  readonly groups: readonly DisplayGroupConfig[];
  readonly recording: RecordingConfig;   // ★新增
}
```

- 在 `DisplayPreferencesPatch`(line 167-174)加:
```ts
  readonly recording?: RecordingConfig;
```

- [ ] **Step 2: defaults.ts 加默认 recording**

在 `rewrite/src/features/display/core/defaults.ts`,import `DEFAULT_RECORDING_CONFIG` from '@/features/recording/core/defaults',在 DEFAULT_DISPLAY.preferences(line 17-34)加:

```ts
    recording: { ...DEFAULT_RECORDING_CONFIG, selectedFrameIds: [] },
```
(放在 groups: [] 之后)

- [ ] **Step 3: normalize.ts 加 recording 归一化**

在 `rewrite/src/features/display/core/normalize.ts`,import `DEFAULT_RECORDING_CONFIG`。加一个辅助函数(仿现有 normalizeXxx 模式),并在构建 preferences 时(line 346-353)加 recording:

```ts
function normalizeRecordingConfig(
  value: unknown,
  defaults: RecordingConfig,
  issues: DisplayValidationIssue[],
): RecordingConfig {
  if (!value || typeof value !== 'object') {
    return { ...defaults, selectedFrameIds: [] }
  }
  const v = value as Record<string, unknown>
  const selectedFrameIds = Array.isArray(v.selectedFrameIds)
    ? v.selectedFrameIds.filter((x): x is string => typeof x === 'string')
    : []
  return {
    selectedFrameIds,
    maxFileSizeMb: typeof v.maxFileSizeMb === 'number' && v.maxFileSizeMb > 0 ? v.maxFileSizeMb : defaults.maxFileSizeMb,
    enableRotation: typeof v.enableRotation === 'boolean' ? v.enableRotation : defaults.enableRotation,
    rotationCount: typeof v.rotationCount === 'number' && v.rotationCount >= 0 ? v.rotationCount : defaults.rotationCount,
  }
}
```

在 `normalizeDisplaySnapshot` 构建 preferences 时加:
```ts
    recording: normalizeRecordingConfig(value.recording, defaults.recording, issues),
```

- [ ] **Step 4: clone.ts 加 recording clone**

在 `rewrite/src/features/display/core/clone.ts`,import `RecordingConfig`。加:
```ts
export function cloneRecordingConfig(config: RecordingConfig): RecordingConfig {
  return {
    selectedFrameIds: [...config.selectedFrameIds],
    maxFileSizeMb: config.maxFileSizeMb,
    enableRotation: config.enableRotation,
    rotationCount: config.rotationCount,
  }
}
```
在 `cloneDisplayPreferences`(line 68-77)加 `recording: cloneRecordingConfig(pref.recording),`

- [ ] **Step 5: display-service.ts 加 recording accessor**

在 `rewrite/src/features/display/services/display-service.ts`,加两个方法(仿现有 updatePreferences 模式):
```ts
  getRecordingConfig(): RecordingConfig { return cloneRecordingConfig(this.snapshot.preferences.recording) }
  setRecordingConfig(config: RecordingConfig): void {
    this.updatePreferences({ recording: config })
  }
```
(精确位置:找到 DisplayService 接口和实现的 getter/setter 区,加在 scatter getter 附近。import cloneRecordingConfig + RecordingConfig。)

- [ ] **Step 6: 跑 display 测试确认无回归 + 加 recording 迁移测试**

Run: `cd rewrite && npx vitest run src/features/display/ 2>&1 | tail -5`
Expected: 全 PASS(原有数不变)。

加一个迁移测试,确认旧 snapshot(无 recording 字段)能被 normalize 补默认:
```ts
// 追加到 display core 的 normalize 测试文件(找现有 normalize.spec.ts)
it('normalizes legacy snapshot without recording field (adds default)', () => {
  const legacy = {
    schemaVersion: 2,
    preferences: {
      table1: { displayMode: 'table', selectedGroupId: '', selectedItems: [] },
      table2: { displayMode: 'table', selectedGroupId: '', selectedItems: [] },
      charts: [], scatter: { iSource: {groupId:'',dataItemId:''}, qSource: {groupId:'',dataItemId:''}, sampleCount: 256, bitWidth: 8, refreshIntervalMs: 2000, pointSize: 4 },
      refreshCadenceMs: 500, groups: [],
      // 注意:无 recording 字段(模拟旧数据)
    },
    projection: { table1Rows: [], table2Rows: [], scatter: { points: [], sampleCount: 0 } },
    availability: { available: false, reason: 'no-source' },
  }
  const result = normalizeDisplaySnapshot(legacy, createDefaultDisplaySnapshot())
  expect(result.snapshot.preferences.recording).toBeDefined()
  expect(result.snapshot.preferences.recording.selectedFrameIds).toEqual([])
})
```

- [ ] **Step 7: tsc + lint + Commit**

Run: `cd rewrite && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "display|recording" | head; echo done`

```bash
cd rewrite
git add src/features/display/
git commit -m "feat(display): T7 DisplayPreferences 扩展 recording 配置(4处白名单同步)"
```

---

## Task 8: recording-bridge + runtime 接线(routing-tick 采集)

**Files:**
- Create: `rewrite/src/runtime/bridges/recording-bridge.ts`
- Create: `rewrite/src/features/recording/__tests__/recording-bridge.spec.ts`
- Modify: `rewrite/src/runtime/feature-wiring.ts`
- Modify: `rewrite/src/runtime/routing-tick.ts`
- Modify: `rewrite/src/runtime/index.ts`

**S015 红线:bridge.collect 必须在录制关时 O(1) 早退;不能在 routingTick 里写盘。**

- [ ] **Step 1: 写 recording-bridge(先写逻辑)**

```ts
// rewrite/src/runtime/bridges/recording-bridge.ts
import type { ReceiveBatchOutcome } from '@/features/receive'
import type { RecordingService } from '@/features/recording/services/recording-service'
import type { RecordingFrameInput } from '@/features/recording/core'

export class RecordingBridge {
  constructor(private readonly recordingService: RecordingService) {}

  /**
   * 从 routingTick 的 outcomes 采集选中帧的原始字节。
   * 录制关时 O(1) 早退(几乎零开销)。写盘由 service 通过 IPC 在主进程做,renderer 只 fire-and-forget。
   */
  collect(outcomes: readonly ReceiveBatchOutcome[]): void {
    if (!this.recordingService.isRecording()) return   // ★ O(1) 早退,S015 守约
    const selected = this.recordingService.getSelectedFrameIds()
    if (selected.size === 0) return

    const frames: RecordingFrameInput[] = []
    for (const outcome of outcomes) {
      if (outcome.kind !== 'matched') continue
      if (!outcome.matchedFrame) continue
      if (!selected.has(outcome.matchedFrame.frameId)) continue
      const bytes = outcome.input?.bytes
      if (!bytes || bytes.length === 0) continue
      frames.push({
        capturedAt: Math.floor(Date.now() / 1000),
        frameId: outcome.matchedFrame.frameId,
        bytes,
      })
    }
    if (frames.length > 0) {
      // fire-and-forget:不等 IPC 返回,不阻塞 routingTick
      void this.recordingService.appendFrames(frames)
    }
  }
}
```

- [ ] **Step 2: 写 bridge 测试(mock outcomes + mock service)**

```ts
// rewrite/src/features/recording/__tests__/recording-bridge.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { RecordingBridge } from '@/runtime/bridges/recording-bridge'
import type { RecordingService } from '@/features/recording/services/recording-service'
import type { ReceiveBatchOutcome } from '@/features/receive'

function mockService(opts: { recording: boolean; selected: string[] }): RecordingService {
  const selectedSet = new Set(opts.selected)
  return {
    isRecording: () => opts.recording,
    getSelectedFrameIds: () => selectedSet,
    appendFrames: vi.fn().mockResolvedValue(undefined),
  } as unknown as RecordingService
}

function matchedOutcome(frameId: string, bytes: number[]): ReceiveBatchOutcome {
  return {
    kind: 'matched',
    matchedFrame: { frameId, frameName: frameId, byteLength: bytes.length, fieldCount: 1 },
    input: { bytes, receivedAt: '', source: { sourceId: 's' }, sequence: 0, referenceVersion: 0 },
    fields: [],
    issues: [],
    statsDelta: {} as never,
  } as unknown as ReceiveBatchOutcome
}

describe('RecordingBridge.collect', () => {
  it('returns immediately (no append) when recording is off', () => {
    const svc = mockService({ recording: false, selected: ['f1'] })
    const bridge = new RecordingBridge(svc)
    bridge.collect([matchedOutcome('f1', [1, 2])])
    expect(svc.appendFrames).not.toHaveBeenCalled()
  })

  it('returns when selected set is empty', () => {
    const svc = mockService({ recording: true, selected: [] })
    const bridge = new RecordingBridge(svc)
    bridge.collect([matchedOutcome('f1', [1])])
    expect(svc.appendFrames).not.toHaveBeenCalled()
  })

  it('collects only selected matched frames with bytes', () => {
    const svc = mockService({ recording: true, selected: ['f1'] })
    const bridge = new RecordingBridge(svc)
    bridge.collect([
      matchedOutcome('f1', [1, 2]),     // 命中
      matchedOutcome('f2', [3]),         // 未选中
      matchedOutcome('f1', []),          // 命中但空 bytes,跳过
    ])
    expect(svc.appendFrames).toHaveBeenCalledTimes(1)
    const arg = (svc.appendFrames as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg).toHaveLength(1)
    expect(arg[0].frameId).toBe('f1')
  })

  it('skips non-matched outcomes', () => {
    const svc = mockService({ recording: true, selected: ['f1'] })
    const bridge = new RecordingBridge(svc)
    const unmatched = { kind: 'no-match', issues: [] } as unknown as ReceiveBatchOutcome
    bridge.collect([unmatched, matchedOutcome('f1', [1])])
    expect(svc.appendFrames).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: 跑 bridge 测试**

Run: `cd rewrite && npx vitest run src/features/recording/__tests__/recording-bridge.spec.ts`
Expected: 4 PASS

- [ ] **Step 4: feature-wiring.ts 接线(L0,数据流动前建好)**

在 `rewrite/src/runtime/feature-wiring.ts`:
- import `createRecordingService` + `RecordingService` from '@/features/recording'
- import `getRecordingFacade` from '@/platform'(或现有 platform import 块)
- import `RecordingBridge` from './bridges/recording-bridge'
- `RewriteWiredFeatures` 接口加 `readonly recordingService: RecordingService;` 和 `readonly recordingBridge: RecordingBridge;`
- 在 wireFeatures 里(L0 层,约 line 114 storageService 之后)加:

```ts
  const recordingFacade = getRecordingFacade();
  const recordingService = createRecordingService({
    platformFacade: recordingFacade ?? {
      // 无 facade(测试/非 Electron)时的 stub,appendFrames 静默丢弃
      activate: async () => ({ ok: false, error: 'Recording facade not available' }),
      deactivate: async () => ({ ok: false, error: 'Recording facade not available' }),
      appendFrames: async () => ({ ok: false, error: 'Recording facade not available' }),
      getStats: async () => ({
        totalFramesStored: 0, totalBytesStored: 0, currentFileSize: 0,
        storageStartTime: null, lastStorageTime: null, isStorageActive: false,
      }),
      reset: async () => ({ ok: false, error: 'Recording facade not available' }),
      updateConfig: async () => ({ ok: false, error: 'Recording facade not available' }),
    },
  });
  const recordingBridge = new RecordingBridge(recordingService);
```
- return 对象加 `recordingService, recordingBridge,`

- [ ] **Step 5: routing-tick.ts 加 collect 调用**

在 `rewrite/src/runtime/routing-tick.ts`,在 `fanOutToDisplay` 之后、构造 matchInputs 之前(line 136 之后)加一行:

```ts
  // H013/S012:录制采集——独立路径,不碰 storage-local(D013)。录制关时 O(1) 早退。
  features.recordingBridge.collect(receiveOutcome.outcomes);
```

- [ ] **Step 6: runtime/index.ts teardown 加 stopRecording**

在 `rewrite/src/runtime/index.ts`,找到 teardown/destroy 逻辑(约 line 204 调 highSpeedStorageService.deactivate() 处),加:

```ts
    await features.recordingService.stop().catch(() => { /* teardown best-effort */ });
```

- [ ] **Step 7: 跑 routing-tick 测试确认无回归**

Run: `cd rewrite && npx vitest run src/runtime/__tests__/routing-tick.spec.ts 2>&1 | tail -5`
Expected: 全 PASS(原有数不变。注意:routing-tick 测试若用 mock features,需补 recordingBridge.collect 的 mock,否则会报 undefined。见 Step 8。)

- [ ] **Step 8: 若 Step 7 因缺 mock 失败,补 routing-tick 测试的 mock**

找到 routing-tick 测试里构造 mock features 的 helper(可能在 `src/runtime/__tests__/helpers.ts`),给 mock features 加:
```ts
  recordingBridge: { collect: vi.fn() },
  recordingService: { stop: vi.fn().mockResolvedValue(undefined), isRecording: () => false, getSelectedFrameIds: () => new Set(), appendFrames: vi.fn() },
```
并加一个回归测试:routingTick 在 features 无 recordingBridge 时(或录制关时)不崩,collect 被调用但 appendFrames 不被调。

- [ ] **Step 9: Commit**

```bash
cd rewrite
git add src/runtime/bridges/recording-bridge.ts src/features/recording/__tests__/recording-bridge.spec.ts \
  src/runtime/feature-wiring.ts src/runtime/routing-tick.ts src/runtime/index.ts \
  src/runtime/__tests__/helpers.ts
git commit -m "feat(runtime): T8 recording-bridge + routing-tick 采集接线(O(1)早退守 S015)"
```

---

## Task 9: RecordingConfigDialog + FrameSelector 多选

**Files:**
- Modify: `rewrite/src/features/frame/components/FrameSelector.vue`
- Create: `rewrite/src/features/recording/components/RecordingConfigDialog.vue`

- [ ] **Step 1: FrameSelector 扩展多选模式**

在 `rewrite/src/features/frame/components/FrameSelector.vue`,改 props 支持 `string[]` modelValue:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { FrameDirection } from '../core';
import type { FrameAssetService } from '../services';

const props = withDefaults(defineProps<{
  readonly frameService: FrameAssetService;
  // 多选模式:modelValue 为 string[];单选:string | null。用 multiple prop 区分。
  readonly modelValue: string[] | string | null;
  readonly multiple?: boolean;
  readonly direction?: FrameDirection;
  readonly label?: string;
  readonly disable?: boolean;
}>(), {
  multiple: false,
  direction: undefined,
  label: '帧格式',
  disable: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string[] | string | null];
}>();

const selected = computed({
  get: () => props.modelValue,
  set: (val) => {
    if (val === null) emit('update:modelValue', props.multiple ? [] : null);
    else emit('update:modelValue', val);
  },
});

const frameOptions = computed(() =>
  props.frameService.listFrames({ direction: props.direction }).map((f) => ({
    value: f.id,
    label: f.name,
  })),
);
</script>

<template>
  <q-select
    v-model="selected"
    :options="frameOptions"
    :disable="disable"
    :label="label"
    :multiple="multiple"
    :use-chips="multiple"
    outlined
    dense
    emit-value
    map-options
    clearable
    class="w-full"
  >
    <template #prepend>
      <q-icon name="o_data_object" size="xs" />
    </template>
    <template #no-option>
      <div class="p-2 rw-text-desc">暂无可用帧,请先创建帧定义</div>
    </template>
  </q-select>
</template>
```

> 注意:原单选调用方(modelValue: string | null)不受影响——multiple 默认 false。但要回归测试现有调用方(AdvancedConfigPanel / TaskEditDialog / SendStepEditor)不报错。

- [ ] **Step 2: 写 RecordingConfigDialog.vue**

```vue
<!-- rewrite/src/features/recording/components/RecordingConfigDialog.vue -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import type { FrameAssetService } from '@/features/frame';
import type { RecordingConfig } from '../core';
import FrameSelector from '@/features/frame/components/FrameSelector.vue';

const props = defineProps<{
  readonly modelValue: boolean;
  readonly config: RecordingConfig;
  readonly frameService: FrameAssetService;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'apply': [config: RecordingConfig];
}>();

// 本地编辑副本,确定时才 emit apply(D003 单次 emit 原则)
const local = ref<RecordingConfig>({ ...props.config, selectedFrameIds: [...props.config.selectedFrameIds] });

watch(() => props.config, (c) => {
  local.value = { ...c, selectedFrameIds: [...c.selectedFrameIds] };
});

function onOk() {
  emit('apply', { ...local.value, selectedFrameIds: [...local.value.selectedFrameIds] });
  emit('update:modelValue', false);
}
function onCancel() {
  emit('update:modelValue', false);
}
</script>

<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <q-card class="rw-dialog-card" style="min-width: 420px">
      <q-card-section class="rw-dialog-header">录制设置</q-card-section>
      <q-card-section class="column gap-3">
        <FrameSelector
          v-model="local.selectedFrameIds"
          :frame-service="frameService"
          :multiple="true"
          direction="receive"
          label="录制的接收帧"
        />
        <q-expansion-item label="滚动设置(高级)" dense-toggle default-closed>
          <div class="column gap-2 q-pa-sm">
            <div class="row items-center gap-2">
              <span class="rw-text-label">单文件上限(MB)</span>
              <q-input v-model.number="local.maxFileSizeMb" type="number" dense outlined min="1" />
            </div>
            <div class="row items-center gap-2">
              <span class="rw-text-label">保留文件数</span>
              <q-input v-model.number="local.rotationCount" type="number" dense outlined min="0" />
            </div>
            <q-toggle v-model="local.enableRotation" label="启用滚动" />
          </div>
        </q-expansion-item>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="取消" @click="onCancel" />
        <q-btn unelevated color="primary" label="确定" @click="onOk" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
```

- [ ] **Step 3: 跑 frame 现有测试确认 FrameSelector 改动无回归**

Run: `cd rewrite && npx vitest run src/features/frame/ 2>&1 | tail -5`
Expected: 全 PASS

- [ ] **Step 4: tsc + lint + Commit**

```bash
cd rewrite
git add src/features/frame/components/FrameSelector.vue src/features/recording/components/RecordingConfigDialog.vue
git commit -m "feat(recording): T9 RecordingConfigDialog + FrameSelector 多选(只列接收帧)"
```

---

## Task 10: DisplayPage 接线 + 删内联录制

**Files:**
- Modify: `rewrite/src/pages/DisplayPage.vue`

删 `:426-470` 内联录制 + `:485-487` onUnmounted(stopRecording),改用 useRecording + RecordingConfigDialog。设置钮放录制钮右边。

- [ ] **Step 1: 删内联录制代码块**

删除 `rewrite/src/pages/DisplayPage.vue` 的 `:426-470`(从 `// ===== Recording (inline composable, D2) =====` 到 `stopRecording` 函数结束),以及 `onUnmounted(() => { stopRecording() })`(约 :485-487)。

- [ ] **Step 2: 加 useRecording + dialog 引用**

在 DisplayPage `<script setup>` 顶部加:
```ts
import { useRecording } from '@/features/recording';
import RecordingConfigDialog from '@/features/recording/components/RecordingConfigDialog.vue';
// runtime 已在文件里(const runtime = useRewriteRuntime())
const recordingService = runtime.features.recordingService;
const { isRecording, recordCount, recordElapsed, start, stop } = useRecording(recordingService);

const recordingConfigOpen = ref(false);
const recordingConfig = ref(recordingService.getConfig());

// 录制开始前确保 config 已从 display preferences 同步到 service
watch(() => recordingConfig.value, (c) => {
  recordingService.setConfig(c);
}, { deep: true });

function openRecordingConfig() {
  recordingConfig.value = recordingService.getConfig();
  recordingConfigOpen.value = true;
}
function applyRecordingConfig(c: RecordingConfig) {
  recordingConfig.value = c;
  // 同时落盘到 DisplayPreferences(持久化)
  runtime.features.displayService.setRecordingConfig(c);
}
```
(import `RecordingConfig` type, `watch` 若未 import 则加)

- [ ] **Step 3: 改底栏 UI — 设置钮在录制钮右边**

替换 `:544-575` 的底栏录制控件块:

```vue
    <!-- Bottom bar: recording controls + 统计指标(同一行) -->
    <div class="display-page__bottom-bar mt-3">
      <div class="flex items-center gap-3">
        <q-btn
          v-if="!isRecording"
          color="negative"
          round
          dense
          icon="fiber_manual_record"
          size="sm"
          @click="start"
        >
          <q-tooltip>开始录制</q-tooltip>
        </q-btn>
        <q-btn
          v-else
          color="grey"
          round
          dense
          icon="stop"
          size="sm"
          @click="stop"
        >
          <q-tooltip>停止录制</q-tooltip>
        </q-btn>
        <q-btn round dense flat icon="tune" size="sm" @click="openRecordingConfig">
          <q-tooltip>录制设置</q-tooltip>
        </q-btn>
        <template v-if="isRecording">
          <q-badge color="negative" outline class="recording-indicator">
            REC {{ recordElapsed }}
          </q-badge>
          <span class="rw-text-desc">{{ recordCount }} 帧</span>
        </template>
      </div>
      <!-- 现有 stat 块不动 -->
      <div class="display-page__bottom-stats flex items-center">
        ...
      </div>
    </div>

    <RecordingConfigDialog
      v-model="recordingConfigOpen"
      :config="recordingConfig"
      :frame-service="runtime.features.frameService"
      @apply="applyRecordingConfig"
    />
```

- [ ] **Step 4: 启动时从 DisplayPreferences 同步 config 到 service**

在 onMounted 里(约 :473-483)加:
```ts
  // 启动时把持久化的 recording config 灌进 service
  recordingService.setConfig(runtime.features.displayService.getRecordingConfig());
  recordingConfig.value = recordingService.getConfig();
```

- [ ] **Step 5: 跑 display page 相关测试 + 手测确认**

Run: `cd rewrite && npx vitest run src/features/display/ src/pages/ 2>&1 | tail -5`
Expected: 全 PASS

- [ ] **Step 6: tsc + lint + Commit**

```bash
cd rewrite
git add src/pages/DisplayPage.vue
git commit -m "feat(display): T10 DisplayPage 接入 useRecording + 设置弹窗,删内联录制(治诉求①)"
```

---

## Task 11: 持久化 RecordingConfig(跨会话记住选帧)

**Files:**
- Modify: `rewrite/src/runtime/persistence.ts`
- Modify: `rewrite/src/app/rewriteRuntime.ts`

DisplayPreferences 已含 recording(T7),DisplayPreferences 本身走持久化路径。此任务确认 persistence 保存/加载 DisplayPreferences 时 recording 字段不被丢,并处理 schema 版本(若需迁移)。

- [ ] **Step 1: 确认 DisplayPreferences 持久化路径**

Read `rewrite/src/runtime/persistence.ts` 找 display preferences 的 save/load(约 line 107-111 storage-highspeed 附近)。确认它存的是整个 `displayService.getSnapshot().preferences` —— 若是,recording 字段自动跟着存。

- [ ] **Step 2: 若 persistence 只存部分字段(白名单),补 recording**

若发现 persistence 显式列出 display preferences 字段(白名单),加 recording:
```ts
  recording: snapshot.preferences.recording,
```
若它存整个 preferences 对象(深拷贝),则无需改——recording 已在 normalize(T7)里被补默认。

- [ ] **Step 3: rewriteRuntime.ts 启动 hydrate 确认**

Read `rewrite/src/app/rewriteRuntime.ts` 找 display preferences hydrate(约 line 136-141 storage-highspeed restore 附近)。确认 hydrate 后调 `normalizeDisplaySnapshot`(T7 的迁移逻辑会补 recording 默认)。

- [ ] **Step 4: 加 hydrate 集成测试 — 旧持久化文件(无 recording)能被加载**

```ts
// 追加到合适的 bootstrap/persistence 集成测试
it('loads legacy display preferences (no recording) and backfills default recording config', async () => {
  // 模拟旧持久化:preferences 无 recording 字段
  // 调 hydrate → 确认 displayService.getRecordingConfig() 返回默认(非 undefined)
})
```

- [ ] **Step 5: 跑测试 + Commit**

Run: `cd rewrite && npx vitest run src/runtime/__tests__/ src/app/ 2>&1 | tail -5`

```bash
cd rewrite
git add src/runtime/persistence.ts src/app/rewriteRuntime.ts src/runtime/__tests__/
git commit -m "feat(runtime): T11 持久化 RecordingConfig(跨会话记住选帧)"
```

---

## Task 12: 全量回归 + 目标机实测 + 治理落档

**Files:**
- Modify: `.sessions/2026-06-11-display-group-management/topic-index.md`(治理落档前先读 session-governance)

- [ ] **Step 1: 全量测试回归**

Run: `cd rewrite && npx vitest run 2>&1 | tail -15`
Expected: 无新增失败(基线失败除外)。特别注意:
- storage-highspeed 全过(T4 重构回归)
- recording 新测试全过(T1/T6/T8)
- display 全过(T7/T10)
- routing-tick 全过(T8)

- [ ] **Step 2: tsc + lint 全量**

Run: `cd rewrite && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -5; npx eslint src/ src-electron/ 2>&1 | tail -10`
Expected: tsc src 0 新错;lint 0 新增 error。

- [ ] **Step 3: ⚠️ 目标 Linux 机实测卡顿(S015 验收红线)**

> 这一步必须由用户在目标机(银河麒麟)执行,不能仅凭 vitest 声称完成。

实测脚本:
1. 启动 App,连上真实数据源(串口/TCP/UDP)。
2. 开浏览器 devtools Performance,录制 30s routingTick。
3. **录制关**:观察 routingTick 耗时基线(应与重构前一致,collect 第一行 O(1) 早退)。
4. **录制开**(选 1-2 个接收帧):观察 routingTick 耗时是否显著上升;观察 `[routingTick] slow over 5s` warn 是否出现。
5. 录制期间切到别的页面再切回,确认录制仍在继续(REC 计时/帧数不重置)。
6. 停止录制,检查 `{userData}/dongfanghong/recordings/` 下有 `.bin` 文件,且大小合理。
7. 关 App 重开,确认 `.bin` 文件还在(落盘验证)。

**若实测发现卡顿**:记录 trace,用 `analyze-perf.py` 消化,定位是 collect 还是 IPC appendFrames 的问题,回到 T8 优化(如攒批减 IPC、或移采集到主进程)。**不要在未实测的情况下声称完成。**

- [ ] **Step 4: 治理落档(先读 session-governance skill)**

按 session-governance 规范,在 `.sessions/2026-06-11-display-group-management/` 新建 `S012-realtime-recording-redesign.md`,更新 `topic-index.md`(加 S012 进展线索 + 当前位置),用户原话记 `voice.md`。若有架构/数据模型决策(二进制格式、独立路径、采集点),落 `decisions.md` 新建 D###。

⚠️ 落档前重读 session-governance skill 的 Trigger 规范,确认 S012/D### 编号、topic-index 格式正确。

- [ ] **Step 5: 最终 Commit**

```bash
git add .sessions/2026-06-11-display-group-management/
git commit -m "docs(session): S012 实时录制重设计落档 + D### 录制架构决策"
```

---

## 验收清单(对照 spec §六.2)

- [ ] 诉求①:切走再回来录制仍在进行(T12 Step 3.5 实测)
- [ ] 诉求②③:设置弹窗只列接收帧,只录选中帧(T9/T10 + T12 实测)
- [ ] 诉求④:二进制格式显著小于整表快照(T1 格式 + T12 文件大小对比)
- [ ] 落盘:`.bin` 在 recordings 目录,重启还在(T12 Step 3.6/3.7)
- [ ] S015 红线:目标机实测不卡顿(T12 Step 3)
- [ ] tsc/lint/测试通过(T12 Step 1/2)
- [ ] storage-highspeed 重构无回归(T12 Step 1)
- [ ] 治理落档 S012 + D###(T12 Step 4)

---

## 边界红线(承 spec §六.3)

- 不碰 northbound / `_archive-legacy/` / `_wsl-claude-archive/_collection`
- 不重新引入 routingTick 无条件写盘(D013);renderer 不做数组累积/深拷贝(S015)
- History 页改造不在本 plan 范围(下一轮 spec)
- 改治理文档前重读 session-governance
- 大性能 trace 不直接读上下文,用 analyze-perf.py / analyze-longtask.py
