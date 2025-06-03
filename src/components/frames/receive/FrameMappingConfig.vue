<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useReceiveFramesStore } from '../../../stores/receiveFrames';
import type { Frame } from '../../../types/frames/frames';
import type { FrameFieldMapping } from '../../../types/frames/receive';
import { generateLabelOptionsFromField } from '../../../utils/receive';

// Store
const receiveFramesStore = useReceiveFramesStore();

// 本地状态
const showMappingDialog = ref<boolean>(false);
const selectedFieldId = ref<string>('');
const selectedGroupId = ref<number>(0);
const newDataItemLabel = ref<string>('');

// 计算属性：选中帧
const selectedFrame = computed((): Frame | undefined => {
  if (!receiveFramesStore.selectedFrameId) return undefined;
  return receiveFramesStore.receiveFrames.find(
    (frame: Frame) => frame.id === receiveFramesStore.selectedFrameId,
  );
});

// 计算属性：可用字段（所有字段都可用，允许重复映射到不同分组）
const availableFields = computed(() => {
  if (!selectedFrame.value) return [];

  // 返回所有字段，允许重复映射到不同分组
  return selectedFrame.value.fields;
});

// 计算属性：选中字段信息
const selectedField = computed(() => {
  if (!selectedFrame.value || !selectedFieldId.value) return null;
  return selectedFrame.value.fields.find((f) => f.id === selectedFieldId.value);
});

// 监听字段选择变化，自动生成数据项标签
watch(selectedFieldId, (newFieldId) => {
  if (newFieldId && selectedField.value) {
    newDataItemLabel.value = selectedField.value.name;
  }
});

// 方法：开始创建映射
const startCreateMapping = (): void => {
  if (
    !selectedFrame.value ||
    !selectedFrame.value.fields ||
    selectedFrame.value.fields.length === 0
  )
    return;

  // 重置状态
  selectedFieldId.value = '';
  selectedGroupId.value = 0;
  newDataItemLabel.value = '';

  showMappingDialog.value = true;
};

// 方法：创建映射
const createMapping = (): void => {
  if (
    !selectedFrame.value ||
    !selectedFieldId.value ||
    !selectedGroupId.value ||
    !newDataItemLabel.value.trim()
  )
    return;

  const field = selectedField.value;
  if (!field) return;

  // 生成标签选项
  const labelOptions = generateLabelOptionsFromField(field);

  // 创建新数据项
  const newDataItem = receiveFramesStore.addDataItemToGroup(selectedGroupId.value, {
    label: newDataItemLabel.value.trim(),
    isVisible: true,
    dataType: field.dataType,
    value: null,
    displayValue: '-',
    useLabel: labelOptions.length > 0,
    labelOptions: labelOptions.length > 0 ? labelOptions : [],
  });

  // 创建映射关系
  const mapping: FrameFieldMapping = {
    frameId: selectedFrame.value.id,
    fieldId: selectedFieldId.value,
    fieldName: selectedField.value?.name || '',
    groupId: selectedGroupId.value,
    dataItemId: newDataItem.id,
  };

  receiveFramesStore.addMapping(mapping);

  // 关闭对话框
  showMappingDialog.value = false;
};

// 方法：取消创建映射
const cancelCreateMapping = (): void => {
  showMappingDialog.value = false;
};

// 方法：删除映射
const deleteMapping = (mapping: FrameFieldMapping): void => {
  if (!confirm('确定要删除这个映射关系吗？')) return;

  receiveFramesStore.removeMapping(
    mapping.frameId,
    mapping.fieldId,
    mapping.groupId,
    mapping.dataItemId,
  );
};

// 计算属性：当前帧的映射列表
const frameMappings = computed(() => {
  if (!selectedFrame.value) return [];

  return receiveFramesStore.mappings
    .filter((m) => m.frameId === selectedFrame.value!.id)
    .map((mapping) => {
      const field = selectedFrame.value!.fields.find((f) => f.id === mapping.fieldId);
      const group = receiveFramesStore.groups.find((g) => g.id === mapping.groupId);
      const dataItem = group?.dataItems.find((item) => item.id === mapping.dataItemId);

      return {
        mapping,
        field,
        group,
        dataItem,
      };
    });
});
</script>

