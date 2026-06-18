import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNorthboundService, type NorthboundServiceOptions, type NorthboundConfig, type FtpFacade } from '../services/northbound-service';
import type { TaskService } from '@/features/task';
import type { ResultService } from '@/features/result';
import type { HttpFacade, HttpResponse } from '@/platform';
import type { TaskInstanceState, TaskDefinition, TaskStepResult, TaskEventHandlers } from '@/features/task/core';
import type { CaseVerdict } from '@/features/result';

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
};

/** Start the service and return the onRequest handler so we can simulate inbound requests. */
async function startAndGetHandler(service: ReturnType<typeof createNorthboundService>, httpFacade: HttpFacade): Promise<(req: { method: string; url: string; body?: string }) => Promise<HttpResponse>> {
  await service.start(defaultConfig);
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
      tranType: 'upload', result: 'success', fileType: 'WRPSig', fileIndex: 1, filePath: '/data/test.csv', ftpServerIp: '192.168.0.1',
    });

    const call = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.url).toContain('/admin/report/fileTranslationComplete');
    const body = JSON.parse(call.body as string);
    expect(body.method).toBe('fileTranslationComplete');
    expect(body.tranType).toBe('upload');
    expect(body.ftpServerIp).toBe('192.168.0.1');
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

  it('getTestCaseAll without FTP returns success', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/getTestCaseAll', body: JSON.stringify({
      method: 'getTestCaseAll', requestId: 5009, subSysType: 'ADS', subSysId: 'ADS_001',
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.method).toBe('getTestCaseAllResponse');
    expect(parsed.statusCode).toBe(1);
  });

  it('getTestCaseAll with FTP uploads and returns success', async () => {
    const httpFacade = makeMockHttpFacade();
    const ftpFacade: FtpFacade = { uploadFile: vi.fn().mockResolvedValue(undefined) };
    const service = createNorthboundService(makeOptions({ httpFacade, ftpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/getTestCaseAll', body: JSON.stringify({
      method: 'getTestCaseAll', requestId: 5010, subSysType: 'ADS', subSysId: 'ADS_001',
      ftpInfo: { ip: '192.168.1.50', port: 21, username: 'ftpuser', password: 'ftppass', dir: '/data' },
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.statusCode).toBe(1);
    expect(ftpFacade.uploadFile).toHaveBeenCalledOnce();
    const ftpCall = (ftpFacade.uploadFile as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(ftpCall.host).toBe('192.168.1.50');
    expect(ftpCall.port).toBe(21);
    expect(ftpCall.username).toBe('ftpuser');
    expect(ftpCall.remotePath).toBe('/data/testcase_all.json');
    const content = JSON.parse(ftpCall.content);
    // 数据源已改为 listTemplates(默认空),FTP 上传空用例数组
    expect(Array.isArray(content)).toBe(true);
    expect(content).toHaveLength(0);
  });

  it('getTestCaseAll FTP failure returns error envelope', async () => {
    const httpFacade = makeMockHttpFacade();
    const ftpFacade: FtpFacade = { uploadFile: vi.fn().mockRejectedValue(new Error('connection refused')) };
    const service = createNorthboundService(makeOptions({ httpFacade, ftpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/getTestCaseAll', body: JSON.stringify({
      method: 'getTestCaseAll', requestId: 5011, subSysType: 'ADS', subSysId: 'ADS_001',
      ftpInfo: { ip: '192.168.1.50' },
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.statusCode).toBe(2);
    expect(parsed.msg).toBe('FTP upload failed');
  });

  it('getTestCaseAll returns datas from listTemplates with customerSync enabled', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const { createReportedSnapshotStorage } = await import('../services/reported-snapshot-storage');
    const reportedSnapshotStorage = createReportedSnapshotStorage(makeMemStorage());
    // 注入一个 enabled 模板 + 一个 disabled 模板
    taskService.listTemplates = vi.fn().mockReturnValue([
      { templateId: 'tpl-on', name: 'On', tags: [], definition: { id:'d', name:'n', steps:[{ kind:'delay', id:'s', config:{ durationMs:1000 } }], schedule:{kind:'immediate'}, errorPolicy:{onFailure:'stop'} }, createdAt:'', updatedAt:'', customerSync:{ enabled:true, overridablePaths:[] } },
      { templateId: 'tpl-off', name: 'Off', tags: [], definition: { id:'d2', name:'n2', steps:[{ kind:'delay', id:'s2', config:{ durationMs:1000 } }], schedule:{kind:'immediate'}, errorPolicy:{onFailure:'stop'} }, createdAt:'', updatedAt:'', customerSync:{ enabled:false } },
    ]);
    const service = createNorthboundService(makeOptions({
      httpFacade,
      taskService,
      testCaseConfig: { subSysId:'LAS_001', subSysName:'激光', menuId:'m1', menuName:'功能', caseType:'orbit' },
      reportedSnapshotStorage,
    }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/getTestCaseAll', body: JSON.stringify({
      method: 'getTestCaseAll', requestId: 5012, subSysType: 'LAS', subSysId: 'LAS_001',
    }) });
    const parsed = JSON.parse(resp.body as string);

    expect(parsed.datas).toBeDefined();
    expect(parsed.datas).toHaveLength(1);
    expect(parsed.datas[0].caseName).toBe('On');
    expect(parsed.datas[0].subSysName).toBe('激光');
  });

  it('setTestTask decodes testCase with parameter override from snapshot', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const { createReportedSnapshotStorage } = await import('../services/reported-snapshot-storage');
    const reportedSnapshotStorage = createReportedSnapshotStorage(makeMemStorage());

    // 先 encode 一个带可覆盖字段的模板,存快照
    const { encodeTaskTemplateToTestCase } = await import('../core/testcase-sync-translator');
    const tpl = {
      templateId: 'tpl-x',
      name: 'X',
      tags: [],
      definition: {
        id: 'd', name: 'n',
        steps: [{ kind: 'send' as const, id: 'step-send', config: { frameId: 'rc-laser-on', userFieldValues: { power: 50 } } }],
        schedule: { kind: 'immediate' as const },
        errorPolicy: { onFailure: 'stop' as const },
      },
      createdAt: '', updatedAt: '',
      customerSync: { enabled: true, overridablePaths: ['step-send.send.userFieldValues.power'] },
    };
    const { snapshot } = encodeTaskTemplateToTestCase(tpl as any, { subSysId:'LAS_001', subSysName:'激光', menuId:'m1', menuName:'功能', caseType:'orbit' });
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
