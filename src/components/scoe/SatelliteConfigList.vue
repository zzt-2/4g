<template>
  <div class="bg-industrial-panel border-r border-industrial h-full flex flex-col">
    <!-- 标题 -->
    <div class="flex no-wrap justify-between items-center bg-industrial-secondary border-b border-industrial p-3 gap-4">
      <h3 class="text-industrial-primary text-sm font-medium">卫星配置列表</h3>
      <q-input v-model="searchText" placeholder="搜索" dense outlined clearable input-class="text-sm" class="flex-1">
        <template v-slot:prepend>
          <q-icon class="text-industrial-secondary" name="search" />
        </template>
      </q-input>
      <!-- 导入导出按钮 -->
      <ImportExportActions :getData="handleGetScoeData" :setData="handleSetScoeData"
        storageDir="data/scoe/satelliteConfigs" exportTitle="导出卫星配置" importTitle="导入卫星配置" />
    </div>

    <!-- 列表内容 -->
    <div class="flex-1 min-h-0 p-3 space-y-2 overflow-y-auto">
      <div v-for="config in filteredSatelliteConfigs" :key="config.id"
        class="flex items-center justify-between no-wrapgroup bg-industrial-secondary rounded p-2 cursor-pointer transition-colors hover:bg-industrial-highlight"
        :class="{
          'bg-industrial-highlight border-industrial-accent': scoeStore.selectedConfigId === config.id
        }" @dblclick="scoeStore.selectConfig(config.id)">
        <!-- 配置信息 -->
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="text-industrial-primary text-xs font-medium">
              卫星ID: {{ config.satelliteId || '未设置' }}
            </span>
            <span v-if="satelliteConfigValidationErrors.find(error => error.id === config.id)?.error"
              class="text-red-5 text-xs">配置不完整</span>
          </div>

          <div class="text-industrial-secondary text-xs space-y-0.5">
            <div>ID: {{ config.id }}</div>
          </div>
        </div>

        <!-- 删除按钮 -->
        <div class="flex gap-2">
          <q-btn flat round dense size="sm" icon="content_copy" color="green-5"
            class="bg-[#1a1e2e] hover:bg-[#232b3f] transition-colors" @click.stop="handleCopy(config.id)">
            <q-tooltip>复制配置</q-tooltip>
          </q-btn>
          <q-btn flat round dense size="sm" icon="delete" color="red-5"
            class="bg-[#1a1e2e] hover:bg-[#232b3f] transition-colors" @click.stop="handleDelete(config.id)">
            <q-tooltip>删除配置</q-tooltip>
          </q-btn>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="filteredSatelliteConfigs.length === 0" class="text-industrial-tertiary text-center py-8 text-sm">
        暂无配置项
        <br>
        点击下方按钮添加
      </div>
    </div>

    <!-- 添加按钮 -->
    <div class="border-t border-industrial p-3">
      <q-btn class="w-full btn-industrial-primary" size="md" @click="handleAdd">
        <q-icon name="add" class="mr-1" />
        添加配置
      </q-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useScoeStore } from '../../stores/scoeStore'
import { useQuasar } from 'quasar'
import { receiveConfigFields, ScoeReceiveConfig, ScoeSatelliteConfig, ScoeSendConfig, sendConfigFields } from 'src/types/scoe'
import ImportExportActions from '../common/ImportExportActions.vue'
import { ref, computed } from 'vue'

const $q = useQuasar()
const scoeStore = useScoeStore()

const searchText = ref('')

const filteredSatelliteConfigs = computed(() => {
  return scoeStore.satelliteConfigs.filter((config) => {
    if (!searchText.value) return true
    return config.satelliteId.includes(searchText.value) || config.id.includes(searchText.value)
  })
})

const satelliteConfigValidationErrors = computed(() => {
  return filteredSatelliteConfigs.value.map((config) => {
    return {
      id: config.id,
      error: sendConfigFields.map(field => field.must && !(config.sendConfig as ScoeSendConfig)[field.key as keyof ScoeSendConfig]).includes(true) || receiveConfigFields.map(field => field.must && !(config.receiveConfig as ScoeReceiveConfig)[field.key as keyof ScoeReceiveConfig]).includes(true)
    }
  })
})

// 添加配置
const handleAdd = async () => {
  scoeStore.addSatelliteConfig().then(() => {
    $q.notify({
      type: 'positive',
      message: '添加配置成功',
      position: 'top-right'
    })
  })
}

// 复制配置
const handleCopy = (configId: string) => {
  scoeStore.addSatelliteConfig(configId).then(() => {
    $q.notify({
      type: 'positive',
      message: '复制配置成功',
      position: 'top-right'
    })
  })
}

// 删除配置
const handleDelete = (configId: string) => {
  $q.dialog({
    title: '确认删除',
    message: '确定要删除这个卫星配置吗？此操作不可撤销。',
    cancel: true,
    class: 'bg-industrial-panel text-industrial-primary'
  }).onOk(async () => {
    scoeStore.deleteSatelliteConfig(configId).then(() => {
      $q.notify({
        type: 'positive',
        message: '删除配置成功',
        position: 'top-right'
      })
    })
  })
}

const handleGetScoeData = () => {
  return scoeStore.satelliteConfigs
}

const handleSetScoeData = async (data: unknown) => {
  scoeStore.satelliteConfigs = data as ScoeSatelliteConfig[]
  await scoeStore.saveAllConfigs()
}

</script>
