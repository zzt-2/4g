<template>
  <div class="command-panel">
    <div class="command-panel-header">
      <div class="title">命令面板</div>
      <div class="actions">
        <q-btn flat round dense icon="add" color="primary" @click="showAddDialog = true">
          <q-tooltip>添加命令</q-tooltip>
        </q-btn>
        <q-btn flat round dense icon="folder_open" color="amber-8" @click="importCommandFile">
          <q-tooltip>导入命令</q-tooltip>
        </q-btn>
        <q-btn
          flat
          round
          dense
          icon="save"
          color="blue-5"
          :disable="commands.length === 0"
          @click="exportCommandFile"
        >
          <q-tooltip>导出命令</q-tooltip>
        </q-btn>
      </div>
    </div>

    <div class="command-panel-body">
      <template v-if="commands.length === 0">
        <div class="empty-commands">
          <q-icon name="smart_button" size="48px" color="grey-6" />
          <div class="empty-text">暂无命令</div>
          <q-btn flat color="primary" label="添加命令" icon="add" @click="showAddDialog = true" />
        </div>
      </template>
      <template v-else>
        <q-list separator>
          <q-item
            v-for="(cmd, index) in commands"
            :key="index"
            class="command-item"
            clickable
            @click="sendCommand(cmd)"
            :disable="!isConnected"
          >
            <q-item-section>
              <q-item-label>{{ cmd.name }}</q-item-label>
              <q-item-label caption>
                <span
                  :class="{
                    'text-primary': cmd.type === 'text',
                    'text-pink-6': cmd.type === 'hex',
                  }"
                >
                  {{ cmd.type === 'text' ? '[文本]' : '[HEX]' }}
                </span>
                {{ cmd.value }}
              </q-item-label>
            </q-item-section>

            <q-item-section side>
              <div class="row items-center no-wrap">
                <q-btn
                  flat
                  round
                  dense
                  color="amber-8"
                  icon="edit"
                  @click.stop="editCommand(index)"
                >
                  <q-tooltip>编辑</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  round
                  dense
                  color="negative"
                  icon="delete"
                  @click.stop="deleteCommand(index)"
                >
                  <q-tooltip>删除</q-tooltip>
                </q-btn>
              </div>
            </q-item-section>
          </q-item>
        </q-list>
      </template>
    </div>

    <!-- 添加/编辑命令对话框 -->
    <q-dialog v-model="showAddDialog" persistent>
      <q-card style="min-width: 350px">
        <q-card-section>
          <div class="text-h6">{{ editingIndex === -1 ? '添加命令' : '编辑命令' }}</div>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-input
            v-model="editingCommand.name"
            label="命令名称"
            filled
            dense
            :rules="[(val) => (val && val.length > 0) || '请输入命令名称']"
          />

          <div class="row q-mt-md">
            <q-radio v-model="editingCommand.type" val="text" label="文本" />
            <q-radio v-model="editingCommand.type" val="hex" label="十六进制" class="q-ml-md" />
          </div>

          <q-input
            v-model="editingCommand.value"
            :label="editingCommand.type === 'hex' ? '十六进制命令' : '文本命令'"
            :hint="editingCommand.type === 'hex' ? '使用空格分隔字节，如：01 02 FF' : ''"
            filled
            dense
            class="q-mt-sm"
            :rules="[(val) => (val && val.length > 0) || '请输入命令内容']"
          />

          <div class="row q-mt-md">
            <q-checkbox v-model="editingCommand.appendNewLine" label="自动添加换行" />
          </div>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="取消" color="negative" v-close-popup />
          <q-btn
            flat
            label="保存"
            color="primary"
            @click="saveCommand"
            :disable="!editingCommand.name || !editingCommand.value"
            v-close-popup
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- 删除确认对话框 -->
    <q-dialog v-model="showDeleteDialog" persistent>
      <q-card>
        <q-card-section class="row items-center">
          <q-avatar icon="warning" color="negative" text-color="white" />
          <span class="q-ml-sm">确定要删除此命令吗？</span>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="取消" color="primary" v-close-popup />
          <q-btn flat label="删除" color="negative" @click="confirmDelete" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue';
import { useSerialData } from '../../composables/serial/useSerialData';

// 命令类型定义
interface Command {
  name: string;
  value: string;
  type: 'text' | 'hex';
  appendNewLine: boolean;
}

// 组合式API
const { isConnected, sendDataToPort } = useSerialData();

// 实现本地存储功能，替代 useStorage
const commands = ref<Command[]>([]);

// 从本地存储加载命令
const loadCommands = () => {
  try {
    const savedCommands = localStorage.getItem('serial-commands');
    if (savedCommands) {
      commands.value = JSON.parse(savedCommands);
    }
  } catch (error) {
    console.error('加载命令失败:', error);
  }
};

