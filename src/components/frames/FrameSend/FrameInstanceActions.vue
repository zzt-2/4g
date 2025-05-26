<script setup lang="ts">
import { ref } from 'vue';
import { useSendFrameInstancesStore } from '../../../stores/frames/sendFrameInstancesStore';
import { useQuasar } from 'quasar';
import { fileDialogManager } from '../../../utils/common/fileDialogManager';
import { pathAPI } from '../../../utils/electronApi';

const store = useSendFrameInstancesStore();
const $q = useQuasar();

const isExporting = ref(false);
const isImporting = ref(false);

// 导出文件
async function handleExport() {
  isExporting.value = true;
  try {
    // 准备要导出的数据
    const instancesData = store.instances;

    // 使用fileDialogManager打开导出对话框
    const result = await fileDialogManager.exportFile(
      '导出帧实例配置',
      `${pathAPI.getDataPath()}/data/frames/sendInstances`, // 存储目录
      instancesData, // 直接传递数据对象
    );

    if (result.success) {
      $q.notify({
        type: 'positive',
        message: '导出成功',
        position: 'top',
        timeout: 2000,
      });
    } else if (!result.canceled) {
      $q.notify({
        type: 'negative',
        message: `导出失败: ${result.error || '未知错误'}`,
        position: 'top',
        timeout: 3000,
      });
    }
  } catch (error) {
    $q.notify({
      type: 'negative',
      message: `导出失败: ${error instanceof Error ? error.message : '未知错误'}`,
      position: 'top',
      timeout: 3000,
    });
  } finally {
    isExporting.value = false;
  }
}

// 导入文件
async function handleImport() {
  isImporting.value = true;
  try {
    // 使用fileDialogManager打开导入对话框
    const result = await fileDialogManager.importFile(
      '导入帧实例配置',
      `${pathAPI.getDataPath()}/data/frames/sendInstances`, // 从指定目录加载
    );

    if (!result.canceled && result.fileData) {
      // 验证导入的数据
      if (!Array.isArray(result.fileData)) {
        throw new Error('导入的数据格式不正确');
      }

      // 使用store的批量保存方法保存导入的数据
      await store.importFromJSON(JSON.stringify(result.fileData));

      $q.notify({
        type: 'positive',
        message: '导入成功',
        position: 'top',
        timeout: 2000,
      });
    }
  } catch (error) {
    $q.notify({
      type: 'negative',
      message: `导入失败: ${error instanceof Error ? error.message : '未知错误'}`,
      position: 'top',
      timeout: 3000,
    });
  } finally {
    isImporting.value = false;
  }
}
</script>

<template>
  <div class="flex items-center">
    <q-btn-group flat>
      <q-btn
        flat
        dense
        icon="file_upload"
        size="sm"
        :loading="isImporting"
        class="rounded-md text-blue-400 hover:bg-blue-900 hover:bg-opacity-30"
        @click="handleImport"
      >
        <q-tooltip>导入配置文件</q-tooltip>
      </q-btn>

      <q-btn
        flat
        dense
        icon="file_download"
        size="sm"
        :loading="isExporting"
        class="rounded-md text-blue-400 hover:bg-blue-900 hover:bg-opacity-30"
        @click="handleExport"
      >
        <q-tooltip>导出配置文件</q-tooltip>
      </q-btn>

      <!-- 预留排序功能按钮 -->
      <q-btn
        flat
        dense
        icon="sort"
        size="sm"
        disable
        class="rounded-md text-blue-400 hover:bg-blue-900 hover:bg-opacity-30"
      >
        <q-tooltip>排序（暂未实现）</q-tooltip>
      </q-btn>

      <!-- 预留批量编辑功能按钮 -->
      <q-btn
        flat
        dense
        icon="edit_note"
        size="sm"
        disable
        class="rounded-md text-blue-400 hover:bg-blue-900 hover:bg-opacity-30"
      >
        <q-tooltip>批量编辑（暂未实现）</q-tooltip>
      </q-btn>
    </q-btn-group>
  </div>
</template>
