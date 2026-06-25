import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createNorthboundService, type NorthboundServiceOptions } from '../services/northbound-service';
import { createDockingBatchRegistry, type DockingBatchRegistry } from '@/features/command-ingress';
import type { TaskService } from '@/features/task';
import type { ResultService } from '@/features/result';
import type { HttpFacade, HttpResponse } from '@/platform';
import type { TaskInstanceState, TaskDefinition, TaskEventHandlers } from '@/features/task/core';
import type { CaseVerdict } from '@/features/result';

// ---------------------------------------------------------------------------
// Mock factories(照 northbound-service.spec.ts 的 mock 模式)
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

/** startTask 默认同步触发 onTaskSettled(模拟任务立即完成)。递增 instanceId。 */
function makeMockTaskService(): TaskService & { _nextId: number } {
  const handlersList: TaskEventHandlers[] = [];
  let nextId = 0;
  const mock = {
    _nextId: 0,
    createTask: vi.fn(() => {
      nextId += 1;
      mock._nextId = nextId;
      return makeMockInstance({ instanceId: `inst-${String(nextId).padStart(3, '0')}` });
    }),
    startTask: vi.fn((instanceId: string) => {
      for (const handlers of handlersList) {
        handlers.onTaskSettled?.(instanceId, 'completed');
      }
    }),
    stopTask: vi.fn(),
    pauseTask: vi.fn(),
    resumeTask: vi.fn(),
    getInstance: vi.fn((id: string) => makeMockInstance({ instanceId: id, lifecycle: 'completed' })),
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
    instanciateTemplate: vi.fn().mockReturnValue(makeMockInstance()),
  };
  return mock as unknown as TaskService & { _nextId: number };
}

