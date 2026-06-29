import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNorthboundService, type NorthboundServiceOptions, type NorthboundConfig, type FtpFacade } from '../services/northbound-service';
import type { TaskService } from '@/features/task';
import type { ResultService } from '@/features/result';
import type { HttpFacade, HttpResponse } from '@/platform';
import type { TaskInstanceState, TaskDefinition, TaskStepResult, TaskEventHandlers } from '@/features/task/core';
import type { CaseVerdict } from '@/features/result';
import type { EncodeSource } from '../core/testcase-sync-translator';
import type { ReportConfig } from '@/features/command-ingress/core/report-config';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeMockInstance(overrides?: Partial<TaskInstanceState>): TaskInstanceState {
  return {
    instanceId: 'inst-001',
    definitionRef: {
      id: 'def-001',
      name: 'Test def',
      steps: [
        { kind: 'send', id: 'step-0', name: 'Send frame-001', config: { frameId: 'frame-001', targetId: 'target-1' } },
      ],
      schedule: { kind: 'immediate' },
      errorPolicy: { onFailure: 'stop' },
    } satisfies TaskDefinition,
    lifecycle: 'running',
    currentStepIndex: 0,
    currentIteration: 0,
    stepResults: [],
    ...overrides,
  };
}

function makeMockTaskService(): TaskService {
  const handlersList: TaskEventHandlers[] = [];
  const mock = {
    createTask: vi.fn().mockReturnValue(makeMockInstance()),
    startTask: vi.fn((instanceId: string) => {
      // 模拟 task 立即完成：同步触发 onTaskSettled 事件
      for (const handlers of handlersList) {
        handlers.onTaskSettled?.(instanceId, 'completed');
      }
    }),
    stopTask: vi.fn(),
    pauseTask: vi.fn(),
    resumeTask: vi.fn(),
    getInstance: vi.fn().mockReturnValue(makeMockInstance()),
    onSettled: vi.fn().mockResolvedValue(undefined),
    removeTask: vi.fn(),
    retryTask: vi.fn().mockReturnValue(undefined),
    updateTask: vi.fn().mockReturnValue(undefined),
    stopAll: vi.fn().mockReturnValue(0),
    getSnapshot: vi.fn().mockReturnValue({ instances: [] }),
    getProgress: vi.fn().mockReturnValue(undefined),
    getStatistics: vi.fn().mockReturnValue({ total: 0, active: 0, completed: 0, failed: 0 }),
    subscribe: vi.fn((handlers: TaskEventHandlers) => {
      handlersList.push(handlers);
      return () => {
        const idx = handlersList.indexOf(handlers);
        if (idx >= 0) handlersList.splice(idx, 1);
      };
    }),
    // template API 不参与本测试
    createTemplate: vi.fn(),
    listTemplates: vi.fn().mockReturnValue([]),
    getTemplate: vi.fn().mockReturnValue(undefined),
    updateTemplate: vi.fn().mockReturnValue(undefined),
    deleteTemplate: vi.fn().mockReturnValue(false),
    instanciateTemplate: vi.fn().mockReturnValue(makeMockInstance()),
  };
  return mock as unknown as TaskService;
}

function makeMockResultService(): ResultService {
  const mockVerdict: CaseVerdict = {
    instanceId: 'inst-001',
    taskDefinitionId: 'def-001',
    verdict: 'passed',
    judgedAt: '2026-05-25T10:00:05.000Z',
    startedAt: '2026-05-25T10:00:00.000Z',
    finishedAt: '2026-05-25T10:00:05.000Z',
  };
  return {
    collectResult: vi.fn().mockReturnValue(mockVerdict),
    getVerdict: vi.fn().mockReturnValue(undefined),
    getSnapshot: vi.fn().mockReturnValue({ verdicts: new Map() }),
    clear: vi.fn(),
  };
}

const authLoginResponse = { statusCode: 200, body: JSON.stringify({ code: 200, data: { access_token: 'test-token', expire_in: 604800 } }) };

function makeMockHttpFacade(): HttpFacade {
  return {
    startServer: vi.fn().mockResolvedValue('server-001'),
    stopServer: vi.fn().mockResolvedValue(undefined),
    onRequest: vi.fn().mockReturnValue(vi.fn()),
    sendRequest: vi.fn().mockResolvedValue(authLoginResponse),
  };
}

function makeOptions(overrides?: Partial<NorthboundServiceOptions>): NorthboundServiceOptions {
  return {
    taskService: makeMockTaskService(),
    resultService: makeMockResultService(),
    httpFacade: makeMockHttpFacade(),
    connectionSnapshot: () => ({ status: 'connected' }),
    ...overrides,
  };
}

const defaultConfig: NorthboundConfig = {
  serverHost: '0.0.0.0',
  serverPort: 8080,
  customerBaseUrl: 'http://customer.example.com/partner-api/',
  subSysType: 'ADS',
  subSysId: 'ADS_001',
  auth: {
    loginUrl: 'http://customer.example.com/partner-api/auth/partner/login',
    clientId: '6af72c14148848b9b1c08220a6d8ee54',
    username: 'subsys',
    password: 'f6c230cb7cf848439a4d52817dff6d',
    grantType: 'partner',
    tenantId: '000000',
  },
  // D006: getTestCaseAll 用例数据走 FTP 文件传输,FTP 地址我们自己配
  ftp: {
    host: 'ftp.example.com',
    port: 21,
    username: 'laser',
    password: 'laserpass',
    basePath: '/laser/testcase',
  },
};

/** Start the service and return the onRequest handler so we can simulate inbound requests. */
async function startAndGetHandler(service: ReturnType<typeof createNorthboundService>, httpFacade: HttpFacade): Promise<(req: { method: string; url: string; body?: string }) => Promise<HttpResponse>> {
  await service.start(defaultConfig);
  const onRequestCalls = (httpFacade.onRequest as ReturnType<typeof vi.fn>).mock.calls;
  return onRequestCalls[0][1] as (req: { method: string; url: string; body?: string }) => Promise<HttpResponse>;
}

/** D006: 同 startAndGetHandler,但用【无 ftp 配置】的 config start(测 getTestCaseAll 无 FTP 时的报错)。 */
async function startAndGetHandlerNoFtp(service: ReturnType<typeof createNorthboundService>, httpFacade: HttpFacade): Promise<(req: { method: string; url: string; body?: string }) => Promise<HttpResponse>> {
  const { ftp: _omit, ...configWithoutFtp } = defaultConfig;
  void _omit;
  await service.start(configWithoutFtp);
  const onRequestCalls = (httpFacade.onRequest as ReturnType<typeof vi.fn>).mock.calls;
  return onRequestCalls[0][1] as (req: { method: string; url: string; body?: string }) => Promise<HttpResponse>;
}

