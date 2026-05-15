import { ref, shallowRef } from 'vue';
import type { HighlightRuleConfig, Highlight } from '../core/highlight';
import type { DataRecord } from '../services/data-recorder';
import type { CommandIngressService } from '../services/command-ingress-service';
import { calculateHighlights } from '../core/highlight';

export function useTestTool(
  service: CommandIngressService,
  getConnectionId: () => string,
) {
  const hexInput = ref('');
  const records = shallowRef<readonly DataRecord[]>([]);
  const highlightRules = shallowRef<HighlightRuleConfig[]>([]);

  const isSending = ref(false);
  const showHighlightDialog = ref(false);

  async function sendHex(): Promise<void> {
    const hex = hexInput.value.trim();
    if (!hex) return;
    const connectionId = getConnectionId();
    if (!connectionId) return;

    isSending.value = true;
    try {
      await service.sendTestData(hex, connectionId);
      hexInput.value = '';
    } finally {
      isSending.value = false;
    }
  }

  function refreshRecords(): void {
    records.value = service.getTestDataRecorder().getRecords();
  }

  function clearRecords(): void {
    service.getTestDataRecorder().clear();
    records.value = [];
  }

  function saveHighlightRules(rules: HighlightRuleConfig[]): void {
    highlightRules.value = rules;
  }

  function computeHighlights(data: Uint8Array): Highlight[] {
    return calculateHighlights(data, highlightRules.value);
  }

  return {
    hexInput,
    records,
    highlightRules,
    isSending,
    showHighlightDialog,
    sendHex,
    refreshRecords,
    clearRecords,
    saveHighlightRules,
    computeHighlights,
  };
}
