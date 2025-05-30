<script setup lang="ts">
import { ref } from 'vue';
import { useQuasar } from 'quasar';
import { fileDialogManager } from '../../utils/common/fileDialogManager';
import { pathAPI } from '../../utils/electronApi';

interface Props {
  getData: () => any; // 获取要导出的数据
  setData: (data: any) => Promise<void>; // 处理导入的数据
  storageDir: string; // 存储目录
  exportTitle?: string; // 导出标题
  importTitle?: string; // 导入标题
  prepareExportData?: (data: any) => any; // 导出前数据处理，可选
  processImportData?: (fileData: any) => any; // 导入后数据处理，可选
}

const props = withDefaults(defineProps<Props>(), {
  exportTitle: '导出配置文件',
  importTitle: '导入配置文件',
});

const $q = useQuasar();

const isExporting = ref(false);
const isImporting = ref(false);

// 导出文件
async function handleExport() {
  isExporting.value = true;
  try {
    // 获取要导出的数据
    let dataToExport = props.getData();

    // 如果提供了数据预处理函数，则先处理数据
    if (props.prepareExportData) {
      dataToExport = props.prepareExportData(dataToExport);
    }

    // 构建完整的存储路径
    const fullStorageDir = `${pathAPI.getDataPath()}/${props.storageDir}`;

    // 使用fileDialogManager打开导出对话框
    const result = await fileDialogManager.exportFile(
      props.exportTitle,
      fullStorageDir,
      dataToExport,
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
    // 构建完整的存储路径
    const fullStorageDir = `${pathAPI.getDataPath()}/${props.storageDir}`;

    // 使用fileDialogManager打开导入对话框
    const result = await fileDialogManager.importFile(props.importTitle, fullStorageDir);

    if (!result.canceled && result.fileData) {
      // 处理导入的数据
      let processedData = result.fileData;

      // 如果提供了数据后处理函数，则处理数据
      if (props.processImportData) {
        processedData = props.processImportData(result.fileData);
      }

      // 调用传入的数据设置函数
      await props.setData(processedData);

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
        <q-tooltip>{{ importTitle }}</q-tooltip>
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
        <q-tooltip>{{ exportTitle }}</q-tooltip>
      </q-btn>
    </q-btn-group>
  </div>
</template>
