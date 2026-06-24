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
    // S013 防御:password 缺失/空时直接拒绝。否则 JSON.stringify 会省略 undefined 字段,
    // 请求体悄悄丢 password → 甲方"参数校验异常"(S011 复发的根因)。username 同理必填。
    if (!config.password) {
      throw new Error('甲方对接未配置 password,请在"对接配置"弹窗填写第三方应用 app_secret 后重试');
    }
    if (!config.username) {
      throw new Error('甲方对接未配置 username');
    }
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
    // S013 防御:登录失败时甲方返回错误响应(无 access_token),旧代码把 undefined token 当成功缓存,
    // 打印误导性的"登录成功,token 有效期 0s"(S011 bug #2)。无 token 必须报错。
    if (!token) {
      const msg = data.msg ?? parsed.msg ?? '响应无 access_token';
      throw new Error(`甲方登录失败: ${msg}`);
    }
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
