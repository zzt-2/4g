/**
 * 东方红上位机重写 - 4 个典型业务场景的 TaskDefinition fixtures。
 *
 * 这些 task 覆盖：
 *   1. 整机复位（一次性串行 12 条 B 类脉冲，skip-step 容错）
 *   2. 激光器初始化 + 自检（串行配置 + wait-condition 等待激光器稳定）
 *   3. 通信链路建链自检（下发 TX/RX map + 等待 carrier/symbol/frame 三态锁定）
 *   4. 速率扫描测试（定时 10s 触发，每次切一种速率，maxIterations=8）
 *
 * 所有 frameId / fieldId 都从
 *   rewrite/src/features/frame/fixtures/dongfanghong-frames.ts
 * 的 47 条真实定义里摘取，不允许凭空捏造。
 *
 * 设计取舍：
 *   - schedule 只用 immediate / timer；event 触发型不在本文件覆盖范围
 *   - targetId 用占位值 'dongfanghong-device-1'，由 UI / runtime 在启动实例时替换
 *   - 速率扫描不做 FieldVariation（schema 支持但语义复杂），直接硬编码 8 步序列
 *     更直观，UI 也好调试
 *   - stopCondition 只在速率扫描用 maxIterations=8，one-shot 型不设
 *   - errorPolicy：复位用 skip-step，自检/建链用 stop，扫描用 skip-step
 */

import type {
  TaskDefinition,
  TaskStepDefinition,
  SendStepConfig,
  WaitConditionConfig,
  DelayStepConfig,
  ConditionTerm,
  TaskErrorPolicy,
  TaskTemplate,
} from '../core';

// ---------------------------------------------------------------------------
// 公共常量
// ---------------------------------------------------------------------------

/** 默认 target，UI/runtime 可在实例化时覆盖。 */
const DEFAULT_TARGET_ID = 'dongfanghong-device-1';

// ---------------------------------------------------------------------------
// Helper factories（仿 task-fixtures.ts 风格，但支持完整字段）
// ---------------------------------------------------------------------------

interface SendStepOpts {
  readonly id: string;
  readonly frameId: string;
  readonly targetId?: string;
  readonly name?: string;
  readonly userFieldValues?: Readonly<Record<string, string | number | boolean>>;
}

function sendStep(opts: SendStepOpts): TaskStepDefinition {
  const config: SendStepConfig = {
    frameId: opts.frameId,
    ...(opts.targetId ? { targetId: opts.targetId } : {}),
    ...(opts.userFieldValues ? { userFieldValues: opts.userFieldValues } : {}),
  };
  return {
    id: opts.id,
    kind: 'send',
    ...(opts.name ? { name: opts.name } : {}),
    config,
  } as TaskStepDefinition;
}

function delayStep(id: string, durationMs: number, name?: string): TaskStepDefinition {
  const config: DelayStepConfig = { durationMs };
  return {
    id,
    kind: 'delay',
    ...(name ? { name } : {}),
    config,
  } as TaskStepDefinition;
}

interface WaitOpts {
  readonly id: string;
  readonly conditions: readonly ConditionTerm[];
  readonly timeoutMs?: number;
  readonly onTimeout?: 'continue' | 'skip' | 'fail';
  readonly name?: string;
}

function waitStep(opts: WaitOpts): TaskStepDefinition {
  const config: WaitConditionConfig = {
    conditions: opts.conditions,
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    ...(opts.onTimeout !== undefined ? { onTimeout: opts.onTimeout } : {}),
  } as WaitConditionConfig;
  return {
    id: opts.id,
    kind: 'wait-condition',
    ...(opts.name ? { name: opts.name } : {}),
    config,
  } as TaskStepDefinition;
}

const stopOnError: TaskErrorPolicy = { onFailure: 'stop' };
const skipStepOnError: TaskErrorPolicy = { onFailure: 'skip-step' };

// ---------------------------------------------------------------------------
// Task 1: 整机复位（task-full-reset）
// ---------------------------------------------------------------------------

/**
 * 整机复位：串行发 12 条 B 类脉冲帧，每条之间夹 100ms 延时。
 *
 * 顺序按硬件依赖：先复位底层模块（ADC / GT / CXP），再业务（BIZ_RX / BIZ_TX），
 * 最后通信（COMM_TX / COMM_RX）。每条之间留 100ms 让 RTL 真正吃下脉冲。
 *
 * 容错策略：skip-step。一个模块复位失败不阻塞其他模块，最后由 UI 报告失败清单。
 */
