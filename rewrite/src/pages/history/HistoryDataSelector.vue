<script setup lang="ts">
import { computed, ref } from 'vue';
import type { DataItemGroup } from './useHistoryData';

interface Props {
  hierarchy: readonly DataItemGroup[];
  selected: Set<string>;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:selected': [value: Set<string>];
}>();

const search = ref('');
const expandedGroups = ref(new Set<string>());

const filteredHierarchy = computed(() => {
  if (!search.value) return props.hierarchy;
  const q = search.value.toLowerCase();
  return props.hierarchy
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => group.label.toLowerCase().includes(q) || item.key.toLowerCase().includes(q),
      ),
    }))
    .filter((group) => group.items.length > 0);
});

function toggleItem(fieldId: string): void {
  const next = new Set(props.selected);
  if (next.has(fieldId)) {
    next.delete(fieldId);
  } else {
    next.add(fieldId);
  }
  emit('update:selected', next);
}

function toggleGroup(groupId: string): void {
  const group = props.hierarchy.find((g) => g.groupId === groupId);
  if (!group) return;
  const allSelected = group.items.every((item) => props.selected.has(item.fieldId));
  const next = new Set(props.selected);
  if (allSelected) {
    for (const item of group.items) next.delete(item.fieldId);
  } else {
    for (const item of group.items) next.add(item.fieldId);
  }
  emit('update:selected', next);
}

function selectAllVisible(): void {
  const next = new Set(props.selected);
  for (const group of filteredHierarchy.value) {
    for (const item of group.items) next.add(item.fieldId);
  }
  emit('update:selected', next);
}

function clearAll(): void {
  emit('update:selected', new Set());
}

function groupState(groupId: string): 'all' | 'some' | 'none' {
  const group = props.hierarchy.find((g) => g.groupId === groupId);
  if (!group || group.items.length === 0) return 'none';
  const selectedCount = group.items.filter((item) => props.selected.has(item.fieldId)).length;
  if (selectedCount === 0) return 'none';
  if (selectedCount === group.items.length) return 'all';
  return 'some';
}

function toggleExpand(groupId: string): void {
  const next = new Set(expandedGroups.value);
  if (next.has(groupId)) {
    next.delete(groupId);
  } else {
    next.add(groupId);
  }
  expandedGroups.value = next;
}
</script>

<template>
  <div class="flex flex-col flex-1 overflow-hidden">
    <div class="px-4 py-2 flex items-center gap-2 rw-divider-b">
      <span class="rw-text-label">数据项</span>
      <q-space />
      <q-btn flat dense no-caps size="xs" label="全选" color="primary" @click="selectAllVisible" />
      <q-btn flat dense no-caps size="xs" label="清空" @click="clearAll" />
    </div>
    <div class="px-4 py-2">
      <q-input v-model="search" dense outlined placeholder="搜索..." clearable size="sm" />
    </div>
    <div class="flex-1 overflow-auto px-2 pb-2">
      <template v-if="filteredHierarchy.length === 0">
        <div class="text-center p-4 rw-text-label">暂无数据项</div>
      </template>
      <template v-for="group in filteredHierarchy" :key="group.groupId">
        <div class="mb-1">
          <div
            class="flex items-center gap-2 px-2 py-1 cursor-pointer rounded hover:bg-[var(--rw-color-surface-selected)]"
            @click="toggleExpand(group.groupId)"
          >
            <q-icon
              :name="expandedGroups.has(group.groupId) ? 'o_expand_more' : 'o_chevron_right'"
              size="18px"
              class="rw-text-label"
            />
            <q-checkbox
              :model-value="groupState(group.groupId) === 'all'"
              :indeterminate="groupState(group.groupId) === 'some'"
              dense
              @update:model-value="toggleGroup(group.groupId)"
              @click.stop
            />
            <span class="rw-text-value text-sm">{{ group.label }}</span>
            <span class="rw-text-label text-xs ml-auto">
              {{ group.items.filter((i) => selected.has(i.fieldId)).length }}/{{ group.items.length }}
            </span>
          </div>
          <div v-if="expandedGroups.has(group.groupId)" class="ml-8">
            <div
              v-for="item in group.items"
              :key="item.fieldId"
              class="flex items-center gap-2 px-2 py-0.5 rounded cursor-pointer hover:bg-[var(--rw-color-surface-selected)]"
              @click="toggleItem(item.fieldId)"
            >
              <q-checkbox
                :model-value="selected.has(item.fieldId)"
                dense
                @update:model-value="toggleItem(item.fieldId)"
                @click.stop
              />
              <span class="text-sm">{{ item.key }}</span>
              <span v-if="item.dataType !== 'numeric'" class="rw-text-label text-xs">({{ item.dataType }})</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
