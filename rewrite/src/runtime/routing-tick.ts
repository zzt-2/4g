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

  if (dataEvents.length === 0) {
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
