import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createNorthboundService, type NorthboundServiceOptions, type NorthboundConfig, type FtpFacade } from '../services/northbound-service';
import type { TaskService } from '@/features/task';
import type { ResultService } from '@/features/result';
import type { HttpFacade, HttpResponse } from '@/platform';
import type { TaskInstanceState, TaskDefinition, TaskStepResult } from '@/features/task/core';
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
  return {
    createTask: vi.fn().mockReturnValue(makeMockInstance()),
    startTask: vi.fn(),
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
  };
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
  customerBaseUrl: 'http://customer.example.com/partner-api/admin/',
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

    const body = JSON.stringify({
      method: 'setTestTask',
      requestId: 1001,
      subSysType: 'ADS',
      subSysId: 'ADS_001',
      sessionId: 5001,
      executionPlan: {
        layers: [{
          layerNo: 1,
          parallel: true,
          testCaseInfoList: [{
            testCaseId: 'tc-001',
            testCaseName: 'Test case 1',
            steps: [{ kind: 'send', frameId: 'f1', targetId: 't1' }],
          }],
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

  it('controlTestTask with stop controlType calls stopTask', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService }));

    // First, create a mapping via setTestTask
    const handler = await startAndGetHandler(service, httpFacade);
    const setBody = JSON.stringify({
      method: 'setTestTask', requestId: 2001, subSysType: 'ADS', subSysId: 'ADS_001',
      executionPlan: { layers: [{ layerNo: 1, parallel: true, testCaseInfoList: [{ testCaseId: 'tc-ctrl', testCaseName: 'Ctrl test', steps: [{ kind: 'send', frameId: 'f1', targetId: 't1' }] }] }] },
    });
    await handler({ method: 'POST', url: '/setTestTask', body: setBody });

    // Now send controlTestTask
    const ctrlBody = JSON.stringify({
      method: 'controlTestTask', requestId: 2002, subSysType: 'ADS', subSysId: 'ADS_001',
      testCaseIdList: ['tc-ctrl'], controlType: 'stop',
    });
    const resp = await handler({ method: 'POST', url: '/controlTestTask', body: ctrlBody });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.method).toBe('controlTestTaskResponse');
    expect(parsed.statusCode).toBe(1);
    expect(parsed.requestId).toBe(2002);
    expect(taskService.stopTask).toHaveBeenCalledWith('inst-001');
  });

  it('controlTestTask with pause calls pauseTask', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService }));
    const handler = await startAndGetHandler(service, httpFacade);

    // Setup mapping
    await handler({ method: 'POST', url: '/setTestTask', body: JSON.stringify({
      method: 'setTestTask', requestId: 1, subSysType: 'ADS', subSysId: 'ADS_001',
      executionPlan: { layers: [{ layerNo: 1, parallel: true, testCaseInfoList: [{ testCaseId: 'tc-p', testCaseName: 'Pause', steps: [{ kind: 'send', frameId: 'f1', targetId: 't1' }] }] }] },
    }) });

    const resp = await handler({ method: 'POST', url: '/controlTestTask', body: JSON.stringify({
      method: 'controlTestTask', requestId: 2003, subSysType: 'ADS', subSysId: 'ADS_001',
      testCaseIdList: ['tc-p'], controlType: 'pause',
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.statusCode).toBe(1);
    expect(taskService.pauseTask).toHaveBeenCalledWith('inst-001');
  });

  it('controlTestTask with missing testCaseIdList returns error', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = createNorthboundService(makeOptions({ httpFacade }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/controlTestTask', body: JSON.stringify({
      method: 'controlTestTask', requestId: 2004, subSysType: 'ADS', subSysId: 'ADS_001',
      testCaseIdList: [], controlType: 'stop',
    }) });

    const parsed = JSON.parse(resp.body as string);
    expect(parsed.statusCode).toBe(2);
    expect(parsed.msg).toBe('Missing testCaseIdList');
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
      executionPlan: { layers: [{ layerNo: 1, parallel: true, testCaseInfoList: [{ testCaseId: 'tc-step', testCaseName: 'Step test', steps: [{ kind: 'send', frameId: 'f1', targetId: 't1' }] }] }] },
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
    expect(call.url).toContain('/report/msgReport');
    expect(call.headers?.Authorization).toBe('Bearer test-token');
    const body = JSON.parse(call.body as string);
    expect(body.method).toBe('msgReport');
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

  it('reportDeviceInfo POSTs to /deviceInfo/deviceInfoReport with envelope', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = await startAndClear(httpFacade);

    await service.reportDeviceInfo([{ name: 'UE1', deviceId: 'D1', type: 'UE', swVer: '1.0', status: 'online' }]);

    expect(httpFacade.sendRequest).toHaveBeenCalledOnce();
    const call = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.url).toContain('/deviceInfo/deviceInfoReport');
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

  it('reportSubSysAlarm POSTs to /subSystem/subSysAlarmReport', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = await startAndClear(httpFacade);

    await service.reportSubSysAlarm([{ alarmId: 'A2', severity: 'warn', warnTime: '2026-01-01T00:00:00', msg: 'sys alarm' }]);

    const call = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.url).toContain('/subSystem/subSysAlarmReport');
    const body = JSON.parse(call.body as string);
    expect(body.method).toBe('subSysAlarmReport');
    expect(body.datas).toHaveLength(1);
  });

  it('reportTestDataFileComplete POSTs to /report/testDataFileTranslationComplete', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = await startAndClear(httpFacade);

    await service.reportTestDataFileComplete({
      taskId: 'T1', testCaseId: ['TC1'], ftpServerIP: '192.168.0.1', fileType: 'WRPSig', filePath: '/data/test.csv',
    });

    const call = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.url).toContain('/report/testDataFileTranslationComplete');
    const body = JSON.parse(call.body as string);
    expect(body.method).toBe('testDataFileTranslationComplete');
    expect(body.taskId).toBe('T1');
    expect(body.ftpServerIP).toBe('192.168.0.1');
  });

  it('reportFileTranslationComplete POSTs to /report/fileTranslationComplete', async () => {
    const httpFacade = makeMockHttpFacade();
    const service = await startAndClear(httpFacade);

    await service.reportFileTranslationComplete({
      tranType: 'upload', result: 'success', fileType: 'WRPSig', fileIndex: 1, filePath: '/data/test.csv', ftpServerIp: '192.168.0.1',
    });

    const call = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.url).toContain('/report/fileTranslationComplete');
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
    expect(call.url).toContain('/report/sigReport');
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
    expect(content.datas).toHaveLength(1);
    expect(content.datas[0].isParent).toBe(true);
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
