import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

/**
 * FTP handler 单测(S016 续:source.once bug 修复验证)。
 *
 * bug:旧代码传 Buffer 给 basic-ftp uploadFrom,而 basic-ftp 内部调 source.once
 * (stream API),Buffer 无此方法 → 抛 "source.once is not a function"。
 * fix:Readable.from(content) 包成 stream。
 *
 * 本测试 mock basic-ftp 模块,捕获 uploadFrom 实参,断言它是 Readable stream
 * (有 .once、能读出 content),而不是 Buffer。
 */

// --- mock basic-ftp ---

interface CapturedCall {
  accessArgs: unknown;
  uploadArgs: { source: unknown; remotePath: string };
  ensureDirArgs?: string[];
}

function makeMockClient(captured: CapturedCall) {
  return {
    access: vi.fn(async (args: unknown) => {
      captured.accessArgs = args;
    }),
    uploadFrom: vi.fn(async (source: unknown, remotePath: string) => {
      captured.uploadArgs = { source, remotePath };
      // 模拟 basic-ftp 内部:它消费 stream。但这里不主动 resume——留给断言去读
      // (resume 会排尽 stream,断言再读就是空)。真实 basic-ftp 在这里调 source.once
      // 会抛 TypeError(若 source 是 Buffer)。本 mock 不复现那个抛错,靠断言验类型。
    }),
    ensureDir: vi.fn(async (dirPath: string) => {
      if (!captured.ensureDirArgs) captured.ensureDirArgs = [];
      captured.ensureDirArgs.push(dirPath);
    }),
    close: vi.fn(),
  };
}

vi.mock('basic-ftp', () => ({
  Client: vi.fn(),
}));

// 动态 import,让 mock 生效
const { uploadFileContent } = await import('../ftp-handlers');
const basicFtp = await import('basic-ftp');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('uploadFileContent - 传 Readable stream 而非 Buffer(防 source.once bug 复发)', () => {
  it('uploadFrom 收到的是 Readable stream(有 .once 方法)', async () => {
    const captured: CapturedCall = {} as CapturedCall;
    const mockClient = makeMockClient(captured);
    vi.mocked(basicFtp.Client).mockImplementation(() => mockClient as never);

    await uploadFileContent({
      host: '127.0.0.1',
      port: 21,
      username: 'u',
      password: 'p',
      remotePath: '/test/file.json',
      content: '{"hello":"world"}',
    });

    const source = captured.uploadArgs.source;
    // 核心断言:必须是 Readable stream(basic-ftp 内部调 source.once,Buffer 没有会崩)
    expect(source).toBeInstanceOf(Readable);
    expect(typeof (source as Readable).once).toBe('function');
  });

  it('stream 能读出原始 content(内容正确,没在包 stream 时丢数据)', async () => {
    const captured: CapturedCall = {} as CapturedCall;
    const mockClient = makeMockClient(captured);
    vi.mocked(basicFtp.Client).mockImplementation(() => mockClient as never);

    const content = '{"datas":[{"id":"TC_001"}]}';
    await uploadFileContent({
      host: '127.0.0.1',
      port: 21,
      username: 'u',
      password: 'p',
      remotePath: '/2026-06-23/testcase_all.json',
      content,
    });

    // 从捕获的 stream 读出全部内容,比对
    const chunks: Buffer[] = [];
    for await (const chunk of captured.uploadArgs.source as Readable) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    expect(Buffer.concat(chunks).toString('utf-8')).toBe(content);
  });

  it('uploadFrom 收到的不是 Buffer(回归保护:旧代码就是这个 bug)', async () => {
    const captured: CapturedCall = {} as CapturedCall;
    const mockClient = makeMockClient(captured);
    vi.mocked(basicFtp.Client).mockImplementation(() => mockClient as never);

    await uploadFileContent({
      host: '127.0.0.1',
      port: 21,
      username: 'u',
      password: 'p',
      remotePath: '/f.json',
      content: 'x',
    });

    expect(captured.uploadArgs.source).not.toBeInstanceOf(Buffer);
  });
});

