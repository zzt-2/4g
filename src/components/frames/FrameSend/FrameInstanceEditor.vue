<script setup lang="ts">
import { computed } from 'vue';
import { useSendFrameInstancesStore } from '../../../stores/frames/sendFrameInstancesStore';
import type { SendInstanceField } from '../../../types/frames/sendInstances';
import { getHexLengthByDataType } from '../../../utils/frames/hexCovertUtils';

// 获取stores
const sendFrameInstancesStore = useSendFrameInstancesStore();

// 始终处于编辑模式
const isEditing = true;

// 计算属性
const hasConfigurableFields = computed(() => {
  if (!sendFrameInstancesStore.localInstance) return false;
  return sendFrameInstancesStore.localInstance.fields.some(
    (field: SendInstanceField) => field.configurable,
  );
});

const configurableFields = computed(() => {
  if (!sendFrameInstancesStore.localInstance) return [];
  const fields = sendFrameInstancesStore.localInstance.fields.filter(
    (field: SendInstanceField) => field.configurable,
  );
  return fields;
});

const nonConfigurableFields = computed(() => {
  if (!sendFrameInstancesStore.localInstance) return [];
  const fields = sendFrameInstancesStore.localInstance.fields.filter(
    (field: SendInstanceField) => !field.configurable,
  );
  return fields;
});

// 计算字段的全局索引
const getFieldGlobalIndex = (localIndex: number, isConfigurable: boolean) => {
  if (!sendFrameInstancesStore.localInstance) return localIndex + 1;

  // 如果是可配置字段，需要计算它在所有字段中的位置
  if (isConfigurable) {
    const allFields = sendFrameInstancesStore.localInstance.fields;
    const field = configurableFields.value[localIndex];
    if (!field) return localIndex + 1;
    return allFields.findIndex((f) => f.id === field.id) + 1;
  }
  // 如果是不可配置字段，也需要计算其在所有字段中的位置
  else {
    const allFields = sendFrameInstancesStore.localInstance.fields;
    const field = nonConfigurableFields.value[localIndex];
    if (!field) return localIndex + 1;
    return allFields.findIndex((f) => f.id === field.id) + 1;
  }
};

// 字段值更新处理
function handleValueChange(field: SendInstanceField, value: string | number | null) {
  sendFrameInstancesStore.updateFieldValue(field.id, value);
}