// 保存命令到本地存储
const saveCommands = () => {
  localStorage.setItem('serial-commands', JSON.stringify(commands.value));
};

// 监听命令变化，自动保存
watch(
  commands,
  () => {
    saveCommands();
  },
  { deep: true },
);

// 组件挂载时加载命令
onMounted(() => {
  loadCommands();
});

const showAddDialog = ref(false);
const showDeleteDialog = ref(false);
const editingIndex = ref(-1);
const deleteIndex = ref(-1);
const editingCommand = reactive<Command>({
  name: '',
  value: '',
  type: 'text',
  appendNewLine: true,
});

// 发送命令
const sendCommand = (command: Command) => {
  if (!isConnected.value) return;

  let value = command.value;
  if (command.type === 'text' && command.appendNewLine) {
    value += '\r\n';
  }

  sendDataToPort(value, command.type === 'hex');
};

// 添加新命令
const addCommand = () => {
  resetEditingCommand();
  showAddDialog.value = true;
  editingIndex.value = -1;
};

// 编辑命令
const editCommand = (index: number) => {
  editingIndex.value = index;
  const cmd = commands.value[index];
  if (cmd) {
    editingCommand.name = cmd.name;
    editingCommand.value = cmd.value;
    editingCommand.type = cmd.type;
    editingCommand.appendNewLine = cmd.appendNewLine;
    showAddDialog.value = true;
  }
};

// 删除命令
const deleteCommand = (index: number) => {
  deleteIndex.value = index;
  showDeleteDialog.value = true;
};

// 确认删除
const confirmDelete = () => {
  if (deleteIndex.value >= 0 && deleteIndex.value < commands.value.length) {
    commands.value.splice(deleteIndex.value, 1);
  }
};

// 保存命令
const saveCommand = () => {
  if (!editingCommand.name || !editingCommand.value) return;

  const command: Command = {
    name: editingCommand.name,
    value: editingCommand.value,
    type: editingCommand.type,
    appendNewLine: editingCommand.appendNewLine,
  };

  if (editingIndex.value === -1) {
    // 添加新命令
    commands.value.push(command);
  } else {
    // 更新现有命令
    commands.value[editingIndex.value] = command;
  }

  resetEditingCommand();
};

// 重置编辑状态
const resetEditingCommand = () => {
  editingCommand.name = '';
  editingCommand.value = '';
  editingCommand.type = 'text';
  editingCommand.appendNewLine = true;
};

// 导入命令文件
const importCommandFile = async () => {
  try {
    // 在实际环境中，这里会调用Electron API打开文件对话框
    const { ipcRenderer } = window.require('electron');
    const result = await ipcRenderer.invoke('dialog:openFile', {
      title: '导入命令',
      filters: [{ name: '命令文件', extensions: ['json'] }],
    });

    if (result.canceled) return;

    const filePath = result.filePaths[0];
    const fileContent = await ipcRenderer.invoke('file:read', filePath);

    try {
      const importedCommands = JSON.parse(fileContent);
      if (Array.isArray(importedCommands)) {
        // 可以添加验证逻辑确保导入的命令格式正确
        commands.value = importedCommands;
      }
    } catch (e) {
      console.error('解析命令文件失败:', e);
    }
  } catch (error) {
    console.error('导入命令文件失败:', error);
  }
};

// 导出命令文件
const exportCommandFile = async () => {
  try {
    if (commands.value.length === 0) return;

    const content = JSON.stringify(commands.value, null, 2);

    // 在实际环境中，这里会调用Electron API打开保存对话框
    const { ipcRenderer } = window.require('electron');
    const result = await ipcRenderer.invoke('dialog:saveFile', {
      title: '导出命令',
      defaultPath: 'commands.json',
      filters: [{ name: '命令文件', extensions: ['json'] }],
    });

    if (result.canceled) return;

    const filePath = result.filePath;
    await ipcRenderer.invoke('file:write', filePath, content);
  } catch (error) {
    console.error('导出命令文件失败:', error);
  }
};
</script>

<style scoped>
.command-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #1e1e1e;
  border-radius: 4px;
  overflow: hidden;
}

.command-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background-color: #2a2a2a;
  border-bottom: 1px solid #424242;
}

.title {
  font-weight: 500;
  font-size: 1.05rem;
}

.actions {
  display: flex;
  gap: 4px;
}

.command-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.empty-commands {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
  color: #757575;
}

.empty-text {
  margin: 12px 0;
}

.command-item:hover {
  background-color: rgba(255, 255, 255, 0.05);
}
</style>
