<template>
  <div class="high-speed-storage-panel bg-industrial-panel border border-industrial rounded p-6">
    <div class="panel-header mb-6">
      <div class="flex items-center justify-between">
        <div class="status-info flex items-center gap-4">
          <span class="status-badge" :class="statusClass">{{ storageStatusText }}</span>
          <span class="text-industrial-secondary text-sm"
            >{{ formattedStats.totalFrames }} 帧已存储</span
          >
        </div>
        <q-toggle
          v-model="localConfig.enabled"
          :disable="isLoading"
          color="primary"
          label="启用高速存储"
          @update:model-value="handleConfigChange"
        />
      </div>
    </div>

    <div
      v-if="lastError"
      class="error-message bg-red-900/20 border border-red-500/30 rounded p-3 mb-6"
    >
      <div class="flex items-center justify-between">
        <div class="text-red-400 text-sm">{{ lastError }}</div>
        <q-btn flat dense icon="close" color="negative" @click="clearError">
          <q-tooltip>清除错误</q-tooltip>
        </q-btn>
      </div>
    </div>

    <div class="rule-config mb-6" v-if="localConfig.enabled">
      <!-- 连接目标选择 -->
      <div class="mb-4">
        <q-select
          v-model="selectedConnectionTargetId"
          :options="connectionOptions"
          option-value="value"
          option-label="label"
          label="选择连接目标"
          outlined
          dense
          :disable="isLoading"
          emit-value
          map-options
          class="text-industrial-primary"
          @update:model-value="handleConnectionChange"
        >
          <template #no-option>
            <q-item>
              <q-item-section class="text-grey"> 无可用连接，请先建立网络连接 </q-item-section>
            </q-item>
          </template>
        </q-select>
      </div>

      <!-- 帧头格式列表 -->
      <div class="mb-4">
        <div class="flex items-center justify-between mb-3">
          <label class="text-industrial-primary text-sm font-medium">帧头格式列表</label>
          <q-btn
            flat
            dense
            icon="add"
            color="primary"
            size="sm"
            :disable="isLoading"
            @click="addHeaderPattern"
          >
            <q-tooltip>添加帧头格式</q-tooltip>
          </q-btn>
        </div>

        <div class="space-y-2">
          <div
            v-for="(pattern, index) in headerPatterns"
            :key="index"
            class="flex items-center gap-2"
          >
            <q-input
              v-model="headerPatterns[index]"
              :label="`帧头格式 ${index + 1}`"
              outlined
              dense
              :disable="isLoading"
              placeholder="例如: AABBCC"
              class="flex-1 text-industrial-primary"
              :rules="[validateHexPattern]"
            >
              <template #hint> 输入十六进制字符串，如 AABBCC 表示帧头为 0xAA 0xBB 0xCC </template>
            </q-input>
            <q-btn
              flat
              dense
              round
              icon="delete"
              color="negative"
              size="sm"
              :disable="isLoading || headerPatterns.length <= 1"
              @click="removeHeaderPattern(index)"
            >
              <q-tooltip>删除此帧头格式</q-tooltip>
            </q-btn>
          </div>
        </div>

        <div v-if="headerPatterns.length === 0" class="text-center py-4 text-industrial-secondary">
          <q-icon name="info" size="24px" class="mb-2" />
          <div class="text-sm">请添加至少一个帧头格式</div>
        </div>
      </div>

      <div class="flex items-center justify-between">
        <div class="storage-settings flex items-center gap-6">
          <q-input
            v-model.number="localConfig.maxFileSize"
            label="最大文件大小 (MB)"
            type="number"
            outlined
            dense
            :disable="isLoading"
            :min="1"
            :max="1000"
            style="width: 180px"
            @update:model-value="handleConfigChange"
          />

          <q-input
            v-model.number="localConfig.rotationCount"
            label="保留文件数量"
            type="number"
            outlined
            dense
            :disable="isLoading"
            :min="1"
            :max="100"
            style="width: 150px"
            @update:model-value="handleConfigChange"
          />
        </div>

        <q-btn :loading="isLoading" :disable="!isRuleFormValid" color="primary" @click="saveRule">
          更新规则
        </q-btn>
      </div>
    </div>

    <div class="stats-section" v-if="localConfig.enabled">
      <div class="flex items-center justify-between mb-4">
        <h4 class="text-industrial-accent text-lg font-medium">存储统计</h4>
        <q-btn :loading="isLoading" color="warning" outline @click="resetStats"> 重置统计 </q-btn>
      </div>

      <div class="stats-grid grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div class="stat-item bg-industrial-secondary rounded p-3">
          <div class="text-industrial-secondary text-xs">总帧数</div>
          <div class="text-industrial-primary text-lg font-medium">
            {{ formattedStats.totalFrames }}
          </div>
        </div>

        <div class="stat-item bg-industrial-secondary rounded p-3">
          <div class="text-industrial-secondary text-xs">总字节数</div>
          <div class="text-industrial-primary text-lg font-medium">
            {{ formattedStats.totalBytes }}
          </div>
        </div>

        <div class="stat-item bg-industrial-secondary rounded p-3">
          <div class="text-industrial-secondary text-xs">当前文件大小</div>
          <div class="text-industrial-primary text-lg font-medium">
            {{ formattedStats.currentFileSize }}
          </div>
        </div>

        <div class="stat-item bg-industrial-secondary rounded p-3">
          <div class="text-industrial-secondary text-xs">存储时长</div>
          <div class="text-industrial-primary text-lg font-medium">
            {{ formattedStats.storageTime }}
          </div>
        </div>
      </div>

      <div class="current-file" v-if="stats.currentFilePath">
        <div class="text-industrial-secondary text-xs mb-1">当前存储文件</div>
        <div
          class="text-industrial-primary text-sm font-mono bg-industrial-secondary rounded px-3 py-2"
        >
          {{ stats.currentFilePath }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useHighSpeedStorageStore } from '../../stores/highSpeedStorageStore';
