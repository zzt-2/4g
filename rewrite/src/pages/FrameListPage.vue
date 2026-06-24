<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useRouter } from 'vue-router';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import DataTable from '@/widgets/DataTable.vue';
import TableToolbar from '@/widgets/TableToolbar.vue';
import FrameDetailPanel from '@/features/frame/components/FrameDetailPanel.vue';
import ImportFrameDialog from '@/features/frame/components/ImportFrameDialog.vue';
import { frameListColumns } from '@/features/frame/components/columns';
import {
  cloneFrameAsset,
  serializeFrames,
  type FrameAsset,
  type FrameAssetSummary,
  type FrameDirection,
  type ReadonlyFrameAsset,
} from '@/features/frame';
import { useToggleFavorite } from '@/features/frame/composables';
import { useNotify } from '@/shared/composables';
import { getFileFacade } from '@/platform';

const notify = useNotify();
const $q = useQuasar();
const router = useRouter();
const runtime = useRewriteRuntime();
const frameService = runtime.features.frameService;

// Reactive refresh — service state is non-reactive, so we track mutations manually
const refreshKey = ref(0);
function refreshList(): void {
  refreshKey.value++;
}

function onFrameMutation(): void {
  runtime.features.receiveService.refreshFrameReferences();
  void runtime.persistence.saveFrames();
}

// Query state
const searchText = ref('');
const directionFilter = ref<FrameDirection | ''>('');
const favoriteOnly = ref(false);

// Selection & detail panel
const selectedFrameIds = ref<string[]>([]);
const showDetailPanel = ref(false);
const showImportDialog = ref(false);

// ===== Batch delete mode =====
const batchMode = ref(false);
const batchSelectedRows = shallowRef<TableRow[]>([]);

function onBatchDelete(): void {
  if (batchSelectedRows.value.length === 0) return;
  const count = batchSelectedRows.value.length;
  $q.dialog({
    title: '确认批量删除',
    message: `确定要删除选中的 ${count} 个帧定义吗？此操作不可撤销。`,
    cancel: true,
    persistent: true,
  }).onOk(() => {
    let removed = 0;
    for (const row of batchSelectedRows.value) {
      const result = frameService.removeFrame(row.id);
      if (result.ok) removed++;
    }
    batchSelectedRows.value = [];
    selectedFrameIds.value = [];
    refreshList();
    onFrameMutation();
    notify.success(`已删除 ${removed} 个帧定义`);
  });
}

// 退出批量模式：清批量选中。单选 selectedFrameIds 不在此清（切回单选时由 onSelectionChange 自然重置）。
function exitBatchMode(): void {
  batchMode.value = false;
  batchSelectedRows.value = [];
}

// 切换批量模式：进入时额外清单选残留（避免单选选中在批量模式下显示不一致）。
function toggleBatchMode(): void {
  batchMode.value = !batchMode.value;
  batchSelectedRows.value = [];
  selectedFrameIds.value = [];
}

// Derived data
const frameList = computed<FrameAssetSummary[]>(() => {
  void refreshKey.value;
  return frameService.listFrames({
    query: searchText.value || undefined,
    direction: directionFilter.value || undefined,
    favoriteOnly: favoriteOnly.value || undefined,
  });
});

interface TableRow {
  readonly id: string;
  readonly name: string;
  readonly direction: FrameDirection;
  readonly fieldCount: number;
  readonly description?: string;
  readonly frameType?: string;
  readonly isFavorite: boolean;
  readonly _index: number;
}

const tableRows = shallowRef<TableRow[]>([]);
const selectedRows = shallowRef<TableRow[]>([]);

watch(frameList, (list) => {
  tableRows.value = list.map((frame, index) => ({ ...frame, _index: index + 1 }));
}, { immediate: true });

watch([tableRows, selectedFrameIds], ([rows, ids]) => {
  selectedRows.value = rows.filter((row) => ids.includes(row.id));
}, { immediate: true });

const detailFrame = computed<ReadonlyFrameAsset | null>(() => {
  if (selectedFrameIds.value.length !== 1) return null;
  return frameService.getFrame(selectedFrameIds.value[0]) ?? null;
});

// --- Operations ---

function onRowClick(row: TableRow): void {
  selectedFrameIds.value = [row.id];
  showDetailPanel.value = true;
  frameService.selectFrame(row.id);
}

