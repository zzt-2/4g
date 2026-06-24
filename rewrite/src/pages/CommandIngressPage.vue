<script setup lang="ts">
// 指令接入页（CommandIngressPage）—— UI 重做后的薄壳（S010）。
// 原 1463 行单文件拆成 page + 子组件（features/command-ingress/components/{,runtime,config,docking}/）。
// 本 page 职责：持 4 个 composable 实例 + tab 状态 + 二次确认 handler + 内联测试工具栏/高亮 dialog。
// 不写 UI 细节（KPI bar/表格/卡片都在子组件）。

import { ref, shallowRef, watch, onMounted, onBeforeUnmount } from 'vue';
import { useQuasar } from 'quasar';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import { useAsyncAction, usePolling, useNotify } from '@/shared/composables';
import { formatDateTime } from '@/shared/utils/format';
import type { SatelliteConfig, ScoeCommandConfig, HighlightRuleConfig } from '@/features/command-ingress/core';
import type { DeviceInfoItem } from '@/features/northbound/core/types';
import type { TaskTemplate } from '@/features/task/core';
import { useScoeConfig } from '@/features/command-ingress/composables/use-scoe-config';
import { useScoeMonitor } from '@/features/command-ingress/composables/use-scoe-monitor';
import { useTestTool } from '@/features/command-ingress/composables/use-test-tool';
import { useCentralDocking } from '@/features/command-ingress/composables/use-central-docking';

// 子组件
import CiToolbar from '@/features/command-ingress/components/CiToolbar.vue';
import StatsKpiBar from '@/features/command-ingress/components/runtime/StatsKpiBar.vue';
import CommandLogTable from '@/features/command-ingress/components/runtime/CommandLogTable.vue';
import SatelliteList from '@/features/command-ingress/components/config/SatelliteList.vue';
import SatelliteEditPanel from '@/features/command-ingress/components/config/SatelliteEditPanel.vue';
import DockingToolbar from '@/features/command-ingress/components/docking/DockingToolbar.vue';
import TaskListPanel from '@/features/command-ingress/components/docking/TaskListPanel.vue';
import DeviceListPanel from '@/features/command-ingress/components/docking/DeviceListPanel.vue';
import CatalogMappingPanel, { type FieldGroup } from '@/features/command-ingress/components/docking/CatalogMappingPanel.vue';
import DockingConfigDialog from '@/features/command-ingress/components/docking/DockingConfigDialog.vue';
import DeviceEditDialog, { type DeviceEditForm } from '@/features/command-ingress/components/docking/DeviceEditDialog.vue';
import ReportRecordDialog from '@/features/command-ingress/components/docking/ReportRecordDialog.vue';

// ===== Service 引用 =====
const $q = useQuasar();
const notify = useNotify();
const runtime = useRewriteRuntime();
const service = runtime.features.commandIngressService;
const northboundService = runtime.features.northboundService;
const taskService = runtime.features.taskService;
const resultService = runtime.features.resultService;
const frameService = runtime.features.frameService;

// ===== 业务数据 / 状态 =====
const activeTab = ref<'monitor' | 'config' | 'docking'>('monitor');

// ===== Composables =====
const scoeConfig = useScoeConfig();
const monitor = useScoeMonitor(service);
const testTool = useTestTool(service, () => '');
const docking = useCentralDocking(northboundService, taskService, resultService, notify, runtime.features.dockingStorage);

// ===== 操作 =====
const { execute, isOperating } = useAsyncAction();

// ===== 高亮规则编辑（测试工具栏的内联 dialog 状态） =====
const editingHighlightRules = shallowRef<HighlightRuleConfig[]>([]);

// ===== SCOE 顶部按钮 actions（CiToolbar 转发） =====
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

// ===== SCOE 卫星 CRUD（SatelliteList 转发） =====
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

function handleDuplicateSatellite(satelliteId: string): void {
  scoeConfig.duplicateSatellite(satelliteId);
}

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

function handleImportConfig(): void {
  notify.info('导入功能需要文件系统支持，待实现');
}

function handleExportConfig(): void {
  notify.info('导出功能需要文件系统支持，待实现');
}