function clearSendRequest(httpFacade: HttpFacade): void {
  (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mockClear();
  (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mockResolvedValue({ statusCode: 200, body: '{}' });
}

// ---------------------------------------------------------------------------
// Lifecycle tests
// ---------------------------------------------------------------------------

describe('createNorthboundService — lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('start calls auth.login then startServer, sets isActive to true', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));

    await service.start(defaultConfig);

    expect(httpFacade.sendRequest).toHaveBeenCalledOnce();
    expect(httpFacade.startServer).toHaveBeenCalledOnce();
    expect(httpFacade.onRequest).toHaveBeenCalledOnce();
    expect(service.isActive()).toBe(true);
  });

  it('stop calls stopServer and resets state', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));

    await service.start(defaultConfig);
    await service.stop();

    expect(httpFacade.stopServer).toHaveBeenCalledWith('server-001');
    expect(service.isActive()).toBe(false);
    expect(service.getSessionStatus().serverRunning).toBe(false);
  });

  it('double start is idempotent', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));

    await service.start(defaultConfig);
    await service.start(defaultConfig);

    expect(httpFacade.startServer).toHaveBeenCalledOnce();
  });

  it('stop when not started does not throw', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));

    await expect(service.stop()).resolves.toBeUndefined();
    expect(httpFacade.stopServer).not.toHaveBeenCalled();
  });

  it('getSessionStatus returns snapshot with serverRunning=false initially', () => {
    const service = createNorthboundService(makeOptions());
    const status = service.getSessionStatus();

    expect(status.serverRunning).toBe(false);
    expect(status.activeTestCases.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Inbound route tests
// ---------------------------------------------------------------------------

describe('createNorthboundService — inbound routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('setTestTask returns envelope response and creates tasks', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService }));
    const handler = await startAndGetHandler(service, httpFacade);

    // HAR-aligned payload: nodes + top-level testCaseInfo + layer (not layerNo)
    const body = JSON.stringify({
      method: 'setTestTask',
      requestId: 1001,
      subSysType: 'ADS',
      subSysId: 'ADS_001',
      sessionId: 5001,
      taskId: 'T_178022737246337558',
      taskName: 'Set 1',
      resources: [],
      immediate: true,
      repeatCount: 1,
      isEnd: true,
      orbitProtectTime: 0,
      testCaseInfo: [{
        testCaseId: 'tc-001',
        deviceIds: ['KPS_UE_202'],
        masterTest: true,
        testMode: 1,
        ephMode: 1,
        orbitInfo: null,
        inputPars: [],
      }],
      ftpInfo: null,
      executionPlan: {
        layers: [{
          layer: 1,
          parallel: true,
          nodes: ['tc-001'],
        }],
      },
    });

    const resp = await handler({ method: 'POST', url: '/setTestTask', body });

    expect(resp.statusCode).toBe(200);
    const parsed = JSON.parse(resp.body as string);
    expect(parsed.method).toBe('setTestTaskResponse');
    expect(parsed.requestId).toBe(1001);
    expect(parsed.subSysType).toBe('ADS');
    expect(parsed.subSysId).toBe('ADS_001');
    expect(parsed.sessionId).toBe(5001);
    expect(parsed.statusCode).toBe(1);
    expect(parsed.msg).toBe('ok');

    expect(taskService.createTask).toHaveBeenCalledOnce();
    expect(taskService.startTask).toHaveBeenCalledOnce();
  });

  it('setTestTask with missing layers returns error envelope', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const body = JSON.stringify({ method: 'setTestTask', requestId: 1002, subSysType: 'ADS', subSysId: 'ADS_001' });
    const resp = await handler({ method: 'POST', url: '/setTestTask', body });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.statusCode).toBe(2);
    expect(parsed.msg).toBe('Missing executionPlan.layers');
    expect(parsed.method).toBe('setTestTaskResponse');
    expect(parsed.requestId).toBe(1002);
  });

  it('setTestTask expands layer nodes (testCaseId strings) into tasks', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService }));
    const handler = await startAndGetHandler(service, httpFacade);

    const body = JSON.stringify({
      method: 'setTestTask',
      requestId: 1100,
      subSysType: 'ADS',
      subSysId: 'ADS_001',
      taskId: 'T_set_a',
      taskName: 'Set A',
      resources: [],
      immediate: true,
      repeatCount: 1,
      isEnd: true,
      orbitProtectTime: 0,
      testCaseInfo: [
        { testCaseId: 'tc-a', deviceIds: [], masterTest: true, testMode: 1, ephMode: 1, orbitInfo: null, inputPars: [] },
        { testCaseId: 'tc-b', deviceIds: [], masterTest: true, testMode: 1, ephMode: 1, orbitInfo: null, inputPars: [] },
      ],
      ftpInfo: null,
      executionPlan: {
        // 04-任务管理.md: nodes is a plain testCaseId string list.
        layers: [{
          layer: 1,
          parallel: false,
          nodes: ['tc-a', 'tc-b'],
        }],
      },
    });

    await handler({ method: 'POST', url: '/setTestTask', body });

    // processLayers fires async (fire-and-forget); wait for both cases to be created.
    await vi.waitFor(() => expect(taskService.createTask).toHaveBeenCalledTimes(2));
    expect(taskService.startTask).toHaveBeenCalledTimes(2);
  });

  it('setTestTask accepts object-form layer nodes {id,name,type} (甲方实现偏离文档,实际下发对象而非字符串)', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService }));
    const handler = await startAndGetHandler(service, httpFacade);

    const body = JSON.stringify({
      method: 'setTestTask',
      requestId: 1101,
      subSysType: 'laser',
      subSysId: 'JG',
      taskId: 'T_obj_a',
      taskName: 'Obj A',
      resources: null,
      immediate: true,
      repeatCount: 1,
      isEnd: false,
      orbitProtectTime: 0,
      testCaseInfo: [
        { testCaseId: 'c2b43266@1782291730690', deviceIds: [], masterTest: false, testMode: 0, ephMode: 0, orbitInfo: null, inputPars: [] },
        { testCaseId: '98803a25@1782291730691', deviceIds: [], masterTest: false, testMode: 0, ephMode: 0, orbitInfo: null, inputPars: [] },
      ],
      ftpInfo: null,
      // 甲方实际下发:nodes 元素是对象 {id,name,type}(id=testCaseId),而非文档 L353 的纯字符串。
      // 复现真实联调报文结构(含 layer 多层 + 对象 node)。
      executionPlan: {
        layers: [
          { layer: 1, parallel: false, nodes: [{ id: 'c2b43266@1782291730690', name: '1540波长测试 - 5G RS', type: 'case' }] },
          { layer: 2, parallel: false, nodes: [{ id: '98803a25@1782291730691', name: '1540波长测试 - 2.5G RS', type: 'case' }] },
        ],
      },
    });

    await handler({ method: 'POST', url: '/setTestTask', body });

    // 对象 node 的 .id 被正确解析为 testCaseId → 两个用例都被创建并启动
    await vi.waitFor(() => expect(taskService.createTask).toHaveBeenCalledTimes(2));
    expect(taskService.startTask).toHaveBeenCalledTimes(2);
  });

  it('controlTestTask with stop action calls stopTask via taskId mapping', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService }));

    // First, create a customerTaskId mapping via setTestTask
    const handler = await startAndGetHandler(service, httpFacade);
    const setBody = JSON.stringify({
      method: 'setTestTask', requestId: 2001, subSysType: 'ADS', subSysId: 'ADS_001',
      taskId: 'T_ctrl_1', taskName: 'Ctrl', resources: [],
      immediate: true, repeatCount: 1, isEnd: true, orbitProtectTime: 0,
      testCaseInfo: [{ testCaseId: 'tc-ctrl', deviceIds: [], masterTest: true, testMode: 1, ephMode: 1, orbitInfo: null, inputPars: [] }],
      ftpInfo: null,
      executionPlan: {
        layers: [{ layer: 1, parallel: true, nodes: ['tc-ctrl'] }],
      },
    });
    await handler({ method: 'POST', url: '/setTestTask', body: setBody });

    // Now send controlTestTask with the customer-issued taskId
    const ctrlBody = JSON.stringify({
      method: 'controlTestTask', requestId: 2002, subSysType: 'ADS', subSysId: 'ADS_001',
      taskId: 'T_ctrl_1', action: 'stop',
    });
    const resp = await handler({ method: 'POST', url: '/controlTestTask', body: ctrlBody });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.method).toBe('controlTestTaskResponse');
    expect(parsed.statusCode).toBe(1);
    expect(parsed.requestId).toBe(2002);
    expect(parsed.taskId).toBe('T_ctrl_1');
    expect(parsed.handleCode).toBe(0);
    expect(taskService.stopTask).toHaveBeenCalledWith('inst-001');
  });

  it('controlTestTask with pause action calls pauseTask', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService }));
    const handler = await startAndGetHandler(service, httpFacade);

    // Setup mapping
    await handler({ method: 'POST', url: '/setTestTask', body: JSON.stringify({
      method: 'setTestTask', requestId: 1, subSysType: 'ADS', subSysId: 'ADS_001',
      taskId: 'T_pause_1', taskName: 'Pause', resources: [],
      immediate: true, repeatCount: 1, isEnd: true, orbitProtectTime: 0,
      testCaseInfo: [{ testCaseId: 'tc-p', deviceIds: [], masterTest: true, testMode: 1, ephMode: 1, orbitInfo: null, inputPars: [] }],
      ftpInfo: null,
      executionPlan: {
        layers: [{ layer: 1, parallel: true, nodes: ['tc-p'] }],
      },
    }) });

    const resp = await handler({ method: 'POST', url: '/controlTestTask', body: JSON.stringify({
      method: 'controlTestTask', requestId: 2003, subSysType: 'ADS', subSysId: 'ADS_001',
      taskId: 'T_pause_1', action: 'pause',
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.statusCode).toBe(1);
    expect(taskService.pauseTask).toHaveBeenCalledWith('inst-001');
  });

  it('controlTestTask with missing taskId returns handleCode=2', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/controlTestTask', body: JSON.stringify({
      method: 'controlTestTask', requestId: 2004, subSysType: 'ADS', subSysId: 'ADS_001',
      taskId: '', action: 'stop',
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.statusCode).toBe(2);
    expect(parsed.msg).toBe('Missing taskId');
    expect(parsed.handleCode).toBe(2);
  });

  it('controlTestTask with unknown taskId returns handleCode=1 (busy) without throwing', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/controlTestTask', body: JSON.stringify({
      method: 'controlTestTask', requestId: 2010, subSysType: 'ADS', subSysId: 'ADS_001',
      taskId: 'T_unknown', action: 'stop',
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.statusCode).toBe(1);
    expect(parsed.handleCode).toBe(1);
    expect(taskService.stopTask).not.toHaveBeenCalled();
  });

  it('heartbeat inbound returns envelope response', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/heartbeat', body: JSON.stringify({
      method: 'heartbeat', requestId: 3001, subSysId: 'ADS_001',
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.method).toBe('heartbeatResponse');
    expect(parsed.requestId).toBe(3001);
    expect(parsed.statusCode).toBe(1);
  });

  it('getSubSysState returns envelope response', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/getSubSysState', body: JSON.stringify({
      method: 'getSubSysState', requestId: 4001, subSysType: 'ADS', subSysId: 'ADS_001',
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.method).toBe('getSubSysStateResponse');
    expect(parsed.requestId).toBe(4001);
    expect(parsed.statusCode).toBe(1);
  });

  it('unknown route returns error envelope', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/unknownMethod', body: JSON.stringify({
      method: 'unknownMethod', requestId: 9999, subSysType: 'ADS', subSysId: 'ADS_001',
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.statusCode).toBe(2);
    expect(parsed.msg).toBe('Not found');
  });

  it('invalid JSON returns error envelope', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/setTestTask', body: 'not-json' });

    expect(resp.statusCode).toBe(400);
    const parsed = JSON.parse(resp.body as string);
    expect(parsed.msg).toBe('Invalid JSON');
  });

  it('resolves method from body.method when URL does not match', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    // URL is generic but body has method=heartbeat
    const resp = await handler({ method: 'POST', url: '/api/heartbeat', body: JSON.stringify({
      method: 'heartbeat', requestId: 3002, subSysId: 'ADS_001',
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.method).toBe('heartbeatResponse');
    expect(parsed.requestId).toBe(3002);
  });
});

