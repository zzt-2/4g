<script setup lang="ts">
import { computed } from 'vue';
import { useSendFrameInstancesStore } from '../../../stores/frames/sendFrameInstancesStore';
import { useFrameExpressionManager } from '../../../composables/frames/useFrameExpressionManager';
import type { SendInstanceField } from '../../../types/frames/sendInstances';
import { getHexLengthByDataType } from '../../../utils/frames/hexCovertUtils';

// 获取stores和composables
const sendFrameInstancesStore = useSendFrameInstancesStore();
const frameExpressionManager = useFrameExpressionManager();

// 始终处于编辑模式
const isEditing = true;

// 计算属性 - 检查是否有可配置字段
const hasConfigurableFields = computed(() => {
  return allFieldGroups.value.some((group) => group.config.editable && group.fields.length > 0);
});

// 字段分组配置
interface FieldGroupConfig {
  type: 'payload' | 'calculation' | 'readonly';
  title: string;
  icon: string;
  iconColor: string;
  editable: boolean;
  showHex: boolean;
  cardClass: string;
  indexColor: string;
  badgeColor: string;
  bgColorClass: string;
}

const fieldGroupConfigs: FieldGroupConfig[] = [
  {
    type: 'payload',
    title: '可调字段',
    icon: 'tune',
    iconColor: 'text-blue-5',
    editable: true,
    showHex: true,
    cardClass:
      'bg-industrial-panel rounded-md p-2 shadow-md border border-industrial hover:border-industrial-accent transition-colors',
    indexColor: 'text-industrial-accent',
    badgeColor: 'blue-5',
    bgColorClass: 'rgba(16, 24, 40, 0.6)',
  },
  {
    type: 'calculation',
    title: '计算参数',
    icon: 'calculate',
    iconColor: 'text-orange-5',
    editable: true,
    showHex: false,
    cardClass:
      'bg-industrial-panel rounded-md p-2 shadow-md border border-industrial hover:border-industrial-accent transition-colors',
    indexColor: 'text-orange-400',
    badgeColor: 'orange-5',
    bgColorClass: 'rgba(40, 35, 20, 0.6)',
  },
  {
    type: 'readonly',
    title: '不可配置字段',
    icon: 'lock',
    iconColor: 'text-blue-5',
    editable: false,
    showHex: true,
    cardClass:
      'bg-industrial-panel opacity-70 rounded-md p-2 shadow-sm border border-industrial-secondary',
    indexColor: 'text-industrial-secondary',
    badgeColor: 'blue-grey-7',
    bgColorClass: 'rgba(16, 24, 40, 0.6)',
  },
];

// 统一的字段获取方法
function getFieldsByType(type: 'payload' | 'calculation' | 'readonly'): SendInstanceField[] {
  if (!sendFrameInstancesStore.localInstance) return [];

  switch (type) {
    case 'payload':
      return sendFrameInstancesStore.localInstance.fields.filter(
        (field) => field.configurable && (field.dataParticipationType || 'direct') === 'direct',
      );
    case 'calculation':
      return sendFrameInstancesStore.localInstance.fields.filter(
        (field) => field.configurable && field.dataParticipationType === 'indirect',
      );
    case 'readonly':
      return sendFrameInstancesStore.localInstance.fields.filter((field) => !field.configurable);
    default:
      return [];
  }
}

// 统一的字段分组数据
const allFieldGroups = computed(() => {
  return fieldGroupConfigs
    .map((config) => ({
      config,
      fields: getFieldsByType(config.type).map((field, index) => ({
        field,
        globalIndex: getFieldGlobalIndex(index, config.editable),
        groupConfig: config,
        isConfigurable: config.editable,
      })),
    }))
    .filter((group) => group.fields.length > 0);
});

// 计算所有表达式字段
const expressionFields = computed(() => {
  if (!sendFrameInstancesStore.localInstance) return [];
  return sendFrameInstancesStore.localInstance.fields.filter(
    (field: SendInstanceField) => field.inputType === 'expression',
  );
});

