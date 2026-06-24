/**
 * 带备份的 JSON 读写(S012 根因 A2)。
 *
 * 设计动机:旧 safeReadJson 损坏时 catch 返回 null,bootstrap 静默降级为空,
 * 用户数据"丢了"却看不到为什么。本模块三件事治本:
 *   1. 写前把上次完整内容备份到 `.bak`(滑动备份:每次写都更新 .bak 为当前主文件)。
 *   2. 读时主文件损坏 → 尝试 .bak 恢复,返回 `recovered` 让上层知道走了备份。
 *   3. 主+备都损坏 → 返回 `corrupted` 并 console.error 明显日志,不静默吞错。
 *
 * 依赖最小 file 抽象(只读/只写文本),不耦合具体 FileFacade,便于单测用真实 fs。
 * 写的原子性由上层 fileFacade.writeTextFile 保证(main 进程已透明走 atomic-write A1)。
 */

export interface JsonFileAccess {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
}

export type JsonReadResult =
  | { status: 'ok'; value: unknown }
  | { status: 'recovered'; value: unknown }
  | { status: 'missing' }
  | { status: 'corrupted'; error: string };

function isEnoent(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ENOENT') return true;
  // fileFacade.readTextFile 在 main 进程是 fs.readFile,ENOENT 会带 code;
  // 但若链路异常只给 message,也兜底匹配字符串(旧 safeReadJson 就是这么判的)。
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('ENOENT');
}

async function tryReadAndParse(
  access: JsonFileAccess,
  filePath: string,
): Promise<{ kind: 'ok'; value: unknown } | { kind: 'missing' } | { kind: 'corrupted'; error: string }> {
  try {
    const text = await access.readTextFile(filePath);
    const value = JSON.parse(text) as unknown;
    return { kind: 'ok', value };
  } catch (err) {
    if (isEnoent(err)) return { kind: 'missing' };
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: 'corrupted', error: msg };
  }
}

/**
 * 读 JSON,主文件损坏时尝试 `.bak` 恢复。
 * - 主文件正常 → `ok`
 * - 主文件不存在(ENOENT) → `missing`(不尝试 bak:bak 是主文件的备份,主都没 bak 更没有)
 * - 主文件损坏 + bak 可读 → `recovered`(走备份,数据不丢)
 * - 主+备都损坏/主损坏+bak 不存在 → `corrupted`(显眼日志,不静默)
 */
export async function readJsonWithBackup(
  access: JsonFileAccess,
  filePath: string,
): Promise<JsonReadResult> {
  const primary = await tryReadAndParse(access, filePath);

  if (primary.kind === 'ok') return { status: 'ok', value: primary.value };
  if (primary.kind === 'missing') return { status: 'missing' };

  // primary.kind === 'corrupted':主文件坏了,试 .bak 恢复。
  const backup = await tryReadAndParse(access, `${filePath}.bak`);
  if (backup.kind === 'ok') {
    console.warn(`[persistence] primary ${filePath} corrupted, recovered from .bak`);
    return { status: 'recovered', value: backup.value };
  }

  // bak 也坏或不存在 → 真丢了,显眼日志让可观测。
  console.error(
    `[persistence] CORRUPTED: ${filePath} — primary error: ${primary.error}; backup unavailable (${backup.kind}), data lost`,
  );
  return { status: 'corrupted', error: primary.error };
}

/**
 * 写 JSON,写前把当前主文件(若存在)复制到 `.bak`。
 * 写本身经 access.writeTextFile(上层 fileFacade 已透明走原子写 A1),保证主文件不半截。
 *
 * 备份失败不阻塞写入(bak 只是恢复兜底,写不下来比 bak 丢更要命)。
 * 备份走同一个 access.writeTextFile 抽象,保持可注入性 + 测试 fake 可捕获。
 */
export async function writeJsonWithBackup(
  access: JsonFileAccess,
  filePath: string,
  value: unknown,
): Promise<void> {
  // 先把上次完整内容备份到 .bak(若主文件存在)。
  try {
    const existing = await access.readTextFile(filePath);
    await access.writeTextFile(`${filePath}.bak`, existing);
  } catch (err) {
    // 主文件不存在(首次写)或其他读取错误 → 跳过备份,不阻塞主写。
    if (!isEnoent(err)) {
      console.warn(`[persistence] backup failed for ${filePath}:`, err instanceof Error ? err.message : err);
    }
  }

  const text = JSON.stringify(value, null, 2);
  await access.writeTextFile(filePath, text);
}
