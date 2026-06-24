<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useQuasar } from 'quasar';
import type { DisplayGroupConfig, DisplayGroupFrameEntry } from '../core';
import { serializeGroups, parseGroupsFromJson } from '../core';
import type { FrameAssetSummary, FrameAssetReader, FrameFieldReference } from '@/features/frame';
import { getFileFacade } from '@/platform';
import { useNotify } from '@/shared/composables';

interface Props {
  modelValue: boolean;
  groups: readonly DisplayGroupConfig[];
  receiveFrames: readonly FrameAssetSummary[];
  frameReader: FrameAssetReader;
}

const props = defineProps<Props>();

const $q = useQuasar();
const notify = useNotify();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'save': [groups: readonly DisplayGroupConfig[]];
}>();

const editingGroups = ref<DisplayGroupConfig[]>([]);
const selectedGroupId = ref<string | null>(null);

watch(() => props.modelValue, (open) => {
  if (open) {
    editingGroups.value = props.groups.map((g) => ({
      id: g.id,
      label: g.label,
      frames: g.frames.map((f) => ({ frameId: f.frameId, visibleFieldIds: [...f.visibleFieldIds] })),
    }));
    selectedGroupId.value = editingGroups.value.length > 0 ? editingGroups.value[0].id : null;
  }
});

const selectedGroup = computed(() =>
  editingGroups.value.find((g) => g.id === selectedGroupId.value) ?? null,
);

const usedFrameIds = computed(() => {
  const ids = new Set<string>();
  for (const g of editingGroups.value) {
    for (const f of g.frames) {
      ids.add(f.frameId);
    }
  }
  return ids;
});

const availableReceiveFrames = computed(() =>
  props.receiveFrames.filter((f) => !usedFrameIds.value.has(f.id) || selectedGroup.value?.frames.some((ef) => ef.frameId === f.id)),
);

const fieldsByFrame = computed(() => {
  const map = new Map<string, FrameFieldReference[]>();
  if (!selectedGroup.value) return map;
  for (const entry of selectedGroup.value.frames) {
    map.set(entry.frameId, props.frameReader.listFieldReferences({ frameId: entry.frameId }));
  }
  return map;
});

function createGroup(): void {
  const id = `group-${crypto.randomUUID().slice(0, 8)}`;
  const newGroup: DisplayGroupConfig = { id, label: '新分组', frames: [] };
  editingGroups.value.push(newGroup);
  selectedGroupId.value = id;
}

function deleteGroup(): void {
  if (!selectedGroupId.value) return;
  const group = selectedGroup.value;
  if (!group) return;

  const doDelete = () => {
    editingGroups.value = editingGroups.value.filter((g) => g.id !== selectedGroupId.value);
    selectedGroupId.value = editingGroups.value.length > 0 ? editingGroups.value[0].id : null;
  };

  if (group.frames.length > 0) {
    $q.dialog({
      title: '删除分组',
      message: `分组"${group.label}"包含 ${group.frames.length} 个帧，确认删除？`,
      cancel: true,
      persistent: true,
    }).onOk(doDelete);
  } else {
    doDelete();
  }
}

function renameGroup(label: string): void {
  const group = selectedGroup.value;
  if (!group) return;
  group.label = label || group.id;
}

function addFrameToGroup(frameId: string): void {
  const group = selectedGroup.value;
  if (!group) return;
  if (group.frames.some((f) => f.frameId === frameId)) return;
  group.frames.push({ frameId, visibleFieldIds: [] });
}

function removeFrameFromGroup(frameId: string): void {
  const group = selectedGroup.value;
  if (!group) return;
  group.frames = group.frames.filter((f) => f.frameId !== frameId);
}

function toggleField(entry: DisplayGroupFrameEntry, fieldId: string): void {
  const idx = entry.visibleFieldIds.indexOf(fieldId);
  if (idx === -1) {
    entry.visibleFieldIds.push(fieldId);
  } else {
    entry.visibleFieldIds.splice(idx, 1);
  }
}

function save(): void {
  emit('save', editingGroups.value.map((g) => ({
    id: g.id,
    label: g.label,
    frames: g.frames.map((f) => ({ frameId: f.frameId, visibleFieldIds: [...f.visibleFieldIds] })),
  })));
}

function close(): void {
  emit('update:modelValue', false);
}

