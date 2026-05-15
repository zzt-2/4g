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

const $q = useQuasar();
const notify = useNotify();
const { execute: executeAction, isOperating } = useAsyncAction();
const runtime = useRewriteRuntime();
const frameService = runtime.features.frameService;
const sendService = runtime.features.sendService;
const connectionService = runtime.features.connectionService;

const sendInstances = useSendInstances();

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

const selectedTargetId = ref<string | null>(null);

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
const isValid = computed(() => {
  return editName.value.trim().length > 0;
});

function onEditDialogHide(): void {
  editingInstanceId.value = null;
  editValues.value = {};
  editDescription.value = '';
  editName.value = '';
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

function fieldToHex(_field: { id: string }, value: SendFieldValue | undefined): string {
  if (value === undefined || value === null) return '--';
  if (typeof value === 'number') {
    return `0x${value.toString(16).toUpperCase().padStart(2, '0')}`;
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
</script>

<template>
  <q-page class="send-page min-h-full">
    <div class="flex h-full">
      <!-- Left column: frame format list (240px) -->
      <div class="w-[240px] flex-shrink-0 flex flex-col overflow-hidden">
        <div class="p-3">
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

        <div class="flex items-center gap-1 px-3 pb-2">
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

        <div class="flex-1 overflow-y-auto">
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
                class="py-1 px-2"
                @click="onFrameClick(frame)"
                @dblclick="onFrameDblClick(frame)"
              >
                <q-item-section>
                  <q-item-label class="rw-text-value text-sm">{{ frame.name }}</q-item-label>
                  <q-item-label caption class="rw-text-desc text-xs">{{ frame.fieldCount }} 个字段</q-item-label>
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
              class="py-1 px-2"
              @click="onFrameClick(frame)"
              @dblclick="onFrameDblClick(frame)"
            >
              <q-item-section>
                <q-item-label class="rw-text-value text-sm">{{ frame.name }}</q-item-label>
                <q-item-label caption class="rw-text-desc text-xs">{{ frame.fieldCount }} 个字段</q-item-label>
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
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- Batch mode toolbar -->
        <div v-if="batchMode" class="flex items-center gap-2 px-4 py-2 rw-divider-b">
          <q-btn flat dense no-caps icon="o_delete" label="批量删除" color="negative" size="sm" :disable="batchSelectedRows.length === 0" @click="onBatchDelete" />
          <span class="rw-text-desc text-xs">{{ batchSelectedRows.length }} 项已选中</span>
          <div class="flex-1" />
          <q-btn flat dense no-caps label="退出批量模式" size="sm" @click="batchMode = false; batchSelectedRows = []" />
        </div>
        <div v-else class="flex items-center justify-end px-4 py-1">
          <q-btn flat dense no-caps icon="o_checklist" label="批量管理" size="sm" @click="batchMode = true" />
        </div>

        <DataTable
          :columns="instanceColumns"
          :rows="tableRows"
          row-key="instanceId"
          :selection="batchMode ? 'multiple' : 'single'"
          :selected="batchMode ? batchSelectedRows : selectedRows"
          container-height="calc(100vh - 100px)"
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
              <div class="flex items-center justify-center gap-1">
                <template v-if="!batchMode">
                  <q-btn flat round dense icon="o_edit" size="sm" color="primary" @click.stop="onEditInstance(props.row)" />
                  <q-btn flat round dense icon="o_content_copy" size="sm" color="primary" @click.stop="onCloneInstance(props.row)" />
                  <q-btn flat round dense icon="o_delete" size="sm" color="negative" @click.stop="onRemoveInstance(props.row)" />
                  <q-btn flat round dense icon="o_arrow_upward" size="sm" color="grey" :disable="props.row._index <= 1" @click.stop="onMoveUp(props.row)" />
                  <q-btn flat round dense icon="o_arrow_downward" size="sm" color="grey" :disable="props.row._index >= tableRows.length" @click.stop="onMoveDown(props.row)" />
                </template>
                <template v-else>
                  <q-btn flat round dense icon="o_edit" size="sm" color="primary" :disable="true" />
                </template>
              </div>
            </q-td>
          </template>
        </DataTable>
      </div>

      <!-- Right column: preview + send (300px) -->
      <div class="w-[300px] flex-shrink-0 flex flex-col overflow-y-auto rw-divider-l">
        <template v-if="selectedInstance">
          <!-- Instance info -->
          <div class="p-4 rw-divider-b">
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
          <div class="p-4 rw-divider-b">
            <span class="rw-text-label">帧预览 (Hex)</span>
            <pre v-if="fullPreview.hexPreview" class="hex-preview font-mono rw-text-value text-xs mt-1 p-2 rounded">{{ fullPreview.hexPreview }}</pre>
            <div v-else class="rw-text-desc text-xs mt-1">无预览数据</div>
          </div>

          <!-- Configurable fields -->
          <div v-if="configurableFields.length > 0" class="p-4 rw-divider-b">
            <span class="rw-text-label">参数值</span>
            <div class="mt-2 flex flex-col gap-1">
              <div
                v-for="field in configurableFields"
                :key="field.id"
                class="flex items-center justify-between"
              >
                <span class="rw-text-label text-xs">{{ field.name }}</span>
                <span class="rw-text-value text-xs font-mono">{{ fieldToHex(field, selectedInstance.userFieldValues[field.id]) }}</span>
              </div>
            </div>
          </div>

          <!-- Preview issues -->
          <div v-if="fullPreview.issues.length > 0" class="p-4 rw-divider-b">
            <span class="rw-text-label">构建问题</span>
            <div class="mt-1 flex flex-col gap-1">
              <div
                v-for="(issue, idx) in fullPreview.issues"
                :key="issueKeys[idx]"
                class="rw-text-desc text-xs"
                :class="issue.severity === 'o_error' ? 'text-negative' : 'text-warning'"
              >
                {{ issue.message }}
              </div>
            </div>
          </div>

          <!-- Send section -->
          <div class="p-4 mt-auto">
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

              <!-- Field values editor (D-S7: uses FieldEditWidget) -->
              <div v-if="editFrameFields.length > 0" class="rw-dialog-scroll-body">
                <FieldEditWidget
                  :fields="editFrameFields"
                  :values="editValues"
                  direction="send"
                  @update:values="editValues = $event"
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

.hex-preview {
  background: var(--rw-color-surface-elevated);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
