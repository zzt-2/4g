# RS485上位机应用代码重构策略

根据.cursorrules中的规范，对代码进行重构，解决文件过长的问题。

## 重构原则

1. **单一职责原则**：每个文件只处理一项功能或关注点
2. **模块化**：将大型功能拆分为多个小模块
3. **组合式设计**：使用Vue 3的Composition API和可组合函数(composables)提取复杂逻辑
4. **按功能组织**：相关功能放在同一目录下，便于维护

## 具体重构策略

### 1. 组件拆分

对于大型Vue组件文件(如超过300行的组件)，应该按以下方式拆分：

- 将UI部分拆分为多个子组件
- 将复杂的业务逻辑抽取到composables
- 将类型定义移至types目录下的相应文件

例如，一个大型的数据监视器组件可以拆分为：

```
components/serial/monitor/
├── Monitor.vue              # 主组件，只包含基本结构和组合逻辑
├── MonitorHeader.vue        # 监视器头部组件
├── DataDisplay.vue          # 数据显示组件
├── FilterPanel.vue          # 过滤器面板组件
└── StatusPanel.vue          # 状态面板组件
```

### 2. 复杂逻辑抽取为Composables

对于业务逻辑复杂的组件，应该将逻辑抽取到composables目录下：

```
composables/serial/
├── useSerialPort.ts         # 串口连接逻辑
├── useDataMonitor.ts        # 数据监控逻辑
├── useDataParser.ts         # 数据解析逻辑
└── useDataFilter.ts         # 数据过滤逻辑
```

### 3. 状态管理拆分

拆分大型的store文件，每个文件处理一类状态：

```
stores/
├── serial/
│   ├── connection.ts        # 串口连接状态
│   ├── data.ts              # 收发数据状态
│   └── index.ts             # 导出所有串口相关store
├── frames/
│   ├── templates.ts         # 帧模板状态
│   ├── editor.ts            # 帧编辑器状态
│   └── index.ts             # 导出所有帧相关store
└── index.ts                 # 主store导出文件
```

### 4. 类型定义文件拆分

拆分大型的类型定义文件：

```
types/
├── serial/
│   ├── connection.ts        # 串口连接相关类型
│   ├── data.ts              # 数据相关类型
│   └── index.ts             # 导出所有串口相关类型
├── frames/
│   ├── template.ts          # 帧模板相关类型
│   ├── editor.ts            # 帧编辑器相关类型
│   └── index.ts             # 导出所有帧相关类型
└── common.ts                # 通用类型
```

## 代码示例

### 组件拆分示例

**重构前** (一个大型Monitor.vue):
```vue
<template>
  <div class="monitor">
    <!-- 监视器头部 -->
    <div class="monitor-header">
      <!-- 大量的头部UI代码 -->
    </div>
    
    <!-- 数据显示 -->
    <div class="data-display">
      <!-- 大量的数据显示UI代码 -->
    </div>
    
    <!-- 过滤器面板 -->
    <div class="filter-panel">
      <!-- 大量的过滤器UI代码 -->
    </div>
    
    <!-- 状态面板 -->
    <div class="status-panel">
      <!-- 大量的状态信息UI代码 -->
    </div>
  </div>
</template>

<script setup lang="ts">
// 导入
import { ref, computed, onMounted, watch } from 'vue'
import { useSerialStore } from '@/stores/serial'

// 大量的业务逻辑代码...
</script>
```

**重构后** (拆分为多个组件):

1. 主组件 (Monitor.vue):
```vue
<template>
  <div class="monitor">
    <MonitorHeader :title="title" :connected="isConnected" @refresh="refreshData" />
    <DataDisplay :data="filteredData" :format="displayFormat" />
    <FilterPanel v-model:filters="filters" />
    <StatusPanel :status="status" :statistics="statistics" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MonitorHeader from './MonitorHeader.vue'
import DataDisplay from './DataDisplay.vue'
import FilterPanel from './FilterPanel.vue'
import StatusPanel from './StatusPanel.vue'
import { useDataMonitor } from '@/composables/serial/useDataMonitor'

const { 
  title,
  isConnected, 
  filteredData, 
  displayFormat,
  filters,
  status,
  statistics,
  refreshData
} = useDataMonitor()
</script>
```

2. 抽取的业务逻辑 (useDataMonitor.ts):
```ts
import { ref, computed, onMounted, watch } from 'vue'
import { useSerialStore } from '@/stores/serial'

export function useDataMonitor() {
  // 从大组件中抽取的所有业务逻辑
  const title = ref('数据监视器')
  const serialStore = useSerialStore()
  const isConnected = computed(() => serialStore.isConnected)
  // 更多业务逻辑...
  
  return {
    title,
    isConnected,
    // 返回其他需要的状态和方法
  }
}
```

### 状态管理拆分示例

**重构前** (一个大型serial.ts):
```ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useSerialStore = defineStore('serial', () => {
  // 连接状态相关
  const portName = ref('')
  const isConnected = ref(false)
  const connectionOptions = ref({})
  // 更多连接状态...
  
  // 数据相关
  const receivedData = ref([])
  const sentData = ref([])
  // 更多数据相关状态...
  
  // 方法
  function connect() { /* ... */ }
  function disconnect() { /* ... */ }
  function sendData() { /* ... */ }
  // 更多方法...
  
  return {
    // 返回所有状态和方法
  }
})
```

**重构后** (拆分为多个模块):

1. 连接状态 (stores/serial/connection.ts):
```ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useSerialConnectionStore = defineStore('serialConnection', () => {
  const portName = ref('')
  const isConnected = ref(false)
  const connectionOptions = ref({})
  
  function connect() { /* ... */ }
  function disconnect() { /* ... */ }
  
  return {
    portName,
    isConnected,
    connectionOptions,
    connect,
    disconnect
  }
})
```

2. 数据状态 (stores/serial/data.ts):
```ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSerialConnectionStore } from './connection'

export const useSerialDataStore = defineStore('serialData', () => {
  const connectionStore = useSerialConnectionStore()
  const receivedData = ref([])
  const sentData = ref([])
  
  function sendData() { /* ... */ }
  
  return {
    receivedData,
    sentData,
    sendData
  }
})
```

3. 主导出文件 (stores/serial/index.ts):
```ts
import { useSerialConnectionStore } from './connection'
import { useSerialDataStore } from './data'

export { useSerialConnectionStore, useSerialDataStore }

// 为了兼容性，保留原始的store名称
export const useSerialStore = useSerialConnectionStore
```

## 重构执行计划

1. **分析阶段**：先识别所有大型文件(>300行)
2. **设计阶段**：为每个大型文件设计拆分方案
3. **实施阶段**：按照设计方案重构代码
4. **测试阶段**：确保重构后的代码功能正常
5. **优化阶段**：进一步优化代码结构

通过这样的重构，可以将上千行的大文件拆分为多个小文件，每个文件都遵循单一职责原则，代码更易于理解和维护。
