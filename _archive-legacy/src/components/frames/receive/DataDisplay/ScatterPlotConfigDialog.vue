<script setup lang="ts">
import { reactive, watch, computed } from 'vue';
import { useReceiveFramesStore } from '../../../../stores/frames/receiveFramesStore';
import { useDataDisplayStore } from '../../../../stores/frames/dataDisplayStore';

export interface ConstellationConfig {
  bitWidth: number;
  sampleCount: number;
  pointSize?: number;
  iDataSource?: { frameId: string; fieldId: string };
  qDataSource?: { frameId: string; fieldId: string };
  refreshInterval?: number;
}

const props = defineProps<{
  modelValue: boolean;
  tableId: 'table1' | 'table2';
  title?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [visible: boolean];
}>();

const receiveFramesStore = useReceiveFramesStore();
const dataDisplayStore = useDataDisplayStore();

// 根据tableId获取对应的配置
const scatterConfig = computed(() =>
  props.tableId === 'table1' ? dataDisplayStore.table1ScatterConfig : dataDisplayStore.table2ScatterConfig
);

const local = reactive<ConstellationConfig>({
  bitWidth: 12,
  sampleCount: 16,
  pointSize: 3,
  refreshInterval: 1000,
  iDataSource: { frameId: '', fieldId: '' },
  qDataSource: { frameId: '', fieldId: '' },
});

// 监听store中的配置变化
watch(() => scatterConfig.value, (config) => {
  Object.assign(local, config);
}, { immediate: true, deep: true });

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

const getFieldOptions = (frameId: string) => {
  if (!frameId) return [];
  return receiveFramesStore.getAvailableFrameFieldOptions(frameId).map((option: any) => ({
    id: option.value,
    name: option.label.split(' (')[0],
  }));
};

const save = () => {
  // 直接调用store接口更新配置
  if (props.tableId === 'table1') {
    dataDisplayStore.updateTable1ScatterConfig(local);
  } else {
    dataDisplayStore.updateTable2ScatterConfig(local);
  }
  visible.value = false;
};

const close = () => visible.value = false;
</script>

<template>
  <q-dialog v-model="visible">
    <q-card class="bg-industrial-panel text-industrial-primary min-w-[380px]">
      <q-card-section class="text-sm font-medium">{{ title || '星座图配置' }}</q-card-section>
      <q-separator />

      <q-card-section class="space-y-4">
        <!-- I路数据源 -->
        <div>
          <div class="text-sm font-medium mb-2">I路数据源</div>
          <div class="grid grid-cols-2 gap-2">
            <q-select dense filled v-model="local.iDataSource!.frameId"
              :options="receiveFramesStore.receiveFrameOptions" option-value="id" option-label="name" emit-value
              map-options label="接收帧" />
            <q-select dense filled v-model="local.iDataSource!.fieldId"
              :options="getFieldOptions(local.iDataSource?.frameId || '')" option-value="id" option-label="name"
              emit-value map-options label="字段" :disable="!local.iDataSource?.frameId" />
          </div>
        </div>

        <!-- Q路数据源 -->
        <div>
          <div class="text-sm font-medium mb-2">Q路数据源</div>
          <div class="grid grid-cols-2 gap-2">
            <q-select dense filled v-model="local.qDataSource!.frameId"
              :options="receiveFramesStore.receiveFrameOptions" option-value="id" option-label="name" emit-value
              map-options label="接收帧" />
            <q-select dense filled v-model="local.qDataSource!.fieldId"
              :options="getFieldOptions(local.qDataSource?.frameId || '')" option-value="id" option-label="name"
              emit-value map-options label="字段" :disable="!local.qDataSource?.frameId" />
          </div>
        </div>

        <!-- 参数配置 -->
        <div class="grid grid-cols-2 gap-3">
          <q-input dense filled v-model.number="local.bitWidth" type="number" label="位宽(bit)" />
          <q-input dense filled v-model.number="local.sampleCount" type="number" label="每帧点数" />
          <q-input dense filled v-model.number="local.pointSize" type="number" label="点大小(px)" />
          <q-input dense filled v-model.number="local.refreshInterval" type="number" label="刷新间隔(ms)" />
        </div>
      </q-card-section>

      <q-separator />
      <q-card-actions align="right">
        <q-btn flat class="btn-industrial-secondary" label="取消" @click="close" />
        <q-btn flat class="btn-industrial-primary" label="保存" @click="save" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
