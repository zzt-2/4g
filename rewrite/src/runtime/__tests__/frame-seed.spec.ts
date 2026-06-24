import { describe, it, expect } from 'vitest';
import { decideFrameSeed } from '../frame-seed';

/**
 * 帧定义 seed 决策测试(S012 根因 B)。
 *
 * 核心约束:只在该 seed 时 seed,绝不覆盖用户已清空的数据。
 * 用 `.frames-initialized` 标记区分"首次空"(标记不存在 → seed)vs"用户清空"(标记存在 → 不 seed)。
 */

describe('decideFrameSeed', () => {
  it('frames 文件不存在(ENOENT)+ 未初始化过 → seed', () => {
    expect(decideFrameSeed({ status: 'missing' }, { initialized: false })).toBe(true);
  });

  it('frames 文件损坏(无法恢复)+ 未初始化过 → seed', () => {
    expect(decideFrameSeed({ status: 'corrupted' }, { initialized: false })).toBe(true);
  });

  it('frames 文件存在但 frames 数组为空 + 未初始化过 → seed(首次安装)', () => {
    expect(decideFrameSeed({ status: 'ok', value: { frames: [] } }, { initialized: false })).toBe(true);
  });

  it('frames 文件存在且非空 → 不 seed(用户有数据)', () => {
    expect(
      decideFrameSeed({ status: 'ok', value: { frames: [{ id: 'x' }] } }, { initialized: false }),
    ).toBe(false);
  });

  it('frames 文件不存在 + 已初始化过 → 不 seed(用户删光了)', () => {
    expect(decideFrameSeed({ status: 'missing' }, { initialized: true })).toBe(false);
  });

  it('frames 文件损坏 + 已初始化过 → 不 seed(用户上次清空,这次损坏也不强行塞回)', () => {
    expect(decideFrameSeed({ status: 'corrupted' }, { initialized: true })).toBe(false);
  });

  it('frames 为空 + 已初始化过 → 不 seed(用户主动清空)', () => {
    expect(decideFrameSeed({ status: 'ok', value: { frames: [] } }, { initialized: true })).toBe(false);
  });

  it('从备份恢复的数据(recovered)非空 → 不 seed(数据已救回)', () => {
    expect(
      decideFrameSeed({ status: 'recovered', value: { frames: [{ id: 'saved' }] } }, { initialized: false }),
    ).toBe(false);
  });

  it('从备份恢复的数据(recovered)为空 + 未初始化 → seed(备份救回的是空,仍首次)', () => {
    expect(decideFrameSeed({ status: 'recovered', value: { frames: [] } }, { initialized: false })).toBe(true);
  });
});
