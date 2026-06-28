# 用例报告配置(TestReport 内容驱动)实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每个用例能配置一份报告清单(checkPoints/statisticsItems/attachItems 三类,每类有序字段项),task 跑完按清单从 DisplayService 取 displayValue 填进甲方 TestReport。

**Architecture:** 配置归 command-ingress feature(独立 `state/report-configs.json`,走 LazyHolder 同步建空壳 + bootstrap 异步 hydrate 模式);northbound 跨读(reportConfigProvider 注入)。报告内容由配置清单 + DisplayService 取值驱动,废弃 reportDataCollector 的执行链路采集方向。

**Tech Stack:** TypeScript + Vue 3 + Quasar + Vitest。纯函数 + 文件存储(原子写 + .bak),照项目既有的 task-template-file-storage / group-io / catalog-mapping 范式。

**Spec:** `rewrite/docs/superpowers/specs/2026-06-28-report-config-design.md`
**决策:** D008(decisions.md)

---

## 前置:工作树清理

当前 `main` 工作树有 ui-feature-bugs 专题的 ~17 个未提交改动(routing-tick/storage/display 等),与本特性文件不重叠但混在一起。**实施前先处理**:建议 stash 或拆 commit,确保本特性的每次 commit 干净。这些改动**不在本计划范围**,执行者只需确保 `git status` 里本计划要碰的文件没有未提交的脏改动即可。

---

## 文件结构

### 新建(command-ingress)

| 文件 | 职责 |
|------|------|
| `rewrite/src/features/command-ingress/core/report-config.ts` | ReportConfig/ReportItem 类型 + CRUD 纯函数 + isReportConfig 守卫 |
| `rewrite/src/features/command-ingress/core/__tests__/report-config.spec.ts` | 守卫 + CRUD 单测 |
| `rewrite/src/features/command-ingress/services/report-config-io.ts` | 序列化/反序列化(导入导出),version 守卫 + 逐项中文错误 |
| `rewrite/src/features/command-ingress/core/__tests__/report-config-io.spec.ts` | 导入导出单测 |
| `rewrite/src/features/command-ingress/services/report-config-file-storage.ts` | 文件存储(SCHEMA_VERSION + atomic write + .bak + hydrate) + LazyReportConfigStorage holder |
| `rewrite/src/features/command-ingress/services/__tests__/report-config-file-storage.spec.ts` | 存储单测(含 setDelegate 前后时序) |
| `rewrite/src/features/command-ingress/components/docking/ReportConfigEditor.vue` | 报告配置编辑组件(三类 + 项编辑行) |

### 修改

| 文件 | 改什么 |
|------|--------|
| `rewrite/src/features/northbound/core/test-report-generator.ts` | 加 reportConfig/displaySnapshot 入参 + 三类映射 + 取值兜底;清 :134-136 死代码 |
| `rewrite/src/features/northbound/__tests__/test-report-generator.spec.ts` | 加 reportConfig 驱动分支测试 |
| `rewrite/src/features/northbound/services/northbound-service.ts` | NorthboundServiceOptions 加 reportConfigProvider/displayFieldReader;uploadTestReportAndNotify 取配置 + displaySnapshot |
| `rewrite/src/features/northbound/__tests__/northbound-service.spec.ts` | 加 uploadTestReportAndNotify 集成测试 |
| `rewrite/src/runtime/feature-wiring.ts` | 注入 LazyReportConfigStorage holder + displayService 到 northbound |
| `rewrite/src/runtime/__tests__/helpers.ts` 或 feature-wiring 测试 | 接线测试(防 S014/S017 漏接) |
| `rewrite/src/app/rewriteRuntime.ts` | bootstrap 加 hydrateReportConfigData |
| `rewrite/src/features/command-ingress/components/docking/CatalogMappingPanel.vue` | 嵌入 ReportConfigEditor + 导入导出按钮 |
| `rewrite/src/pages/CommandIngressPage.vue` | 接 report-config 持久化回调(照 catalog 回调模式) |

---

## Task 1: ReportConfig 数据模型 + CRUD + 守卫(TDD)

**Files:**
- Create: `rewrite/src/features/command-ingress/core/report-config.ts`
- Create: `rewrite/src/features/command-ingress/core/__tests__/report-config.spec.ts`

- [ ] **Step 1: 写失败测试**

`rewrite/src/features/command-ingress/core/__tests__/report-config.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  upsertReportConfig, removeReportConfig, findReportConfig,
  createEmptyReportConfig, isReportConfig, isReportItem,
} from '../report-config';

describe('report-config', () => {
  const item = { id: 'i1', name: '载波同步锁定', frameId: 'frameA', fieldId: 'lock' };
  const config = { templateId: 'tpl1', checkPoints: [item], statisticsItems: [], attachItems: [] };

  describe('isReportConfig', () => {
    it('passes valid config', () => {
      expect(isReportConfig(config)).toBe(true);
    });
    it('rejects missing templateId', () => {
      expect(isReportConfig({ ...config, templateId: undefined })).toBe(false);
    });
    it('rejects non-array checkPoints', () => {
      expect(isReportConfig({ ...config, checkPoints: 'x' })).toBe(false);
    });
    it('rejects item with bad fieldId', () => {
      const bad = { ...config, checkPoints: [{ ...item, fieldId: 1 }] };
      expect(isReportConfig(bad)).toBe(false);
    });
    it('accepts item with optional msg', () => {
      const withMsg = { ...config, checkPoints: [{ ...item, msg: '说明' }] };
      expect(isReportConfig(withMsg)).toBe(true);
    });
  });

  describe('CRUD', () => {
    it('upsertReportConfig appends new', () => {
      const next = upsertReportConfig([], config);
      expect(next).toHaveLength(1);
      expect(next[0].templateId).toBe('tpl1');
    });
    it('upsertReportConfig replaces in place by templateId', () => {
      const updated = { ...config, checkPoints: [] };
      const next = upsertReportConfig([config], updated);
      expect(next).toHaveLength(1);
      expect(next[0].checkPoints).toEqual([]);
    });
    it('removeReportConfig by templateId', () => {
      const next = removeReportConfig([config], 'tpl1');
      expect(next).toEqual([]);
    });
    it('findReportConfig by templateId', () => {
      expect(findReportConfig([config], 'tpl1')).toEqual(config);
      expect(findReportConfig([config], 'nope')).toBeUndefined();
    });
  });

  describe('createEmptyReportConfig', () => {
    it('creates empty config for templateId', () => {
      const empty = createEmptyReportConfig('tpl1');
      expect(empty).toEqual({ templateId: 'tpl1', checkPoints: [], statisticsItems: [], attachItems: [] });
    });
  });

  describe('isReportItem', () => {
    it('rejects missing id', () => {
      expect(isReportItem({ ...item, id: undefined })).toBe(false);
    });
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `cd rewrite && npx vitest run src/features/command-ingress/core/__tests__/report-config.spec.ts`
Expected: FAIL — 模块不存在(cannot find module '../report-config')

- [ ] **Step 3: 写实现**

`rewrite/src/features/command-ingress/core/report-config.ts`:

```ts
/** 用例报告配置中的一项(检查点/统计项/附加项通用结构)。
 *  name → 甲方 checkPoint/itemName;frameId:fieldId 定位取值;msg 可选说明。
 *  三类(checkPoints/statisticsItems/attachItems)都用此结构,填报告时映射各自字段名。 */