// ---------------------------------------------------------------------------
// handleStepResult positive path
// ---------------------------------------------------------------------------

describe('createNorthboundService — handleStepResult positive path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handleStepResult with mapped instanceId sends msgReport POST', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService }));
    const handler = await startAndGetHandler(service, httpFacade);

    // Create mapping via setTestTask
    await handler({ method: 'POST', url: '/setTestTask', body: JSON.stringify({
      method: 'setTestTask', requestId: 1, subSysType: 'ADS', subSysId: 'ADS_001',
      taskId: 'T_step_1', taskName: 'Step test', resources: [],
      immediate: true, repeatCount: 1, isEnd: true, orbitProtectTime: 0,
      testCaseInfo: [{ testCaseId: 'tc-step', deviceIds: [], masterTest: true, testMode: 1, ephMode: 1, orbitInfo: null, inputPars: [] }],
      ftpInfo: null,
      executionPlan: {
        layers: [{ layer: 1, parallel: true, nodes: ['tc-step'] }],
      },
    }) });

    // Clear previous sendRequest calls (login + possible outbound)
    clearSendRequest(httpFacade);

    const stepResult: TaskStepResult = {
      kind: 'send',
      stepIndex: 0,
      iteration: 0,
      sendResult: {
        kind: 'sent',
        requestRef: { frameId: 'frame-001', targetId: 'target-1', context: { source: 'task' } },
        bytesBuilt: 10,
        bytesSent: 10,
        timestamp: '2026-05-25T10:00:01.000Z',
        buildIssues: [],
      },
    };

    service.handleStepResult('inst-001', stepResult);

    // Wait for async postToCustomer
    await vi.waitFor(() => expect(httpFacade.sendRequest).toHaveBeenCalled());

    const call = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.url).toContain('/admin/report/msgReport');
    expect(call.headers?.Authorization).toBe('Bearer test-token');
    const body = JSON.parse(call.body as string);
    expect(body.method).toBe('msgReport');
    // step result taskId stays as instanceId (per-step reporting is local-only, no customer echo)
    expect(body.taskId).toBe('inst-001');
    expect(body.testCaseId).toBe('tc-step');
    expect(body.stepInfo).toHaveLength(1);
    expect(body.stepInfo[0].result).toBe('success');
    expect(body.stepInfo[0].msgTime).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Report method tests
// ---------------------------------------------------------------------------