// ===== SCOE 配置编辑区（SatelliteEditPanel 转发） =====
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

// 顶部 toolbar「保存配置」按钮在 config tab 时同时保存卫星编辑表单
function handleSaveFromToolbar(): Promise<void> {
  if (activeTab.value === 'config') {
    return handleSaveSatelliteConfig().then(() => handleSaveConfig());
  }
  return handleSaveConfig();
}

async function handleSaveSatelliteConfig(): Promise<void> {
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

// ===== 测试工具栏 actions（Tab1 内联区域转发） =====
const isTestRecording = ref(true);

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

function startTestRecording(): void {
  isTestRecording.value = true;
}

function stopTestRecording(): void {
  isTestRecording.value = false;
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

// ===== 高亮规则 dialog =====
function openHighlightDialog(): void {
  editingHighlightRules.value = [...testTool.highlightRules.value];
  testTool.showHighlightDialog.value = true;
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

function addHighlightRule(): void {
  editingHighlightRules.value = [
    ...editingHighlightRules.value,
    { id: `rule_${Date.now()}`, offset: 0, length: 1, severity: 'info' },
  ];
}

// ===== 设备 CRUD（DeviceListPanel + DeviceEditDialog 转发） =====
const deviceEditForm = ref<DeviceEditForm>({
  name: '', deviceId: '', type: '', ip: '', swVer: '', status: 'online',
});
const deviceEditIsNew = ref(true);
const showDeviceEditDialog = ref(false);

function handleAddDevice(): void {
  deviceEditIsNew.value = true;
  deviceEditForm.value = {
    name: '', deviceId: `DEV_${Date.now()}`, type: '',
    ip: '', swVer: 'V1.0.0', status: 'online',
  };
  showDeviceEditDialog.value = true;
}

function handleEditDevice(row: DeviceInfoItem): void {
  deviceEditIsNew.value = false;
  deviceEditForm.value = {
    name: String(row.name ?? ''),
    deviceId: String(row.deviceId ?? ''),
    type: String(row.type ?? ''),
    ip: String(row.ip ?? ''),
    swVer: String(row.swVer ?? ''),
    status: String(row.status ?? 'online'),
  };
  showDeviceEditDialog.value = true;
}

function handleSaveDevice(): void {
  const form = deviceEditForm.value;
  const device: DeviceInfoItem = {
    name: form.name,
    deviceId: form.deviceId,
    type: form.type,
    ip: form.ip,
    swVer: form.swVer,
    status: form.status as DeviceInfoItem['status'],
    pars: [],
  };
  if (deviceEditIsNew.value) {
    docking.addDevice(device);
  } else {
    docking.updateDevice(form.deviceId, device);
  }
  showDeviceEditDialog.value = false;
}

function handleDeleteDevice(deviceId: string): void {
  $q.dialog({
    title: '确认删除',
    message: `确定要删除设备「${deviceId}」吗？`,
    cancel: true,
    persistent: false,
  }).onOk(() => {
    docking.removeDevice(deviceId);
  });
}

// ===== 用例目录映射（CatalogMappingPanel，D004/S012 原样迁移） =====
const allTemplates = shallowRef<readonly TaskTemplate[]>([]);

function refreshTemplates(): void {
  allTemplates.value = taskService.listTemplates();
}

function getTemplateById(id: string): TaskTemplate | undefined {
  return allTemplates.value.find(t => t.templateId === id);
}

function mappingTemplateName(templateId: string): string {
  const tpl = getTemplateById(templateId);
  return tpl ? tpl.name : `${templateId}(已删除)`;
}

function isMapped(templateId: string): boolean {
  return docking.catalogMappings.value.some(m => m.templateId === templateId);
}

function toggleMapping(templateId: string, checked: boolean): void {
  if (checked) {
    docking.saveMapping({ templateId, enabled: true, overridablePaths: [] });
  } else {
    docking.deleteMapping(templateId);
  }
}

// 把模板的可覆盖字段按「帧」分组（D004 原逻辑，原样保留）
function fieldGroupsOf(tpl: TaskTemplate | undefined): FieldGroup[] {
  if (!tpl) return [];
  const groups: FieldGroup[] = [];
  for (const step of tpl.definition.steps) {
    if (step.kind !== 'send') continue;
    const config = step.config;
    const keys = Object.keys(config.userFieldValues ?? {});
    if (keys.length === 0) continue;
    const refs = frameService.listFieldReferences({ frameId: config.frameId });
    const frameName = refs[0]?.frameName ?? config.frameId;
    const fields = keys.map(key => {
      const ref = refs.find(r => r.fieldId === key);
      const fieldName = ref?.fieldName ?? key;
      return { path: `${step.id}.send.userFieldValues.${key}`, fieldName };
    });
    groups.push({ frameName, fields });
  }
  return groups;
}

function isFieldChecked(templateId: string, path: string): boolean {
  const m = docking.catalogMappings.value.find(x => x.templateId === templateId);
  return (m?.overridablePaths ?? []).includes(path);
}

function toggleField(templateId: string, path: string): void {
  const m = docking.catalogMappings.value.find(x => x.templateId === templateId);
  if (!m) return;
  const checked = m.overridablePaths.includes(path);
  const next = checked
    ? m.overridablePaths.filter(p => p !== path)
    : [...m.overridablePaths, path];
  docking.saveMapping({ ...m, overridablePaths: next });
}

function toggleMappingEnabled(templateId: string, enabled: boolean): void {
  const m = docking.catalogMappings.value.find(x => x.templateId === templateId);
  if (!m) return;
  docking.saveMapping({ ...m, enabled });
}

function handleDeleteMapping(templateId: string): void {
  $q.dialog({
    title: '确认删除',
    message: `确定要删除「${mappingTemplateName(templateId)}」的用例映射吗？`,
    cancel: true,
    persistent: false,
  }).onOk(() => {
    docking.deleteMapping(templateId);
  });
}

// ===== Docking 内部 tab =====
const dockingInnerTab = ref<'tasks' | 'devices' | 'catalog'>('tasks');

// 进入用例目录 tab 时刷新模板列表（供映射列表显示模板名 + 添加弹窗多选）
watch(dockingInnerTab, (tab) => {
  if (tab === 'catalog') refreshTemplates();
});

// ===== 轮询 =====
function refreshAll(): void {
  monitor.refresh();
  docking.refresh();
  if (isTestRecording.value) {
    testTool.refreshRecords();
  }
}

const polling = usePolling(refreshAll, 1000);

// ===== 生命周期 =====
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
  <q-page class="command-ingress-page flex flex-col h-full">
    <!-- 顶部 toolbar：分段控件 + 按 tab 动态按钮 -->
    <CiToolbar v-model="activeTab" :scoe-connected="false" :frames-loaded="service.isScoeFramesLoaded()"
      :is-connect-loading="isOperating('connect')" :is-disconnect-loading="isOperating('disconnect')"
      :is-load-loading="isOperating('load')" :is-unload-loading="isOperating('unload')"
      :is-save-loading="scoeConfig.isSaving.value"
      :can-load-unload="!!scoeConfig.selectedConfigId.value || service.isScoeFramesLoaded()"
      :docking-active="docking.isActive.value" :is-docking-connect-loading="docking.isConnecting.value"
      :is-docking-disconnect-loading="docking.isDisconnecting.value"
      :has-report-records="docking.reportRecords.value.length > 0" @scoe-connect="handleConnect"
      @scoe-disconnect="handleDisconnect" @scoe-load="handleLoadSatellite" @scoe-unload="handleUnloadSatellite"
      @scoe-save-config="handleSaveFromToolbar" @docking-open-config="docking.showConfigDialog.value = true"
      @docking-disconnect="docking.disconnect()" @docking-open-report="docking.showReportDialog.value = true" />

    <!-- tab 内容区（flex 撑满剩余高度） -->
    <div class="flex-1 min-h-0 overflow-hidden">
      <!-- Tab 1: SCOE 运行与测试 -->
      <div v-show="activeTab === 'monitor'" class="flex flex-col h-full">
        <StatsKpiBar :statistics="monitor.statistics.value" :runtime-status="monitor.runtimeStatus.value" />
        <div class="flex flex-1 min-h-0 gap-6">
          <!-- 左：命令日志表 -->
          <CommandLogTable class="flex-1 min-w-0" :rows="monitor.commandLog.value"
            :last-command-code="monitor.runtimeStatus.value.lastCommandCode"
            :last-error-reason="monitor.statistics.value.lastErrorReason" @clear-log="handleClearCommandLog" />
          <!-- 右：测试工具栏（320px，内联） -->
          <div class="ci-test-tool flex flex-col w-80 min-w-80 flex-shrink-0">
            <!-- 接收区 -->
            <div class="rw-panel-base m-3 p-3 flex flex-col flex-1 min-h-0 overflow-hidden">
              <div class="flex items-center justify-between mb-2 flex-shrink-0">
                <span class="rw-text-label text-sm">接收数据</span>
                <div class="flex gap-1">
                  <q-btn flat dense icon="o_highlight" color="grey" size="sm" @click="openHighlightDialog">
                    <q-tooltip>高亮配置</q-tooltip>
                  </q-btn>
                  <q-btn flat dense icon="o_play_arrow" color="positive" size="sm" :disable="isTestRecording"
                    @click="startTestRecording">
                    <q-tooltip>开始</q-tooltip>
                  </q-btn>
                  <q-btn flat dense icon="o_stop" color="warning" size="sm" :disable="!isTestRecording"
                    @click="stopTestRecording">
                    <q-tooltip>停止</q-tooltip>
                  </q-btn>
                  <q-btn flat dense icon="o_delete_sweep" color="grey" size="sm" @click="handleClearTestRecords">
                    <q-tooltip>清空</q-tooltip>
                  </q-btn>
                </div>
              </div>
              <div v-if="testTool.records.value.length === 0"
                class="text-center p-4 rw-text-label flex-1 flex items-center justify-center">
                暂无接收数据
              </div>
              <q-virtual-scroll v-else :items="testTool.records.value" virtual-scroll-item-size="28"
                class="flex-1 min-h-0">
                <template #default="{ item: record, index }">
                  <div :key="index" class="flex items-center py-1 rw-divider-b font-mono text-xs">
                    <span class="rw-text-label w-[100px] flex-shrink-0">{{ formatDateTime(new
                      Date(record.timestamp).toISOString()) }}</span>
                    <span class="rw-text-value flex-1 truncate">{{ String(record.data) }}</span>
                  </div>
                </template>
              </q-virtual-scroll>
            </div>
            <!-- 发送区 -->
            <div class="rw-panel-base mx-3 mb-3 p-3 flex-shrink-0">
              <span class="rw-text-label text-sm">发送数据</span>
              <q-input v-model="testTool.hexInput.value" type="textarea" dense rows="3" placeholder="输入 HEX 数据"
                class="font-mono mt-2" />
              <q-btn unelevated color="primary" label="发送" class="full-width mt-2" :loading="testTool.isSending.value"
                :disable="!testTool.hexInput.value.trim()" @click="handleSendHex" />
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 2: SCOE 配置 -->
      <div v-show="activeTab === 'config'" class="flex h-full">
        <SatelliteList class="w-100 min-w-100 flex-shrink-0" :rows="scoeConfig.satelliteConfigs.value"
          :selected-id="scoeConfig.selectedConfigId.value" @update:selected="scoeConfig.selectSatellite"
          @add="handleAddSatellite" @duplicate="handleDuplicateSatellite" @delete="handleDeleteSatellite"
          @import="handleImportConfig" @export="handleExportConfig" />
        <SatelliteEditPanel :config="scoeConfig.selectedConfig.value" :edit-form="editForm"
          @update:edit-form="(f) => editForm = f" @add-command="handleAddCommand" />
      </div>

      <!-- Tab 3: 中心对接 -->
      <div v-show="activeTab === 'docking'" class="flex flex-col h-full">
        <DockingToolbar v-model="dockingInnerTab" :connection-state="docking.connectionState.value" />
        <div class="flex-1 min-h-0 overflow-hidden">
          <TaskListPanel v-if="dockingInnerTab === 'tasks'" />
          <DeviceListPanel v-else-if="dockingInnerTab === 'devices'" :rows="docking.devices.value"
            @add="handleAddDevice" @edit="handleEditDevice" @delete="handleDeleteDevice" />
          <CatalogMappingPanel v-else :mappings="docking.catalogMappings.value" :all-templates="allTemplates"
            :field-groups-of="fieldGroupsOf" :template-name-of="mappingTemplateName" :is-field-checked="isFieldChecked"
            :is-mapped="isMapped" @toggle-enabled="toggleMappingEnabled" @toggle-field="toggleField"
            @add-mapping="refreshTemplates" @toggle-mapping="toggleMapping" @delete-mapping="handleDeleteMapping" />
        </div>
      </div>
    </div>

    <!-- 中心对接 3 个弹窗（逻辑零改动，触发按钮在 CiToolbar） -->
    <DockingConfigDialog v-model="docking.showConfigDialog.value" :config="docking.config"
      :is-connecting="docking.isConnecting.value" @update:config="(c) => Object.assign(docking.config, c)"
      @save-connect="docking.saveConfigAndConnect()" />
    <DeviceEditDialog v-model="showDeviceEditDialog" :is-new="deviceEditIsNew" :form="deviceEditForm"
      @update:form="(f) => deviceEditForm = f" @confirm="handleSaveDevice" />
    <ReportRecordDialog v-model="docking.showReportDialog.value" :rows="docking.reportRecords.value" />

    <!-- 高亮规则配置 dialog（测试工具栏内联） -->
    <q-dialog v-model="testTool.showHighlightDialog.value" @hide="editingHighlightRules = []">
      <q-card class="rw-dialog-md">
        <q-card-section>
          <div class="text-h6">高亮规则配置</div>
        </q-card-section>
        <q-card-section class="rw-dialog-scroll-body">
          <div v-for="rule in editingHighlightRules" :key="rule.id" class="flex items-center gap-2 mb-2">
            <q-input :model-value="String(rule.offset)" dense label="起始" type="number" class="w-20" @update:model-value="(val: string | number | null) => {
              const idx = editingHighlightRules.findIndex((r) => r.id === rule.id);
              if (idx >= 0) {
                const next = [...editingHighlightRules];
                next[idx] = { ...next[idx], offset: Number(val) || 0 };
                editingHighlightRules = next;
              }
            }" />
            <q-input :model-value="String(rule.length)" dense label="长度" type="number" class="w-20" @update:model-value="(val: string | number | null) => {
              const idx = editingHighlightRules.findIndex((r) => r.id === rule.id);
              if (idx >= 0) {
                const next = [...editingHighlightRules];
                next[idx] = { ...next[idx], length: Number(val) || 1 };
                editingHighlightRules = next;
              }
            }" />
            <q-select :model-value="rule.severity" :options="(['info', 'warning', 'negative', 'positive'] as const)"
              dense label="颜色" emit-value class="w-25" @update:model-value="(val) => {
                const idx = editingHighlightRules.findIndex((r) => r.id === rule.id);
                if (idx >= 0) {
                  const next = [...editingHighlightRules];
                  next[idx] = { ...next[idx], severity: val as HighlightRuleConfig['severity'] };
                  editingHighlightRules = next;
                }
              }" />
            <q-btn flat dense icon="o_delete" color="grey" size="sm" @click="handleDeleteHighlightRule(rule.id)" />
          </div>
          <q-btn flat dense icon="o_add" color="primary" label="添加规则" @click="addHighlightRule" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="取消" @click="testTool.showHighlightDialog.value = false" />
          <q-btn unelevated color="primary" label="保存" :loading="isOperating('save-highlight')"
            @click="handleSaveHighlightRules(editingHighlightRules)" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<style scoped lang="scss">
.command-ingress-page {
  background: var(--rw-color-surface-app);
}

.ci-test-tool {
  background: var(--rw-color-surface-app);
}
</style>