export interface ReportItem {
  readonly id: string;       // 项唯一 id(nanoid),排序/编辑追踪用
  readonly name: string;     // 报告里这一项叫啥("载波同步锁定")
  readonly frameId: string;  // 取值的帧
  readonly fieldId: string;  // 取值的字段(取该字段的 displayValue)
  readonly msg?: string;     // 说明,可选 → 甲方 msg
}

/** 一个用例(模板)对应一份报告配置。三类与甲方 TestReport 的 checkPoints/statisticsItems/attachItems 一一对应。 */
export interface ReportConfig {
  readonly templateId: string;                     // 关联哪个 task 模板(只存 id)
  readonly checkPoints: readonly ReportItem[];     // → TestReport.checkPoints[]
  readonly statisticsItems: readonly ReportItem[]; // → TestReport.statisticsItems[]
  readonly attachItems: readonly ReportItem[];     // → TestReport.attachItems[]
}

/** 按方向移动一个类别内的项(上移/下移)。返回新数组,越界返回原数组。 */
export function moveReportItem(
  items: readonly ReportItem[],
  id: string,
  direction: 'up' | 'down',
): readonly ReportItem[] {
  const idx = items.findIndex(i => i.id === id);
  if (idx < 0) return items;
  const swap = direction === 'up' ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= items.length) return items;
  const next = [...items];
  [next[idx], next[swap]] = [next[swap], next[idx]];
  return next;
}

// --- CRUD(纯函数,返回新数组) ---

/** 新增/替换配置。已存在同 templateId → 原地替换(保持位置)。 */
export function upsertReportConfig(
  configs: readonly ReportConfig[],
  config: ReportConfig,
): ReportConfig[] {
  const idx = configs.findIndex(c => c.templateId === config.templateId);
  if (idx < 0) return [...configs, config];
  const next = [...configs];
  next[idx] = config;
  return next;
}

/** 按 templateId 删除。 */
export function removeReportConfig(
  configs: readonly ReportConfig[],
  templateId: string,
): ReportConfig[] {
  return configs.filter(c => c.templateId !== templateId);
}

/** 按 templateId 查。 */
export function findReportConfig(
  configs: readonly ReportConfig[],
  templateId: string,
): ReportConfig | undefined {
  return configs.find(c => c.templateId === templateId);
}

/** 为模板创建空配置(三类全空)。 */
export function createEmptyReportConfig(templateId: string): ReportConfig {
  return { templateId, checkPoints: [], statisticsItems: [], attachItems: [] };
}

// --- guards ---

export function isReportItem(v: unknown): v is ReportItem {
  if (v == null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.frameId === 'string' &&
    typeof o.fieldId === 'string' &&
    (o.msg === undefined || typeof o.msg === 'string')
  );
}

export function isReportConfig(v: unknown): v is ReportConfig {
  if (v == null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.templateId === 'string' &&
    Array.isArray(o.checkPoints) && o.checkPoints.every(isReportItem) &&
    Array.isArray(o.statisticsItems) && o.statisticsItems.every(isReportItem) &&
    Array.isArray(o.attachItems) && o.attachItems.every(isReportItem)
  );
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `cd rewrite && npx vitest run src/features/command-ingress/core/__tests__/report-config.spec.ts`
Expected: PASS(全部)

- [ ] **Step 5: 导出 + 类型桶**

检查 `rewrite/src/features/command-ingress/core/index.ts`(若存在 barrel),确认是否需 `export * from './report-config'`。若该目录有 index.ts 且其他 core 文件都从 index 导出,则加一行;若该目录无 index.ts(直接从文件路径导入),跳过。

Run: `cd rewrite && grep -l "export \* from './catalog-mapping'" rewrite/src/features/command-ingress/core/*.ts` 或读 index.ts 确认。

- [ ] **Step 6: Commit**

```bash
git add rewrite/src/features/command-ingress/core/report-config.ts rewrite/src/features/command-ingress/core/__tests__/report-config.spec.ts
git commit -m "feat(report-config): ReportConfig 数据模型 + CRUD + 守卫 [S018]"
```

---

## Task 2: 导入导出 IO(TDD)

**Files:**
- Create: `rewrite/src/features/command-ingress/services/report-config-io.ts`
- Create: `rewrite/src/features/command-ingress/core/__tests__/report-config-io.spec.ts`

> 注:spec 把测试放 core/__tests__,但 io 在 services 下。照项目惯例(send-instances-io.spec 在 services/__tests__),测试放 `services/__tests__/`。下面路径按此修正。

- [ ] **Step 1: 写失败测试**

`rewrite/src/features/command-ingress/services/__tests__/report-config-io.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeReportConfigs, parseReportConfigsFromJson, EXPORT_SCHEMA_VERSION } from '../report-config-io';

describe('report-config-io', () => {
  const config = {
    templateId: 'tpl1',
    checkPoints: [{ id: 'i1', name: '载波同步', frameId: 'fA', fieldId: 'lock' }],
    statisticsItems: [],
    attachItems: [],
  };

  describe('round-trip', () => {
    it('serialize then parse returns same configs', () => {
      const text = serializeReportConfigs([config]);
      const parsed = parseReportConfigsFromJson(text);
      expect(parsed).toEqual([config]);
    });
    it('serialized payload has version', () => {
      const text = serializeReportConfigs([config]);
      expect(JSON.parse(text).version).toBe(EXPORT_SCHEMA_VERSION);
    });
  });

  describe('parse errors', () => {
    it('rejects bad JSON', () => {
      expect(() => parseReportConfigsFromJson('{not json')).toThrow('JSON 格式错误');
    });
    it('rejects non-array', () => {
      expect(() => parseReportConfigsFromJson('{"version":1}')).toThrow('数组');
    });
    it('rejects item missing templateId', () => {
      expect(() => parseReportConfigsFromJson('[{"checkPoints":[]}]')).toThrow('templateId');
    });
    it('rejects item with bad checkPoints element', () => {
      const bad = JSON.stringify([{ templateId: 't', checkPoints: [{ id: 'x' }], statisticsItems: [], attachItems: [] }]);
      expect(() => parseReportConfigsFromJson(bad)).toThrow();
    });
  });

  describe('empty', () => {
    it('serialize empty array', () => {
      const text = serializeReportConfigs([]);
      expect(JSON.parse(text).configs).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `cd rewrite && npx vitest run src/features/command-ingress/services/__tests__/report-config-io.spec.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 写实现**

`rewrite/src/features/command-ingress/services/report-config-io.ts`:

```ts
import type { ReportConfig } from '../core/report-config';
import { isReportConfig } from '../core/report-config';

export const EXPORT_SCHEMA_VERSION = 1;

interface ExportPayload {
  readonly version: number;
  readonly configs: readonly ReportConfig[];
}

/** 序列化为带 version 的 JSON 字符串(导入导出文件格式)。 */
export function serializeReportConfigs(configs: readonly ReportConfig[]): string {
  const payload: ExportPayload = { version: EXPORT_SCHEMA_VERSION, configs };
  return JSON.stringify(payload, null, 2);
}

/** 从 JSON 文本解析。结构非法/字段缺失抛 Error(附人类可读中文原因);调用方 try/catch 转 notify。 */
export function parseReportConfigsFromJson(text: string): ReportConfig[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON 格式错误，无法解析');
  }
  if (data == null || typeof data !== 'object') throw new Error('内容应为配置对象');
  const payload = data as Partial<ExportPayload>;
  if (typeof payload.version !== 'number') throw new Error('缺少 version 字段');
  if (!Array.isArray(payload.configs)) throw new Error('configs 应为数组');

  const result: ReportConfig[] = [];
  for (let i = 0; i < payload.configs.length; i++) {
    const c = payload.configs[i];
    if (!isReportConfig(c)) {
      throw new Error(`第 ${i + 1} 项配置结构不合法(templateId/三类/字段项缺失或类型错误)`);
    }
    result.push(c);
  }
  return result;
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `cd rewrite && npx vitest run src/features/command-ingress/services/__tests__/report-config-io.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add rewrite/src/features/command-ingress/services/report-config-io.ts rewrite/src/features/command-ingress/services/__tests__/report-config-io.spec.ts
git commit -m "feat(report-config): 导入导出 IO(serialize/parse + version 守卫)[S018]"
```

---

## Task 3: 文件存储 + LazyHolder(TDD,含时序测试)

**Files:**
- Create: `rewrite/src/features/command-ingress/services/report-config-file-storage.ts`
- Create: `rewrite/src/features/command-ingress/services/__tests__/report-config-file-storage.spec.ts`

- [ ] **Step 1: 写失败测试**

`rewrite/src/features/command-ingress/services/__tests__/report-config-file-storage.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createReportConfigFileStorage, LazyReportConfigStorage } from '../report-config-file-storage';

