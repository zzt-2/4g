<template>
  <div class="h-full w-full flex flex-col gap-3">
    <!-- 基本信息 -->
    <q-card class="flex flex-col flex-grow bg-[#12233f] border border-[#1a3663]">
      <q-card-section class="q-py-sm q-pb-xs">
        <div class="text-xs font-medium text-[#93c5fd] uppercase pb-1 border-b border-[#1a3663]">
          基本信息
        </div>
      </q-card-section>

      <q-card-section v-if="!isFrameLoaded" class="text-center">
        <div class="text-gray-400 text-xs">
          <q-spinner size="xs" class="mr-1" color="primary" />
          加载帧数据中...
        </div>
      </q-card-section>

      <q-card-section v-else class="q-pt-none flex flex-col flex-grow">
        <div class="flex flex-col gap-3 flex-grow">
          <q-input
            v-model="localFrame.name"
            label="名称"
            dense
            dark
            outlined
            placeholder="输入帧配置名称"
            class="text-xs"
            bg-color="#0a1929"
            :rules="[(val) => !!val || '名称不能为空']"
            @update:model-value="handleChange"
          />

          <div class="grid grid-cols-2 gap-2">
            <q-select
              v-model="localFrame.protocol"
              :options="PROTOCOL_OPTIONS"
              label="协议类型"
              dense
              dark
              outlined
              emit-value
              map-options
              class="text-xs"
              bg-color="#0a1929"
              @update:model-value="handleChange"
            />

            <q-select
              v-model="localFrame.deviceType"
              :options="DEVICE_TYPE_OPTIONS"
              label="设备类型"
              dense
              dark
              outlined
              emit-value
              map-options
              class="text-xs"
              bg-color="#0a1929"
              @update:model-value="handleChange"
            />
          </div>

          <q-input
            v-model="localFrame.description"
            type="textarea"
            label="描述"
            dense
            dark
            outlined
            placeholder="输入帧配置描述"
            class="text-xs flex-grow h-[100px]"
            bg-color="#0a1929"
            autogrow
            @update:model-value="handleChange"
          />
        </div>
      </q-card-section>
    </q-card>

    <!-- 选项 -->
    <q-card class="bg-[#12233f] border border-[#1a3663] h-140px">
      <q-card-section class="q-py-sm q-pb-xs">
        <div class="text-xs font-medium text-[#93c5fd] uppercase pb-1 border-b border-[#1a3663]">
          选项
        </div>
      </q-card-section>

      <q-card-section v-if="!hasOptions" class="text-center">
        <div class="text-gray-400 text-xs">
          <q-spinner size="xs" class="mr-1" color="primary" />
          加载选项数据中...
        </div>
      </q-card-section>
      <!-- 
      <q-card-section v-else class="q-pt-none">
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <span class="text-xs text-[#e2e8f0]">自动计算校验</span>
              <q-tooltip>自动计算CRC或校验和字段</q-tooltip>
            </div>
            <q-toggle
              v-model="localFrame.options.autoChecksum"
              dense
              color="primary"
              @update:model-value="handleChange"
            />
          </div>

          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <span class="text-xs text-[#e2e8f0]">大端字节序</span>
              <q-tooltip>使用大端(高位在前)存储多字节数据</q-tooltip>
            </div>
            <q-toggle
              v-model="localFrame.options.bigEndian"
              dense
              color="primary"
              @update:model-value="handleChange"
            />
          </div>

          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <span class="text-xs text-[#e2e8f0]">包含长度字段</span>
              <q-tooltip>自动添加数据长度字段</q-tooltip>
            </div>
            <q-toggle
              v-model="localFrame.options.includeLengthField"
              dense
              color="primary"
              @update:model-value="handleChange"
            />
          </div>
        </div>
      </q-card-section> -->
    </q-card>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import { useFrameEditor } from '../../../composables/frames/useFrameEditor';
import { useQuasar } from 'quasar';
import { createEmptyFrame } from '../../../types/frames/factories';
import { PROTOCOL_OPTIONS, DEVICE_TYPE_OPTIONS } from '../../../config/frameDefaults';

// Quasar 通知
const $q = useQuasar();

// 使用组合式函数
const { currentFrame, updateFrameInfo } = useFrameEditor();

// 创建本地响应式副本，使用类型推断
const localFrame = ref(createEmptyFrame());

// 状态检查
const isFrameLoaded = computed(() => {
  return !!localFrame.value && !!localFrame.value.id;
});

const hasOptions = computed(() => {
  return !!localFrame.value && !!localFrame.value.options;
});

// 从 currentFrame 中获取初始数据
onMounted(() => {
  try {
    // 从 useFrameEditor 中获取数据
    if (currentFrame.value) {
      localFrame.value = JSON.parse(JSON.stringify(currentFrame.value));
    } else {
      // 如果编辑器数据为空，确保本地对象有默认值
      initDefaultFrame();
    }
  } catch (error) {
    console.error('初始化帧数据失败:', error);
    $q.notify({
      color: 'negative',
      message: '初始化帧数据失败',
      icon: 'warning',
    });
    initDefaultFrame();
  }
});

// 初始化默认帧数据
const initDefaultFrame = () => {
  localFrame.value = createEmptyFrame();
};

// 监听 currentFrame 的变化
watch(
  currentFrame,
  (newFrame) => {
    if (newFrame && JSON.stringify(localFrame.value) !== JSON.stringify(newFrame)) {
      try {
        localFrame.value = JSON.parse(JSON.stringify(newFrame));
      } catch (error) {
        console.error('更新帧数据失败:', error);
        $q.notify({
          color: 'warning',
          message: '更新帧数据失败',
          icon: 'warning',
        });
      }
    }
  },
  { deep: true },
);

// 处理变更，通知 composable
const handleChange = () => {
  if (!localFrame.value) return;

  try {
    // 确保选项对象存在
    if (!localFrame.value.options) {
      localFrame.value.options = {
        autoChecksum: true,
        bigEndian: true,
        includeLengthField: false,
      };
    }

    // 调用 useFrameEditor 的 updateFrameInfo 方法
    // 使用类型断言解决类型兼容性问题
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateFrameInfo(localFrame.value as any);
  } catch (error) {
    console.error('更新数据失败:', error);
    $q.notify({
      color: 'negative',
      message: '更新数据失败',
      icon: 'warning',
    });
  }
};
</script>
