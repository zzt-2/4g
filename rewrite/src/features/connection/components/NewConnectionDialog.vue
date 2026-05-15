<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type {
  TransportConfig,
  TransportKind,
  ConnectionResourceCandidate,
} from '@/features/connection';

const props = defineProps<{
  readonly modelValue: boolean;
  readonly resources: readonly ConnectionResourceCandidate[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  create: [config: TransportConfig];
}>();

type Step = 'type' | 'form';

const step = ref<Step>('type');
const selectedKind = ref<TransportKind>('serial');
const submitting = ref(false);

// Serial fields
const label = ref('');
const portPath = ref('');
const baudRate = ref(115200);

// TCP Client fields
const tcpClientHost = ref('');
const tcpClientPort = ref(8080);

// TCP Server fields
const tcpServerHost = ref('0.0.0.0');
const tcpServerPort = ref(8080);

// UDP fields
const udpLocalHost = ref('0.0.0.0');
const udpLocalPort = ref(9090);
const udpRemoteHost = ref('');
const udpRemotePort = ref<number | undefined>(undefined);

// Shared
const autoConnect = ref(false);

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

const serialPortOptions = computed(() =>
  props.resources
    .filter((r) => r.kind === 'serial')
    .map((r) => ({ label: r.label, value: r.id })),
);

const dialogTitle = computed(() => {
  if (step.value === 'type') return '新建连接';
  const titles: Record<TransportKind, string> = {
    serial: '新建串口连接',
    'tcp-client': '新建 TCP 客户端连接',
    'tcp-server': '新建 TCP 服务端连接',
    udp: '新建 UDP 连接',
  };
  return titles[selectedKind.value];
});

function selectKind(kind: TransportKind): void {
  selectedKind.value = kind;
  step.value = 'form';
}

function resetForm(): void {
  step.value = 'type';
  label.value = '';
  portPath.value = '';
  baudRate.value = 115200;
  tcpClientHost.value = '';
  tcpClientPort.value = 8080;
  tcpServerHost.value = '0.0.0.0';
  tcpServerPort.value = 8080;
  udpLocalHost.value = '0.0.0.0';
  udpLocalPort.value = 9090;
  udpRemoteHost.value = '';
  udpRemotePort.value = undefined;
  autoConnect.value = false;
  submitting.value = false;
}

function onCancel(): void {
  resetForm();
  emit('update:modelValue', false);
}

function onSubmit(): void {
  submitting.value = true;
  try {
    const id = crypto.randomUUID();
    const base = {
      id,
      label: label.value || undefined,
      autoConnect: autoConnect.value || undefined,
    };

    let config: TransportConfig;
    switch (selectedKind.value) {
      case 'serial':
        config = {
          ...base,
          kind: 'serial',
          portPath: portPath.value,
          baudRate: baudRate.value,
        };
        break;
      case 'tcp-client':
        config = {
          ...base,
          kind: 'tcp-client',
          host: tcpClientHost.value,
          port: tcpClientPort.value,
        };
        break;
      case 'tcp-server':
        config = {
          ...base,
          kind: 'tcp-server',
          host: tcpServerHost.value,
          port: tcpServerPort.value,
        };
        break;
      case 'udp':
        config = {
          ...base,
          kind: 'udp',
          localHost: udpLocalHost.value,
          localPort: udpLocalPort.value,
          ...(udpRemoteHost.value ? { remoteHost: udpRemoteHost.value } : {}),
          ...(udpRemotePort.value ? { remotePort: udpRemotePort.value } : {}),
        };
        break;
    }

    emit('create', config);
    resetForm();
    emit('update:modelValue', false);
  } finally {
    submitting.value = false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) resetForm();
  },
);
</script>

