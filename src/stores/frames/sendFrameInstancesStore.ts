/**
 * 发送帧实例Store
 *
 * 负责管理所有发送实例的CRUD操作、过滤和收藏功能
 */
import { defineStore } from 'pinia';
import {
  useInstancesState,
  useInstancesCrud,
  useInstanceEditing,
  useInstancesImportExport,
  useInstanceFrameUpdates,
} from '../../composables/frames/sendFrame/sendFrameInsComposable';
import { ref } from 'vue';

export const useSendFrameInstancesStore = defineStore('sendFrameInstances', () => {
  // 使用组合式函数组织状态和方法
  const state = useInstancesState();
  const crud = useInstancesCrud(state);
  const editing = useInstanceEditing(state);
  const importExport = useInstancesImportExport(state);
  const frameUpdates = useInstanceFrameUpdates(state, crud);

  const showEditorDialog = ref(false);
  const isCreatingNewInstance = ref(false);

  // 返回所有需要暴露的状态和方法
  return {
    // 状态
    instances: state.instances,
    currentInstanceId: state.currentInstanceId,
    currentInstance: state.currentInstance,
    instancesByFrameId: state.instancesByFrameId,
    favoriteInstances: state.favoriteInstances,
    isLoading: state.isLoading,
    error: state.error,
    localInstance: editing.localInstance,
    editedId: editing.editedId,
    editedDescription: editing.editedDescription,
    hexValues: editing.hexValues,
    showEditorDialog,
    isCreatingNewInstance,
    // CRUD方法
    fetchInstances: crud.fetchInstances,
    createInstance: crud.createInstance,
    updateInstance: crud.updateInstance,
    deleteInstance: crud.deleteInstance,
    copyInstance: crud.copyInstance,
    toggleFavorite: crud.toggleFavorite,

    // 编辑方法
    setCurrentInstance: editing.setCurrentInstance,
    updateFieldValue: editing.updateFieldValue,
    prepareForSave: editing.prepareForSave,
    saveEditedInstance: editing.saveEditedInstance,

    // 导入导出方法
    exportToJSON: importExport.exportToJSON,
    importFromJSON: importExport.importFromJSON,
    saveToFile: importExport.saveToFile,
    loadFromFile: importExport.loadFromFile,

    // 帧更新方法
    updateInstancesByFrameId: frameUpdates.updateInstancesByFrameId,
  };
});