function onSelectionChange(selected: TableRow[]): void {
  selectedFrameIds.value = selected.map((r) => r.id);
}

const { toggleFavorite } = useToggleFavorite(frameService, (msg) => notify.error(msg), () => {
  refreshList();
  onFrameMutation();
});

function cloneFrame(frame: FrameAssetSummary): void {
  const full = frameService.getFrame(frame.id);
  if (!full) return;
  const cloned = cloneFrameAsset(full);
  cloned.id = `${cloned.id}_copy`;
  cloned.name = `${cloned.name} (副本)`;
  const result = frameService.upsertFrame(cloned);
  if (result.ok) {
    refreshList();
    onFrameMutation();
    notify.success('已复制');
  } else {
    notify.error('复制失败');
  }
}

function removeFrame(frameId: string): void {
  $q.dialog({
    title: '确认删除',
    message: '确定要删除这个帧定义吗？此操作不可撤销。',
    cancel: true,
    persistent: true,
  }).onOk(() => {
    const result = frameService.removeFrame(frameId);
    if (result.ok) {
      selectedFrameIds.value = selectedFrameIds.value.filter((id) => id !== frameId);
      refreshList();
      onFrameMutation();
      notify.success('已删除');
    }
  });
}

function onImportConfirm(frames: FrameAsset[]): void {
  // 追加语义:逐条 upsert,已存在的 id 跳过(不覆盖本地修改),完成后提示。
  const existingIds = new Set(frameService.findFrames().map((f) => f.id));
  let added = 0;
  let skipped = 0;
  let failed = 0;
  for (const frame of frames) {
    if (existingIds.has(frame.id)) {
      skipped++;
      continue;
    }
    const result = frameService.upsertFrame(frame);
    if (result.ok) {
      added++;
    } else {
      failed++;
    }
  }
  refreshList();
  onFrameMutation();

  if (added > 0) {
    const parts = [`新增 ${added} 个`];
    if (skipped > 0) parts.push(`跳过 ${skipped} 个重复`);
    if (failed > 0) parts.push(`${failed} 个失败`);
    notify.success(parts.join('，'));
  } else if (skipped > 0) {
    notify.warning(`全部 ${skipped} 个帧已存在，已跳过`);
  } else {
    notify.error('导入失败');
  }
}

