<script setup lang="ts">
import { ref, shallowRef, watch, onMounted, onBeforeUnmount } from 'vue';
import { useQuasar } from 'quasar';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import { useAsyncAction, usePolling, useNotify } from '@/shared/composables';
import { formatDateTime } from '@/shared/utils/format';
import DataTable from '@/widgets/DataTable.vue';
import TableToolbar from '@/widgets/TableToolbar.vue';
import StatusBadge from '@/widgets/StatusBadge.vue';
import { useScoeConfig } from '@/features/command-ingress/composables/use-scoe-config';
import { useScoeMonitor } from '@/features/command-ingress/composables/use-scoe-monitor';
import { useTestTool } from '@/features/command-ingress/composables/use-test-tool';
import { useCentralDocking } from '@/features/command-ingress/composables/use-central-docking';
import { commandLogColumns } from '@/features/command-ingress/components/command-log-columns';
import { satelliteColumns, type SatelliteRow } from '@/features/command-ingress/components/satellite-columns';
import { dockingTaskColumns } from '@/features/command-ingress/components/docking-task-columns';
import { reportRecordColumns } from '@/features/command-ingress/components/report-record-columns';
import { healthStatusMap, linkTestStatusMap, commandResultMap } from '@/features/command-ingress/components/scoeStatusMap';
import {
  DOCKING_HTTPS_STATUS_MAP,
  DOCKING_HEARTBEAT_STATUS_MAP,
  DOCKING_DEVICE_STATUS_MAP,
  VERDICT_STATUS_MAP,
  SUB_SYS_TYPE_OPTIONS,
} from '@/features/command-ingress/components/docking-labels';
import { TASK_STATUS_MAP } from '@/features/task/components/taskStatusMap';
import { statsRow1, statsRow2 } from '@/features/command-ingress/components/ci-labels';
import type { SatelliteConfig, ScoeCommandConfig, HighlightRuleConfig } from '@/features/command-ingress/core';
import type { QTableColumn } from 'quasar';

const DEVICE_COLUMNS: QTableColumn[] = [
  { name: 'name', label: '设备名称', field: 'name', align: 'left', sortable: true },
  { name: 'deviceId', label: '设备ID', field: 'deviceId', align: 'left', sortable: true },
  { name: 'type', label: '类型', field: 'type', align: 'center', sortable: true, style: 'width: 80px', headerStyle: 'width: 80px' },
  { name: 'ip', label: 'IP', field: 'ip', align: 'left', sortable: true },
  { name: 'status', label: '状态', field: 'status', align: 'center', sortable: true, style: 'width: 100px', headerStyle: 'width: 100px' },
];

const $q = useQuasar();
const notify = useNotify();
const runtime = useRewriteRuntime();
const service = runtime.features.commandIngressService;
const northboundService = runtime.features.northboundService;
const taskService = runtime.features.taskService;
const resultService = runtime.features.resultService;

// ===== Tab state =====
const activeTab = ref('monitor');

// ===== Composables =====
const scoeConfig = useScoeConfig();
const monitor = useScoeMonitor(service);
const testTool = useTestTool(service, () => '');
const docking = useCentralDocking(northboundService, taskService, resultService);

// ===== Actions =====
const { execute, isOperating } = useAsyncAction();

// ===== Polling =====
function refreshAll(): void {
  monitor.refresh();
  docking.refresh();
  if (isTestRecording.value) {
    testTool.refreshRecords();
  }
}

const polling = usePolling(refreshAll, 1000);

// ===== Highlight dialog =====
const editingHighlightRules = shallowRef<HighlightRuleConfig[]>([]);

// ===== Title bar actions =====
async function handleConnect(): Promise<void> {
  await execute('connect', async () => {
    notify.success('已连接');
  });
}

async function handleDisconnect(): Promise<void> {
  await execute('disconnect', async () => {
    notify.success('已断开');
  });
}

async function handleLoadSatellite(): Promise<void> {
  const satelliteId = scoeConfig.selectedConfigId.value;
  if (!satelliteId) return;
  await execute('load', async () => {
    const result = await service.loadSatellite(satelliteId);
    if (result.success) {
      notify.success(`卫星 ${satelliteId} 已加载`);
    } else {
      notify.error('加载失败', result.error);
    }
  });
}

async function handleUnloadSatellite(): Promise<void> {
  await execute('unload', async () => {
    const result = await service.unloadSatellite();
    if (result.success) {
      notify.success('已卸载卫星');
    } else {
      notify.error('卸载失败', result.error);
    }
  });
}

