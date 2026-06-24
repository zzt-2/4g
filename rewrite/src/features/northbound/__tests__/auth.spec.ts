import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuthService, type AuthConfig } from '../services/auth';
import type { HttpFacade } from '@/platform';

function makeConfig(): AuthConfig {
  return {
    loginUrl: 'http://example.com/auth/partner/login',
    clientId: 'test-client-id',
    username: 'subsys',
    password: 'test-pass',
    grantType: 'partner',
    tenantId: '000000',
  };
}

function makeMockHttpFacade(token = 'test-token', expireIn = 604800): HttpFacade {
  return {
    sendRequest: vi.fn().mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({
        code: 200,
        data: { access_token: token, expire_in: expireIn },
      }),
    }),
  } as unknown as HttpFacade;
}

describe('createAuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('login returns token and caches it', async () => {
    const httpFacade = makeMockHttpFacade();
    const auth = createAuthService(httpFacade, makeConfig());

    const token = await auth.login();

    expect(token).toBe('test-token');
    expect(auth.getToken()).toBe('test-token');
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('login sends correct request body', async () => {
    const httpFacade = makeMockHttpFacade();
    const auth = createAuthService(httpFacade, makeConfig());

    await auth.login();

    expect(httpFacade.sendRequest).toHaveBeenCalledOnce();
    const call = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.url).toBe('http://example.com/auth/partner/login');
    expect(call.method).toBe('POST');
    const body = JSON.parse(call.body as string);
    expect(body.username).toBe('subsys');
    expect(body.clientId).toBe('test-client-id');
    expect(body.grantType).toBe('partner');
  });

  it('login failure throws', async () => {
    const httpFacade = {
      sendRequest: vi.fn().mockRejectedValue(new Error('network error')),
    } as unknown as HttpFacade;
    const auth = createAuthService(httpFacade, makeConfig());

    await expect(auth.login()).rejects.toThrow('network error');
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('ensureToken returns cached token when valid', async () => {
    const httpFacade = makeMockHttpFacade();
    const auth = createAuthService(httpFacade, makeConfig());

    await auth.login();
    const token = await auth.ensureToken();

    expect(token).toBe('test-token');
    // Only one sendRequest call (the initial login)
    expect(httpFacade.sendRequest).toHaveBeenCalledOnce();
  });

  it('ensureToken re-logins when expired', async () => {
    const httpFacade = makeMockHttpFacade('new-token', 0);
    const auth = createAuthService(httpFacade, makeConfig());

    await auth.login();
    // After login with expire_in=0, the cached token is already expired
    // because the buffer subtracts 1 hour
    const token = await auth.ensureToken();

    expect(token).toBe('new-token');
    expect(httpFacade.sendRequest).toHaveBeenCalledTimes(2);
  });

  it('logout clears cached token', async () => {
    const httpFacade = makeMockHttpFacade();
    const auth = createAuthService(httpFacade, makeConfig());

    await auth.login();
    expect(auth.isAuthenticated()).toBe(true);

    auth.logout();

    expect(auth.getToken()).toBeUndefined();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('initially not authenticated', () => {
    const httpFacade = makeMockHttpFacade();
    const auth = createAuthService(httpFacade, makeConfig());

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.getToken()).toBeUndefined();
  });

  // S013 防御:password 缺失/空时不应静默发出会被 JSON.stringify 省略的 body(甲方 400 参数校验异常,
  // 同 S011 复发)。必须抛明确错误,杜绝 undefined 被 JSON.stringify 吞掉导致请求体缺字段。
  it('login throws when password is undefined (defense against silent field omission)', async () => {
    const httpFacade = makeMockHttpFacade();
    const cfg = { ...makeConfig(), password: undefined as unknown as string };
    const auth = createAuthService(httpFacade, cfg);

    await expect(auth.login()).rejects.toThrow(/password/i);
    expect(httpFacade.sendRequest).not.toHaveBeenCalled();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('login throws when password is empty string', async () => {
    const httpFacade = makeMockHttpFacade();
    const cfg = { ...makeConfig(), password: '' };
    const auth = createAuthService(httpFacade, cfg);

    await expect(auth.login()).rejects.toThrow(/password/i);
    expect(httpFacade.sendRequest).not.toHaveBeenCalled();
  });
});
