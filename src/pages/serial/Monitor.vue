<template>
  <div class="monitor-page">
    <div class="page-header">
      <h1 class="page-title">串口数据监控</h1>

      <div class="control-bar">
        <button class="btn clear-btn" @click="clearData">
          <span class="material-icons">clear_all</span>
          清除数据
        </button>

        <div class="format-toggle">
          <label class="format-label">
            <input type="radio" v-model="displayFormat" value="hex" />
            HEX
          </label>
          <label class="format-label">
            <input type="radio" v-model="displayFormat" value="ascii" />
            ASCII
          </label>
          <label class="format-label">
            <input type="radio" v-model="displayFormat" value="utf8" />
            UTF-8
          </label>
        </div>

        <button
          class="btn record-btn"
          :class="{ active: isRecording }"
          @click="toggleRecording"
        >
          <span class="material-icons">{{
            isRecording ? "stop" : "fiber_manual_record"
          }}</span>
          {{ isRecording ? "停止记录" : "开始记录" }}
        </button>
      </div>
    </div>

    <div class="monitor-container">
      <div class="connection-panel">
        <div class="port-selector">
          <div class="selector-header">
            <h3 class="selector-title">串口连接</h3>
            <button class="refresh-btn" @click="refreshPorts">
              <span class="material-icons">refresh</span>
            </button>
          </div>

          <div class="port-list">
            <div
              v-for="port in availablePorts"
              :key="port.path"
              class="port-item"
              :class="{ selected: selectedPort === port.path }"
              @click="selectPort(port.path)"
            >
              <span class="port-name">{{ port.path }}</span>
              <span class="port-info">{{ port.manufacturer }}</span>
            </div>
          </div>

          <div class="port-settings">
            <div class="settings-item">
              <label>波特率</label>
              <select v-model="baudRate">
                <option v-for="rate in baudRates" :key="rate" :value="rate">
                  {{ rate }}
                </option>
              </select>
            </div>

            <div class="settings-item">
              <label>数据位</label>
              <select v-model="dataBits">
                <option
                  v-for="bits in dataBitsOptions"
                  :key="bits"
                  :value="bits"
                >
                  {{ bits }}
                </option>
              </select>
            </div>

            <div class="settings-item">
              <label>停止位</label>
              <select v-model="stopBits">
                <option
                  v-for="bits in stopBitsOptions"
                  :key="bits"
                  :value="bits"
                >
                  {{ bits }}
                </option>
              </select>
            </div>

            <div class="settings-item">
              <label>校验位</label>
              <select v-model="parity">
                <option
                  v-for="p in parityOptions"
                  :key="p.value"
                  :value="p.value"
                >
                  {{ p.label }}
                </option>
              </select>
            </div>
          </div>

          <div class="connection-control">
            <button
              class="btn connect-btn"
              :class="{ connected: isConnected }"
              @click="toggleConnection"
            >
              <span class="material-icons">{{
                isConnected ? "link_off" : "link"
              }}</span>
              {{ isConnected ? "断开连接" : "连接" }}
            </button>
          </div>
        </div>
      </div>

      <div class="data-monitor">
        <div class="monitor-header">
          <div class="tab-navigation">
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'combined' }"
              @click="setActiveTab('combined')"
            >
              全部数据
            </button>
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'rx' }"
              @click="setActiveTab('rx')"
            >
              接收数据
            </button>
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'tx' }"
              @click="setActiveTab('tx')"
            >
              发送数据
            </button>
          </div>

          <div class="monitor-tools">
            <div class="auto-scroll">
              <label class="toggle-label">
                <input type="checkbox" v-model="autoScroll" />
                自动滚动
              </label>
            </div>

            <div class="search-container">
              <input
                type="text"
                v-model="searchQuery"
                placeholder="搜索..."
                class="search-input"
              />
              <button class="search-btn">
                <span class="material-icons">search</span>
              </button>
            </div>
          </div>
        </div>

        <div class="data-view" ref="dataView">
          <div
            class="data-entry"
            v-for="(entry, index) in filteredData"
            :key="index"
          >
            <div class="entry-timestamp">{{ entry.timestamp }}</div>
            <div class="entry-direction" :class="entry.direction">
              {{ entry.direction === "rx" ? "←" : "→" }}
            </div>
            <div
              class="entry-data"
              :class="{ highlight: isHighlighted(entry) }"
            >
              {{ formatData(entry.data) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";

// 串口连接配置
const availablePorts = ref<any[]>([]);
const selectedPort = ref("");
const isConnected = ref(false);

// 串口设置
const baudRate = ref(9600);
const baudRates = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];

const dataBits = ref(8);
const dataBitsOptions = [5, 6, 7, 8];

const stopBits = ref(1);
const stopBitsOptions = [1, 2];

const parity = ref("none");
const parityOptions = [
  { label: "无", value: "none" },
  { label: "奇校验", value: "odd" },
  { label: "偶校验", value: "even" },
];

// 监控设置
const displayFormat = ref("hex");
const isRecording = ref(false);
const autoScroll = ref(true);
const activeTab = ref("combined");
const searchQuery = ref("");
const dataView = ref<HTMLElement | null>(null);

// 模拟数据
const serialData = ref<any[]>([
  {
    timestamp: "10:15:23.456",
    direction: "tx",
    data: new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x0a, 0xc5, 0xcd]),
  },
  {
    timestamp: "10:15:23.789",
    direction: "rx",
    data: new Uint8Array([
      0x01, 0x03, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xfa, 0x33,
    ]),
  },
  {
    timestamp: "10:15:24.123",
    direction: "tx",
    data: new Uint8Array([0x01, 0x03, 0x00, 0x0a, 0x00, 0x01, 0xa4, 0x36]),
  },
  {
    timestamp: "10:15:24.456",
    direction: "rx",
    data: new Uint8Array([0x01, 0x03, 0x02, 0x00, 0x00, 0xb8, 0x44]),
  },
]);

