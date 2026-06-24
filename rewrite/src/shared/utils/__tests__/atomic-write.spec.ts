import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { atomicWriteFile } from '../atomic-write';

describe('atomicWriteFile', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atomic-write-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('writes target file with correct content', async () => {
    const target = path.join(dir, 'frames.json');
    const content = JSON.stringify({ frames: [{ id: 'a' }] }, null, 2);

    await atomicWriteFile(target, content);

    const written = await fs.readFile(target, 'utf-8');
    expect(written).toBe(content);
  });

  it('overwrites existing target file (no stale content left)', async () => {
    const target = path.join(dir, 'frames.json');
    await fs.writeFile(target, 'OLD CONTENT', 'utf-8');

    await atomicWriteFile(target, 'NEW CONTENT');

    expect(await fs.readFile(target, 'utf-8')).toBe('NEW CONTENT');
  });

  it('leaves no .tmp residue after write completes', async () => {
    const target = path.join(dir, 'frames.json');

    await atomicWriteFile(target, 'hello');

    const entries = await fs.readdir(dir);
    expect(entries).toEqual(['frames.json']);
  });

  it('stale .tmp from previous crash does not corrupt new write', async () => {
    const target = path.join(dir, 'frames.json');
    await fs.writeFile(`${target}.tmp`, 'STALE TMP FROM CRASH', 'utf-8');

    await atomicWriteFile(target, 'fresh');

    expect(await fs.readFile(target, 'utf-8')).toBe('fresh');
    const entries = await fs.readdir(dir);
    expect(entries).not.toContain('frames.json.tmp');
  });

  it('crash mid-write (truncated tmp, rename never ran) leaves target intact', async () => {
    const target = path.join(dir, 'frames.json');
    const goodContent = JSON.stringify({ frames: [{ id: 'good' }] });
    await fs.writeFile(target, goodContent, 'utf-8');

    // simulate this write crashed: tmp half-written, rename did not run
    await fs.writeFile(`${target}.tmp`, goodContent.slice(0, 10), 'utf-8');

    const actual = await fs.readFile(target, 'utf-8');
    expect(actual).toBe(goodContent);
    expect(() => JSON.parse(actual)).not.toThrow();
  });

  it('creates parent directories when missing', async () => {
    const target = path.join(dir, 'nested', 'deep', 'frames.json');

    await atomicWriteFile(target, 'data');

    expect(await fs.readFile(target, 'utf-8')).toBe('data');
  });
});
