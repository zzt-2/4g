<script setup lang="ts">
import { ref, shallowRef, onMounted, onBeforeUnmount } from 'vue';
import { useQuasar } from 'quasar';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import { useAsyncAction, usePolling, useNotify } from '@/shared/composables';
import DataTable from '@/widgets/DataTable.vue';
import TableToolbar from '@/widgets/TableToolbar.vue';
import StatusBadge from '@/widgets/StatusBadge.vue';
import { useScoeConfig } from '@/features/command-ingress/composables/use-scoe-config';
import { useScoeMonitor } from '@/features/command-ingress/composables/use-scoe-monitor';
import { useTestTool } from '@/features/command-ingress/composables/use-test-tool';
import { useCentralDocking } from '@/features/command-ingress/composables/use-central-docking';
import { useTaskReport } from '@/features/command-ingress/composables/use-task-report';
import { commandLogColumns } from '@/features/command-ingress/components/command-log-columns';
import { satelliteColumns, type SatelliteRow } from '@/features/command-ingress/components/satellite-columns';
import { dockingTaskColumns } from '@/features/command-ingress/components/docking-task-columns';
import { healthStatusMap, linkTestStatusMap, commandResultMap } from '@/features/command-ingress/components/scoeStatusMap';
import { statsRow1, statsRow2 } from '@/features/command-ingress/components/ci-labels';
import type { HighlightRuleConfig } from '@/features/command-ingress';

// P3-7: Extracted docking status maps
const DOCKING_HTTPS_STATUS_MAP: Record<string, { label: string; color: string }> = {
  unknown: { label: '未连接', color: 'grey' },
  connected: { label: '已连接', color: 'positive' },
  disconnected: { label: '已断开', color: 'warning' },
  error: { label: '错误', color: 'negative' },
};
const DOCKING_HEARTBEAT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  unknown: { label: '未知', color: 'grey' },
  active: { label: '活跃', color: 'positive' },
  inactive: { label: '静止', color: 'warning' },
};
const DOCKING_DEVICE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  unknown: { label: '离线', color: 'grey' },
  online: { label: '在线', color: 'positive' },
  offline: { label: '离线', color: 'negative' },
};

const $q = useQuasar();
const notify = useNotify();
const runtime = useRewriteRuntime();
const service = runtime.features.commandIngressService;

// ===== Tab state =====
const activeTab = ref('monitor');

// ===== Composables =====
const scoeConfig = useScoeConfig();
const monitor = useScoeMonitor(service);
const testTool = useTestTool(service, () => '');
const docking = useCentralDocking();
const taskReport = useTaskReport();

// ===== Actions =====
const { execute, isOperating } = useAsyncAction();

// ===== Polling =====
function refreshAll(): void {
  monitor.refresh();
  testTool.refreshRecords();
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

function handleSaveHighlightRules(rules: HighlightRuleConfig[]): void {
  testTool.saveHighlightRules(rules);
  testTool.showHighlightDialog.value = false;
  notify.success('高亮规则已保存');
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

// ===== Format helpers =====
function formatCommandCode(code: number): string {
  return `0x${code.toString(16).toUpperCase().padStart(2, '0')}`;
}

function formatDuration(ms: number | undefined | null): string {
  if (ms === undefined || ms === null) return '—';
  return `${ms} ms`;
}

// ===== Lifecycle =====
onMounted(() => {
  scoeConfig.loadConfigs();
  polling.start();
});

onBeforeUnmount(() => {
  polling.stop();
});
</script>

<template>
  <q-page class="command-ingress-page">
    <!-- Title bar -->
    <div class="command-ingress-page__header">
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
                <div class="text-center q-pa-lg rw-text-desc">暂无命令记录</div>
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
                class="text-center q-pa-lg rw-text-desc flex-1 flex items-center justify-center"
              >
                暂无接收数据
              </div>
              <div
                v-else
                class="flex-1 overflow-auto max-h-50"
              >
                <div
                  v-for="(record, idx) in testTool.records.value"
                  :key="`${record.timestamp}_${idx}`"
                  class="font-mono text-xs rw-text-value py-1 rw-divider-b"
                >
                  {{ String(record.data) }}
                </div>
              </div>
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
                <q-btn flat dense icon="add" color="primary" size="sm">
                  <q-tooltip>添加卫星</q-tooltip>
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
                <div class="text-center q-pa-lg rw-text-desc">暂无卫星配置</div>
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
                <div class="rw-text-desc">配置编辑区域（待实现）</div>
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

      <!-- Tab 3: Central Docking (stub) -->
      <q-tab-panel name="docking" class="p-0 pt-4">
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
          <q-btn unelevated color="primary" label="对接配置" :loading="docking.isConfiguring.value" disable />
          <q-btn unelevated color="primary" label="任务上报" :loading="taskReport.isReporting.value" disable />
        </div>

        <q-separator class="mb-4" />

        <DataTable
          :columns="dockingTaskColumns"
          :rows="docking.tasks.value"
          row-key="taskId"
        >
          <template #no-data>
            <div class="text-center q-pa-lg rw-text-desc">功能开发中</div>
          </template>
        </DataTable>
      </q-tab-panel>
    </q-tab-panels>

    <!-- Highlight config dialog -->
    <q-dialog v-model="testTool.showHighlightDialog.value">
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
              :options="(['info', 'warning', 'error'] as const)"
              dense
              label="颜色"
              emit-value
              class="w-25"
              @update:model-value="(val: 'info' | 'warning' | 'error') => {
                const idx = editingHighlightRules.findIndex((r) => r.id === rule.id);
                if (idx >= 0) {
                  const next = [...editingHighlightRules];
                  next[idx] = { ...next[idx], severity: val };
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
            icon="add"
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
  min-height: 100%;
  padding: var(--rw-space-page);
}

.command-ingress-page__header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--rw-space-4);
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
    padding: var(--rw-space-page-compact);
  }
}
</style>
