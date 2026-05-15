<script setup lang="ts">
import { shallowRef, watch } from 'vue';
import { useQuasar } from 'quasar';
import type { FrameFieldDefinition } from '@/features/frame';
import { frameFieldColumns } from './field-columns';
import { INPUT_TYPE_LABELS, PARTICIPATION_LABELS } from './field-labels';

const props = defineProps<{
  fields: readonly FrameFieldDefinition[];
}>();

const emit = defineEmits<{
  add: [];
  edit: [index: number];
  remove: [index: number];
  copy: [index: number];
  'move-up': [index: number];
  'move-down': [index: number];
}>();

const $q = useQuasar();

interface FieldRow {
  readonly id: string;
  readonly name: string;
  readonly dataType: string;
  readonly length: string;
  readonly dataParticipationType: string;
  readonly inputType: string;
  readonly _index: number;
}

const tableRows = shallowRef<FieldRow[]>([]);
const totalBytes = shallowRef(0);

watch(
  () => props.fields,
  (fields) => {
    tableRows.value = fields.map((field, index) => ({
      id: field.id || `field_${index}`,
      name: field.name || '--',
      dataType: field.dataType,
      length: `${field.length}B`,
      dataParticipationType:
        PARTICIPATION_LABELS[field.dataParticipationType] ?? field.dataParticipationType,
      inputType: INPUT_TYPE_LABELS[field.inputType] ?? field.inputType,
      _index: index,
    }));
    totalBytes.value = fields.reduce((sum, f) => sum + f.length, 0);
  },
  { immediate: true },
);

function confirmRemove(index: number): void {
  const name = props.fields[index]?.name || '';
  $q
    .dialog({
      title: '确认删除',
      message: `确定删除字段"${name}"吗？`,
      cancel: true,
      persistent: true,
    })
    .onOk(() => emit('remove', index));
}
</script>

<template>
  <q-card flat bordered>
    <q-card-section>
      <div class="flex items-center justify-between mb-3">
        <div>
          <span class="rw-text-label text-body2">字段列表</span>
          <span class="rw-text-desc ml-2">
            {{ fields.length }}项 / 总长: {{ totalBytes }}B
          </span>
        </div>
        <q-btn
          flat
          dense
          no-caps
          icon="o_add"
          label="添加字段"
          color="primary"
          @click="emit('add')"
        />
      </div>

      <q-table
        flat
        :columns="frameFieldColumns"
        :rows="tableRows"
        row-key="id"
        :rows-per-page-options="[0]"
        hide-pagination
        @row-click="(_evt: MouseEvent, row: FieldRow) => { if (!((_evt.target as HTMLElement)?.closest?.('button'))) emit('edit', row._index) }"
      >
        <template #no-data>
          <div class="text-center w-full p-4 rw-text-label">暂无字段</div>
        </template>

        <template #body-cell-name="s">
          <q-td :props="s">
            <span class="rw-text-value">{{ s.row.name }}</span>
          </q-td>
        </template>

        <template #body-cell-dataType="s">
          <q-td :props="s">
            <span class="rw-text-desc">{{ s.row.dataType }}</span>
          </q-td>
        </template>

        <template #body-cell-dataParticipationType="s">
          <q-td :props="s">
            <span class="rw-text-desc">{{ s.row.dataParticipationType }}</span>
          </q-td>
        </template>

        <template #body-cell-inputType="s">
          <q-td :props="s">
            <span class="rw-text-desc">{{ s.row.inputType }}</span>
          </q-td>
        </template>

        <template #body-cell-_actions="s">
          <q-td :props="s">
            <div class="flex items-center justify-center gap-1">
              <q-btn
                flat
                round
                dense
                icon="o_arrow_upward"
                size="sm"
                color="primary"
                :disable="s.row._index === 0"
                @click="emit('move-up', s.row._index)"
              />
              <q-btn
                flat
                round
                dense
                icon="o_arrow_downward"
                size="sm"
                color="primary"
                :disable="s.row._index === fields.length - 1"
                @click="emit('move-down', s.row._index)"
              />
              <q-btn
                flat
                round
                dense
                icon="o_edit"
                size="sm"
                color="primary"
                @click="emit('edit', s.row._index)"
              />
              <q-btn
                flat
                round
                dense
                icon="o_content_copy"
                size="sm"
                color="primary"
                @click="emit('copy', s.row._index)"
              />
              <q-btn
                flat
                round
                dense
                icon="o_delete"
                size="sm"
                color="negative"
                @click="confirmRemove(s.row._index)"
              />
            </div>
          </q-td>
        </template>
      </q-table>
    </q-card-section>
  </q-card>
</template>