import { useConnectionTargets } from '../../composables/useConnectionTargets';
import { storeToRefs } from 'pinia';
import type { FrameHeaderRule } from '../../types/serial/highSpeedStorage';

// ==================== Store ====================

const store = useHighSpeedStorageStore();
const { config, stats, isLoading, lastError, hasRule, storageStatusText, formattedStats } =
  storeToRefs(store);

// ==================== 连接目标管理 ====================

const { availableTargets, selectedTargetId, refreshTargets } = useConnectionTargets(
  'high-speed-storage-target',
);

// ==================== 本地状态 ====================

const localConfig = ref({
  enabled: config.value.enabled,
  maxFileSize: config.value.maxFileSize,
  enableRotation: true, // 默认启用文件轮转
  rotationCount: config.value.rotationCount,
});

const ruleForm = ref<Omit<FrameHeaderRule, 'id'>>({
  connectionId: config.value.rule?.connectionId || '',
  headerPatterns: [...(config.value.rule?.headerPatterns || [''])],
  enabled: true, // 默认启用规则
});

const selectedConnectionTargetId = ref<string>(config.value.rule?.connectionId || '');

// 帧头格式列表
const headerPatterns = ref<string[]>([...(config.value.rule?.headerPatterns || [''])]);

// 统计更新定时器
let statsUpdateTimer: NodeJS.Timeout | null = null;

// ==================== 计算属性 ====================

const statusClass = computed(() => {
  if (!localConfig.value.enabled) return 'status-badge bg-gray-600';
  if (!hasRule.value) return 'status-badge bg-orange-600';
  if (stats.value.isStorageActive) return 'status-badge bg-green-600';
  return 'status-badge bg-blue-600';
});

const connectionOptions = computed(() => {
  return availableTargets.value
    .filter((target) => target.type === 'network') // 只显示网络连接
    .map((target) => ({
      label: `${target.name} (${target.address || target.path})`,
      value: target.id,
      description: target.description,
    }));
});

const isRuleFormValid = computed(() => {
  return (
    selectedConnectionTargetId.value.trim() !== '' &&
    headerPatterns.value.length > 0 &&
    headerPatterns.value.every(
      (pattern) => pattern.trim() !== '' && validateHexPattern(pattern) === true,
    )
  );
});

// ==================== 方法 ====================

/**
 * 验证十六进制模式
 */
function validateHexPattern(value: string): boolean | string {
  if (!value || value.trim().length === 0) {
    return '帧头模式不能为空';
  }

  const cleanHex = value.replace(/\s/g, '');

  if (cleanHex.length % 2 !== 0) {
    return '必须是完整的字节（偶数个十六进制字符）';
  }

  if (!/^[0-9A-Fa-f]*$/.test(cleanHex)) {
    return '只能包含十六进制字符（0-9, A-F）';
  }

  return true;
}

/**
 * 添加帧头格式
 */
function addHeaderPattern() {
  headerPatterns.value.push('');
}

/**
 * 删除帧头格式
 */
