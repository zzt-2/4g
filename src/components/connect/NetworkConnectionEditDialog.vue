<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { NetworkConnectionConfig, RemoteHost } from '../../types/serial/network';

const props = defineProps<{
  modelValue: boolean;
  config?: NetworkConnectionConfig | undefined;
  mode: 'add' | 'edit';
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [config: NetworkConnectionConfig];
  cancel: [];
}>();

// 表单数据
const formData = ref<NetworkConnectionConfig>({
  id: '',
  name: '',
  type: 'tcp',
  host: '',
  port: 8080,
  description: '',
  remoteHosts: [],
});

// 远程主机编辑状态
const remoteHostDialog = ref(false);
const editingRemoteHost = ref<RemoteHost | null>(null);
const remoteHostForm = ref<RemoteHost>({
  id: '',
  name: '',
  host: '',
  port: 8080,
  enabled: true,
  description: '',
});

// 表单验证规则
const nameRules = [
  (val: string) => !!val || '请输入连接名称',
  (val: string) => val.length <= 50 || '连接名称不能超过50个字符',
];

const hostRules = [
  (val: string) => !!val || '请输入主机地址',
  (val: string) => {
    // 简单的IP地址或域名验证
    const ipPattern =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const domainPattern =
      /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return ipPattern.test(val) || domainPattern.test(val) || 'IP地址或域名格式不正确';
  },
];

const portRules = [(val: number) => (val >= 1 && val <= 65535) || '端口号范围: 1-65535'];

// 远程主机验证规则
const remoteHostNameRules = [
  (val: string) => !!val || '请输入远程主机名称',
  (val: string) => val.length <= 30 || '名称不能超过30个字符',
];

// 对话框标题
const dialogTitle = computed(() => {
  return props.mode === 'add' ? '添加网络连接' : '编辑网络连接';
});

// 保存按钮文本
const saveButtonText = computed(() => {
  return props.mode === 'add' ? '添加' : '保存';
});

// 表单引用
const formRef = ref();
const remoteHostFormRef = ref();

// 监听 config 变化，初始化表单数据
watch(
  () => props.config,
  (newConfig) => {
    if (newConfig) {
      formData.value = {
        ...newConfig,
        remoteHosts: newConfig.remoteHosts ? [...newConfig.remoteHosts] : [],
      };
    } else {
      // 新建模式，重置表单
      formData.value = {
        id: '',
        name: '',
        type: 'tcp',
        host: '',
        port: 8080,
        description: '',
        remoteHosts: [],
      };
    }
  },
  { immediate: true },
);

