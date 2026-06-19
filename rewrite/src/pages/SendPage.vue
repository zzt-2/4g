<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import DataTable from '@/widgets/DataTable.vue';
import FieldEditWidget from '@/widgets/FieldEditWidget.vue';
import SendTargetSelector from '@/features/send/components/SendTargetSelector.vue';
import { instanceColumns, type InstanceTableRow } from '@/features/send/components/instance-columns';
import { useSendInstances } from '@/features/send/composables/use-send-instances';
import { useFramePreview } from '@/features/send/composables/use-frame-preview';
import { useAsyncAction, useNotify, useStableKeys } from '@/shared/composables';
import { listFrameAssetSummaries } from '@/features/frame';
import type { ReadonlyFrameAsset, FrameAssetSummary } from '@/features/frame';
import { useToggleFavorite } from '@/features/frame/composables';
import type { SendFieldValue, SendFrameInstance } from '@/features/send';
import { resolveFieldValues, applyFactor, frameToBuildInput } from '@/features/send';
import { valueToDisplayString, isHexCapableField } from '@/features/send';
import { NOOP_VARIABLE_PROVIDER } from '@/features/send/adapters';

const $q = useQuasar();
const notify = useNotify();
const { execute: executeAction, isOperating } = useAsyncAction();
const runtime = useRewriteRuntime();
const frameService = runtime.features.frameService;
const sendService = runtime.features.sendService;
const connectionService = runtime.features.connectionService;

const sendInstances = useSendInstances();

function saveSendInstances(): void {
  void runtime.persistence.saveSendInstances();
}

// ===== Left column: frame list =====

const searchText = ref('');
const favoriteOnly = ref(false);

// Reactive refresh — service state is non-reactive, track mutations manually
const refreshKey = ref(0);
function refreshFrameList(): void {
  refreshKey.value++;
}

const frameSummaries = computed<FrameAssetSummary[]>(() => {
  void refreshKey.value;
  return listFrameAssetSummaries(frameService.getSnapshot(), {
    direction: 'send',
    query: searchText.value || undefined,
    favoriteOnly: favoriteOnly.value || undefined,
  });
});

const favoriteFrames = computed(() =>
  frameSummaries.value.filter((f) => f.isFavorite),
);

const otherFrames = computed(() =>
  frameSummaries.value.filter((f) => !f.isFavorite),
);

function getDefaultFieldValues(frame: ReadonlyFrameAsset): Record<string, SendFieldValue> {
  const values: Record<string, SendFieldValue> = {};
  for (const field of frame.fields) {
    if (!field.configurable) continue;
    if (field.defaultValue !== undefined) {
      const num = Number(field.defaultValue);
      values[field.id] = !Number.isNaN(num) && field.defaultValue.trim() !== '' ? num : field.defaultValue;
    } else if (field.options.length > 0) {
      const defaultOpt = field.options.find(o => o.isDefault);
      values[field.id] = defaultOpt ? Number(defaultOpt.value) || defaultOpt.value : Number(field.options[0].value) || field.options[0].value;
    }
  }
  return values;
}

function onFrameClick(frame: FrameAssetSummary): void {
  const fullFrame = frameService.getFrame(frame.id);
  if (!fullFrame) return;
  const defaultValues = getDefaultFieldValues(fullFrame);
  const instance = sendInstances.createInstance(frame.id, frame.name, defaultValues);
  sendInstances.selectInstance(instance.instanceId);
}

function onFrameDblClick(frame: FrameAssetSummary): void {
  const fullFrame = frameService.getFrame(frame.id);
  if (!fullFrame) return;
  const defaultValues = getDefaultFieldValues(fullFrame);
  const instance = sendInstances.createInstance(frame.id, frame.name, defaultValues);
  sendInstances.selectInstance(instance.instanceId);
  onEditInstance({
    instanceId: instance.instanceId,
    name: instance.name,
    fieldCount: Object.keys(instance.userFieldValues).length,
    sendCount: 0,
    lastSendAt: undefined,
    description: instance.description,
    _index: 0,
  });
}

const { toggleFavorite } = useToggleFavorite(frameService, (msg) => notify.error(msg), refreshFrameList);

// ===== Middle column: instance table =====

const tableRows = shallowRef<InstanceTableRow[]>([]);

