<script setup lang="ts">
interface AvailableGroup {
  id: number;
  label: string;
  itemCount: number;
}

// Props
defineProps<{
  selectedGroupId: number | null;
  availableGroups: AvailableGroup[];
}>();

// Emits
const emit = defineEmits<{
  'update:selected-group-id': [groupId: number | null];
}>();

// 方法：选择分组
const handleGroupSelect = (groupId: number | null): void => {
  emit('update:selected-group-id', groupId);
};
</script>

<template>
  <div class="flex items-center">
    <!-- 分组选择器 -->
    <q-select
      :model-value="selectedGroupId"
      :options="[
        { label: '请选择分组...', value: null },
        ...availableGroups.map((group) => ({
          label: `${group.label} (${group.itemCount}项)`,
          value: group.id,
        })),
      ]"
      emit-value
      map-options
      dense
      outlined
      class="min-w-[160px] bg-industrial-secondary border-industrial"
      popup-content-class="bg-industrial-panel"
      @update:model-value="handleGroupSelect"
    >
      <template #selected>
        <span v-if="selectedGroupId" class="text-sm text-industrial-primary">
          {{ availableGroups.find((g) => g.id === selectedGroupId)?.label || '未知分组' }}
          ({{ availableGroups.find((g) => g.id === selectedGroupId)?.itemCount || 0 }}项)
        </span>
        <span v-else class="text-sm text-industrial-secondary"> 请选择分组... </span>
      </template>

      <template #option="{ itemProps, opt }">
        <q-item v-bind="itemProps" class="text-industrial-primary">
          <q-item-section>
            <q-item-label class="text-sm">
              {{ opt.label }}
            </q-item-label>
          </q-item-section>
        </q-item>
      </template>
    </q-select>
  </div>
</template>

<style scoped>
/* 删除所有自定义CSS样式，使用预定义的工业主题CSS类 */
</style>
