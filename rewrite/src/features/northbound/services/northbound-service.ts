import type { TaskService, TaskStepResult, TaskInstanceState } from '@/features/task';
import type { ResultService, CaseVerdict } from '@/features/result';
import type { HttpFacade, HttpRequest, HttpResponse } from '@/platform';
import type { NorthboundSessionSnapshot } from '../state/northbound-state';
import { createNorthboundState } from '../state/northbound-state';
import type { NorthboundStateContainer } from '../state/northbound-state';
import { translateTestCaseToMockTaskDefinition } from '../core/inbound-translator';
import {
  translateTaskResult,
  translateStepResult,
  translateDeviceInfoReport,
  translateDeviceAlarmReport,
  translateSubSysAlarmReport,
  translateTestDataFileComplete,
  translateFileTranslationComplete,
  translateSigReport,
} from '../core/outbound-translator';
import type {
  SetTestTaskRequest,
  ControlTestTaskRequest,
  ControlTestTaskResponse,
  CustomerResponse,
  ExecutionPlanLayer,
  TestCaseInfo,
  InboundEnvelope,
  EnvelopeConfig,
  DeviceInfoItem,
  DeviceAlarmItem,
  SubSysAlarmItem,
  TestDataFileCompleteOutbound,
  FileTranslationCompleteOutbound,
  OutboundEnvelope,
  SigReportDevice,
  GetTestCaseAllRequest,
  SetParsRequest,
} from '../core/types';
import { generateTestReport } from '../core/test-report-generator';
import { encodeTaskTemplateToTestCase, decodeTestCaseToTaskDefinition, createPlaceholderFailDefinition } from '../core/testcase-sync-translator';
import type {
  NorthboundTestCaseConfig,
  ReportedSnapshot,
  OverrideWarning,
} from '../core/types';
import type { ReportedSnapshotStorage } from './reported-snapshot-storage';
import { createAuthService, type AuthService, type AuthConfig } from './auth';
import { createHeartbeatTimer, type HeartbeatTimer } from './heartbeat-timer';

export interface NorthboundConfig {
  readonly serverHost: string;
  readonly serverPort: number;
  readonly customerBaseUrl: string;
  readonly subSysType: string;
  readonly subSysId: string;
  readonly auth: AuthConfig;
  readonly ftp?: {
    readonly host: string;
    readonly port: number;
    readonly username: string;
    readonly password: string;
    readonly basePath: string;
  };
}

export interface FtpUploadConfig {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly remotePath: string;
  readonly content: string;
}

export interface FtpFacade {
  uploadFile(config: FtpUploadConfig): Promise<void>;
}

export interface NorthboundServiceOptions {
  readonly taskService: TaskService;
  readonly resultService: ResultService;
  readonly httpFacade: HttpFacade;
  readonly ftpFacade?: FtpFacade;
  readonly connectionSnapshot: () => { readonly status: string };
  readonly testCaseConfig?: NorthboundTestCaseConfig;
  readonly reportedSnapshotStorage?: ReportedSnapshotStorage;
}

export interface NorthboundService {
  start(config: NorthboundConfig): Promise<void>;
  stop(): Promise<void>;
  isActive(): boolean;
  getSessionStatus(): NorthboundSessionSnapshot;
  handleStepResult(instanceId: string, result: TaskStepResult): void;
  handleTaskSettled(instanceId: string): void;
  reportDeviceInfo(items: readonly DeviceInfoItem[]): Promise<void>;
  reportDeviceAlarm(items: readonly DeviceAlarmItem[]): Promise<void>;
  reportSubSysAlarm(items: readonly SubSysAlarmItem[]): Promise<void>;
  reportTestDataFileComplete(file: Omit<TestDataFileCompleteOutbound, keyof OutboundEnvelope>): Promise<void>;
  reportFileTranslationComplete(file: Omit<FileTranslationCompleteOutbound, keyof OutboundEnvelope>): Promise<void>;
  reportSigReport(data: readonly SigReportDevice[], taskId: string, testCaseId: string): Promise<void>;
  setDeviceList(items: readonly DeviceInfoItem[]): void;
  setTestCatalogData(data: Record<string, unknown>): void;
}