// 过滤后的数据
const filteredData = computed(() => {
  let filtered = [...serialData.value];

  // 按选项卡过滤
  if (activeTab.value !== "combined") {
    filtered = filtered.filter((entry) => entry.direction === activeTab.value);
  }

  // 按搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter((entry) => {
      const dataString = formatData(entry.data).toLowerCase();
      return dataString.includes(query) || entry.timestamp.includes(query);
    });
  }

  return filtered;
});

// 刷新可用端口
const refreshPorts = async () => {
  // 模拟获取端口列表
  availablePorts.value = [
    { path: "COM1", manufacturer: "Standard Serial Port" },
    { path: "COM3", manufacturer: "Silicon Labs CP210x USB to UART Bridge" },
    { path: "COM5", manufacturer: "FTDI USB Serial Device" },
  ];
};

// 选择端口
const selectPort = (path: string) => {
  selectedPort.value = path;
};

// 切换连接状态
const toggleConnection = () => {
  if (isConnected.value) {
    // 断开连接
    isConnected.value = false;
  } else {
    // 连接
    if (selectedPort.value) {
      isConnected.value = true;
    }
  }
};

// 设置活动选项卡
const setActiveTab = (tab: string) => {
  activeTab.value = tab;
};

// 切换记录状态
const toggleRecording = () => {
  isRecording.value = !isRecording.value;
};

// 清除数据
const clearData = () => {
  serialData.value = [];
};

// 格式化数据
const formatData = (data: Uint8Array) => {
  switch (displayFormat.value) {
    case "hex":
      return Array.from(data)
        .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
        .join(" ");
    case "ascii":
      return Array.from(data)
        .map((byte) =>
          byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : "."
        )
        .join("");
    case "utf8":
      try {
        return new TextDecoder("utf-8").decode(data);
      } catch (e) {
        return Array.from(data)
          .map((byte) =>
            byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : "."
          )
          .join("");
      }
    default:
      return "";
  }
};

// 判断是否高亮显示
const isHighlighted = (entry: any) => {
  if (!searchQuery.value) return false;

  const query = searchQuery.value.toLowerCase();
  const dataString = formatData(entry.data).toLowerCase();
  return dataString.includes(query);
};

// 自动滚动到底部
watch(
  [filteredData, autoScroll],
  () => {
    if (autoScroll.value && dataView.value) {
      setTimeout(() => {
        if (dataView.value) {
          dataView.value.scrollTop = dataView.value.scrollHeight;
        }
      }, 0);
    }
  },
  { deep: true }
);

// 页面加载时
onMounted(() => {
  refreshPorts();
});
</script>

<style scoped>
.monitor-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: #e2e8f0;
}

.control-bar {
  display: flex;
  align-items: center;
  gap: 16px;
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  border-radius: 4px;
  border: none;
  background-color: #334155;
  color: #e2e8f0;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:hover {
  background-color: #475569;
}