describe('createNorthboundService — report methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function startAndClear(httpFacade: HttpFacade): Promise<ReturnType<typeof createNorthboundService>> {
    const service = createNorthboundService(makeOptions({ httpFacade }));
    await service.start(defaultConfig);
    clearSendRequest(httpFacade);
    return service;
  }

  it('reportDeviceInfo POSTs to /admin/deviceInfo/deviceInfoReport with envelope', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = await startAndClear(httpFacade);

    await service.reportDeviceInfo([{ name: 'UE1', deviceId: 'D1', type: 'UE', swVer: '1.0', status: 'online' }]);

    expect(httpFacade.sendRequest).toHaveBeenCalledOnce();
    const call = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.url).toContain('/admin/deviceInfo/deviceInfoReport');
    const body = JSON.parse(call.body as string);
    expect(body.method).toBe('deviceInfoReport');
    expect(body.subSysType).toBe('ADS');
    expect(body.subSysId).toBe('ADS_001');
    expect(body.datas).toHaveLength(1);
  });

  it('reportDeviceAlarm POSTs with auth headers', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = await startAndClear(httpFacade);

    await service.reportDeviceAlarm([{ alarmId: 'A1', deviceId: 'D1', severity: 'critical', warnTime: '2026-01-01T00:00:00', msg: 'alarm' }]);

    const call = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.headers?.Authorization).toBe('Bearer test-token');
    expect(call.headers?.Clientid).toBe('6af72c14148848b9b1c08220a6d8ee54');
  });

  it('reportSubSysAlarm POSTs to /admin/subSystem/subSysAlarmReport', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = await startAndClear(httpFacade);

    await service.reportSubSysAlarm([{ alarmId: 'A2', severity: 'warn', warnTime: '2026-01-01T00:00:00', msg: 'sys alarm' }]);

    const call = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.url).toContain('/admin/subSystem/subSysAlarmReport');
    const body = JSON.parse(call.body as string);
    expect(body.method).toBe('subSysAlarmReport');
    expect(body.datas).toHaveLength(1);
  });

  it('reportTestDataFileComplete POSTs to /admin/report/testDataFileTranslationComplete', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = await startAndClear(httpFacade);

    await service.reportTestDataFileComplete({
      taskId: 'T1', testCaseId: ['TC1'], ftpServerIP: '192.168.0.1', fileType: 'WRPSig', filePath: '/data/test.csv',
    });

    const call = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.url).toContain('/admin/report/testDataFileTranslationComplete');
    const body = JSON.parse(call.body as string);
    expect(body.method).toBe('testDataFileTranslationComplete');
    expect(body.taskId).toBe('T1');
    expect(body.ftpServerIP).toBe('192.168.0.1');
  });

  it('reportFileTranslationComplete POSTs to /admin/report/fileTranslationComplete', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = await startAndClear(httpFacade);

    await service.reportFileTranslationComplete({
      tranType: 'upload', result: 'success', fileType: 'WRPSig', fileIndex: 1, filePath: '/data/test.csv', ftpServerIP: '192.168.0.1',
    });

    const call = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.url).toContain('/admin/report/fileTranslationComplete');
    const body = JSON.parse(call.body as string);
    expect(body.method).toBe('fileTranslationComplete');
    expect(body.tranType).toBe('upload');
    expect(body.ftpServerIP).toBe('192.168.0.1');
  });

  it('reportSigReport POSTs correct structure', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = await startAndClear(httpFacade);

    await service.reportSigReport([{
      deviceCode: 'UE1',
      sigLog: [{ collectTime: '2024-06-05 11:11:11', stIMSI: '123', direction: 'U', source: 'UE', destination: 'gNB', protocol: 'NRRRC', sig: 'mib' }],
    }], 'T1', 'TC1');

    const call = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.url).toContain('/admin/report/sigReport');
    const body = JSON.parse(call.body as string);
    expect(body.method).toBe('sigReport');
    expect(body.taskId).toBe('T1');
    expect(body.data).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Inbound stub handler tests
// ---------------------------------------------------------------------------

