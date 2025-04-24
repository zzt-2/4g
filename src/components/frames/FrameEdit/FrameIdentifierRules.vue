<template>
  <div class="identifier-rules-editor w-full">
    <div class="text-subtitle1 mb-2 text-primary-color font-medium">通过位值规则识别接收帧</div>
    <p class="text-caption text-accent-color mb-4">
      设置帧识别规则，用于在接收数据时自动识别匹配的帧类型。至少需要一条规则才能成功识别帧。
    </p>

    <!-- 规则列表 -->
    <div class="rules-container grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="(rule, index) in tempRules" :key="index" class="rule-item">
        <div class="flex justify-between items-center mb-2">
          <div class="rule-number">规则 #{{ index + 1 }}</div>
          <q-btn
            flat
            round
            dense
            icon="delete"
            color="negative"
            size="sm"
            @click="removeRule(index)"
          />
        </div>

        <div class="rule-content bg-darker p-3 rounded-md">
          <div class="grid grid-cols-2 gap-3">
            <!-- 起始位 -->
            <q-input
              v-model="rule.startBit"
              type="number"
              min="0"
              max="1024"
              label="起始位"
              dense
              outlined
              dark
            />

            <!-- 结束位 -->
            <q-input
              v-model="rule.endBit"
              type="number"
              min="0"
              max="1024"
              label="结束位"
              dense
              outlined
              dark
            />

            <!-- 操作符 -->
            <q-select
              v-model="rule.operator"
              :options="[
                { label: '等于', value: 'eq' },
                { label: '不等于', value: 'neq' },
                { label: '大于', value: 'gt' },
                { label: '小于', value: 'lt' },
                { label: '大于等于', value: 'gte' },
                { label: '小于等于', value: 'lte' },
                { label: '包含', value: 'contains' },
                { label: '不包含', value: 'not_contains' },
              ]"
              label="操作符"
              dense
              outlined
              dark
              emit-value
              map-options
            />

            <!-- 预期值 -->
            <q-input
              v-model="rule.value"
              label="预期值"
              dense
              outlined
              dark
              :hint="rule.format === 'hex' ? '十六进制格式' : '十进制格式'"
            />

            <!-- 数据格式 -->
            <q-select
              v-model="rule.format"
              :options="[
                { label: '十六进制', value: 'hex' },
                { label: '十进制', value: 'decimal' },
                { label: 'ASCII文本', value: 'ascii' },
              ]"
              label="数据格式"
              dense
              outlined
              dark
              emit-value
              map-options
            />

            <!-- 逻辑操作符 -->
            <q-select
              v-if="index < tempRules.length - 1"
              v-model="rule.logicOperator"
              :options="[
                { label: '与 (AND)', value: 'and' },
                { label: '或 (OR)', value: 'or' },
              ]"
              label="逻辑操作符"
              dense
              outlined
              dark
              emit-value
              map-options
            />
          </div>
        </div>
      </div>

      <!-- 添加规则按钮作为grid的一个项 -->
      <div class="rule-item add-rule-container flex items-center justify-center">
        <q-btn color="primary" label="添加规则" icon="add" @click="addRule" class="add-rule-btn" />
      </div>

      <!-- 没有规则时的提示 -->
      <div v-if="!tempRules.length" class="no-rules text-center py-6 col-span-full">
        <div class="text-h6 text-secondary-color mb-2">未设置规则</div>
        <p class="text-body2 text-secondary-color mb-4">
          添加至少一条规则来定义如何识别接收到的帧数据。
        </p>
      </div>
    </div>

    <!-- 规则说明 -->
    <q-card class="mt-4 bg-darker">
      <q-card-section>
        <div class="text-subtitle2 text-primary-color">规则说明</div>
        <div class="text-caption text-secondary-color">
          <ul>
            <li>起始位和结束位是字节中的位索引，从0开始</li>
            <li>可以定义多条规则，通过逻辑操作符组合</li>
            <li>预期值应与数据格式一致（例如：十六进制应使用0x前缀）</li>
          </ul>
        </div>
      </q-card-section>
    </q-card>

    <!-- 操作按钮 -->
    <div class="flex justify-end items-center gap-2 mt-4">
      <q-btn label="取消" color="primary" flat @click="cancelEdit" />
      <q-btn label="保存规则" color="primary" @click="saveRules" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useFrameEditorStore } from '../../../stores/frames/frameEditorStore';
import { ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import type { IdentifierRule } from '../../../types/frames';
import { DEFAULT_IDENTIFIER_RULES } from 'src/config/frameDefaults';

// 使用store
const frameEditorStore = useFrameEditorStore();
const $q = useQuasar();

// 定义触发事件
const emit = defineEmits<{
  save: [];
  cancel: [];
}>();

// 临时规则存储
const tempRules = ref<IdentifierRule[]>([]);

// 初始化时复制规则到临时存储
onMounted(() => {
  // 从store深拷贝规则到临时变量
  tempRules.value = frameEditorStore.editorFrame.identifierRules
    ? JSON.parse(JSON.stringify(frameEditorStore.editorFrame.identifierRules))
    : [];
});

// 添加新规则
const addRule = () => {
  tempRules.value.push(DEFAULT_IDENTIFIER_RULES);
};

// 删除规则
const removeRule = (index: number) => {
  tempRules.value.splice(index, 1);
};

// 保存规则
const saveRules = () => {
  // 简单验证
  if (!tempRules.value.length) {
    // 可以在这里添加提示，如果需要至少一条规则
    $q.notify({
      message: '至少需要一条规则',
      color: 'negative',
    });
    return;
  }

  // 将临时规则保存到store
  frameEditorStore.editorFrame.identifierRules = JSON.parse(JSON.stringify(tempRules.value));

  // 触发保存事件
  emit('save');
};

// 取消编辑
const cancelEdit = () => {
  // 不保存临时规则，直接触发取消事件
  emit('cancel');
};
</script>

<style scoped>
.identifier-rules-editor {
  max-width: 1200px;
  margin: 0 auto;
}

.rule-item {
  border-left: 3px solid var(--q-primary);
  padding-left: 12px;
  min-height: 200px;
  display: flex;
  flex-direction: column;
}

.add-rule-container {
  border: 2px dashed rgba(var(--q-primary-rgb), 0.3);
  border-radius: 8px;
  background-color: rgba(var(--q-primary-rgb), 0.05);
  transition: all 0.2s;
}

.add-rule-container:hover {
  background-color: rgba(var(--q-primary-rgb), 0.1);
}

.rule-number {
  font-weight: 500;
  color: var(--q-primary);
}

.rule-content {
  border: 1px solid rgba(255, 255, 255, 0.1);
  flex-grow: 1;
}
</style>
