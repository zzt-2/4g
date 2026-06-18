import { describe, it, expect } from 'vitest';
import type { SendRequest, SendResult, SendFieldValue } from '@/features/send';
import type { SendFieldEncodingDef } from '@/features/send/core/frame-resolver';
import { resolveFieldValues } from '@/features/send/core/frame-resolver';
import type { SendServiceProvider } from '../adapters/ports';
import type { TaskDefinition } from '../core';
import { createTaskService, type TaskService } from '../services/task-service';
import { createFakeReceiveEventSource } from '../adapters/test-exports';

// =============================================================================
// accumulation 端到端集成测试(跨 task + send frame-resolver)
// =============================================================================
//
// 与 task-service-state-selector.spec.ts 的 accumulation 测试不同,这里【不 mock
// resolvedFieldValues】。send service 内部调用真实的 frame-resolver.resolveFieldValues,
// 让帧侧 self-referencing 表达式(isSelfReferencing + Phase2 seed + Phase4 evaluate)真正
// 算出递推结果,验证完整闭环:
//   task buildSendRequest(注入 lastValues → userFieldValues)
//   → frame-resolver(speed + step,seed 来自 userFieldValues)
//   → resolvedFieldValues
//   → task writeback(回写 stepContext.lastValues)
//   → 下次 buildSendRequest(seed 是上次结果)
//
// 这填补了独立审查指出的 known gap:帧侧递推 + task writeback 从未在一条测试里联合验证。

// --- frame-resolver-backed send service ---
// 接收 SendRequest,用预设的字段定义(含自引用 expressionConfig)调真实 resolveFieldValues,
// 把求值结果作为 resolvedFieldValues 返回。模拟 send-service 的核心求值链路(跳过字节编码)。

interface RecordedCall {
  readonly request: SendRequest;
  readonly index: number;
}

function createFrameResolverSendService(
  fieldsByFrame: Record<string, readonly SendFieldEncodingDef[]>,
): SendServiceProvider & { readonly calls: readonly RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let callIndex = 0;
  // 空 variable provider:本测试所有变量都来自 current_field(userFieldValues)
  const emptyProvider = { getVariables: () => new Map<string, number | string | boolean>() };

  return {
    get calls() {
      return calls;
    },

    async execute(request: SendRequest): Promise<SendResult> {
      const index = callIndex;
      calls.push({ request, index });
      callIndex++;

      const fields = fieldsByFrame[request.frameId] ?? [];
      const userValues = request.userFieldValues ?? {};
      // 真实调 frame-resolver:self-referencing 识别 + Phase2 seed + Phase4 evaluate
      const resolved = resolveFieldValues(fields, userValues, emptyProvider);

      const resolvedFieldValues: Record<string, SendFieldValue> = {};
      for (const field of fields) {
        if (field.id in resolved.values) {
          resolvedFieldValues[field.id] = resolved.values[field.id]!;
        }
      }

      return {
        kind: 'sent',
        requestRef: {
          frameId: request.frameId,
          targetId: request.targetId,
          context: { ...request.context },
        },
        bytesBuilt: 10,
        bytesSent: 10,
        timestamp: '2026-05-06T12:00:00.000Z',
        buildIssues: [],
        // 关键:把帧侧真实求值结果返回,task writeback 据此回写 lastValues
        resolvedFieldValues,
      };
    },
  };
}

// --- 自引用累加帧字段定义 ---
// 模拟速度模拟帧 S-FPGA-004 的 expressionConfig:speed = speed + step
// speed 是 configurable + 自引用(configurable=true,variables 含 sourceId=speed 自身)。
function createAccumulationFields(): readonly SendFieldEncodingDef[] {
  return [
    {
      id: 'speed',
      dataType: 'uint32',
      length: 4,
      bigEndian: true,
      isASCII: false,
      offset: 0,
      factor: 1,
      defaultValue: '0',
      configurable: true,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'speed + step' }],
        variables: [
          { identifier: 'speed', sourceType: 'current_field', sourceId: 'speed' },  // 自引用
          { identifier: 'step', sourceType: 'current_field', sourceId: 'step' },
        ],
      },
    },
    {
      id: 'step',
      dataType: 'uint8',
      length: 1,
      bigEndian: true,
      isASCII: false,
      offset: 4,
      factor: 1,
      defaultValue: '0',
      configurable: true,
    },
  ] as const;
}

