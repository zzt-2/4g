<script setup lang="ts" generic="T extends Record<string, unknown>">
import { computed, ref } from 'vue';
import type { QTableColumn, QTableProps } from 'quasar';

interface DataTableProps {
  columns: QTableColumn[];
  rows: readonly T[];
  rowKey: string;
  loading?: boolean;
  selection?: 'single' | 'multiple' | 'none';
  selected?: readonly T[];
  virtualScrollItemSize?: number;
  containerHeight?: string;
  /** 紧凑行高：td 纵向 padding 压到 2px、line-height 1.15（约 20px/行，默认约 36px）。 */
  compact?: boolean;
}

const props = withDefaults(defineProps<DataTableProps>(), {
  loading: false,
  selection: 'none',
  selected: () => [],
  virtualScrollItemSize: 36,
  containerHeight: 'calc(100vh - 200px)',
  compact: false,
});

const emit = defineEmits<{
  'row-click': [row: T, index: number, event: MouseEvent];
  'update:selected': [selected: T[]];
}>();

const tableRef = ref<QTableProps | null>(null);

const computedSelected = computed({
  get: () => [...props.selected],
  set: (val: T[]) => emit('update:selected', val),
});

const showSelection = computed(() => props.selection !== 'none');
</script>

<template>
  <q-table
    ref="tableRef"
    flat
    :dense="compact"
    :columns="columns"
    :rows="rows"
    :row-key="rowKey"
    :loading="loading"
    :selection="showSelection ? selection : undefined"
    v-model:selected="computedSelected"
    virtual-scroll
    :virtual-scroll-item-size="virtualScrollItemSize"
    :rows-per-page-options="[0]"
    :style="{ maxHeight: containerHeight }"
    :class="['data-table', { 'data-table--compact': compact }]"
    @row-click="(_evt: MouseEvent, row: T, index: number) => emit('row-click', row, index, _evt)"
  >
    <template #no-data>
      <div class="text-center w-full p-4 rw-text-label">
        暂无数据
      </div>
    </template>

    <template v-for="(_, slot) in $slots" #[slot]="scope">
      <slot :name="slot" v-bind="scope ?? {}" />
    </template>
  </q-table>
</template>

<style scoped lang="scss">
.data-table {
  border-radius: var(--rw-radius-panel);

  :deep(table) {
    table-layout: fixed;
    width: 100%;
  }

  :deep(td) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(th.q-table--col-auto-width),
  :deep(td.q-table--col-auto-width) {
    width: 48px;
    min-width: 48px;
  }

  // 紧凑模式：td 纵向 padding 8→2px + line-height 1.5→1.15，行高约 36→20px。
  // 用 DataTable 自身 scoped（proven 生效），避免父组件 :deep 穿透子组件根元素失效。
  &.data-table--compact :deep(tbody td) {
    padding-top: 2px;
    padding-bottom: 2px;
    line-height: 1.15;
  }
}
</style>
