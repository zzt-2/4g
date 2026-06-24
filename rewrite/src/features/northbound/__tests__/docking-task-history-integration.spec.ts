import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createNorthboundService, type NorthboundServiceOptions } from '../services/northbound-service';
import type { TaskService } from '@/features/task';
import type { ResultService } from '@/features/result';
import type { HttpFacade, HttpResponse } from '@/platform';
import type { TaskInstanceState, TaskDefinition, TaskEventHandlers } from '@/features/task/core';
import type { CaseVerdict } from '@/features/result';
import type { PersistedTaskBatch, PersistedTaskCase } from '@/features/command-ingress/services/docking-task-history-storage';

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

/** makeMockTaskService:startTask 默认同步触发 onTaskSettled(模拟任务立即完成)。
 *  每个 instance 用递增 instanceId,便于多用例场景区分。 */
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
      // 模拟 task 立即完成:同步触发 onTaskSettled 事件
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

/** 一个可观测的 fake historyStorage:记录所有调用 + 维护内存状态(便于断言最终状态)。 */
interface FakeHistoryStorage {
  insertBatch: ReturnType<typeof vi.fn>;
  updateCase: ReturnType<typeof vi.fn>;
  recomputeBatchStatus: ReturnType<typeof vi.fn>;
  loadAll: ReturnType<typeof vi.fn>;
  _batches: PersistedTaskBatch[];
}

