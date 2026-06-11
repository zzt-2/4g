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

// Query state
const searchText = ref('');
const directionFilter = ref<FrameDirection | ''>('');
const favoriteOnly = ref(false);

// Selection & detail panel
const selectedFrameIds = ref<string[]>([]);
const showDetailPanel = ref(false);
const showImportDialog = ref(false);

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
  void runtime.persistence.saveFrames();
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
    void runtime.persistence.saveFrames();
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
      void runtime.persistence.saveFrames();
      notify.success('已删除');
    }
  });
}

function onImportConfirm(frames: FrameAsset[]): void {
  const result = frameService.replaceFrames(frames);
  if (result.ok) {
    refreshList();
    void runtime.persistence.saveFrames();
    notify.success(`成功导入 ${frames.length} 个帧定义`);
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
          </template>
        </TableToolbar>
      </div>

      <!-- Content: table + detail panel -->
      <div class="flex flex-1 overflow-hidden">
        <!-- Data table -->
        <div class="flex-1">
          <DataTable
            :columns="frameListColumns"
            :rows="tableRows"
            row-key="id"
            selection="single"
            :selected="selectedRows"
            container-height="calc(100vh - 160px)"
            @row-click="(_row: TableRow, _index: number) => onRowClick(_row)"
            @update:selected="onSelectionChange"
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
                <div class="flex items-center justify-center gap-1">
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
