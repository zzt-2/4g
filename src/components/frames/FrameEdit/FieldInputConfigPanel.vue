<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  ConditionalExpression,
  FrameField,
  VariableMapping,
} from '../../../types/frames/fields';
import { getDataSourceTypeLabel } from '../../../utils/frames/defaultConfigs';
import { DataSourceType } from '../../../types/frames/fields';
import { useFrameFieldsStore } from '../../../stores/frames/frameFieldsStore';
import { useReceiveFramesStore } from '../../../stores/frames/receiveFramesStore';
import { INPUT_TYPE_CONFIG } from '../../../config/frameDefaults';
import { useNotification } from '../../../composables/frames/useNotification';
import { validateCompleteExpressionConfig } from '../../../utils/frames/fieldValidation';

// Props
const props = defineProps<{
  field: FrameField;
}>();

// Emits
const emit = defineEmits<{
  'update:field': [field: FrameField];
}>();

// Stores
const fieldStore = useFrameFieldsStore();
const receiveFramesStore = useReceiveFramesStore();
const { notifyError } = useNotification();

// 本地状态
const localField = ref<FrameField>({ ...props.field });
const validationErrors = ref<string[]>([]);

// 监听props变化
watch(
  () => props.field,
  (newField) => {
    localField.value = JSON.parse(JSON.stringify(newField));
    validateExpression();
  },
  { deep: true },
);

// 计算属性
const isExpressionField = computed(() => localField.value.inputType === 'expression');
const isOptionsField = computed(() => ['select', 'radio'].includes(localField.value.inputType));
const showConfigPanel = computed(() => isExpressionField.value || isOptionsField.value);
const hasValidationErrors = computed(() => validationErrors.value.length > 0);

// 数据源类型选项
const dataSourceTypeOptions = computed(() => [
  {
    label: getDataSourceTypeLabel(DataSourceType.CURRENT_FIELD),
    value: DataSourceType.CURRENT_FIELD,
  },
  { label: getDataSourceTypeLabel(DataSourceType.FRAME_FIELD), value: DataSourceType.FRAME_FIELD },
  { label: getDataSourceTypeLabel(DataSourceType.GLOBAL_STAT), value: DataSourceType.GLOBAL_STAT },
]);

// 当前帧字段选项（允许包含自己）
const currentFrameFieldOptions = computed(() => {
  return fieldStore.fields.map((field) => ({
    label: `${field.name} (${field.dataType})`,
    value: field.id,
  }));
});

// 接收帧选项
const receiveFrameOptions = computed(() => receiveFramesStore.availableReceiveFrameOptions);

// 根据选择的接收帧获取可用字段选项
const getReceiveFrameFieldOptions = computed(
  () => receiveFramesStore.getAvailableFrameFieldOptions,
);

// 全局统计选项
const globalStatsOptions = computed(() => [
  // 时间统计
  { label: '运行时间 (秒)', value: 'runtime' },
  { label: '年', value: 'year' },
  { label: '月', value: 'month' },
  { label: '日', value: 'day' },
  { label: '时', value: 'hour' },
  { label: '分', value: 'minute' },
  { label: '秒', value: 'second' },
  { label: '毫秒', value: 'millisecond' },
  { label: '总秒数', value: 'allSeconds' },

  // 通信统计
  { label: '发送包数', value: 'sentPackets' },
  { label: '接收包数', value: 'receivedPackets' },
  { label: '总包数', value: 'totalPackets' },
  { label: '发送字节数', value: 'sentBytes' },
  { label: '接收字节数', value: 'receivedBytes' },
  { label: '总字节数', value: 'totalBytes' },

  // 帧匹配统计
  { label: '匹配帧数', value: 'matchedFrames' },
  { label: '未匹配帧数', value: 'unmatchedFrames' },

  // 错误统计
  { label: '通信错误数', value: 'communicationErrors' },
  { label: '帧解析错误数', value: 'frameParseErrors' },
  { label: '总错误数', value: 'totalErrors' },
]);

// 更新字段
function updateField() {
  emit('update:field', { ...localField.value });
}

