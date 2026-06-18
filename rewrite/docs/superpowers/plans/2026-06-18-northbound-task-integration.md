# northbound ↔ task 对接闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通我方 laser 子系统与甲方的用例同步闭环:上报(TaskTemplate→caseTemplate)、下发(setTestTask→TaskInstance,支持参数覆盖)、三层报告回传。

**Architecture:** 双向同源映射(D003)。模板作者用"可覆盖路径白名单"声明哪些字段甲方能改;上报时只为白名单字段生成 parId;下发时按白名单覆盖,白名单外从快照恢复。单一翻译器模块管两端。报告链路已接通,只需喂真实采集数据。

**Tech Stack:** TypeScript + Vue 3 (Composition API) + Quasar + Vitest + localStorage。

**关联:** spec `docs/superpowers/specs/2026-06-18-northbound-task-integration-design.md`;决策 D001/D002/D003。

---

## File Structure

### 新建文件
| 文件 | 职责 |
|------|------|
| `src/features/northbound/core/testcase-sync-translator.ts` | 翻译器:encode/decode 纯函数 + outCaseId 生成 |
| `src/features/northbound/core/path-resolver.ts` | 点+方括号路径解析器(encode/decode 共用) |
| `src/features/northbound/services/reported-snapshot-storage.ts` | 上报快照 localStorage 存储 + migration |
| `src/features/northbound/services/report-data-collector.ts` | 执行事件收集器(累积 processSteps/checkPoints) |
| `src/features/northbound/__tests__/testcase-sync-translator.spec.ts` | 翻译器测试 |
| `src/features/northbound/__tests__/path-resolver.spec.ts` | 路径解析器测试 |
| `src/features/northbound/__tests__/reported-snapshot-storage.spec.ts` | 快照存储测试 |
| `src/features/northbound/__tests__/report-data-collector.spec.ts` | 收集器测试 |

### 修改文件
| 文件 | 改动 |
|------|------|
| `src/features/task/core/types.ts` | 加 `CustomerSyncMeta` + TaskTemplate.customerSync? |
| `src/features/northbound/core/types.ts` | 加 CustomerTestCase/NorthboundTestCaseConfig/ReportedSnapshot/OverrideWarning |
| `src/features/northbound/core/test-report-generator.ts` | 扩展 GenerateTestReportInput(collectedCheckPoints/collectedProcessSteps) |
| `src/features/northbound/services/northbound-service.ts` | getTestCaseAll 接 listTemplates;setTestTask 接 decode;接收集器 |
| `src/features/northbound/services/northbound-state.ts` | 加 collectedReport map |
| `src/features/task/components/TemplateListPage.vue` | 加上报开关 + 白名单路径编辑 |
| `src/features/task/components/ExecutionListPage.vue` | 加来源标识列 |
| `src/features/task/core/types.ts` | TaskInstanceState 加 source? 字段 |

---

## Task 1: 类型定义(地基)

**Files:**
- Modify: `src/features/task/core/types.ts`
- Modify: `src/features/northbound/core/types.ts`

- [ ] **Step 1: 在 task/core/types.ts 加 CustomerSyncMeta**

在 `TaskTemplate` interface(`:188`)前插入:

```ts
// --- Customer sync metadata (上报给甲方的标记) ---

export interface CustomerSyncMeta {
  /** 是否上报给甲方 */
  readonly enabled: boolean;
  /** 上次上报时间戳(ms)。上报后由系统回填 */
  readonly reportedAt?: number;
  /** 上报后甲方侧的用例外部ID。上报后由系统回填,下发时反查快照 */
  readonly outCaseId?: string;
  /** 可被甲方覆盖的字段路径白名单。未列入的字段,甲方下发时无法覆盖 */
  readonly overridablePaths?: readonly string[];
}
```

在 `TaskTemplate` interface 加字段:

```ts
export interface TaskTemplate {
  readonly templateId: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly definition: TaskDefinition;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly customerSync?: CustomerSyncMeta;
}
```

`TemplateUpdates` 加可选字段:

```ts
export interface TemplateUpdates {
  readonly name?: string;
  readonly tags?: readonly string[];
  readonly definition?: TaskDefinition;
  readonly customerSync?: CustomerSyncMeta;
}
```

- [ ] **Step 2: 在 northbound/core/types.ts 加新类型**

在文件末尾追加:

```ts
// --- testcase-sync 相关类型 ---

/** 上报给甲方的用例(caseTemplate 结构,对齐 04-任务管理.md) */
export interface CustomerTestCase {
  readonly outCaseId: string;
  readonly caseName: string;
  readonly caseType: string;
  readonly subSysId: string;
  readonly subSysName: string;
  readonly menuId: string;
  readonly menuName: string;
  readonly depSubSys?: string;
  readonly depSubNe?: string;
  readonly durate: number;
  readonly satelliteCount: number;
  readonly stationCount: number;
  readonly isParent: boolean;
  readonly inputPars: readonly InputPar[];
  readonly execSteps?: string;
  readonly remark?: string;
}

/** laser 子系统的全局配置(subSysId/menuId 等) */
export interface NorthboundTestCaseConfig {
  readonly subSysId: string;
  readonly subSysName: string;
  readonly menuId: string;
  readonly menuName: string;
  readonly caseType: string;
  readonly depSubSys?: string;
  readonly depSubNe?: string;
}

/** 上报快照(decode 时按 outCaseId 反查) */
export interface ReportedSnapshot {
  readonly outCaseId: string;
  readonly templateId: string;
  readonly definition: TaskDefinition;
  readonly overridablePaths: readonly string[];
  readonly reportedAt: number;
}

/** 覆盖警告 */
export interface OverrideWarning {
  readonly parId: string;
  readonly reason: 'not-in-whitelist' | 'path-not-found' | 'type-mismatch';
  readonly detail: string;
}
```

