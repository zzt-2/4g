import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 原子写文件:先写临时文件再 rename 覆盖目标。
 *
 * 为什么:直接 `fs.writeFile` 写到一半进程崩溃,会留下半截损坏 JSON,下次启动
 * safeReadJson 解析失败丢数据。原子写保证目标文件要么是旧完整内容,要么是新完整
 * 内容,绝不出现半截。
 *
 * 实现要点:
 * - 临时文件用 `目标路径 + '.tmp'` 同目录(rename 跨分区才原子,同目录必同分区)。
 * - Windows 上 `fs.rename` 目标已存在会失败(POSIX 是原子替换),用 try/catch
 *   兜底:rename 失败 → unlink 目标 → 再 rename 一次。
 * - 写 tmp 前先 mkdir 父目录(透明复用原 handleWriteTextFile 的语义)。
 *
 * 注意:本函数不保证写前留 .bak 备份。备份逻辑在调用侧(persistence/rewriteRuntime
 * 的 safeReadJson 恢复路径)按需做。这里只管"单次写原子"。
 */
export async function atomicWriteFile(targetPath: string, content: string): Promise<void> {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${targetPath}.tmp`;

  // 先写完整内容到 tmp(写中途崩溃只会留半截 tmp,目标文件不受影响)。
  await fs.writeFile(tmpPath, content, 'utf-8');

  // rename 覆盖目标。POSIX 上 rename 是原子替换;Windows 上目标存在会抛 EPERM,
  // 兜底:先尝试 rename,失败则 unlink 目标后重试。
  try {
    await fs.rename(tmpPath, targetPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'EPERM' || code === 'ENOTEMPTY' || code === 'EACCES') {
      // Windows:目标存在导致 rename 失败,删目标后重试。
      await fs.unlink(targetPath).catch(() => {
        // 目标本就不存在(ENOENT),忽略,继续 rename。
      });
      await fs.rename(tmpPath, targetPath);
    } else {
      // 其他错误(磁盘满等),清理 tmp 后重新抛出,不污染目标。
      await fs.unlink(tmpPath).catch(() => {});
      throw err;
    }
  }
}