// --- 测试辅助:等待 task 跑完 ---
async function settle(service: TaskService, instanceId: string, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const inst = service.getInstance(instanceId);
    if (!inst || inst.lifecycle === 'completed' || inst.lifecycle === 'stopped' || inst.lifecycle === 'failed') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('Task accumulation E2E (task + send frame-resolver)', () => {
  it('accumulation auto-writeback: 帧有自引用表达式时跨发送自动累积(无需声明 resolver)', async () => {
    // accumulation 不再是用户声明的 resolver——帧有自引用表达式 + step 重复发送,
    // task 自动 writeback resolvedFieldValues,下次喂回帧侧 seed,帧侧完成递推。
    // step=1 固定(用户填),speed 首次由帧侧 defaultValue=0 种子,之后 writeback 喂回。
    // 帧 expressionConfig:speed = speed + step。
    const fields = createAccumulationFields();
    const sendService = createFrameResolverSendService({ 'acc-frame': fields });

    const def: TaskDefinition = {
      id: 'acc-e2e',
      name: 'Accumulation E2E',
      schedule: { kind: 'timer', intervalMs: 10 },
      steps: [{
        id: 's1', kind: 'send',
        config: {
          frameId: 'acc-frame', targetId: 't1',
          // step 固定 1;speed 不声明——accumulation 是 task 自动行为
          userFieldValues: { step: 1 },
          repeat: { intervalMs: 10, maxCount: 1 },
        },
      }],
      stopCondition: { maxIterations: 3 },
      errorPolicy: { onFailure: 'stop' },
    };

    const service = createTaskService({
      sendService,
      receiveEventSource: createFakeReceiveEventSource(),
      now: () => '2026-05-06T12:00:00.000Z',
    });
    const instance = service.createTask(def);
    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 2000);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    expect(sendService.calls.length).toBe(3);

    // 验证每次发送的 userFieldValues.speed(即注入帧侧的 seed):
    // iter0(counter=1):lastValues 空 → userFieldValues 无 speed;帧侧 Phase2 用 defaultValue=0 种子 → 0+1=1 → writeback speed=1
    // iter1(counter=2):writeback speed=1 合进 baseValues → 帧侧 seed=1 → 1+1=2 → writeback 2
    // iter2(counter=3):writeback speed=2 → seed=2 → 2+1=3 → writeback 3
    const injectedSpeeds = sendService.calls.map(
      (c) => (c.request.userFieldValues as { speed?: number }).speed,
    );
    expect(injectedSpeeds).toEqual([undefined, 1, 2]);
  });

  it('accumulation auto-writeback resets at step boundary (a-b-a)', async () => {
    // 验证 step 边界重置用真实帧侧递推:a1 累积后,b(普通单发)不打断,a2 从 defaultValue 重新累积。
    // accumulation 自动行为——a1/a2 都不声明 resolver。
    const fields = createAccumulationFields();
    const sendService = createFrameResolverSendService({ 'acc-frame': fields });

    const makeAccStep = (id: string) => ({
      id, kind: 'send' as const,
      config: {
        frameId: 'acc-frame', targetId: 't1',
        userFieldValues: { step: 1 },
        repeat: { intervalMs: 10, maxCount: 3 },  // 每个 a 发 3 次
      },
    });
    const def: TaskDefinition = {
      id: 'acc-aba-e2e',
      name: 'Accumulation A-B-A E2E',
      schedule: { kind: 'immediate' },
      steps: [
        makeAccStep('a1'),
        { id: 'b', kind: 'send' as const, config: { frameId: 'acc-frame', targetId: 't1', userFieldValues: { step: 1, speed: 0 } } },
        makeAccStep('a2'),
      ],
      errorPolicy: { onFailure: 'stop' },
    };

    const service = createTaskService({
      sendService,
      receiveEventSource: createFakeReceiveEventSource(),
      now: () => '2026-05-06T12:00:00.000Z',
    });
    const instance = service.createTask(def);
    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 2000);

    // a1 ×3, b ×1, a2 ×3 = 7 次
    expect(sendService.calls.length).toBe(7);

    // a1(counter 1-3):首次无 speed(lastValues 空,帧侧用 defaultValue=0 种子 → 0+1=1 writeback),
    // 之后 writeback 喂回 1, 2(帧侧 1+1=2, 2+1=3)
    const a1Speeds = sendService.calls.slice(0, 3).map(
      (c) => (c.request.userFieldValues as { speed?: number }).speed,
    );
    expect(a1Speeds).toEqual([undefined, 1, 2]);

    // b:单发,speed 来自 userFieldValues(0)。不影响 a2 的 lastValues(b 是不同 step)。
    // a2(新 step,独立 lastValues 空):首次无 speed → 帧侧 defaultValue 种子 → writeback 喂回 1, 2
    const a2Speeds = sendService.calls.slice(4, 7).map(
      (c) => (c.request.userFieldValues as { speed?: number }).speed,
    );
    expect(a2Speeds).toEqual([undefined, 1, 2]);
  });
});
