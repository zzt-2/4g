<template>
  <div class="control-page">
    <div class="page-header">
      <h1 class="page-title">设备控制</h1>
    </div>

    <div class="control-container">
      <div class="device-panel">
        <div class="panel-header">
          <h3 class="panel-title">设备选择</h3>
        </div>

        <div class="device-list">
          <div
            v-for="device in availableDevices"
            :key="device.id"
            class="device-item"
            :class="{ selected: selectedDevice === device.id }"
            @click="selectDevice(device.id)"
          >
            <div class="device-icon">
              <span class="material-icons">{{ device.icon }}</span>
            </div>
            <div class="device-info">
              <div class="device-name">{{ device.name }}</div>
              <div class="device-address">{{ device.address }}</div>
            </div>
            <div class="device-status" :class="device.status">
              <span class="status-dot"></span>
              <span class="status-text">{{
                getStatusText(device.status)
              }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="control-panel">
        <div class="panel-header">
          <h3 class="panel-title">控制面板</h3>
          <div class="panel-actions">
            <button
              class="btn save-btn"
              @click="saveCommands"
              :disabled="!hasChanges"
            >
              <span class="material-icons">save</span>
              保存
            </button>
          </div>
        </div>

        <div class="command-editor">
          <div class="commands-list">
            <div
              v-for="(command, index) in commands"
              :key="index"
              class="command-item"
              :class="{ active: activeCommandIndex === index }"
              @click="setActiveCommand(index)"
            >
              <div class="command-header">
                <span class="command-name">{{ command.name }}</span>
                <div class="command-actions">
                  <button
                    class="action-btn"
                    @click.stop="executeCommand(index)"
                  >
                    <span class="material-icons">play_arrow</span>
                  </button>
                  <button class="action-btn" @click.stop="deleteCommand(index)">
                    <span class="material-icons">delete</span>
                  </button>
                </div>
              </div>
              <div class="command-description">{{ command.description }}</div>
            </div>

            <button class="add-command-btn" @click="addNewCommand">
              <span class="material-icons">add</span>
              添加命令
            </button>
          </div>

          <div class="command-detail" v-if="activeCommand">
            <div class="detail-form">
              <div class="form-group">
                <label>命令名称</label>
                <input
                  type="text"
                  v-model="activeCommand.name"
                  placeholder="请输入命令名称"
                />
              </div>

              <div class="form-group">
                <label>描述</label>
                <input
                  type="text"
                  v-model="activeCommand.description"
                  placeholder="请输入命令描述"
                />
              </div>

              <div class="form-group">
                <label>数据格式</label>
                <select v-model="activeCommand.format">
                  <option value="hex">HEX</option>
                  <option value="ascii">ASCII</option>
                  <option value="utf8">UTF-8</option>
                </select>
              </div>

              <div class="form-group">
                <label>命令数据</label>
                <textarea
                  v-model="activeCommand.data"
                  placeholder="请输入命令数据"
                  :class="activeCommand.format"
                ></textarea>
              </div>

              <div class="form-group">
                <label>等待响应</label>
                <div class="checkbox-group">
                  <input type="checkbox" v-model="activeCommand.waitResponse" />
                  <span>等待设备响应</span>
                </div>
              </div>

              <div class="form-group" v-if="activeCommand.waitResponse">
                <label>超时时间 (ms)</label>
                <input
                  type="number"
                  v-model.number="activeCommand.timeout"
                  min="100"
                  step="100"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="response-panel">
        <div class="panel-header">
          <h3 class="panel-title">命令响应</h3>
          <div class="panel-actions">
            <button class="btn clear-btn" @click="clearResponses">
              <span class="material-icons">clear_all</span>
              清除
            </button>
          </div>
        </div>

        <div class="responses-list">
          <div
            v-for="(response, index) in responses"
            :key="index"
            class="response-item"
          >
            <div class="response-header">
              <span class="response-command">{{ response.command }}</span>
              <span class="response-time">{{ response.time }}</span>
            </div>
            <div class="response-data" :class="{ error: response.error }">
              {{
                response.error
                  ? response.error
                  : formatResponseData(response.data)
              }}
            </div>
          </div>

          <div class="empty-responses" v-if="responses.length === 0">
            <span class="material-icons">info</span>
            <span>暂无命令响应数据</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";

// 设备相关
interface Device {
  id: string;
  name: string;
  address: string;
  status: "online" | "offline" | "error";
  icon: string;
}

const availableDevices = ref<Device[]>([
  {
    id: "dev1",
    name: "温度传感器",
    address: "0x01",
    status: "online",
    icon: "thermostat",
  },
  {
    id: "dev2",
    name: "压力传感器",
    address: "0x02",
    status: "offline",
    icon: "speed",
  },
  {
    id: "dev3",
    name: "流量计",
    address: "0x03",
    status: "online",
    icon: "water",
  },
  {
    id: "dev4",
    name: "电机控制器",
    address: "0x04",
    status: "error",
    icon: "settings_input_component",
  },
]);

const selectedDevice = ref<string>("dev1");

const selectDevice = (id: string) => {
  selectedDevice.value = id;
};

const getStatusText = (status: string) => {
  switch (status) {
    case "online":
      return "在线";
    case "offline":
      return "离线";
    case "error":
      return "错误";
    default:
      return "未知";
  }
};

// 命令相关
interface Command {
  name: string;
  description: string;
  format: "hex" | "ascii" | "utf8";
  data: string;
  waitResponse: boolean;
  timeout: number;
}

const commands = ref<Command[]>([
  {
    name: "读取温度",
    description: "读取当前温度值",
    format: "hex",
    data: "01 03 00 00 00 01 84 0A",
    waitResponse: true,
    timeout: 1000,
  },
  {
    name: "设置阈值",
    description: "设置温度报警阈值",
    format: "hex",
    data: "01 06 00 01 00 64 88 5E",
    waitResponse: true,
    timeout: 1000,
  },
  {
    name: "查询状态",
    description: "查询设备运行状态",
    format: "hex",
    data: "01 03 00 02 00 01 24 0B",
    waitResponse: true,
    timeout: 1000,
  },
]);

const activeCommandIndex = ref<number>(0);
const activeCommand = computed<Command | null>(() => {
  if (
    activeCommandIndex.value >= 0 &&
    activeCommandIndex.value < commands.value.length
  ) {
    return commands.value[activeCommandIndex.value];
  }
  return null;
});

const setActiveCommand = (index: number) => {
  activeCommandIndex.value = index;
};

const addNewCommand = () => {
  const newCommand: Command = {
    name: "新命令",
    description: "",
    format: "hex",
    data: "",
    waitResponse: true,
    timeout: 1000,
  };
  commands.value.push(newCommand);
  activeCommandIndex.value = commands.value.length - 1;
};

const deleteCommand = (index: number) => {
  commands.value.splice(index, 1);
  if (activeCommandIndex.value >= commands.value.length) {
    activeCommandIndex.value = commands.value.length - 1;
  }
};

const hasChanges = ref(false);

const saveCommands = () => {
  // 实际应用中，这里会将命令保存到存储
  console.log("保存命令:", commands.value);
  hasChanges.value = false;
};

const executeCommand = (index: number) => {
  const command = commands.value[index];
  console.log("执行命令:", command);

  // 实际应用中，这里会通过串口发送命令
  // 模拟响应
  setTimeout(() => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString();

    responses.value.unshift({
      command: command.name,
      time: timeStr,
      data: new Uint8Array([0x01, 0x03, 0x02, 0x00, 0x42, 0xb8, 0x14]),
      error: null,
    });
  }, 500);
};