function mockFiles(store: Record<string, string> = {}) {
  return {
    readTextFile: vi.fn(async (path: string) => {
      if (store[path] === undefined) throw new Error('ENOENT');
      return store[path];
    }),
    writeTextFile: vi.fn(async (path: string, content: string) => { store[path] = content; }),
  };
}

describe('createReportConfigFileStorage', () => {
  it('loadAll returns [] before hydrate', () => {
    const store = {};
    const s = createReportConfigFileStorage(mockFiles(store), '/data');
    expect(s.loadAll()).toEqual([]);
  });

  it('hydrate reads file into cache', async () => {
    const store = {
      '/data/state/report-configs.json': JSON.stringify({
        version: 1,
        configs: [{ templateId: 't', checkPoints: [], statisticsItems: [], attachItems: [] }],
      }),
    };
    const s = createReportConfigFileStorage(mockFiles(store), '/data');
    await s.hydrate();
    expect(s.loadAll()).toHaveLength(1);
    expect(s.loadAll()[0].templateId).toBe('t');
  });

  it('saveAll updates cache and writes file', async () => {
    const files = mockFiles({});
    const s = createReportConfigFileStorage(files, '/data');
    const cfg = { templateId: 't', checkPoints: [], statisticsItems: [], attachItems: [] };
    s.saveAll([cfg]);
    expect(s.loadAll()).toEqual([cfg]); // 同步见
    await Promise.resolve(); // flush microtask
    expect(files.writeTextFile).toHaveBeenCalled();
  });

  it('hydrate creates empty when file missing', async () => {
    const s = createReportConfigFileStorage(mockFiles({}), '/data');
    await s.hydrate();
    expect(s.loadAll()).toEqual([]);
  });
});