需在 types.ts 顶部 import TaskDefinition:
```ts
import type { TaskDefinition } from '@/features/task/core';
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS(无类型错误。新增类型未使用,但不应报错)

- [ ] **Step 4: Commit**

```bash
git add src/features/task/core/types.ts src/features/northbound/core/types.ts
git commit -m "feat(northbound): add testcase-sync types (CustomerSyncMeta/CustomerTestCase/ReportedSnapshot)"
```

---

## Task 2: 快照存储(localStorage + migration)

**Files:**
- Create: `src/features/northbound/services/reported-snapshot-storage.ts`
- Test: `src/features/northbound/__tests__/reported-snapshot-storage.spec.ts`

- [ ] **Step 1: 写快照存储测试(失败)**

Create `src/features/northbound/__tests__/reported-snapshot-storage.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createReportedSnapshotStorage } from '../services/reported-snapshot-storage';
import type { ReportedSnapshot } from '../core/types';
import { createTaskDefinition, createDelayStep } from '@/features/task/core';

function makeSnapshot(outCaseId: string): ReportedSnapshot {
  return {
    outCaseId,
    templateId: 'tpl-1',
    definition: createTaskDefinition({
      id: 'def-1',
      name: 'test',
      steps: [createDelayStep(1000, { id: 'step-1' })],
      schedule: { kind: 'immediate' },
      errorPolicy: { onFailure: 'stop' },
    }),
    overridablePaths: [],
    reportedAt: 1000,
  };
}