async function onExport(): Promise<void> {
  const allFrames = frameService.findFrames();
  const json = serializeFrames(allFrames);

  const fileFacade = getFileFacade();
  if (fileFacade) {
    const path = await fileFacade.showSaveDialog({
      title: '导出帧定义',
      defaultPath: 'frames.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (path) {
      await fileFacade.writeTextFile(path, json);
      notify.success('导出成功');
    }
  } else {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'frames.json';
    a.click();
    URL.revokeObjectURL(url);
    notify.success('已下载');
  }
}

function onCloseDetail(): void {
  showDetailPanel.value = false;
}

function onEditFrame(frameId: string): void {
  if (frameId === 'new') {
    router.push('/frames/editor');
  } else {
    router.push(`/frames/editor/${frameId}`);
  }
}
</script>

<template>
  <q-page class="frame-list-page min-h-full">
    <div class="flex flex-col h-full">
      <!-- Toolbar -->
      <div class="p-4 pb-3 rw-divider-b">
        <TableToolbar
          v-model:search-model-value="searchText"
          search-placeholder="搜索帧名称 / ID / 描述"
        >
          <template #filters>
            <q-btn
              outline
              dense
              no-caps
              :color="directionFilter === 'receive' ? 'positive' : 'grey'"
              label="接收"
              @click="directionFilter = directionFilter === 'receive' ? '' : 'receive'"
            />
            <q-btn
              outline
              dense
              no-caps
              :color="directionFilter === 'send' ? 'info' : 'grey'"
              label="发送"
              @click="directionFilter = directionFilter === 'send' ? '' : 'send'"
            />
            <q-btn
              outline
              dense
              no-caps
              :color="favoriteOnly ? 'warning' : 'grey'"
              icon="o_star"
              @click="favoriteOnly = !favoriteOnly"
            />
          </template>

          <template #actions>
            <template v-if="batchMode">
              <!-- 批量模式：替换式 actions（新建/导入/导出临时隐藏） -->
              <q-btn
                flat dense no-caps
                icon="o_delete"
                label="删除选中"
                color="negative"
                size="sm"
                :disable="batchSelectedRows.length === 0"
                @click="onBatchDelete"
              />
              <span class="rw-text-desc text-xs">{{ batchSelectedRows.length }} 项已选中</span>
              <q-space />
              <q-btn
                flat dense no-caps
                label="退出批量模式"
                size="sm"
                @click="exitBatchMode"
              />
            </template>
            <template v-else>
              <!-- 正常模式：原 actions -->
              <q-btn
                outline
                color="primary"
                icon="o_add"
                label="新建"
                dense
                no-caps
                @click="onEditFrame('new')"
              />
              <q-btn
                outline
                color="primary"
                icon="o_upload"
                label="导入"
                dense
                no-caps
                @click="showImportDialog = true"
              />
              <q-btn
                outline
                color="primary"
                icon="o_download"
                label="导出"
                dense
                no-caps
                :disable="frameList.length === 0"
                @click="onExport"
              />
              <q-btn
                flat
                dense
                no-caps
                size="sm"
                :icon="batchMode ? 'o_close' : 'o_checklist'"
                :label="batchMode ? '退出批量' : '批量管理'"
                :color="batchMode ? 'negative' : 'grey'"
                @click="toggleBatchMode"
              />
            </template>
          </template>
        </TableToolbar>
      </div>

      <!-- Content: table + detail panel -->
      <div class="flex flex-1 overflow-hidden">
        <!-- Data table -->
        <div class="flex-1 flex flex-col overflow-hidden">
          <DataTable
            :columns="frameListColumns"
            :rows="tableRows"
            row-key="id"
            :selection="batchMode ? 'multiple' : 'none'"
            :selected="batchMode ? batchSelectedRows : selectedRows"
            container-height="calc(100vh - 160px)"
            @row-click="(_row: TableRow, _index: number) => { if (!batchMode) onRowClick(_row) }"
            @update:selected="batchMode ? (batchSelectedRows = $event as TableRow[]) : onSelectionChange($event as TableRow[])"
          >
            <template #body-cell-_index="props">
              <q-td :props="props">
                {{ props.row._index }}
              </q-td>
            </template>

            <template #body-cell-direction="props">
              <q-td :props="props">
                <q-chip
                  dense
                  :color="props.row.direction === 'receive' ? 'positive' : 'info'"
                  text-color="white"
                  :label="props.row.direction === 'receive' ? '接收' : '发送'"
                />
              </q-td>
            </template>

            <template #body-cell-frameType="props">
              <q-td :props="props">
                <span class="rw-text-value">{{ props.row.frameType || '--' }}</span>
              </q-td>
            </template>

            <template #body-cell-isFavorite="props">
              <q-td :props="props">
                <q-btn
                  flat
                  round
                  dense
                  :icon="props.row.isFavorite ? 'o_star' : 'o_star_border'"
                  :color="props.row.isFavorite ? 'warning' : 'grey'"
                  size="sm"
                  @click.stop="toggleFavorite(props.row)"
                />
              </q-td>
            </template>

            <template #body-cell-_actions="props">
              <q-td :props="props">
                <div v-if="!batchMode" class="flex items-center justify-center gap-1">
                  <q-btn flat round dense icon="o_edit" size="sm" color="primary" @click.stop="onEditFrame(props.row.id)" />
                  <q-btn flat round dense icon="o_content_copy" size="sm" color="primary" @click.stop="cloneFrame(props.row)" />
                  <q-btn flat round dense icon="o_delete" size="sm" color="negative" @click.stop="removeFrame(props.row.id)" />
                </div>
              </q-td>
            </template>
          </DataTable>
        </div>

        <!-- Detail panel -->
        <div v-if="showDetailPanel" class="w-[320px] flex-shrink-0">
          <FrameDetailPanel
            v-if="detailFrame"
            :frame="detailFrame"
            @close="onCloseDetail"
            @edit="onEditFrame"
          />
          <div v-else class="flex flex-col items-center justify-center h-full rw-panel-base rw-divider-l gap-3 p-4">
            <q-icon name="o_info" size="32px" color="grey" />
            <span class="text-sm rw-text-desc">选择一个帧查看详情</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Import dialog -->
    <ImportFrameDialog
      v-model="showImportDialog"
      @confirm="onImportConfirm"
    />
  </q-page>
</template>

<style scoped lang="scss">
.frame-list-page {
  background: var(--rw-color-surface-app);
}
</style>