watch(sendInstances.instances, (instances) => {
  saveSendInstances();
  tableRows.value = instances.map((inst, index) => ({
    instanceId: inst.instanceId,
    name: inst.name,
    fieldCount: Object.keys(inst.userFieldValues).length,
    sendCount: inst.sendCount,
    lastSendAt: inst.lastSendAt,
    description: inst.description,
    _index: index + 1,
  }));
}, { immediate: true });

const selectedRows = computed(() => {
  const id = sendInstances.selectedInstanceId.value;
  return id ? tableRows.value.filter((r) => r.instanceId === id) : [];
});

// ===== Batch delete mode =====

const batchMode = ref(false);
const batchSelectedRows = ref<InstanceTableRow[]>([]);

function onBatchDelete(): void {
  if (batchSelectedRows.value.length === 0) return;
  $q.dialog({
    title: '确认批量删除',
    message: `确定要删除选中的 ${batchSelectedRows.value.length} 个实例吗？此操作不可撤销。`,
    cancel: true,
    persistent: false,
  }).onOk(() => {
    for (const row of batchSelectedRows.value) {
      sendInstances.removeInstance(row.instanceId);
    }
    batchSelectedRows.value = [];
  });
}

function onRowClick(row: InstanceTableRow): void {
  sendInstances.selectInstance(row.instanceId);
}

function onSelectionChange(selected: InstanceTableRow[]): void {
  if (selected.length > 0) {
    sendInstances.selectInstance(selected[0].instanceId);
  } else {
    sendInstances.selectInstance(null);
  }
}

function onEditInstance(row: InstanceTableRow): void {
  const inst = sendInstances.instances.value.find(i => i.instanceId === row.instanceId);
  if (!inst) return;
  editingInstanceId.value = inst.instanceId;
  editValues.value = JSON.parse(JSON.stringify(inst.userFieldValues));
  editDescription.value = inst.description ?? '';
  editName.value = inst.name;
  showEditDialog.value = true;
}

function onCloneInstance(row: InstanceTableRow): void {
  const cloned = sendInstances.cloneInstance(row.instanceId);
  if (cloned) {
    notify.success('已复制');
  }
}

function onRemoveInstance(row: InstanceTableRow): void {
  $q.dialog({
    title: '确认删除',
    message: `确定要删除实例「${row.name}」吗？此操作不可撤销。`,
    cancel: true,
    persistent: false,
  }).onOk(() => {
    sendInstances.removeInstance(row.instanceId);
  });
}

function onMoveUp(row: InstanceTableRow): void {
  sendInstances.moveInstanceUp(row.instanceId);
}

function onMoveDown(row: InstanceTableRow): void {
  sendInstances.moveInstanceDown(row.instanceId);
}

// ===== Right column: preview + send =====

const selectedInstance = computed<SendFrameInstance | null>(() => {
  const id = sendInstances.selectedInstanceId.value;
  if (!id) return null;
  return sendInstances.instances.value.find(i => i.instanceId === id) ?? null;
});

const selectedFrame = computed<ReadonlyFrameAsset | null>(() => {
  if (!selectedInstance.value) return null;
  return frameService.getFrame(selectedInstance.value.frameId) ?? null;
});

const selectedValues = computed<Readonly<Record<string, SendFieldValue>>>(() => {
  return selectedInstance.value?.userFieldValues ?? {};
});

const { fullPreview } = useFramePreview(selectedFrame, selectedValues);
const { keys: issueKeys, syncKeys: syncIssueKeys } = useStableKeys('issue');
watch(() => fullPreview.issues, (issues) => syncIssueKeys(issues?.length ?? 0), { immediate: true });

const { selectedTargetId } = sendInstances;

