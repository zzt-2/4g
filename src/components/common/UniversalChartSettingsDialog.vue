<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { YAxisConfig } from '../../types/storage/historyData';

// 统一的数据项接口
interface DataItem {
  id: number; // 唯一ID，用于选择逻辑
  label: string; // 显示标签
  displayValue?: string; // 可选的显示值
  groupId?: number; // 历史模式需要，用于最终转换
  dataItemId?: number; // 历史模式需要，用于最终转换
  color?: string; // 可选的颜色
}

const props = defineProps<{
  modelValue: boolean;
  // 统一的可用数据项（两种模式都用这个）
  availableItems: DataItem[];
  // 当前选中的数据项ID列表（两种模式都用这个）
  selectedItems: number[];
  // 对话框标题
  title?: string;
  // 模式：'realtime' | 'history'
  mode: 'realtime' | 'history';
  // 图表配置
  chartConfig?: YAxisConfig | undefined;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:selectedItems': [items: number[]];
  'update:chartConfig': [config: YAxisConfig];
}>();

// 当前活跃的标签页
const activeTab = ref<'data' | 'chart'>('data');

// 本地选择状态
const localSelectedItems = ref<number[]>([]);

// 本地图表配置状态
const localChartConfig = ref<YAxisConfig>({
  autoScale: true,
});

// 监听选中项变化，同步本地状态
watch(
  () => props.selectedItems,
  (newItems) => {
    localSelectedItems.value = [...newItems];
  },
  { immediate: true },
);

// 监听图表配置变化，同步本地状态
watch(
  () => props.chartConfig,
  (newConfig) => {
    if (newConfig) {
      localChartConfig.value = { ...newConfig };
    } else {
      localChartConfig.value = {
        autoScale: true,
      };
    }
  },
  { immediate: true },
);

// 处理对话框关闭
const handleClose = () => {
  emit('update:modelValue', false);
};

// 处理确认
const handleConfirm = () => {
  emit('update:selectedItems', [...localSelectedItems.value]);
  emit('update:chartConfig', { ...localChartConfig.value });
  emit('update:modelValue', false);
};

// 处理取消
const handleCancel = () => {
  // 恢复原始选择
  localSelectedItems.value = [...props.selectedItems];
  // 恢复原始图表配置
  if (props.chartConfig) {
    localChartConfig.value = { ...props.chartConfig };
  } else {
    localChartConfig.value = { autoScale: true };
  }
  emit('update:modelValue', false);
};

// 切换数据项选择
const toggleItem = (itemId: number) => {
  const index = localSelectedItems.value.indexOf(itemId);
  if (index > -1) {
    localSelectedItems.value.splice(index, 1);
  } else {
    localSelectedItems.value.push(itemId);
  }
};

// 全选
const selectAll = () => {
  localSelectedItems.value = props.availableItems.map((item) => item.id);
};

// 清空选择
const clearAll = () => {
  localSelectedItems.value = [];
};

// 计算属性
const selectedCount = computed(() => {
  return localSelectedItems.value.length;
});

const isAllSelected = computed(() => {
  return (
    props.availableItems.length > 0 &&
    props.availableItems.every((item) => localSelectedItems.value.includes(item.id))
  );
});

const dialogTitle = computed(() => {
  if (props.title) return props.title;
  return props.mode === 'history' ? '图表数据项配置' : '图表设置';
});

// 根据模式显示不同的说明文字
const modeDescription = computed(() => {
  if (props.mode === 'history') {
    return '从左侧已选择的数据项中选择要在此图表中显示的项目';
  }
  return '选择要在图表中显示的数据项';
});
</script>

