import type { TaskService } from '@/features/task';
import type { ResultService } from '@/features/result';
import type { HttpFacade, HttpRequest, HttpResponse } from '@/platform';
import { createNorthboundState, type NorthboundStateContainer } from '../state/northbound-state';
import { translateTestCaseToTaskDefinition } from '../core/inbound-translator';
import { translateTaskResult, translateStepResult } from '../core/outbound-translator';
import type {
  SetTestTaskRequest,
  ControlTestTaskRequest,
  CustomerResponse,
  ExecutionPlanLayer,
} from '../core/types';

export interface NorthboundConfig {
  readonly serverHost: string;
  readonly serverPort: number;
  readonly customerEndpoint: string;
}

export interface NorthboundServiceOptions {
  readonly taskService: TaskService;
  readonly resultService: ResultService;
  readonly httpFacade: HttpFacade;
  readonly connectionSnapshot: () => { readonly status: string };
}

export interface NorthboundService {
  start(config: NorthboundConfig): Promise<void>;
  stop(): Promise<void>;
  isActive(): boolean;
  getSessionStatus(): import('../state/northbound-state').NorthboundSessionSnapshot;
  /** Callback for task service onStepResult — call via task service options */
  handleStepResult(instanceId: string, result: import('@/features/task').TaskStepResult): void;
}