// 生成唯一ID
const generateId = (): string => {
  return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const generateRemoteHostId = (): string => {
  return `remote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// 处理保存
const handleSave = async () => {
  const isValid = await formRef.value?.validate();
  if (!isValid) return;

  // 如果是新建模式，生成ID
  if (props.mode === 'add') {
    formData.value.id = generateId();
  }

  emit('save', { ...formData.value });
  handleClose();
};

// 处理取消
const handleCancel = () => {
  emit('cancel');
  handleClose();
};

// 关闭对话框
const handleClose = () => {
  emit('update:modelValue', false);
  // 重置表单验证状态
  setTimeout(() => {
    formRef.value?.resetValidation();
  }, 300);
};

// 连接类型选项
const connectionTypes = [
  { label: 'TCP Client', value: 'tcp' },
  { label: 'UDP', value: 'udp' },
  { label: 'WebSocket', value: 'websocket' },
];

// 远程主机管理
const addRemoteHost = () => {
  editingRemoteHost.value = null;
  remoteHostForm.value = {
    id: '',
    name: '',
    host: '',
    port: 8080,
    enabled: true,
    description: '',
  };
  remoteHostDialog.value = true;
};

const editRemoteHost = (host: RemoteHost) => {
  editingRemoteHost.value = host;
  remoteHostForm.value = { ...host };
  remoteHostDialog.value = true;
};

const deleteRemoteHost = (hostId: string) => {
  formData.value.remoteHosts = formData.value.remoteHosts?.filter((h) => h.id !== hostId) || [];
};

const saveRemoteHost = async () => {
  const isValid = await remoteHostFormRef.value?.validate();
  if (!isValid) return;

  if (editingRemoteHost.value) {
    // 编辑模式
    const index =
      formData.value.remoteHosts?.findIndex((h) => h.id === editingRemoteHost.value!.id) ?? -1;
    if (index > -1 && formData.value.remoteHosts) {
      formData.value.remoteHosts[index] = { ...remoteHostForm.value };
    }
  } else {
    // 添加模式
    remoteHostForm.value.id = generateRemoteHostId();
    if (!formData.value.remoteHosts) {
      formData.value.remoteHosts = [];
    }
    formData.value.remoteHosts.push({ ...remoteHostForm.value });
  }

  remoteHostDialog.value = false;
};

const toggleRemoteHostEnabled = (hostId: string) => {
  const host = formData.value.remoteHosts?.find((h) => h.id === hostId);
  if (host) {
    host.enabled = !host.enabled;
  }
};
</script>

<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card class="bg-industrial-panel border border-industrial w-[450px] max-w-[90vw]">
      <!-- 标题栏 -->
      <q-card-section class="bg-industrial-secondary border-b border-industrial row items-center q-py-sm q-px-md">
        <div class="text-h6 text-industrial-primary font-medium">{{ dialogTitle }}</div>
        <q-space />
        <q-btn flat round dense icon="close"
          class="text-industrial-secondary hover:text-industrial-primary hover:bg-industrial-highlight"
          @click="handleClose" />
      </q-card-section>

      <!-- 表单内容 -->
      <q-card-section class="q-pa-md">
        <q-form ref="formRef" class="space-y-4">
          <!-- 连接名称 -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-industrial-primary">连接名称</label>
            <q-input v-model="formData.name" outlined dense :rules="nameRules" placeholder="输入连接名称"
              class="bg-industrial-secondary border-industrial text-industrial-primary"
              input-class="text-industrial-primary" />
          </div>

          <!-- 连接类型 -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-industrial-primary">连接类型</label>
            <q-select v-model="formData.type" :options="connectionTypes" outlined dense emit-value map-options dark
              class="bg-industrial-secondary border-industrial text-industrial-primary"
              popup-content-class="bg-industrial-panel border border-industrial" />
          </div>

          <!-- 主机地址和端口 -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-industrial-primary">主机地址</label>
            <div class="grid grid-cols-3 gap-3">
              <div class="col-span-2">
                <q-input v-model="formData.host" outlined dense :rules="hostRules" placeholder="IP地址或域名"
                  class="bg-industrial-secondary border-industrial text-industrial-primary"
                  input-class="text-industrial-primary" />
              </div>
              <div class="col-span-1">
                <q-input v-model.number="formData.port" outlined dense type="number" :rules="portRules" placeholder="端口"
                  class="bg-industrial-secondary border-industrial text-industrial-primary"
                  input-class="text-industrial-primary" />
              </div>
            </div>
          </div>

          <!-- 描述 -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-industrial-primary">描述 (可选)</label>
            <q-input v-model="formData.description" outlined dense type="textarea" rows="2" placeholder="连接描述信息"
              class="bg-industrial-secondary border-industrial text-industrial-primary"
              input-class="text-industrial-primary" />
          </div>

          <!-- 远程主机列表 -->
          <div v-if="formData.type === 'udp'" class="space-y-3 mt-6">
            <div class="flex items-center justify-between pb-2 border-b border-industrial">
              <h3 class="text-base font-medium text-industrial-primary">远程主机</h3>
              <q-btn flat dense size="sm" icon="add" label="添加" class="btn-industrial-primary text-xs px-3 py-1"
                @click="addRemoteHost" />
            </div>

            <!-- 远程主机列表 -->
            <div v-if="formData.remoteHosts && formData.remoteHosts.length > 0"
              class="space-y-2 max-h-60 overflow-y-auto">
              <div v-for="host in formData.remoteHosts" :key="host.id"
                class="bg-industrial-secondary border border-industrial rounded-md p-3 hover:bg-industrial-highlight transition-colors">
                <div class="flex items-center justify-between">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <div class="text-sm font-medium text-industrial-primary truncate">
                        {{ host.name }}
                      </div>
                      <div :class="[
                        'w-2 h-2 rounded-full flex-shrink-0',
                        host.enabled !== false ? 'bg-green-500' : 'bg-gray-500',
                      ]"></div>
                    </div>
                    <div class="text-xs text-industrial-secondary mt-1">
                      {{ host.host }}:{{ host.port }}
                    </div>
                    <div v-if="host.description" class="text-xs text-industrial-tertiary mt-1 truncate">
                      {{ host.description }}
                    </div>
                  </div>
                  <div class="flex items-center gap-1 ml-3">
                    <q-toggle :model-value="host.enabled !== false" size="xs" color="green"
                      @update:model-value="toggleRemoteHostEnabled(host.id)" />
                    <q-btn flat dense size="xs" icon="edit"
                      class="text-industrial-accent hover:bg-industrial-highlight p-1" @click="editRemoteHost(host)" />
                    <q-btn flat dense size="xs" icon="delete" class="text-red-400 hover:bg-industrial-highlight p-1"
                      @click="deleteRemoteHost(host.id)" />
                  </div>
                </div>
              </div>
            </div>

            <!-- 无远程主机提示 -->
            <div v-else
              class="text-center py-6 text-industrial-secondary border border-dashed border-industrial rounded-md bg-industrial-secondary/30">
              <div class="text-sm mb-1">暂无远程主机</div>
              <div class="text-xs">点击"添加"按钮添加远程主机</div>
            </div>
          </div>
        </q-form>
      </q-card-section>

      <!-- 操作按钮 -->
      <q-card-actions class="bg-industrial-secondary border-t border-industrial px-4 py-3 flex justify-end gap-3">
        <q-btn flat label="取消" class="btn-industrial-secondary px-4 py-2" @click="handleCancel" />
        <q-btn :label="saveButtonText" class="btn-industrial-primary px-4 py-2" @click="handleSave" />
      </q-card-actions>
    </q-card>

    <!-- 远程主机编辑对话框 -->
    <q-dialog v-model="remoteHostDialog">
      <q-card class="bg-industrial-panel border border-industrial w-[400px] max-w-[90vw]">
        <q-card-section class="bg-industrial-secondary border-b border-industrial row items-center q-py-sm q-px-md">
          <div class="text-h6 text-industrial-primary font-medium">
            {{ editingRemoteHost ? '编辑远程主机' : '添加远程主机' }}
          </div>
          <q-space />
          <q-btn flat round dense icon="close"
            class="text-industrial-secondary hover:text-industrial-primary hover:bg-industrial-highlight"
            @click="remoteHostDialog = false" />
        </q-card-section>

        <q-card-section class="q-pa-md">
          <q-form ref="remoteHostFormRef" class="space-y-4">
            <!-- 主机名称 -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-industrial-primary">主机名称</label>
              <q-input v-model="remoteHostForm.name" outlined dense :rules="remoteHostNameRules" placeholder="输入主机名称"
                class="bg-industrial-secondary border-industrial text-industrial-primary"
                input-class="text-industrial-primary" />
            </div>

            <!-- 主机地址和端口 -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-industrial-primary">主机地址</label>
              <div class="grid grid-cols-3 gap-3">
                <div class="col-span-2">
                  <q-input v-model="remoteHostForm.host" outlined dense :rules="hostRules" placeholder="IP地址或域名"
                    class="bg-industrial-secondary border-industrial text-industrial-primary"
                    input-class="text-industrial-primary" />
                </div>
                <div class="col-span-1">
                  <q-input v-model.number="remoteHostForm.port" outlined dense type="number" :rules="portRules"
                    placeholder="端口" class="bg-industrial-secondary border-industrial text-industrial-primary"
                    input-class="text-industrial-primary" />
                </div>
              </div>
            </div>

            <!-- 启用状态 -->
            <div class="flex items-center">
              <q-toggle v-model="remoteHostForm.enabled" label="启用此远程主机" color="green"
                class="text-industrial-primary" />
            </div>

            <!-- 描述 -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-industrial-primary">描述 (可选)</label>
              <q-input v-model="remoteHostForm.description" outlined dense type="textarea" rows="2" placeholder="远程主机描述"
                class="bg-industrial-secondary border-industrial text-industrial-primary"
                input-class="text-industrial-primary" />
            </div>
          </q-form>
        </q-card-section>

        <q-card-actions class="bg-industrial-secondary border-t border-industrial px-4 py-3 flex justify-end gap-3">
          <q-btn flat label="取消" class="btn-industrial-secondary px-4 py-2" @click="remoteHostDialog = false" />
          <q-btn :label="editingRemoteHost ? '保存' : '添加'" class="btn-industrial-primary px-4 py-2"
            @click="saveRemoteHost" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-dialog>
</template>
