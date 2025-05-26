import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import type { FileRecord } from '../../types/files';
import { filesAPI } from '../../utils/electronApi';

export const useFileStorage = defineStore('fileStorage', () => {
  const fileRecords = ref<FileRecord[]>([]);
  const isLoading = ref(false);

  const loadFileRecords = async (dirPath: string) => {
    isLoading.value = true;
    try {
      // 调用electron API获取目录中的文件信息
      const result = await filesAPI.listWithMetadata(dirPath);
      fileRecords.value = result;
    } catch (error) {
      console.error('加载文件记录失败', error);
    } finally {
      isLoading.value = false;
    }
  };

  return {
    fileRecords,
    isLoading,
    loadFileRecords,
  };
});