describe('reported-snapshot-storage', () => {
  let mem: Record<string, string>;
  let kv: Storage;

  beforeEach(() => {
    mem = {};
    kv = {
      getItem: (k: string) => mem[k] ?? null,
      setItem: (k: string, v: string) => { mem[k] = v; },
      removeItem: (k: string) => { delete mem[k]; },
      clear: () => { mem = {}; },
      key: (i: number) => Object.keys(mem)[i] ?? null,
      length: 0,
    } as Storage;
  });

  it('saves and loads a snapshot by outCaseId', () => {
    const storage = createReportedSnapshotStorage(kv);
    const snap = makeSnapshot('oc-1');
    storage.save(snap);
    expect(storage.load('oc-1')).toEqual(snap);
  });

  it('returns undefined for missing outCaseId', () => {
    const storage = createReportedSnapshotStorage(kv);
    expect(storage.load('nope')).toBeUndefined();
  });

  it('loads all snapshots', () => {
    const storage = createReportedSnapshotStorage(kv);
    storage.save(makeSnapshot('oc-1'));
    storage.save(makeSnapshot('oc-2'));
    const all = storage.loadAll();
    expect(all).toHaveLength(2);
    expect(all.map(s => s.outCaseId).sort()).toEqual(['oc-1', 'oc-2']);
  });

  it('returns empty array on schema version mismatch', () => {
    mem['rw-task-reported-snapshots'] = JSON.stringify({ version: 999, snapshots: [] });
    const storage = createReportedSnapshotStorage(kv);
    expect(storage.loadAll()).toEqual([]);
  });

  it('returns empty array on corrupt JSON', () => {
    mem['rw-task-reported-snapshots'] = '{not json';
    const storage = createReportedSnapshotStorage(kv);
    expect(storage.loadAll()).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/features/northbound/__tests__/reported-snapshot-storage.spec.ts`
Expected: FAIL — `createReportedSnapshotStorage` 未定义。

- [ ] **Step 3: 实现快照存储**

Create `src/features/northbound/services/reported-snapshot-storage.ts`:

```ts
import type { ReportedSnapshot } from '../core/types';

const STORAGE_KEY = 'rw-task-reported-snapshots';
const SCHEMA_VERSION = 1;

interface PersistedPayload {
  readonly version: number;
  readonly snapshots: readonly ReportedSnapshot[];
}

export interface ReportedSnapshotStorage {
  load(outCaseId: string): ReportedSnapshot | undefined;
  loadAll(): readonly ReportedSnapshot[];
  save(snapshot: ReportedSnapshot): void;
  remove(outCaseId: string): void;
}

export function createReportedSnapshotStorage(
  kv: Storage = typeof localStorage !== 'undefined' ? localStorage : ({} as Storage),
): ReportedSnapshotStorage {
  function readPayload(): PersistedPayload | undefined {
    try {
      const raw = kv.getItem(STORAGE_KEY);
      if (!raw) return undefined;
      const payload = JSON.parse(raw) as PersistedPayload;
      if (payload.version !== SCHEMA_VERSION) {
        console.error(
          `[northbound] reported-snapshot storage schema version mismatch: expected ${SCHEMA_VERSION}, got ${payload.version}; existing snapshots ignored`,
        );
        return undefined;
      }
      if (!Array.isArray(payload.snapshots)) return undefined;
      return payload;
    } catch (err) {
      console.error('[northbound] failed to load reported snapshots from storage', err);
      return undefined;
    }
  }

  function writePayload(snapshots: readonly ReportedSnapshot[]): void {
    try {
      const payload: PersistedPayload = { version: SCHEMA_VERSION, snapshots };
      kv.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.error('[northbound] failed to persist reported snapshots', err);
    }
  }

  return {
    load(outCaseId) {
      return readPayload()?.snapshots.find(s => s.outCaseId === outCaseId);
    },
    loadAll() {
      return readPayload()?.snapshots ?? [];
    },
    save(snapshot) {
      const all = readPayload()?.snapshots ?? [];
      const filtered = all.filter(s => s.outCaseId !== snapshot.outCaseId);
      writePayload([...filtered, snapshot]);
    },
    remove(outCaseId) {
      const all = readPayload()?.snapshots ?? [];
      writePayload(all.filter(s => s.outCaseId !== outCaseId));
    },
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/features/northbound/__tests__/reported-snapshot-storage.spec.ts`
Expected: PASS — 5/5。

- [ ] **Step 5: Commit**

```bash
git add src/features/northbound/services/reported-snapshot-storage.ts src/features/northbound/__tests__/reported-snapshot-storage.spec.ts
git commit -m "feat(northbound): add reported-snapshot localStorage storage with schema versioning"
```

---

## Task 3: 路径解析器(encode/decode 共用基础)

**Files:**
- Create: `src/features/northbound/core/path-resolver.ts`
- Test: `src/features/northbound/__tests__/path-resolver.spec.ts`

- [ ] **Step 1: 写路径解析器测试(失败)**

Create `src/features/northbound/__tests__/path-resolver.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getPathValue, setPathValue } from '../core/path-resolver';

describe('path-resolver', () => {
  it('gets a simple property', () => {
    expect(getPathValue({ a: { b: 1 } }, 'a.b')).toBe(1);
  });

  it('gets array element by index', () => {
    expect(getPathValue({ arr: [{ x: 5 }] }, 'arr[0].x')).toBe(5);
  });

  it('returns undefined for missing path', () => {
    expect(getPathValue({ a: 1 }, 'b.c')).toBeUndefined();
  });

  it('sets a simple property (immutably)', () => {
    const obj = { a: { b: 1 } };
    const next = setPathValue(obj, 'a.b', 99) as typeof obj;
    expect(next.a.b).toBe(99);
    expect(obj.a.b).toBe(1); // 原对象不变
  });

  it('sets array element by index', () => {
    const obj = { arr: [{ x: 1 }, { x: 2 }] };
    const next = setPathValue(obj, 'arr[1].x', 99) as typeof obj;
    expect(next.arr[1].x).toBe(99);
    expect(obj.arr[1].x).toBe(2); // 原对象不变
  });

  it('parses path segments (点 + 方括号)', () => {
    // 用于 encode 生成 parId 时校验路径合法性
    expect(getPathValue({
      step1: { send: { userFieldValues: { power: 50 } } },
    }, 'step1.send.userFieldValues.power')).toBe(50);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/features/northbound/__tests__/path-resolver.spec.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现路径解析器**

Create `src/features/northbound/core/path-resolver.ts`:

```ts
/**
 * 点 + 方括号路径解析器(encode/decode 共用)。
 * 支持: `a.b.c` / `arr[0].x` / `step.send.userFieldValues.power`
 *
 * 不引 lodash,自写轻量实现(约 40 行)。
 * encode(取值)和 decode(设值)必须共用本模块,保证两端语法一致。
 */

/** 把路径字符串拆成段: 'a.b[0].c' -> ['a','b','0','c'] */
export function parsePath(path: string): string[] {
  const segments: string[] = [];
  const re = /([^.\[\]]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    if (m[1] !== undefined) segments.push(m[1]);
    else if (m[2] !== undefined) segments.push(m[2]);
  }
  return segments;
}

/** 按路径取值。找不到返回 undefined。 */
export function getPathValue(obj: unknown, path: string): unknown {
  const segs = parsePath(path);
  let cur: unknown = obj;
  for (const seg of segs) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** 按路径设值(不可变,返回新对象)。路径不存在返回原对象。 */
export function setPathValue<T>(obj: T, path: string, value: unknown): T {
  const segs = parsePath(path);
  if (segs.length === 0) return obj;

  function recurse(cur: unknown, idx: number): unknown {
    if (idx === segs.length) return value;
    if (cur == null || typeof cur !== 'object') return cur;
    const seg = segs[idx];
    const isArr = Array.isArray(cur);
    const next = isArr ? [...(cur as unknown[])] : { ...(cur as Record<string, unknown>) };
    const child = recurse((cur as Record<string, unknown>)[seg], idx + 1);
    if (child === undefined && idx + 1 < segs.length) return cur; // 子路径不存在,不创建
    (next as Record<string, unknown>)[seg] = child;
    return next;
  }

  return recurse(obj, 0) as T;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/features/northbound/__tests__/path-resolver.spec.ts`
Expected: PASS — 6/6。

- [ ] **Step 5: Commit**

```bash
git add src/features/northbound/core/path-resolver.ts src/features/northbound/__tests__/path-resolver.spec.ts
git commit -m "feat(northbound): add path resolver (dot+bracket) shared by encode/decode"
```

---

## Task 4: 翻译器 encode/decode(核心)

**Files:**
- Create: `src/features/northbound/core/testcase-sync-translator.ts`
- Test: `src/features/northbound/__tests__/testcase-sync-translator.spec.ts`

- [ ] **Step 1: 写翻译器测试(失败,含往返一致性)**

Create `src/features/northbound/__tests__/testcase-sync-translator.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  encodeTaskTemplateToTestCase,
  decodeTestCaseToTaskDefinition,
  makeOutCaseId,
} from '../core/testcase-sync-translator';
import type { TaskTemplate, CustomerSyncMeta } from '@/features/task/core';
import {
  createTaskDefinition,
  createSendStep,
  createWaitConditionStep,
  createDelayStep,
} from '@/features/task/core';
import type { NorthboundTestCaseConfig, TestCaseInfo, ReportedSnapshot } from '../core/types';

const config: NorthboundTestCaseConfig = {
  subSysId: 'LAS_001',
  subSysName: '激光载荷',
  menuId: 'menu-1',
  menuName: '功能验证',
  caseType: 'orbit',
};

function makeTemplate(overridable: string[]): TaskTemplate {
  const def = createTaskDefinition({
    id: 'def-1',
    name: 'laser-init',
    steps: [
      createSendStep('rc-laser-on', { id: 'step-send', userFieldValues: { power: 50, mode: 1 } }),
      createWaitConditionStep(
        [{ frameId: 'tm-temp', fieldId: 'temp', operator: 'gt', threshold: 80 }],
        { id: 'step-wait', timeoutMs: 5000, onTimeout: 'fail' },
      ),
      createDelayStep(3000, { id: 'step-delay' }),
    ],
    schedule: { kind: 'immediate' },
    errorPolicy: { onFailure: 'stop' },
  });
  const customerSync: CustomerSyncMeta = { enabled: true, overridablePaths: overridable };
  return {
    templateId: 'tpl-1',
    name: '激光初始化',
    tags: ['laser'],
    definition: def,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    customerSync,
  };
}

describe('encodeTaskTemplateToTestCase', () => {
  it('generates inputPars only for whitelisted paths', () => {
    const tpl = makeTemplate([
      'step-send.send.userFieldValues.power',
      'step-delay.delay.durationMs',
    ]);
    const { testCase } = encodeTaskTemplateToTestCase(tpl, config);
    const parIds = testCase.inputPars.map(p => p.parId).sort();
    expect(parIds).toEqual(['step-delay.delay.durationMs', 'step-send.send.userFieldValues.power']);
  });

  it('skips paths not found in definition', () => {
    const tpl = makeTemplate(['step-nonexistent.send.userFieldValues.x']);
    const { testCase } = encodeTaskTemplateToTestCase(tpl, config);
    expect(testCase.inputPars).toHaveLength(0);
  });

  it('fills caseTemplate fields from config', () => {
    const tpl = makeTemplate([]);
    const { testCase } = encodeTaskTemplateToTestCase(tpl, config);
    expect(testCase.caseName).toBe('激光初始化');
    expect(testCase.subSysName).toBe('激光载荷');
    expect(testCase.isParent).toBe(false);
    expect(testCase.outCaseId).toContain('tpl-1');
  });

  it('returns snapshot with deep-copied definition', () => {
    const tpl = makeTemplate([]);
    const { snapshot } = encodeTaskTemplateToTestCase(tpl, config);
    expect(snapshot.templateId).toBe('tpl-1');
    expect(snapshot.definition).not.toBe(tpl.definition); // 不同引用(深拷贝)
    expect(snapshot.definition.steps).toEqual(tpl.definition.steps); // 但内容相等
  });

  it('generates execSteps summary', () => {
    const tpl = makeTemplate([]);
    const { testCase } = encodeTaskTemplateToTestCase(tpl, config);
    expect(testCase.execSteps).toBe('send rc-laser-on; wait-condition tm-temp; delay');
  });
});

describe('decodeTestCaseToTaskDefinition', () => {
  it('overrides whitelisted values', () => {
    const tpl = makeTemplate(['step-send.send.userFieldValues.power']);
    const { snapshot } = encodeTaskTemplateToTestCase(tpl, config);
    const tc: TestCaseInfo = {
      testCaseId: snapshot.outCaseId,
      inputPars: [{ parId: 'step-send.send.userFieldValues.power', value: 99 }],
    };
    const { definition, warnings } = decodeTestCaseToTaskDefinition(tc, snapshot);
    const sendStep = definition.steps[0];
    expect(sendStep.kind).toBe('send');
    if (sendStep.kind === 'send') {
      expect(sendStep.config.userFieldValues?.power).toBe(99);
    }
    expect(warnings).toHaveLength(0);
  });

  it('ignores inputPars not in whitelist + warns', () => {
    const tpl = makeTemplate([]); // 白名单空
    const { snapshot } = encodeTaskTemplateToTestCase(tpl, config);
    const tc: TestCaseInfo = {
      testCaseId: snapshot.outCaseId,
      inputPars: [{ parId: 'step-send.send.userFieldValues.power', value: 99 }],
    };
    const { warnings } = decodeTestCaseToTaskDefinition(tc, snapshot);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].reason).toBe('not-in-whitelist');
  });

  it('preserves non-overridable fields from snapshot', () => {
    const tpl = makeTemplate(['step-send.send.userFieldValues.power']);
    const { snapshot } = encodeTaskTemplateToTestCase(tpl, config);
    const tc: TestCaseInfo = {
      testCaseId: snapshot.outCaseId,
      inputPars: [{ parId: 'step-send.send.userFieldValues.power', value: 99 }],
    };
    const { definition } = decodeTestCaseToTaskDefinition(tc, snapshot);
    // frameId 不可覆盖,应保持快照原值
    const sendStep = definition.steps[0];
    if (sendStep.kind === 'send') {
      expect(sendStep.config.frameId).toBe('rc-laser-on');
      // mode 不在白名单,应保持原值
      expect(sendStep.config.userFieldValues?.mode).toBe(1);
    }
  });

  it('round-trip: encode then decode with no overrides = original', () => {
    const tpl = makeTemplate([
      'step-send.send.userFieldValues.power',
      'step-send.send.userFieldValues.mode',
      'step-wait.wait-condition.conditions[0].threshold',
      'step-delay.delay.durationMs',
    ]);
    const { testCase, snapshot } = encodeTaskTemplateToTestCase(tpl, config);
    // 下发时不改任何值(用 encode 出的 inputPars 原样下回)
    const tc: TestCaseInfo = { testCaseId: snapshot.outCaseId, inputPars: testCase.inputPars };
    const { definition, warnings } = decodeTestCaseToTaskDefinition(tc, snapshot);
    expect(warnings).toHaveLength(0);
    expect(definition.steps).toEqual(tpl.definition.steps);
  });
});

describe('makeOutCaseId', () => {
  it('encodes templateId + timestamp', () => {
    const id = makeOutCaseId('tpl-1', 1700000000000);
    expect(id).toContain('tpl-1');
    expect(id).toContain('1700000000000');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/features/northbound/__tests__/testcase-sync-translator.spec.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现翻译器**

Create `src/features/northbound/core/testcase-sync-translator.ts`:

```ts
import type { TaskTemplate, TaskDefinition, TaskStepDefinition } from '@/features/task/core';
import type { TestCaseInfo, InputPar } from './types';
import type {
  CustomerTestCase,
  NorthboundTestCaseConfig,
  ReportedSnapshot,
  OverrideWarning,
} from './types';
import { getPathValue, setPathValue } from './path-resolver';

/** 生成 outCaseId:绑定 templateId + 上报时间,用于反查快照 */
export function makeOutCaseId(templateId: string, reportedAt: number): string {
  return `${templateId}@${reportedAt}`;
}

/** 生成 execSteps 可读摘要 */
function summarizeExecSteps(steps: readonly TaskStepDefinition[]): string {
  const parts = steps.map(step => {
    if (step.kind === 'send') return `send ${step.config.frameId}`;
    if (step.kind === 'wait-condition') {
      const fc = step.config.conditions[0];
      return `wait-condition ${fc?.frameId ?? ''}`.trim();
    }
    return 'delay';
  });
  return parts.join('; ').slice(0, 200);
}

/** 上报: TaskTemplate → CustomerTestCase + 快照 */
export function encodeTaskTemplateToTestCase(
  template: TaskTemplate,
  config: NorthboundTestCaseConfig,
): { testCase: CustomerTestCase; snapshot: ReportedSnapshot } {
  const reportedAt = Date.now();
  const outCaseId = makeOutCaseId(template.templateId, reportedAt);
  const def = template.definition;

  // 深拷贝 definition 作为快照
  const snapshotDef: TaskDefinition = JSON.parse(JSON.stringify(def));
  const overridablePaths = template.customerSync?.overridablePaths ?? [];

  // 仅为白名单路径生成 inputPars(取不到值的跳过)
  const inputPars: InputPar[] = [];
  for (const path of overridablePaths) {
    // path 格式: {stepId}.{stepKind}.{字段路径}。取值时去掉前两段(stepId.stepKind),从 definition.steps 找 step
    const value = resolveStepPathValue(def, path);
    if (value !== undefined) {
      inputPars.push({ parId: path, value: String(value) });
    }
  }

  const testCase: CustomerTestCase = {
    outCaseId,
    caseName: template.name,
    caseType: config.caseType,
    subSysId: config.subSysId,
    subSysName: config.subSysName,
    menuId: config.menuId,
    menuName: config.menuName,
    depSubSys: config.depSubSys,
    depSubNe: config.depSubNe,
    durate: 600,
    satelliteCount: 1,
    stationCount: 1,
    isParent: false,
    inputPars,
    execSteps: summarizeExecSteps(def.steps),
    remark: template.tags.length > 0 ? template.tags.join(', ') : undefined,
  };

  const snapshot: ReportedSnapshot = {
    outCaseId,
    templateId: template.templateId,
    definition: snapshotDef,
    overridablePaths,
    reportedAt,
  };

  return { testCase, snapshot };
}

/** 按 path 在 definition.steps 里定位 step(by id),校验 stepKind,取字段值 */
function resolveStepPathValue(def: TaskDefinition, path: string): unknown {
  const parts = path.split('.');
  if (parts.length < 3) return undefined;
  const [stepId, stepKind, ...rest] = parts;
  const step = def.steps.find(s => s.id === stepId);
  if (!step) return undefined;
  if (step.kind !== stepKind) return undefined; // stepKind 不匹配
  // 在 step.config 上取 rest 路径
  return getPathValue(step.config, rest.join('.'));
}

/** 下发: TestCaseInfo + 快照 → 覆盖后的 TaskDefinition */
export function decodeTestCaseToTaskDefinition(
  testCaseInfo: TestCaseInfo,
  snapshot: ReportedSnapshot,
): { definition: TaskDefinition; warnings: OverrideWarning[] } {
  const definition: TaskDefinition = JSON.parse(JSON.stringify(snapshot.definition));
  const whitelist = new Set(snapshot.overridablePaths);
  const warnings: OverrideWarning[] = [];

  for (const { parId, value } of testCaseInfo.inputPars ?? []) {
    if (!whitelist.has(parId)) {
      warnings.push({ parId, reason: 'not-in-whitelist', detail: 'path not in overridablePaths' });
      continue;
    }
    const parts = parId.split('.');
    if (parts.length < 3) {
      warnings.push({ parId, reason: 'path-not-found', detail: 'malformed path' });
      continue;
    }
    const [stepId, stepKind, ...rest] = parts;
    const stepIdx = definition.steps.findIndex(s => s.id === stepId);
    if (stepIdx < 0) {
      warnings.push({ parId, reason: 'path-not-found', detail: `step ${stepId} not found` });
      continue;
    }
    const step = definition.steps[stepIdx];
    if (step.kind !== stepKind) {
      warnings.push({ parId, reason: 'type-mismatch', detail: `expected kind ${stepKind}, got ${step.kind}` });
      continue;
    }
    const nextConfig = setPathValue(step.config, rest.join('.'), coerceValue(value));
    definition.steps = definition.steps.map((s, i) => (i === stepIdx ? { ...step, config: nextConfig } : s));
  }

  return { definition, warnings };
}

/** 把 string value 尽量转回原始类型(number/boolean) */
function coerceValue(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  if (value !== '' && !Number.isNaN(num)) return num;
  return value;
}

/** 路径白名单校验工具(给 UI 用) */
export function validateOverridablePath(def: TaskDefinition, path: string): boolean {
  return resolveStepPathValue(def, path) !== undefined;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/features/northbound/__tests__/testcase-sync-translator.spec.ts`
Expected: PASS — 全部(含 round-trip 往返一致性测试)。

- [ ] **Step 5: Commit**

```bash
git add src/features/northbound/core/testcase-sync-translator.ts src/features/northbound/__tests__/testcase-sync-translator.spec.ts
git commit -m "feat(northbound): add testcase-sync translator (encode/decode with path whitelist)"
```

---

## Task 5: getTestCaseAll 接数据源(上报)

**Files:**
- Modify: `src/features/northbound/services/northbound-service.ts`
- Modify: `src/features/northbound/__tests__/northbound-service.spec.ts`

- [ ] **Step 1: 先读现有 handleGetTestCaseAll 实现**

Read `src/features/northbound/services/northbound-service.ts` 约 `:477-497`,理解现有 configuredTestCases + FTP 上传逻辑。

- [ ] **Step 2: 写上报测试(失败)**

在 `northbound-service.spec.ts` 末尾追加:

```ts
  it('getTestCaseAll returns datas from listTemplates with customerSync enabled', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    // 注入一个 enabled 模板 + 一个 disabled 模板
    taskService.listTemplates = vi.fn().mockReturnValue([
      { templateId: 'tpl-on', name: 'On', tags: [], definition: createTaskDefinition({ id:'d', name:'n', steps:[createDelayStep(1000,{id:'s'})], schedule:{kind:'immediate'}, errorPolicy:{onFailure:'stop'} }), createdAt:'', updatedAt:'', customerSync:{ enabled:true, overridablePaths:[] } },
      { templateId: 'tpl-off', name: 'Off', tags: [], definition: createTaskDefinition({ id:'d2', name:'n2', steps:[createDelayStep(1000,{id:'s2'})], schedule:{kind:'immediate'}, errorPolicy:{onFailure:'stop'} }), createdAt:'', updatedAt:'', customerSync:{ enabled:false } },
    ]);
    const service = createNorthboundService(makeOptions({ httpFacade, taskService }));
    const handler = await startAndGetHandler(service, httpFacade);

    const body = JSON.stringify({ method: 'getTestCaseAll', requestId: 1, subSysType:'LAS', subSysId:'LAS_001', sessionId:1 });
    const res = await handler({ method: 'POST', url: '/getTestCaseAll', body });
    const parsed = JSON.parse(res.body);

    expect(parsed.datas).toBeDefined();
    expect(parsed.datas).toHaveLength(1); // 只返回 enabled 的
    expect(parsed.datas[0].caseName).toBe('On');
  });
```

需在 spec 顶部 import `createTaskDefinition, createDelayStep` from `@/features/task/core`。

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run src/features/northbound/__tests__/northbound-service.spec.ts -t "getTestCaseAll returns datas"`
Expected: FAIL — datas undefined(现有 handler 不返回 datas)。

- [ ] **Step 4: 修改 handleGetTestCaseAll**

在 `northbound-service.ts` 找到 `handleGetTestCaseAll`(约 :477),改为:

```ts
async function handleGetTestCaseAll(envelope: InboundEnvelope): Promise<HttpHandlerResponse> {
  // 从 taskService 取 enabled 模板,encode 成 CustomerTestCase
  const allTemplates = options.taskService.listTemplates();
  const enabledTemplates = allTemplates.filter(t => t.customerSync?.enabled === true);
  const testCases = enabledTemplates.map(t => {
    const { testCase, snapshot } = encodeTaskTemplateToTestCase(t, options.testCaseConfig);
    options.reportedSnapshotStorage.save(snapshot);
    return testCase;
  });

  // 保留 FTP 上传(甲方可能双通道获取)
  const ftpInfo = resolveFtpInfo('testcase_all');
  if (ftpInfo) {
    try {
      await options.ftp.uploadFile(ftpInfo.path, JSON.stringify(testCases), 'json');
    } catch (err) {
      console.error('[northbound] testcase_all FTP upload failed', err);
    }
  }

  return buildResponse(envelope, 1, 'ok', { datas: testCases });
}
```

需在 options 注入 `testCaseConfig: NorthboundTestCaseConfig` 和 `reportedSnapshotStorage: ReportedSnapshotStorage`(见 Step 5 wiring)。

`buildResponse` 若不支持第四参数(datas),改为:
```ts
return { statusCode: 200, body: JSON.stringify({ ...buildResponseBase(envelope, 1, 'ok'), datas: testCases }) };
```
(按现有 buildResponse 实际签名调整。)

- [ ] **Step 5: 注入 options(testCaseConfig + reportedSnapshotStorage)**

在 `makeOptions` / `NorthboundServiceOptions` 类型加:
```ts
testCaseConfig: NorthboundTestCaseConfig;
reportedSnapshotStorage: ReportedSnapshotStorage;
```

在测试 `makeOptions` 里补默认值。在 feature-wiring.ts 生产装配里补真实实例(用 NorthboundConfig 派生 testCaseConfig + createReportedSnapshotStorage())。

- [ ] **Step 6: 运行测试确认通过**

Run: `npx vitest run src/features/northbound/__tests__/northbound-service.spec.ts -t "getTestCaseAll returns datas"`
Expected: PASS。

- [ ] **Step 7: 跑全部 northbound 测试确认无回归**

Run: `npx vitest run src/features/northbound`
Expected: 全 PASS(除已知预存的 heartbeat-timer 失败)。

- [ ] **Step 8: Commit**

```bash
git add src/features/northbound/services/northbound-service.ts src/features/northbound/__tests__/northbound-service.spec.ts src/runtime/feature-wiring.ts
git commit -m "feat(northbound): getTestCaseAll returns encoded templates + saves snapshots"
```

---

## Task 6: setTestTask 接翻译层(下发)

**Files:**
- Modify: `src/features/northbound/services/northbound-service.ts`
- Modify: `src/features/northbound/__tests__/northbound-service.spec.ts`

- [ ] **Step 1: 写下发覆盖测试(失败)**

在 spec 追加:

```ts
  it('setTestTask decodes testCase with parameter override', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService }));
    const handler = await startAndGetHandler(service, httpFacade);

    // 先上报一个模板(存快照)
    const snapshot: ReportedSnapshot = {
      outCaseId: 'tpl-x@1000',
      templateId: 'tpl-x',
      definition: createTaskDefinition({ id:'d', name:'n', steps:[createSendStep('rc-laser-on',{id:'step-send', userFieldValues:{power:50}})], schedule:{kind:'immediate'}, errorPolicy:{onFailure:'stop'} }),
      overridablePaths: ['step-send.send.userFieldValues.power'],
      reportedAt: 1000,
    };
    makeOptions({ httpFacade, taskService }).reportedSnapshotStorage.save(snapshot);

    const body = JSON.stringify({
      method: 'setTestTask', requestId: 1, subSysType:'LAS', subSysId:'LAS_001', sessionId:1,
      taskId:'T1', immediate:true, repeatCount:1, isEnd:true, resources:[],
      testCaseInfo: [{ testCaseId: 'tpl-x@1000', inputPars: [{ parId: 'step-send.send.userFieldValues.power', value: '99' }] }],
      executionPlan: { layers: [{ layer:1, parallel:false, nodes:['tpl-x@1000'] }] },
    });
    await handler({ method: 'POST', url: '/setTestTask', body });
    await vi.waitFor(() => expect(taskService.createTask).toHaveBeenCalled());

    const createdDef = taskService.createTask.mock.calls[0][0];
    const sendStep = createdDef.steps[0];
    expect(sendStep.kind).toBe('send');
    if (sendStep.kind === 'send') {
      expect(sendStep.config.userFieldValues?.power).toBe(99); // 被覆盖
    }
  });
```

需 import `createSendStep, createTaskDefinition` 和 `ReportedSnapshot` 类型。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/features/northbound/__tests__/northbound-service.spec.ts -t "decodes testCase"`
Expected: FAIL — 仍用 mock(1.5s delay),power 不会被覆盖。

- [ ] **Step 3: 修改 createAndStartTask 接 decode**

在 `northbound-service.ts` 约 :323 `createAndStartTask`,把 translator 调用改为:

```ts
function createAndStartTask(tc: TestCaseInfo, customerTaskId: string): Promise<{ readonly instanceId: string }> {
  // 按 testCaseId(=outCaseId)反查快照
  const snapshot = options.reportedSnapshotStorage.load(tc.testCaseId);
  let definition: TaskDefinition;
  let warnings: OverrideWarning[] = [];

  if (snapshot) {
    const decoded = decodeTestCaseToTaskDefinition(tc, snapshot);
    definition = decoded.definition;
    warnings = decoded.warnings;
    if (warnings.length > 0) {
      console.warn('[northbound] override warnings for', tc.testCaseId, warnings);
      // warnings 附到 northbound-state 供报告使用
      state.recordOverrideWarnings(tc.testCaseId, warnings);
    }
  } else {
    // 快照缺失:创建立即 fail 的占位实例
    definition = createPlaceholderFailDefinition(tc.testCaseId);
    console.error('[northbound] snapshot missing for', tc.testCaseId, '- task will fail immediately');
    state.recordSnapshotMissing(tc.testCaseId);
  }

  const instanceId = options.taskService.createTask(definition);
  options.taskService.startTask(instanceId);
  // ... 原 subscribe onSettled 逻辑不变
  return Promise.resolve({ instanceId });
}

function createPlaceholderFailDefinition(testCaseId: string): TaskDefinition {
  // 一个不执行的空实例:立即 fail。保留 mock 函数语义改为"错误占位"
  return createTaskDefinition({
    id: `nb-missing-${testCaseId}-${Date.now()}`,
    name: `snapshot-missing:${testCaseId}`,
    steps: [createDelayStep(1, { id: 'step-placeholder' })],
    schedule: { kind: 'immediate' },
    errorPolicy: { onFailure: 'stop' },
  });
}
```

注意:verdict=fail 的处理在 reportTaskResult 处(state.snapshotMissing 的实例 → verdictMap 走 fail + msg 标注)。需在 reportTaskResult 加判断:`if (state.isSnapshotMissing(instanceId)) verdict = 'failed'`。

- [ ] **Step 4: northbound-state 加 warning/missing 记录方法**

在 `northbound-state.ts` 加:
```ts
recordOverrideWarnings(testCaseId: string, warnings: OverrideWarning[]): void;
recordSnapshotMissing(testCaseId: string): void;
isSnapshotMissing(testCaseId: string): boolean;
getOverrideWarnings(testCaseId: string): OverrideWarning[];
```

实现:用 Map 存储。

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/features/northbound/__tests__/northbound-service.spec.ts -t "decodes testCase"`
Expected: PASS — power=99。

- [ ] **Step 6: 跑全部测试无回归**

Run: `npx vitest run src/features/northbound`
Expected: 全 PASS(除 heartbeat-timer 预存失败)。

- [ ] **Step 7: Commit**

```bash
git add src/features/northbound/services/northbound-service.ts src/features/northbound/services/northbound-state.ts src/features/northbound/__tests__/northbound-service.spec.ts
git commit -m "feat(northbound): setTestTask decodes via translator with param override + snapshot-missing fail"
```

---

## Task 7: 报告数据收集器 + GenerateTestReportInput 扩展

**Files:**
- Modify: `src/features/northbound/core/test-report-generator.ts`
- Create: `src/features/northbound/services/report-data-collector.ts`
- Test: `src/features/northbound/__tests__/report-data-collector.spec.ts`
- Modify: `src/features/northbound/services/northbound-service.ts`

- [ ] **Step 1: 扩展 GenerateTestReportInput**

在 `test-report-generator.ts` 找到 `GenerateTestReportInput`(:99),加可选字段:

```ts
export interface GenerateTestReportInput {
  // ... 现有字段
  readonly collectedCheckPoints?: readonly TestReportCheckPoint[];
  readonly collectedProcessSteps?: readonly TestReportProcessAndData[];
  readonly collectedDeviceIds?: readonly string[];
}
```

修改 `generateTestReport`(:108),优先用 collected:
```ts
export function generateTestReport(input: GenerateTestReportInput): string {
  const checkPoints = input.collectedCheckPoints ?? input.mockConfig?.checkPointDefs ?? DEFAULT_MOCK_CONFIG.checkPointDefs;
  const processSteps = input.collectedProcessSteps ?? input.mockConfig?.processSteps ?? DEFAULT_MOCK_CONFIG.processSteps;
  const deviceIds = input.collectedDeviceIds ?? input.mockConfig?.deviceIds ?? DEFAULT_MOCK_CONFIG.deviceIds;
  // ... 用 checkPoints/processSteps/deviceIds 组装
}
```

- [ ] **Step 2: 写收集器测试(失败)**

Create `src/features/northbound/__tests__/report-data-collector.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createReportDataCollector } from '../services/report-data-collector';
import type { TaskStepResult } from '@/features/task/core';

describe('report-data-collector', () => {
  it('accumulates processSteps from send results', () => {
    const c = createReportDataCollector();
    const result: TaskStepResult = { stepIndex: 0, iteration: 0, kind: 'send', sendResult: { /* minimal */ } as any };
    c.onStepResult('inst-1', result);
    const data = c.collect('inst-1');
    expect(data.processSteps.length).toBeGreaterThanOrEqual(1);
  });

  it('accumulates checkPoints from wait results', () => {
    const c = createReportDataCollector();
    const result: TaskStepResult = { stepIndex: 1, iteration: 0, kind: 'wait-condition', matched: true, matchedValue: 85, timedOut: false };
    c.onStepResult('inst-1', result);
    const data = c.collect('inst-1');
    expect(data.checkPoints.length).toBeGreaterThanOrEqual(1);
  });

  it('clears data after collect', () => {
    const c = createReportDataCollector();
    c.onStepResult('inst-1', { stepIndex:0, iteration:0, kind:'delay', completed:true });
    c.collect('inst-1');
    expect(c.collect('inst-1').processSteps).toHaveLength(0);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run src/features/northbound/__tests__/report-data-collector.spec.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 4: 实现收集器**

Create `src/features/northbound/services/report-data-collector.ts`:

```ts
import type { TaskStepResult, TaskInstanceState } from '@/features/task/core';
import type { TestReportCheckPoint, TestReportProcessAndData } from '../core/test-report-generator';

export interface CollectedReportData {
  readonly processSteps: readonly TestReportProcessAndData[];
  readonly checkPoints: readonly TestReportCheckPoint[];
}

export interface ReportDataCollector {
  onStepResult(instanceId: string, result: TaskStepResult): void;
  collect(instanceId: string): CollectedReportData;
}

export function createReportDataCollector(): ReportDataCollector {
  const store = new Map<string, { processSteps: TestReportProcessAndData[]; checkPoints: TestReportCheckPoint[] }>();

  function bucket(instanceId: string) {
    let b = store.get(instanceId);
    if (!b) { b = { processSteps: [], checkPoints: [] }; store.set(instanceId, b); }
    return b;
  }

  return {
    onStepResult(instanceId, result) {
      const b = bucket(instanceId);
      if (result.kind === 'send') {
        b.processSteps.push({
          // 映射 sendResult → processAndData 字段(按 TestReportProcessAndData 结构)
          stepName: `step-${result.stepIndex}`,
          result: 'success',
          // ... 其余字段从 sendResult.resolvedFieldValues 推导
        } as TestReportProcessAndData);
      } else if (result.kind === 'wait-condition') {
        b.checkPoints.push({
          checkPointName: `step-${result.stepIndex}`,
          expect: '',
          measure: result.matchedValue != null ? String(result.matchedValue) : '',
          result: result.matched ? 'success' : 'fail',
        } as TestReportCheckPoint);
      }
    },
    collect(instanceId) {
      const b = store.get(instanceId);
      const data: CollectedReportData = {
        processSteps: b?.processSteps ?? [],
        checkPoints: b?.checkPoints ?? [],
      };
      store.delete(instanceId); // 收集后清理
      return data;
    },
  };
}
```

注:`TestReportProcessAndData` / `TestReportCheckPoint` 的确切字段以 test-report-generator.ts:7-23 为准,实施时对齐。

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/features/northbound/__tests__/report-data-collector.spec.ts`
Expected: PASS。

- [ ] **Step 6: 接入 northbound-service**

在 `northbound-service.ts`:
- options 加 `reportDataCollector: ReportDataCollector`
- onStepResult 订阅(:636)里,除了 translateStepResult(msgReport),也调 `reportDataCollector.onStepResult`
- uploadTestReportAndNotify(:157)调 generateTestReport 前,先 `collector.collect(instanceId)` 取数据,作为 collectedCheckPoints/collectedProcessSteps 传入

- [ ] **Step 7: 跑全部测试无回归 + Commit**

Run: `npx vitest run src/features/northbound`
Expected: 全 PASS(除 heartbeat-timer)。

```bash
git add src/features/northbound/core/test-report-generator.ts src/features/northbound/services/report-data-collector.ts src/features/northbound/services/northbound-service.ts src/features/northbound/__tests__/report-data-collector.spec.ts
git commit -m "feat(northbound): report data collector + feed real data to TestReport.json"
```

---

## Task 8: UI(模板上报开关 + 实例来源标识)

**Files:**
- Modify: `src/features/task/components/TemplateListPage.vue`
- Modify: `src/features/task/components/ExecutionListPage.vue`
- Modify: `src/features/task/core/types.ts`(TaskInstanceState.source?)

- [ ] **Step 1: TaskInstanceState 加 source 字段**

在 `types.ts:168` TaskInstanceState 加:
```ts
export interface TaskInstanceState {
  // ... 现有字段
  readonly source?: 'local' | 'northbound';
  readonly customerTaskId?: string;
}
```

- [ ] **Step 2: northbound createTask 时标 source='northbound'**

在 northbound-service.ts createAndStartTask,创建实例后标记 source(通过 taskService 的 update 或在 createTask options 传入)。本地创建的默认 source='local'。

- [ ] **Step 3: ExecutionListPage 加来源列**

在表格加一列:
```vue
<q-td key="source" :props="props">
  <q-badge :color="props.row.source === 'northbound' ? 'blue' : 'grey'">
    {{ props.row.source === 'northbound' ? '甲方' : '本地' }}
  </q-badge>
</q-td>
```
columns 定义加 `{ name: 'source', label: '来源', field: 'source' }`。

- [ ] **Step 4: TemplateListPage 加上报开关 + 白名单编辑**

在模板编辑区加:
```vue
<q-toggle v-model="customerSyncEnabled" label="上报给甲方" />
<!-- 白名单路径编辑:简单文本输入(每行一个路径),后续可优化为树选择 -->
<q-input v-model="overridablePathsText" type="textarea"
  label="可覆盖字段路径(每行一个,如 step-send.send.userFieldValues.power)"
  :disable="!customerSyncEnabled" />
```
保存时把 overridablePathsText 按换行拆成数组,存入 template.customerSync。

- [ ] **Step 5: 手动验证 UI**

Run: `npm run dev`,在 TaskManagePage:
- 创建模板,勾选"上报给甲方",填路径,保存 → 刷新后保留
- 启动一个本地任务 → ExecutionListPage 显示"本地"
- (甲方下发需联调,本地难模拟,但 source 字段逻辑可单测)

- [ ] **Step 6: Commit**

```bash
git add src/features/task/core/types.ts src/features/task/components/TemplateListPage.vue src/features/task/components/ExecutionListPage.vue src/features/northbound/services/northbound-service.ts
git commit -m "feat(task): UI for customer sync toggle + instance source badge"
```

---

## 完成后

- 跑全部测试:`npx vitest run src/features/northbound src/features/task`
- 类型检查:`npx tsc --noEmit`
- 更新治理文档(topic-index 标 H009/H010/H011/H012 合并完成,引用本 plan)

## 风险提醒(实施时注意)

1. `buildResponse` 的确切签名需对齐现有实现(Task 5 Step 4)
2. `TestReportProcessAndData` / `TestReportCheckPoint` 的字段以 test-report-generator.ts:7-23 为准(Task 7 Step 4)
3. controlTestTask action 种类待联调实测,现按四种实现
4. 8800 端口 vs 80 待联调确认
