import type { ConditionMatchInput } from '@/features/task';
import { ConnectionToReceiveInputSource } from './bridges/connection-to-receive';
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

  if (dataEvents.length === 0) {
    return { ok: true, eventsRouted: 0, matchesEmitted: 0 };
  }

  const source = new ConnectionToReceiveInputSource(dataEvents);
  const receiveOutcome =
    await features.receiveService.drainInputSource(source);

  if (!receiveOutcome.ok) {
    return {
      ok: false,
      error: 'Receive processing failed',
      eventsRouted: dataEvents.length,
      matchesEmitted: 0,
    };
  }

  const matchInputs: ConditionMatchInput[] = [];
  for (const outcome of receiveOutcome.outcomes) {
    if (outcome.kind !== 'matched') continue;
    if (!outcome.matchedFrame) continue;

    for (const field of outcome.fields) {
      const sourceId = outcome.input?.source.sourceId;
      matchInputs.push({
        frameId: outcome.matchedFrame.frameId,
        fieldId: field.fieldId,
        value: field.value as number | string | null,
        ...(sourceId ? { sourceId } : {}),
      });
    }
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
