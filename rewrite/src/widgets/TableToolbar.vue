<script setup lang="ts">
interface TableToolbarProps {
  searchPlaceholder?: string;
  searchModelValue?: string;
}

withDefaults(defineProps<TableToolbarProps>(), {
  searchPlaceholder: '搜索...',
  searchModelValue: '',
});

const emit = defineEmits<{
  'update:searchModelValue': [value: string];
}>();
</script>

<template>
  <div class="flex items-center gap-3">
    <q-input
      :model-value="searchModelValue"
      outlined
      dense
      :placeholder="searchPlaceholder"
      class="w-60"
      @update:model-value="emit('update:searchModelValue', $event)"
    >
      <template #prepend>
        <q-icon name="o_search" size="xs" />
      </template>
      <template v-if="searchModelValue" #append>
        <q-icon name="o_close" class="cursor-pointer" size="xs" @click="emit('update:searchModelValue', '')" />
      </template>
    </q-input>

    <slot name="filters" />

    <div class="flex-1" />

    <slot name="actions" />
  </div>
</template>