describe('createNorthboundService — inbound stub handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getDeviceList returns mock device data', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/getDeviceList', body: JSON.stringify({
      method: 'getDeviceList', requestId: 5001, subSysType: 'ADS', subSysId: 'ADS_001',
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.method).toBe('getDeviceListResponse');
    expect(parsed.requestId).toBe(5001);
    expect(parsed.statusCode).toBe(1);
    expect(parsed.fileReport).toBe(false);
    expect(parsed.datas).toHaveLength(1);
    expect(parsed.datas[0].deviceId).toBe('ADS_LCT_01');
  });

  it('getDeviceInfo returns filtered device data', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/getDeviceInfo', body: JSON.stringify({
      method: 'getDeviceInfo', requestId: 5002, subSysType: 'ADS', subSysId: 'ADS_001',
      deviceIds: ['ADS_LCT_01'],
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.method).toBe('getDeviceInfoResponse');
    expect(parsed.statusCode).toBe(1);
    expect(parsed.datas).toHaveLength(1);
  });

  it('getDeviceInfo with unknown deviceId returns empty array', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/getDeviceInfo', body: JSON.stringify({
      method: 'getDeviceInfo', requestId: 5003, subSysType: 'ADS', subSysId: 'ADS_001',
      deviceIds: ['UNKNOWN'],
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.datas).toHaveLength(0);
  });

  it('setDeviceInfo returns success envelope', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/setDeviceInfo', body: JSON.stringify({
      method: 'setDeviceInfo', requestId: 5004, subSysType: 'ADS', subSysId: 'ADS_001',
      deviceData: { deviceId: 'ADS_LCT_01' },
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.method).toBe('setDeviceInfoResponse');
    expect(parsed.statusCode).toBe(1);
  });

  it('getPars returns empty parameter values', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/getPars', body: JSON.stringify({
      method: 'getPars', requestId: 5005, subSysType: 'ADS', subSysId: 'ADS_001',
      parIds: ['par1', 'par2'],
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.method).toBe('getParsResponse');
    expect(parsed.statusCode).toBe(1);
    expect(parsed.pars).toHaveLength(2);
    expect(parsed.pars[0]).toEqual({ parId: 'par1', value: '' });
  });

  it('setPars returns success envelope', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/setPars', body: JSON.stringify({
      method: 'setPars', requestId: 5006, subSysType: 'ADS', subSysId: 'ADS_001',
      pars: [{ parId: 'par1', value: '100' }],
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.method).toBe('setParsResponse');
    expect(parsed.statusCode).toBe(1);
  });

  it('dataTransmit returns success envelope', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/dataTransmit', body: JSON.stringify({
      method: 'dataTransmit', requestId: 5007, subSysType: 'ADS', subSysId: 'ADS_001',
      msgList: [{ data: { relationId: 'R1', statusCode: 'ok' } }],
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.method).toBe('dataTransmitResponse');
    expect(parsed.statusCode).toBe(1);
  });

  it('neControl returns success envelope', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/neControl', body: JSON.stringify({
      method: 'neControl', requestId: 5008, subSysType: 'ADS', subSysId: 'ADS_001',
      neType: 'device', optType: 'restart', deviceId: ['ADS_LCT_01'],
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.method).toBe('neControlResponse');
    expect(parsed.statusCode).toBe(1);
  });

  // D006: getTestCaseAll 用例数据走 FTP 文件传输(不是 HTTP 响应体字段)。
  // 响应体只有信封字段(无 datas),用例数据序列化成 {datas:[...]} 上传到我们 config.ftp 配的 FTP,
  // 路径 basePath/yyyy-mm-dd/testcase_all.json,上传后调 fileTranslationComplete 通知甲方。

  it('getTestCaseAll uploads {datas:[...]} to config.ftp, response body has NO datas, calls fileTranslationComplete', async () => {
    const httpFacade = makeMockHttpFacade();
    const ftpFacade: FtpFacade = { uploadFile: vi.fn().mockResolvedValue(undefined) };
    const taskService = makeMockTaskService();
    taskService.getTemplate = vi.fn((id: string) => {
      if (id === 'tpl-1') return { templateId: 'tpl-1', name: 'Case1', tags: [], definition: { id:'d', name:'n', steps:[{ kind:'delay', id:'s', config:{ durationMs:1000 } }], schedule:{kind:'immediate'}, errorPolicy:{onFailure:'stop'} }, createdAt:'', updatedAt:'' };
      return undefined;
    });
    const service = createNorthboundService(makeOptions({ httpFacade, ftpFacade, taskService }));
    service.setCatalogMappings([{ templateId: 'tpl-1', enabled: true, overridablePaths: [] }]);
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/getTestCaseAll', body: JSON.stringify({
      method: 'getTestCaseAll', requestId: 5010, subSysType: 'LAS', subSysId: 'LAS_001',
      // 注意:不带 ftpInfo —— D006 用我们 config.ftp,不用请求里的
    }) });

    const parsed = JSON.parse(resp.body as string);
    // 响应体只有信封字段,【无 datas】(D006:datas 是 FTP 文件内容,不是响应体字段)
    expect(parsed.method).toBe('getTestCaseAllResponse');
    expect(parsed.statusCode).toBe(1);
    expect(parsed.datas).toBeUndefined();

    // FTP 上传被调用,用 config.ftp(我们配的),路径 basePath/yyyy-mm-dd/testcase_all.json
    expect(ftpFacade.uploadFile).toHaveBeenCalledOnce();
    const ftpCall = (ftpFacade.uploadFile as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(ftpCall.host).toBe('ftp.example.com');       // config.ftp.host
    expect(ftpCall.port).toBe(21);                       // config.ftp.port
    expect(ftpCall.username).toBe('laser');              // config.ftp.username
    expect(ftpCall.password).toBe('laserpass');          // config.ftp.password
    // 路径:basePath/yyyy-mm-dd/testcase_all.json(日期是今天)
    expect(ftpCall.remotePath).toMatch(/^\/laser\/testcase\/\d{4}-\d{2}-\d{2}\/testcase_all\.json$/);
    // 内容是 {datas:[...]} 包裹,树形:datas[0] 是菜单节点(isParent:true),用例在 children 里
    const content = JSON.parse(ftpCall.content);
    expect(content.datas).toBeDefined();
    expect(Array.isArray(content.datas)).toBe(true);
    expect(content.datas).toHaveLength(1);
    expect(content.datas[0].isParent).toBe(true);        // 菜单节点
    expect(content.datas[0].children).toHaveLength(1);
    expect(content.datas[0].children[0].name).toBe('Case1');

    // 上传后调 fileTranslationComplete 通知甲方(D006 gap3:之前完全没接)
    // postToCustomer 走 httpFacade.sendRequest,第二次调用(fileTranslationComplete)
    const sendCalls = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls;
    // 第一次是 login,找 fileTranslationComplete 那次
    const ftcCall = sendCalls.find(c => {
      const arg = c[0] as { url: string };
      return arg.url.includes('/fileTranslationComplete');
    });
    expect(ftcCall, 'fileTranslationComplete should be called after FTP upload').toBeDefined();
    const ftcBody = JSON.parse((ftcCall![0] as { body: string }).body);
    expect(ftcBody.method).toBe('fileTranslationComplete');
    expect(ftcBody.tranType).toBe('upload');
    expect(ftcBody.result).toBe('success');
    expect(ftcBody.filePath).toBe(ftpCall.remotePath);  // filePath = 上传路径
    // S015: fileType 必须是文件类型标识表(表2-1)合法值;'TestCase' 不在表里 → 甲方判"暂不支持该文件类型"。
    // testcase_all.json 是用例属性数据 → CfgParam(表第18项)。
    expect(ftcBody.fileType).toBe('CfgParam');
  });

  it('getTestCaseAll FTP failure returns statusCode 2 (config.ftp, not request ftpInfo)', async () => {
    const httpFacade = makeMockHttpFacade();
    const ftpFacade: FtpFacade = { uploadFile: vi.fn().mockRejectedValue(new Error('connection refused')) };
    const service = createNorthboundService(makeOptions({ httpFacade, ftpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/getTestCaseAll', body: JSON.stringify({
      method: 'getTestCaseAll', requestId: 5011, subSysType: 'ADS', subSysId: 'ADS_001',
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.statusCode).toBe(2);
    expect(parsed.msg).toBe('FTP upload failed');

    // S015: 失败分支也通知甲方,且 fileType 同样必须是 CfgParam(表2-1合法值)
    const sendCalls = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls;
    const ftcCall = sendCalls.find(c => (c[0] as { url: string }).url.includes('/fileTranslationComplete'));
    expect(ftcCall, 'failure should still notify customer').toBeDefined();
    const ftcBody = JSON.parse((ftcCall![0] as { body: string }).body);
    expect(ftcBody.result).toBe('fail');
    expect(ftcBody.fileType).toBe('CfgParam');
  });

  it('getTestCaseAll without config.ftp or ftpFacade returns statusCode 2 (FTP required by D006)', async () => {
    // D006: getTestCaseAll 本就该走 FTP。没配 config.ftp 或没 ftpFacade 时应报错(不是静默成功)
    const httpFacade = makeMockHttpFacade();
    // 不传 ftpFacade
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandlerNoFtp(service, httpFacade); // 用无 ftp 的 config start

    const resp = await handler({ method: 'POST', url: '/getTestCaseAll', body: JSON.stringify({
      method: 'getTestCaseAll', requestId: 5012, subSysType: 'ADS', subSysId: 'ADS_001',
    }) });
    const parsed = JSON.parse(resp.body as string);
    expect(parsed.statusCode).toBe(2);
    expect(parsed.msg).toContain('FTP');
  });

  it('getTestCaseAll uploads datas from catalog mappings (enabled filter) + templates to FTP', async () => {
    // D004: 数据源是映射表 + D006: 数据走 FTP 文件。本测试断言 FTP 上传内容的 datas 过滤逻辑。
    const httpFacade = makeMockHttpFacade();
    const ftpFacade: FtpFacade = { uploadFile: vi.fn().mockResolvedValue(undefined) };
    const taskService = makeMockTaskService();
    const { createReportedSnapshotStorage } = await import('../services/reported-snapshot-storage');
    const reportedSnapshotStorage = createReportedSnapshotStorage(makeMemStorage());
    // 注入模板(getTemplate 按 id 返回);映射表里一个 enabled + 一个 disabled + 一个指向已删模板
    taskService.getTemplate = vi.fn((id: string) => {
      if (id === 'tpl-on') return { templateId: 'tpl-on', name: 'On', tags: [], definition: { id:'d', name:'n', steps:[{ kind:'delay', id:'s', config:{ durationMs:1000 } }], schedule:{kind:'immediate'}, errorPolicy:{onFailure:'stop'} }, createdAt:'', updatedAt:'' };
      if (id === 'tpl-off') return { templateId: 'tpl-off', name: 'Off', tags: [], definition: { id:'d2', name:'n2', steps:[{ kind:'delay', id:'s2', config:{ durationMs:1000 } }], schedule:{kind:'immediate'}, errorPolicy:{onFailure:'stop'} }, createdAt:'', updatedAt:'' };
      return undefined; // tpl-gone 映射指向的模板已删
    });
    const service = createNorthboundService(makeOptions({
      httpFacade,
      ftpFacade,
      taskService,
      reportedSnapshotStorage,
    }));
    // D004: 数据源是映射表(由 command-ingress 喂入),不是模板的 customerSync 字段
    service.setCatalogMappings([
      { templateId: 'tpl-on', enabled: true, overridablePaths: [] },
      { templateId: 'tpl-off', enabled: false, overridablePaths: [] },
      { templateId: 'tpl-gone', enabled: true, overridablePaths: [] },
    ]);
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/getTestCaseAll', body: JSON.stringify({
      method: 'getTestCaseAll', requestId: 5012, subSysType: 'LAS', subSysId: 'LAS_001',
    }) });
    const parsed = JSON.parse(resp.body as string);
    // 响应体无 datas(D006)
    expect(parsed.statusCode).toBe(1);
    expect(parsed.datas).toBeUndefined();

    // 从 FTP 上传内容验证 datas 过滤逻辑(树形:datas[0] 是菜单,用例在 children)
    const ftpCall = (ftpFacade.uploadFile as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const content = JSON.parse(ftpCall.content);
    expect(content.datas).toHaveLength(1); // 一个菜单节点
    expect(content.datas[0].children).toHaveLength(1); // 只 tpl-on(enabled 且模板存在);tpl-off disabled、tpl-gone 模板缺失都跳过
    expect(content.datas[0].children[0].name).toBe('On');
    // S014: testCaseConfig 现从 activeConfig 派生。runSubSys 用 defaultConfig.subSysId='ADS_001'(startAndGetHandler 传入的,我方无独立子系统类型来源)。
    expect(content.datas[0].children[0].runSubSys).toBe('ADS_001');
    expect(content.datas[0].name).toBe('激光测试'); // 菜单名 = LASER_TEST_CASE_DEFAULTS.menuName
  });

  // S014 回归测试: 锁住 runtime wiring gap(testCaseConfig 漏接线)。
  // 重现真实运行场景: feature-wiring.ts 构造 service 时不传 testCaseConfig(只有 start(config) 带 subSysId)。
  // 修复前: options.testCaseConfig 永远 undefined → L533 return null → FTP 内容 datas 空(blocker bug)。
  // 修复后: handleGetTestCaseAll 从 activeConfig.subSysId 派生 testCaseConfig → FTP 内容有 datas。
  // D006 后:datas 走 FTP 文件(不再走响应体),所以从 FTP 上传内容验证。
  it('S014 regression: getTestCaseAll derives testCaseConfig from activeConfig.subSysId (verify FTP content)', async () => {
    const httpFacade = makeMockHttpFacade();
    const ftpFacade: FtpFacade = { uploadFile: vi.fn().mockResolvedValue(undefined) };
    const taskService = makeMockTaskService();
    const { createReportedSnapshotStorage } = await import('../services/reported-snapshot-storage');
    const reportedSnapshotStorage = createReportedSnapshotStorage(makeMemStorage());
    taskService.getTemplate = vi.fn((id: string) => {
      if (id === 'tpl-1') return { templateId: 'tpl-1', name: 'Case1', tags: [], definition: { id:'d', name:'n', steps:[{ kind:'delay', id:'s', config:{ durationMs:1000 } }], schedule:{kind:'immediate'}, errorPolicy:{onFailure:'stop'} }, createdAt:'', updatedAt:'' };
      return undefined;
    });
    // ⚠️ 关键: 不传 testCaseConfig —— 模拟 feature-wiring.ts:183-189 的真实构造路径
    const service = createNorthboundService(makeOptions({
      httpFacade,
      ftpFacade,
      taskService,
      reportedSnapshotStorage,
      // testCaseConfig 故意省略
    }));
    service.setCatalogMappings([
      { templateId: 'tpl-1', enabled: true, overridablePaths: [] },
    ]);
    const handler = await startAndGetHandler(service, httpFacade); // start(defaultConfig) → activeConfig.subSysId='ADS_001'

    const resp = await handler({ method: 'POST', url: '/getTestCaseAll', body: JSON.stringify({
      method: 'getTestCaseAll', requestId: 5100, subSysType: 'LAS', subSysId: 'LAS_001',
    }) });
    const parsed = JSON.parse(resp.body as string);
    expect(parsed.statusCode).toBe(1);

    // 从 FTP 上传内容验证 datas 产出(S014 testCaseConfig 派生是否生效)。树形:datas[0] 菜单,用例在 children。
    const ftpCall = (ftpFacade.uploadFile as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const content = JSON.parse(ftpCall.content);
    expect(content.datas).toBeDefined();
    expect(content.datas).toHaveLength(1);
    expect(content.datas[0].children[0].name).toBe('Case1');
    // runSubSys 必须从 activeConfig.subSysId 派生(真源),不是硬编码
    expect(content.datas[0].children[0].runSubSys).toBe('ADS_001');
  });

  it('setTestTask decodes testCase with parameter override from snapshot', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const { createReportedSnapshotStorage } = await import('../services/reported-snapshot-storage');
    const reportedSnapshotStorage = createReportedSnapshotStorage(makeMemStorage());

    // 先 encode 一个带可覆盖字段的模板,存快照(D004: 入参是 source + mapping,不是 TaskTemplate)
    const { encodeSourceToTestCase } = await import('../core/testcase-sync-translator');
    const source: EncodeSource = {
      templateId: 'tpl-x',
      templateName: 'X',
      templateTags: [] as readonly string[],
      definition: {
        id: 'd', name: 'n',
        steps: [{ kind: 'send' as const, id: 'step-send', config: { frameId: 'rc-laser-on', userFieldValues: { power: 50 } } }],
        schedule: { kind: 'immediate' as const },
        errorPolicy: { onFailure: 'stop' as const },
      },
    };
    const mapping = { templateId: 'tpl-x', enabled: true, overridablePaths: ['step-send.send.userFieldValues.power'] };
    const { snapshot } = encodeSourceToTestCase(source, mapping, { subSysId:'LAS_001', subSysName:'激光', menuId:'m1', menuName:'功能', caseType:'orbit', runSubSys:'LAS_001' });
    reportedSnapshotStorage.save(snapshot);

    const service = createNorthboundService(makeOptions({ httpFacade, taskService, reportedSnapshotStorage }));
    const handler = await startAndGetHandler(service, httpFacade);

    await handler({ method: 'POST', url: '/setTestTask', body: JSON.stringify({
      method: 'setTestTask', requestId: 1, subSysType: 'LAS', subSysId: 'LAS_001',
      taskId: 'T1', immediate: true, repeatCount: 1, isEnd: true, resources: [],
      testCaseInfo: [{ testCaseId: snapshot.outCaseId, inputPars: [{ parId: 'step-send.send.userFieldValues.power', value: '99' }] }],
      executionPlan: { layers: [{ layer: 1, parallel: false, nodes: [snapshot.outCaseId] }] },
    }) });

    await vi.waitFor(() => expect(taskService.createTask).toHaveBeenCalled());
    const createdDef = (taskService.createTask as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const sendStep = createdDef.steps[0];
    expect(sendStep.kind).toBe('send');
    if (sendStep.kind === 'send') {
      expect(sendStep.config.userFieldValues?.power).toBe(99); // 被覆盖
      expect(sendStep.config.frameId).toBe('rc-laser-on');     // frameId 保持
    }
  });

  it('POST-required stubs reject GET requests', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const endpoints = ['setDeviceInfo', 'setPars', 'dataTransmit', 'neControl', 'getTestCaseAll'];
    for (const ep of endpoints) {
      const resp = await handler({ method: 'GET', url: `/${ep}`, body: JSON.stringify({
        method: ep, requestId: 6000, subSysType: 'ADS', subSysId: 'ADS_001',
      }) });
      const parsed = JSON.parse(resp.body as string);
      expect(parsed.statusCode).toBe(2);
      expect(parsed.msg).toBe('Method not allowed');
    }
  });
});