export function createNorthboundService(options: NorthboundServiceOptions): NorthboundService {
  const state: NorthboundStateContainer = createNorthboundState();
  let serverId: string | null = null;
  let requestUnsub: (() => void) | null = null;
  let taskEventUnsub: (() => void) | null = null;
  let activeConfig: NorthboundConfig | null = null;
  let authService: AuthService | null = null;
  let heartbeatTimer: HeartbeatTimer = createHeartbeatTimer();

  // --- Envelope config helper ---

  function envelopeConfig(): EnvelopeConfig {
    return {
      subSysType: activeConfig!.subSysType,
      subSysId: activeConfig!.subSysId,
    };
  }

  // --- Outbound helpers ---

  async function postToCustomer(path: string, body: unknown): Promise<void> {
    if (!activeConfig || !authService) return;
    const base = activeConfig.customerBaseUrl.replace(/\/+$/, '');
    const url = `${base}${path}`;
    console.log(`[northbound → 甲方] POST ${url}`, body);
    try {
      const token = await authService.ensureToken();
      await options.httpFacade.sendRequest({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Clientid: activeConfig.auth.clientId,
        },
        body: JSON.stringify(body),
      });
      console.log(`[northbound → 甲方] POST ${url} ✓`);
    } catch (e) {
      console.error(`[northbound → 甲方] POST ${url} ✗`, e);
    }
  }

  async function reportTaskResult(instanceId: string): Promise<void> {
    const instance = options.taskService.getInstance(instanceId);
    if (!instance) return;
    const testCaseId = state.getTestCaseId(instanceId);
    if (!testCaseId) return;

    const verdict = options.resultService.collectResult(instance);
    // P2.1: echo customer-issued taskId (T_xxx), not local instanceId.
    const customerTaskId = state.getCustomerTaskId(instanceId) ?? instanceId;
    const report = translateTaskResult(instance, verdict, testCaseId, customerTaskId, envelopeConfig());
    await postToCustomer('/admin/report/testCaseResultReport', report);

    // Generate TestReport, upload FTP, notify customer (R11: failure doesn't affect verdict)
    await uploadTestReportAndNotify(instance, verdict, testCaseId, customerTaskId);

    state.removeMapping(testCaseId);
    state.removeTaskIdMapping(instanceId);
  }

  async function uploadTestReportAndNotify(
    instance: TaskInstanceState,
    verdict: CaseVerdict,
    testCaseId: string,
    taskId: string,
  ): Promise<void> {
    const config = activeConfig;
    const ftp = options.ftpFacade;
    if (!config?.ftp || !ftp) return;

    const reportJson = generateTestReport({
      instance,
      verdict,
      testCaseId,
      taskId,
      config: envelopeConfig(),
    });

    const remotePath = `${config.ftp.basePath.replace(/\/$/, '')}/TestReport_${taskId}.json`;

    try {
      await ftp.uploadFile({
        host: config.ftp.host,
        port: config.ftp.port,
        username: config.ftp.username,
        password: config.ftp.password,
        remotePath,
        content: reportJson,
      });

      await reportTestDataFileComplete({
        taskId,
        result: 'success',
        msg: '',
        testCaseId: [testCaseId],
        ftpServerIP: config.ftp.host,
        fileType: 'TestReport',
        filePath: remotePath,
      });
    } catch {
      // R11: delivery failure does not rewrite internal result
    }
  }

  // --- Step event handler ---

  function handleStepResult(instanceId: string, result: TaskStepResult): void {
    const instance = options.taskService.getInstance(instanceId);
    if (!instance) return;
    const testCaseId = state.getTestCaseId(instanceId);
    if (!testCaseId) return;

    const report = translateStepResult(instance, result, testCaseId, instanceId, envelopeConfig());
    postToCustomer('/admin/report/msgReport', report);
  }

  // --- Task settled event handler (事件驱动替代 await onSettled) ---

  function handleTaskSettled(instanceId: string): void {
    // fire-and-forget；reportTaskResult 内部已处理 HTTP 失败重试
    // 但同步阶段（translator/getInstance/collectResult）抛错会冒成 unhandled rejection，这里兜底
    void reportTaskResult(instanceId).catch((err) => {
      console.error('[northbound] reportTaskResult failed', err);
    });
  }

  // --- Inbound helpers ---

  function extractEnvelope(body: Record<string, unknown>): InboundEnvelope {
    return {
      method: (body.method as string) ?? '',
      requestId: (body.requestId as number) ?? 0,
      subSysType: (body.subSysType as string) ?? '',
      subSysId: (body.subSysId as string) ?? '',
      sessionId: body.sessionId as number | undefined,
    };
  }

  function buildResponse(
    envelope: InboundEnvelope,
    statusCode: 1 | 2,
    msg: string,
    extra?: Record<string, unknown>,
  ): CustomerResponse {
    return {
      method: `${envelope.method}Response`,
      requestId: envelope.requestId,
      subSysType: envelope.subSysType,
      subSysId: envelope.subSysId,
      sessionId: envelope.sessionId ?? 0,
      statusCode,
      msg,
      ...extra,
    };
  }

  // --- Known inbound paths for suffix matching ---

  const knownPaths = [
    '/setTestTask', '/controlTestTask', '/heartbeat', '/getSubSysState',
    '/getDeviceList', '/getDeviceInfo', '/setDeviceInfo', '/getPars',
    '/setPars', '/dataTransmit', '/neControl', '/getTestCaseAll',
  ];

  function resolveMethod(req: HttpRequest, body: Record<string, unknown>): string | null {
    for (const p of knownPaths) {
      if (req.url.endsWith(p)) return p.slice(1);
    }
    if (body.method && typeof body.method === 'string') return body.method;
    return null;
  }

  // --- Inbound handlers ---

  async function handleSetTestTask(body: unknown, envelope: InboundEnvelope): Promise<CustomerResponse> {
    let parsed: SetTestTaskRequest;
    try {
      parsed = body as SetTestTaskRequest;
    } catch {
      return buildResponse(envelope, 2, 'Invalid request body');
    }

    const layers = parsed.executionPlan?.layers;
    if (!layers || !Array.isArray(layers)) {
      return buildResponse(envelope, 2, 'Missing executionPlan.layers');
    }

    const customerTaskId = parsed.taskId ?? '';
    const sortedLayers = [...layers].sort((a, b) => a.layer - b.layer);
    processLayers(sortedLayers, parsed, customerTaskId).catch(() => {});

    return buildResponse(envelope, 1, 'ok');
  }

  async function processLayers(
    layers: readonly ExecutionPlanLayer[],
    request: SetTestTaskRequest,
    customerTaskId: string,
  ): Promise<void> {
    // 04-任务管理.md: testCaseInfo lives at the request top level (not inside layers);
    // layer.nodes is a plain testCaseId string list. Build an id index once per setTestTask.
    const tcById = new Map<string, TestCaseInfo>();
    for (const tc of request.testCaseInfo ?? []) {
      tcById.set(tc.testCaseId, tc);
    }

    // Resolve a layer node (a testCaseId string) into its TestCaseInfo, if present.
    const resolveNode = (node: string): TestCaseInfo | undefined => tcById.get(node);

    for (const layer of layers) {
      if (layer.parallel) {
        // 并发启动；reportTaskResult 由 onTaskSettled 事件触发
        const tasks: Promise<{ readonly instanceId: string }>[] = [];
        for (const node of layer.nodes) {
          const tc = resolveNode(node);
          if (!tc || state.hasTestCase(tc.testCaseId)) continue;
          tasks.push(createAndStartTask(tc, customerTaskId));
        }
        await Promise.all(tasks);
      } else {
        // 顺序：等前一个终态才启动下一个；reportTaskResult 由 onTaskSettled 事件触发
        for (const node of layer.nodes) {
          const tc = resolveNode(node);
          if (!tc || state.hasTestCase(tc.testCaseId)) continue;

          const { instanceId } = await createAndStartTask(tc, customerTaskId);
          await options.taskService.onSettled(instanceId);
        }
      }
    }
  }

  async function createAndStartTask(
    tc: TestCaseInfo,
    customerTaskId: string,
  ): Promise<{ readonly instanceId: string }> {
    const def = translateTestCaseToMockTaskDefinition(tc);
    const instance = options.taskService.createTask(def);
    state.mapTestCase(tc.testCaseId, instance.instanceId);
    if (customerTaskId) {
      // P2.1: remember the customer-issued taskId so testCaseResultReport can echo it.
      state.mapTaskId(instance.instanceId, customerTaskId);
    }
    options.taskService.startTask(instance.instanceId);
    return { instanceId: instance.instanceId };
  }

  async function handleControlTestTask(body: unknown, envelope: InboundEnvelope): Promise<ControlTestTaskResponse> {
    const parsed = body as ControlTestTaskRequest;
    const taskId = parsed.taskId;
    if (!taskId) {
      // buildResponse emits method=`${envelope.method}Response` per V1.0.4 envelope convention.
      return { ...buildResponse(envelope, 2, 'Missing taskId'), taskId: '', handleCode: 2 } as ControlTestTaskResponse;
    }

    // P2.1: resolve instanceId via the customer-issued taskId (T_xxx), not testCaseId.
    const instanceId = state.getInstanceIdByCustomerTaskId(taskId);
    if (!instanceId) {
      return { ...buildResponse(envelope, 1, 'ok'), taskId, handleCode: 1 } as ControlTestTaskResponse;
    }

    switch (parsed.action) {
      case 'stop':
      case 'abort':
        options.taskService.stopTask(instanceId);
        break;
      case 'pause':
        options.taskService.pauseTask(instanceId);
        break;
      case 'continue':
        options.taskService.resumeTask(instanceId);
        break;
    }

    return { ...buildResponse(envelope, 1, 'ok'), taskId, handleCode: 0 } as ControlTestTaskResponse;
  }

  function handleHeartbeatInbound(envelope: InboundEnvelope): CustomerResponse {
    return buildResponse(envelope, 1, 'ok');
  }

  function handleGetSubSysState(envelope: InboundEnvelope): Record<string, unknown> {
    return {
      ...buildResponse(envelope, 1, 'ok'),
      swVer: 'V1.0.0',
      status: 'online',
      data: [],
    };
  }

  // --- Configurable data (replaces hardcoded MOCK) ---

  const DEFAULT_DEVICE: DeviceInfoItem = {
    name: '激光通信终端',
    deviceId: 'ADS_LCT_01',
    type: 'LCT',
    ip: '192.168.1.100',
    swVer: 'V1.0.0',
    status: 'online',
    pars: [],
  };

  const DEFAULT_TEST_CASES = {
    datas: [{
      name: '激光链路测试', id: 'ADS_MENU_01', isParent: true,
      type: '', runSubSys: '', depSubSys: '', depSubNe: '',
      durate: 0, execSteps: '', remark: '',
      inputPars: [], preHandle: [], afterHandle: [],
      children: [{
        name: '激光通信测试', id: 'ADS_TC_001', isParent: false,
        type: 'land', runSubSys: 'ADS', depSubSys: '', depSubNe: '',
        durate: 60, execSteps: '1.发送帧;2.接收帧;3.校验结果',
        remark: 'Mock 测试用例',
        inputPars: [], preHandle: [], afterHandle: [],
        children: [],
      }],
    }],
  };

  let configuredDevices: readonly DeviceInfoItem[] = [DEFAULT_DEVICE];
  let configuredTestCases: Record<string, unknown> = DEFAULT_TEST_CASES;

  function setDeviceList(items: readonly DeviceInfoItem[]): void {
    configuredDevices = items;
  }

  function setTestCatalogData(data: Record<string, unknown>): void {
    configuredTestCases = data;
  }

  // --- Stub handlers ---

  function handleGetDeviceList(envelope: InboundEnvelope): Record<string, unknown> {
    return { ...buildResponse(envelope, 1, 'ok'), fileReport: false, datas: [...configuredDevices] };
  }

  function handleGetDeviceInfo(body: Record<string, unknown>, envelope: InboundEnvelope): Record<string, unknown> {
    const deviceIds = body.deviceIds as readonly string[] | undefined;
    const devices = deviceIds?.length
      ? configuredDevices.filter(d => deviceIds.includes(d.deviceId))
      : [...configuredDevices];
    return { ...buildResponse(envelope, 1, 'ok'), datas: devices };
  }

  function handleSetDeviceInfo(envelope: InboundEnvelope): CustomerResponse {
    return buildResponse(envelope, 1, 'ok');
  }

  function handleGetPars(body: Record<string, unknown>, envelope: InboundEnvelope): Record<string, unknown> {
    const parIds = (body.parIds as readonly string[] | undefined) ?? [];
    return {
      ...buildResponse(envelope, 1, 'ok'),
      imsi: '',
      pars: parIds.map(id => ({ parId: id, value: '' })),
    };
  }

  function handleSetPars(body: Record<string, unknown>, envelope: InboundEnvelope): CustomerResponse {
    // V1.0.4 setPars: if pars[] contains heartbeatTimer, restart the heartbeat with the new interval.
    // Unit: seconds (per V1.0.4 spec).
    const parsed = body as SetParsRequest;
    const heartbeatPar = parsed.pars?.find(p => p.parId === 'heartbeatTimer');
    if (heartbeatPar && activeConfig) {
      const newInterval = Number(heartbeatPar.value);
      if (Number.isFinite(newInterval) && newInterval > 0) {
        // HeartbeatTimer has no restart(); stop + start with the new interval.
        heartbeatTimer.stop();
        heartbeatTimer.start(
          activeConfig.subSysType,
          activeConfig.subSysId,
          newInterval,
          (b) => postToCustomer('/admin/subSystem/heartbeat', b),
        );
      }
    }
    return buildResponse(envelope, 1, 'ok');
  }

  function handleDataTransmit(envelope: InboundEnvelope): CustomerResponse {
    return buildResponse(envelope, 1, 'ok');
  }

  function handleNeControl(envelope: InboundEnvelope): CustomerResponse {
    return buildResponse(envelope, 1, 'ok');
  }

  async function handleGetTestCaseAll(body: Record<string, unknown>, envelope: InboundEnvelope): Promise<CustomerResponse> {
    const parsed = body as GetTestCaseAllRequest;
    const ftpInfo = parsed.ftpInfo;

    // 从 taskService 取 enabled 模板,encode 成 CustomerTestCase
    const allTemplates = options.taskService.listTemplates();
    const enabledTemplates = allTemplates.filter(t => t.customerSync?.enabled === true);
    const testCases = enabledTemplates.map(t => {
      if (!options.testCaseConfig) return null;
      const { testCase, snapshot } = encodeTaskTemplateToTestCase(t, options.testCaseConfig);
      options.reportedSnapshotStorage?.save(snapshot);
      return testCase;
    }).filter((tc): tc is NonNullable<typeof tc> => tc !== null);

    if (ftpInfo?.ip && options.ftpFacade) {
      try {
        await options.ftpFacade.uploadFile({
          host: ftpInfo.ip,
          port: ftpInfo.port ?? 21,
          username: ftpInfo.username ?? 'anonymous',
          password: ftpInfo.password ?? '',
          remotePath: `${(ftpInfo.dir ?? '/').replace(/\/$/, '')}/testcase_all.json`,
          content: JSON.stringify(testCases),
        });
      } catch {
        return buildResponse(envelope, 2, 'FTP upload failed');
      }
    }

    return buildResponse(envelope, 1, 'ok', testCases.length > 0 ? { datas: testCases } : undefined);
  }

  // --- Request router ---

  async function handleRequest(req: HttpRequest): Promise<HttpResponse> {
    let body: Record<string, unknown>;
    try {
      body = req.body ? JSON.parse(req.body) : {};
    } catch {
      const errEnvelope: InboundEnvelope = { method: 'unknown', requestId: 0, subSysType: '', subSysId: '' };
      return jsonResponse(buildResponse(errEnvelope, 2, 'Invalid JSON'), 400);
    }

    const envelope = extractEnvelope(body);
    const method = resolveMethod(req, body);
    console.log(`[northbound ← 甲方] ${req.method} ${req.url} → ${method}`, body);

    let response: Record<string, unknown>;

    switch (method) {
      case 'setTestTask':
        if (req.method !== 'POST') {
          response = buildResponse(envelope, 2, 'Method not allowed');
          break;
        }
        response = await handleSetTestTask(body, envelope);
        break;

      case 'controlTestTask':
        if (req.method !== 'POST') {
          response = buildResponse(envelope, 2, 'Method not allowed');
          break;
        }
        response = await handleControlTestTask(body, envelope);
        break;

      case 'heartbeat':
        response = handleHeartbeatInbound(envelope);
        break;

      case 'getSubSysState':
        response = handleGetSubSysState(envelope);
        break;

      case 'getDeviceList':
        response = handleGetDeviceList(envelope);
        break;

      case 'getDeviceInfo':
        response = handleGetDeviceInfo(body, envelope);
        break;

      case 'setDeviceInfo':
        if (req.method !== 'POST') {
          response = buildResponse(envelope, 2, 'Method not allowed');
          break;
        }
        response = handleSetDeviceInfo(envelope);
        break;

      case 'getPars':
        response = handleGetPars(body, envelope);
        break;

      case 'setPars':
        if (req.method !== 'POST') {
          response = buildResponse(envelope, 2, 'Method not allowed');
          break;
        }
        response = handleSetPars(body, envelope);
        break;

      case 'dataTransmit':
        if (req.method !== 'POST') {
          response = buildResponse(envelope, 2, 'Method not allowed');
          break;
        }
        response = handleDataTransmit(envelope);
        break;

      case 'neControl':
        if (req.method !== 'POST') {
          response = buildResponse(envelope, 2, 'Method not allowed');
          break;
        }
        response = handleNeControl(envelope);
        break;

      case 'getTestCaseAll':
        if (req.method !== 'POST') {
          response = buildResponse(envelope, 2, 'Method not allowed');
          break;
        }
        response = await handleGetTestCaseAll(body, envelope);
        break;

      default:
        response = buildResponse(envelope, 2, 'Not found');
    }

    return jsonResponse(response);
  }

  // --- Lifecycle ---

  async function start(config: NorthboundConfig): Promise<void> {
    if (serverId) return;

    activeConfig = config;
    authService = createAuthService(options.httpFacade, config.auth);

    await authService.login();

    serverId = await options.httpFacade.startServer({
      host: config.serverHost,
      port: config.serverPort,
    });

    state.setServerRunning(true);

    heartbeatTimer.start(
      config.subSysType,
      config.subSysId,
      15,
      (body) => postToCustomer('/admin/subSystem/heartbeat', body),
    );

    requestUnsub = options.httpFacade.onRequest(serverId, async (req) => {
      try {
        return await handleRequest(req);
      } catch {
        const errEnvelope: InboundEnvelope = { method: 'unknown', requestId: 0, subSysType: '', subSysId: '' };
        return jsonResponse(buildResponse(errEnvelope, 2, 'Internal error'), 500);
      }
    });

    // 订阅 task 事件：onStepResult → msgReport, onTaskSettled → testCaseResultReport
    if (taskEventUnsub) taskEventUnsub();
    taskEventUnsub = options.taskService.subscribe({
      onStepResult: (instanceId, result) => handleStepResult(instanceId, result),
      onTaskSettled: (instanceId) => handleTaskSettled(instanceId),
    });
  }

  async function stop(): Promise<void> {
    heartbeatTimer.stop();
    if (requestUnsub) {
      requestUnsub();
      requestUnsub = null;
    }
    if (taskEventUnsub) {
      taskEventUnsub();
      taskEventUnsub = null;
    }
    if (serverId) {
      await options.httpFacade.stopServer(serverId);
      serverId = null;
    }
    authService?.logout();
    state.setServerRunning(false);
    state.clear();
    activeConfig = null;
    authService = null;
    heartbeatTimer = createHeartbeatTimer();
  }

  function isActive(): boolean {
    return serverId !== null;
  }

  // --- Public report methods ---

  async function reportDeviceInfo(items: readonly DeviceInfoItem[]): Promise<void> {
    const report = translateDeviceInfoReport(items, envelopeConfig());
    await postToCustomer('/admin/deviceInfo/deviceInfoReport', report);
  }

  async function reportDeviceAlarm(items: readonly DeviceAlarmItem[]): Promise<void> {
    const report = translateDeviceAlarmReport(items, envelopeConfig());
    await postToCustomer('/admin/deviceInfo/deviceAlarmReport', report);
  }

  async function reportSubSysAlarm(items: readonly SubSysAlarmItem[]): Promise<void> {
    const report = translateSubSysAlarmReport(items, envelopeConfig());
    await postToCustomer('/admin/subSystem/subSysAlarmReport', report);
  }

  async function reportTestDataFileComplete(file: Omit<TestDataFileCompleteOutbound, keyof OutboundEnvelope>): Promise<void> {
    const report = translateTestDataFileComplete(file, envelopeConfig());
    await postToCustomer('/admin/report/testDataFileTranslationComplete', report);
  }

  async function reportFileTranslationComplete(file: Omit<FileTranslationCompleteOutbound, keyof OutboundEnvelope>): Promise<void> {
    const report = translateFileTranslationComplete(file, envelopeConfig());
    await postToCustomer('/admin/report/fileTranslationComplete', report);
  }

  async function reportSigReport(data: readonly SigReportDevice[], taskId: string, testCaseId: string): Promise<void> {
    const report = translateSigReport(data, taskId, testCaseId, envelopeConfig());
    await postToCustomer('/admin/report/sigReport', report);
  }

  return {
    start, stop, isActive,
    getSessionStatus: () => state.getSnapshot(),
    handleStepResult,
    handleTaskSettled,
    reportDeviceInfo,
    reportDeviceAlarm,
    reportSubSysAlarm,
    reportTestDataFileComplete,
    reportFileTranslationComplete,
    reportSigReport,
    setDeviceList,
    setTestCatalogData,
  };
}

function jsonResponse(body: Record<string, unknown>, statusCode = 200): HttpResponse {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
