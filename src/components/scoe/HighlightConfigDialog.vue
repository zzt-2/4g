<template>
  <q-dialog v-model="dialogVisible">
    <q-card class="flex flex-col no-wrap bg-industrial-panel border border-industrial"
      style="min-width: 800px; max-width: 800px; height: 90vh;">
      <!-- 标题栏 -->
      <q-card-section class="bg-industrial-secondary border-b border-industrial">
        <div class="flex items-center justify-between">
          <div class="text-industrial-primary text-lg font-medium flex items-center">
            <q-icon name="highlight" class="mr-2" />
            高亮配置
          </div>
          <q-btn icon="close" flat round dense @click="handleClose" />
        </div>
      </q-card-section>

      <!-- 内容区 -->
      <q-card-section class="flex-1 min-h-0 flex flex-col p-4">
        <!-- 操作按钮 -->
        <div class="flex justify-between items-center mb-4">
          <div class="text-industrial-secondary text-sm">
            配置{{ activeTab === 'send' ? '发送' : '接收' }}数据的高亮显示区域（按字节偏移）
          </div>
          <q-btn size="sm" class="btn-industrial-primary" @click="handleAdd">
            <q-icon name="add" class="mr-1" />
            添加
          </q-btn>
        </div>

        <!-- 配置列表 -->
        <div class="flex-1 min-h-0 space-y-2 overflow-y-auto">
          <div v-if="currentConfigs.length === 0" class="text-center text-industrial-tertiary py-8">
            暂无配置项，点击"添加"按钮创建
          </div>

          <div v-for="(config, index) in currentConfigs" :key="config.id"
            class="bg-industrial-secondary border border-industrial rounded p-3">
            <div class="flex items-center gap-3">
              <!-- 颜色预览 -->
              <div class="w-8 h-8 rounded flex-shrink-0" :style="{ backgroundColor: getHighlightColor(index) }" />

              <!-- 表单字段 -->
              <div class="flex-1 grid grid-cols-3 gap-3">
                <q-input v-model="config.name" label="名称" dense outlined bg-color="industrial-panel"
                  input-class="text-industrial-primary text-sm" />

                <q-input v-model.number="config.offset" label="偏移（字节）" type="number" dense outlined
                  bg-color="industrial-panel" input-class="text-industrial-primary text-sm" />

                <q-input v-model.number="config.length" label="长度（字节）" type="number" dense outlined
                  bg-color="industrial-panel" input-class="text-industrial-primary text-sm" />
              </div>

              <!-- 删除按钮 -->
              <q-btn icon="delete" flat round dense class="text-negative" @click="handleDelete(config.id)" />
            </div>
          </div>
        </div>
      </q-card-section>

      <!-- 底部按钮 -->
      <q-card-actions class="bg-industrial-secondary border-t border-industrial p-3" align="right">
        <q-btn label="取消" class="btn-industrial-secondary" @click="handleClose" />
        <q-btn label="保存" class="btn-industrial-primary" @click="handleSave" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useScoeStore } from '../../stores/scoeStore'
import { useQuasar } from 'quasar'
import { getHighlightColor } from 'src/types/scoe'

const $q = useQuasar()
const scoeStore = useScoeStore()

const dialogVisible = ref(false)
const activeTab = ref<'send' | 'receive'>('receive')

// 当前标签页的配置列表
const currentConfigs = computed(() => {
  return activeTab.value === 'send'
    ? scoeStore.highlightConfigs.sendConfigs
    : scoeStore.highlightConfigs.receiveConfigs
})

/**
 * 打开弹窗
 */
const open = (type: 'send' | 'receive') => {
  activeTab.value = type
  dialogVisible.value = true
}

/**
 * 关闭弹窗
 */
const handleClose = () => {
  dialogVisible.value = false
}

/**
 * 添加配置项
 */
const handleAdd = () => {
  scoeStore.addHighlightConfig(activeTab.value, {
    name: '新配置',
    offset: 0,
    length: 1,
  })
}

/**
 * 删除配置项
 */
const handleDelete = (id: string) => {
  $q.dialog({
    title: '确认删除',
    message: '确定要删除这个高亮配置吗？',
    cancel: true,
    dark: true,
    class: 'bg-industrial-panel',
  }).onOk(() => {
    scoeStore.deleteHighlightConfig(activeTab.value, id)
  })
}

/**
 * 保存配置
 */
const handleSave = async () => {
  try {
    const result = await scoeStore.saveAllConfigs()
    if (result.success) {
      $q.notify({
        type: 'positive',
        message: '高亮配置保存成功',
        position: 'top-right',
      })
      handleClose()
    } else {
      throw new Error(result.message || '保存失败')
    }
  } catch (error) {
    $q.notify({
      type: 'negative',
      message: error instanceof Error ? error.message : '保存配置失败',
      position: 'top-right',
    })
  }
}

defineExpose({
  open,
})
</script>