// ---------------------------------------------------------------------------
// setPars heartbeatTimer restart + customerTaskId echo on testCaseResultReport
// ---------------------------------------------------------------------------

describe('createNorthboundService — setPars heartbeat + customerTaskId echo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('setPars with heartbeatTimer restarts heartbeat at new interval', async () => {
    // Start with fake timers so every heartbeat schedule (initial + restarted) is fake.
    vi.useFakeTimers();
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/setPars', body: JSON.stringify({
      method: 'setPars', requestId: 7001, subSysType: 'ADS', subSysId: 'ADS_001',
      pars: [{ parId: 'heartbeatTimer', value: '30' }],
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.method).toBe('setParsResponse');
    expect(parsed.statusCode).toBe(1);

    // Clear the sendRequest spy so only heartbeat POSTs after setPars are observed.
    (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mockClear();

    // At 29s nothing should have fired yet; at 31s the 30s heartbeat should POST once.
    await vi.advanceTimersByTimeAsync(29_000);
    expect(httpFacade.sendRequest).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(httpFacade.sendRequest).toHaveBeenCalledTimes(1);
    const call = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.url).toContain('/admin/subSystem/heartbeat');
    const body = JSON.parse(call.body as string);
    expect(body.timer).toBe(30);
  });

  it('setPars without heartbeatTimer leaves existing heartbeat untouched', async () => {
    vi.useFakeTimers();
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/setPars', body: JSON.stringify({
      method: 'setPars', requestId: 7002, subSysType: 'ADS', subSysId: 'ADS_001',
      pars: [{ parId: 'someOtherPar', value: '42' }],
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.statusCode).toBe(1);

    (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mockClear();

    // Default 15s heartbeat should still fire once after 16s.
    await vi.advanceTimersByTimeAsync(16_000);
    expect(httpFacade.sendRequest).toHaveBeenCalled();
    const call = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const body = JSON.parse(call.body as string);
    expect(body.timer).toBe(15);
  });

  it('testCaseResultReport echoes customer-issued taskId (T_xxx), not instanceId', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const resultService = makeMockResultService();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService, resultService }));
    const handler = await startAndGetHandler(service, httpFacade);

    // Trigger a setTestTask; onSettled resolves immediately, so reportTaskResult fires.
    (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mockClear();
    await handler({ method: 'POST', url: '/setTestTask', body: JSON.stringify({
      method: 'setTestTask', requestId: 8001, subSysType: 'ADS', subSysId: 'ADS_001',
      taskId: 'T_178022737246337558', taskName: 'Result test', resources: [],
      immediate: true, repeatCount: 1, isEnd: true, orbitProtectTime: 0,
      testCaseInfo: [{ testCaseId: 'tc-result', deviceIds: [], masterTest: true, testMode: 1, ephMode: 1, orbitInfo: null, inputPars: [] }],
      ftpInfo: null,
      executionPlan: {
        layers: [{ layer: 1, parallel: false, nodes: ['tc-result'] }],
      },
    }) });

    // Wait for the serial layer to settle and call reportTaskResult
    await vi.waitFor(() => {
      const calls = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls;
      return calls.some(c => (c[0].url as string).includes('/admin/report/testCaseResultReport'));
    });

    const calls = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls;
    const resultCall = calls.find(c => (c[0].url as string).includes('/admin/report/testCaseResultReport'))!;
    const body = JSON.parse(resultCall[0].body as string);
    expect(body.method).toBe('testCaseResultReport');
    expect(body.taskId).toBe('T_178022737246337558');
    expect(body.taskId).not.toBe('inst-001');
    expect(body.testCaseId).toBe('tc-result');
  });
});