async function onSend(): Promise<void> {
  const inst = selectedInstance.value;
  if (!inst || !selectedTargetId.value) return;

  await executeAction('o_send', async () => {
    const result = await sendService.execute({
      frameId: inst.frameId,
      targetId: selectedTargetId.value!,
      userFieldValues: inst.userFieldValues,
      context: { source: 'user' },
    });

    if (result.kind === 'sent') {
      notify.success('发送成功');
      sendInstances.incrementSendCount(inst.instanceId);

      // Write back expression field values for self-referencing support
      if (result.resolvedFieldValues && selectedFrame.value) {
        const writeback: Record<string, SendFieldValue> = {};
        for (const field of selectedFrame.value.fields) {
          if (field.expressionConfig && field.id in result.resolvedFieldValues) {
            writeback[field.id] = result.resolvedFieldValues[field.id]!;
          }
        }
        if (Object.keys(writeback).length > 0) {
          sendInstances.updateInstance(inst.instanceId, {
            userFieldValues: { ...inst.userFieldValues, ...writeback },
          });
        }
      }
    } else {
      notify.error('发送失败', result.error?.message);
      if (result.buildIssues.length > 0) {
        const msgs = result.buildIssues
          .filter(i => i.severity === 'o_error')
          .map(i => i.message)
          .join('; ');
        if (msgs) {
          notify.error('构建问题', msgs);
        }
      }
    }
  });
}

// ===== Instance edit dialog =====

const showEditDialog = ref(false);
const editingInstanceId = ref<string | null>(null);
const editValues = ref<Record<string, SendFieldValue>>({});
const editDescription = ref('');
const editName = ref('');
const editHexMode = ref(false);
const editFieldErrors = ref<Record<string, string>>({});
const isValid = computed(() => {
  return editName.value.trim().length > 0 && Object.keys(editFieldErrors.value).length === 0;
});

function onEditDialogHide(): void {
  editingInstanceId.value = null;
  editValues.value = {};
  editDescription.value = '';
  editName.value = '';
  editHexMode.value = false;
  editFieldErrors.value = {};
}

function onFieldError(payload: { fieldId: string; error: string | undefined }): void {
  if (payload.error) {
    editFieldErrors.value = { ...editFieldErrors.value, [payload.fieldId]: payload.error };
  } else {
    const next = { ...editFieldErrors.value };
    delete next[payload.fieldId];
    editFieldErrors.value = next;
  }
}

async function onEditConfirm(): Promise<void> {
  if (!editingInstanceId.value || !isValid.value) return;

  await executeAction('o_edit', async () => {
    sendInstances.updateInstance(editingInstanceId.value!, {
      name: editName.value,
      description: editDescription.value,
      userFieldValues: { ...editValues.value },
    });
    showEditDialog.value = false;
  });
}

// Configurable fields of selected frame for right panel display

function fieldDisplayValue(field: { id: string; dataType: string }, value: SendFieldValue | undefined): string {
  if (value === undefined || value === null || value === '') return '--';
  if (isHexCapableField(field as never)) {
    return valueToDisplayString(value, field as never, true);
  }
  return String(value);
}

const configurableFields = computed(() => {
  const frame = selectedFrame.value;
  if (!frame) return [];
  return frame.fields.filter(f => f.configurable);
});

// Edit dialog: frame fields for the instance being edited
const editFrame = computed<ReadonlyFrameAsset | null>(() => {
  if (!editingInstanceId.value) return null;
  const inst = sendInstances.instances.value.find(i => i.instanceId === editingInstanceId.value);
  if (!inst) return null;
  return frameService.getFrame(inst.frameId) ?? null;
});

const editFrameFields = computed(() => editFrame.value?.fields ?? []);

const editPreviewValues = computed(() => {
  const frame = editFrame.value;
  if (!frame) return {};
  const { fields } = frameToBuildInput(frame);
  const resolved = resolveFieldValues(fields, editValues.value, NOOP_VARIABLE_PROVIDER);
  const factored = applyFactor(fields, resolved.values);
  return factored.values;
});
</script>

