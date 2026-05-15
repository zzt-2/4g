<script setup lang="ts">
interface AppNavigationItem {
  readonly label: string;
  readonly to: string;
  readonly icon: string;
  readonly caption?: string;
  readonly disabled?: boolean;
}

const props = defineProps<{
  readonly activePath: string;
  readonly items: readonly AppNavigationItem[];
}>();

const emit = defineEmits<{
  navigate: [to: string];
}>();

function isActive(item: AppNavigationItem): boolean {
  return props.activePath === item.to;
}

function navigate(item: AppNavigationItem): void {
  if (!item.disabled) {
    emit('navigate', item.to);
  }
}
</script>

<template>
  <q-list padding class="app-navigation">
    <q-item
      v-for="item in items"
      :key="item.to"
      clickable
      :active="isActive(item)"
      :disable="item.disabled"
      active-class="app-navigation__item--active"
      class="app-navigation__item my-0.5 mx-2"
      @click="navigate(item)"
    >
      <q-item-section avatar>
        <q-icon :name="item.icon" />
      </q-item-section>
      <q-item-section>
        <q-item-label>{{ item.label }}</q-item-label>
        <q-item-label v-if="item.caption" caption>{{ item.caption }}</q-item-label>
      </q-item-section>
    </q-item>
  </q-list>
</template>

<style scoped>
.app-navigation {
  color: var(--rw-color-text-default);
}

.app-navigation__item {
  border-radius: var(--rw-radius-control);
}

.app-navigation__item--active {
  background: var(--rw-color-surface-selected);
  color: var(--rw-color-action-primary);
}
</style>