// ===== 导入导出（只导分组配置，导入完全替换 editingGroups，未保存前可取消）=====

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function onExport(): Promise<void> {
  if (editingGroups.value.length === 0) {
    notify.warning('当前没有分组可导出');
    return;
  }
  const json = serializeGroups(editingGroups.value);
  const defaultName = `display-groups-${timestamp()}.json`;
  const fileFacade = getFileFacade();
  if (fileFacade) {
    const path = await fileFacade.showSaveDialog({
      title: '导出分组配置',
      defaultPath: defaultName,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (path) {
      await fileFacade.writeTextFile(path, json);
      notify.success(`已导出 ${editingGroups.value.length} 个分组`);
    }
  } else {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(url);
    notify.success(`已下载 ${editingGroups.value.length} 个分组`);
  }
}

async function onImport(): Promise<void> {
  const fileFacade = getFileFacade();
  let text: string | null = null;
  if (fileFacade) {
    const path = await fileFacade.showOpenDialog({
      title: '导入分组配置',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (!path) return;
    text = await fileFacade.readTextFile(path);
  } else {
    // 浏览器降级：用隐藏 <input type=file> 读单个文件。
    text = await new Promise<string | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      };
      input.click();
    });
  }
  if (text === null) return;

  let parsed: DisplayGroupConfig[];
  try {
    parsed = parseGroupsFromJson(text);
  } catch (e) {
    notify.error(`导入失败：${(e as Error).message}`);
    return;
  }

  // 完全替换：确认后清空 editingGroups 填入导入内容（还没保存，用户可继续改/取消）。
  $q.dialog({
    title: '导入分组',
    message: `将导入 ${parsed.length} 个分组，完全替换当前的 ${editingGroups.value.length} 个分组。\n（导入后需点"保存"才生效）`,
    cancel: true,
    persistent: true,
    ok: { label: '替换', color: 'primary' },
  }).onOk(() => {
    editingGroups.value = parsed;
    selectedGroupId.value = parsed.length > 0 ? parsed[0]!.id : null;
    notify.success(`已载入 ${parsed.length} 个分组，记得保存`);
  });
}
</script>

<template>
  <q-dialog :model-value="modelValue" persistent @update:model-value="close">
    <q-card class="rw-dialog-lg">
      <q-card-section class="flex items-center justify-between">
        <div class="text-h6">分组管理</div>
        <div class="flex gap-2">
          <q-btn flat dense icon="o_upload" color="primary" size="sm" no-caps @click="onImport">
            <q-tooltip>从 JSON 文件导入分组（完全替换）</q-tooltip>
            导入
          </q-btn>
          <q-btn flat dense icon="o_download" color="primary" size="sm" no-caps :disable="editingGroups.length === 0" @click="onExport">
            <q-tooltip>导出当前分组为 JSON</q-tooltip>
            导出
          </q-btn>
        </div>
      </q-card-section>

      <q-card-section class="q-pt-none">
        <div class="flex gap-4 h-80">
          <!-- Left: group list -->
          <div class="flex flex-col w-1/3 border rounded overflow-hidden">
            <div class="flex items-center justify-between px-3 py-2 rw-divider-b">
              <span class="rw-text-label">分组列表</span>
              <q-btn flat round dense icon="add" size="sm" color="primary" @click="createGroup">
                <q-tooltip>新建分组</q-tooltip>
              </q-btn>
            </div>
            <q-list dense class="flex-1 overflow-y-auto">
              <q-item
                v-for="group in editingGroups"
                :key="group.id"
                clickable
                :active="selectedGroupId === group.id"
                active-class="rw-surface-selected"
                @click="selectedGroupId = group.id"
              >
                <q-item-section>
                  <q-input
                    :model-value="group.label"
                    dense
                    flat
                    borderless
                    class="q-pa-none"
                    @update:model-value="renameGroup($event)"
                  />
                </q-item-section>
              </q-item>
              <q-item v-if="editingGroups.length === 0">
                <q-item-section class="text-center">
                  <span class="rw-text-desc text-xs">暂无分组</span>
                </q-item-section>
              </q-item>
            </q-list>
            <div v-if="selectedGroupId" class="px-3 py-2 rw-divider-t">
              <q-btn
                flat
                dense
                label="删除分组"
                color="grey"
                size="sm"
                @click="deleteGroup"
              />
            </div>
          </div>

          <!-- Right: group detail -->
          <div class="flex flex-col flex-1 border rounded overflow-hidden">
            <template v-if="selectedGroup">
              <div class="px-3 py-2 rw-divider-b">
                <span class="rw-text-label">{{ selectedGroup.label }} — 帧配置</span>
              </div>

              <!-- Add frame -->
              <div class="px-3 py-2 rw-divider-b">
                <q-select
                  :options="availableReceiveFrames.map((f) => ({ value: f.id, label: f.name }))"
                  emit-value
                  map-options
                  outlined
                  dense
                  placeholder="添加接收帧"
                  class="w-full"
                  @update:model-value="addFrameToGroup($event)"
                />
              </div>

              <!-- Frame list with field checkboxes -->
              <div class="flex-1 overflow-y-auto px-3 py-2">
                <div v-for="entry in selectedGroup.frames" :key="entry.frameId" class="mb-3">
                  <div class="flex items-center justify-between mb-1">
                    <span class="rw-text-value text-sm">{{ receiveFrames.find((f) => f.id === entry.frameId)?.name ?? entry.frameId }}</span>
                    <q-btn flat round dense icon="close" size="xs" color="grey" @click="removeFrameFromGroup(entry.frameId)">
                      <q-tooltip>移除帧</q-tooltip>
                    </q-btn>
                  </div>
                  <div class="flex flex-wrap gap-1">
                    <q-chip
                      v-for="field in (fieldsByFrame.get(entry.frameId) ?? [])"
                      :key="field.fieldId"
                      :outline="!entry.visibleFieldIds.includes(field.fieldId)"
                      :color="entry.visibleFieldIds.includes(field.fieldId) ? 'primary' : 'grey'"
                      text-color="white"
                      dense
                      clickable
                      size="sm"
                      @click="toggleField(entry, field.fieldId)"
                    >
                      {{ field.fieldName }}
                    </q-chip>
                    <span v-if="(fieldsByFrame.get(entry.frameId) ?? []).length === 0" class="rw-text-desc text-xs">
                      该帧无字段定义
                    </span>
                  </div>
                </div>
                <div v-if="selectedGroup.frames.length === 0" class="text-center py-4">
                  <span class="rw-text-desc text-xs">请在上方下拉添加接收帧</span>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="flex items-center justify-center flex-1">
                <span class="rw-text-desc">请选择或创建分组</span>
              </div>
            </template>
          </div>
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="取消" @click="close" />
        <q-btn color="primary" label="保存" @click="save" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