<template>
  <q-page class="send-page flex flex-col h-full">
    <div class="send-page__columns">
      <!-- Left column: frame format list (240px) -->
      <div class="send-page__col-left">
        <div class="p-3 flex-shrink-0">
          <q-input
            v-model="searchText"
            dense
            outlined
            placeholder="搜索..."
            clearable
          >
            <template #prepend>
              <q-icon name="o_search" size="xs" />
            </template>
          </q-input>
        </div>

        <div class="flex items-center gap-1 px-3 pb-2 flex-shrink-0">
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            :icon="favoriteOnly ? 'o_star' : 'o_star_border'"
            :color="favoriteOnly ? 'warning' : 'grey'"
            @click="favoriteOnly = !favoriteOnly"
          />
          <span class="rw-text-label text-xs">仅收藏</span>
        </div>

        <div class="send-page__scroll">
          <!-- Favorite section -->
          <template v-if="favoriteFrames.length > 0">
            <div class="px-3 pt-2 pb-1">
              <span class="rw-text-label text-xs">收藏</span>
            </div>
            <q-list dense>
              <q-item
                v-for="frame in favoriteFrames"
                :key="frame.id"
                clickable
                dense
                class="frame-item py-1 px-2"
                :title="frame.name"
                @click="onFrameClick(frame)"
                @dblclick="onFrameDblClick(frame)"
              >
                <q-item-section avatar class="frame-item__avatar">
                  <q-icon name="o_star" size="xs" color="warning" />
                </q-item-section>
                <q-item-section class="frame-item__main">
                  <q-item-label class="frame-item__name">{{ frame.name }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-btn
                    flat
                    round
                    dense
                    :icon="frame.isFavorite ? 'o_star' : 'o_star_border'"
                    :color="frame.isFavorite ? 'warning' : 'grey'"
                    size="xs"
                    @click.stop="toggleFavorite(frame)"
                  />
                </q-item-section>
              </q-item>
            </q-list>

            <q-separator class="mx-3 my-2" />
          </template>

          <!-- All frames section -->
          <div class="px-3 pt-2 pb-1">
            <span class="rw-text-label text-xs">全部</span>
          </div>
          <q-list dense>
            <q-item
              v-for="frame in otherFrames"
              :key="frame.id"
              clickable
              dense
              class="frame-item py-1 px-2"
              :title="frame.name"
              @click="onFrameClick(frame)"
              @dblclick="onFrameDblClick(frame)"
            >
                <q-item-section avatar class="frame-item__avatar">
                  <q-icon
                  :name="frame.isFavorite ? 'o_star' : 'o_bookmark_border'"
                  size="xs"
                  :color="frame.isFavorite ? 'warning' : 'grey'"
                />
                </q-item-section>
                <q-item-section class="frame-item__main">
                  <q-item-label class="frame-item__name">{{ frame.name }}</q-item-label>
                </q-item-section>
              <q-item-section side>
                <q-btn
                  flat
                  round
                  dense
                  :icon="frame.isFavorite ? 'o_star' : 'o_star_border'"
                  :color="frame.isFavorite ? 'warning' : 'grey'"
                  size="xs"
                  @click.stop="toggleFavorite(frame)"
                />
              </q-item-section>
            </q-item>
          </q-list>

          <!-- Empty state for left column -->
          <div v-if="frameSummaries.length === 0" class="text-center p-4 rw-text-desc">
            <q-icon name="o_inbox" size="32px" color="grey" class="mb-2" />
            <p class="text-xs">暂无发送帧格式</p>
          </div>
        </div>
      </div>

      <!-- Middle column: instance table (flex:1) -->
      <div class="send-page__col-mid">
        <!-- Batch mode toolbar -->
        <div v-if="batchMode" class="flex items-center gap-2 px-4 py-2 rw-divider-b flex-shrink-0">
          <q-btn flat dense no-caps icon="o_delete" label="批量删除" color="negative" size="sm" :disable="batchSelectedRows.length === 0" @click="onBatchDelete" />
          <span class="rw-text-desc text-xs">{{ batchSelectedRows.length }} 项已选中</span>
          <div class="flex-1" />
          <q-btn flat dense no-caps label="退出批量模式" size="sm" @click="batchMode = false; batchSelectedRows = []" />
        </div>
        <div v-else class="flex items-center justify-end px-4 py-1 flex-shrink-0">
          <q-btn flat dense no-caps icon="o_checklist" label="批量管理" size="sm" @click="batchMode = true" />
        </div>

        <div class="send-page__table-wrap">
          <DataTable
            :columns="instanceColumns"
            :rows="tableRows"
            row-key="instanceId"
            :selection="batchMode ? 'multiple' : 'single'"
            :selected="batchMode ? batchSelectedRows : selectedRows"
            container-height="100%"
            @row-click="(_row: InstanceTableRow) => { if (!batchMode) onRowClick(_row) }"
            @update:selected="batchMode ? (batchSelectedRows = $event as InstanceTableRow[]) : onSelectionChange($event as InstanceTableRow[])"
          >
            <template #no-data>
              <div class="text-center w-full p-4 rw-text-label">
                暂无帧实例，从左侧选择帧格式创建
              </div>
            </template>

            <template #body-cell-_index="props">
              <q-td :props="props">
                {{ props.row._index }}
              </q-td>
            </template>

            <template #body-cell-_actions="props">
              <q-td :props="props">
                <div v-if="!batchMode" class="flex items-center justify-center">
                  <q-btn flat round dense icon="o_edit" size="sm" color="primary" @click.stop="onEditInstance(props.row)" />
                  <q-btn flat round dense icon="o_more_vert" size="sm" color="grey">
                    <q-menu anchor="bottom right" self="top right">
                      <q-list dense style="min-width: 120px">
                        <q-item clickable v-close-popup @click="onCloneInstance(props.row)">
                          <q-item-section avatar><q-icon name="o_content_copy" size="xs" /></q-item-section>
                          <q-item-section>复制</q-item-section>
                        </q-item>
                        <q-item clickable v-close-popup :disable="props.row._index <= 1" @click="onMoveUp(props.row)">
                          <q-item-section avatar><q-icon name="o_arrow_upward" size="xs" /></q-item-section>
                          <q-item-section>上移</q-item-section>
                        </q-item>
                        <q-item clickable v-close-popup :disable="props.row._index >= tableRows.length" @click="onMoveDown(props.row)">
                          <q-item-section avatar><q-icon name="o_arrow_downward" size="xs" /></q-item-section>
                          <q-item-section>下移</q-item-section>
                        </q-item>
                        <q-separator />
                        <q-item clickable v-close-popup class="text-negative" @click="onRemoveInstance(props.row)">
                          <q-item-section avatar><q-icon name="o_delete" size="xs" /></q-item-section>
                          <q-item-section>删除</q-item-section>
                        </q-item>
                      </q-list>
                    </q-menu>
                  </q-btn>
                </div>
                <q-btn v-else flat round dense icon="o_edit" size="sm" color="primary" :disable="true" />
              </q-td>
            </template>
          </DataTable>
        </div>
      </div>

      <!-- Right column: preview + send (300px) -->
      <div class="send-page__col-right">
        <template v-if="selectedInstance">
          <!-- Scrollable content area -->
          <div class="send-page__scroll p-3">
            <!-- Instance info -->
            <div class="send-panel">
              <div class="mb-2">
                <span class="rw-text-label">名称</span>
                <div class="rw-text-value">{{ selectedInstance.name }}</div>
              </div>
              <div class="mb-2">
                <span class="rw-text-label">创建时间</span>
                <div class="rw-text-value text-sm">{{ selectedInstance.createdAt }}</div>
              </div>
              <div v-if="selectedInstance.description">
                <span class="rw-text-label">备注</span>
                <div class="rw-text-desc text-sm">{{ selectedInstance.description }}</div>
              </div>
            </div>

            <!-- Hex preview -->
            <div class="send-panel">
              <span class="rw-text-label">帧预览 (Hex)</span>
              <pre v-if="fullPreview.hexPreview" class="hex-preview font-mono rw-text-value text-xs mt-1 p-2 rounded">{{ fullPreview.hexPreview }}</pre>
              <div v-else class="rw-text-desc text-xs mt-1">无预览数据</div>
            </div>

            <!-- Configurable fields + merged build issues -->
            <div v-if="configurableFields.length > 0 || fullPreview.issues.length > 0" class="send-panel">
              <span class="rw-text-label">参数值</span>
              <div class="mt-2 flex flex-col gap-1">
                <div
                  v-for="field in configurableFields"
                  :key="field.id"
                  class="flex items-center justify-between"
                >
                  <span class="rw-text-label text-xs">{{ field.name }}</span>
                  <span class="rw-text-value text-xs font-mono">{{ fieldDisplayValue(field, selectedInstance.userFieldValues[field.id]) }}</span>
                </div>
              </div>
              <div v-if="fullPreview.issues.length > 0" class="mt-2">
                <div
                  v-for="(issue, idx) in fullPreview.issues"
                  :key="issueKeys[idx]"
                  class="text-xs"
                  :class="issue.severity === 'o_error' ? 'text-negative' : 'text-warning'"
                >
                  {{ issue.message }}
                </div>
              </div>
            </div>
          </div>

          <!-- Send section (pinned to bottom) -->
          <div class="flex-shrink-0 p-4 rw-divider-t">
            <div class="mb-3">
              <span class="rw-text-label">发送目标</span>
              <SendTargetSelector
                v-model="selectedTargetId"
                :connection-service="connectionService"
                class="mt-1"
              />
            </div>
            <q-btn
              unelevated
              no-caps
              color="primary"
              label="发送"
              icon="o_send"
              class="w-full"
              :loading="isOperating('o_send')"
              :disable="!selectedInstance || !selectedTargetId"
              @click="onSend"
            />
          </div>
        </template>

        <!-- Empty state -->
        <div v-else class="flex flex-col items-center justify-center flex-1 rw-text-desc">
          <q-icon name="o_touch_app" size="48px" color="grey" class="mb-2" />
          <p>请选择一个帧实例</p>
        </div>
      </div>
    </div>

    <!-- Instance edit dialog -->
    <q-dialog v-model="showEditDialog" @hide="onEditDialogHide">
      <q-card class="rw-dialog-lg">
        <q-card-section>
          <div class="text-h6">编辑帧实例</div>
        </q-card-section>

        <q-form @submit.prevent="onEditConfirm">
          <q-card-section class="pt-0">
            <div class="flex flex-col gap-3">
              <q-input
                v-model="editName"
                dense
                outlined
                label="名称"
                :rules="[val => !!val || '名称不能为空']"
              />
              <q-input
                v-model="editDescription"
                dense
                outlined
                label="备注"
                type="textarea"
                autogrow
              />

              <!-- Field values editor -->
              <div v-if="editFrameFields.length > 0" class="flex-1 min-h-0 overflow-y-auto mt-2">
                <div class="flex items-center justify-end mb-2">
                  <q-btn-toggle
                    v-model="editHexMode"
                    no-caps
                    dense
                    unelevated
                    toggle-color="primary"
                    :options="[{label:'Dec', value:false},{label:'Hex', value:true}]"
                    size="sm"
                  />
                </div>
                <FieldEditWidget
                  :fields="editFrameFields"
                  :values="editValues"
                  :preview-values="editPreviewValues"
                  :hex-mode="editHexMode"
                  :field-errors="editFieldErrors"
                  direction="send"
                  @update:values="editValues = $event"
                  @field-error="onFieldError"
                />
              </div>
            </div>
          </q-card-section>

          <q-card-actions align="right">
            <q-btn flat no-caps label="取消" @click="showEditDialog = false" />
            <q-btn
              unelevated
              no-caps
              color="primary"
              label="确认"
              :loading="isOperating('o_edit')"
              :disable="!isValid"
              type="submit"
            />
          </q-card-actions>
        </q-form>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<style scoped lang="scss">
.send-page {
  background: var(--rw-color-surface-app);
}

// Three-column container — mirrors DisplayPage's __panels pattern:
// flex:1 1 0 + min-height:0 so children can scroll independently.
.send-page__columns {
  display: flex;
  flex: 1 1 0;
  min-height: 0;
}

.send-page__col-left {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.send-page__col-mid {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.send-page__col-right {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle);
}

// Shared scroll region for left list and right panel content.
.send-page__scroll {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
}

// DataTable wrapper — must clamp q-table (virtual-scroll renders all rows,
// maxHeight:100% alone cannot stop it from stretching the flex parent).
.send-page__table-wrap {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.frame-item__name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--rw-font-size-body);
  color: var(--rw-color-text-primary);
}
.frame-item__avatar {
  min-width: 24px;
}
.frame-item__main {
  min-width: 0;
}
.frame-item__main :deep(.q-item__label) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.frame-item:hover {
  background: var(--rw-color-surface-selected);
}

.send-panel {
  background: var(--rw-color-surface-base);
  border: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle);
  border-radius: var(--rw-radius-panel);
  padding: var(--rw-space-3);
  margin-bottom: var(--rw-space-2);
}
.send-panel :first-child {
  margin-top: 0;
}

.hex-preview {
  background: var(--rw-color-surface-app);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