<template>
  <div class="h-full flex flex-col bg-industrial-panel">
    <!-- 标题栏 -->
    <div class="p-4 border-b border-industrial">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-industrial-primary text-lg font-medium">映射关系配置</h3>
        <q-btn
          flat
          dense
          size="sm"
          icon="add"
          color="blue"
          :disable="!selectedFrame || !selectedFrame.fields || selectedFrame.fields.length === 0"
          @click="startCreateMapping"
        >
          <q-tooltip>添加映射关系</q-tooltip>
        </q-btn>
      </div>

      <div class="text-sm text-industrial-secondary">
        <span v-if="selectedFrame">
          {{ selectedFrame.name }} - {{ frameMappings.length }} 个映射
        </span>
        <span v-else>请先选择一个接收帧</span>
      </div>
    </div>

    <!-- 映射列表 -->
    <div class="flex-1 overflow-y-auto">
      <!-- 未选择帧时的提示 -->
      <div v-if="!selectedFrame" class="p-4 text-center text-industrial-secondary">
        <q-icon name="info" size="24px" class="mb-2" />
        <p>请先选择一个接收帧</p>
      </div>

      <!-- 无映射时的提示 -->
      <div v-else-if="frameMappings.length === 0" class="p-4 text-center text-industrial-secondary">
        <q-icon name="link_off" size="24px" class="mb-2" />
        <p>该帧暂无映射关系</p>
        <p class="text-xs mt-1">点击右上角按钮添加映射</p>
      </div>

      <!-- 映射列表 -->
      <div v-else class="space-y-3 p-3">
        <div
          v-for="(item, index) in frameMappings"
          :key="`${item.mapping.fieldId}-${item.mapping.groupId}-${item.mapping.dataItemId}`"
          class="bg-industrial-secondary rounded-lg p-4 border border-industrial"
        >
          <!-- 映射头部 -->
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center space-x-2">
              <q-icon name="link" color="blue" size="16px" />
              <span class="text-industrial-primary font-medium text-sm">
                映射 #{{ index + 1 }}
              </span>
            </div>

            <!-- 删除按钮 -->
            <q-btn
              flat
              dense
              size="sm"
              icon="delete"
              color="red"
              @click="deleteMapping(item.mapping)"
            >
              <q-tooltip>删除映射</q-tooltip>
            </q-btn>
          </div>

          <!-- 映射详情 -->
          <div class="grid grid-cols-2 gap-4">
            <!-- 源字段信息 -->
            <div class="space-y-2">
              <div class="text-xs text-industrial-secondary font-medium">源字段</div>
              <div class="bg-industrial-panel rounded p-3">
                <div class="text-sm text-industrial-primary font-medium mb-1">
                  {{ item.field?.name || item.mapping.fieldName }}
                </div>
                <div class="text-xs text-industrial-secondary space-y-1">
                  <div>ID: {{ item.mapping.fieldId }}</div>
                  <div>类型: {{ item.field?.dataType || 'unknown' }}</div>
                  <div>长度: {{ item.field?.length || 'unknown' }} 字节</div>
                </div>
              </div>
            </div>

            <!-- 目标数据项信息 -->
            <div class="space-y-2">
              <div class="text-xs text-industrial-secondary font-medium">目标数据项</div>
              <div class="bg-industrial-panel rounded p-3">
                <div class="text-sm text-industrial-primary font-medium mb-1">
                  {{ item.dataItem?.label || '未知数据项' }}
                </div>
                <div class="text-xs text-industrial-secondary space-y-1">
                  <div>分组: {{ item.group?.label || '未知分组' }}</div>
                  <div>类型: {{ item.dataItem?.dataType || 'unknown' }}</div>
                  <div>
                    状态:
                    <span :class="item.dataItem?.isVisible ? 'text-green-400' : 'text-grey-400'">
                      {{ item.dataItem?.isVisible ? '可见' : '隐藏' }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 映射状态 -->
          <div class="mt-3 pt-3 border-t border-industrial-primary/20">
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center space-x-2">
                <q-icon name="check_circle" color="green" size="14px" />
                <span class="text-green-400">映射有效</span>
              </div>
              <div class="text-industrial-secondary">
                当前值: {{ item.dataItem?.displayValue || '-' }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部统计 -->
    <div v-if="selectedFrame" class="p-3 border-t border-industrial bg-industrial-secondary">
      <div class="flex items-center justify-between text-xs text-industrial-secondary">
        <span>{{ availableFields.length }} 个字段可映射</span>
        <span>{{ frameMappings.length }} 个已映射</span>
      </div>
    </div>
  </div>

  <!-- 创建映射对话框 -->
  <q-dialog v-model="showMappingDialog" persistent>
    <q-card class="bg-industrial-panel" style="min-width: 500px">
      <q-card-section class="bg-industrial-secondary">
        <div class="text-lg text-industrial-primary">创建映射关系</div>
      </q-card-section>

      <q-card-section class="space-y-4">
        <!-- 选择字段 -->
        <q-select
          v-model="selectedFieldId"
          :options="
            availableFields.map((f) => ({ label: `${f.name} (${f.dataType})`, value: f.id }))
          "
          label="选择字段"
          outlined
          dense
          emit-value
          map-options
          bg-color="industrial-secondary"
          color="blue"
        />

        <!-- 选择分组 -->
        <q-select
          v-model="selectedGroupId"
          :options="receiveFramesStore.groups.map((g) => ({ label: g.label, value: g.id }))"
          label="选择分组"
          outlined
          dense
          emit-value
          map-options
          bg-color="industrial-secondary"
          color="blue"
        />

        <!-- 数据项名称 -->
        <q-input
          v-model="newDataItemLabel"
          label="数据项名称"
          outlined
          dense
          bg-color="industrial-secondary"
          color="blue"
          class="text-industrial-primary"
          placeholder="将自动根据字段名称填充"
        />
      </q-card-section>

      <q-card-actions align="right" class="bg-industrial-secondary">
        <q-btn flat label="取消" color="grey" @click="cancelCreateMapping" />
        <q-btn
          flat
          label="创建"
          color="blue"
          :disable="!selectedFieldId || !selectedGroupId || !newDataItemLabel.trim()"
          @click="createMapping"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
/* 使用工业主题样式，无需额外样式定义 */
</style>
