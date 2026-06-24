import type { TaskService, TaskStepResult, TaskInstanceState } from '@/features/task';
import type { ResultService, CaseVerdict } from '@/features/result';
import type { HttpFacade, HttpRequest, HttpResponse } from '@/platform';
import type { NorthboundSessionSnapshot } from '../state/northbound-state';
import { createNorthboundState } from '../state/northbound-state';
import type { NorthboundStateContainer } from '../state/northbound-state';
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
  ExecutionPlanNode,
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
  SetParsRequest,
} from '../core/types';
import { generateTestReport } from '../core/test-report-generator';
import { encodeSourceToTestCase, decodeTestCaseToTaskDefinition, createPlaceholderFailDefinition } from '../core/testcase-sync-translator';
import type { EncodeSource } from '../core/testcase-sync-translator';
import type { CatalogMapping } from '@/features/command-ingress/core';
import { selectEnabledMappings } from '@/features/command-ingress/core';
import type { NorthboundTestCaseConfig } from '../core/types';
import type { CustomerTestCaseMenu } from '../core/types';
import type { ReportedSnapshotStorage } from './reported-snapshot-storage';
import type { ReportDataCollector } from './report-data-collector';
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

// S014: 激光子系统(LAS)的固定身份信息(非 subSysId 字段都固定)。
// subSysId 是变量(用户在对接对话框填,如 'JG'),其余是激光子系统的固有属性。
// 见 D003(我们是 SOCC-CQ-LAS,5 个二级子系统之一)+ D001(caseTemplate↔TaskTemplate)。
const LASER_TEST_CASE_DEFAULTS = {
  subSysName: '激光载荷',
  menuId: 'laser-menu',
  menuName: '激光测试',
  caseType: 'orbit',
} as const satisfies Omit<NorthboundTestCaseConfig, 'subSysId' | 'runSubSys'>;

/**
 * S014: 从 activeConfig 派生 testCaseConfig。
 * subSysId 用真源(start(config) 时用户填的值,存在 activeConfig.subSysId);
 * runSubSys(运行子系统类型)无独立来源,按 subSysId 复用(我方无"系统分类表");
 * 其余字段用激光子系统固定默认值。
 * 返回 null 仅当 activeConfig 还没建立(start() 未调用)——此时 getTestCaseAll 本就不该被处理。
 */