<template>
  <q-dialog :model-value="modelValue" @update:model-value="handleClose" persistent>
    <q-card
      class="bg-industrial-panel text-industrial-primary"
      style="width: 600px; max-width: 90vw; max-height: 80vh"
    >
      <!-- 对话框头部 -->
      <q-card-section class="bg-industrial-secondary border-b border-industrial">
        <div class="flex items-center justify-between">
          <h6 class="text-lg font-medium m-0">{{ dialogTitle }}</h6>
          <div class="flex items-center gap-4">
            <!-- 标签页按钮组 -->
            <div class="flex items-center gap-1 bg-industrial-primary rounded-md p-1">
              <button
                :class="[
                  'px-3 py-1 text-xs rounded transition-colors font-medium',
                  activeTab === 'data'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-industrial-secondary text-industrial-tertiary hover:text-industrial-primary hover:bg-industrial-highlight',
                ]"
                @click="activeTab = 'data'"
              >
                数据选择
              </button>
              <button
                :class="[
                  'px-3 py-1 text-xs rounded transition-colors font-medium',
                  activeTab === 'chart'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-industrial-secondary text-industrial-tertiary hover:text-industrial-primary hover:bg-industrial-highlight',
                ]"
                @click="activeTab = 'chart'"
              >
                图表配置
              </button>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-industrial-tertiary text-sm"> 已选择 {{ selectedCount }} 项 </span>
              <q-btn
                flat
                round
                dense
                icon="close"
                class="text-industrial-tertiary hover:text-industrial-primary"
                @click="handleClose"
              />
            </div>
          </div>
        </div>
      </q-card-section>

      <!-- 对话框内容 -->
      <q-card-section class="overflow-hidden p-0" style="height: 400px">
        <div class="h-full flex flex-col">
          <!-- 数据选择面板 -->
          <div v-if="activeTab === 'data'" class="flex-1 flex flex-col" style="min-height: 0">
            <!-- 操作栏 -->
            <div class="bg-industrial-secondary border-b border-industrial px-4 py-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                  <q-btn
                    flat
                    :label="isAllSelected ? '取消全选' : '全选'"
                    size="sm"
                    class="btn-industrial-secondary"
                    @click="isAllSelected ? clearAll() : selectAll()"
                  />
                  <span class="text-industrial-tertiary text-sm">
                    共 {{ availableItems.length }} 项可选
                  </span>
                </div>
              </div>
              <div class="text-industrial-tertiary text-xs mt-2">
                {{ modeDescription }}
              </div>
            </div>

            <!-- 数据项列表 -->
            <div class="flex-1 overflow-y-auto p-4 custom-scrollbar" style="min-height: 0">
              <div v-if="availableItems.length > 0" class="space-y-2">
                <div
                  v-for="item in availableItems"
                  :key="item.id"
                  :class="[
                    'flex items-center gap-3 p-3 rounded border transition-colors cursor-pointer',
                    localSelectedItems.includes(item.id)
                      ? 'bg-industrial-highlight border-industrial-accent'
                      : 'border-industrial hover:bg-industrial-secondary',
                  ]"
                  @click="toggleItem(item.id)"
                >
                  <q-checkbox
                    :model-value="localSelectedItems.includes(item.id)"
                    color="primary"
                    size="sm"
                    @update:model-value="toggleItem(item.id)"
                  />
                  <div class="flex-1">
                    <div class="text-industrial-primary font-medium">{{ item.label }}</div>
                    <div v-if="item.displayValue" class="text-industrial-tertiary text-sm">
                      {{ mode === 'history' ? '来源: ' : '当前值: ' }}{{ item.displayValue }}
                    </div>
                  </div>
                  <div v-if="item.color" class="flex items-center gap-2">
                    <div
                      class="w-4 h-4 rounded border border-industrial"
                      :style="{ backgroundColor: item.color }"
                    />
                  </div>
                </div>
              </div>
              <div v-else class="text-center py-8">
                <q-icon name="inbox" size="xl" class="text-industrial-tertiary opacity-50" />
                <div class="text-industrial-tertiary mt-2">暂无可用数据项</div>
                <div class="text-industrial-secondary text-sm mt-1">
                  {{
                    mode === 'history' ? '请在左侧面板中选择要分析的数据项' : '暂无数据项可供选择'
                  }}
                </div>
              </div>
            </div>
          </div>

          <!-- 图表配置面板 -->
          <div v-else-if="activeTab === 'chart'" class="flex-1 flex flex-col p-4">
            <div class="space-y-6">
              <!-- Y轴配置 -->
              <div class="space-y-4">
                <h4 class="text-industrial-primary text-sm font-medium mb-3">Y轴配置</h4>

                <!-- 自动缩放开关 -->
                <div class="flex items-center justify-between">
                  <div>
                    <div class="text-industrial-primary text-sm">自动缩放</div>
                    <div class="text-industrial-tertiary text-xs mt-1">
                      启用后，Y轴范围将根据数据自动调整
                    </div>
                  </div>
                  <q-toggle v-model="localChartConfig.autoScale" color="primary" size="sm" />
                </div>

                <!-- 手动范围设置 -->
                <div v-if="!localChartConfig.autoScale" class="space-y-3">
                  <div class="grid grid-cols-2 gap-4">
                    <!-- 最小值 -->
                    <div>
                      <label class="text-industrial-primary text-xs mb-1 block">最小值</label>
                      <q-input
                        v-model.number="localChartConfig.min"
                        type="number"
                        dense
                        outlined
                        class="bg-industrial-secondary"
                        input-class="text-industrial-primary"
                        placeholder="自动"
                      />
                    </div>

                    <!-- 最大值 -->
                    <div>
                      <label class="text-industrial-primary text-xs mb-1 block">最大值</label>
                      <q-input
                        v-model.number="localChartConfig.max"
                        type="number"
                        dense
                        outlined
                        class="bg-industrial-secondary"
                        input-class="text-industrial-primary"
                        placeholder="自动"
                      />
                    </div>
                  </div>

                  <div class="text-industrial-tertiary text-xs">留空则该方向使用自动缩放</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </q-card-section>

      <!-- 对话框底部 -->
      <q-card-actions
        class="bg-industrial-secondary border-t border-industrial justify-end gap-2 p-4"
      >
        <q-btn flat label="取消" class="btn-industrial-secondary" @click="handleCancel" />
        <q-btn label="确定" class="btn-industrial-primary" @click="handleConfirm" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
/* 自定义滚动条 */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: #0f2744;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #1a3663;
  border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #93c5fd;
}

/* 确保滚动条在需要时显示 */
.custom-scrollbar {
  overflow-y: auto !important;
}
</style>