.btn .material-icons {
  font-size: 18px;
  margin-right: 4px;
}

.clear-btn {
  background-color: #4b5563;
}

.record-btn {
  background-color: #1e40af;
}

.record-btn.active {
  background-color: #dc2626;
}

.format-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: #1a202c;
  border-radius: 4px;
  padding: 4px 8px;
  border: 1px solid #334155;
}

.format-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 2px;
}

.format-label:hover {
  background-color: #334155;
}

.format-label input {
  margin-right: 4px;
}

.monitor-container {
  display: flex;
  flex: 1;
  gap: 16px;
  height: calc(100% - 52px);
}

.connection-panel {
  width: 300px;
  background-color: #1a202c;
  border-radius: 8px;
  border: 1px solid #334155;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #334155;
}

.selector-title {
  font-size: 16px;
  font-weight: 600;
  color: #e2e8f0;
  margin: 0;
}

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: none;
  background-color: #334155;
  color: #e2e8f0;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-btn:hover {
  background-color: #475569;
}

.port-list {
  max-height: 200px;
  overflow-y: auto;
  border-bottom: 1px solid #334155;
}

.port-item {
  display: flex;
  flex-direction: column;
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 1px solid #334155;
  transition: all 0.2s;
}

.port-item:last-child {
  border-bottom: none;
}

.port-item:hover {
  background-color: #334155;
}

.port-item.selected {
  background-color: #3b82f6;
}

.port-name {
  font-weight: 500;
  margin-bottom: 2px;
}

.port-info {
  font-size: 12px;
  color: #94a3b8;
}

.port-settings {
  padding: 16px;
  border-bottom: 1px solid #334155;
}

.settings-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.settings-item:last-child {
  margin-bottom: 0;
}

.settings-item label {
  font-size: 14px;
  color: #94a3b8;
}

.settings-item select {
  width: 120px;
  background-color: #334155;
  border: none;
  border-radius: 4px;
  padding: 6px 8px;
  color: #e2e8f0;
}

.connection-control {
  padding: 16px;
  margin-top: auto;
}

.connect-btn {
  width: 100%;
  padding: 10px;
  font-weight: 500;
  background-color: #3b82f6;
}

.connect-btn:hover {
  background-color: #2563eb;
}

.connect-btn.connected {
  background-color: #6b7280;
}

.data-monitor {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: #1a202c;
  border-radius: 8px;
  border: 1px solid #334155;
  overflow: hidden;
}

.monitor-header {
  padding: 12px 16px;
  border-bottom: 1px solid #334155;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tab-navigation {
  display: flex;
  gap: 2px;
}

.tab-btn {
  padding: 8px 16px;
  background-color: #334155;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s;
  border-radius: 4px;
}

.tab-btn:hover {
  background-color: #475569;
  color: #e2e8f0;
}

.tab-btn.active {
  background-color: #3b82f6;
  color: #e2e8f0;
}

.monitor-tools {
  display: flex;
  align-items: center;
  gap: 16px;
}

.auto-scroll {
  display: flex;
  align-items: center;
}

.toggle-label {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.toggle-label input {
  margin-right: 6px;
}

.search-container {
  display: flex;
  align-items: center;
  gap: 4px;
}

.search-input {
  background-color: #334155;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  color: #e2e8f0;
  width: 200px;
}

.search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  border: none;
  background-color: #334155;
  color: #e2e8f0;
  cursor: pointer;
}

.search-btn:hover {
  background-color: #475569;
}

.data-view {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  font-family: "Consolas", "Monaco", monospace;
  font-size: 14px;
}

.data-entry {
  display: flex;
  align-items: center;
  padding: 4px 0;
  border-bottom: 1px solid #233046;
}

.data-entry:last-child {
  border-bottom: none;
}

.entry-timestamp {
  width: 120px;
  color: #94a3b8;
}

.entry-direction {
  width: 24px;
  text-align: center;
  font-weight: bold;
  margin: 0 8px;
}

.entry-direction.rx {
  color: #10b981;
}

.entry-direction.tx {
  color: #3b82f6;
}

.entry-data {
  flex: 1;
  word-break: break-all;
}

.entry-data.highlight {
  background-color: rgba(245, 158, 11, 0.3);
  border-radius: 2px;
  padding: 2px 4px;
  margin: -2px -4px;
}
</style>
