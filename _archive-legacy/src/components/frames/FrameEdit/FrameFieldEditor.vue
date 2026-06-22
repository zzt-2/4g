<template>
  <q-card class="w-full h-full bg-card border-primary p-4">
    <div class="flex h-full w-full">
      <!-- 左侧基础信息和设置 -->
      <div class="w-500px h-full pr-4 overflow-auto">
        <div class="flex flex-col space-y-4">
          <!-- 字段名称 -->
          <q-input v-model="fieldStore.tempField.name" label="字段名称" dense outlined class="input-bg w-full"
            placeholder="输入字段名称" hide-bottom-space />

          <!-- 数据类型、比特数/长度、输入类型、默认值放在一起 -->
          <div class="flex space-x-4 h-[92px]">
            <!-- 第一列：数据类型和比特数/长度 -->
            <div class="flex flex-col space-y-4 w-45%">
              <!-- 数据类型 -->
              <q-select v-model="fieldStore.tempField.dataType" :options="FIELD_TYPE_OPTIONS" label="数据类型" dense
                outlined class="input-bg" map-options emit-value hide-bottom-space
                @update:model-value="fieldStore.updateTempField('dataType')" />

              <!-- 长度 -->
              <div v-if="
                fieldStore.tempField.dataType &&
                ['bytes', 'string'].includes(fieldStore.tempField.dataType)" class="flex gap-8">
                <q-input v-model.number="fieldStore.tempField.length" label="字节长度" dense outlined
                  class="input-bg flex-1" min="1" placeholder="字段长度(字节)" hide-bottom-space />
                <q-checkbox v-model="fieldStore.tempField.isASCII" label="ASCII" color="grey-7"
                  class="text-secondary-color flex-1" dense />
              </div>
              <q-input v-else v-model="fieldStore.tempField.factor" label="倍率" dense outlined class="input-bg"
                placeholder="倍率" hide-bottom-space />
            </div>

            <q-space></q-space>

            <!-- 第二列：输入类型和默认值 -->
            <div class="flex flex-col space-y-4 w-45%">
              <!-- 输入类型 -->
              <q-select v-model="fieldStore.tempField.inputType" label="输入类型" :options="INPUT_TYPE_OPTIONS" dense
                outlined class="input-bg" map-options emit-value @update:model-value="handleInputTypeChange"
                hide-bottom-space>
                <template v-slot:hint>
                  <span class="text-secondary-color text-xs op-75">输入控件类型</span>
                </template>
              </q-select>

              <!-- 默认值 -->
              <q-input v-if="fieldStore.tempField.inputType === 'input'" v-model="fieldStore.tempField.defaultValue"
                label="默认值" dense outlined class="input-bg" placeholder="默认值" hide-bottom-space>
                <q-tooltip> 可使用十六进制(0x前缀)或十进制 </q-tooltip>
              </q-input>
            </div>
          </div>

          <!-- 数据参与类型选择器 -->
          <div class="flex flex-col space-y-2">
            <q-select v-model="fieldStore.tempField.dataParticipationType" :options="DATA_PARTICIPATION_TYPE_OPTIONS"
              option-value="value" option-label="label" emit-value map-options label="数据参与类型" dense outlined
              class="input-bg w-full" @update:model-value="handleDataParticipationTypeChange" hide-bottom-space>
              <template v-slot:option="scope">
                <q-item v-bind="scope.itemProps">
                  <q-item-section>
                    <q-item-label>{{ scope.opt.label }}</q-item-label>
                    <q-item-label caption>{{ scope.opt.description }}</q-item-label>
                  </q-item-section>
                </q-item>
              </template>
            </q-select>
          </div>

          <div class="flex justify-between items-center">
            <!-- 可配置选项 -->
            <q-checkbox v-model="fieldStore.tempField.configurable" label="可在发送用例中配置" color="grey-7"
              class="text-secondary-color" dense />
            <q-option-group v-model="fieldStore.tempField.bigEndian" :options="BIG_ENDIAN_OPTIONS" option-value="value"
              option-label="label" emit-value map-options label="大端序" dense outlined class="input-bg flex" type="radio"
              hide-bottom-space />
          </div>

          <!-- 字段描述 -->
          <q-input v-model="fieldStore.tempField.description" type="textarea" label="字段描述" dense outlined
            class="input-bg w-full" placeholder="输入字段描述" rows="16" hide-bottom-space />

          <!-- 校验和字段设置 -->
          <q-card bordered flat class="bg-panel p-3">
            <div class="flex justify-between items-center mb-2">
              <div class="text-xs text-secondary-color">{{ UI_LABELS.CHECKSUM }}</div>
              <div>
                <q-toggle v-model="fieldStore.tempField.validOption!.isChecksum" dense color="grey-7"
                  checked-icon="check" unchecked-icon="clear" />
              </div>
            </div>

            <div v-if="fieldStore.tempField.validOption && fieldStore.tempField.validOption.isChecksum"
              class="space-y-3">
              <q-select v-model="fieldStore.tempField.validOption.checksumMethod" :options="CHECKSUM_METHOD_OPTIONS"
                label="校验和计算方法" dense outlined class="input-bg w-full" map-options emit-value hide-bottom-space>
                <template v-slot:hint>
                  <span class="text-secondary-color text-xs op-75">
                    选择校验和计算方法（将在后续版本实现）
                  </span>
                </template>
              </q-select>

              <div class="flex space-x-4">
                <q-input v-model="fieldStore.tempField.validOption.startFieldIndex" type="number" label="起始字段索引" dense
                  outlined class="input-bg w-40%" min="0" hide-bottom-space />
                <q-input v-model="fieldStore.tempField.validOption.endFieldIndex" type="number" label="结束字段索引" dense
                  outlined class="input-bg w-40%" min="0" hide-bottom-space />
              </div>
            </div>
            <div v-else class="text-xs op-75 text-secondary-color mt-1">
              标记为校验字段时将自动计算校验值
            </div>
          </q-card>
        </div>
      </div>

      <!-- 右侧配置面板 -->
      <div class="flex-1 h-full">
        <!-- 右侧面板根据inputType动态显示 -->
        <div v-if="showInputConfigPanel" class="h-full">
          <FieldInputConfigPanel :field="fieldStore.tempField as FrameField" @update:field="updateTempField" />
        </div>
        <div v-else class="flex items-center justify-center h-full text-center text-industrial-secondary">
          <div>
            <q-icon name="info" size="2rem" class="opacity-50 mb-2" />
            <div class="text-sm">该输入类型无需额外配置</div>
          </div>
        </div>
      </div>
    </div>
  </q-card>