// 内存 Storage(给快照存储测试用)
function makeMemStorage(): Storage {
  const mem: Record<string, string> = {};
  return {
    getItem: (k: string) => mem[k] ?? null,
    setItem: (k: string, v: string) => { mem[k] = v; },
    removeItem: (k: string) => { delete mem[k]; },
    clear: () => { for (const k of Object.keys(mem)) delete mem[k]; },
    key: (i: number) => Object.keys(mem)[i] ?? null,
    length: 0,
  } as Storage;
}

// ---------------------------------------------------------------------------
// 跨层 barrier(D018 修复):parallel:true 分支必须等本层全部终态才进下一层
// ---------------------------------------------------------------------------

/**
 * 可控终态的 taskService mock:startTask 不自动 settle,onSettled 返回的 promise
 * 只有在调 settle(instanceId) 时才 resolve。用来精确观察 processLayers 跨层屏障。
 */
function makeMockTaskServiceControllable(): TaskService & {
  settle(id: string): void;
  createdIds(): string[];
} {
  const handlersList: TaskEventHandlers[] = [];
  const settleResolvers = new Map<string, () => void>();
  let nextId = 0;
  const created: string[] = [];
  const mock = {
    createTask: vi.fn(() => {
      nextId += 1;
      const id = `inst-${String(nextId).padStart(3, '0')}`;
      created.push(id);
      return makeMockInstance({ instanceId: id, lifecycle: 'running' });
    }),
    startTask: vi.fn(),
    stopTask: vi.fn(),
    pauseTask: vi.fn(),
    resumeTask: vi.fn(),
    getInstance: vi.fn((id: string) => makeMockInstance({ instanceId: id, lifecycle: 'running' })),
    // onSettled: 注册 resolver,只有 settle(id) 调用才 resolve —— 模拟任务持续 running
    onSettled: vi.fn((id: string) => new Promise<void>((resolve) => {
      settleResolvers.set(id, resolve);
    })),
    settle(id: string) {
      const r = settleResolvers.get(id);
      if (r) { settleResolvers.delete(id); r(); }
    },
    removeTask: vi.fn(),
    retryTask: vi.fn().mockReturnValue(undefined),
    updateTask: vi.fn().mockReturnValue(undefined),
    stopAll: vi.fn().mockReturnValue(0),
    getSnapshot: vi.fn().mockReturnValue({ instances: [] }),
    getProgress: vi.fn().mockReturnValue(undefined),
    getStatistics: vi.fn().mockReturnValue({ total: 0, active: 0, completed: 0, failed: 0 }),
    subscribe: vi.fn((handlers: TaskEventHandlers) => {
      handlersList.push(handlers);
      return () => {
        const idx = handlersList.indexOf(handlers);
        if (idx >= 0) handlersList.splice(idx, 1);
      };
    }),
    createTemplate: vi.fn(),
    listTemplates: vi.fn().mockReturnValue([]),
    getTemplate: vi.fn().mockReturnValue(undefined),
    updateTemplate: vi.fn().mockReturnValue(undefined),
    deleteTemplate: vi.fn().mockReturnValue(false),
    instanciateTemplate: vi.fn().mockReturnValue(makeMockInstance()),
    createdIds: () => [...created],
  };
  return mock as unknown as TaskService & { settle(id: string): void; createdIds(): string[] };
}

describe('createNorthboundService — 跨层 barrier (D018)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parallel:true 分支:本层用例未全部终态前,下一层 createTask 不被调用', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskServiceControllable();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService }));
    const handler = await startAndGetHandler(service, httpFacade);

    // 两层,每层一个用例,都 parallel:true。
    // 真实场景:layer1 的用例还在跑(layer1 未终态),layer2 不应启动。
    await handler({ method: 'POST', url: '/setTestTask', body: JSON.stringify({
      method: 'setTestTask', requestId: 1, subSysType: 'ADS', subSysId: 'ADS_001',
      taskId: 'T_barrier_1', taskName: 'Barrier', resources: [],
      immediate: true, repeatCount: 1, isEnd: true, orbitProtectTime: 0,
      testCaseInfo: [
        { testCaseId: 'tc-L1', deviceIds: [], masterTest: true, testMode: 1, ephMode: 1, orbitInfo: null, inputPars: [] },
        { testCaseId: 'tc-L2', deviceIds: [], masterTest: true, testMode: 1, ephMode: 1, orbitInfo: null, inputPars: [] },
      ],
      ftpInfo: null,
      executionPlan: {
        layers: [
          { layer: 1, parallel: true, nodes: ['tc-L1'] },
          { layer: 2, parallel: true, nodes: ['tc-L2'] },
        ],
      },
    }) });

    // 让 microtask 推进(layer1 的 createAndStartTask + Promise.all 应已跑)。
    await Promise.resolve();
    await Promise.resolve();

    // layer1 的 inst-001 已创建;layer2 的 inst-002 此刻【不应】被创建(layer1 未 settle)
    expect(taskService.createdIds()).toEqual(['inst-001']);

    // 现在 settle layer1 → 屏障放行 → layer2 才被创建
    taskService.settle('inst-001');
    await vi.waitFor(() => expect(taskService.createdIds()).toEqual(['inst-001', 'inst-002']));
  });

  it('parallel:true 分支:层内多个用例并发启动(不等彼此终态,只等层间屏障)', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskServiceControllable();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService }));
    const handler = await startAndGetHandler(service, httpFacade);

    // 单层 parallel:true,两个用例 —— 应并发创建(都 startTask),不等彼此终态
    await handler({ method: 'POST', url: '/setTestTask', body: JSON.stringify({
      method: 'setTestTask', requestId: 2, subSysType: 'ADS', subSysId: 'ADS_001',
      taskId: 'T_barrier_2', taskName: 'Intra', resources: [],
      immediate: true, repeatCount: 1, isEnd: true, orbitProtectTime: 0,
      testCaseInfo: [
        { testCaseId: 'tc-A', deviceIds: [], masterTest: true, testMode: 1, ephMode: 1, orbitInfo: null, inputPars: [] },
        { testCaseId: 'tc-B', deviceIds: [], masterTest: true, testMode: 1, ephMode: 1, orbitInfo: null, inputPars: [] },
      ],
      ftpInfo: null,
      executionPlan: {
        layers: [{ layer: 1, parallel: true, nodes: ['tc-A', 'tc-B'] }],
      },
    }) });

    // 层内并发:两个都创建了,且都没 settle(并发启动不等彼此)
    await vi.waitFor(() => expect(taskService.createdIds()).toEqual(['inst-001', 'inst-002']));
    expect(taskService.startTask).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// reportConfig driven TestReport (D008): uploadTestReportAndNotify 按