// 添加变量映射
function addVariableMapping() {
  if (!localField.value.expressionConfig) {
    localField.value.expressionConfig = {
      expressions: [],
      variables: [],
    };
  }

  const newMapping = {
    identifier: `var${localField.value.expressionConfig.variables.length + 1}`,
    sourceType: DataSourceType.CURRENT_FIELD,
    sourceId: '',
    frameId: '',
    fieldId: '',
  };

  localField.value.expressionConfig.variables.push(newMapping);
  updateField();
}

// 删除变量映射
function removeVariableMapping(index: number) {
  if (localField.value.expressionConfig) {
    localField.value.expressionConfig.variables.splice(index, 1);
    updateField();
  }
}

// 添加条件表达式
function addConditionalExpression() {
  if (!localField.value.expressionConfig) {
    localField.value.expressionConfig = {
      expressions: [],
      variables: [],
    };
  }

  const newCondition = {
    condition: 'true',
    expression: '0',
  };

  localField.value.expressionConfig.expressions.push(newCondition);
  updateField();
}

// 删除条件表达式
function removeConditionalExpression(index: number) {
  if (localField.value.expressionConfig) {
    localField.value.expressionConfig.expressions.splice(index, 1);
    updateField();
  }
}

// 更新表达式配置
function updateExpressionConfig() {
  updateField();
  validateExpression();
}

// 选项配置相关方法（从FrameFieldEditor移过来）
const addOption = () => {
  if (!localField.value.options) {
    localField.value.options = [];
  }

  localField.value.options.push({
    value: '',
    label: '',
    isDefault: localField.value.options.length === 0,
  });
  updateField();
};

const removeOption = (index: number) => {
  if (!localField.value.options) return;

  const inputType = localField.value.inputType;
  if (!inputType) return;

  const config = INPUT_TYPE_CONFIG[inputType as keyof typeof INPUT_TYPE_CONFIG];
  if (localField.value.options.length <= config.minOptions) {
    notifyError(
      `${inputType === 'select' ? '下拉框' : '单选框'}至少需要 ${config.minOptions} 个选项`,
    );
    return;
  }

  const isRemovingDefault = localField.value.options[index]?.isDefault;
  localField.value.options.splice(index, 1);

  if (isRemovingDefault && localField.value.options.length > 0) {
    localField.value.options[0]!.isDefault = true;
  }

  updateField();
};

const updateDefaultOption = (selectedIndex: number) => {
  if (!localField.value.options || selectedIndex < 0) return;

  const currentOption = localField.value.options[selectedIndex];
  if (!currentOption) return;

  if (!currentOption.isDefault) {
    const hasAnyDefault = localField.value.options.some(
      (opt, idx) => idx !== selectedIndex && opt.isDefault,
    );

    if (!hasAnyDefault) {
      currentOption.isDefault = true;
      updateField();
      return;
    }
  } else {
    localField.value.options.forEach((opt, idx) => {
      if (idx !== selectedIndex) {
        opt.isDefault = false;
      }
    });
  }

  updateField();
};

// 验证表达式配置
function validateExpression() {
  if (!isExpressionField.value || !localField.value.expressionConfig) {
    validationErrors.value = [];
    return;
  }

  const result = validateCompleteExpressionConfig(localField.value.expressionConfig);
  validationErrors.value = result.errors;

  if (!result.isValid) {
    notifyError(`表达式配置有 ${result.errors.length} 个错误`);
  }
}

// 更新条件表达式
function updateConditionalExpression(expr: ConditionalExpression, field: string, value: string) {
  if (field === 'condition') {
    expr.condition = value;
  } else if (field === 'expression') {
    expr.expression = value;
  }

  updateExpressionConfig();
}

// 更新变量映射时同步更新sourceId
function updateVariableMapping(mapping: VariableMapping, field: string, value: string) {
  if (field === 'frameId' && mapping.sourceType === DataSourceType.FRAME_FIELD) {
    // 当选择接收帧时，清空fieldId，等待用户重新选择字段
    mapping.fieldId = '';
    mapping.sourceId = value; // 设置sourceId为帧ID
  } else if (field === 'fieldId' && mapping.sourceType === DataSourceType.FRAME_FIELD) {
    // 当选择字段时，设置sourceId为字段ID
    mapping.sourceId = value;
  } else if (field === 'sourceId' && mapping.sourceType === DataSourceType.CURRENT_FIELD) {
    // 当前帧字段直接设置sourceId
    mapping.sourceId = value;
  } else if (field === 'sourceId' && mapping.sourceType === DataSourceType.GLOBAL_STAT) {
    // 全局统计直接设置sourceId
    mapping.sourceId = value;
  } else if (field === 'sourceType') {
    // 切换数据源类型时重置相关字段
    mapping.sourceType = value as DataSourceType;
    mapping.sourceId = '';
    mapping.frameId = '';
    mapping.fieldId = '';
  } else if (field === 'identifier') {
    // 更新变量标识符
    mapping.identifier = value;
  }

  updateExpressionConfig();
}
</script>

