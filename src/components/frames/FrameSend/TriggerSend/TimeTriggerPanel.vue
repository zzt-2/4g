<template>
  <div class="bg-industrial-panel rounded p-4 border border-industrial">
    <h6 class="text-industrial-primary text-lg font-medium mb-4">时间触发配置</h6>

    <!-- 执行时间设置 -->
    <div class="space-y-4">
      <div class="text-subtitle2 text-industrial-primary">执行时间</div>
      <div class="grid grid-cols-2 gap-3">
        <q-input
          v-model="executeDate"
          type="date"
          label="执行日期"
          outlined
          dense
          class="bg-industrial-panel text-industrial-primary"
          @update:model-value="updateExecuteTime"
        >
          <template #prepend>
            <q-icon name="event" class="text-industrial-accent" />
          </template>
        </q-input>
        <q-input
          v-model="executeTime"
          type="time"
          step="1"
          label="执行时间（包含秒）"
          outlined
          dense
          class="bg-industrial-panel text-industrial-primary"
          @update:model-value="updateExecuteTime"
        >
          <template #prepend>
            <q-icon name="access_time" class="text-industrial-accent" />
          </template>
        </q-input>
      </div>
    </div>

    <!-- 重复设置 -->
    <div class="space-y-2 mt-4">
      <q-checkbox
        v-model="triggerStore.isRecurring"
        label="重复执行"
        color="primary"
        class="text-industrial-primary"
      />

      <!-- 重复配置 -->
      <div v-if="triggerStore.isRecurring" class="space-y-3 ml-6">
        <div class="grid grid-cols-2 gap-3">
          <q-select
            v-model="triggerStore.recurringType"
            :options="[
              { label: '每秒', value: 'second' },
              { label: '每分钟', value: 'minute' },
              { label: '每小时', value: 'hour' },
              { label: '每日', value: 'daily' },
              { label: '每周', value: 'weekly' },
              { label: '每月', value: 'monthly' },
            ]"
            option-value="value"
            option-label="label"
            label="重复类型"
            emit-value
            map-options
            outlined
            dense
            class="bg-industrial-panel text-industrial-primary"
          />
          <q-input
            v-model.number="triggerStore.recurringInterval"
            type="number"
            label="重复间隔"
            :min="getMinInterval(triggerStore.recurringType)"
            step="1"
            outlined
            dense
            class="bg-industrial-panel text-industrial-primary"
          >
            <template #append>
              <span class="text-industrial-secondary text-xs">
                {{ getIntervalUnit(triggerStore.recurringType) }}
              </span>
            </template>
          </q-input>
        </div>

        <q-input
          v-model="endDate"
          type="date"
          label="结束日期（可选）"
          outlined
          dense
          clearable
          class="bg-industrial-panel text-industrial-primary"
          @update:model-value="updateEndTime"
        >
          <template #prepend>
            <q-icon name="event_busy" class="text-industrial-accent" />
          </template>
        </q-input>

        <!-- 高频执行警告 -->
        <div
          v-if="triggerStore.recurringType === 'second'"
          class="bg-orange-900 bg-opacity-20 border border-orange-700 rounded p-3 mt-2"
        >
          <div class="flex items-start">
            <q-icon name="warning" class="text-orange-400 mr-2 mt-0.5" size="sm" />
            <div class="text-xs text-orange-300">
              <div class="font-medium mb-1">高频执行警告</div>
              <div>
                当前配置为
                {{ triggerStore.recurringInterval || 1
                }}{{ getIntervalUnit(triggerStore.recurringType) }}
                执行一次。请确保串口设备能够处理如此频繁的数据发送，过于频繁的发送可能会影响设备性能或造成数据丢失。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 快捷设置按钮 -->
    <div class="flex gap-2 flex-wrap mt-4">
      <q-btn size="sm" color="grey-7" outline @click="setQuickTime('1h')" class="text-xs">
        1小时后
      </q-btn>
      <q-btn size="sm" color="grey-7" outline @click="setQuickTime('tomorrow')" class="text-xs">
        明天此时
      </q-btn>
      <q-btn size="sm" color="grey-7" outline @click="setQuickTime('next-week')" class="text-xs">
        下周此时
      </q-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useTriggerConfigStore } from '../../../../stores/triggerConfigStore';

// 使用 store
const triggerStore = useTriggerConfigStore();

// 将执行时间分解为日期和时间
const executeDate = ref('');
const executeTime = ref('');
const endDate = ref('');

// 初始化时间字段
watch(
  () => triggerStore.executeTime,
  (newTime) => {
    if (newTime) {
      const date = new Date(newTime);
      const isoString = date.toISOString();
      executeDate.value = isoString.split('T')[0] || '';
      // 包含秒数的时间格式
      executeTime.value = date.toTimeString().slice(0, 8) || '';
    } else {
      // 设置默认值为当前时间
      const now = new Date();
      const isoString = now.toISOString();
      executeDate.value = isoString.split('T')[0] || '';
      executeTime.value = now.toTimeString().slice(0, 8) || '';
    }
  },
  { immediate: true },
);

watch(
  () => triggerStore.endTime,
  (newTime) => {
    if (newTime) {
      const date = new Date(newTime);
      const isoString = date.toISOString();
      endDate.value = isoString.split('T')[0] || '';
    } else {
      endDate.value = '';
    }
  },
  { immediate: true },
);

/**
 * 更新执行时间
 */
function updateExecuteTime() {
  if (executeDate.value && executeTime.value) {
    const dateTime = new Date(`${executeDate.value}T${executeTime.value}`);
    triggerStore.executeTime = dateTime.toISOString();
  }
}

/**
 * 更新结束时间
 */
function updateEndTime() {
  if (endDate.value) {
    const dateTime = new Date(`${endDate.value}T23:59:59`);
    triggerStore.endTime = dateTime.toISOString();
  } else {
    triggerStore.endTime = '';
  }
}

/**
 * 获取间隔单位
 */
function getIntervalUnit(type: string | undefined): string {
  if (!type) return '';
  const units = {
    second: '秒',
    minute: '分钟',
    hour: '小时',
    daily: '天',
    weekly: '周',
    monthly: '月',
  };
  return units[type as keyof typeof units] || '';
}

/**
 * 获取重复间隔的最小值
 */
function getMinInterval(type: string | undefined): number {
  if (!type) return 1;
  const minIntervals = {
    second: 1,
    minute: 1,
    hour: 1,
    daily: 1,
    weekly: 1,
    monthly: 1,
  };
  return minIntervals[type as keyof typeof minIntervals] || 1;
}

/**
 * 设置快捷时间
 */
function setQuickTime(type: string) {
  const now = new Date();
  let targetTime: Date;

  switch (type) {
    case '1h':
      targetTime = new Date(now.getTime() + 60 * 60 * 1000);
      break;
    case 'tomorrow':
      targetTime = new Date(now);
      targetTime.setDate(now.getDate() + 1);
      break;
    case 'next-week':
      targetTime = new Date(now);
      targetTime.setDate(now.getDate() + 7);
      break;
    default:
      return;
  }

  executeDate.value = targetTime.toISOString().split('T')[0] || '';
  executeTime.value = targetTime.toTimeString().slice(0, 8) || '';
  updateExecuteTime();
}
</script>

<style scoped>
.space-y-4 > * + * {
  margin-top: 1rem;
}

.space-y-3 > * + * {
  margin-top: 0.75rem;
}

.space-y-2 > * + * {
  margin-top: 0.5rem;
}

.grid {
  display: grid;
}

.grid-cols-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.gap-3 {
  gap: 0.75rem;
}
</style>