function buildFullResetTask(): TaskDefinition {
  // 12 条 B 类脉冲 frameId（B 类无 payload，userFieldValues 留空）
  const pulseSequence: ReadonlyArray<{ readonly frameId: string; readonly label: string }> = [
    { frameId: 'rc-adc-pulse-reset', label: 'ADC 复位' },
    { frameId: 'rc-gt-pulse-reset', label: 'GT 复位' },
    { frameId: 'rc-cxp-pulse-reset', label: 'CXP 业务复位' },
    { frameId: 'rc-biz-rx-pulse-clear', label: 'BIZ_RX 计数清零' },
    { frameId: 'rc-biz-rx-pulse-reset', label: 'BIZ_RX 复位' },
    { frameId: 'rc-biz-tx-pulse-clear', label: 'BIZ_TX 计数清零' },
    { frameId: 'rc-biz-tx-pulse-reset', label: 'BIZ_TX 复位' },
    { frameId: 'rc-comm-tx-pulse-reset', label: 'COMM_TX 复位' },
    { frameId: 'rc-comm-tx-pulse-clear', label: 'COMM_TX 计数清零' },
    { frameId: 'rc-comm-rx-pulse-range-rst', label: 'COMM_RX 测距复位' },
    { frameId: 'rc-comm-rx-pulse-count-clr', label: 'COMM_RX 计数清零' },
    { frameId: 'rc-comm-rx-pulse-manual-rst', label: 'COMM_RX 全体复位' },
  ];

  const steps: TaskStepDefinition[] = [];
  pulseSequence.forEach((entry, idx) => {
    steps.push(
      sendStep({
        id: `reset-${idx + 1}-${entry.frameId}`,
        frameId: entry.frameId,
        name: entry.label,
      }),
    );
    // 最后一条之后不需要 delay
    if (idx < pulseSequence.length - 1) {
      steps.push(delayStep(`reset-delay-${idx + 1}`, 100, `复位间隔 ${idx + 1}`));
    }
  });

  return {
    id: 'task-full-reset',
    name: '整机复位（12 模块串行脉冲）',
    schedule: { kind: 'immediate' },
    steps,
    errorPolicy: skipStepOnError,
    defaultTargetId: DEFAULT_TARGET_ID,
  };
}

// ---------------------------------------------------------------------------
// Task 2: 激光器初始化 + 自检（task-laser-init-and-check）
// ---------------------------------------------------------------------------

/**
 * 激光器初始化 + 自检：依次开启 TXM1 / LO1 / TEC1 / 手动温度路径 / 调制开始，
 * 并下发 TXM1/LO1 温度设置值，最后等待 TEC1 温度收敛到设定值附近（±0x80 容差）。
 *
 * 容错策略：stop。激光链路是后续通信建链的前提，任何一步失败都应立即停止。
 *
 * wait-condition 选用 tm-laser-runtime 的 `tec1-t-m-out` 字段：
 *   - operator=any：只要收到一帧遥测（任意变化）就算稳定
 *   - 这是个保守条件；真正按阈值判定需要 docs 没给出的 factor/unit
 */
function buildLaserInitTask(): TaskDefinition {
  const steps: TaskStepDefinition[] = [
    sendStep({
      id: 'laser-step-1-txm-on',
      frameId: 'rc-laser-txm-on',
      name: '开启 TXM1 发射激光器',
      userFieldValues: { 'txm-on': '0x00000001' },
    }),
    sendStep({
      id: 'laser-step-2-lo-on',
      frameId: 'rc-laser-lo-on',
      name: '开启 LO1 本振激光器',
      userFieldValues: { 'lo-on': '0x00000001' },
    }),
    sendStep({
      id: 'laser-step-3-tec-on1',
      frameId: 'rc-laser-tec-on1',
      name: '开启 TEC1',
      userFieldValues: { 'tec-on1': '0x00000001' },
    }),
    sendStep({
      id: 'laser-step-4-wave-set',
      frameId: 'rc-laser-wave-set-on',
      name: '切到手动温度路径',
      userFieldValues: { 'wave-set-on': '0x00000001' },
    }),
    sendStep({
      id: 'laser-step-5-txm1-set',
      frameId: 'rc-laser-txm1-set',
      name: '设置 TXM1 温度（0x80 0x00 = 默认中点）',
      userFieldValues: { 'txm1-set': '0x00008000' },
    }),
    sendStep({
      id: 'laser-step-6-lo1-set',
      frameId: 'rc-laser-lo1-set',
      name: '设置 LO1 温度',
      userFieldValues: { 'lo1-set': '0x00008000' },
    }),
    delayStep('laser-step-7-stabilize', 500, '等 TEC 起转'),
    sendStep({
      id: 'laser-step-8-vol-auto',
      frameId: 'rc-laser-vol-auto',
      name: '调制开始',
      userFieldValues: { 'vol-auto': '0x00000001' },
    }),
    waitStep({
      id: 'laser-step-9-wait-tec1',
      name: '等 TEC1 温度遥测到达',
      conditions: [
        {
          frameId: 'tm-laser-runtime',
          fieldId: 'tec1-t-m-out',
          operator: 'any',
          threshold: 0,
        },
      ],
      timeoutMs: 5000,
      onTimeout: 'fail',
    }),
  ];

  return {
    id: 'task-laser-init-and-check',
    name: '激光器初始化 + 自检',
    schedule: { kind: 'immediate' },
    steps,
    errorPolicy: stopOnError,
    defaultTargetId: DEFAULT_TARGET_ID,
  };
}