// 计算字段的全局索引
const getFieldGlobalIndex = (localIndex: number, isConfigurable: boolean) => {
  if (!sendFrameInstancesStore.localInstance) return localIndex + 1;

  const allFields = sendFrameInstancesStore.localInstance.fields;

  // 如果是可配置字段，需要计算它在所有字段中的位置
  if (isConfigurable) {
    // 合并载荷和计算字段
    const configurableFields = [...getFieldsByType('payload'), ...getFieldsByType('calculation')];
    const field = configurableFields[localIndex];
    if (!field) return localIndex + 1;
    return allFields.findIndex((f) => f.id === field.id) + 1;
  }
  // 如果是不可配置字段，也需要计算其在所有字段中的位置
  else {
    const readonlyFields = getFieldsByType('readonly');
    const field = readonlyFields[localIndex];
    if (!field) return localIndex + 1;
    return allFields.findIndex((f) => f.id === field.id) + 1;
  }
};

// 字段值更新处理
function handleValueChange(field: SendInstanceField, value: string | number | null) {
  sendFrameInstancesStore.updateFieldValue(field.id, value);
}

// 计算所有表达式 - 使用新的表达式管理器
function calculateAllExpressions() {
  if (!sendFrameInstancesStore.localInstance) return;

  console.log('开始计算表达式...');

  // 使用新的表达式管理器
  const updateFieldValue = (fieldId: string, value: string) => {
    sendFrameInstancesStore.updateFieldValue(fieldId, value);
  };

  frameExpressionManager.calculateAndApplySendFrame(
    sendFrameInstancesStore.localInstance,
    updateFieldValue,
  );
}

// 获取字段对应的输入规则
function getFieldRules(field: SendInstanceField) {
  const rules = [];

  if (['uint8', 'uint16', 'uint32', 'uint64', 'int8', 'int16', 'int32', 'int64', 'bytes'].includes(field.dataType)) {
    rules.push((val: string) => {
      if (val === '') return true;

      // 处理十六进制格式 (0x开头)
      if (val.trim().toLowerCase().startsWith('0x') || field.dataType === 'bytes') {
        // 基本格式验证
        if (!/^(0x)?[ 0-9a-fA-F]+$/i.test(val.trim()) && !field.isASCII) {
          return '十六进制格式仅支持0-9、a-f、A-F字符';
        }

        // 检查长度是否超过限制
        const inputValue = val.trim().replace(/\s+/g, '');
        const hexLength = getHexLengthByDataType(field.dataType);
        const actualHexLength = inputValue.replace(/^0x/i, '').length;

        if (field.length && field.dataType === 'bytes') {
          // bytes类型特殊处理，根据field.length检查
          if (field.isASCII) {
            if (actualHexLength > field.length) {
              return `超出字段长度限制，最大${field.length}字符`;
            }
          } else if (actualHexLength > field.length * 2) {
            return `超出字段长度限制，最大${field.length}字节`;
          }
        } else if (actualHexLength > hexLength) {
          // 其他类型根据数据类型检查
          return `超出数据类型长度限制，最大${hexLength / 2}字节`;
        }

        return true;
      }
      // 处理普通数字格式 (可包含空格)
      else {
        if (!/^-?[ 0-9]+$/.test(val)) {
          return '请输入数字，可包含空格';
        }

        // 检查数值是否超出范围
        const numValue = parseInt(val.replace(/\s+/g, ''), 10);
        let isInRange = true;
        let rangeMessage = '';

        switch (field.dataType) {
          case 'uint8':
            isInRange = numValue >= 0 && numValue <= 255;
            rangeMessage = '数值超出范围(0-255)';
            break;
          case 'int8':
            isInRange = numValue >= -128 && numValue <= 127;
            rangeMessage = '数值超出范围(-128-127)';
            break;
          case 'uint16':
            isInRange = numValue >= 0 && numValue <= 65535;
            rangeMessage = '数值超出范围(0-65535)';
            break;
          case 'int16':
            isInRange = numValue >= -32768 && numValue <= 32767;
            rangeMessage = '数值超出范围(-32768-32767)';
            break;
          case 'uint32':
            isInRange = numValue >= 0;
            rangeMessage = '数值不能为负数';
            break;
          case 'int32':
            isInRange = numValue >= -2147483648 && numValue <= 2147483647;
            rangeMessage = '数值超出范围(-2147483648-2147483647)';
            break;
        }

        return isInRange || rangeMessage;
      }
    });
  } else if (field.dataType === 'float') {
    rules.push((val: string) => val === '' || /^-?\d+(\.\d+)?$/.test(val) || '请输入有效的数字');
  }

  return rules;
}

// 调试函数：添加辅助函数检查字段选项是否有效
function hasValidOptions(field: SendInstanceField): boolean {
  return Boolean(field.options && Array.isArray(field.options) && field.options.length > 0);
}

