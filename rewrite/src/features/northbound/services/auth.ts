import type { HttpFacade } from '@/platform';

export interface AuthConfig {
  readonly loginUrl: string;
  readonly clientId: string;
  readonly username: string;
  readonly password: string;
  readonly grantType: string;
  readonly tenantId: string;
}

export interface AuthService {
  getToken(): string | undefined;
  isAuthenticated(): boolean;
  login(): Promise<string>;
  ensureToken(): Promise<string>;
  logout(): void;
}

const EXPIRY_BUFFER_MS = 3600_000; // 1 hour

export function createAuthService(httpFacade: HttpFacade, config: AuthConfig): AuthService {
  let cachedToken: string | undefined;
  let expiresAt: number | undefined;

  function getToken(): string | undefined {
    return cachedToken;
  }

  function isAuthenticated(): boolean {
    return !!cachedToken && !!expiresAt && Date.now() < expiresAt;
  }

  async function login(): Promise<string> {
    console.log(`[northbound auth] 登录 ${config.loginUrl}`);
    const resp = await httpFacade.sendRequest({
      url: config.loginUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: config.username,
        password: config.password,
        clientId: config.clientId,
        grantType: config.grantType,
        tenantId: config.tenantId,
      }),
    });

    const parsed = JSON.parse(resp.body as string);
    const data = parsed.data ?? parsed;
    const token = data.access_token as string;
    const expireIn = (data.expire_in ?? data.expires_in ?? data.expireIn ?? data.expiresIn ?? 0) as number;

    cachedToken = token;
    expiresAt = Date.now() + expireIn * 1000 - EXPIRY_BUFFER_MS;
    console.log(`[northbound auth] 登录成功，token 有效期 ${expireIn}s`);
    return token;
  }

  async function ensureToken(): Promise<string> {
    if (isAuthenticated() && cachedToken) return cachedToken;
    return login();
  }

  function logout(): void {
    cachedToken = undefined;
    expiresAt = undefined;
  }

  return { getToken, isAuthenticated, login, ensureToken, logout };
}