async function handleSaveConfig(): Promise<void> {
  await execute('save-config', async () => {
    await scoeConfig.saveConfigs();
    notify.success('配置已保存');
  });
}

// ===== SCOE Config tab actions =====
function handleDeleteSatellite(satelliteId: string): void {
  $q.dialog({
    title: '确认删除',
    message: `确定要删除卫星配置「${satelliteId}」吗？此操作不可恢复。`,
    cancel: true,
    persistent: false,
  }).onOk(() => {
    scoeConfig.removeSatellite(satelliteId);
  });
}

function handleDuplicateSatellite(satelliteId: string): void {
  scoeConfig.duplicateSatellite(satelliteId);
}

// ===== Test tool actions =====
async function handleSendHex(): Promise<void> {
  await execute('send-hex', async () => {
    await testTool.sendHex();
    notify.success('数据已发送');
  });
}

function handleClearTestRecords(): void {
  $q.dialog({
    title: '确认清空',
    message: '确定要清空所有接收数据吗？此操作不可恢复。',
    cancel: true,
    persistent: false,
  }).onOk(() => {
    testTool.clearRecords();
  });
}

function handleClearCommandLog(): void {
  $q.dialog({
    title: '确认清空',
    message: '确定要清空所有命令记录吗？此操作不可恢复。',
    cancel: true,
    persistent: false,
  }).onOk(() => {
    monitor.clearCommandLog();
  });
}

async function handleSaveHighlightRules(rules: HighlightRuleConfig[]): Promise<void> {
  await execute('save-highlight', async () => {
    testTool.saveHighlightRules(rules);
    testTool.showHighlightDialog.value = false;
    notify.success('高亮规则已保存');
  });
}

function handleDeleteHighlightRule(ruleId: string): void {
  $q.dialog({
    title: '确认删除',
    message: '确定要删除此高亮规则吗？',
    cancel: true,
    persistent: false,
  }).onOk(() => {
    editingHighlightRules.value = editingHighlightRules.value.filter(
      (r) => r.id !== ruleId,
    );
  });
}

function openHighlightDialog(): void {
  editingHighlightRules.value = [...testTool.highlightRules.value];
  testTool.showHighlightDialog.value = true;
}

// ===== Docking handlers =====
function handleStopDockingTask(instanceId: string): void {
  $q.dialog({
    title: '确认停止',
    message: '确定要停止该任务吗？',
    cancel: true,
    persistent: false,
  }).onOk(() => {
    docking.stopTask(instanceId);
  });
}

function addHighlightRule(): void {
  editingHighlightRules.value = [
    ...editingHighlightRules.value,
    { id: `rule_${Date.now()}`, offset: 0, length: 1, severity: 'info' },
  ];
}

// ===== Stats panel helpers =====
function getStatsDisplay(key: string): string | number {
  const stats = monitor.statistics.value;
  const status = monitor.runtimeStatus.value;
  switch (key) {
    case 'runtimeSeconds': return stats.runtimeSeconds || '—';
    case 'satelliteIdRuntimeSeconds': return stats.satelliteIdRuntimeSeconds || '—';
    case 'commandReceiveCount': return stats.commandReceiveCount;
    case 'commandSuccessCount': return stats.commandSuccessCount;
    case 'commandErrorCount': return stats.commandErrorCount;
    case 'lastCommandCode': return status.lastCommandCode || '—';
    case 'lastErrorReason': return stats.lastErrorReason || '—';
    case 'loadedSatelliteId': return status.loadedSatelliteId || '—';
    default: return '—';
  }
}

function isStatusKey(key: string): boolean {
  return key === 'healthStatus' || key === 'linkTestResult';
}

function getStatusMap(key: string): Record<string, { label: string; color: string }> {
  return key === 'healthStatus' ? healthStatusMap : linkTestStatusMap;
}

function getStatusValue(key: string): string {
  const status = monitor.runtimeStatus.value;
  return key === 'healthStatus' ? status.healthStatus : status.linkTestResult;
}

// ===== Config search =====
const configSearch = ref('');

// ===== Test tool recording state =====
const isTestRecording = ref(true);

// ===== Docking inner tabs =====
const dockingInnerTab = ref('tasks');

// ===== SCOE Config edit form =====
const editForm = ref({
  messageIdentifier: '',
  sourceIdentifier: '',
  destinationIdentifier: '',
  modelId: '',
});

