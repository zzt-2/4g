<script setup lang="ts">
import { useConnectionTargetsStore } from '../../../stores/connectionTargetsStore';

// 组件属性
defineProps<{
  disabled?: boolean;
  placeholder?: string;
}>();

// 双向绑定
const modelValue = defineModel<string>({ required: true });

// 使用连接目标管理
const connectionTargetsStore = useConnectionTargetsStore();

// 页面加载时刷新可用目标
// refreshTargets();
</script>

<template>
  <q-select v-model="modelValue" :options="connectionTargetsStore.availableTargets" option-value="id"
    option-label="name" dense outlined emit-value map-options dark bg-color="rgba(18, 35, 63, 0.7)"
    style="width: 150px;" :disable="disabled" :placeholder="placeholder || '选择发送目标'" input-class="py-0.5 px-2 text-xs"
    hide-bottom-space>

    <template #option="scope">
      <q-item v-bind="scope.itemProps">
        <q-item-section>
          <q-item-label class="text-xs text-industrial-primary">
            {{ scope.opt.name }}
          </q-item-label>
          <q-item-label caption class="text-2xs">
            <span :class="scope.opt.status === 'connected' ? 'text-positive' : 'text-negative'">
              {{ scope.opt.status === 'connected' ? '已连接' : '未连接' }}
            </span>
            <span v-if="scope.opt.description" class="ml-2 text-industrial-tertiary">
              {{ scope.opt.description }}
            </span>
          </q-item-label>
        </q-item-section>

        <q-item-section side>
          <q-icon :name="scope.opt.type === 'serial'
            ? 'usb'
            : scope.opt.type === 'network'
              ? 'lan'
              : 'device_hub'
            " size="xs" class="text-industrial-accent" />
        </q-item-section>
      </q-item>
    </template>

    <template #selected-item="scope">
      <div class="flex items-center gap-2 min-w-0">
        <q-icon :name="scope.opt.type === 'serial'
          ? 'usb'
          : scope.opt.type === 'network'
            ? 'lan'
            : 'device_hub'
          " size="xs" class="flex-shrink-0 text-industrial-accent" />
        <span class="text-xs truncate flex-1 min-w-0"
          :class="scope.opt.status === 'connected' ? 'text-positive' : 'text-negative'">{{
            scope.opt.name
          }}</span>
      </div>
    </template>

    <template #no-option>
      <q-item>
        <q-item-section class="text-center">
          <q-item-label class="text-xs text-industrial-secondary">
            <q-icon name="info" size="sm" class="mr-2" />
            没有可用的发送目标
          </q-item-label>
          <q-item-label caption class="text-2xs text-industrial-tertiary">
            请确保至少有一个串口或网络连接可用
          </q-item-label>
        </q-item-section>
      </q-item>
    </template>
  </q-select>
</template>

<style scoped>
.text-2xs {
  font-size: 0.65rem;
}

/* 修改Quasar的样式，消除底部空间 */
:deep(.q-field--with-bottom.q-field--hide-bottom-space .q-field__bottom) {
  min-height: 0 !important;
  padding: 0 !important;
}
</style>