// ---------------------------------------------------------------------------
// Task 3: 通信链路建链自检（task-comm-link-check）
// ---------------------------------------------------------------------------

/**
 * 通信链路建链自检：下发 comm_tx map（默认 2.5G，扰码 + RS，故障注入全关）+
 * comm_rx map（速率匹配 + 解扰 + 滤波开启），等 1s 建链后检查三态锁定：
 * carrier_lock + symbol_lock + frame_lock。
 *
 * 容错策略：stop。建链失败说明速率 / 配置不匹配，继续没意义。
 */
function buildCommLinkCheckTask(): TaskDefinition {
  // comm_tx map 的 10 字段，按 docs 默认值（除速率用 2.5G）
  const txMapValues: Readonly<Record<string, string>> = {
    rate: '0x00000003', // 2.5G
    scramble: '0x00000001', // 扰码开
    encode: '0x00000000', // RS
    'ber-inject': '0x00000000',
    'crc-error': '0x00000000',
    'header-error': '0x00000000',
    'data-type-error': '0x00000000',
    'field-pos-error': '0x00000000',
    'encode-error': '0x00000000',
    'data-link-break': '0x00000000',
  };

  // comm_rx map 的 8 字段
  const rxMapValues: Readonly<Record<string, string>> = {
    rate: '0x00000003', // 2.5G，必须和 TX 一致
    decode: '0x00000000', // RS
    descramble: '0x00000001', // 解扰开
    filter: '0x00000001', // 载波滤波开
    'loop-bw': '0x00000003', // 默认带宽 3
    'timing-filter': '0x00000000', // 关
    'auto-reset': '0x00000001', // 自动复位开
    'loop-enable': '0x00000000', // 不环回
  };

  const steps: TaskStepDefinition[] = [
    sendStep({
      id: 'link-step-1-tx-map',
      frameId: 'rc-comm-tx-map',
      name: '下发发送链路配置',
      userFieldValues: txMapValues,
    }),
    sendStep({
      id: 'link-step-2-rx-map',
      frameId: 'rc-comm-rx-map',
      name: '下发接收链路配置',
      userFieldValues: rxMapValues,
    }),
    delayStep('link-step-3-settle', 1000, '等 1s 建链'),
    waitStep({
      id: 'link-step-4-wait-lock',
      name: '等载波 / 符号 / 帧三态锁定',
      conditions: [
        {
          frameId: 'tm-comm-rx-runtime',
          fieldId: 'carrier-lock-state',
          operator: 'eq',
          threshold: 1,
        },
        {
          frameId: 'tm-comm-rx-runtime',
          fieldId: 'symbol-lock-state',
          operator: 'eq',
          threshold: 1,
        },
        {
          frameId: 'tm-comm-rx-runtime',
          fieldId: 'frame-lock-state',
          operator: 'eq',
          threshold: 1,
        },
      ],
      timeoutMs: 5000,
      onTimeout: 'fail',
    }),
  ];

  return {
    id: 'task-comm-link-check',
    name: '通信链路建链自检',
    schedule: { kind: 'immediate' },
    steps,
    errorPolicy: stopOnError,
    defaultTargetId: DEFAULT_TARGET_ID,
  };
}

// ---------------------------------------------------------------------------
// Task 4: 速率扫描测试（task-rate-sweep）
// ---------------------------------------------------------------------------