// 生成默认选项，当原选项为空时使用
function getDefaultOptions(field: SendInstanceField) {
  // 如果已有选项则返回原选项
  if (hasValidOptions(field) && field.options) return field.options;

  // 否则根据数据类型生成默认选项
  if (['uint8', 'uint16', 'uint32', 'uint64', 'int8', 'int16', 'int32', 'int64', 'bytes'].includes(field.dataType)) {
    return [
      { value: '0', label: '0' },
      { value: '1', label: '1' },
    ];
  } else {
    return [
      { value: 'option1', label: '选项1' },
      { value: 'option2', label: '选项2' },
    ];
  }
}
</script>

<template>
  <div class="flex flex-col h-full bg-industrial-primary w-full min-w-0 p-4">
    <div class="flex-1 overflow-y-auto p-2 bg-industrial-primary" v-if="sendFrameInstancesStore.localInstance">
      <!-- 字段统计信息和表达式刷新按钮 -->
      <div class="mb-4 pb-3 border-b border-dashed border-industrial"
        v-if="sendFrameInstancesStore.localInstance.fields.length > 0">
        <div class="flex flex-row justify-between items-center">
          <div class="flex flex-row gap-4 text-xs">
            <div class="flex items-center gap-1">
              <q-icon name="tune" size="xs" class="text-blue-5" />
              <span class="text-industrial-secondary">可调: {{ getFieldsByType('payload').length }}</span>
            </div>
            <div class="flex items-center gap-1">
              <q-icon name="calculate" size="xs" class="text-orange-5" />
              <span class="text-industrial-secondary">计算: {{ getFieldsByType('calculation').length }}</span>
            </div>
            <div class="flex items-center gap-1">
              <q-icon name="lock" size="xs" class="text-blue-grey-7" />
              <span class="text-industrial-secondary">只读: {{ getFieldsByType('readonly').length }}</span>
            </div>
            <div class="flex items-center gap-1">
              <q-icon name="list" size="xs" class="text-green-5" />
              <span class="text-industrial-secondary">总计: {{ sendFrameInstancesStore.localInstance.fields.length
              }}</span>
            </div>
            <div class="flex items-center gap-1" v-if="expressionFields.length > 0">
              <q-icon name="functions" size="xs" class="text-warning" />
              <span class="text-industrial-secondary">表达式: {{ expressionFields.length }}</span>
            </div>
          </div>

          <!-- 表达式刷新按钮 -->
          <div v-if="expressionFields.length > 0">
            <q-btn icon="refresh" size="sm" color="warning" flat dense @click="calculateAllExpressions" class="px-2">
              <q-tooltip>刷新所有表达式计算</q-tooltip>
              刷新表达式
            </q-btn>
          </div>
        </div>
      </div>

      <!-- 实例基本信息编辑 - 极简紧凑布局 -->
      <div class="mb-2 pb-2 border-b border-dashed border-industrial" v-if="isEditing">
        <!-- 并排布局的ID和备注编辑 - 更加紧凑 -->
        <div class="flex flex-row gap-2">
          <!-- ID编辑 -->
          <div class="flex items-center gap-2">
            <div class="text-xs font-medium text-industrial-primary w-400px flex-shrink-0">
              <q-icon name="label" size="xs" class="mr-1 text-blue-5" />
              实例ID
            </div>
            <q-input v-model="sendFrameInstancesStore.editedId" dense outlined dark bg-color="rgba(16, 24, 40, 0.6)"
              class="w-full text-xs" :rules="[(val) => val.trim().length > 0 || 'ID不能为空']" input-class="py-0.5 px-1"
              hide-bottom-space error-message="ID不能为空" />
          </div>

          <!-- 备注编辑 -->
          <div class="flex items-center gap-2 flex-1">
            <div class="text-xs font-medium text-industrial-primary w-16 flex-shrink-0">
              <q-icon name="notes" size="xs" class="mr-1 text-blue-5" />
              备注
            </div>
            <q-input v-model="sendFrameInstancesStore.editedDescription" dense outlined dark
              bg-color="rgba(16, 24, 40, 0.6)" class="w-full text-xs" placeholder="可选描述信息" input-class="py-0.5 px-1"
              hide-bottom-space />
          </div>
        </div>
      </div>

      <!-- 无字段或没有可配置字段时显示提示 -->
      <div class="flex items-center justify-center p-4 text-blue-grey-4 bg-[#1a1e2e] rounded-lg"
        v-if="!sendFrameInstancesStore.localInstance.fields.length">
        <q-icon name="info" color="warning" size="sm" class="mr-2" />
        <span class="text-sm">该帧实例没有定义任何字段</span>
      </div>

      <div class="flex items-center justify-center p-4 text-blue-grey-4 bg-[#1a1e2e] rounded-lg"
        v-else-if="!hasConfigurableFields && !isEditing">
        <q-icon name="info" color="info" size="sm" class="mr-2" />
        <span class="text-sm">该帧实例没有可配置字段</span>
      </div>

      <!-- 统一的字段分组显示 -->
      <div class="flex flex-col gap-3" v-if="sendFrameInstancesStore.localInstance.fields.length > 0">
        <template v-for="group in allFieldGroups" :key="group.config.type">
          <!-- 分组标题 -->
          <div class="text-blue-grey-4 text-xs uppercase font-medium mb-1 flex items-center"
            :class="group.config.type !== 'payload' ? 'mt-3' : ''">
            <q-icon :name="group.config.icon" size="xs" :class="['mr-1', group.config.iconColor]" />
            {{ group.config.title }}
          </div>

          <!-- 字段列表 -->
          <div :class="group.config.type === 'calculation'
            ? 'grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-1'
            : 'space-y-1'
            ">
            <div v-for="fieldItem in group.fields" :key="fieldItem.field.id" :class="fieldItem.groupConfig.cardClass">
              <!-- 统一的字段说明 tooltip -->
              <q-tooltip v-if="fieldItem.field.description" class="bg-industrial-secondary text-industrial-primary"
                anchor="top middle" self="bottom middle" :offset="[0, 8]">
                {{ fieldItem.field.description }}
              </q-tooltip>

              <div class="flex flex-row items-start gap-3">
                <!-- 序号显示 -->
                <div class="flex-shrink-0 text-xs font-medium w-8 min-w-10 flex items-center justify-center"
                  :class="fieldItem.groupConfig.indexColor">
                  [{{ fieldItem.globalIndex }}]
                </div>

                <!-- 左侧字段标签和类型垂直排列 -->
                <div class="w-32 min-w-32 flex-shrink-0 flex flex-col">
                  <div class="text-xs font-medium flex items-center gap-1" :class="fieldItem.groupConfig.type === 'readonly'
                    ? 'text-industrial-secondary'
                    : 'text-industrial-primary'
                    ">
                    {{ fieldItem.field.label }}
                    <!-- 表达式字段图标 -->
                    <q-icon v-if="fieldItem.field.inputType === 'expression'" name="functions" color="warning"
                      size="xs">
                      <q-tooltip class="bg-industrial-secondary text-industrial-primary max-w-xl" anchor="top middle"
                        self="bottom middle" :offset="[0, 8]">
                        <div v-if="fieldItem.field.expressionConfig?.expressions?.length">
                          <div class="font-medium mb-1">表达式配置:</div>
                          <div v-for="(expr, i) in fieldItem.field.expressionConfig.expressions" :key="i"
                            class="text-xs mb-1">
                            <div>条件: {{ expr.condition }}</div>
                            <div>表达式: {{ expr.expression }}</div>
                          </div>
                        </div>
                        <div v-else>表达式计算字段（未配置）</div>
                      </q-tooltip>
                    </q-icon>
                  </div>
                  <div class="mt-0.5">
                    <q-badge outline :color="fieldItem.groupConfig.badgeColor" class="text-2xs px-1">
                      {{ fieldItem.field.dataType }}
                    </q-badge>
                  </div>
                </div>

                <!-- 右侧输入控件区域 -->
                <div class="flex flex-1 gap-3 items-center">
                  <!-- 只读字段显示值 -->
                  <template v-if="!fieldItem.groupConfig.editable">
                    <div
                      class="w-400px flex font-mono text-xm text-industrial-secondary items-center justify-start h-40px pl-4 bg-industrial-secondary rounded-md">
                      {{ fieldItem.field.value }}
                    </div>

                    <!-- 只读字段的十六进制显示 -->
                    <div v-if="
                      fieldItem.groupConfig.showHex &&
                      ['uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32', 'uint64', 'int64', 'bytes'].includes(
                        fieldItem.field.dataType,
                      )
                    "
                      class="flex-1 px-2 py-1 h-40px bg-industrial-secondary rounded-md font-mono text-xs text-industrial-accent flex items-center justify-left">
                      <span>HEX: {{ sendFrameInstancesStore.hexValues[fieldItem.field.id] }}</span>
                    </div>
                  </template>

                  <!-- 可编辑字段的输入控件 -->
                  <template v-else>
                    <!-- 左侧输入控件 -->
                    <div class="flex-1">
                      <!-- 表达式字段特殊显示 -->
                      <div v-if="fieldItem.field.inputType === 'expression'" class="flex-1 items-center gap-2">
                        <q-input v-model="fieldItem.field.value" :disable="!isEditing" dense outlined dark
                          :bg-color="fieldItem.groupConfig.bgColorClass" class="text-xs" input-class="py-0.5"
                          hide-bottom-space @update:model-value="handleValueChange(fieldItem.field, $event)" />
                      </div>

                      <!-- 下拉框类型 -->
                      <q-select v-else-if="fieldItem.field.inputType === 'select'" v-model="fieldItem.field.value"
                        :options="hasValidOptions(fieldItem.field)
                          ? fieldItem.field.options
                          : getDefaultOptions(fieldItem.field)
                          " :disable="!isEditing" dense outlined dark option-value="value" option-label="label"
                        emit-value map-options :bg-color="fieldItem.groupConfig.bgColorClass" class="w-full text-xs"
                        @update:model-value="handleValueChange(fieldItem.field, $event)" input-class="py-0.5"
                        hide-bottom-space popup-content-class="max-h-280px overflow-y-auto">
                        <!-- 添加调试信息 -->
                        <template v-if="!hasValidOptions(fieldItem.field)" v-slot:before>
                          <div class="text-warning text-2xs">使用默认选项</div>
                        </template>
                      </q-select>

                      <!-- 单选框类型 -->
                      <div v-else-if="fieldItem.field.inputType === 'radio'" class="w-full items-center justify-center">
                        <!-- 当有选项时正常显示 -->
                        <q-option-group v-if="hasValidOptions(fieldItem.field) && fieldItem.field.options"
                          v-model="fieldItem.field.value" :options="fieldItem.field.options.map((opt) => ({
                            label: opt.label,
                            value: opt.value,
                          }))
                            " :disable="!isEditing" type="radio" inline dense class="w-full text-xs"
                          @update:model-value="handleValueChange(fieldItem.field, $event)" />
                        <!-- 无选项时显示默认选项 -->
                        <q-option-group v-else v-model="fieldItem.field.value" :options="getDefaultOptions(fieldItem.field).map((opt) => ({
                          label: opt.label,
                          value: opt.value,
                        }))
                          " :disable="!isEditing" type="radio" inline dense class="w-full text-xs"
                          @update:model-value="handleValueChange(fieldItem.field, $event)">
                          <div class="text-warning text-2xs mb-1">使用默认选项</div>
                        </q-option-group>
                      </div>

                      <!-- 默认输入框类型 -->
                      <q-input v-else v-model="fieldItem.field.value" :disable="!isEditing" dense outlined dark
                        :bg-color="fieldItem.groupConfig.bgColorClass" class="w-full text-xs"
                        :rules="getFieldRules(fieldItem.field)" type="text"
                        @update:model-value="handleValueChange(fieldItem.field, $event)" input-class="py-0.5"
                        hide-bottom-space />
                    </div>

                    <!-- 右侧十六进制显示 -->
                    <div v-if="
                      fieldItem.groupConfig.showHex &&
                      ['uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32', 'uint64', 'int64', 'bytes'].includes(
                        fieldItem.field.dataType,
                      )
                    "
                      class="flex-1 px-2 py-1 h-40px bg-industrial-secondary rounded-md font-mono text-xs text-industrial-accent flex items-center justify-left">
                      <span>{{ fieldItem.field.isASCII ? 'ASCII: ' : 'HEX: ' }} {{
                        sendFrameInstancesStore.hexValues[fieldItem.field.id]
                      }}</span>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 空状态提示 -->
    <div class="flex-1 flex flex-col items-center justify-center p-4" v-if="!sendFrameInstancesStore.localInstance">
      <q-icon name="info" color="grey" size="2rem" class="opacity-50" />
      <div class="text-blue-grey-4 mt-2 text-center text-sm">请选择帧实例进行编辑</div>
    </div>
  </div>
</template>

<style>
/* 修改Quasar的样式，消除底部空间 */
.q-field--with-bottom.q-field--hide-bottom-space .q-field__bottom {
  min-height: 0 !important;
  padding: 0 !important;
}
</style>
