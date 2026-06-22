<script setup lang="ts">
import { reactive, computed, onMounted } from 'vue';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import { useAsyncAction, useNotify } from '@/shared/composables';
import type { SerialTransportConfig } from '@/features/connection';

const BAUD_RATE_OPTIONS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1000000];
const DATA_BITS_OPTIONS: readonly (5 | 6 | 7 | 8)[] = [5, 6, 7, 8];
const STOP_BITS_OPTIONS: readonly (1 | 1.5 | 2)[] = [1, 1.5, 2];
const PARITY_OPTIONS: readonly ('none' | 'even' | 'odd' | 'mark' | 'space')[] = ['none', 'even', 'odd', 'mark', 'space'];
const FLOW_CONTROL_OPTIONS: readonly ('none' | 'hardware' | 'software')[] = ['none', 'hardware', 'software'];

const PARITY_LABELS: Record<string, string> = {
  none: '无校验',
  even: '偶校验',
  odd: '奇校验',
  mark: '标记校验',
  space: '空格校验',
};

const FLOW_CONTROL_LABELS: Record<string, string> = {
  none: '无流控',
  hardware: '硬件流控',
  software: '软件流控',
};

interface SerialParams {
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 1.5 | 2;
  parity: 'none' | 'even' | 'odd' | 'mark' | 'space';
  flowControl: 'none' | 'hardware' | 'software';
}

const notify = useNotify();
const runtime = useRewriteRuntime();
const connectionService = runtime.features.connectionService;

// ===== Business data =====
const hasSerialConfig = computed(() => {
  const configs = connectionService.listTransportConfigs();
  return configs.some((c) => c.kind === 'serial');
});

const serialConfig = computed<SerialTransportConfig | null>(() => {
  const configs = connectionService.listTransportConfigs();
  const serial = configs.find((c) => c.kind === 'serial');
  return (serial as SerialTransportConfig | undefined) ?? null;
});

const params = reactive<SerialParams>({
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  flowControl: 'none',
});

// ===== Derived =====
const isDirty = computed(() => {
  const cfg = serialConfig.value;
  if (!cfg) return false;
  return (
    params.baudRate !== cfg.baudRate ||
    params.dataBits !== (cfg.dataBits ?? 8) ||
    params.stopBits !== (cfg.stopBits ?? 1) ||
    params.parity !== (cfg.parity ?? 'none') ||
    params.flowControl !== (cfg.flowControl ?? 'none')
  );
});

// ===== Operations =====
const { execute: executeSave, isOperating: isSaving } = useAsyncAction();

function loadFromConfig(): void {
  const cfg = serialConfig.value;
  if (!cfg) return;
  params.baudRate = cfg.baudRate;
  params.dataBits = cfg.dataBits ?? 8;
  params.stopBits = cfg.stopBits ?? 1;
  params.parity = cfg.parity ?? 'none';
  params.flowControl = cfg.flowControl ?? 'none';
}

async function handleSave(): Promise<void> {
  await executeSave('conn-save', async () => {
    const cfg = serialConfig.value;
    if (!cfg) return;

    const updated: SerialTransportConfig = {
      ...cfg,
      baudRate: params.baudRate,
      dataBits: params.dataBits,
      stopBits: params.stopBits,
      parity: params.parity,
      flowControl: params.flowControl,
    };

    const result = await connectionService.connect(updated);
    if (result.ok) {
      await runtime.persistence.saveConnections();
      notify.success('串口参数已保存');
    } else {
      const messages = result.validation.issues.map((i) => i.message).join('; ');
      notify.error('保存失败', messages);
    }
  });
}

onMounted(() => {
  loadFromConfig();
});
</script>

<template>
  <q-expansion-item
    default-opened
    label="连接设置"
    icon="link"
    header-class="settings-group__header"
  >
    <q-card class="settings-group__body q-pa-md">
      <div v-if="!hasSerialConfig" class="py-4">
        <p class="rw-text-desc">暂无串口连接配置。请先在连接管理页面创建串口连接。</p>
      </div>

      <q-form v-else @submit.prevent="handleSave">
        <div class="mb-3">
          <q-select
            v-model="params.baudRate"
            :options="BAUD_RATE_OPTIONS"
            label="波特率"
            dense
            outlined
            emit-value
            map-options
            class="settings-group__field"
          />
        </div>
        <div class="mb-3">
          <q-select
            v-model="params.dataBits"
            :options="DATA_BITS_OPTIONS"
            label="数据位"
            dense
            outlined
            emit-value
            map-options
            class="settings-group__field"
          />
        </div>
        <div class="mb-3">
          <q-select
            v-model="params.stopBits"
            :options="STOP_BITS_OPTIONS"
            label="停止位"
            dense
            outlined
            emit-value
            map-options
            class="settings-group__field"
          />
        </div>
        <div class="mb-3">
          <q-select
            v-model="params.parity"
            :options="PARITY_OPTIONS"
            label="校验位"
            dense
            outlined
            emit-value
            map-options
            :options-dense="true"
            class="settings-group__field"
          >
            <template #option="{ itemProps, opt }">
              <q-item v-bind="itemProps">
                <q-item-section>
                  <q-item-label>{{ PARITY_LABELS[opt] ?? opt }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
            <template #selected-item="{ opt }">
              {{ PARITY_LABELS[opt] ?? opt }}
            </template>
          </q-select>
        </div>
        <div class="mb-3">
          <q-select
            v-model="params.flowControl"
            :options="FLOW_CONTROL_OPTIONS"
            label="流控制"
            dense
            outlined
            emit-value
            map-options
            class="settings-group__field"
          >
            <template #option="{ itemProps, opt }">
              <q-item v-bind="itemProps">
                <q-item-section>
                  <q-item-label>{{ FLOW_CONTROL_LABELS[opt] ?? opt }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
            <template #selected-item="{ opt }">
              {{ FLOW_CONTROL_LABELS[opt] ?? opt }}
            </template>
          </q-select>
        </div>

        <div class="flex gap-2 q-mt-lg">
          <q-btn
            unelevated
            color="primary"
            label="保存参数"
            :loading="isSaving('conn-save')"
            :disable="!isDirty"
            type="submit"
          />
        </div>
      </q-form>
    </q-card>
  </q-expansion-item>
</template>
