<template>
  <div class="flex flex-col h-full bg-[#0a1929] text-[#e2e8f0]">
    <div class="flex justify-between items-center p-3 bg-[#12233f] border-b border-[#1a3663]">
      <div class="flex-1 max-w-[400px]">
        <q-input
          v-model="searchQuery"
          placeholder="搜索帧..."
          dense
          dark
          outlined
          class="bg-[#0a1929]"
          @input="handleSearch"
        >
          <template v-slot:prepend>
            <q-icon name="search" />
          </template>
          <template v-slot:append v-if="searchQuery">
            <q-icon name="close" @click="clearSearch" class="cursor-pointer" />
          </template>
        </q-input>
      </div>
      <div class="flex gap-2">
        <q-btn icon="add" color="primary" label="新建帧" @click="createNewFrame()" />
        <q-btn
          icon="filter_list"
          color="secondary"
          flat
          @click="toggleFilterPanel"
          :class="{ 'bg-[#1e3a8a] bg-opacity-30': showFilterPanel }"
        >
          <q-tooltip>过滤</q-tooltip>
        </q-btn>
        <q-btn icon="refresh" color="secondary" flat @click="refreshData">
          <q-tooltip>刷新</q-tooltip>
        </q-btn>
      </div>
    </div>

    <div class="flex flex-1 overflow-hidden h-full pt-3">
      <div class="flex-1 flex flex-col overflow-hidden">
        <div v-if="showFilterPanel" class="p-3 bg-[#12233f] border-b border-[#1a3663]">
          <FrameFilterPanel @filter="handleFilter" @close="toggleFilterPanel" closable />
        </div>

        <div class="flex-1 overflow-auto pr-3">
          <div
            v-if="templateStore.isLoading"
            class="flex flex-col items-center justify-center h-full p-10 text-[#94a3b8]"
          >
            <q-spinner color="primary" size="40px" />
            <div class="mt-4 mb-4">加载中...</div>
          </div>

          <div
            v-else-if="!filteredFrames.length"
            class="flex flex-col items-center justify-center h-full p-10 text-[#94a3b8]"
          >
            <q-icon name="inventory_2" size="48px" color="grey-7" />
            <div class="mt-4 mb-4">没有找到帧配置</div>
            <q-btn label="创建新帧" color="primary" @click="createNewFrame()" />
          </div>

          <template v-else>
            <FrameTable
              :frames="mappedFrames"
              :is-loading="templateStore.isLoading"
              @frame-selected="selectFrame"
              @action="handleFrameAction"
            />
          </template>
        </div>
      </div>

      <div class="w-[30vw] border-l border-[#1a3663] overflow-hidden bg-[#12233f]">
        <FrameDetailPanel v-if="selectedFrameData" :frame="selectedFrameData" />
        <div v-else class="flex items-center justify-center h-full text-[#94a3b8]">
          选择一个帧查看详情
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useFrameTemplates } from '../../composables/frames/useFrameTemplates';
import FrameFilterPanel from '../../components/frames/FrameList/FrameFilterPanel.vue';
import FrameTable from '../../components/frames/FrameList/FrameTable.vue';
import FrameDetailPanel from '../../components/frames/FrameList/FrameDetailPanel.vue';
import type { FrameField, FrameParam } from '../../types/frames';
import { useFrameFilterStore, useFrameTemplateStore } from 'src/stores/framesStore';
import { applyAllFilters } from 'src/utils/frames/frameUtils';
import { storeToRefs } from 'pinia';

// 详情帧接口
interface DetailFrame {
  id: string;
  name: string;
  timestamp: number;
  params: FrameParam[];
  rawData?: string;
}

// FilterValues接口从FrameFilterPanel组件导入
interface FilterValues {
  frameId: string;
  name: string;
  paramCount: number | null;
  startTime: string;
  endTime: string;
}

// 使用 Quasar 实例
const $q = useQuasar();
const router = useRouter();

// 使用 Composables
const templateComposable = useFrameTemplates();
const filterStore = useFrameFilterStore();
const templateStore = useFrameTemplateStore();

const { error } = storeToRefs(templateStore);