function makeFakeHistoryStorage(initial: PersistedTaskBatch[] = []): FakeHistoryStorage {
  const batches = [...initial];
  return {
    insertBatch: vi.fn((b: PersistedTaskBatch) => {
      if (batches.some(x => x.taskId === b.taskId)) return false;
      // 深拷贝存入内存状态:接入点 2(updateCase)后续会 mutate,而 mock.calls 记录的是
      // 传入参数——若同引用,事后断言 insertBatch 初始快照会读到被 mutate 后的值。
      batches.push(structuredClone(b));
      return true;
    }),
    updateCase: vi.fn((taskId: string, testCaseId: string, patch: Partial<PersistedTaskCase>) => {
      const batch = batches.find(x => x.taskId === taskId);
      if (!batch) return;
      const idx = batch.cases.findIndex(c => c.testCaseId === testCaseId);
      if (idx < 0) return;
      const updated = batch.cases.map((c, i) => (i === idx ? { ...c, ...patch } : c));
      batch.cases = updated;
    }),
    recomputeBatchStatus: vi.fn(() => { /* no-op in fake */ }),
    loadAll: vi.fn(() => [...batches]),
    _batches: batches,
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

async function startAndGetHandler(
  service: ReturnType<typeof createNorthboundService>,
  httpFacade: HttpFacade,
): Promise<(req: { method: string; url: string; body?: string }) => Promise<HttpResponse>> {
  await service.start(defaultConfig);
  const onRequestCalls = (httpFacade.onRequest as ReturnType<typeof vi.fn>).mock.calls;
  return onRequestCalls[0][1] as (req: { method: string; url: string; body?: string }) => Promise<HttpResponse>;
}

/** 发 setTestTask 报文(对象 node 形式,匹配甲方真实报文)。 */
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
// 接入点 1 + 2 测试
// ---------------------------------------------------------------------------

describe('docking-task-history 接入点 1+2: handleSetTestTask 建批次 / createAndStartTask 回填', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('接入点1: setTestTask 收到后建批次(insertBatch 被调,taskId/taskName/cases 来自 node)', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const history = makeFakeHistoryStorage();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService, historyStorage: history }));
    const handler = await startAndGetHandler(service, httpFacade);

    await handler({
      method: 'POST', url: '/setTestTask',
      body: setTestTaskBody('T_20260624', [
        { testCaseId: 'c2b4@1', caseName: '1540波长测试 - 5G RS' },
        { testCaseId: '2181@2', caseName: '1540波长测试 - 2.5G LDPC' },
      ]),
    });
    // processLayers 异步触发,等 createTask 跑完
    await vi.waitFor(() => expect(taskService.createTask).toHaveBeenCalledTimes(2));

    expect(history.insertBatch).toHaveBeenCalledOnce();
    const batch = history.insertBatch.mock.calls[0]![0] as PersistedTaskBatch;
    expect(batch.taskId).toBe('T_20260624');
    expect(batch.taskName).toBe('任务-T_20260624');
    expect(batch.status).toBe('running');
    expect(batch.receivedAt).toBeTypeOf('number');
    expect(batch.cases).toHaveLength(2);
    // caseName 直接从 node.name 取,顺序按 layer 内 node 顺序
    expect(batch.cases[0]).toMatchObject({ testCaseId: 'c2b4@1', caseName: '1540波长测试 - 5G RS', status: 'pending', instanceId: null });
    expect(batch.cases[1]).toMatchObject({ testCaseId: '2181@2', caseName: '1540波长测试 - 2.5G LDPC', status: 'pending', instanceId: null });
  });

  it('接入点1: 幂等——重复 taskId 不重复插入(insertBatch 第二次返回 false)', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const history = makeFakeHistoryStorage();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService, historyStorage: history }));
    const handler = await startAndGetHandler(service, httpFacade);

    await handler({ method: 'POST', url: '/setTestTask', body: setTestTaskBody('T_DUP', [{ testCaseId: 'tc-x', caseName: 'X' }]) });
    await vi.waitFor(() => expect(taskService.createTask).toHaveBeenCalledTimes(1));
    await handler({ method: 'POST', url: '/setTestTask', body: setTestTaskBody('T_DUP', [{ testCaseId: 'tc-y', caseName: 'Y' }]) });
    await vi.waitFor(() => expect(taskService.createTask).toHaveBeenCalledTimes(2));

    // insertBatch 被调两次,但第二次 storage 内部去重(返 false),最终只有 1 个批次
    expect(history.insertBatch).toHaveBeenCalledTimes(2);
    expect(history._batches).toHaveLength(1);
    expect(history._batches[0]!.taskId).toBe('T_DUP');
  });

  it('接入点1: 字符串 node 形式回退 caseName=testCaseId', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const history = makeFakeHistoryStorage();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService, historyStorage: history }));
    const handler = await startAndGetHandler(service, httpFacade);

    // 字符串 node(文档原形,nodes 是纯 testCaseId 字符串)
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

    const batch = history.insertBatch.mock.calls[0]![0] as PersistedTaskBatch;
    expect(batch.cases[0]).toMatchObject({ testCaseId: 'tc-str', caseName: 'tc-str' }); // 字符串 node 无 name → 回落 testCaseId
  });

  it('接入点2: createAndStartTask 后回填 instanceId/status=running/startedAt(updateCase 被调)', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const history = makeFakeHistoryStorage();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService, historyStorage: history }));
    const handler = await startAndGetHandler(service, httpFacade);

    await handler({
      method: 'POST', url: '/setTestTask',
      body: setTestTaskBody('T_BACKFILL', [{ testCaseId: 'tc-bf', caseName: 'BF用例' }]),
    });
    await vi.waitFor(() => expect(taskService.createTask).toHaveBeenCalledTimes(1));

    // updateCase 被调一次,patch 含 instanceId/status/startedAt
    expect(history.updateCase).toHaveBeenCalledTimes(1);
    const [taskId, testCaseId, patch] = history.updateCase.mock.calls[0]!;
    expect(taskId).toBe('T_BACKFILL');
    expect(testCaseId).toBe('tc-bf');
    expect(patch).toMatchObject({ status: 'running' });
    expect(patch.instanceId).toBeTypeOf('string');
    expect((patch as Partial<PersistedTaskCase>).startedAt).toBeTypeOf('number');
    // 不回填 caseName(建批次时已从 node.name 取定)
    expect((patch as Partial<PersistedTaskCase>).caseName).toBeUndefined();
  });

  it('多 layer 顺序执行:cases 按 layer 升序遍历,每个用例都建批次+回填', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    const history = makeFakeHistoryStorage();
    const service = createNorthboundService(makeOptions({ httpFacade, taskService, historyStorage: history }));
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

    const batch = history.insertBatch.mock.calls[0]![0] as PersistedTaskBatch;
    // cases 按 layer 升序(L1 在前),平铺成一个列表
    expect(batch.cases.map(c => c.testCaseId)).toEqual(['tc-L1', 'tc-L2']);
    // 每个用例都回填了
    expect(history.updateCase).toHaveBeenCalledTimes(2);
  });

  it('无 historyStorage 时:接入点静默跳过(不抛错,不影响现有 setTestTask 链路)', async () => {
    const httpFacade = makeMockHttpFacade();
    const taskService = makeMockTaskService();
    // 不传 historyStorage
    const service = createNorthboundService(makeOptions({ httpFacade, taskService }));
    const handler = await startAndGetHandler(service, httpFacade);

    const resp = await handler({
      method: 'POST', url: '/setTestTask',
      body: setTestTaskBody('T_NOSTORE', [{ testCaseId: 'tc-ns', caseName: 'NS' }]),
    });
    // 现有链路照常(响应 ok + 创建任务)
    expect(resp.statusCode).toBe(200);
    await vi.waitFor(() => expect(taskService.createTask).toHaveBeenCalledTimes(1));
  });
});