function deriveTestCaseConfig(cfg: NorthboundConfig | null): NorthboundTestCaseConfig | null {
  if (!cfg) return null;
  return { subSysId: cfg.subSysId, runSubSys: cfg.subSysId, ...LASER_TEST_CASE_DEFAULTS };
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
  readonly reportedSnapshotStorage?: ReportedSnapshotStorage;
  readonly reportDataCollector?: ReportDataCollector;
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
  /** D004: 喂入 command-ingress 维护的「模板→用例」映射表,getTestCaseAll 从这里取数据源 */
  setCatalogMappings(mappings: readonly CatalogMapping[]): void;
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

    // 取真实采集数据(若有 collector);无 collector 则 fallback mockConfig
    const collected = options.reportDataCollector?.collect(instance.instanceId);

    const reportJson = generateTestReport({
      instance,
      verdict,
      testCaseId,
      taskId,
      config: envelopeConfig(),
      collectedCheckPoints: collected?.checkPoints,
      collectedProcessSteps: collected?.processSteps,
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

    // 累积执行数据供 TestReport.json 使用
    options.reportDataCollector?.onStepResult(instanceId, result);
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

    // Resolve a layer node into its TestCaseInfo, if present.
    // 04-任务管理.md L353 规定 node 是纯 testCaseId 字符串;但甲方实现实际下发对象 {id,name,type}
    // (id=testCaseId)。两种都兼容:字符串直接查,对象取 .id 查。
    const resolveNode = (node: string | ExecutionPlanNode): TestCaseInfo | undefined => {
      const id = typeof node === 'string' ? node : node.id;
      return tcById.get(id);
    };

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
    // 按 testCaseId(=outCaseId)反查上报快照;有则 decode(支持参数覆盖),无则占位 fail
    const snapshot = options.reportedSnapshotStorage?.load(tc.testCaseId);
    let def;
    if (snapshot) {
      const { definition, warnings } = decodeTestCaseToTaskDefinition(tc, snapshot);
      def = definition;
      if (warnings.length > 0) {
        console.warn('[northbound] override warnings for', tc.testCaseId, warnings);
      }
    } else {
      def = createPlaceholderFailDefinition(tc.testCaseId);
      console.error('[northbound] snapshot missing for', tc.testCaseId, '- using placeholder (will not execute real task)');
    }
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

  let configuredDevices: readonly DeviceInfoItem[] = [DEFAULT_DEVICE];
  // D004: command-ingress 维护的映射表,getTestCaseAll 的数据源(替代旧 customerSync 模板字段)
  let configuredCatalogMappings: readonly CatalogMapping[] = [];

  function setDeviceList(items: readonly DeviceInfoItem[]): void {
    configuredDevices = items;
  }

  function setCatalogMappings(mappings: readonly CatalogMapping[]): void {
    configuredCatalogMappings = mappings;
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

  async function handleGetTestCaseAll(_body: Record<string, unknown>, envelope: InboundEnvelope): Promise<CustomerResponse> {
    // D006: getTestCaseAll 用例数据走 FTP 文件传输(03-用例管理.md L5 "采用 json 文件传输方式")。
    // datas 是 FTP 文件 testcase_all.json 的内容({datas:[...]} 包裹),不是 HTTP 响应体字段。
    // 响应体只有信封字段(无 datas)。FTP 地址用我们 config.ftp 自己配的(不用请求里的 ftpInfo)。
    // 流程:序列化 {datas} → 上传 config.ftp/basePath/yyyy-mm-dd/testcase_all.json → 回 statusCode:1
    //       → 调 fileTranslationComplete 通知甲方文件路径。

    const cfg = activeConfig;
    const ftp = options.ftpFacade;
    // D006: getTestCaseAll 本就该走 FTP,没配 config.ftp 或没 ftpFacade 是配置缺失,报错而非静默成功
    if (!cfg?.ftp || !ftp) {
      return buildResponse(envelope, 2, 'FTP not configured (请在对接配置填写 FTP 地址)');
    }

    // S014: testCaseConfig 从 activeConfig.subSysId 派生(用户在对接对话框填的真源),
    // 其余字段是激光子系统的固定身份信息。
    const testCaseConfig = deriveTestCaseConfig(cfg);
    if (!testCaseConfig) return buildResponse(envelope, 2, 'testCaseConfig missing');

    // D004: 数据源是 command-ingress 维护的映射表(过滤 enabled),而非模板的 customerSync 字段。
    const enabledMappings = selectEnabledMappings(configuredCatalogMappings);
    const testCases = enabledMappings.map(mapping => {
      const tpl = options.taskService.getTemplate(mapping.templateId);
      if (!tpl) return null; // 映射指向的模板已被删,跳过
      const source: EncodeSource = {
        definition: tpl.definition,
        templateId: tpl.templateId,
        templateName: tpl.name,
        templateTags: tpl.tags,
      };
      const { testCase, snapshot } = encodeSourceToTestCase(source, mapping, testCaseConfig);
      options.reportedSnapshotStorage?.save(snapshot);
      return testCase;
    }).filter((tc): tc is NonNullable<typeof tc> => tc !== null);

    // D006: 上传路径 basePath/yyyy-mm-dd/testcase_all.json(加日期前缀,避免多份混一起)
    const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd
    const basePath = cfg.ftp.basePath.replace(/\/+$/, '');
    const remotePath = `${basePath}/${today}/testcase_all.json`;
    // 文件内容是 {datas:[...]} 包裹(03-用例管理.md L158-163 文件格式定义)。
    // 树形结构:datas 顶层是菜单节点(isParent:true),用例作为它的 children。
    // 甲方 syncNode 靠节点 id 去重/落库,菜单 id 用 config.menuId,用例 id = outCaseId(快照反查键)。
    const menu: CustomerTestCaseMenu = {
      id: testCaseConfig.menuId,
      name: testCaseConfig.menuName,
      isParent: true,
      children: testCases,
    };
    const fileContent = JSON.stringify({ datas: [menu] });

    try {
      await ftp.uploadFile({
        host: cfg.ftp.host,
        port: cfg.ftp.port,
        username: cfg.ftp.username,
        password: cfg.ftp.password,
        remotePath,
        content: fileContent,
      });
    } catch (e) {
      console.error('[northbound] getTestCaseAll FTP upload failed', e);
      // 上传失败也通知甲方(让甲方知道失败了),然后回 statusCode:2
      await reportFileTranslationCompleteSafe({
        tranType: 'upload',
        result: 'fail',
        // fileType 必须取文件类型标识表(表2-1)合法值;'TestCase' 不在表里,甲方 worker 判"暂不支持该文件类型"。
        // testcase_all.json 是测试用例属性数据 → 对应表中第18项 CfgParam(测试用例配置参数文件, json)。
        fileType: 'CfgParam',
        fileIndex: 0,
        filePath: remotePath,
        ftpServerIP: cfg.ftp.host,
      });
      return buildResponse(envelope, 2, 'FTP upload failed');
    }

    // D006: 上传成功后调 fileTranslationComplete 通知甲方文件路径(甲方自己去 FTP 取)
    await reportFileTranslationCompleteSafe({
      tranType: 'upload',
      result: 'success',
      // fileType 必须取文件类型标识表(表2-1)合法值;'TestCase' 不在表里会被甲方判"暂不支持该文件类型"。
      // testcase_all.json 是测试用例属性数据 → 对应表中第18项 CfgParam(测试用例配置参数文件, json)。
      fileType: 'CfgParam',
      fileIndex: 0,
      filePath: remotePath,
      ftpServerIP: cfg.ftp.host,
    });

    // 响应体只有信封字段,无 datas(D006)
    return buildResponse(envelope, 1, 'ok');
  }

  /**
   * D006: fileTranslationComplete 通知(fileTranslationComplete 接口)。
   * 包装 reportFileTranslationComplete,失败只 log 不影响主流程(R11:通知失败不影响 getTestCaseAll 响应)。
   */
  async function reportFileTranslationCompleteSafe(file: Omit<FileTranslationCompleteOutbound, keyof OutboundEnvelope>): Promise<void> {
    try {
      await reportFileTranslationComplete(file);
    } catch (e) {
      console.error('[northbound] reportFileTranslationComplete failed', e);
    }
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
    setCatalogMappings,
  };
}

function jsonResponse(body: Record<string, unknown>, statusCode = 200): HttpResponse {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
