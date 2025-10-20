<template>
  <q-dialog v-model="dialogVisible">
    <q-card class="flex flex-col no-wrap bg-industrial-panel" style="width: 80vw; max-width: 90vw; height: 90vh;">
      <!-- 标题栏 -->
      <q-card-section class="bg-industrial-secondary border-b border-industrial">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <q-icon name="settings" size="sm" class="text-industrial-accent" />
            <span class="text-industrial-primary text-lg font-medium">SCOE 配置</span>
          </div>
          <q-btn icon="close" flat round dense @click="handleClose" />
        </div>
      </q-card-section>

      <!-- 主内容区 -->
      <q-card-section class="flex-1 flex min-h-0 gap-2 p-4">
        <!-- 左侧：帧实例列表 -->
        <SCOEFrameInstanceList class="w-64 min-h-0 h-full border border-industrial rounded-lg" />

        <!-- 右侧：帧实例编辑器 -->
        <SCOEFrameInstanceEditor class="flex-1 min-w-0 min-h-0 h-full border border-industrial rounded-lg" />
      </q-card-section>

      <!-- 底部操作栏 -->
      <q-card-actions class="bg-industrial-secondary border-t border-industrial p-4" align="right">
        <q-btn label="关闭" flat class="btn-industrial-secondary" @click="handleCancel" />
        <q-btn label="保存" class="btn-industrial-primary" @click="handleSave" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useQuasar } from 'quasar';
import { useScoeFrameInstancesStore } from '../../../stores/frames/scoeFrameInstancesStore';
import SCOEFrameInstanceList from './SCOEFrameInstanceList.vue';
import SCOEFrameInstanceEditor from './SCOEFrameInstanceEditor.vue';

const $q = useQuasar();
const scoeFrameInstancesStore = useScoeFrameInstancesStore();

// 弹窗可见性
const dialogVisible = ref(false);

// 打开弹窗
const open = async () => {
  dialogVisible.value = true;
  // 加载帧实例数据
  await scoeFrameInstancesStore.loadSendInstances();
};

// 关闭弹窗
const handleClose = () => {
  dialogVisible.value = false;
  scoeFrameInstancesStore.clearSelection();
};

// 取消
const handleCancel = () => {
  scoeFrameInstancesStore.cancelEdit();
  handleClose();
};

// 保存
const handleSave = async () => {
  try {
    const result = await (scoeFrameInstancesStore.direction === 'send'
      ? scoeFrameInstancesStore.saveCurrentInstance()
      : scoeFrameInstancesStore.saveCurrentReceiveCommand());
    if (result.success) {
      $q.notify({
        type: 'positive',
        message: 'SCOE 配置保存成功',
        position: 'top-right',
      });
    } else {
      throw new Error(result.message || '保存失败');
    }
  } catch (error) {
    $q.notify({
      type: 'negative',
      message: error instanceof Error ? error.message : 'SCOE 帧配置保存失败',
      position: 'top-right',
    });
  }
};

// 暴露方法给父组件
defineExpose({
  open,
});
</script>