function syncEditForm(): void {
  const config = scoeConfig.selectedConfig.value;
  if (!config) return;
  editForm.value = {
    messageIdentifier: config.messageIdentifier,
    sourceIdentifier: config.sourceIdentifier,
    destinationIdentifier: config.destinationIdentifier,
    modelId: config.modelId,
  };
}

watch(scoeConfig.selectedConfigId, () => {
  syncEditForm();
});

// ===== Format helpers =====
function formatCommandCode(code: number): string {
  return `0x${code.toString(16).toUpperCase().padStart(2, '0')}`;
}

function formatDuration(ms: number | undefined | null): string {
  if (ms === undefined || ms === null) return '—';
  return `${ms} ms`;
}

// ===== Add satellite =====
function handleAddSatellite(): void {
  const newId = `SAT_${Date.now()}`;
  const newConfig: SatelliteConfig = {
    satelliteId: newId,
    messageIdentifier: '',
    sourceIdentifier: '',
    destinationIdentifier: '',
    modelId: '',
    commandConfigs: [],
  };
  scoeConfig.addSatellite(newConfig);
  scoeConfig.selectSatellite(newId);
}

// ===== Import/Export config stubs =====
function handleImportConfig(): void {
  notify.info('导入功能需要文件系统支持，待实现');
}

function handleExportConfig(): void {
  notify.info('导出功能需要文件系统支持，待实现');
}

// ===== SCOE Config right panel handlers =====
function handleAddCommand(): void {
  const config = scoeConfig.selectedConfig.value;
  if (!config) return;
  const newCmd: ScoeCommandConfig = {
    id: `cmd_${Date.now()}`,
    label: '新命令',
    code: '',
    function: 'send_frame',
    checksums: [],
  };
  scoeConfig.updateSatellite(config.satelliteId, {
    ...config,
    commandConfigs: [...config.commandConfigs, newCmd],
  });
}

function handleSaveSatelliteConfig(): void {
  const config = scoeConfig.selectedConfig.value;
  if (!config) return;
  scoeConfig.updateSatellite(config.satelliteId, {
    ...config,
    messageIdentifier: editForm.value.messageIdentifier,
    sourceIdentifier: editForm.value.sourceIdentifier,
    destinationIdentifier: editForm.value.destinationIdentifier,
    modelId: editForm.value.modelId,
  });
  notify.success('配置已更新');
}

// ===== Test tool recording controls =====
function startTestRecording(): void {
  isTestRecording.value = true;
}

function stopTestRecording(): void {
  isTestRecording.value = false;
}

// ===== Lifecycle =====
onMounted(() => {
  scoeConfig.loadConfigs();
  syncEditForm();
  polling.start();
});

onBeforeUnmount(() => {
  polling.stop();
});
</script>