describe('LazyReportConfigStorage', () => {
  it('returns [] before setDelegate (S014/S017 温床防护)', () => {
    const lazy = new LazyReportConfigStorage();
    expect(lazy.loadAll()).toEqual([]);
    expect(lazy.getByTemplateId('any')).toBeUndefined();
  });

  it('saveAll before setDelegate does not throw', () => {
    const lazy = new LazyReportConfigStorage();
    expect(() => lazy.saveAll([])).not.toThrow();
  });

  it('delegates after setDelegate', async () => {
    const store = {
      '/data/state/report-configs.json': JSON.stringify({
        version: 1,
        configs: [{ templateId: 't', checkPoints: [], statisticsItems: [], attachItems: [] }],
      }),
    };
    const real = createReportConfigFileStorage(mockFiles(store), '/data');
    await real.hydrate();
    const lazy = new LazyReportConfigStorage();
    lazy.setDelegate(real);
    expect(lazy.loadAll()).toHaveLength(1);
    expect(lazy.getByTemplateId('t')?.templateId).toBe('t');
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `cd rewrite && npx vitest run src/features/command-ingress/services/__tests__/report-config-file-storage.spec.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 写实现**

`rewrite/src/features/command-ingress/services/report-config-file-storage.ts`:

```ts
import type { ReportConfig } from '../core/report-config';
import { isReportConfig } from '../core/report-config';
import { readJsonWithBackup, writeJsonWithBackup, type JsonReadResult } from '@/shared/utils/json-storage';

const SCHEMA_VERSION = 1;

interface PersistedPayload {
  readonly version: number;
  readonly configs: readonly ReportConfig[];
}

export interface ReportConfigFileStorageOptions {
  readonly onDataLoss?: (message: string) => void;
}

export interface FileAccess {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
}

export interface ReportConfigFileStorage {
  loadAll(): ReportConfig[];
  saveAll(configs: readonly ReportConfig[]): void;
  getByTemplateId(templateId: string): ReportConfig | undefined;
  hydrate(seed?: readonly ReportConfig[]): Promise<void>;
}

function parsePayload(value: unknown): { ok: true; configs: readonly ReportConfig[] } | { ok: false; reason: 'version-high' | 'malformed' } {
  if (value === null || typeof value !== 'object') return { ok: false, reason: 'malformed' };
  const payload = value as Partial<PersistedPayload>;
  if (typeof payload.version !== 'number' || !Array.isArray(payload.configs)) return { ok: false, reason: 'malformed' };
  if (payload.version > SCHEMA_VERSION) return { ok: false, reason: 'version-high' };
  return { ok: true, configs: payload.configs.filter(isReportConfig) };
}

export function createReportConfigFileStorage(
  files: FileAccess,
  dataDir: string,
  options: ReportConfigFileStorageOptions = {},
): ReportConfigFileStorage {
  const filePath = `${dataDir}/state/report-configs.json`;
  const onDataLoss = options.onDataLoss;
  let cache: ReportConfig[] = [];

  function reportDataLoss(message: string): void {
    console.error(`[report-config] data loss: ${message}`);
    onDataLoss?.(message);
  }

  async function writeToFile(configs: readonly ReportConfig[]): Promise<void> {
    try {
      await writeJsonWithBackup(files, filePath, { version: SCHEMA_VERSION, configs });
    } catch (err) {
      console.error('[report-config] file write failed:', err instanceof Error ? err.message : err);
    }
  }

  return {
    loadAll() { return [...cache]; },
    getByTemplateId(templateId) { return cache.find(c => c.templateId === templateId); },
    saveAll(configs) {
      cache = [...configs];
      void writeToFile(configs);
    },
    async hydrate(seed) {
      if (seed !== undefined) { cache = [...seed]; return; }
      const result: JsonReadResult = await readJsonWithBackup(files, filePath);
      if (result.status === 'ok' || result.status === 'recovered') {
        if (result.status === 'recovered') onDataLoss?.('report-configs.json 主文件损坏,已从备份恢复');
        const parsed = parsePayload(result.value);
        if (parsed.ok) { cache = [...parsed.configs]; return; }
        if (parsed.reason === 'version-high') reportDataLoss(`report-configs.json schema version 高于预期(${SCHEMA_VERSION}),已重置为空`);
        else reportDataLoss('report-configs.json 数据格式异常,已重置为空');
        cache = [];
        return;
      }
      if (result.status === 'corrupted') reportDataLoss('report-configs.json 主+备均损坏,报告配置数据丢失');
      cache = [];
    },
  };
}

/**
 * 延迟注入 holder(照 LazyDockingStorage / rewriteRuntime LazyPersistence 同款)。
 *
 * wireFeatures 同步初始化时无 fileFacade,先建空 delegate(loadAll 返空、saveAll 丢弃、getByTemplateId 返 undefined);
 * bootstrap 异步拿到 fileFacade + dataDir 后,创建真 storage + hydrate,再 setDelegate 注入。
 *
 * 关键:northbound 的 reportConfigProvider 闭包调 getByTemplateId。delegate 是空壳时(hydrate 前)
 * 返回 undefined → 报告三类为空(诚实非造假)。这正是防 S014/S017 静默失败温床:不能假设 provider 一定有数据。
 */
export class LazyReportConfigStorage implements ReportConfigFileStorage {
  private delegate: ReportConfigFileStorage = createEmptyStorage();

  setDelegate(storage: ReportConfigFileStorage): void { this.delegate = storage; }
  loadAll() { return this.delegate.loadAll(); }
  getByTemplateId(templateId: string) { return this.delegate.getByTemplateId(templateId); }
  saveAll(configs: readonly ReportConfig[]) { this.delegate.saveAll(configs); }
  async hydrate(seed?: readonly ReportConfig[]) { return this.delegate.hydrate(seed); }
}

function createEmptyStorage(): ReportConfigFileStorage {
  return {
    loadAll: () => [],
    getByTemplateId: () => undefined,
    saveAll: () => { /* discarded before bootstrap */ },
    async hydrate() { /* no-op */ },
  };
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `cd rewrite && npx vitest run src/features/command-ingress/services/__tests__/report-config-file-storage.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add rewrite/src/features/command-ingress/services/report-config-file-storage.ts rewrite/src/features/command-ingress/services/__tests__/report-config-file-storage.spec.ts
git commit -m "feat(report-config): 文件存储 + LazyHolder(含 hydrate 前后时序测试)[S018]"
```

---

## Task 4: generateTestReport 改造(reportConfig 驱动,TDD)

**Files:**
- Modify: `rewrite/src/features/northbound/core/test-report-generator.ts:99-148`
- Modify: `rewrite/src/features/northbound/__tests__/test-report-generator.spec.ts`

- [ ] **Step 1: 写失败测试(追加到现有 spec)**

在 `rewrite/src/features/northbound/__tests__/test-report-generator.spec.ts` 末尾追加:

```ts
import type { ReportConfig } from '@/features/command-ingress/core/report-config';

describe('generateTestReport — reportConfig driven', () => {
  // 复用文件顶部已有的 instance/verdict/config/testCaseId/taskId fixtures(若没有,按现有 spec 构造)
  // 以下 base 输入照文件里已有的 fixture 模式,执行者对齐现有变量名

  const reportConfig: ReportConfig = {
    templateId: 'tpl',
    checkPoints: [
      { id: 'i1', name: '载波同步锁定', frameId: 'fA', fieldId: 'lock', msg: '说明1' },
    ],
    statisticsItems: [
      { id: 'i2', name: '误码率', frameId: 'fA', fieldId: 'ber' },
    ],
    attachItems: [],
  };

  it('fills three categories from reportConfig + displaySnapshot', () => {
    const snapshot = new Map([['fA:lock', '锁定'], ['fA:ber', '0.2%']]);
    const json = generateTestReport({ /* base fixtures */ } as any, { reportConfig, displaySnapshot: snapshot });
    const tc = JSON.parse(json).testCaseList[0];
    expect(tc.checkPoints[0].checkPoint).toBe('载波同步锁定');
    expect(tc.checkPoints[0].testValue).toBe('锁定');
    expect(tc.checkPoints[0].expectValue).toBe(''); // 纯取值,无期望
    expect(tc.checkPoints[0].msg).toBe('说明1');
    expect(tc.statisticsItems[0].itemName).toBe('误码率');
    expect(tc.statisticsItems[0].testValue).toBe('0.2%');
    expect(tc.attachItems).toEqual([]);
  });

  it('fills empty testValue when field not in snapshot', () => {
    const snapshot = new Map<string, string>(); // 空
    const json = generateTestReport({ /* base fixtures */ } as any, { reportConfig, displaySnapshot: snapshot });
    const tc = JSON.parse(json).testCaseList[0];
    expect(tc.checkPoints[0].testValue).toBe('');
  });

  it('returns empty categories when reportConfig undefined (no mock fallback)', () => {
    const json = generateTestReport({ /* base fixtures */ } as any); // 无 reportConfig
    const tc = JSON.parse(json).testCaseList[0];
    expect(tc.checkPoints).toEqual([]);
    expect(tc.statisticsItems).toEqual([]);
    expect(tc.attachItems).toEqual([]);
  });
});
```

> 执行者注意:上面 `{ /* base fixtures */ } as any` 需替换为该 spec 文件里已有的真实 instance/verdict/config 等构造(照文件顶部 fixture)。`generateTestReport` 签名将改为接受第二参 options(见 Step 3)。先确认现有 spec 的调用方式,可能 generateTestReport 当前是单参。执行者须先把现有调用改为兼容的新签名。

- [ ] **Step 2: 运行测试,确认失败**

Run: `cd rewrite && npx vitest run src/features/northbound/__tests__/test-report-generator.spec.ts`
Expected: FAIL — reportConfig/displaySnapshot 参数不存在,且现有调用签名可能报错

- [ ] **Step 3: 改 generateTestReport 签名 + 实现**

先看当前签名(`test-report-generator.ts:99-148`,单参 `input: GenerateTestReportInput`)。改为**保留单参**,但在 input 加 reportConfig/displaySnapshot 字段(避免大改调用方)。修正测试的 `generateTestReport(input, options)` 调用为 `generateTestReport({...base, reportConfig, displaySnapshot})`。

在 `test-report-generator.ts` 的 `GenerateTestReportInput` 接口(`:99-112`)追加:

```ts
export interface GenerateTestReportInput {
  // ... 现有字段保留(instance/verdict/testCaseId/taskId/config/mockConfig?/collected*?)
  /** 配置驱动的报告内容(三类)。提供时优先于 mockConfig 和 collected*。 */
  readonly reportConfig?: ReportConfig;
  /** 字段值快照,按 dataItemId(frameId:fieldId)取 displayValue。 */
  readonly displaySnapshot?: ReadonlyMap<string, string>;
}
```

文件顶部加 import:

```ts
import type { ReportConfig, ReportItem } from '@/features/command-ingress/core/report-config';
```

在 `generateTestReport` 函数体(`:114+`)改造三类填充逻辑。**删除 `:126` 的 `usingCollected` 变量 + `:134-136` 的三元两分支同体死代码**。替换 checkPoints/statisticsItems/attachItems 的填充:

```ts
export function generateTestReport(input: GenerateTestReportInput): string {
  const { instance, verdict, testCaseId, taskId, config } = input;

  const isPassed = verdict.verdict === 'passed';
  const startTime = instance.startedAt ?? verdict.startedAt;
  const endTime = instance.completedAt ?? instance.failedAt ?? instance.stoppedAt ?? verdict.finishedAt;

  // 三类填充:reportConfig 驱动优先;否则空(不 fallback DEFAULT_MOCK_CONFIG,诚实空着)
  const snapshot = input.displaySnapshot ?? new Map<string, string>();

  function toItem(item: ReportItem, nameField: 'checkPoint' | 'itemName') {
    const value = snapshot.get(`${item.frameId}:${item.fieldId}`) ?? '';
    if (nameField === 'checkPoint') {
      return {
        checkPoint: item.name,
        expectValue: '',
        testValue: value,
        result: isPassed ? ('通过' as const) : ('未通过' as const),
        msg: item.msg ?? '',
      };
    }
    // statisticsItem / attachItem(无判定,纯值)
    return { itemName: item.name, testValue: value, msg: item.msg ?? '' };
  }

  const reportConfig = input.reportConfig;
  const checkPoints = reportConfig
    ? reportConfig.checkPoints.map(i => toItem(i, 'checkPoint'))
    : [];
  const statisticsItems = reportConfig
    ? reportConfig.statisticsItems.map(i => toItem(i, 'itemName'))
    : [];
  const attachItems = reportConfig
    ? reportConfig.attachItems.map(i => toItem(i, 'itemName'))
    : [];

  // processAndDatas:无配置驱动,保留 collected 或空(spec: 本特性先留空)
  const mock = input.mockConfig ?? DEFAULT_MOCK_CONFIG;
  const processSteps = input.collectedProcessSteps ?? [];
  const deviceIds = input.collectedDeviceIds ?? [];

  const testCase: TestReportTestCase = {
    testCaseId,
    resources: [],
    deviceIds,
    startTime,
    endTime,
    checkPoints,
    statisticsItems,
    attachItems,
    result: isPassed ? 'success' : 'fail',
    msg: isPassed ? 'ok' : verdict.verdict,
    judgmentMsg: '',
    processAndDatas: processSteps.map(step => ({
      ...step,
      startTime: step.startTime || startTime,
      endTime: step.endTime || endTime,
    })),
    testParsInfo: [],
  };
  // ... 后续 report 组装保持不变
```

> 注:`statisticsItems`/`attachItems` 在 `TestReportTestCase`(`:31-32`)当前是 `readonly unknown[]`。填的是 `{ itemName, testValue, msg }`,运行时 OK,但类型上仍是 unknown。如要类型安全,把 `:31-32` 改成具体的 `TestReportStatisticsItem`/`TestReportAttachItem` 接口(见下方)。**类型加强放 Task 4 的 Step 3b,可选但推荐。**

- [ ] **Step 3b(可选,类型安全):定义 statisticsItem/attachItem 类型**

在 `test-report-generator.ts` 类型区(`:7-59` 附近)加:

```ts
export interface TestReportStatisticsItem {
  readonly itemName: string;
  readonly testValue: string;
  readonly expectValue?: string;
  readonly result?: '通过' | '未通过';
  readonly msg: string;
}
export interface TestReportAttachItem {
  readonly itemName: string;
  readonly testValue: string;
  readonly expectValue?: string;
  readonly result?: '通过' | '未通过';
  readonly msg: string;
}
```

把 `TestReportTestCase`(`:31-32`)的 `readonly unknown[]` 改为 `readonly TestReportStatisticsItem[]` / `readonly TestReportAttachItem[]`,并让 `toItem` 返回对应类型。这会让现有 mock 代码(`DEFAULT_MOCK_CONFIG`)若有 statisticsItems 不匹配——但 mock 当前 statisticsItems 为空(spec 确认),所以安全。

- [ ] **Step 4: 修复现有 spec 的调用签名**

读 `test-report-generator.spec.ts`,把现有 `generateTestReport(input)` 调用确认仍是单参(无 break)。新测试用 `generateTestReport({ ...baseInput, reportConfig, displaySnapshot })`。

- [ ] **Step 5: 运行测试,确认通过**

Run: `cd rewrite && npx vitest run src/features/northbound/__tests__/test-report-generator.spec.ts`
Expected: PASS(新测试 + 现有测试均通过)

- [ ] **Step 6: Commit**

```bash
git add rewrite/src/features/northbound/core/test-report-generator.ts rewrite/src/features/northbound/__tests__/test-report-generator.spec.ts
git commit -m "feat(report-config): generateTestReport 支持 reportConfig 驱动 + 清死代码 [S018]"
```

---

## Task 5: northbound-service 接入 reportConfigProvider + displayFieldReader(TDD)

**Files:**
- Modify: `rewrite/src/features/northbound/services/northbound-service.ts:113-123,209-256`
- Modify: `rewrite/src/features/northbound/__tests__/northbound-service.spec.ts`

- [ ] **Step 1: 写失败测试(追加到 northbound-service.spec.ts)**

```ts
describe('uploadTestReportAndNotify — reportConfig driven', () => {
  // 复用文件顶部已有的 fakeTaskService/fakeResultService/mockFtp 等 fixtures
  // 执行者对齐现有 helper 构造方式(见文件顶部的 createNorthboundService helper)

  it('fills report from reportConfigProvider + displayFieldReader', async () => {
    const reportConfig = {
      templateId: 'tpl',
      checkPoints: [{ id: 'i1', name: '载波同步', frameId: 'fA', fieldId: 'lock' }],
      statisticsItems: [], attachItems: [],
    };
    const fakeDisplayFields = [{ dataItemId: 'fA:lock', displayValue: '锁定' /* +其它必需字段 */ }];

    const service = createNorthboundService({
      /* ...现有必填... */
      reportConfigProvider: (tid) => (tid === 'tpl' ? reportConfig : undefined),
      displayFieldReader: { getSourceFields: () => fakeDisplayFields },
    });
    await service.start(activeConfigWithFtp);

    // 触发 settled → uploadTestReportAndNotify(通过现有 helper 模拟 task settled)
    // 验证 ftp.uploadFile 被调,content 里 checkPoints.testValue === '锁定'
    const uploaded = /* 取 mockFtp.uploadFile 的 call args */;
    const report = JSON.parse(uploaded.content);
    expect(report.testCaseList[0].checkPoints[0].testValue).toBe('锁定');
  });

  it('produces empty categories when reportConfigProvider returns undefined (hydrate 前)', async () => {
    const service = createNorthboundService({
      /* ...现有必填... */
      reportConfigProvider: () => undefined, // 空壳阶段
      displayFieldReader: { getSourceFields: () => [] },
    });
    await service.start(activeConfigWithFtp);
    // 触发 settled
    const report = JSON.parse(/* uploaded content */);
    expect(report.testCaseList[0].checkPoints).toEqual([]);
  });
});
```

> 执行者注意:`createNorthboundService` 的测试 helper 和 `start(config)` 的 fixture 在现有 spec 顶部。`uploadTestReportAndNotify` 是内部函数,通过 `handleTaskSettled(instanceId)` 触发(它内部调 reportTaskResult → uploadTestReportAndNotify)。照现有 spec 里测 settled 的方式构造 instance + verdict。

- [ ] **Step 2: 运行测试,确认失败**

Run: `cd rewrite && npx vitest run src/features/northbound/__tests__/northbound-service.spec.ts -t "reportConfig driven"`
Expected: FAIL — reportConfigProvider/displayFieldReader 字段不存在

- [ ] **Step 3: 改 NorthboundServiceOptions**

`northbound-service.ts:113-123`,在接口加两字段(可选,照 batchRegistry 模式):

```ts
export interface NorthboundServiceOptions {
  readonly taskService: TaskService;
  readonly resultService: ResultService;
  readonly httpFacade: HttpFacade;
  readonly ftpFacade?: FtpFacade;
  readonly connectionSnapshot: () => { readonly status: string };
  readonly reportedSnapshotStorage?: ReportedSnapshotStorage;
  readonly reportDataCollector?: ReportDataCollector;
  readonly batchRegistry?: DockingBatchRegistryPort;
  /** 按 templateId 取报告配置(来自 command-ingress,LazyHolder 注入)。空壳阶段返 undefined。 */
  readonly reportConfigProvider?: (templateId: string) => ReportConfig | undefined;
  /** 字段值快照读取口(displayService.getSourceFields 的只读 port)。 */
  readonly displayFieldReader?: { getSourceFields(): readonly { dataItemId: string; displayValue: string }[] };
}
```

文件顶部加 import:`import type { ReportConfig } from '@/features/command-ingress/core/report-config';`

- [ ] **Step 4: 改 uploadTestReportAndNotify**

`northbound-service.ts:209-256`,在 `generateTestReport` 调用前构 displaySnapshot,传 reportConfig:

```ts
async function uploadTestReportAndNotify(
  instance: TaskInstanceState,
  verdict: CaseVerdict,
  testCaseId: string,
  taskId: string,
): Promise<void> {
  const config = activeConfig;
  const ftp = options.ftpFacade;
  if (!config?.ftp || !ftp) return;

  // reportConfig 驱动:从 provider 取配置,从 displayFieldReader 构快照
  const reportConfig = options.reportConfigProvider?.(instance.templateId);
  const snapshot = new Map<string, string>();
  if (reportConfig && options.displayFieldReader) {
    for (const f of options.displayFieldReader.getSourceFields()) {
      snapshot.set(f.dataItemId, f.displayValue);
    }
  }

  const reportJson = generateTestReport({
    instance,
    verdict,
    testCaseId,
    taskId,
    config: envelopeConfig(),
    reportConfig,
    displaySnapshot: snapshot,
  });

  const remotePath = `${config.ftp.basePath.replace(/\/$/, '')}/TestReport_${taskId}.json`;

  try {
    await ftp.uploadFile({
      host: config.ftp.host,
      port: config.ftp.port,
      username: config.ftp.username,
      password: config.ftp.password,
      remotePath,
      content: reportJson,
    });
    await reportTestDataFileComplete({
      taskId,
      result: 'success',
      msg: '',
      testCaseId: [testCaseId],
      ftpServerIP: config.ftp.host,
      fileType: 'TestReport',
      filePath: remotePath,
    });
  } catch {
    // R11: delivery failure does not rewrite internal result
  }
}
```

> 移除原来的 `const collected = options.reportDataCollector?.collect(...)` 行(:220)和 collectedCheckPoints/collectedProcessSteps 传参(reportDataCollector 不接线,collected* 永远 undefined;generateTestReport 内部已处理 undefined → 空数组)。**保留 reportDataCollector 字段定义和 onStepResult 调用**(死代码不删,避免 baseline 动)。

- [ ] **Step 5: 运行测试,确认通过**

Run: `cd rewrite && npx vitest run src/features/northbound/__tests__/northbound-service.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add rewrite/src/features/northbound/services/northbound-service.ts rewrite/src/features/northbound/__tests__/northbound-service.spec.ts
git commit -m "feat(report-config): northbound 接入 reportConfigProvider + displayFieldReader [S018]"
```

---

## Task 6: feature-wiring 接线 + bootstrap hydrate

**Files:**
- Modify: `rewrite/src/runtime/feature-wiring.ts:82-91,118,237-246,266-269`
- Modify: `rewrite/src/app/rewriteRuntime.ts:318-344`(加 hydrateReportConfigData)

- [ ] **Step 1: feature-wiring 加 reportConfigStorage holder**

在 `feature-wiring.ts`,WiredFeatures 接口(`:82-91` 附近,含 `dockingStorage`)加:

```ts
  /** 报告配置延迟注入 holder。wireFeatures 同步建空壳,bootstrap hydrate 后 setDelegate。 */
  readonly reportConfigStorage: LazyReportConfigStorage;
```

顶部 import(`:40` 附近,已有 LazyDockingStorage import):

```ts
import { LazyReportConfigStorage } from '@/features/command-ingress/services/report-config-file-storage';
```

在 `wireFeatures` 函数体(`:118` 附近,`const dockingStorage = new LazyDockingStorage();` 旁)加:

```ts
  const reportConfigStorage = new LazyReportConfigStorage();
```

- [ ] **Step 2: 给 createNorthboundService 注入两个 port**

`feature-wiring.ts:237-246`,在 createNorthboundService 调用加 reportConfigProvider + displayFieldReader:

```ts
  const northboundService = createNorthboundService({
    taskService,
    resultService,
    httpFacade: httpFacade!,
    ftpFacade: ftpFacade ?? undefined,
    connectionSnapshot: () => connectionService.getSnapshot(),
    reportedSnapshotStorage,
    batchRegistry,
    reportConfigProvider: (templateId) => reportConfigStorage.getByTemplateId(templateId),
    displayFieldReader: displayService,  // displayService.getSourceFields() 已存在
  });
```

> displayService 实现了 `getSourceFields()`(display-service.ts:251),直接作为 displayFieldReader 传入(结构子类型,方法签名匹配)。displayService 早建于 `:169`。

- [ ] **Step 3: return 里加 reportConfigStorage**

`feature-wiring.ts:266-269`(return 对象,`dockingStorage` 旁)加:

```ts
    reportConfigStorage,
```

- [ ] **Step 4: bootstrap 加 hydrateReportConfigData**

`rewriteRuntime.ts`,照 `hydrateDockingData`(`:318-344`)同款,新增函数并在 bootstrap ready 流程里调:

```ts
async function hydrateReportConfigData(
  runtime: RewriteRuntime,
  fileFacade: FileFacade,
  dataDir: string,
): Promise<void> {
  const storage = createReportConfigFileStorage(fileFacade, dataDir, {
    onDataLoss: (message) => {
      console.error('[bootstrap]', message);
      import('quasar')
        .then(({ Notify }) => {
          try { Notify.create({ type: 'warning', message: '报告配置', caption: message, timeout: 10000 }); }
          catch { /* Notify 未就绪 */ }
        }).catch(() => { /* quasar 加载失败 */ });
    },
  });
  await storage.hydrate();
  runtime.features.reportConfigStorage.setDelegate(storage);
}
```

顶部 import:

```ts
import { createReportConfigFileStorage } from '@/features/command-ingress/services/report-config-file-storage';
```

在 bootstrap 的 hydrate 序列里(调 `hydrateDockingData` 的地方)追加 `await hydrateReportConfigData(runtime, fileFacade, dataDir);`。执行者:grep `hydrateDockingData(` 找调用点,紧跟其后加一行。

- [ ] **Step 5: 运行接线相关测试**

Run: `cd rewrite && npx vitest run src/runtime/__tests__/`
Expected: PASS(若有 bootstrap-integration 测试,确认 reportConfigStorage 字段存在不破坏)

- [ ] **Step 6: tsc 类型检查**

Run: `cd rewrite && npx tsc --noEmit`
Expected: 0 errors(reportConfigProvider 的 ReportConfig 类型跨 feature import;displayService 作为 displayFieldReader 结构匹配)

如有 tsc 报错,常见:displayService 的 getSourceFields 返回 `readonly DisplayFieldMaterial[]`(字段多于 dataItemId/displayValue),结构子类型仍兼容 displayFieldReader 声明(只要含这两个字段)。若不兼容,改 displayFieldReader 声明为 `{ getSourceFields(): readonly DisplayFieldMaterial[] }` 并 import 该类型。

- [ ] **Step 7: Commit**

```bash
git add rewrite/src/runtime/feature-wiring.ts rewrite/src/app/rewriteRuntime.ts
git commit -m "feat(report-config): feature-wiring 接线 + bootstrap hydrate [S018]"
```

---

## Task 7: ReportConfigEditor UI 组件

**Files:**
- Create: `rewrite/src/features/command-ingress/components/docking/ReportConfigEditor.vue`

- [ ] **Step 1: 先看现有字段选择器组件**

读 `rewrite/src/features/task/components/`(或 task 编辑器里 wait-condition step 用的帧/字段选择器),确认复用的组件名(`FrameSelector`?或 `frameService.listFieldReferences({frameId, direction:'receive'})`)。执行者:grep `listFieldReferences` 找 UI 调用点,照它的 props/用法。

- [ ] **Step 2: 写 ReportConfigEditor.vue**

组件 props:`templateId`、`config: ReportConfig | undefined`、`frameService`(或通过 inject)。emit:`update-config`(ReportConfig)。结构(挂法1,三类区块):

```vue
<template>
  <div class="report-config-editor q-pa-sm">
    <div class="rw-text-label text-sm mb-2">报告配置</div>

    <ReportCategoryEditor
      v-for="cat in categories"
      :key="cat.key"
      :label="cat.label"
      :items="config?.[cat.key] ?? []"
      :frame-service="frameService"
      @add="onAdd(cat.key, $event)"
      @update-item="onUpdateItem(cat.key, $event)"
      @remove="onRemove(cat.key, $event)"
      @move="onMove(cat.key, $event.id, $event.direction)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ReportConfig, ReportItem } from '../../core/report-config';
import { moveReportItem } from '../../core/report-config';
import type { FrameAssetService } from '@/features/frame';
import ReportCategoryEditor from './ReportCategoryEditor.vue';

const props = defineProps<{
  templateId: string;
  config: ReportConfig | undefined;
  frameService: FrameAssetService;
}>();
const emit = defineEmits<{ 'update-config': [config: ReportConfig] }>();

const categories = [
  { key: 'checkPoints' as const, label: '检查点' },
  { key: 'statisticsItems' as const, label: '统计项' },
  { key: 'attachItems' as const, label: '附加项' },
];

function ensureConfig(): ReportConfig {
  return props.config ?? { templateId: props.templateId, checkPoints: [], statisticsItems: [], attachItems: [] };
}

function mutate(key: 'checkPoints' | 'statisticsItems' | 'attachItems', fn: (items: readonly ReportItem[]) => readonly ReportItem[]) {
  const base = ensureConfig();
  const next: ReportConfig = { ...base, [key]: fn(base[key]) };
  emit('update-config', next);
}

function onAdd(key, item) { mutate(key, items => [...items, item]); }
function onUpdateItem(key, item) { mutate(key, items => items.map(i => i.id === item.id ? item : i)); }
function onRemove(key, id) { mutate(key, items => items.filter(i => i.id !== id)); }
function onMove(key, id, direction) { mutate(key, items => moveReportItem(items, id, direction)); }
</script>
```

- [ ] **Step 3: 写 ReportCategoryEditor.vue(子组件,一类一区块)**

`rewrite/src/features/command-ingress/components/docking/ReportCategoryEditor.vue`:

```vue
<template>
  <div class="mb-3">
    <div class="rw-text-label text-xs mb-1">{{ label }}</div>
    <div v-for="item in items" :key="item.id" class="flex items-center gap-2 mb-1">
      <q-input dense outlined v-model="localName[item.id]" placeholder="名称" style="width: 120px"
        @update:model-value="emitName(item.id)" />
      <FrameFieldPicker
        :frame-service="frameService"
        :frame-id="item.frameId" :field-id="item.fieldId"
        @update="(f, fid) => emitUpdate({ ...item, frameId: f, fieldId: fid })" />
      <q-input dense outlined v-model="localMsg[item.id]" placeholder="说明(可选)" style="width: 100px"
        @update:model-value="emitMsg(item.id)" />
      <q-btn flat dense icon="o_arrow_upward" size="xs" @click="emit('move', { id: item.id, direction: 'up' })" />
      <q-btn flat dense icon="o_arrow_downward" size="xs" @click="emit('move', { id: item.id, direction: 'down' })" />
      <q-btn flat dense icon="o_close" color="negative" size="xs" @click="emit('remove', item.id)" />
    </div>
    <q-btn flat dense no-caps icon="o_add" size="sm" label="添加" @click="onAdd" />
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import { nanoid } from 'nanoid';
import type { ReportItem } from '../../core/report-config';
import type { FrameAssetService } from '@/features/frame';
import FrameFieldPicker from './FrameFieldPicker.vue';

const props = defineProps<{
  label: string;
  items: readonly ReportItem[];
  frameService: FrameAssetService;
}>();
const emit = defineEmits<{
  add: [item: ReportItem];
  'update-item': [item: ReportItem];
  remove: [id: string];
  move: [payload: { id: string; direction: 'up' | 'down' }];
}>();

const localName = reactive<Record<string, string>>({});
const localMsg = reactive<Record<string, string>>({});
watch(() => props.items, items => {
  items.forEach(i => { localName[i.id] = i.name; localMsg[i.id] = i.msg ?? ''; });
}, { immediate: true, deep: true });

function onAdd() {
  emit('add', { id: nanoid(), name: '', frameId: '', fieldId: '' });
}
function emitName(id: string) {
  const item = props.items.find(i => i.id === id);
  if (item) emit('update-item', { ...item, name: localName[id] });
}
function emitMsg(id: string) {
  const item = props.items.find(i => i.id === id);
  if (item) emit('update-item', { ...item, msg: localMsg[id] || undefined });
}
function emitUpdate(item: ReportItem) { emit('update-item', item); }
</script>
```

- [ ] **Step 4: 写 FrameFieldPicker.vue(帧+字段选择,复用 listFieldReferences direction:'receive')**

`rewrite/src/features/command-ingress/components/docking/FrameFieldPicker.vue`:

```vue
<template>
  <div class="flex items-center gap-1">
    <q-select dense outlined emit-value map-options v-model="frameIdLocal"
      :options="frameOptions" style="width: 130px" placeholder="帧" @update:model-value="onFrame" />
    <q-select dense outlined emit-value map-options v-model="fieldIdLocal"
      :options="fieldOptions" style="width: 120px" placeholder="字段" @update:model-value="onField" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { FrameAssetService } from '@/features/frame';

const props = defineProps<{
  frameService: FrameAssetService;
  frameId: string;
  fieldId: string;
}>();
const emit = defineEmits<{ update: [frameId: string, fieldId: string] }>();

const frameIdLocal = ref(props.frameId);
const fieldIdLocal = ref(props.fieldId);

const frameOptions = computed(() =>
  // 列出所有接收方向帧;执行者照 SendStepEditor.vue:40 的 frameService 用法对齐
  props.frameService.listFrames().map(f => ({ label: f.name, value: f.id }))
);

const fieldOptions = computed(() => {
  if (!frameIdLocal.value) return [];
  // 关键:direction:'receive',否则混入 send 帧字段
  const refs = props.frameService.listFieldReferences({ frameId: frameIdLocal.value, direction: 'receive' });
  return refs.map(r => ({ label: r.fieldName, value: r.fieldId }));
});

function onFrame(id: string) {
  frameIdLocal.value = id;
  fieldIdLocal.value = '';
  emit('update', id, '');
}
function onField(id: string) {
  fieldIdLocal.value = id;
  emit('update', frameIdLocal.value, id);
}
watch(() => [props.frameId, props.fieldId], ([f, fid]) => {
  frameIdLocal.value = f; fieldIdLocal.value = fid;
});
</script>
```

> 执行者注意:`frameService.listFrames()` 和 `listFieldReferences` 的确切返回字段(label/value/fieldName/fieldId)须核对 `frame-asset-service.ts` 实际类型后对齐 options 的 label/value 映射。

- [ ] **Step 5: 运行 dev 确认渲染**

Run: `cd rewrite && npm run dev`
手动:进"指令接入-中心对接-用例目录",展开一个有映射的用例,确认报告配置区块渲染(三类 + 添加/删除/上下移)。

- [ ] **Step 6: Commit**

```bash
git add rewrite/src/features/command-ingress/components/docking/ReportConfigEditor.vue rewrite/src/features/command-ingress/components/docking/ReportCategoryEditor.vue rewrite/src/features/command-ingress/components/docking/FrameFieldPicker.vue
git commit -m "feat(report-config): ReportConfigEditor + 分类/字段选择 UI [S018]"
```

---

## Task 8: 嵌入 CatalogMappingPanel + 持久化回调

**Files:**
- Modify: `rewrite/src/features/command-ingress/components/docking/CatalogMappingPanel.vue:88-133`
- Modify: `rewrite/src/pages/CommandIngressPage.vue`

- [ ] **Step 1: CatalogMappingPanel 加 ReportConfigEditor**

在 `CatalogMappingPanel.vue:123`(可覆盖字段区块 `</div>` 之后)、`:125` 删除映射按钮之前,插入:

```vue
          <ReportConfigEditor
            :template-id="m.templateId"
            :config="getReportConfig(m.templateId)"
            :frame-service="frameService"
            @update-config="(cfg) => emit('update-report-config', cfg)"
          />
```

props 补 `frameService`、`getReportConfig`(从父注入)。emit 加 `update-report-config`。

- [ ] **Step 2: 加导入导出按钮**

在 CatalogMappingPanel 工具栏(`:139-175` 添加映射按钮旁),加:

```vue
    <q-btn flat dense no-caps icon="o_upload" size="sm" label="导入报告配置" @click="emit('import-report-configs')" />
    <q-btn flat dense no-caps icon="o_download" size="sm" label="导出报告配置" @click="emit('export-report-configs')" />
```

- [ ] **Step 3: CommandIngressPage 接持久化回调**

在 `CommandIngressPage.vue`,照现有 catalog 回调(`toggleMapping`/`toggleField` 等,`:359-407`)模式加:

```ts
function getReportConfig(templateId: string) {
  return findReportConfig(reportConfigs.value, templateId);
}
function updateReportConfig(cfg: ReportConfig) {
  reportConfigs.value = upsertReportConfig(reportConfigs.value, cfg);
  reportConfigStorage.value.saveAll(reportConfigs.value);
}
async function exportReportConfigs() {
  if (reportConfigs.value.length === 0) { notify.warning('当前没有报告配置可导出'); return; }
  const text = serializeReportConfigs(reportConfigs.value);
  // 照 GroupConfigDialog.vue:145-173 的 Electron showSaveDialog / 浏览器 Blob 双路径
  // 文件名 report-configs-${timestamp()}.json
}
async function importReportConfigs() {
  // 照 GroupConfigDialog.vue:175-225 双路径读文件 + parseReportConfigsFromJson + 确认框 + 按 templateId 合并
  // 冲突策略:按 templateId 替换(导入的覆盖同名,没冲突的追加)
}
```

`reportConfigs` 是 ref,bootstrap ready 后从 `reportConfigStorage.loadAll()` 初始化。`reportConfigStorage` 从 runtime.features 拿。

- [ ] **Step 4: 运行 + 手动验证**

Run: `cd rewrite && npm run dev`
手动:配几项 → 刷新页面确认持久化 → 导出 → 删除 → 导入回来。

- [ ] **Step 5: Commit**

```bash
git add rewrite/src/features/command-ingress/components/docking/CatalogMappingPanel.vue rewrite/src/pages/CommandIngressPage.vue
git commit -m "feat(report-config): 嵌入用例目录 + 持久化 + 导入导出 [S018]"
```

---

## Task 9: 全量回归 + 收尾

- [ ] **Step 1: 全量测试**

Run: `cd rewrite && npx vitest run`
Expected: 0 failures。如有失败,确认是本特性引入还是既有(ui-feature-bugs WIP 可能引入),按需修。

- [ ] **Step 2: 类型 + lint**

Run: `cd rewrite && npx tsc --noEmit && npm run lint`
Expected: 0 errors。

- [ ] **Step 3: 清理(可选)**

确认 `report-data-collector.ts` 相关代码未被破坏(死代码保留)。`usingCollected` 变量已删(Task 4)。

- [ ] **Step 4: 治理落档(session-governance)**

按 session-governance 规范,写 S018 实施完成记录到 `.sessions/2026-05-18-northbound-integration/`(若需要新建 S018 笔记)。更新 topic-index.md 的 session 计数说明(15+ 文件已超阈值,但 D008 已说明这是 H012 方向修正,属既定范围)。

- [ ] **Step 5: 最终 Commit**

```bash
git add -A
git commit -m "test(report-config): 全量回归 + 治理落档 [S018]"
```

---

## 联调(留给用户,代码不宣称完成)

- ⏳ 真实跑 task,确认生成的 TestReport 里三类字段值是 displayValue(锁定/0.2%)非原始值(0x01)
- ⏳ FTP 上传成功 + 甲方收到并能正确解析(checkPoints/statisticsItems/attachItems 三类)
- ⏳ 核对甲方实际收到的字段格式(S017 教训:文档≠实现)

代码过单测后**标"待联调"**,不宣称完成。