<template>
  <div v-if="showConfigPanel" class="bg-industrial-panel rounded-lg p-4 border border-industrial h-full">
    <div class="flex flex-col h-full">
      <!-- 表达式配置 -->
      <div v-if="isExpressionField" class="flex-1 overflow-y-auto">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-sm font-medium text-industrial-primary">
            <q-icon name="functions" size="xs" class="mr-1 text-warning" />
            表达式配置
          </h4>
        </div>

        <!-- 验证错误显示 -->
        <div v-if="hasValidationErrors" class="mb-4 p-3 bg-red-900/20 border border-red-700 rounded">
          <div class="flex items-center gap-2 mb-2">
            <q-icon name="error" size="xs" class="text-red-400" />
            <span class="text-xs font-medium text-red-400">配置错误</span>
          </div>
          <ul class="text-xs text-red-300 space-y-1">
            <li v-for="error in validationErrors" :key="error" class="flex items-start gap-1">
              <span class="text-red-400">•</span>
              <span>{{ error }}</span>
            </li>
          </ul>
        </div>

        <!-- 变量映射 -->
        <div class="mb-4">
          <div class="flex items-center justify-between mb-2">
            <label class="text-xs font-medium text-industrial-secondary"> 变量映射 </label>
            <q-btn icon="add" size="sm" color="blue-5" flat dense @click="addVariableMapping">
              添加变量
            </q-btn>
          </div>

          <div class="space-y-2 max-h-[30vh] overflow-auto">
            <div v-for="(mapping, index) in localField.expressionConfig?.variables || []" :key="index"
              class="bg-industrial-secondary rounded p-3 border border-industrial-secondary">
              <div class="flex items-center gap-2 mb-2">
                <q-input v-model="mapping.identifier" label="变量标识符" outlined dense dark class="w-32"
                  @update:model-value="
                    updateVariableMapping(mapping, 'identifier', $event as string)
                    " />
                <q-select v-model="mapping.sourceType" :options="dataSourceTypeOptions" option-value="value"
                  option-label="label" emit-value map-options label="数据源类型" outlined dense dark class="w-40"
                  @update:model-value="updateVariableMapping(mapping, 'sourceType', $event)" />
                <q-btn icon="delete" size="sm" color="red" flat dense @click="removeVariableMapping(index)" />
              </div>

              <!-- 当前帧字段选择 -->
              <div v-if="mapping.sourceType === DataSourceType.CURRENT_FIELD" class="flex gap-2">
                <q-select v-model="mapping.sourceId" :options="currentFrameFieldOptions" option-value="value"
                  option-label="label" emit-value map-options label="选择当前帧字段" placeholder="选择字段" outlined dense dark
                  class="flex-1" @update:model-value="updateVariableMapping(mapping, 'sourceId', $event)" />
              </div>

              <!-- 接收帧字段选择 -->
              <div v-else-if="mapping.sourceType === DataSourceType.FRAME_FIELD" class="flex gap-2">
                <q-select v-model="mapping.frameId" :options="receiveFrameOptions" option-value="value"
                  option-label="label" emit-value map-options label="选择接收帧" placeholder="选择帧" outlined dense dark
                  class="w-48" @update:model-value="updateVariableMapping(mapping, 'frameId', $event)" />
                <q-select v-model="mapping.fieldId" :options="getReceiveFrameFieldOptions(mapping.frameId || '')"
                  option-value="value" option-label="label" emit-value map-options label="选择字段" placeholder="选择字段"
                  outlined dense dark class="flex-1" :disable="!mapping.frameId"
                  @update:model-value="updateVariableMapping(mapping, 'fieldId', $event)" />
              </div>

              <!-- 全局统计选择 -->
              <div v-else-if="mapping.sourceType === DataSourceType.GLOBAL_STAT" class="flex gap-2">
                <q-select v-model="mapping.sourceId" :options="globalStatsOptions" option-value="value"
                  option-label="label" emit-value map-options label="选择统计项" placeholder="选择统计项" outlined dense dark
                  class="flex-1" @update:model-value="updateVariableMapping(mapping, 'sourceId', $event)" />
              </div>
            </div>
          </div>
        </div>

        <!-- 条件表达式 -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-xs font-medium text-industrial-secondary"> 条件表达式 </label>
            <q-btn icon="add" size="sm" color="orange-5" flat dense @click="addConditionalExpression">
              添加条件
            </q-btn>
          </div>

          <div class="space-y-2 max-h-[40vh] overflow-auto">
            <div v-for="(expr, index) in localField.expressionConfig?.expressions || []" :key="index"
              class="bg-industrial-secondary rounded p-3 border border-industrial-secondary">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-xs text-industrial-secondary w-12">条件:</span>
                <q-input v-model="expr.condition" placeholder="如: a > 10" outlined dense dark class="flex-1"
                  @update:model-value="
                    updateConditionalExpression(expr, 'condition', $event as string)
                    " />
                <q-btn icon="delete" size="sm" color="red" flat dense @click="removeConditionalExpression(index)" />
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-industrial-secondary w-12">表达式:</span>
                <q-input v-model="expr.expression" placeholder="如: a * 2" outlined dense dark class="flex-1"
                  @update:model-value="
                    updateConditionalExpression(expr, 'expression', $event as string)
                    " />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 选项配置（select/radio类型） -->
      <div v-else-if="isOptionsField" class="flex flex-col h-[70vh] overflow-auto">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-sm font-medium text-industrial-primary">
            <q-icon name="list" size="xs" class="mr-1 text-blue-5" />
            选项配置
          </h4>
          <q-btn icon="add" size="sm" color="blue-5" flat dense @click="addOption">
            添加选项
          </q-btn>
        </div>

        <div class="flex-1 overflow-y-auto">
          <div class="space-y-2">
            <div v-for="(option, index) in localField.options || []" :key="index"
              class="flex gap-2 items-center bg-industrial-secondary rounded p-2 border border-industrial-secondary">
              <q-input v-model="option.value" dense outlined dark class="flex-1" placeholder="值" hide-bottom-space
                @update:model-value="updateField" />
              <q-input v-model="option.label" dense outlined dark class="flex-1" placeholder="标签" hide-bottom-space
                @update:model-value="updateField" />
              <q-checkbox v-model="option.isDefault" dense color="blue-5"
                @update:model-value="updateDefaultOption(index)" class="mx-1" />
              <q-btn flat round color="red" icon="delete" size="xs" dense @click="removeOption(index)" />
            </div>
            <div v-if="!localField.options || localField.options.length === 0"
              class="text-center text-industrial-secondary text-xs py-4">
              暂无选项
            </div>
          </div>
        </div>

        <div class="mt-4 pt-3 border-t border-industrial text-xs text-industrial-secondary">
          <div>设置字段可选值，值用于数据处理，标签用于显示</div>
          <div v-if="localField.inputType === 'select'">
            下拉菜单需要至少 {{ INPUT_TYPE_CONFIG.select.minOptions }} 个选项
          </div>
          <div v-if="localField.inputType === 'radio'">
            单选按钮需要至少 {{ INPUT_TYPE_CONFIG.radio.minOptions }} 个选项
          </div>
          <div>勾选框表示默认选项，只能有一个默认选项</div>
        </div>
      </div>

      <!-- 普通输入字段或空状态 -->
      <div v-else class="flex items-center justify-center h-full text-center text-industrial-secondary">
        <div>
          <q-icon name="info" size="2rem" class="opacity-50 mb-2" />
          <div class="text-sm">该输入类型无需额外配置</div>
        </div>
      </div>
    </div>
  </div>

  <!-- 空状态提示（当字段类型不需要配置时） -->
  <div v-else class="flex items-center justify-center h-full text-center text-industrial-secondary">
    <div>
      <q-icon name="info" size="2rem" class="opacity-50 mb-2" />
      <div class="text-sm">该输入类型无需额外配置</div>
    </div>
  </div>
</template>

<style scoped>
/* 使用UnoCSS，移除多余样式 */
.q-field--outlined {
  background-color: rgba(16, 24, 40, 0.6);
}
</style>