describe('uploadFileContent - access 参数正确', () => {
  it('access 收到 host/port/user/password', async () => {
    const captured: CapturedCall = {} as CapturedCall;
    const mockClient = makeMockClient(captured);
    vi.mocked(basicFtp.Client).mockImplementation(() => mockClient as never);

    await uploadFileContent({
      host: '10.0.0.5',
      port: 2121,
      username: 'laser',
      password: 'secret',
      remotePath: '/p.json',
      content: '{}',
    });

    expect(captured.accessArgs).toEqual({
      host: '10.0.0.5',
      port: 2121,
      user: 'laser',
      password: 'secret',
    });
  });

  it('嵌套路径:先 ensureDir(父目录) 再 uploadFrom(basename)——553 修复契约', async () => {
    // 553 根因:basic-ftp uploadFrom 只发 STOR,不建父目录。getTestCaseAll 写到
    // basePath/yyyy-mm-dd/testcase_all.json,父目录 yyyy-mm-dd 不存在 → 服务端 553。
    // 修复契约(对齐 basic-ftp 自身 uploadFromDir 的 ensureDir + basename 模式):
    //   ensureDir 收到父目录,uploadFrom 收到 basename(不是完整路径)。
    const captured: CapturedCall = {} as CapturedCall;
    const mockClient = makeMockClient(captured);
    vi.mocked(basicFtp.Client).mockImplementation(() => mockClient as never);

    await uploadFileContent({
      host: 'h', port: 21, username: 'u', password: 'p',
      remotePath: '/laser/2026-06-23/testcase_all.json',
      content: '{}',
    });

    expect(captured.ensureDirArgs).toEqual(['/laser/2026-06-23']);
    expect(captured.uploadArgs.remotePath).toBe('testcase_all.json');
    expect(mockClient.ensureDir).toHaveBeenCalledBefore(mockClient.uploadFrom);
  });

  it('相对路径的嵌套目录也 ensureDir(无前导斜杠)', async () => {
    const captured: CapturedCall = {} as CapturedCall;
    const mockClient = makeMockClient(captured);
    vi.mocked(basicFtp.Client).mockImplementation(() => mockClient as never);

    await uploadFileContent({
      host: 'h', port: 21, username: 'u', password: 'p',
      remotePath: 'laser/2026-06-23/testcase_all.json',
      content: '{}',
    });

    expect(captured.ensureDirArgs).toEqual(['laser/2026-06-23']);
    expect(captured.uploadArgs.remotePath).toBe('testcase_all.json');
  });

  it('扁平路径(无父目录):不调 ensureDir,uploadFrom 收到原 remotePath', async () => {
    // 对应 uploadTestReportAndNotify 的 /basePath/TestReport_xxx.json(原本就能成功)
    const captured: CapturedCall = {} as CapturedCall;
    const mockClient = makeMockClient(captured);
    vi.mocked(basicFtp.Client).mockImplementation(() => mockClient as never);

    await uploadFileContent({
      host: 'h', port: 21, username: 'u', password: 'p',
      remotePath: '/TestReport_T_001.json',
      content: '{}',
    });

    expect(captured.ensureDirArgs ?? []).toEqual([]);
    expect(captured.uploadArgs.remotePath).toBe('/TestReport_T_001.json');
  });

  it('finally 调 client.close(无论成功失败)', async () => {
    const captured: CapturedCall = {} as CapturedCall;
    const mockClient = makeMockClient(captured);
    vi.mocked(basicFtp.Client).mockImplementation(() => mockClient as never);

    await uploadFileContent({
      host: 'h', port: 21, username: 'u', password: 'p',
      remotePath: '/f', content: '{}',
    });

    expect(mockClient.close).toHaveBeenCalledTimes(1);
  });

  it('uploadFrom 抛错时 client.close 仍被调用(连接不泄漏)', async () => {
    const mockClient = makeMockClient({} as CapturedCall);
    mockClient.uploadFrom.mockRejectedValueOnce(new Error('upload failed'));
    vi.mocked(basicFtp.Client).mockImplementation(() => mockClient as never);

    await expect(uploadFileContent({
      host: 'h', port: 21, username: 'u', password: 'p',
      remotePath: '/f', content: '{}',
    })).rejects.toThrow('upload failed');

    expect(mockClient.close).toHaveBeenCalledTimes(1);
  });
});
