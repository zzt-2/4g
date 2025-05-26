<template>
  <q-card class="w-full h-full bg-card border-primary p-4">
    <div class="flex h-full w-full">
      <!-- 左侧基础信息和设置 -->
      <div class="w-3/5 h-full pr-4 overflow-auto">
        <div class="flex flex-col space-y-4">
          <!-- 字段名称 -->
          <q-input
            v-model="fieldStore.tempField.name"
            label="字段名称"
            dense
            outlined
            class="input-bg w-full"
            placeholder="输入字段名称"
            hide-bottom-space
          />

          <!-- 数据类型、比特数/长度、输入类型、默认值放在一起 -->
          <div class="flex space-x-4 h-[92px]">
            <!-- 第一列：数据类型和比特数/长度 -->
            <div class="flex flex-col space-y-4 w-45%">
              <!-- 数据类型 -->
              <q-select
                v-model="fieldStore.tempField.dataType"
                :options="FIELD_TYPE_OPTIONS"
                label="数据类型"
                dense
                outlined
                class="input-bg"
                map-options
                emit-value
                hide-bottom-space
                @update:model-value="fieldStore.updateTempField('dataType')"
              />

              <!-- 长度 -->
              <q-input
                v-if="
                  fieldStore.tempField.dataType &&
                  ['bytes', 'string'].includes(fieldStore.tempField.dataType)
                "
                v-model.number="fieldStore.tempField.length"
                type="number"
                label="字节长度"
                dense
                outlined
                class="input-bg"
                min="1"
                placeholder="字段长度(字节)"
                hide-bottom-space
              />
            </div>

            <q-space></q-space>

            <!-- 第二列：输入类型和默认值 -->
            <div class="flex flex-col space-y-4 w-45%">
              <!-- 输入类型 -->
              <q-select
                v-model="fieldStore.tempField.inputType"
                label="输入类型"
                :options="INPUT_TYPE_OPTIONS"
                dense
                outlined
                class="input-bg"
                map-options
                emit-value
                @update:model-value="fieldStore.updateTempField('inputType')"
                hide-bottom-space
              >
                <template v-slot:hint>
                  <span class="text-secondary-color text-xs op-75">输入控件类型</span>
                </template>
              </q-select>

              <!-- 默认值 -->
              <q-input
                v-if="fieldStore.tempField.inputType === 'input'"
                v-model="fieldStore.tempField.defaultValue"
                label="默认值"
                dense
                outlined
                class="input-bg"
                placeholder="默认值"
                hide-bottom-space
              >
                <q-tooltip> 可使用十六进制(0x前缀)或十进制 </q-tooltip>
              </q-input>
            </div>
          </div>

          <!-- 可配置选项 -->
          <div class="flex items-center mb-4 text-secondary-color">
            <q-checkbox
              v-model="fieldStore.tempField.configurable"
              label="可在发送用例中配置"
              color="grey-7"
              dense
            />
            <q-tooltip>
              设置该字段是否可在发送用例中进行配置，不可配置的字段将使用默认值
            </q-tooltip>
          </div>

          <!-- 字段描述 -->
          <q-input
            v-model="fieldStore.tempField.description"
            type="textarea"
            label="字段描述"
            dense
            outlined
            class="input-bg w-full"
            placeholder="输入字段描述"
            rows="16"
            hide-bottom-space
          />

          <!-- 校验和字段设置 -->
          <q-card bordered flat class="bg-panel p-3">
            <div class="flex justify-between items-center mb-2">
              <div class="text-xs text-secondary-color">{{ UI_LABELS.CHECKSUM }}</div>
              <div>
                <q-toggle
                  v-model="fieldStore.tempField.validOption!.isChecksum"
                  dense
                  color="grey-7"
                  checked-icon="check"
                  unchecked-icon="clear"
                />
              </div>
            </div>

            <div
              v-if="fieldStore.tempField.validOption && fieldStore.tempField.validOption.isChecksum"
              class="space-y-3"
            >
              <q-select
                v-model="fieldStore.tempField.validOption.checksumMethod"
                :options="CHECKSUM_METHOD_OPTIONS"
                label="校验和计算方法"
                dense
                outlined
                class="input-bg w-full"
                map-options
                emit-value
                hide-bottom-space
              >
                <template v-slot:hint>
                  <span class="text-secondary-color text-xs op-75">
                    选择校验和计算方法（将在后续版本实现）
                  </span>
                </template>
              </q-select>

              <div class="flex space-x-4">
                <q-input
                  v-model="fieldStore.tempField.validOption.startFieldIndex"
                  type="number"
                  label="起始字段索引"
                  dense
                  outlined
                  class="input-bg w-40%"
                  min="0"
                  hide-bottom-space
                />
                <q-input
                  v-model="fieldStore.tempField.validOption.endFieldIndex"
                  type="number"
                  label="结束字段索引"
                  dense
                  outlined
                  class="input-bg w-40%"
                  min="0"
                  hide-bottom-space
                />
              </div>
            </div>
            <div v-else class="text-xs op-75 text-secondary-color mt-1">
              标记为校验字段时将自动计算校验值
            </div>
          </q-card>
        </div>
      </div>

      <!-- 右侧选项列表 -->
      <div class="w-2/5 pl-4">
        <q-card
          v-if="
            fieldStore.tempField.inputType &&
            ['select', 'radio'].includes(fieldStore.tempField.inputType)
          "
          bordered
          flat
          class="bg-panel w-full h-full flex flex-col"
        >
          <q-card-section class="p-3 flex-none">
            <div class="flex justify-between items-center mb-2">
              <div class="text-xs text-secondary-color">选项列表</div>
              <q-btn
                dense
                flat
                color="primary"
                icon="add"
                size="xs"
                @click="addOption"
                label="添加选项"
                class="text-xs op-75"
              />
            </div>
          </q-card-section>

          <q-card-section class="p-3 max-h-[60vh] flex-grow overflow-hidden">
            <div class="h-full w-full overflow-auto px-1">
              <div
                v-for="(option, index) in fieldStore.tempField.options"
                :key="index"
                class="flex gap-2 items-center mb-2"
              >
                <q-input
                  v-model="option.value"
                  dense
                  outlined
                  class="input-bg flex-1"
                  placeholder="值"
                  hide-bottom-space
                />
                <q-input
                  v-model="option.label"
                  dense
                  outlined
                  class="input-bg flex-1"
                  placeholder="标签"
                  hide-bottom-space
                />
                <q-checkbox
                  v-model="option.isDefault"
                  dense
                  color="grey-7"
                  @update:model-value="updateDefaultOption(index)"
                  class="mx-1"
                />
                <q-btn
                  flat
                  round
                  color="negative"
                  icon="delete"
                  size="xs"
                  dense
                  @click="removeOption(index)"
                />
              </div>
              <div
                v-if="!fieldStore.tempField.options || fieldStore.tempField.options.length === 0"
                class="text-center text-secondary-color text-xs op-75 py-4"
              >
                暂无选项
              </div>
            </div>
          </q-card-section>

          <q-card-section class="p-3 border-t border-gray-700">
            <div class="text-xs op-75 text-secondary-color">
              <div>设置字段可选值，值用于数据处理，标签用于显示</div>
              <div v-if="fieldStore.tempField.inputType === 'select'">
                下拉菜单需要至少 {{ INPUT_TYPE_CONFIG.select.minOptions }} 个选项
              </div>
              <div v-if="fieldStore.tempField.inputType === 'radio'">
                单选按钮需要至少 {{ INPUT_TYPE_CONFIG.radio.minOptions }} 个选项
              </div>
              <div>勾选框表示默认选项，只能有一个默认选项</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-card>
