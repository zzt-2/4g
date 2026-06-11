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
} from '../core/types';
import { generateTestReport } from '../core/test-report-generator';
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
}

export interface NorthboundService {
  start(config: NorthboundConfig): Promise<void>;
  stop(): Promise<void>;
  isActive(): boolean;
  getSessionStatus(): NorthboundSessionSnapshot;
  handleStepResult(instanceId: string, result: TaskStepResult): void;
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
    const url = `${activeConfig.customerBaseUrl}${path}`;
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
    const taskId = instanceId;
    const report = translateTaskResult(instance, verdict, testCaseId, taskId, envelopeConfig());
    await postToCustomer('/report/testCaseResultReport', report);

    // Generate TestReport, upload FTP, notify customer (R11: failure doesn't affect verdict)
    await uploadTestReportAndNotify(instance, verdict, testCaseId, taskId);

    state.removeMapping(testCaseId);
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
    postToCustomer('/report/msgReport', report);
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

  function buildResponse(envelope: InboundEnvelope, statusCode: 1 | 2, msg: string): CustomerResponse {
    return {
      method: `${envelope.method}Response`,
      requestId: envelope.requestId,
      subSysType: envelope.subSysType,
      subSysId: envelope.subSysId,
      sessionId: envelope.sessionId ?? 0,
      statusCode,
      msg,
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

    const sortedLayers = [...layers].sort((a, b) => a.layerNo - b.layerNo);
    processLayers(sortedLayers).catch(() => {});

    return buildResponse(envelope, 1, 'ok');
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

  async function createAndStartTask(tc: TestCaseInfo): Promise<{ readonly instanceId: string }> {
    const def = translateTestCaseToMockTaskDefinition(tc);
    const instance = options.taskService.createTask(def);
    state.mapTestCase(tc.testCaseId, instance.instanceId);
    options.taskService.startTask(instance.instanceId);
    return { instanceId: instance.instanceId };
  }

  async function handleControlTestTask(body: unknown, envelope: InboundEnvelope): Promise<CustomerResponse> {
    let parsed: ControlTestTaskRequest;
    try {
      parsed = body as ControlTestTaskRequest;
    } catch {
      return buildResponse(envelope, 2, 'Invalid request body');
    }

    const { testCaseIdList, controlType } = parsed;
    if (!Array.isArray(testCaseIdList) || testCaseIdList.length === 0) {
      return buildResponse(envelope, 2, 'Missing testCaseIdList');
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

    return buildResponse(envelope, 1, 'ok');
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

  function handleSetPars(envelope: InboundEnvelope): CustomerResponse {
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

    if (ftpInfo?.ip && options.ftpFacade) {
      try {
        await options.ftpFacade.uploadFile({
          host: ftpInfo.ip,
          port: ftpInfo.port ?? 21,
          username: ftpInfo.username ?? 'anonymous',
          password: ftpInfo.password ?? '',
          remotePath: `${(ftpInfo.dir ?? '/').replace(/\/$/, '')}/testcase_all.json`,
          content: JSON.stringify(configuredTestCases),
        });
      } catch {
        return buildResponse(envelope, 2, 'FTP upload failed');
      }
    }

    return buildResponse(envelope, 1, 'ok');
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
        response = handleSetPars(envelope);
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
      config.subSysId,
      15,
      (body) => postToCustomer('/subSystem/heartbeat', body),
    );

    requestUnsub = options.httpFacade.onRequest(serverId, async (req) => {
      try {
        return await handleRequest(req);
      } catch {
        const errEnvelope: InboundEnvelope = { method: 'unknown', requestId: 0, subSysType: '', subSysId: '' };
        return jsonResponse(buildResponse(errEnvelope, 2, 'Internal error'), 500);
      }
    });
  }

  async function stop(): Promise<void> {
    heartbeatTimer.stop();
    if (requestUnsub) {
      requestUnsub();
      requestUnsub = null;
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
    await postToCustomer('/deviceInfo/deviceInfoReport', report);
  }

  async function reportDeviceAlarm(items: readonly DeviceAlarmItem[]): Promise<void> {
    const report = translateDeviceAlarmReport(items, envelopeConfig());
    await postToCustomer('/deviceInfo/deviceAlarmReport', report);
  }

  async function reportSubSysAlarm(items: readonly SubSysAlarmItem[]): Promise<void> {
    const report = translateSubSysAlarmReport(items, envelopeConfig());
    await postToCustomer('/subSystem/subSysAlarmReport', report);
  }

  async function reportTestDataFileComplete(file: Omit<TestDataFileCompleteOutbound, keyof OutboundEnvelope>): Promise<void> {
    const report = translateTestDataFileComplete(file, envelopeConfig());
    await postToCustomer('/report/testDataFileTranslationComplete', report);
  }

  async function reportFileTranslationComplete(file: Omit<FileTranslationCompleteOutbound, keyof OutboundEnvelope>): Promise<void> {
    const report = translateFileTranslationComplete(file, envelopeConfig());
    await postToCustomer('/report/fileTranslationComplete', report);
  }

  async function reportSigReport(data: readonly SigReportDevice[], taskId: string, testCaseId: string): Promise<void> {
    const report = translateSigReport(data, taskId, testCaseId, envelopeConfig());
    await postToCustomer('/report/sigReport', report);
  }

  return {
    start, stop, isActive,
    getSessionStatus: () => state.getSnapshot(),
    handleStepResult,
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
