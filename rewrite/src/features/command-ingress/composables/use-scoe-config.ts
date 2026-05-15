import { ref, shallowRef, computed } from 'vue';
import type { SatelliteConfig } from '../core';

export function useScoeConfig() {
  const satelliteConfigs = shallowRef<SatelliteConfig[]>([]);
  const selectedConfigId = ref<string>('');
  const isSaving = ref(false);

  const selectedConfig = computed(() =>
    satelliteConfigs.value.find((c) => c.satelliteId === selectedConfigId.value),
  );

  function addSatellite(config: SatelliteConfig): void {
    satelliteConfigs.value = [...satelliteConfigs.value, config];
  }

  function removeSatellite(satelliteId: string): void {
    satelliteConfigs.value = satelliteConfigs.value.filter(
      (c) => c.satelliteId !== satelliteId,
    );
    if (selectedConfigId.value === satelliteId) {
      selectedConfigId.value = '';
    }
  }

  function updateSatellite(satelliteId: string, config: SatelliteConfig): void {
    satelliteConfigs.value = satelliteConfigs.value.map((c) =>
      c.satelliteId === satelliteId ? config : c,
    );
  }

  function duplicateSatellite(satelliteId: string): void {
    const source = satelliteConfigs.value.find((c) => c.satelliteId === satelliteId);
    if (!source) return;
    const copy: SatelliteConfig = {
      ...structuredClone(source),
      satelliteId: `${source.satelliteId}_copy`,
    };
    satelliteConfigs.value = [...satelliteConfigs.value, copy];
  }

  function selectSatellite(satelliteId: string): void {
    selectedConfigId.value = satelliteId;
  }

  async function loadConfigs(): Promise<void> {
    // TODO: platform file facade readTextFile
    satelliteConfigs.value = [];
  }

  async function saveConfigs(): Promise<void> {
    isSaving.value = true;
    try {
      // TODO: platform file facade writeTextFile
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      isSaving.value = false;
    }
  }

  return {
    satelliteConfigs,
    selectedConfigId,
    selectedConfig,
    isSaving,
    addSatellite,
    removeSatellite,
    updateSatellite,
    duplicateSatellite,
    selectSatellite,
    loadConfigs,
    saveConfigs,
  };
}
