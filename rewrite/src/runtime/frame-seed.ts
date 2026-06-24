import type { JsonReadResult } from '@/shared/utils/json-storage';

/**
 * 帧定义 seed 决策(S012 根因 B)。
 *
 * 核心问题:frames.json 缺失/损坏/空时,要不要 seed 默认帧?
 * 历史上 H005 报过"不点帧定义页就没帧可用",根因 A 损坏也表现为空,
 * 用户需要"首次启动有默认帧可用"。但绝不能每次启动覆盖——用户清空帧后,
 * 下次启动又被塞回很烦。
 *
 * 区分"首次空"vs"用户主动清空":用 `.frames-initialized` 标记文件。
 *   - 标记不存在 = 从未 seed 过 = "首次空" → seed(然后写标记)
 *   - 标记存在 = 之前 seed 过/用户用过 = "用户清空" → 不 seed
 *
 * 决策矩阵(read = frames.json 读取结果,initialized = 标记是否存在):
 *   read=missing/corrupted + 未初始化 → seed
 *   read=ok/recovered 且 frames 非空 → 不 seed(无论初始化态,有数据就不覆盖)
 *   read=ok/recovered 且 frames 空 + 已初始化 → 不 seed(用户清空)
 *   read=ok/recovered 且 frames 空 + 未初始化 → seed(首次安装,bak 救回的也是空)
 *
 * 这是纯函数,bootstrap 调它决定是否 seed,seed 动作(读默认帧+replaceFrames+写标记)在 bootstrap。
 */

export interface FrameSeedContext {
  /** `.frames-initialized` 标记是否存在(是否之前 seed/用过)。 */
  readonly initialized: boolean;
}

/** 判断 frames 读取结果里的 frames 数组是否为空。 */
function isFramesValueEmpty(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true;
  const frames = (value as { frames?: unknown }).frames;
  return !Array.isArray(frames) || frames.length === 0;
}

/**
 * 决定是否需要 seed 默认帧。
 *
 * @param readResult frames.json 的读取结果(含 ok/recovered/missing/corrupted)
 * @param ctx initialized 标记状态
 * @returns true = 应 seed;false = 不 seed
 */
export function decideFrameSeed(
  readResult: JsonReadResult,
  ctx: FrameSeedContext,
): boolean {
  const { initialized } = ctx;

  // 有可读数据(主文件 ok 或损坏恢复 bak 成功):看数据是否非空
  if (readResult.status === 'ok' || readResult.status === 'recovered') {
    if (!isFramesValueEmpty(readResult.value)) {
      // 有帧 → 永不覆盖用户数据
      return false;
    }
    // 数据为空:首次(seed)或用户清空(不 seed)
    return !initialized;
  }

  // missing(ENOENT)或 corrupted(主+备都坏):
  // 未初始化 → seed(首次安装 / 全新机器);已初始化 → 不 seed(用户上次删光了)
  return !initialized;
}