// 响应相关
interface Response {
  command: string;
  time: string;
  data: Uint8Array | null;
  error: string | null;
}

const responses = ref<Response[]>([]);

const clearResponses = () => {
  responses.value = [];
};

const formatResponseData = (data: Uint8Array | null) => {
  if (!data) return "";

  return Array.from(data)
    .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
};

onMounted(() => {
  // 页面加载时的初始化操作
});
</script>

<style scoped>
.control-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-header {
  margin-bottom: 16px;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: #e2e8f0;
}

.control-container {
  display: grid;
  grid-template-columns: 300px 1fr 400px;
  gap: 16px;
  flex: 1;
  height: calc(100% - 52px);
}

.device-panel,
.control-panel,
.response-panel {
  background-color: #1a202c;
  border-radius: 8px;
  border: 1px solid #334155;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #334155;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: #e2e8f0;
  margin: 0;
}

.panel-actions {
  display: flex;
  gap: 8px;
}

.btn {
  display: flex;
  align-items: center;
  background-color: #334155;
  color: #e2e8f0;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:hover {
  background-color: #475569;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn .material-icons {
  font-size: 16px;
  margin-right: 4px;
}

.save-btn {
  background-color: #3b82f6;
}

.save-btn:hover {
  background-color: #2563eb;
}

