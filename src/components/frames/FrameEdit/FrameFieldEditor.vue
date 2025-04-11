<template>
  <div v-if="showEditor" class="flex-grow p-2 overflow-y-auto">
    <h3 class="text-[10px] font-medium text-[#93c5fd] uppercase mb-1">
      {{ isNewField ? '添加字段' : '编辑字段' }}
    </h3>

    <div class="space-y-2">
      <div>
        <label for="fieldName" class="block text-[9px] text-[#94a3b8]">字段名称</label>
        <input
          type="text"
          id="fieldName"
          v-model="currentField.name"
          placeholder="输入字段名称"
          class="w-full bg-[#0a1929] border border-[#1a3663] rounded py-0.5 px-2 text-[#e2e8f0] text-xs focus:outline-none focus:border-[#3b82f6] transition-colors"
        />
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label for="fieldType" class="block text-[9px] text-[#94a3b8]">数据类型</label>
          <select
            id="fieldType"
            v-model="currentField.type"
            class="w-full bg-[#0a1929] border border-[#1a3663] rounded py-0.5 px-2 text-[#e2e8f0] text-xs focus:outline-none focus:border-[#3b82f6] transition-colors"
          >
            <option v-for="option in FIELD_TYPE_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div v-if="currentField.type && ['bytes', 'string'].includes(currentField.type)">
          <label for="fieldLength" class="block text-[9px] text-[#94a3b8]">字节长度</label>
          <input
            type="number"
            id="fieldLength"
            v-model.number="currentField.length"
            min="1"
            placeholder="字段长度(字节)"
            class="w-full bg-[#0a1929] border border-[#1a3663] rounded py-0.5 px-2 text-[#e2e8f0] text-xs focus:outline-none focus:border-[#3b82f6] transition-colors"
          />
        </div>

        <div v-if="currentField.type === 'bit'">
          <label for="fieldBits" class="block text-[9px] text-[#94a3b8]">比特数</label>
          <input
            type="number"
            id="fieldBits"
            v-model.number="currentField.bits"
            min="1"
            max="32"
            placeholder="比特数量"
            class="w-full bg-[#0a1929] border border-[#1a3663] rounded py-0.5 px-2 text-[#e2e8f0] text-xs focus:outline-none focus:border-[#3b82f6] transition-colors"
          />
        </div>
      </div>

      <!-- 默认值和校验字段组合一行 -->
      <div class="grid grid-cols-2 gap-2">
        <div>
          <div class="flex items-center justify-between">
            <label for="fieldDefaultValue" class="text-[9px] text-[#94a3b8]">默认值</label>
            <label class="flex items-center text-[9px] text-[#94a3b8]">
              <input
                type="checkbox"
                v-model="currentField.hasDefaultValue"
                class="mr-0.5 h-3 w-3 accent-[#3b82f6]"
              />
              <span>启用</span>
            </label>
          </div>
          <input
            type="text"
            id="fieldDefaultValue"
            v-model="currentField.defaultValue"
            placeholder="默认值"
            :disabled="!currentField.hasDefaultValue"
            class="w-full bg-[#0a1929] border border-[#1a3663] rounded py-0.5 px-2 text-[#e2e8f0] text-xs focus:outline-none focus:border-[#3b82f6] transition-colors disabled:opacity-50"
          />
          <div class="text-[8px] text-[#64748b] mt-0.5">可使用十六进制(0x前缀)或十进制</div>
        </div>

        <div>
          <!-- 校验字段选项 -->
          <div class="flex items-center justify-between">
            <label class="text-[9px] text-[#94a3b8]">{{ UI_LABELS.CHECKSUM }}</label>
            <label class="relative inline-block w-7 h-3.5">
              <input
                type="checkbox"
                v-model="currentField.isChecksum"
                class="opacity-0 w-0 h-0 absolute"
              />
              <span
                class="absolute cursor-pointer inset-0 bg-[#334155] rounded-full transition-all duration-300 before:content-[''] before:absolute before:h-2.5 before:w-2.5 before:left-0.5 before:bottom-0.5 before:bg-white before:rounded-full before:transition-all before:duration-300"
                :class="{ 'bg-[#3b82f6] before:translate-x-3.5': currentField.isChecksum }"
              ></span>
            </label>
          </div>
          <div class="text-[8px] text-[#64748b] mt-3.5">标记为校验字段时将自动计算校验值</div>
        </div>
      </div>

      <!-- 字段描述 -->
      <div>
        <label for="fieldDescription" class="block text-[9px] text-[#94a3b8]">字段描述</label>
        <textarea
          id="fieldDescription"
          :value="currentField.description ?? ''"
          @input="(e) => (currentField.description = (e.target as HTMLTextAreaElement).value)"
          placeholder="输入字段描述"
          rows="1"
          class="w-full bg-[#0a1929] border border-[#1a3663] rounded py-0.5 px-2 text-[#e2e8f0] text-xs focus:outline-none focus:border-[#3b82f6] resize-none transition-colors"
        ></textarea>
      </div>

      <!-- 操作按钮 -->
      <div class="flex justify-end space-x-2 pt-1">
        <button
          class="px-2 py-0.5 bg-transparent border border-[#64748b] text-[#e2e8f0] rounded text-[10px] hover:bg-[#1e3a6a] transition-colors"
          @click="handleCancel"
        >
          取消
        </button>
        <button
          class="px-2 py-0.5 bg-[#3b82f6] text-white rounded text-[10px] hover:bg-[#2563eb] transition-colors"
          @click="handleSave"
        >
          保存
        </button>
      </div>
    </div>
  </div>

  <div
    v-else
    class="flex-grow h-full flex items-center justify-center text-[#64748b] text-xs bg-[#0a1929]"
  >
    从左侧列表中选择一个字段开始编辑
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useFrameFields } from '../../../composables/frames/useFrameFields';
import { useFrameFieldsStore } from '../../../stores/frames/frameFieldsStore';
import { FIELD_TYPE_OPTIONS, UI_LABELS } from '../../../config/frameDefaults';

// 获取store和composable
const fieldStore = useFrameFieldsStore();
const fieldsComposable = useFrameFields();

// 控制编辑器显示的逻辑 - 从store获取状态
const showEditor = computed(() => fieldStore.isEditingField);

// 判断是新增字段还是编辑现有字段
const isNewField = computed(() => fieldStore.editingFieldIndex === null);

// 当前编辑的字段数据
const currentField = computed(() => fieldStore.tempField);

// 处理保存 - 通过composable调用以获取通知功能
const handleSave = () => {
  fieldsComposable.saveField();
};

// 处理取消 - 通过composable调用
const handleCancel = () => {
  fieldsComposable.cancelEditField();
};
</script>