<template>
  <q-page class="command-ingress-page p-6 min-h-full">
    <!-- Title bar -->
    <div class="command-ingress-page__header mb-4">
      <h1 class="command-ingress-page__title">指令接入</h1>
      <div class="flex gap-2">
        <q-btn
          unelevated
          color="primary"
          label="连接"
          :loading="isOperating('connect')"
          @click="handleConnect"
        />
        <q-btn
          unelevated
          color="primary"
          label="断开"
          :loading="isOperating('disconnect')"
          @click="handleDisconnect"
        />
        <q-btn
          unelevated
          color="primary"
          :label="service.isScoeFramesLoaded() ? '卸载' : '加载'"
          :loading="isOperating('load') || isOperating('unload')"
          :disable="!scoeConfig.selectedConfigId.value && !service.isScoeFramesLoaded()"
          @click="service.isScoeFramesLoaded() ? handleUnloadSatellite() : handleLoadSatellite()"
        />
        <q-btn
          unelevated
          color="primary"
          label="保存配置"
          :loading="scoeConfig.isSaving.value"
          @click="handleSaveConfig"
        />
      </div>
    </div>

    <!-- Tabs -->
    <q-tabs v-model="activeTab" class="text-primary">
      <q-tab name="monitor" label="SCOE 运行与测试" />
      <q-tab name="config" label="SCOE 配置" />
      <q-tab name="docking" label="中心对接" />
    </q-tabs>

    <q-separator />

    <!-- Tab panels with keep-alive -->
    <q-tab-panels v-model="activeTab" animated keep-alive>
      <!-- Tab 1: SCOE Monitor + Test -->
      <q-tab-panel name="monitor" class="p-0 pt-4">
        <!-- Stats panel: grid 5 cols × 2 rows -->
        <div class="grid grid-cols-5 gap-3 mb-4">
          <template v-for="rowLabels in [statsRow1, statsRow2]" :key="rowLabels[0].key">
            <div
              v-for="item in rowLabels"
              :key="item.key"
              class="rw-panel-base rounded p-3"
            >
              <div class="rw-text-label text-xs mb-1">{{ item.label }}</div>
              <template v-if="isStatusKey(item.key)">
                <StatusBadge
                  :status="getStatusValue(item.key)"
                  :status-map="getStatusMap(item.key)"
                />
              </template>
              <template v-else>
                <div class="rw-text-value text-sm">{{ getStatsDisplay(item.key) }}</div>
              </template>
            </div>
          </template>
        </div>

        <!-- Main content: left command log, right test tool -->
        <div class="flex gap-4 min-h-100">
          <!-- Command log -->
          <div class="flex-1">
            <div class="flex items-center justify-between mb-2">
              <span class="rw-text-label text-sm">命令执行日志</span>
              <q-btn
                flat
                dense
                icon="o_delete_sweep"
                color="grey"
                size="sm"
                @click="handleClearCommandLog"
              >
                <q-tooltip>清空日志</q-tooltip>
              </q-btn>
            </div>
            <DataTable
              :columns="commandLogColumns"
              :rows="monitor.commandLog.value"
              row-key="id"
              virtual-scroll
              :virtual-scroll-item-size="48"
              container-height="calc(100vh - 460px)"
            >
              <template #body-cell-commandCode="props">
                <q-td :props="props">
                  <span class="font-mono">{{ formatCommandCode(props.value) }}</span>
                </q-td>
              </template>
              <template #body-cell-result="props">
                <q-td :props="props">
                  <StatusBadge :status="props.value" :status-map="commandResultMap" />
                </q-td>
              </template>
              <template #body-cell-durationMs="props">
                <q-td :props="props">
                  <span class="rw-text-value">{{ formatDuration(props.value) }}</span>
                </q-td>
              </template>
              <template #no-data>
                <div class="text-center p-4 rw-text-desc">暂无命令记录</div>
              </template>
            </DataTable>
          </div>

          <!-- Test tool -->
          <div class="w-80 min-w-80 flex flex-col gap-3">
            <!-- Receive area -->
            <div class="rw-panel-base rounded p-3 flex-1 flex flex-col">
              <div class="flex items-center justify-between mb-2">
                <span class="rw-text-label text-sm">接收数据</span>
                <div class="flex gap-1">
                  <q-btn
                    flat
                    dense
                    icon="o_highlight"
                    color="grey"
                    size="sm"
                    @click="openHighlightDialog"
                  >
                    <q-tooltip>高亮配置</q-tooltip>
                  </q-btn>
                  <q-btn
                    flat
                    dense
                    icon="o_play_arrow"
                    color="positive"
                    size="sm"
                    :disable="isTestRecording"
                    @click="startTestRecording"
                  >
                    <q-tooltip>开始</q-tooltip>
                  </q-btn>
                  <q-btn
                    flat
                    dense
                    icon="o_stop"
                    color="warning"
                    size="sm"
                    :disable="!isTestRecording"
                    @click="stopTestRecording"
                  >
                    <q-tooltip>停止</q-tooltip>
                  </q-btn>
                  <q-btn
                    flat
                    dense
                    icon="o_delete_sweep"
                    color="grey"
                    size="sm"
                    @click="handleClearTestRecords"
                  >
                    <q-tooltip>清空</q-tooltip>
                  </q-btn>
                </div>
              </div>
              <div
                v-if="testTool.records.value.length === 0"
                class="text-center p-4 rw-text-desc flex-1 flex items-center justify-center"
              >
                暂无接收数据
              </div>
              <q-virtual-scroll
                v-else
                :items="testTool.records.value"
                virtual-scroll-item-size="28"
                class="flex-1"
                :style="{ maxHeight: '300px' }"
              >
                <template #default="{ item: record, index }">
                  <div :key="index" class="flex items-center py-1 rw-divider-b font-mono text-xs">
                    <span class="rw-text-desc w-[100px] flex-shrink-0">{{ formatDateTime(new Date(record.timestamp).toISOString()) }}</span>
                    <span class="rw-text-value flex-1 truncate">{{ String(record.data) }}</span>
                    <q-btn flat round dense icon="o_check_circle" size="xs" color="positive" />
                  </div>
                </template>
              </q-virtual-scroll>
            </div>

            <!-- Send area -->
            <div class="rw-panel-base rounded p-3">
              <span class="rw-text-label text-sm">发送数据</span>
              <q-input
                v-model="testTool.hexInput.value"
                type="textarea"
                dense
                rows="3"
                placeholder="输入 HEX 数据"
                class="font-mono mt-2"
              />
              <q-btn
                unelevated
                color="primary"
                label="发送"
                class="full-width mt-2"
                :loading="testTool.isSending.value"
                :disable="!testTool.hexInput.value.trim()"
                @click="handleSendHex"
              />
            </div>
          </div>
        </div>
      </q-tab-panel>

      <!-- Tab 2: SCOE Config -->
      <q-tab-panel name="config" class="p-0 pt-4">
        <div class="flex gap-4">
          <!-- Left: satellite list -->
          <div class="w-70 min-w-70">
            <TableToolbar
              v-model:search-model-value="configSearch"
              search-placeholder="搜索卫星..."
            >
              <template #actions>
                <q-btn flat dense icon="o_add" color="primary" size="sm" @click="handleAddSatellite">
                  <q-tooltip>添加卫星</q-tooltip>
                </q-btn>
                <q-btn flat dense icon="o_file_upload" color="primary" size="sm" @click="handleImportConfig">
                  <q-tooltip>导入</q-tooltip>
                </q-btn>
                <q-btn flat dense icon="o_file_download" color="primary" size="sm" @click="handleExportConfig">
                  <q-tooltip>导出</q-tooltip>
                </q-btn>
              </template>
            </TableToolbar>
            <DataTable
              :columns="satelliteColumns"
              :rows="scoeConfig.satelliteConfigs.value"
              row-key="satelliteId"
              selection="single"
              :selected="scoeConfig.selectedConfigId.value ? [{ satelliteId: scoeConfig.selectedConfigId.value }] : []"
              container-height="calc(100vh - 300px)"
              @update:selected="(rows: Record<string, unknown>[]) => rows.length > 0 && scoeConfig.selectSatellite((rows[0] as SatelliteRow).satelliteId)"
              @row-click="(row: Record<string, unknown>) => scoeConfig.selectSatellite((row as SatelliteRow).satelliteId)"
            >
              <template #body-cell-actions="props">
                <q-td :props="props">
                  <q-btn
                    flat
                    dense
                    icon="o_content_copy"
                    color="grey"
                    size="xs"
                    @click.stop="handleDuplicateSatellite((props.row as SatelliteRow).satelliteId)"
                  >
                    <q-tooltip>复制</q-tooltip>
                  </q-btn>
                  <q-btn
                    flat
                    dense
                    icon="o_delete"
                    color="grey"
                    size="xs"
                    @click.stop="handleDeleteSatellite((props.row as SatelliteRow).satelliteId)"
                  >
                    <q-tooltip>删除</q-tooltip>
                  </q-btn>
                </q-td>
              </template>
              <template #no-data>
                <div class="text-center p-4 rw-text-desc">暂无卫星配置</div>
              </template>
            </DataTable>
          </div>

          <!-- Right: edit area -->
          <div class="flex-1">
            <template v-if="scoeConfig.selectedConfig.value">
              <div class="rw-panel-base rounded p-4">
                <h3 class="text-subtitle1 rw-text-value m-0 mb-4">
                  {{ scoeConfig.selectedConfig.value.satelliteId }}
                </h3>

                <!-- Satellite basic info -->
                <div class="flex flex-col gap-3">
                  <q-input
                    v-model="editForm.messageIdentifier"
                    dense outlined
                    label="消息标识"
                    :rules="[val => !!val || '请输入消息标识']"
                  />
                  <q-input
                    v-model="editForm.sourceIdentifier"
                    dense outlined
                    label="源标识"
                    :rules="[val => !!val || '请输入源标识']"
                  />
                  <q-input
                    v-model="editForm.destinationIdentifier"
                    dense outlined
                    label="目标标识"
                    :rules="[val => !!val || '请输入目标标识']"
                  />
                  <q-input
                    v-model="editForm.modelId"
                    dense outlined
                    label="型号标识"
                    :rules="[val => !!val || '请输入型号标识']"
                  />
                </div>

                <q-separator class="my-4" />

                <!-- Command configs -->
                <div>
                  <div class="flex items-center justify-between mb-2">
                    <span class="rw-text-label text-sm">命令配置</span>
                    <q-btn flat dense no-caps icon="o_add" label="添加命令" size="sm" color="primary" @click="handleAddCommand" />
                  </div>

                  <template v-if="scoeConfig.selectedConfig.value.commandConfigs.length > 0">
                    <q-expansion-item
                      v-for="cmd in scoeConfig.selectedConfig.value.commandConfigs"
                      :key="cmd.id"
                      dense
                      switch-toggle-side
                      :label="cmd.label || cmd.code"
                      :caption="cmd.function"
                      header-class="rw-text-value text-sm"
                    >
                      <div class="rw-text-desc text-xs p-3">
                        命令详细编辑待实现（功能码: {{ cmd.code }}）
                      </div>
                    </q-expansion-item>
                  </template>
                  <div v-else class="rw-text-desc text-xs text-center p-4">暂无命令配置</div>
                </div>

                <q-separator class="my-4" />

                <div class="flex justify-end">
                  <q-btn
                    unelevated no-caps color="primary"
                    label="保存"
                    :loading="scoeConfig.isSaving.value"
                    @click="handleSaveSatelliteConfig"
                  />
                </div>
              </div>
            </template>
            <template v-else>
              <div class="rw-panel-base rounded p-8 text-center">
                <q-icon name="o_settings" size="48px" color="grey" />
                <p class="rw-text-desc mt-4">请从左侧选择一个卫星配置进行编辑</p>
              </div>
            </template>
          </div>
        </div>
      </q-tab-panel>

      <!-- Tab 3: Central Docking -->
      <q-tab-panel name="docking" class="p-0 pt-4">
        <!-- Status bar -->
        <div class="flex gap-4 mb-4">
          <div class="flex items-center gap-2">
            <span class="rw-text-label text-sm">HTTPS:</span>
            <StatusBadge :status="docking.connectionState.value.https" :status-map="DOCKING_HTTPS_STATUS_MAP" />
          </div>
          <div class="flex items-center gap-2">
            <span class="rw-text-label text-sm">心跳:</span>
            <StatusBadge :status="docking.connectionState.value.heartbeat" :status-map="DOCKING_HEARTBEAT_STATUS_MAP" />
          </div>
          <div class="flex items-center gap-2">
            <span class="rw-text-label text-sm">设备:</span>
            <StatusBadge :status="docking.connectionState.value.device" :status-map="DOCKING_DEVICE_STATUS_MAP" />
          </div>
          <div class="flex-1" />
          <template v-if="docking.isActive.value">
            <q-btn
              unelevated
              color="negative"
              label="断开"
              :loading="docking.isDisconnecting.value"
              @click="docking.disconnect()"
            />
          </template>
          <template v-else>
            <q-btn
              unelevated
              color="primary"
              label="对接配置"
              @click="docking.showConfigDialog.value = true"
            />
          </template>
          <q-btn
            unelevated
            color="primary"
            label="上报记录"
            :disable="docking.reportRecords.value.length === 0"
            @click="docking.showReportDialog.value = true"
          />
        </div>

        <q-separator class="mb-4" />

        <!-- Internal tabs -->
        <q-tabs v-model="dockingInnerTab" dense inline-label class="text-primary mb-4">
          <q-tab name="tasks" label="任务列表" no-caps />
          <q-tab name="devices" label="设备列表" no-caps />
        </q-tabs>

        <!-- Task list tab -->
        <div v-if="dockingInnerTab === 'tasks'">
          <DataTable
            :columns="dockingTaskColumns"
            :rows="docking.dockingTasks.value"
            row-key="instanceId"
          >
            <template #body-cell-lifecycle="props">
              <q-td :props="props">
                <StatusBadge :status="props.value" :status-map="TASK_STATUS_MAP" />
              </q-td>
            </template>
            <template #body-cell-startedAt="props">
              <q-td :props="props">
                <span class="rw-text-value">{{ props.value ? formatDateTime(props.value) : '—' }}</span>
              </q-td>
            </template>
            <template #body-cell-actions="props">
              <q-td :props="props">
                <q-btn
                  flat
                  dense
                  icon="o_stop"
                  color="negative"
                  size="xs"
                  :disable="!['running', 'created', 'paused'].includes(props.row.lifecycle)"
                  @click="handleStopDockingTask(props.row.instanceId)"
                >
                  <q-tooltip>停止任务</q-tooltip>
                </q-btn>
              </q-td>
            </template>
            <template #no-data>
              <div class="text-center p-4 rw-text-desc">暂无活跃任务</div>
            </template>
          </DataTable>
        </div>

        <!-- Device list tab -->
        <div v-else>
          <DataTable
            :columns="DEVICE_COLUMNS"
            :rows="docking.devices.value"
            row-key="deviceId"
          >
            <template #body-cell-status="props">
              <q-td :props="props">
                <StatusBadge :status="props.value" :status-map="DOCKING_DEVICE_STATUS_MAP" />
              </q-td>
            </template>
            <template #no-data>
              <div class="text-center p-4 rw-text-desc">暂无设备</div>
            </template>
          </DataTable>
        </div>

        <!-- Docking config dialog -->
        <q-dialog v-model="docking.showConfigDialog.value">
          <q-card class="rw-dialog-lg">
            <q-card-section>
              <div class="text-h6">对接配置</div>
            </q-card-section>
            <q-card-section class="rw-dialog-scroll-body">
              <q-form @submit.prevent="docking.saveConfigAndConnect()">
                <!-- Server config -->
                <div class="rw-text-label text-sm mb-2">服务器配置</div>
                <div class="flex gap-3 mb-2">
                  <q-input
                    v-model="docking.config.serverHost"
                    dense outlined
                    label="监听地址"
                    class="flex-1"
                    :rules="[val => !!val || '请输入监听地址']"
                  />
                  <q-input
                    v-model.number="docking.config.serverPort"
                    dense outlined
                    label="监听端口"
                    type="number"
                    class="w-32"
                    :rules="[val => !!val || '请输入端口']"
                  />
                </div>
                <q-input
                  v-model="docking.config.customerBaseUrl"
                  dense outlined
                  label="甲方地址"
                  placeholder="http://ip/partner-api/"
                  class="mb-2"
                  :rules="[val => !!val || '请输入甲方地址']"
                />
                <div class="flex gap-3 mb-2">
                  <q-select
                    v-model="docking.config.subSysType"
                    :options="SUB_SYS_TYPE_OPTIONS"
                    dense outlined
                    label="子系统类型"
                    emit-value
                    map-options
                    class="flex-1"
                  />
                  <q-input
                    v-model="docking.config.subSysId"
                    dense outlined
                    label="子系统ID"
                    placeholder="LAS_001"
                    class="flex-1"
                    :rules="[val => !!val || '请输入子系统ID']"
                  />
                </div>

                <q-separator class="my-4" />

                <!-- Auth config -->
                <q-expansion-item
                  dense
                  switch-toggle-side
                  label="认证配置"
                  caption="OAuth/JWT"
                  header-class="rw-text-label text-sm"
                  class="mb-2"
                >
                  <div class="flex flex-col gap-2 pt-2">
                    <q-input
                      v-model="docking.config.loginUrl"
                      dense outlined
                      label="认证地址"
                      :placeholder="`${docking.config.customerBaseUrl}auth/partner/login`"
                    />
                    <q-input
                      v-model="docking.config.clientId"
                      dense outlined
                      label="Client ID"
                    />
                    <q-input
                      v-model="docking.config.username"
                      dense outlined
                      label="用户名"
                    />
                    <q-input
                      v-model="docking.config.password"
                      dense outlined
                      label="密码"
                      type="password"
                    />
                    <div class="flex gap-3">
                      <q-input
                        v-model="docking.config.grantType"
                        dense outlined
                        label="Grant Type"
                        readonly
                        class="flex-1"
                      />
                      <q-input
                        v-model="docking.config.tenantId"
                        dense outlined
                        label="Tenant ID"
                        readonly
                        class="flex-1"
                      />
                    </div>
                  </div>
                </q-expansion-item>
              </q-form>
            </q-card-section>
            <q-card-actions align="right">
              <q-btn flat label="取消" @click="docking.showConfigDialog.value = false" />
              <q-btn
                unelevated
                color="primary"
                label="保存并连接"
                :loading="docking.isConnecting.value"
                @click="docking.saveConfigAndConnect()"
              />
            </q-card-actions>
          </q-card>
        </q-dialog>

        <!-- Report dialog -->
        <q-dialog v-model="docking.showReportDialog.value">
          <q-card class="rw-dialog-lg">
            <q-card-section>
              <div class="text-h6">上报记录</div>
            </q-card-section>
            <q-card-section class="rw-dialog-scroll-body">
              <div class="flex gap-4 mb-4">
                <div class="rw-panel-base rounded p-3 flex-1 text-center">
                  <div class="rw-text-label text-xs mb-1">已上报</div>
                  <div class="rw-text-value text-lg">{{ docking.reportRecords.value.length }}</div>
                </div>
                <div class="rw-panel-base rounded p-3 flex-1 text-center">
                  <div class="rw-text-label text-xs mb-1">通过</div>
                  <div class="rw-text-value text-lg text-positive">
                    {{ docking.reportRecords.value.filter(r => r.verdict === 'passed').length }}
                  </div>
                </div>
                <div class="rw-panel-base rounded p-3 flex-1 text-center">
                  <div class="rw-text-label text-xs mb-1">失败</div>
                  <div class="rw-text-value text-lg text-negative">
                    {{ docking.reportRecords.value.filter(r => r.verdict === 'failed').length }}
                  </div>
                </div>
              </div>
              <DataTable
                :columns="reportRecordColumns"
                :rows="docking.reportRecords.value"
                row-key="reportedAt"
              >
                <template #body-cell-verdict="props">
                  <q-td :props="props">
                    <StatusBadge :status="props.value" :status-map="VERDICT_STATUS_MAP" />
                  </q-td>
                </template>
                <template #body-cell-reportedAt="props">
                  <q-td :props="props">
                    <span class="rw-text-value">{{ formatDateTime(props.value) }}</span>
                  </q-td>
                </template>
                <template #no-data>
                  <div class="text-center p-4 rw-text-desc">暂无上报记录</div>
                </template>
              </DataTable>
            </q-card-section>
            <q-card-actions align="right">
              <q-btn flat label="关闭" @click="docking.showReportDialog.value = false" />
            </q-card-actions>
          </q-card>
        </q-dialog>
      </q-tab-panel>
    </q-tab-panels>

    <!-- Highlight config dialog -->
    <q-dialog v-model="testTool.showHighlightDialog.value" @hide="editingHighlightRules = []">
      <q-card class="rw-dialog-md">
        <q-card-section>
          <div class="text-h6">高亮规则配置</div>
        </q-card-section>
        <q-card-section class="rw-dialog-scroll-body">
          <div
            v-for="rule in editingHighlightRules"
            :key="rule.id"
            class="flex items-center gap-2 mb-2"
          >
            <q-input
              :model-value="String(rule.offset)"
              dense
              label="起始"
              type="number"
              class="w-20"
              @update:model-value="(val: string | number | null) => {
                const idx = editingHighlightRules.findIndex((r) => r.id === rule.id);
                if (idx >= 0) {
                  const next = [...editingHighlightRules];
                  next[idx] = { ...next[idx], offset: Number(val) || 0 };
                  editingHighlightRules = next;
                }
              }"
            />
            <q-input
              :model-value="String(rule.length)"
              dense
              label="长度"
              type="number"
              class="w-20"
              @update:model-value="(val: string | number | null) => {
                const idx = editingHighlightRules.findIndex((r) => r.id === rule.id);
                if (idx >= 0) {
                  const next = [...editingHighlightRules];
                  next[idx] = { ...next[idx], length: Number(val) || 1 };
                  editingHighlightRules = next;
                }
              }"
            />
            <q-select
              :model-value="rule.severity"
              :options="(['info', 'warning', 'negative', 'positive'] as const)"
              dense
              label="颜色"
              emit-value
              class="w-25"
              @update:model-value="(val) => {
                const idx = editingHighlightRules.findIndex((r) => r.id === rule.id);
                if (idx >= 0) {
                  const next = [...editingHighlightRules];
                  next[idx] = { ...next[idx], severity: val as HighlightRuleConfig['severity'] };
                  editingHighlightRules = next;
                }
              }"
            />
            <q-btn
              flat
              dense
              icon="o_delete"
              color="grey"
              size="sm"
              @click="handleDeleteHighlightRule(rule.id)"
            />
          </div>
          <q-btn
            flat
            dense
            icon="o_add"
            color="primary"
            label="添加规则"
            @click="addHighlightRule"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="取消" @click="testTool.showHighlightDialog.value = false" />
          <q-btn
            unelevated
            color="primary"
            label="保存"
            :loading="isOperating('save-highlight')"
            @click="handleSaveHighlightRules(editingHighlightRules)"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<style scoped lang="scss">
@use '../css/tokens' as tokens;

.command-ingress-page {
  background: var(--rw-color-surface-app);
}

.command-ingress-page__header {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.command-ingress-page__title {
  color: var(--rw-color-text-primary);
  font-size: var(--rw-font-size-title-lg);
  font-weight: var(--rw-font-weight-semibold);
  line-height: var(--rw-line-height-title-lg);
  margin: 0;
}

@media (max-width: tokens.rw-breakpoint('page-compact')) {
  .command-ingress-page {
    padding: var(--rw-space-4);
  }
}
</style>