/** startTask 不触发 onTaskSettled(任务保持 running),用于 controlTestTask 场景。 */
function makeMockTaskServiceRunning(): TaskService {
  const handlersList: TaskEventHandlers[] = [];
  let nextId = 0;
  const mock = {
    createTask: vi.fn(() => {
      nextId += 1;
      return makeMockInstance({ instanceId: `inst-${String(nextId).padStart(3, '0')}`, lifecycle: 'running' });
    }),
    startTask: vi.fn(),
    stopTask: vi.fn(),
    pauseTask: vi.fn(),
    resumeTask: vi.fn(),
    getInstance: vi.fn((id: string) => makeMockInstance({ instanceId: id, lifecycle: 'running' })),
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

const defaultConfig = {
  serverHost: '0.0.0.0',
  serverPort: 8080,
  customerBaseUrl: 'http://customer.example.com/partner-api/',
  subSysType: 'ADS',
  subSysId: 'ADS_001',
  auth: {
    loginUrl: 'http://customer.example.com/partner-api/auth/partner/login',
    clientId: 'cid',
    username: 'subsys',
    password: 'secret',
    grantType: 'partner',
    tenantId: '000000',
  },
};

function makeOptions(overrides?: Partial<NorthboundServiceOptions>): NorthboundServiceOptions {
  return {
    taskService: makeMockTaskService(),
    resultService: makeMockResultService(),
    httpFacade: makeMockHttpFacade(),
    connectionSnapshot: () => ({ status: 'connected' }),
    ...overrides,
  };
}

async function startAndGetHandler(
  service: ReturnType<typeof createNorthboundService>,
  httpFacade: HttpFacade,
): Promise<(req: { method: string; url: string; body?: string }) => Promise<HttpResponse>> {
  await service.start(defaultConfig);
  const onRequestCalls = (httpFacade.onRequest as ReturnType<typeof vi.fn>).mock.calls;
  return onRequestCalls[0][1] as (req: { method: string; url: string; body?: string }) => Promise<HttpResponse>;
}

function setTestTaskBody(taskId: string, cases: { testCaseId: string; caseName: string }[], parallel = true): string {
  const layers = cases.length > 1
    ? [{ layer: 1, parallel, nodes: cases.map(c => ({ id: c.testCaseId, name: c.caseName, type: 'case' })) }]
    : [{ layer: 1, parallel, nodes: [{ id: cases[0]!.testCaseId, name: cases[0]!.caseName, type: 'case' }] }];
  return JSON.stringify({
    method: 'setTestTask',
    requestId: 1,
    subSysType: 'laser',
    subSysId: 'JG',
    taskId,
    taskName: `任务-${taskId}`,
    immediate: true,
    repeatCount: 1,
    isEnd: false,
    orbitProtectTime: 0,
    testCaseInfo: cases.map(c => ({ testCaseId: c.testCaseId, deviceIds: [], masterTest: false, testMode: 0, ephMode: 0, orbitInfo: null, inputPars: [] })),
    executionPlan: { layers },
  });
}

// ---------------------------------------------------------------------------
// 接入点 1 + 2: setTestTask 建 batchRegistry meta / createAndStartTask 回填 instanceId
// ---------------------------------------------------------------------------

describe('batchRegistry 接入点 1+2: handleSetTestTask 建 meta / createAndStartTask 回填 instanceId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('接入点1: setTestTask 后 registry 有批次(taskId/taskName/cases 来自 node,instanceId 全 null)', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const registry = createDockingBatchRegistry();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService, batchRegistry: registry }));
    const handler = await startAndGetHandler(service, httpFacade);

    await handler({
      method: 'POST', url: '/setTestTask',
      body: setTestTaskBody('T_20260624', [
        { testCaseId: 'c2b4@1', caseName: '1540波长测试 - 5G RS' },
        { testCaseId: '2181@2', caseName: '1540波长测试 - 2.5G LDPC' },
      ]),
    });
    await vi.waitFor(() => expect(taskService.createTask).toHaveBeenCalledTimes(2));

    const batch = registry.loadAll().find(b => b.taskId === 'T_20260624')!;
    expect(batch.taskName).toBe('任务-T_20260624');
    expect(batch.cases).toHaveLength(2);
    // 接入点1 建批次时 caseName 来自 node.name;instanceId 此时已被接入点2 回填(processLayers 跑完)
    expect(batch.cases[0]).toMatchObject({ testCaseId: 'c2b4@1', caseName: '1540波长测试 - 5G RS' });
    expect(batch.cases[1]).toMatchObject({ testCaseId: '2181@2', caseName: '1540波长测试 - 2.5G LDPC' });
    // 两个用例的 instanceId 都已被接入点2 回填(非 null)
    expect(batch.cases[0]!.instanceId).toBeTypeOf('string');
    expect(batch.cases[1]!.instanceId).toBeTypeOf('string');
  });

  it('接入点1: 幂等——重复 taskId 不覆盖(registry 仍只 1 个批次)', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const registry = createDockingBatchRegistry();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService, batchRegistry: registry }));
    const handler = await startAndGetHandler(service, httpFacade);

    await handler({ method: 'POST', url: '/setTestTask', body: setTestTaskBody('T_DUP', [{ testCaseId: 'tc-x', caseName: 'X' }]) });
    await vi.waitFor(() => expect(taskService.createTask).toHaveBeenCalledTimes(1));
    await handler({ method: 'POST', url: '/setTestTask', body: setTestTaskBody('T_DUP', [{ testCaseId: 'tc-y', caseName: 'Y' }]) });
    await vi.waitFor(() => expect(taskService.createTask).toHaveBeenCalledTimes(2));

    // 重复 taskId 不覆盖,保留首次(caseName X)
    expect(registry.loadAll().filter(b => b.taskId === 'T_DUP')).toHaveLength(1);
    expect(registry.loadAll().find(b => b.taskId === 'T_DUP')!.cases[0]!.caseName).toBe('X');
  });

  it('接入点1: 字符串 node 形式 caseName 回落 testCaseId', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const registry = createDockingBatchRegistry();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService, batchRegistry: registry }));
    const handler = await startAndGetHandler(service, httpFacade);

    await handler({
      method: 'POST', url: '/setTestTask',
      body: JSON.stringify({
        method: 'setTestTask', requestId: 1, subSysType: 'laser', subSysId: 'JG',
        taskId: 'T_STR', taskName: '字符串node任务', immediate: true, repeatCount: 1, isEnd: false, orbitProtectTime: 0,
        testCaseInfo: [{ testCaseId: 'tc-str', deviceIds: [], masterTest: false, testMode: 0, ephMode: 0, orbitInfo: null, inputPars: [] }],
        executionPlan: { layers: [{ layer: 1, parallel: false, nodes: ['tc-str'] }] },
      }),
    });
    await vi.waitFor(() => expect(taskService.createTask).toHaveBeenCalledTimes(1));

    const batch = registry.loadAll().find(b => b.taskId === 'T_STR')!;
    expect(batch.cases[0]).toMatchObject({ testCaseId: 'tc-str', caseName: 'tc-str' });
  });

  it('接入点2: createAndStartTask 后回填 instanceId(非 null)', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const registry = createDockingBatchRegistry();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService, batchRegistry: registry }));
    const handler = await startAndGetHandler(service, httpFacade);

    await handler({ method: 'POST', url: '/setTestTask', body: setTestTaskBody('T_BF', [{ testCaseId: 'tc-bf', caseName: 'BF用例' }]) });
    await vi.waitFor(() => expect(() => {
      const b = registry.loadAll().find(x => x.taskId === 'T_BF')!;
      if (!b.cases[0]!.instanceId) throw new Error('not backfilled');
    }).not.toThrow());

    const batch = registry.loadAll().find(b => b.taskId === 'T_BF')!;
    expect(batch.cases[0]!.instanceId).toBeTypeOf('string');
  });

  it('多 layer:cases 按 layer 升序遍历 + 全回填 instanceId', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const registry = createDockingBatchRegistry();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService, batchRegistry: registry }));
    const handler = await startAndGetHandler(service, httpFacade);

    await handler({
      method: 'POST', url: '/setTestTask',
      body: JSON.stringify({
        method: 'setTestTask', requestId: 1, subSysType: 'laser', subSysId: 'JG',
        taskId: 'T_MULTI', taskName: '多layer', immediate: true, repeatCount: 1, isEnd: false, orbitProtectTime: 0,
        testCaseInfo: [
          { testCaseId: 'tc-L1', deviceIds: [], masterTest: false, testMode: 0, ephMode: 0, orbitInfo: null, inputPars: [] },
          { testCaseId: 'tc-L2', deviceIds: [], masterTest: false, testMode: 0, ephMode: 0, orbitInfo: null, inputPars: [] },
        ],
        executionPlan: {
          layers: [
            { layer: 2, parallel: false, nodes: [{ id: 'tc-L2', name: 'L2用例', type: 'case' }] },
            { layer: 1, parallel: false, nodes: [{ id: 'tc-L1', name: 'L1用例', type: 'case' }] },
          ],
        },
      }),
    });
    await vi.waitFor(() => expect(taskService.createTask).toHaveBeenCalledTimes(2));

    const batch = registry.loadAll().find(b => b.taskId === 'T_MULTI')!;
    // cases 按 layer 升序(L1 在前)
    expect(batch.cases.map(c => c.testCaseId)).toEqual(['tc-L1', 'tc-L2']);
    // 两个都回填了 instanceId
    await vi.waitFor(() => expect(batch.cases.every(c => c.instanceId !== null)).toBe(true));
  });

  it('无 batchRegistry 时:setTestTask 链路照常(不抛错)', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({ method: 'POST', url: '/setTestTask', body: setTestTaskBody('T_NS', [{ testCaseId: 'tc-ns', caseName: 'NS' }]) });
    expect(resp.statusCode).toBe(200);
    await vi.waitFor(() => expect(taskService.createTask).toHaveBeenCalledTimes(1));
  });
});