function removeHeaderPattern(index: number) {
  if (headerPatterns.value.length > 1) {
    headerPatterns.value.splice(index, 1);
  }
}

/**
 * 处理连接变更
 */
function handleConnectionChange(targetId: string) {
  selectedConnectionTargetId.value = targetId;
  ruleForm.value.connectionId = targetId;
}

/**
 * 处理配置变更
 */
async function handleConfigChange() {
  const newConfig = {
    ...config.value,
    ...localConfig.value,
    rule: config.value.rule
      ? {
          ...config.value.rule,
          headerPatterns: [...config.value.rule.headerPatterns],
        }
      : null,
  };

  await store.updateConfig(newConfig);
}

/**
 * 保存规则
 */
async function saveRule() {
  if (!isRuleFormValid.value) return;

  // 过滤掉空的帧头格式
  const validPatterns = headerPatterns.value.filter((pattern) => pattern.trim() !== '');

  // 确保使用选中的连接ID和默认启用
  const ruleData = {
    connectionId: selectedConnectionTargetId.value,
    headerPatterns: validPatterns,
    enabled: true, // 强制启用
  };

  let result;
  if (hasRule.value) {
    result = await store.updateRule(ruleData);
  } else {
    result = await store.setRule(ruleData);
  }

  if (result.success) {
    // 规则保存成功后，更新本地表单状态
    if (config.value.rule) {
      ruleForm.value = {
        connectionId: config.value.rule.connectionId,
        headerPatterns: [...config.value.rule.headerPatterns],
        enabled: true,
      };
      selectedConnectionTargetId.value = config.value.rule.connectionId;
      headerPatterns.value = [...config.value.rule.headerPatterns];
    }
  }
}

/**
 * 重置统计信息
 */
async function resetStats() {
  await store.resetStats();
}

/**
 * 清除错误
 */
function clearError() {
  store.clearError();
}

/**
 * 启动统计更新定时器
 */
function startStatsUpdate() {
  if (statsUpdateTimer) {
    clearInterval(statsUpdateTimer);
  }

  statsUpdateTimer = setInterval(async () => {
    if (localConfig.value.enabled) {
      await store.refreshStats();
    }
  }, 1000); // 每秒更新一次
}

/**
 * 停止统计更新定时器
 */
function stopStatsUpdate() {
  if (statsUpdateTimer) {
    clearInterval(statsUpdateTimer);
    statsUpdateTimer = null;
  }
}

// ==================== 监听器 ====================

// 监听配置变化，同步到本地状态
watch(
  config,
  (newConfig) => {
    localConfig.value = {
      enabled: newConfig.enabled,
      maxFileSize: newConfig.maxFileSize,
      enableRotation: true, // 强制启用
      rotationCount: newConfig.rotationCount,
    };

    if (newConfig.rule) {
      ruleForm.value = {
        connectionId: newConfig.rule.connectionId,
        headerPatterns: [...newConfig.rule.headerPatterns],
        enabled: true, // 强制启用
      };
      selectedConnectionTargetId.value = newConfig.rule.connectionId;
      headerPatterns.value = [...newConfig.rule.headerPatterns];
    }
  },
  { deep: true },
);

// 监听选中的连接目标变化
watch(selectedTargetId, (newTargetId) => {
  if (newTargetId && newTargetId !== selectedConnectionTargetId.value) {
    selectedConnectionTargetId.value = newTargetId;
    ruleForm.value.connectionId = newTargetId;
  }
});

// 监听存储启用状态，控制统计更新
watch(
  () => localConfig.value.enabled,
  (enabled) => {
    if (enabled) {
      startStatsUpdate();
    } else {
      stopStatsUpdate();
    }
  },
);

// ==================== 生命周期 ====================

onMounted(async () => {
  await store.initialize();
  await refreshTargets();

  // 如果没有选中连接但有可用连接，选择第一个网络连接
  if (!selectedConnectionTargetId.value && connectionOptions.value.length > 0) {
    selectedConnectionTargetId.value = connectionOptions.value[0]?.value || '';
    ruleForm.value.connectionId = selectedConnectionTargetId.value;
  }

  // 如果存储已启用，开始统计更新
  if (localConfig.value.enabled) {
    startStatsUpdate();
  }
});

onUnmounted(() => {
  stopStatsUpdate();
});
</script>

<style scoped>
.status-badge {
  @apply px-3 py-1 rounded text-sm font-medium text-white;
}

.error-message {
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.stat-item {
  transition: all 0.2s ease-in-out;
}

.stat-item:hover {
  background-color: #1e3a6a;
}
</style>
