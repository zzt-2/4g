import { computed } from 'vue';
import { getRewritePlatformBridgeInfo } from '@/platform';

export function useRewritePlatform() {
  const bridgeInfo = computed(() => getRewritePlatformBridgeInfo());

  return {
    bridgeInfo,
  };
}
