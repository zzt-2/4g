import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readJsonWithBackup, writeJsonWithBackup, type JsonReadResult } from '../json-storage';

/**
 * 损坏恢复测试(S012 根因 A2):主文件损坏时尝试 .bak 恢复。
 * 核心场景:"用户某次写入前留了 .bak,主文件损坏 → 恢复 .bak,数据不丢"。
 */
describe('readJsonWithBackup', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'json-storage-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function readViaFs(filePath: string): Promise<JsonReadResult> {
    // 直接走真实文件系统的 reader,绕过 fileFacade 抽象(本测试验证纯 fs 行为)。
    return readJsonWithBackup({
      async readTextFile(p: string) {
        return fs.readFile(p, 'utf-8');
      },
    }, filePath);
  }

  it('主文件正常 → 返回 ok + value', async () => {
    const target = path.join(dir, 'frames.json');
    await fs.writeFile(target, JSON.stringify({ frames: [{ id: 'a' }] }), 'utf-8');

    const result = await readViaFs(target);

    expect(result.status).toBe('ok');
    expect((result as { value: unknown }).value).toEqual({ frames: [{ id: 'a' }] });
  });

  it('主文件不存在(ENOENT) → 返回 missing,不尝试 bak', async () => {
    const target = path.join(dir, 'nope.json');

    const result = await readViaFs(target);

    expect(result.status).toBe('missing');
  });

  it('主文件损坏(JSON 解析失败) + bak 完整 → 恢复 bak,返回 ok', async () => {
    const target = path.join(dir, 'frames.json');
    await fs.writeFile(target, '{CORRUPTED JSON<<<', 'utf-8');
    await fs.writeFile(`${target}.bak`, JSON.stringify({ frames: [{ id: 'recovered' }] }), 'utf-8');

    const result = await readViaFs(target);

    expect(result.status).toBe('recovered');
    expect((result as { value: unknown }).value).toEqual({ frames: [{ id: 'recovered' }] });
  });

  it('主+备都损坏 → 返回 corrupted(不静默吞错,日志可观测)', async () => {
    const target = path.join(dir, 'frames.json');
    await fs.writeFile(target, '{CORRUPT', 'utf-8');
    await fs.writeFile(`${target}.bak`, '{ALSO BAD', 'utf-8');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await readViaFs(target);

    expect(result.status).toBe('corrupted');
    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join(' ');
    expect(logged).toContain('CORRUPTED');
    errorSpy.mockRestore();
  });
});

describe('writeJsonWithBackup', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'json-storage-w-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function writeViaFs(filePath: string, value: unknown): Promise<void> {
    return writeJsonWithBackup({
      async readTextFile(p: string) {
        return fs.readFile(p, 'utf-8');
      },
      async writeTextFile(p: string, c: string) {
        // 用真实原子写(复用 atomic-write),确保 .bak 是上次完整内容
        const { atomicWriteFile } = await import('../atomic-write');
        await atomicWriteFile(p, c);
      },
    }, filePath, value);
  }

  it('目标不存在 → 直接写,不留 .bak(无旧内容可备份)', async () => {
    const target = path.join(dir, 'frames.json');

    await writeViaFs(target, { frames: [{ id: 'a' }] });

    const entries = await fs.readdir(dir);
    expect(entries).toEqual(['frames.json']);
  });

  it('目标已有旧内容 → 写前备份到 .bak(下次主文件损坏可恢复)', async () => {
    const target = path.join(dir, 'frames.json');
    await fs.writeFile(target, JSON.stringify({ frames: [{ id: 'old' }] }), 'utf-8');

    await writeViaFs(target, { frames: [{ id: 'new' }] });

    expect(await fs.readFile(target, 'utf-8')).toContain('"new"');
    expect(await fs.readFile(`${target}.bak`, 'utf-8')).toContain('"old"');
  });

  it('连续两次写 → .bak 始终是上一次的完整内容(滑动备份)', async () => {
    const target = path.join(dir, 'frames.json');

    await writeViaFs(target, { v: 1 });
    await writeViaFs(target, { v: 2 });
    await writeViaFs(target, { v: 3 });

    expect(await fs.readFile(target, 'utf-8')).toContain('"v": 3');
    expect(await fs.readFile(`${target}.bak`, 'utf-8')).toContain('"v": 2');
  });
});