.clear-btn {
  background-color: #4b5563;
}

.clear-btn:hover {
  background-color: #6b7280;
}

/* 设备列表样式 */
.device-list {
  overflow-y: auto;
  flex: 1;
}

.device-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #233046;
  cursor: pointer;
  transition: all 0.2s;
}

.device-item:hover {
  background-color: #233046;
}

.device-item.selected {
  background-color: #1e40af;
}

.device-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background-color: #334155;
  border-radius: 8px;
  margin-right: 12px;
}

.device-icon .material-icons {
  font-size: 20px;
  color: #3b82f6;
}

.device-info {
  flex: 1;
}

.device-name {
  font-weight: 500;
  margin-bottom: 2px;
}

.device-address {
  font-size: 12px;
  color: #94a3b8;
}

.device-status {
  display: flex;
  align-items: center;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}

.device-status.online .status-dot {
  background-color: #10b981;
}

.device-status.offline .status-dot {
  background-color: #94a3b8;
}

.device-status.error .status-dot {
  background-color: #ef4444;
}

.status-text {
  font-size: 12px;
}

.device-status.online .status-text {
  color: #10b981;
}

.device-status.offline .status-text {
  color: #94a3b8;
}

.device-status.error .status-text {
  color: #ef4444;
}

/* 命令编辑器样式 */
.command-editor {
  display: flex;
  flex: 1;
  border-top: 1px solid #233046;
}

.commands-list {
  width: 250px;
  border-right: 1px solid #233046;
  overflow-y: auto;
  padding: 8px;
}

.command-item {
  background-color: #1e293b;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.command-item:hover {
  background-color: #233046;
}

.command-item.active {
  border-left: 3px solid #3b82f6;
}

.command-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.command-name {
  font-weight: 500;
}

.command-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background-color: #334155;
  color: #e2e8f0;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background-color: #475569;
}

.action-btn .material-icons {
  font-size: 14px;
}

.command-description {
  font-size: 12px;
  color: #94a3b8;
}

.add-command-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 10px;
  background-color: #1e293b;
  border: 1px dashed #334155;
  border-radius: 4px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s;
}

.add-command-btn:hover {
  background-color: #233046;
  color: #e2e8f0;
}

.add-command-btn .material-icons {
  font-size: 16px;
  margin-right: 4px;
}

.command-detail {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.detail-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 14px;
  color: #94a3b8;
}

.form-group input,
.form-group select,
.form-group textarea {
  background-color: #233046;
  border: 1px solid #334155;
  border-radius: 4px;
  padding: 8px 12px;
  color: #e2e8f0;
  font-size: 14px;
}

.form-group textarea {
  min-height: 100px;
  font-family: "Consolas", monospace;
  resize: vertical;
}

.form-group textarea.hex {
  text-transform: uppercase;
}

.checkbox-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 响应面板样式 */
.responses-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.response-item {
  background-color: #1e293b;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 8px;
}

.response-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.response-command {
  font-weight: 500;
}

.response-time {
  font-size: 12px;
  color: #94a3b8;
}

.response-data {
  font-family: "Consolas", monospace;
  background-color: #0f172a;
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: nowrap;
}

.response-data.error {
  color: #ef4444;
}

.empty-responses {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #64748b;
  gap: 8px;
}

.empty-responses .material-icons {
  font-size: 36px;
  opacity: 0.5;
}
</style>
