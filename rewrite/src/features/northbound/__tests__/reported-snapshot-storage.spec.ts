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