// 获取字段对应的输入规则
function getFieldRules(field: SendInstanceField) {
  // console.log('field', field);
  const rules = [];

  if (['uint8', 'uint16', 'uint32', 'int8', 'int16', 'int32'].includes(field.dataType)) {
    rules.push((val: string) => {
      if (val === '') return true;

      // 处理十六进制格式 (0x开头)
      if (val.trim().toLowerCase().startsWith('0x')) {
        // 基本格式验证
        if (!/^0x[ 0-9a-f]+$/i.test(val.trim())) {
          return '十六进制格式仅支持0-9、a-f、A-F字符';
        }

        // 检查长度是否超过限制
        const inputValue = val.trim().replace(/\s+/g, '');
        const hexLength = getHexLengthByDataType(field.dataType);
        const actualHexLength = inputValue.replace(/^0x/i, '').length;

        if (field.length && field.dataType === 'bytes') {
          // bytes类型特殊处理，根据field.length检查
          if (actualHexLength > field.length * 2) {
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
  if (['uint8', 'uint16', 'uint32', 'int8', 'int16', 'int32'].includes(field.dataType)) {
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
  <div class="flex flex-col h-full bg-[#131725]">
    <div
      class="flex-1 overflow-y-auto p-2 bg-[#131725]"
      v-if="sendFrameInstancesStore.localInstance"
    >
      <!-- 实例基本信息编辑 - 极简紧凑布局 -->
      <div class="mb-2 pb-2 border-b border-dashed border-[#2A2F45]" v-if="isEditing">
        <!-- 并排布局的ID和备注编辑 - 更加紧凑 -->
        <div class="flex flex-row gap-2">
          <!-- ID编辑 -->
          <div class="flex items-center gap-2 flex-1">
            <div class="text-xs font-medium text-white w-16 flex-shrink-0">
              <q-icon name="label" size="xs" class="mr-1 text-blue-5" />
              实例ID
            </div>
            <q-input
              v-model="sendFrameInstancesStore.editedId"
              dense
              outlined
              dark
              bg-color="rgba(16, 24, 40, 0.6)"
              class="w-full text-xs"
              :rules="[(val) => val.trim().length > 0 || 'ID不能为空']"
              input-class="py-0.5 px-1"
              hide-bottom-space
              error-message="ID不能为空"
            />
          </div>

          <!-- 备注编辑 -->
          <div class="flex items-center gap-2 flex-1">
            <div class="text-xs font-medium text-white w-16 flex-shrink-0">
              <q-icon name="notes" size="xs" class="mr-1 text-blue-5" />
              备注
            </div>
            <q-input
              v-model="sendFrameInstancesStore.editedDescription"
              dense
              outlined
              dark
              bg-color="rgba(16, 24, 40, 0.6)"
              class="w-full text-xs"
              placeholder="可选描述信息"
              input-class="py-0.5 px-1"
              hide-bottom-space
            />
          </div>
        </div>
      </div>

      <!-- 无字段或没有可配置字段时显示提示 -->
      <div
        class="flex items-center justify-center p-4 text-blue-grey-4 bg-[#1a1e2e] rounded-lg"
        v-if="!sendFrameInstancesStore.localInstance.fields.length"
      >
        <q-icon name="info" color="warning" size="sm" class="mr-2" />
        <span class="text-sm">该帧实例没有定义任何字段</span>
      </div>

      <div
        class="flex items-center justify-center p-4 text-blue-grey-4 bg-[#1a1e2e] rounded-lg"
        v-else-if="!hasConfigurableFields && !isEditing"
      >
        <q-icon name="info" color="info" size="sm" class="mr-2" />
        <span class="text-sm">该帧实例没有可配置字段</span>
      </div>

      <!-- 可配置字段表单 - 名称和类型垂直排列，输入框水平排列 -->
      <div
        class="flex flex-col gap-1"
        v-if="sendFrameInstancesStore.localInstance.fields.length > 0"
      >
        <div v-if="configurableFields.length > 0">
          <div class="text-blue-grey-4 text-xs uppercase font-medium mb-1 flex items-center">
            <q-icon name="tune" size="xs" class="mr-1 text-blue-5" />
            可配置字段
          </div>

          <!-- 新的布局：左侧垂直排列名称和类型，右侧是等高的输入框 -->
          <div class="space-y-1">
            <div
              v-for="(field, index) in configurableFields"
              :key="field.id"
              class="bg-[#1a1e2e] rounded-md p-2 shadow-md border border-[#2A2F45] hover:border-blue-8 transition-colors"
            >
              <div class="flex flex-row items-start gap-3">
                <!-- 可配置字段的序号显示 -->
                <div
                  class="flex-shrink-0 text-xs font-medium text-blue-400 w-8 flex items-center justify-center"
                >
                  [{{ getFieldGlobalIndex(index, true) }}]
                </div>

                <!-- 左侧字段标签和类型垂直排列 -->
                <div class="w-24 flex-shrink-0 flex flex-col">
                  <div class="text-xs font-medium text-white">
                    {{ field.label }}
                  </div>
                  <div class="mt-0.5">
                    <q-badge outline :color="'blue-5'" class="text-2xs px-1">
                      {{ field.dataType }}
                    </q-badge>
                  </div>
                </div>

                <!-- 右侧输入控件区域 -->
                <div class="flex flex-1 gap-2 items-center">
                  <!-- 左侧输入控件 -->
                  <div class="flex-1">
                    <!-- 下拉框类型 -->
                    <q-select
                      v-if="field.inputType === 'select'"
                      v-model="field.value"
                      :options="hasValidOptions(field) ? field.options : getDefaultOptions(field)"
                      :disable="!isEditing"
                      dense
                      outlined
                      dark
                      option-value="value"
                      option-label="label"
                      emit-value
                      map-options
                      bg-color="rgba(16, 24, 40, 0.6)"
                      class="w-full text-xs"
                      @update:model-value="handleValueChange(field, $event)"
                      input-class="py-0.5"
                      hide-bottom-space
                    >
                      <!-- 添加调试信息 -->
                      <template v-if="!hasValidOptions(field)" v-slot:before>
                        <div class="text-warning text-2xs">使用默认选项</div>
                      </template>
                    </q-select>

                    <!-- 单选框类型 -->
                    <div v-else-if="field.inputType === 'radio'" class="w-full">
                      <!-- 当有选项时正常显示 -->
                      <q-option-group
                        v-if="hasValidOptions(field) && field.options"
                        v-model="field.value"
                        :options="
                          field.options.map((opt) => ({ label: opt.label, value: opt.value }))
                        "
                        :disable="!isEditing"
                        type="radio"
                        inline
                        dense
                        class="w-full text-xs"
                        @update:model-value="handleValueChange(field, $event)"
                      />
                      <!-- 无选项时显示默认选项 -->
                      <q-option-group
                        v-else
                        v-model="field.value"
                        :options="
                          getDefaultOptions(field).map((opt) => ({
                            label: opt.label,
                            value: opt.value,
                          }))
                        "
                        :disable="!isEditing"
                        type="radio"
                        inline
                        dense
                        class="w-full text-xs"
                        @update:model-value="handleValueChange(field, $event)"
                      >
                        <div class="text-warning text-2xs mb-1">使用默认选项</div>
                      </q-option-group>
                    </div>

                    <!-- 默认输入框类型 -->
                    <q-input
                      v-else
                      v-model="field.value"
                      :disable="!isEditing"
                      dense
                      outlined
                      dark
                      bg-color="rgba(16, 24, 40, 0.6)"
                      class="w-full text-xs"
                      :rules="getFieldRules(field)"
                      type="text"
                      @update:model-value="handleValueChange(field, $event)"
                      input-class="py-0.5"
                      hide-bottom-space
                    />
                  </div>

                  <!-- 右侧十六进制显示 -->
                  <div
                    class="flex-1 px-2 py-1 h-40px bg-[#0d1117] rounded-md font-mono text-xs text-blue-400 flex items-center justify-left"
                    v-if="
                      ['uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32', 'bytes'].includes(
                        field.dataType,
                      )
                    "
                  >
                    <span>HEX: {{ sendFrameInstancesStore.hexValues[field.id] }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 不可配置字段信息 - 使用同样的布局 -->
        <div v-if="nonConfigurableFields.length">
          <div class="text-blue-grey-4 text-xs uppercase font-medium mb-1 flex items-center">
            <q-icon name="lock" size="xs" class="mr-1 text-blue-5" />
            不可配置字段
          </div>

          <!-- 标签左对齐，值对半分的布局 -->
          <div class="space-y-1">
            <div
              v-for="(field, index) in nonConfigurableFields"
              :key="field.id"
              class="bg-[#1a1e2e] bg-opacity-70 rounded-md p-2 shadow-sm border border-[#232b3f]"
            >
              <div class="flex flex-row items-start gap-3">
                <!-- 不可配置字段的序号显示 -->
                <div
                  class="flex-shrink-0 text-xs font-medium text-blue-grey-5 w-8 flex items-center justify-center"
                >
                  [{{ getFieldGlobalIndex(index, false) }}]
                </div>

                <!-- 左侧字段标签和类型垂直排列 -->
                <div class="w-24 flex-shrink-0 flex flex-col">
                  <div class="text-xs font-medium text-blue-grey-2">
                    {{ field.label }}
                  </div>
                  <div class="mt-0.5">
                    <q-badge outline color="blue-grey-7" class="text-2xs">
                      {{ field.dataType }}
                    </q-badge>
                  </div>
                </div>

                <!-- 值显示 -->
                <div
                  class="flex-1 font-mono text-xs text-blue-grey-4 py-1 px-2 bg-[#0d1117] rounded-md"
                >
                  {{ field.value }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态提示 -->
    <div
      class="flex-1 flex flex-col items-center justify-center p-4"
      v-if="!sendFrameInstancesStore.localInstance"
    >
      <q-icon name="info" color="grey" size="2rem" class="opacity-50" />
      <div class="text-blue-grey-4 mt-2 text-center text-sm">请选择帧实例进行编辑</div>
    </div>
  </div>
</template>

<style>
/* 使用UnoCSS，移除SCSS样式 */
.text-2xs {
  font-size: 0.65rem;
}

/* 修改Quasar的样式，消除底部空间 */
.q-field--with-bottom.q-field--hide-bottom-space .q-field__bottom {
  min-height: 0 !important;
  padding: 0 !important;
}

/* 编辑器容器宽度 */
.flex-col.h-full.bg-\[\#131725\] {
  width: 100%;
  min-width: 0;
  padding: 1rem;
}

/* 优化字段标签区域样式 */
.w-24.flex-shrink-0.flex.flex-col {
  width: 8rem;
  min-width: 8rem;
}

/* 调整序号的样式 */
.w-8.flex.items-center.justify-center {
  min-width: 2.5rem;
}

/* 优化输入控件和十六进制显示区域 */
.flex.flex-1.gap-4 {
  gap: 0.75rem;
}

/* 调整实例基本信息编辑区域 */
.mb-2.pb-2.border-b.border-dashed.border-\[\#2A2F45\] {
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
}
</style>