</template>

<script setup lang="ts">
import { useFrameFieldsStore } from '../../../stores/frames/frameFieldsStore';
import {
  FIELD_TYPE_OPTIONS,
  UI_LABELS,
  INPUT_TYPE_CONFIG,
  CHECKSUM_METHOD_OPTIONS,
  INPUT_TYPE_OPTIONS,
} from '../../../config/frameDefaults';
import { useNotification } from 'src/composables/frames/useNotification';

// 获取store和composable
const fieldStore = useFrameFieldsStore();
const { notifyError } = useNotification();

// 简化的选项操作方法，直接使用store中的方法
const addOption = () => {
  // 直接使用store的addEnumOption方法添加新选项
  fieldStore.addEnumOption({
    value: '',
    label: '',
    isDefault:
      fieldStore.tempField.options?.length === 0 ||
      !fieldStore.tempField.options?.some((opt) => opt.isDefault),
  });
};

// 精简后的移除选项方法
const removeOption = (index: number) => {
  if (!fieldStore.tempField.options) return;

  // 获取当前输入类型的配置并检查是否达到最小选项数限制
  const inputType = fieldStore.tempField.inputType;
  if (!inputType) return;

  const config = INPUT_TYPE_CONFIG[inputType as keyof typeof INPUT_TYPE_CONFIG];
  if (fieldStore.tempField.options.length <= config.minOptions) {
    notifyError(
      `${inputType === 'select' ? '下拉框' : '单选框'}至少需要 ${config.minOptions} 个选项`,
    );
    return;
  }

  // 检查是否删除的是默认选项
  const isRemovingDefault = fieldStore.tempField.options[index]?.isDefault;

  // 使用store方法删除选项
  fieldStore.removeEnumOption(index);

  // 如果删除的是默认选项，确保仍然有一个默认选项
  if (isRemovingDefault && fieldStore.tempField.options.length > 0) {
    fieldStore.tempField.options[0]!.isDefault = true;
  }
};

// 精简后的更新默认选项方法
const updateDefaultOption = (selectedIndex: number) => {
  if (!fieldStore.tempField.options || selectedIndex < 0) return;

  const currentOption = fieldStore.tempField.options[selectedIndex];
  if (!currentOption) return;

  // 如果取消了默认选项，确保有其他默认选项
  if (!currentOption.isDefault) {
    const hasAnyDefault = fieldStore.tempField.options.some(
      (opt, idx) => idx !== selectedIndex && opt.isDefault,
    );

    if (!hasAnyDefault) {
      // 如果没有其他默认值，强制将当前选项设为默认
      currentOption.isDefault = true;
      return;
    }
  } else {
    // 如果设置了默认选项，取消其他选项的默认状态
    fieldStore.tempField.options.forEach((opt, idx) => {
      if (idx !== selectedIndex) {
        opt.isDefault = false;
      }
    });
  }
};
</script>

<style scoped></style>
