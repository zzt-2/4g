import type { ConditionMatchInput } from '@/features/task';
import { ConnectionToReceiveInputSource } from './bridges/connection-to-receive';
import { fanOutToDisplay } from './bridges/receive-display-bridge';
import { fanOutToStorage } from './bridges/receive-storage-bridge';
import type { RewriteWiredFeatures } from './feature-wiring';

export interface RoutingTickResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly eventsRouted: number;
  readonly matchesEmitted: number;
}

export async function routingTick(
  features: RewriteWiredFeatures,
): Promise<RoutingTickResult> {
  const drainOutcome =
    await features.connectionService.drainAdapterEvents();

  if (!drainOutcome.ok) {
    return {
      ok: false,
      error: drainOutcome.error?.message ?? 'Connection drain failed',
      eventsRouted: 0,
      matchesEmitted: 0,
    };
  }

  const dataEvents = drainOutcome.events.filter(
    (event) => event.kind === 'data' && event.bytes !== undefined,
  );

  // 非 data 事件(disconnect/error/cleanup)是低频但需可见的状态变化,保留 warn
  // 但去掉每次的 .map 格式化(高频 tick 下即便不触发也按需构造)。
  if (dataEvents.length === 0) {
    const nonDataCount = drainOutcome.events.length;
    if (nonDataCount > 0) {
      console.warn('[routing] non-data events in tick:', nonDataCount);
    }
    return { ok: true, eventsRouted: 0, matchesEmitted: 0 };
  }

  const source = new ConnectionToReceiveInputSource(dataEvents);
  const receiveOutcome =
    await features.receiveService.drainInputSource(source);

  fanOutToDisplay(features.displayService, receiveOutcome.outcomes);
  await fanOutToStorage(features.storageService, receiveOutcome.outcomes);

  const matchInputs: ConditionMatchInput[] = [];
  for (const outcome of receiveOutcome.outcomes) {
    if (outcome.kind !== 'matched') continue;
    if (!outcome.matchedFrame) continue;

    const sourceId = outcome.input?.source.sourceId;
    const fieldValues: Record<string, number | string | null> = {};
    for (const field of outcome.fields) {
      fieldValues[field.fieldId] = field.value as number | string | null;
    }
    matchInputs.push({
      frameId: outcome.matchedFrame.frameId,
      fieldValues,
      ...(sourceId ? { sourceId } : {}),
    });
  }

  if (matchInputs.length > 0) {
    features.receiveEventSourceBridge.emit(matchInputs);
  }

  return {
    ok: true,
    eventsRouted: dataEvents.length,
    matchesEmitted: matchInputs.length,
  };
}
