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
          @input="applySearchFilter"
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
        <q-btn icon="add" color="primary" label="新建帧" @click="startEditing()" />
        <q-btn
          icon="filter_list"
          color="secondary"
          flat
          @click="toggleFilterPanel"
          :class="{ 'bg-[#1e3a8a] bg-opacity-30': showFilterPanel }"
        >
          <q-tooltip>过滤</q-tooltip>
        </q-btn>
        <q-btn icon="refresh" color="secondary" flat @click="refreshFrames">
          <q-tooltip>刷新</q-tooltip>
        </q-btn>
      </div>
    </div>

    <div class="flex flex-1 overflow-hidden h-full pt-3">
      <div class="flex-1 flex flex-col overflow-hidden">
        <div v-if="showFilterPanel" class="p-3 bg-[#12233f] border-b border-[#1a3663]">
          <FrameFilterPanel @filter="applyFilters" @close="showFilterPanel = false" closable />
        </div>

        <div class="flex-1 overflow-auto pr-3">
          <div
            v-if="isLoading"
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
            <q-btn label="创建新帧" color="primary" @click="startEditing()" />
          </div>

          <template v-else>
            <FrameTable
              :frames="mappedFrames"
              :is-loading="isLoading"
              @frame-selected="selectFrame"
              @action="handleFrameAction"
            />
          </template>
        </div>
      </div>

      <div class="w-[400px] border-l border-[#1a3663] overflow-hidden bg-[#12233f]">
        <FrameDetailPanel v-if="selectedFrameData" :frame="selectedFrameData" />
        <div v-else class="flex items-center justify-center h-full text-[#94a3b8]">
          选择一个帧查看详情
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useFrameTemplates } from '../../../composables/frames/useFrameTemplates';
import FrameFilterPanel from './FrameFilterPanel.vue';
import FrameTable from './FrameTable.vue';
import FrameDetailPanel from './FrameDetailPanel.vue';
import type { FrameField } from '../../../types/frames';

// 帧参数接口
interface FrameParam {
  name: string;
  type: string;
  value: string | number | boolean;
}

// 详情帧接口
interface DetailFrame {
  id: string;
  name: string;
  status: 'processing' | 'completed' | 'error' | 'pending';
  timestamp: number;
  params: FrameParam[];
  rawData?: string;
}

// FilterValues接口从FrameFilterPanel组件导入
interface FilterValues {
  frameId: string;
  name: string;
  status: string | null;
  paramCount: number | null;
  startTime: string;
  endTime: string;
}

// 使用Quasar实例
const $q = useQuasar();

// 使用帧composable
const {
  isLoading,
  error,
  filteredFrames,
  selectedFrame,
  initialize,
  selectFrame,
  createNewFrame,
  deleteSelectedFrame,
  duplicateSelectedFrame,
  toggleFavorite,
  ...framesUtils // 包含filters中的方法
} = useFrameTemplates();

// 搜索查询
const searchQuery = ref('');

// 是否显示过滤面板
const showFilterPanel = ref(false);

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

// 将Store的帧格式转换为表格所需格式
const mappedFrames = computed(() => {
  return filteredFrames.value.map((frame) => ({
    id: frame.id,
    name: frame.name,
    status: frame.status,
    paramCount: frame.fields?.length || 0,
    value: frame.value || 0,
    timestamp: frame.timestamp,
    isFavorite: frame.isFavorite || false,
  }));
});

// 选中的帧详情
const selectedFrameData = computed<DetailFrame | undefined>(() => {
  if (!selectedFrame.value) return undefined;

  // 将字段数据转换为参数格式
  const params = selectedFrame.value.fields.map((field: FrameField) => ({
    name: field.name,
    type: field.type,
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
    id: selectedFrame.value.id,
    name: selectedFrame.value.name,
    status: selectedFrame.value.status,
    timestamp: selectedFrame.value.timestamp,
    params,
    rawData: generateRawData(),
  };
});

// 初始化加载帧列表
onMounted(() => {
  void initialize();
});

// 刷新帧列表
const refreshFrames = () => {
  void initialize();
  $q.notify({
    color: 'positive',
    message: '帧列表已刷新',
    icon: 'refresh',
  });
};

// 开始编辑帧
const startEditing = (id?: string) => {
  if (id) {
    // 选择要编辑的帧
    selectFrame(id);
    // 在实际应用中可能会跳转到编辑页面或打开编辑对话框
    $q.notify({
      color: 'info',
      message: `正在编辑帧：${id}`,
      icon: 'edit',
    });
  } else {
    // 创建新帧
    void (async () => {
      try {
        const newFrame = await createNewFrame({
          name: '新建帧',
          description: '新建的帧配置',
          protocol: 'custom',
          deviceType: 'sensor',
          fields: [],
          status: 'pending',
        });

        $q.notify({
          color: 'positive',
          message: '新帧已创建',
          icon: 'add',
        });

        selectFrame(newFrame.id);
      } catch (err) {
        console.error('创建帧失败:', err);
      }
    })();
  }
};

// 处理帧操作
const handleFrameAction = (action: string, frameId: string) => {
  selectFrame(frameId);

  switch (action) {
    case 'edit':
      startEditing(frameId);
      break;
    case 'duplicate':
      void (async () => {
        try {
          await duplicateSelectedFrame();
          $q.notify({
            color: 'positive',
            message: '帧已复制',
            icon: 'content_copy',
          });
        } catch (err) {
          console.error('复制帧失败:', err);
        }
      })();
      break;
    case 'delete':
      $q.dialog({
        title: '确认删除',
        message: '确定要删除这个帧配置吗？此操作不可撤销。',
        cancel: true,
        persistent: true,
      }).onOk(() => {
        void (async () => {
          try {
            await deleteSelectedFrame();
            $q.notify({
              color: 'positive',
              message: '帧已删除',
              icon: 'delete',
            });
          } catch (err) {
            console.error('删除帧失败:', err);
          }
        })();
      });
      break;
    case 'favorite':
      toggleFavorite(frameId);
      break;
  }
};

// 应用搜索过滤
const applySearchFilter = (query: string) => {
  framesUtils.applySearchFilter(query);
};

// 清除搜索
const clearSearch = () => {
  searchQuery.value = '';
  framesUtils.applySearchFilter('');
};

// 应用过滤器
const applyFilters = (filterOptions: FilterValues) => {
  // 转换为framesStore中使用的FilterOptions类型
  const storeFilters = {
    deviceType: '',
    protocol: '',
    // 可以根据filterOptions.frameId、name等字段设置对应的过滤条件
    // 这里简单处理，实际使用时应根据具体需求转换
    status: filterOptions.status || undefined,
  };

  framesUtils.applyFilters(storeFilters);

  // 如果需要更复杂的搜索逻辑，可以组合使用
  if (filterOptions.name) {
    framesUtils.applySearchFilter(filterOptions.name);
  }
};

// 切换过滤面板
const toggleFilterPanel = () => {
  showFilterPanel.value = !showFilterPanel.value;
};
</script>