<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" @hide="resetForm">
    <q-card class="rw-dialog-md">
      <q-card-section class="new-connection-dialog__header">
        <div class="text-h6">{{ dialogTitle }}</div>
        <q-btn flat round dense icon="close" @click="onCancel" />
      </q-card-section>

      <q-separator />

      <!-- Step 1: Type selection -->
      <q-card-section v-if="step === 'type'" class="new-connection-dialog__types">
        <div class="new-connection-dialog__type-grid">
          <q-card
            v-for="kind in (['serial', 'tcp-client', 'tcp-server', 'udp'] as const)"
            :key="kind"
            flat
            bordered
            clickable
            class="new-connection-dialog__type-card"
            @click="selectKind(kind)"
          >
            <q-card-section class="text-center">
              <q-icon
                :name="kind === 'serial' ? 'cable' : kind === 'tcp-client' ? 'lan' : kind === 'tcp-server' ? 'dns' : 'hub'"
                size="32px"
                color="primary"
              />
              <div class="new-connection-dialog__type-label">
                {{
                  kind === 'serial'
                    ? '串口'
                    : kind === 'tcp-client'
                      ? 'TCP 客户端'
                      : kind === 'tcp-server'
                        ? 'TCP 服务端'
                        : 'UDP'
                }}
              </div>
              <div class="new-connection-dialog__type-sub">
                {{ kind === 'serial' ? 'Serial' : kind === 'tcp-client' ? 'TCP Client' : kind === 'tcp-server' ? 'TCP Server' : 'UDP' }}
              </div>
            </q-card-section>
          </q-card>
        </div>
      </q-card-section>

      <!-- Step 2: Config form -->
      <q-card-section v-else class="new-connection-dialog__form">
        <q-form @submit.prevent="onSubmit">
          <q-input
            v-model="label"
            label="连接名称"
            dense
            outlined
          />

          <!-- Serial -->
          <template v-if="selectedKind === 'serial'">
            <q-select
              v-model="portPath"
              :options="serialPortOptions"
              label="端口"
              dense
              outlined
              emit-value
              map-options
            />
            <q-select
              v-model="baudRate"
              :options="BAUD_RATES"
              label="波特率"
              dense
              outlined
              emit-value
            />
          </template>

          <!-- TCP Client -->
          <template v-if="selectedKind === 'tcp-client'">
            <q-input
              v-model="tcpClientHost"
              label="主机地址"
              dense
              outlined
              :rules="[(v: string) => !!v || '请输入主机地址']"
            />
            <q-input
              v-model.number="tcpClientPort"
              label="端口"
              type="number"
              dense
              outlined
              :rules="[(v: number) => v > 0 && v <= 65535 || '端口范围 1-65535']"
            />
          </template>

          <!-- TCP Server -->
          <template v-if="selectedKind === 'tcp-server'">
            <q-input
              v-model="tcpServerHost"
              label="监听地址"
              dense
              outlined
            />
            <q-input
              v-model.number="tcpServerPort"
              label="监听端口"
              type="number"
              dense
              outlined
              :rules="[(v: number) => v > 0 && v <= 65535 || '端口范围 1-65535']"
            />
          </template>

          <!-- UDP -->
          <template v-if="selectedKind === 'udp'">
            <q-input
              v-model="udpLocalHost"
              label="本地地址"
              dense
              outlined
            />
            <q-input
              v-model.number="udpLocalPort"
              label="本地端口"
              type="number"
              dense
              outlined
              :rules="[(v: number) => v > 0 && v <= 65535 || '端口范围 1-65535']"
            />
            <q-input
              v-model="udpRemoteHost"
              label="远程地址（可选）"
              dense
              outlined
            />
            <q-input
              v-model.number="udpRemotePort"
              label="远程端口（可选）"
              type="number"
              dense
              outlined
            />
          </template>

          <!-- Shared autoConnect toggle -->
          <q-toggle
            v-model="autoConnect"
            label="自动连接"
            class="q-mt-sm"
          />

          <div class="new-connection-dialog__form-actions">
            <q-btn flat label="取消" @click="onCancel" />
            <q-btn
              unelevated
              color="primary"
              label="连接"
              type="submit"
              :loading="submitting"
            />
          </div>
        </q-form>
      </q-card-section>

      <q-card-section v-if="step === 'type'" class="new-connection-dialog__footer">
        <q-btn flat label="取消" @click="onCancel" />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
@use '../../../css/tokens' as tokens;

.new-connection-dialog__header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  padding: var(--rw-space-3) var(--rw-space-4);
}

.new-connection-dialog__types {
  padding: var(--rw-space-4);
}

.new-connection-dialog__type-grid {
  display: grid;
  gap: var(--rw-space-3);
  grid-template-columns: repeat(2, 1fr);
}

.new-connection-dialog__type-card {
  border-color: var(--rw-color-border-subtle);
  border-radius: var(--rw-radius-control);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;

  &:hover {
    background: var(--rw-color-surface-selected);
    border-color: var(--rw-color-action-primary);
  }
}

.new-connection-dialog__type-label {
  color: var(--rw-color-text-primary);
  font-size: var(--rw-font-size-body);
  font-weight: var(--rw-font-weight-semibold);
  margin-top: var(--rw-space-2);
}

.new-connection-dialog__type-sub {
  color: var(--rw-color-text-muted);
  font-size: var(--rw-font-size-caption);
}

.new-connection-dialog__form {
  display: flex;
  flex-direction: column;
  gap: var(--rw-space-3);
  padding: var(--rw-space-4);
}

.new-connection-dialog__form-actions {
  display: flex;
  gap: var(--rw-space-2);
  justify-content: flex-end;
  padding-top: var(--rw-space-3);
}

.new-connection-dialog__footer {
  display: flex;
  justify-content: flex-end;
  padding: var(--rw-space-2) var(--rw-space-4);
}
</style>