// 获取状态
const filteredFrames = computed(() => {
  return applyAllFilters(
    templateStore.frames,
    filterStore.filters,
    filterStore.searchQuery,
    filterStore.sortOrder,
  );
});
const searchQuery = computed({
  get: () => filterStore.searchQuery,
  set: (val) => filterStore.setSearchQuery(val),
});
const showFilterPanel = computed({
  get: () => filterStore.showFilterPanel,
  set: (val) => {
    if (!val) {
      filterStore.toggleFilterPanel();
    }
  },
});

// 监听错误，显示通知
watch(error, (newError) => {
  if (newError) {
    $q.notify({
      color: 'negative',
      message: newError,
      icon: 'error',
    });
  }
});

// 将帧格式转换为表格所需格式
const mappedFrames = computed(() => {
  return filteredFrames.value.map((frame) => ({
    id: frame.id,
    name: frame.name,
    paramCount: frame.fields?.length || 0,
    value: frame.value || 0,
    timestamp: frame.timestamp,
    isFavorite: frame.isFavorite || false,
  }));
});

// 选中的帧详情
const selectedFrameData = computed<DetailFrame | undefined>(() => {
  if (!templateStore.selectedFrame) return undefined;

  // 将字段数据转换为参数格式
  const params = templateStore.selectedFrame.fields.map((field: FrameField) => ({
    id: field.id,
    name: field.name,
    dataType: field.dataType,
    value: field.defaultValue || '未设置',
  }));

  // 生成原始数据字符串 (示例)
  const generateRawData = () => {
    const hexValues = [];
    for (let i = 0; i < 24; i++) {
      hexValues.push(
        Math.floor(Math.random() * 256)
          .toString(16)
          .padStart(2, '0')
          .toUpperCase(),
      );
    }

    // 分成三行
    const lines = [];
    for (let i = 0; i < hexValues.length; i += 8) {
      lines.push(hexValues.slice(i, i + 8).join(' '));
    }

    return lines.join('\n');
  };

  // 返回帧的详细信息
  return {
    id: templateStore.selectedFrame.id,
    name: templateStore.selectedFrame.name,
    timestamp: templateStore.selectedFrame.timestamp,
    params,
    rawData: generateRawData(),
  };
});

// 方法
function handleSearch(value: string) {
  filterStore.setSearchQuery(value);
}

function clearSearch() {
  filterStore.setSearchQuery('');
}

// 处理 FilterPanel 传来的过滤条件
function handleFilter(filterValues: FilterValues) {
  // 转换为 FilterOptions 格式
  const options = {
    protocol: '',
    deviceType: '',
  };

  filterStore.setFilters(options);

  // 如果有名称搜索，也应用到搜索查询
  if (filterValues.name) {
    filterStore.setSearchQuery(filterValues.name);
  }
}

function toggleFilterPanel() {
  filterStore.toggleFilterPanel();
}

function refreshData() {
  templateComposable.refreshData();
}

function createNewFrame() {
  router.push({ path: '/frames/editor', query: { new: 'true' } });
}

function editFrame(frameId: string) {
  router.push({ path: '/frames/editor', query: { id: frameId } });
}

// 选择帧
function selectFrame(frameId: string) {
  templateStore.setSelectedFrameId(frameId);
}

function handleFrameAction(action: string, frameId: string) {
  switch (action) {
    case 'edit':
      editFrame(frameId);
      break;
    case 'duplicate':
      duplicateFrame(frameId);
      break;
    case 'delete':
      deleteFrame(frameId);
      break;
    case 'favorite':
      templateStore.toggleFavorite(frameId);
      break;
    default:
      console.warn(`未知操作: ${action}`);
  }
}

async function duplicateFrame(frameId: string) {
  try {
    const duplicated = await templateComposable.duplicateFrame(frameId);
    if (duplicated) {
      $q.notify({
        color: 'positive',
        message: '帧已复制',
        icon: 'content_copy',
      });
    }
  } catch (error) {
    $q.notify({
      color: 'negative',
      message: '复制帧时出错',
      icon: 'error',
    });
    console.error(error);
  }
}

async function deleteFrame(frameId: string) {
  try {
    const deleted = await templateComposable.deleteFrame(frameId);
    if (deleted) {
      $q.notify({
        color: 'positive',
        message: '帧已删除',
        icon: 'delete',
      });
    }
  } catch (error) {
    $q.notify({
      color: 'negative',
      message: '删除帧时出错',
      icon: 'error',
    });
    console.error(error);
  }
}

// 页面加载时初始化
onMounted(() => {
  templateComposable.loadFrames();
});
</script>
