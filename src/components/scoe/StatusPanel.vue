<template>
  <div class="bg-industrial-panel border-l border-industrial h-full flex flex-col">
    <!-- 标题 -->
    <div class="bg-industrial-secondary border-b border-industrial p-3">
      <h3 class="text-industrial-primary text-sm font-medium flex items-center">
        <q-icon name="analytics" class="mr-2" />
        数据统计
      </h3>
    </div>

    <!-- 状态信息 -->
    <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
      <!-- 统一的状态卡片渲染 -->
      <div v-for="item in statusItems" :key="item.key"
        class="bg-industrial-secondary border border-industrial rounded p-3">
        <div class="flex items-center justify-between mb-2">
          <span class="text-industrial-secondary text-xs">{{ item.label }}</span>
          <q-icon :name="item.icon" :class="item.iconColor" size="16px" />
        </div>
        <div :class="item.valueClass">
          {{ item.getValue(status) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useScoeStore } from '../../stores/scoeStore'
import type { ScoeStatus } from '../../types/scoe'

const scoeStore = useScoeStore()
const { status } = storeToRefs(scoeStore)

interface StatusItem {
  key: string
  label: string
  icon: string
  iconColor: string
  getValue: (s: ScoeStatus) => string
  valueClass?: string
}

// 状态映射配置
const statusMaps = {
  health: {
    healthy: { icon: 'check_circle', color: 'text-green-400', text: '正常' },
    unknown: { icon: 'help', color: 'text-industrial-tertiary', text: '未自检' },
    error: { icon: 'error', color: 'text-red-400', text: '错误' }
  },
  linkTest: {
    pass: { icon: 'check_circle', color: 'text-green-400', text: '通过' },
    fail: { icon: 'cancel', color: 'text-red-400', text: '失败' },
    unknown: { icon: 'help', color: 'text-industrial-tertiary', text: '未自检' }
  }
}

// 格式化运行时间
const formatRuntime = (seconds: number = 0): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

// 统一的状态项配置
const statusItems: StatusItem[] = [
  {
    key: 'runtime',
    label: '软件启动累计秒',
    icon: 'schedule',
    iconColor: 'text-industrial-accent',
    getValue: (s: ScoeStatus) => formatRuntime(s.runtimeSeconds)
  },
  {
    key: 'satelliteIdRuntime',
    label: '当前卫星ID加载累计秒',
    icon: 'schedule',
    iconColor: 'text-industrial-accent',
    getValue: (s: ScoeStatus) => formatRuntime(s.satelliteIdRuntimeSeconds)
  },
  {
    key: 'commandReceiveCount',
    label: '指令接收总计数',
    icon: 'input',
    iconColor: 'text-blue-400',
    getValue: (s: ScoeStatus) => s.commandReceiveCount.toLocaleString()
  },
  {
    key: 'commandSuccessCount',
    label: '指令执行成功总计数',
    icon: 'check_circle',
    iconColor: 'text-green-400',
    getValue: (s: ScoeStatus) => s.commandSuccessCount.toLocaleString()
  },
  {
    key: 'commandErrorCount',
    label: '指令执行出错计数',
    icon: 'error',
    iconColor: 'text-red-400',
    getValue: (s: ScoeStatus) => s.commandErrorCount.toLocaleString()
  },
  {
    key: 'lastCommandCode',
    label: '最近一条指令功能码',
    icon: 'code',
    iconColor: 'text-industrial-accent',
    getValue: (s: ScoeStatus) => s.lastCommandCode ? `0x${s.lastCommandCode}` : '无'
  },
  {
    key: 'lastErrorReason',
    label: '指令执行出错原因',
    icon: 'warning',
    iconColor: 'text-yellow-400',
    getValue: (s: ScoeStatus) => s.lastErrorReason || '无错误'
  },
  {
    key: 'loadedSatelliteId',
    label: '已加载配置的卫星ID',
    icon: 'satellite',
    iconColor: 'text-industrial-accent',
    getValue: (s: ScoeStatus) => s.loadedSatelliteId || '暂无'
  },
  {
    key: 'healthStatus',
    label: '健康状态',
    icon: '',
    iconColor: '',
    getValue: (s: ScoeStatus) => statusMaps.health[s.healthStatus]?.text || '未知'
  },
  {
    key: 'linkTestResult',
    label: '链路自检结果',
    icon: '',
    iconColor: '',
    getValue: (s: ScoeStatus) => statusMaps.linkTest[s.linkTestResult]?.text || '未知'
  }
].map((item: StatusItem) => {
  // 为状态类型的项动态生成 icon 和 iconColor
  if (item.key === 'healthStatus') {
    return {
      ...item,
      get icon() { return statusMaps.health[status.value.healthStatus]?.icon || 'help' },
      get iconColor() { return statusMaps.health[status.value.healthStatus]?.color || 'text-industrial-tertiary' },
      get valueClass() {
        const color = statusMaps.health[status.value.healthStatus]?.color || 'text-industrial-tertiary'
        return `text-sm font-medium ${color}`
      }
    }
  }
  if (item.key === 'linkTestResult') {
    return {
      ...item,
      get icon() { return statusMaps.linkTest[status.value.linkTestResult]?.icon || 'help' },
      get iconColor() { return statusMaps.linkTest[status.value.linkTestResult]?.color || 'text-industrial-tertiary' },
      get valueClass() {
        const color = statusMaps.linkTest[status.value.linkTestResult]?.color || 'text-industrial-tertiary'
        return `text-sm font-medium ${color}`
      }
    }
  }
  if (!item.valueClass) {
    item.valueClass = 'text-industrial-primary text-sm break-all'
  }
  return item
})
</script>
