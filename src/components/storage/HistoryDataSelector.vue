<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import type { DataItemSelection, GroupMetadata } from '../../types/storage/historyData';
import { useHistoryAnalysisStore } from '../../stores/historyAnalysis';

// Props
interface Props {
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const $q = useQuasar();
const historyStore = useHistoryAnalysisStore();

// 本地状态
const searchText = ref('');
const expandedGroups = ref<Set<number>>(new Set());

// 计算属性
const metadata = computed(() => historyStore.loadedMetadata);
const dataItemSelections = computed(() => historyStore.dataItemSelections);
const selectedItemsCount = computed(() => historyStore.selectedItemsCount);
const isLoading = computed(() => historyStore.isLoading);

// 筛选后的数据项
const filteredSelections = computed(() => {
  let filtered = dataItemSelections.value;

  // 文本搜索过滤
  if (searchText.value.trim()) {
    const search = searchText.value.toLowerCase();
    filtered = filtered.filter((selection) => {
      const group = metadata.value.find((g) => g.id === selection.groupId);
      const groupLabel = group?.label.toLowerCase() || '';
      const itemLabel =
        group?.dataItems.find((item) => item.id === selection.dataItemId)?.label.toLowerCase() ||
        '';

      return groupLabel.includes(search) || itemLabel.includes(search);
    });
  }

  return filtered;
});

// 按分组组织的数据项
const groupedSelections = computed(() => {
  const groups: Record<
    number,
    {
      group: GroupMetadata;
      selections: DataItemSelection[];
      selectedCount: number;
      totalCount: number;
    }
  > = {};

  filteredSelections.value.forEach((selection) => {
    const group = metadata.value.find((g) => g.id === selection.groupId);
    if (!group) return;

    if (!groups[selection.groupId]) {
      groups[selection.groupId] = {
        group,
        selections: [],
        selectedCount: 0,
        totalCount: 0,
      };
    }

    const groupData = groups[selection.groupId];
    if (groupData) {
      groupData.selections.push(selection);
      groupData.totalCount++;
      if (selection.selected) {
        groupData.selectedCount++;
      }
    }
  });

  return Object.values(groups).sort((a, b) => a.group.label.localeCompare(b.group.label));
});

// 切换数据项选择状态
const toggleDataItemSelection = (groupId: number, dataItemId: number): void => {
  const selection = dataItemSelections.value.find(
    (item) => item.groupId === groupId && item.dataItemId === dataItemId,
  );

  if (selection) {
    const newSelected = !selection.selected;
    historyStore.updateDataItemSelection(groupId, dataItemId, newSelected);
  }
};

// 切换分组选择状态
const toggleGroupSelection = (groupId: number): void => {
  const groupData = groupedSelections.value.find((g) => g.group.id === groupId);
  if (!groupData) return;

  const allSelected = groupData.selectedCount === groupData.totalCount;
  const newSelected = !allSelected;

  historyStore.toggleGroupSelection(groupId, newSelected);
};

// 切换分组展开状态
const toggleGroupExpanded = (groupId: number): void => {
  if (expandedGroups.value.has(groupId)) {
    expandedGroups.value.delete(groupId);
  } else {
    expandedGroups.value.add(groupId);
  }
};

// 清空所有选择
const clearAllSelections = (): void => {
  historyStore.clearAllSelections();

  $q.notify({
    type: 'info',
    message: '已清空所有选择',
    position: 'top',
  });
};

// 全选所有可见项
const selectAllVisible = (): void => {
  filteredSelections.value.forEach((selection) => {
    if (!selection.selected) {
      historyStore.updateDataItemSelection(selection.groupId, selection.dataItemId, true);
    }
  });

  $q.notify({
    type: 'positive',
    message: `已选择 ${filteredSelections.value.length} 个数据项`,
    position: 'top',
  });
};

// 获取数据项颜色
const getDataItemColor = (groupId: number, dataItemId: number): string => {
  // 根据数据项ID生成颜色
  const colors = [
    '#3b82f6',
    '#ef4444',
    '#10b981',
    '#f59e0b',
    '#8b5cf6',
    '#06b6d4',
    '#84cc16',
    '#f97316',
    '#6366f1',
    '#ec4899',
    '#14b8a6',
    '#eab308',
  ];

  const index = (groupId * 100 + dataItemId) % colors.length;
  return colors[index] || '#3b82f6';
};

// 监听数据变化，自动展开第一个分组
watch(
  groupedSelections,
  (newGroups) => {
    if (newGroups.length > 0 && expandedGroups.value.size === 0) {
      const firstGroup = newGroups[0];
      if (firstGroup) {
        expandedGroups.value.add(firstGroup.group.id);
      }
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="bg-industrial-panel border border-industrial rounded p-2 space-y-2">
    <div class="flex items-center justify-between">
      <h3 class="text-industrial-primary text-sm font-medium">数据项选择</h3>
      <div class="text-industrial-tertiary text-xs">已选择: {{ selectedItemsCount }} 项</div>
    </div>

    <!-- 搜索 -->
    <div class="space-y-2">
      <q-input
        v-model="searchText"
        placeholder="搜索数据项..."
        dense
        outlined
        clearable
        class="text-xs"
        input-class="text-industrial-primary"
        :disabled="disabled || isLoading"
      >
        <template #prepend>
          <q-icon name="search" class="text-industrial-secondary" />
        </template>
      </q-input>
    </div>

    <!-- 操作按钮 -->
    <div class="flex gap-1">
      <q-btn
        flat
        dense
        label="全选可见"
        icon="select_all"
        size="sm"
        class="flex-1 bg-industrial-secondary border border-industrial-highlight text-industrial-accent hover:bg-industrial-highlight text-xs"
        :disabled="disabled || isLoading || filteredSelections.length === 0"
        @click="selectAllVisible"
      />
      <q-btn
        flat
        dense
        label="清空选择"
        icon="clear_all"
        size="sm"
        class="flex-1 bg-industrial-secondary border border-industrial-highlight text-industrial-accent hover:bg-industrial-highlight text-xs"
        :disabled="disabled || isLoading || selectedItemsCount === 0"
        @click="clearAllSelections"
      />
    </div>

    <!-- 数据项列表 -->
    <div class="space-y-1 h-100 overflow-y-auto">
      <div
        v-for="groupData in groupedSelections"
        :key="groupData.group.id"
        class="border border-industrial rounded"
      >
        <!-- 分组标题 -->
        <div
          class="flex items-center justify-between p-2 bg-industrial-secondary hover:bg-industrial-highlight cursor-pointer"
          @click="toggleGroupExpanded(groupData.group.id)"
        >
          <div class="flex items-center gap-2">
            <q-icon
              :name="expandedGroups.has(groupData.group.id) ? 'expand_more' : 'chevron_right'"
              class="text-industrial-secondary"
            />
            <span class="text-industrial-primary text-xs font-medium">
              {{ groupData.group.label }}
            </span>
            <q-badge
              :label="`${groupData.selectedCount}/${groupData.totalCount}`"
              :color="groupData.selectedCount > 0 ? 'positive' : 'grey'"
              class="text-xs"
            />
          </div>

          <q-btn
            flat
            dense
            :icon="
              groupData.selectedCount === groupData.totalCount
                ? 'check_box'
                : 'check_box_outline_blank'
            "
            size="sm"
            class="text-industrial-accent hover:bg-industrial-highlight"
            :disabled="disabled || isLoading"
            @click.stop="toggleGroupSelection(groupData.group.id)"
          >
            <q-tooltip>
              {{ groupData.selectedCount === groupData.totalCount ? '取消全选' : '全选分组' }}
            </q-tooltip>
          </q-btn>
        </div>

        <!-- 数据项列表 -->
        <div v-show="expandedGroups.has(groupData.group.id)" class="space-y-1 p-2">
          <div
            v-for="selection in groupData.selections"
            :key="`${selection.groupId}-${selection.dataItemId}`"
            class="flex items-center justify-between p-2 hover:bg-industrial-highlight rounded cursor-pointer"
            @click="toggleDataItemSelection(selection.groupId, selection.dataItemId)"
          >
            <div class="flex items-center gap-2 flex-1">
              <div
                class="w-3 h-3 rounded-full border border-gray-400"
                :style="{
                  backgroundColor: selection.selected
                    ? getDataItemColor(selection.groupId, selection.dataItemId)
                    : 'transparent',
                }"
              />
              <span class="text-industrial-primary text-xs">
                {{
                  groupData.group.dataItems.find((item) => item.id === selection.dataItemId)
                    ?.label ?? '未知'
                }}
              </span>
            </div>

            <q-checkbox
              :model-value="selection.selected"
              size="sm"
              class="text-industrial-accent"
              :disabled="disabled || isLoading"
              @click.stop
              @update:model-value="toggleDataItemSelection(selection.groupId, selection.dataItemId)"
            />
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div
        v-if="groupedSelections.length === 0"
        class="text-center text-industrial-secondary text-xs py-8"
      >
        <q-icon name="inbox" size="md" class="block mx-auto mb-2" />
        <div v-if="isLoading">正在加载数据项...</div>
        <div v-else-if="searchText">未找到匹配的数据项</div>
        <div v-else>暂无可用数据项</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 自定义滚动条 */
.max-h-80::-webkit-scrollbar {
  width: 6px;
}

.max-h-80::-webkit-scrollbar-track {
  background: #0f2744;
}

.max-h-80::-webkit-scrollbar-thumb {
  background: #1a3663;
  border-radius: 3px;
}

.max-h-80::-webkit-scrollbar-thumb:hover {
  background: #93c5fd;
}
</style>