// ---------------------------------------------------------------------------
// 接入点 3 + 4 已删除: reportTaskResult / controlTestTask 不碰 registry
// ---------------------------------------------------------------------------

describe('接入点 3+4 已删除: reportTaskResult / controlTestTask 不写 registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('任务 settle(reportTaskResult)后 registry 的 case 仍只有 instanceId,不写 status/结果', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService(); // startTask 同步 settle
    const resultService = makeMockResultService();
    const registry = createDockingBatchRegistry();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService, resultService, batchRegistry: registry }));
    const handler = await startAndGetHandler(service, httpFacade);

    await handler({ method: 'POST', url: '/setTestTask', body: setTestTaskBody('T_SETTLE', [{ testCaseId: 'tc-st', caseName: 'ST用例' }]) });
    // 等 settle + reportTaskResult 链路跑完(等 testCaseResultReport 上报)
    await vi.waitFor(() => {
      const calls = (httpFacade.sendRequest as ReturnType<typeof vi.fn>).mock.calls;
      return calls.some(c => (c[0].url as string).includes('/testCaseResultReport'));
    });

    // registry 的 case 仍只有接入点2 回填的 instanceId,没有 status/finishedAt(DockingBatchCaseMeta 不含这些字段)
    const batch = registry.loadAll().find(b => b.taskId === 'T_SETTLE')!;
    expect(batch.cases[0]!.instanceId).toBeTypeOf('string');
    // DockingBatchCaseMeta 只有 testCaseId/caseName/instanceId,确认没引入额外字段
    expect(Object.keys(batch.cases[0]!).sort()).toEqual(['caseName', 'instanceId', 'testCaseId']);
  });

  it('controlTestTask stop 后 registry 不变(只调 taskService.stopTask)', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskServiceRunning();
    const registry = createDockingBatchRegistry();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService, batchRegistry: registry }));
    const handler = await startAndGetHandler(service, httpFacade);

    await handler({ method: 'POST', url: '/setTestTask', body: setTestTaskBody('T_CTRL', [{ testCaseId: 'tc-ctrl', caseName: 'CTRL用例' }]) });
    await vi.waitFor(() => expect(taskService.createTask).toHaveBeenCalledTimes(1));
    const beforeStop = JSON.stringify(registry.loadAll());

    await handler({
      method: 'POST', url: '/controlTestTask',
      body: JSON.stringify({ method: 'controlTestTask', requestId: 2, subSysType: 'laser', subSysId: 'JG', taskId: 'T_CTRL', action: 'stop' }),
    });

    expect(taskService.stopTask).toHaveBeenCalled();
    expect(JSON.stringify(registry.loadAll())).toBe(beforeStop); // registry 无变化
  });

  it('controlTestTask pause/continue 也不碰 registry', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskServiceRunning();
    const registry = createDockingBatchRegistry();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService, batchRegistry: registry }));
    const handler = await startAndGetHandler(service, httpFacade);

    await handler({ method: 'POST', url: '/setTestTask', body: setTestTaskBody('T_PC', [{ testCaseId: 'tc-pc', caseName: 'PC用例' }]) });
    await vi.waitFor(() => expect(taskService.createTask).toHaveBeenCalledTimes(1));
    const before = JSON.stringify(registry.loadAll());

    await handler({
      method: 'POST', url: '/controlTestTask',
      body: JSON.stringify({ method: 'controlTestTask', requestId: 2, subSysType: 'laser', subSysId: 'JG', taskId: 'T_PC', action: 'pause' }),
    });
    expect(JSON.stringify(registry.loadAll())).toBe(before);
    expect(taskService.pauseTask).toHaveBeenCalled();
  });
});