</template>

<script setup lang="ts">
import { useFrameFieldsStore } from '../../../stores/frames/frameFieldsStore';
import {
  FIELD_TYPE_OPTIONS,
  UI_LABELS,
  INPUT_TYPE_OPTIONS,
  CHECKSUM_METHOD_OPTIONS,
  DATA_PARTICIPATION_TYPE_OPTIONS,
  BIG_ENDIAN_OPTIONS,
} from '../../../config/frameDefaults';
import FieldInputConfigPanel from './FieldInputConfigPanel.vue';
import type {
  FrameField,
  FieldInputType,
  DataParticipationType,
} from '../../../types/frames/fields';
import { computed } from 'vue';

// 获取store和composable
const fieldStore = useFrameFieldsStore();

// 右侧面板内容决定逻辑 - 显示表达式或选项配置
const showInputConfigPanel = computed(() => {
  const inputType = fieldStore.tempField.inputType;
  return inputType === 'expression' || ['select', 'radio'].includes(inputType || '');
});

// 处理输入类型变化
function handleInputTypeChange(newType: FieldInputType) {
  fieldStore.tempField.inputType = newType;
  fieldStore.updateTempField('inputType');

  // 当输入类型变为表达式时，自动设置为间接数据参与类型
  // if (newType === 'expression') {
  //   fieldStore.tempField.dataParticipationType = 'indirect';
  // }
}

// 处理数据参与类型变化
function handleDataParticipationTypeChange(newType: DataParticipationType) {
  fieldStore.tempField.dataParticipationType = newType;
}

// 更新临时字段
function updateTempField(updatedField: FrameField) {
  Object.assign(fieldStore.tempField, updatedField);
}
</script>

<style scoped></style>