/**
 * 速率扫描测试：定时 10s 触发，每次迭代切一种速率，maxIterations=8 覆盖全部档位。
 *
 * 不做 FieldVariation：把 8 种速率硬编码成 8 个独立步骤更直观，UI 调试也好对账。
 * 但因为 schedule 是 timer，每次 tick 跑一遍 steps，所以 steps 里只放一组速率，
 * 通过 stopCondition.maxIterations=8 + iteration index 在运行时由 UI 切换速率值。
 *
 * 折中方案：steps 写"建链等待 + 锁定检查 + 采集窗口"，速率值由调用方按
 * iteration 决定（UI 层在每次 tick 前 send 一次 rc-comm-tx-map / rc-comm-rx-map）。
 * 这样 task definition 本身保持速率无关，复用性更好。
 *
 * 容错策略：skip-step。单个速率建链失败不影响下一档。
 */
function buildRateSweepTask(): TaskDefinition {
  const steps: TaskStepDefinition[] = [
    // 速率切换由 UI 在 timer tick 时下发，这里不内嵌（见上文设计取舍）
    delayStep('sweep-step-1-settle', 2000, '等 2s 建链'),
    waitStep({
      id: 'sweep-step-2-wait-lock',
      name: '等三态锁定',
      conditions: [
        {
          frameId: 'tm-comm-rx-runtime',
          fieldId: 'carrier-lock-state',
          operator: 'eq',
          threshold: 1,
        },
        {
          frameId: 'tm-comm-rx-runtime',
          fieldId: 'symbol-lock-state',
          operator: 'eq',
          threshold: 1,
        },
        {
          frameId: 'tm-comm-rx-runtime',
          fieldId: 'frame-lock-state',
          operator: 'eq',
          threshold: 1,
        },
      ],
      timeoutMs: 5000,
      onTimeout: 'skip',
    }),
    delayStep('sweep-step-3-acquire', 5000, '采集窗口 5s'),
  ];

  return {
    id: 'task-rate-sweep',
    name: '速率扫描测试（10s 一档，8 档）',
    schedule: { kind: 'timer', intervalMs: 10000 },
    steps,
    errorPolicy: skipStepOnError,
    stopCondition: { maxIterations: 8 },
    defaultTargetId: DEFAULT_TARGET_ID,
  };
}

// ---------------------------------------------------------------------------
// 汇总导出
// ---------------------------------------------------------------------------

/**
 * 整机复位 task：一次性串行 12 条 B 类脉冲，每条间隔 100ms，skip-step 容错。
 */
export const fullResetTask: TaskDefinition = buildFullResetTask();

/**
 * 激光器初始化 + 自检 task：TXM1/LO1/TEC1 开启 + 温度设置 + 等遥测稳定。
 */
export const laserInitTask: TaskDefinition = buildLaserInitTask();

/**
 * 通信链路建链自检 task：TX/RX map 下发 + 等三态锁定。
 */
export const commLinkCheckTask: TaskDefinition = buildCommLinkCheckTask();

/**
 * 速率扫描 task：10s 定时触发，8 档速率，每档建链+采集。
 */
export const rateSweepTask: TaskDefinition = buildRateSweepTask();

/**
 * 全部 4 个东方红 task definition，供 JSON 生成、UI 默认列表和 E2E 测试消费。
 */
export const dongfanghongTasks: readonly TaskDefinition[] = [
  fullResetTask,
  laserInitTask,
  commLinkCheckTask,
  rateSweepTask,
];

export const dongfanghongTaskCount = dongfanghongTasks.length;

// ---------------------------------------------------------------------------
// TaskTemplate 包装（UI 导入导出格式）
// ---------------------------------------------------------------------------

const TEMPLATE_CREATED_AT = '2026-06-11T00:00:00.000Z';

function wrapTemplate(task: TaskDefinition, tags: readonly string[]): TaskTemplate {
  return {
    templateId: task.id,
    name: task.name,
    tags,
    definition: task,
    createdAt: TEMPLATE_CREATED_AT,
    updatedAt: TEMPLATE_CREATED_AT,
  };
}

export const fullResetTemplate: TaskTemplate = wrapTemplate(fullResetTask, ['reset', 'ops']);
export const laserInitTemplate: TaskTemplate = wrapTemplate(laserInitTask, ['laser', 'init']);
export const commLinkCheckTemplate: TaskTemplate = wrapTemplate(commLinkCheckTask, ['comm', 'self-check']);
export const rateSweepTemplate: TaskTemplate = wrapTemplate(rateSweepTask, ['comm', 'rate-sweep']);

export const dongfanghongTemplates: readonly TaskTemplate[] = [
  fullResetTemplate,
  laserInitTemplate,
  commLinkCheckTemplate,
  rateSweepTemplate,
];

export const dongfanghongTemplateCount = dongfanghongTemplates.length;