// reportConfigProvider + displayFieldReader 取 displayValue 填三类。
// 防止 S014/S017 同病(可选字段 + 单测手动传值 + runtime wiring 漏接 = 静默失败)。
// ---------------------------------------------------------------------------

/** setTestTask 触发完整 settled 链:createTask → startTask → onTaskSettled → handleTaskSettled
 *  → reportTaskResult → uploadTestReportAndNotify。本 mock 让 startTask 立即触发 settled。 */
function makeMockTaskServiceAutoSettle(templateId: string): TaskService {
  const handlersList: TaskEventHandlers[] = [];
  const instance: TaskInstanceState = makeMockInstance({
    instanceId: 'inst-001',
    templateId,
    lifecycle: 'completed',
    completedAt: '2026-06-10 10:00:05',
  });
  const mock = {
    createTask: vi.fn().mockReturnValue(instance),
    startTask: vi.fn((instanceId: string) => {
      for (const handlers of handlersList) {
        handlers.onTaskSettled?.(instanceId, 'completed');
      }
    }),
    stopTask: vi.fn(),
    pauseTask: vi.fn(),
    resumeTask: vi.fn(),
    getInstance: vi.fn().mockReturnValue(instance),
    onSettled: vi.fn().mockResolvedValue(undefined),
    removeTask: vi.fn(),
    retryTask: vi.fn().mockReturnValue(undefined),
    updateTask: vi.fn().mockReturnValue(undefined),
    stopAll: vi.fn().mockReturnValue(0),
    getSnapshot: vi.fn().mockReturnValue({ instances: [] }),
    getProgress: vi.fn().mockReturnValue(undefined),
    getStatistics: vi.fn().mockReturnValue({ total: 0, active: 0, completed: 0, failed: 0 }),
    subscribe: vi.fn((handlers: TaskEventHandlers) => {
      handlersList.push(handlers);
      return () => {
        const idx = handlersList.indexOf(handlers);
        if (idx >= 0) handlersList.splice(idx, 1);
      };
    }),
    createTemplate: vi.fn(),
    listTemplates: vi.fn().mockReturnValue([]),
    getTemplate: vi.fn().mockReturnValue(undefined),
    updateTemplate: vi.fn().mockReturnValue(undefined),
    deleteTemplate: vi.fn().mockReturnValue(false),
    instanciateTemplate: vi.fn().mockReturnValue(instance),
  };
  return mock as unknown as TaskService;
}

describe('createNorthboundService — uploadTestReportAndNotify reportConfig driven (D008)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fills TestReport three categories from reportConfigProvider + displayFieldReader', async () => {
    const httpFacade = makeMockHttpFacade();
    const ftpFacade: FtpFacade = { uploadFile: vi.fn().mockResolvedValue(undefined) };
    const taskService = makeMockTaskServiceAutoSettle('tpl-report');
    const reportConfig: ReportConfig = {
      templateId: 'tpl-report',
      checkPoints: [{ id: 'i1', name: '载波同步锁定', frameId: 'fA', fieldId: 'lock' }],
      statisticsItems: [{ id: 'i2', name: '误码率', frameId: 'fA', fieldId: 'ber' }],
      attachItems: [],
    };
    const fakeDisplayFields = [
      { dataItemId: 'fA:lock', displayValue: '锁定' },
      { dataItemId: 'fA:ber', displayValue: '0.2%' },
    ];
    const service = createNorthboundService(makeOptions({
      httpFacade,
      ftpFacade,
      taskService,
      reportConfigProvider: (tid) => (tid === 'tpl-report' ? reportConfig : undefined),
      displayFieldReader: { getSourceFields: () => fakeDisplayFields },
    }));
    const handler = await startAndGetHandler(service, httpFacade);

    // 走 setTestTask 触发完整 settled 链 → uploadTestReportAndNotify
    await handler({ method: 'POST', url: '/setTestTask', body: JSON.stringify({
      method: 'setTestTask', requestId: 6001, subSysType: 'LAS', subSysId: 'LAS_001',
      taskId: 'T_report_1', taskName: 'Report', resources: [],
      immediate: true, repeatCount: 1, isEnd: true, orbitProtectTime: 0,
      testCaseInfo: [
        { testCaseId: 'tc-report', deviceIds: [], masterTest: true, testMode: 1, ephMode: 1, orbitInfo: null, inputPars: [] },
      ],
      ftpInfo: null,
      executionPlan: { layers: [{ layer: 1, parallel: false, nodes: ['tc-report'] }] },
    }) });
    // 推进 microtask(fire-and-forget reportTaskResult)
    await vi.waitFor(() => expect(ftpFacade.uploadFile).toHaveBeenCalled());

    const ftpCall = (ftpFacade.uploadFile as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const report = JSON.parse(ftpCall.content);
    const tc = report.testCaseList[0];
    // checkPoint: name → checkPoint, displayValue(锁定) → testValue(非原始 0x01)
    expect(tc.checkPoints[0].checkPoint).toBe('载波同步锁定');
    expect(tc.checkPoints[0].testValue).toBe('锁定');
    expect(tc.checkPoints[0].result).toBe('通过'); // verdict passed
    // statisticsItem: displayValue(0.2%) → testValue
    expect(tc.statisticsItems[0].itemName).toBe('误码率');
    expect(tc.statisticsItems[0].testValue).toBe('0.2%');
    expect(tc.attachItems).toEqual([]);
  });

  it('produces empty categories when reportConfigProvider returns undefined (hydrate 前空壳阶段)', async () => {
    const httpFacade = makeMockHttpFacade();
    const ftpFacade: FtpFacade = { uploadFile: vi.fn().mockResolvedValue(undefined) };
    const taskService = makeMockTaskServiceAutoSettle('tpl-noreport');
    const service = createNorthboundService(makeOptions({
      httpFacade,
      ftpFacade,
      taskService,
      reportConfigProvider: () => undefined, // 空壳阶段 / 模板没配
      displayFieldReader: { getSourceFields: () => [] },
    }));
    const handler = await startAndGetHandler(service, httpFacade);

    await handler({ method: 'POST', url: '/setTestTask', body: JSON.stringify({
      method: 'setTestTask', requestId: 6002, subSysType: 'LAS', subSysId: 'LAS_001',
      taskId: 'T_report_2', taskName: 'Report', resources: [],
      immediate: true, repeatCount: 1, isEnd: true, orbitProtectTime: 0,
      testCaseInfo: [
        { testCaseId: 'tc-noreport', deviceIds: [], masterTest: true, testMode: 1, ephMode: 1, orbitInfo: null, inputPars: [] },
      ],
      ftpInfo: null,
      executionPlan: { layers: [{ layer: 1, parallel: false, nodes: ['tc-noreport'] }] },
    }) });
    await vi.waitFor(() => expect(ftpFacade.uploadFile).toHaveBeenCalled());

    const ftpCall = (ftpFacade.uploadFile as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const report = JSON.parse(ftpCall.content);
    const tc = report.testCaseList[0];
    // D008: 没配 ReportConfig → 三类空(不 fallback DEFAULT_MOCK_CONFIG 假数据)
    expect(tc.checkPoints).toEqual([]);
    expect(tc.statisticsItems).toEqual([]);
    expect(tc.attachItems).toEqual([]);
  });
});