export function createNorthboundService(options: NorthboundServiceOptions): NorthboundService {
  const state: NorthboundStateContainer = createNorthboundState();
  let serverId: string | null = null;
  let requestUnsub: (() => void) | null = null;
  let activeConfig: NorthboundConfig | null = null;

  // --- Outbound helpers ---

  async function postToCustomer(path: string, body: unknown): Promise<void> {
    if (!activeConfig) return;
    try {
      await options.httpFacade.sendRequest({
        url: `${activeConfig.customerEndpoint}${path}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      // Outbound POST failure: log only, no retry (MVP)
    }
  }

  async function reportTaskResult(instanceId: string): Promise<void> {
    const instance = options.taskService.getInstance(instanceId);
    if (!instance) return;
    const testCaseId = state.getTestCaseId(instanceId);
    if (!testCaseId) return;

    const verdict = options.resultService.collectResult(instance);
    const report = translateTaskResult(instance, verdict, testCaseId);
    await postToCustomer('/testCaseResultReport', report);
    state.removeMapping(testCaseId);
  }

  // --- Step event handler (Step 6) ---

  function handleStepResult(instanceId: string, result: import('@/features/task').TaskStepResult): void {
    const instance = options.taskService.getInstance(instanceId);
    if (!instance) return;
    const testCaseId = state.getTestCaseId(instanceId);
    if (!testCaseId) return;

    const report = translateStepResult(instance, result, testCaseId);
    // Fire-and-forget: errors caught in postToCustomer
    postToCustomer('/msgReport', report);
  }

  // --- Inbound handlers ---

  async function handleSetTestTask(body: unknown): Promise<CustomerResponse> {
    let parsed: SetTestTaskRequest;
    try {
      parsed = body as SetTestTaskRequest;
    } catch {
      return { code: 400, msg: 'Invalid request body' };
    }

    const layers = parsed.executionPlan?.layers;
    if (!layers || !Array.isArray(layers)) {
      return { code: 400, msg: 'Missing executionPlan.layers' };
    }

    const sortedLayers = [...layers].sort((a, b) => a.layerNo - b.layerNo);

    // Process layers asynchronously — don't block the response
    processLayers(sortedLayers).catch(() => {});

    return { code: 200, msg: 'ok' };
  }

  async function processLayers(layers: ExecutionPlanLayer[]): Promise<void> {
    for (const layer of layers) {
      if (layer.parallel) {
        const tasks = layer.testCaseInfoList
          .filter(tc => !state.hasTestCase(tc.testCaseId))
          .map(tc => createAndStartTask(tc));

        await Promise.all(tasks.map(t => t.then(async ({ instanceId }) => {
          await options.taskService.onSettled(instanceId);
          await reportTaskResult(instanceId);
        })));
      } else {
        for (const tc of layer.testCaseInfoList) {
          if (state.hasTestCase(tc.testCaseId)) continue;

          const { instanceId } = await createAndStartTask(tc);
          await options.taskService.onSettled(instanceId);
          await reportTaskResult(instanceId);
        }
      }
    }
  }

  async function createAndStartTask(tc: { readonly testCaseId: string; readonly testCaseName: string; readonly steps: readonly unknown[] }): Promise<{ readonly instanceId: string }> {
    const def = translateTestCaseToTaskDefinition(tc as import('../core/types').TestCaseInfo);
    const instance = options.taskService.createTask(def);
    state.mapTestCase(tc.testCaseId, instance.instanceId);
    options.taskService.startTask(instance.instanceId);
    return { instanceId: instance.instanceId };
  }

  async function handleControlTestTask(body: unknown): Promise<CustomerResponse> {
    let parsed: ControlTestTaskRequest;
    try {
      parsed = body as ControlTestTaskRequest;
    } catch {
      return { code: 400, msg: 'Invalid request body' };
    }

    const { testCaseIdList, controlType } = parsed;
    if (!Array.isArray(testCaseIdList) || testCaseIdList.length === 0) {
      return { code: 400, msg: 'Missing testCaseIdList' };
    }

    for (const testCaseId of testCaseIdList) {
      const instanceId = state.getInstanceId(testCaseId);
      if (!instanceId) continue;

      switch (controlType) {
        case 'abort':
        case 'stop':
          options.taskService.stopTask(instanceId);
          break;
        case 'pause':
          options.taskService.pauseTask(instanceId);
          break;
        case 'continue':
          options.taskService.resumeTask(instanceId);
          break;
      }
    }

    return { code: 200, msg: 'ok' };
  }

  function handleHeartbeat(): CustomerResponse {
    return { code: 200, msg: 'ok' };
  }

  function handleGetSubSysState(): CustomerResponse {
    const snapshot = state.getSnapshot();
    const connection = options.connectionSnapshot();
    const activeTestCases: Record<string, { instanceId: string; status: string }> = {};
    for (const [testCaseId, info] of snapshot.activeTestCases) {
      activeTestCases[testCaseId] = info;
    }

    return {
      code: 200,
      msg: 'ok',
      data: {
        connectionStatus: connection.status,
        runningTestCases: activeTestCases,
      },
    };
  }

  // --- Request router ---

  async function handleRequest(req: HttpRequest): Promise<HttpResponse> {
    let body: unknown;
    try {
      body = req.body ? JSON.parse(req.body) : {};
    } catch {
      return jsonResponse({ code: 400, msg: 'Invalid JSON' }, 400);
    }

    let response: CustomerResponse;

    switch (req.url) {
      case '/setTestTask':
        if (req.method !== 'POST') {
          response = { code: 405, msg: 'Method not allowed' };
          break;
        }
        response = await handleSetTestTask(body);
        break;

      case '/controlTestTask':
        if (req.method !== 'POST') {
          response = { code: 405, msg: 'Method not allowed' };
          break;
        }
        response = await handleControlTestTask(body);
        break;

      case '/heartbeat':
        response = handleHeartbeat();
        break;

      case '/getSubSysState':
        response = handleGetSubSysState();
        break;

      default:
        response = { code: 404, msg: 'Not found' };
    }

    return jsonResponse(response);
  }

  // --- Lifecycle ---

  async function start(config: NorthboundConfig): Promise<void> {
    if (serverId) return;

    activeConfig = config;
    serverId = await options.httpFacade.startServer({
      host: config.serverHost,
      port: config.serverPort,
    });

    state.setServerRunning(true);

    requestUnsub = options.httpFacade.onRequest(serverId, async (req) => {
      try {
        return await handleRequest(req);
      } catch {
        return jsonResponse({ code: 500, msg: 'Internal error' }, 500);
      }
    });
  }

  async function stop(): Promise<void> {
    if (requestUnsub) {
      requestUnsub();
      requestUnsub = null;
    }
    if (serverId) {
      await options.httpFacade.stopServer(serverId);
      serverId = null;
    }
    state.setServerRunning(false);
    state.clear();
    activeConfig = null;
  }

  function isActive(): boolean {
    return serverId !== null;
  }

  return { start, stop, isActive, getSessionStatus: () => state.getSnapshot(), handleStepResult };
}

function jsonResponse(body: CustomerResponse, statusCode = 200): HttpResponse {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
