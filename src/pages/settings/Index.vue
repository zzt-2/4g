<template>
  <div class="settings-page">
    <div class="page-header">
      <h1 class="page-title">系统设置</h1>
    </div>

    <div class="settings-container">
      <div class="settings-sidebar">
        <div class="settings-nav">
          <button
            v-for="section in settingSections"
            :key="section.id"
            class="nav-item"
            :class="{ active: activeSection === section.id }"
            @click="activeSection = section.id"
          >
            <span class="material-icons">{{ section.icon }}</span>
            <span>{{ section.name }}</span>
          </button>
        </div>
      </div>

      <div class="settings-content">
        <!-- 串口设置 -->
        <div v-if="activeSection === 'serial'" class="settings-section">
          <h2 class="section-title">串口设置</h2>

          <div class="settings-card">
            <h3 class="card-title">默认串口参数</h3>

            <div class="form-group">
              <label for="defaultBaudRate">默认波特率</label>
              <select
                id="defaultBaudRate"
                v-model="serialSettings.defaultBaudRate"
              >
                <option v-for="rate in baudRates" :key="rate" :value="rate">
                  {{ rate }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label for="defaultDataBits">默认数据位</label>
              <select
                id="defaultDataBits"
                v-model="serialSettings.defaultDataBits"
              >
                <option value="5">5</option>
                <option value="6">6</option>
                <option value="7">7</option>
                <option value="8">8</option>
              </select>
            </div>

            <div class="form-group">
              <label for="defaultParity">默认校验位</label>
              <select id="defaultParity" v-model="serialSettings.defaultParity">
                <option value="none">无校验</option>
                <option value="even">偶校验</option>
                <option value="odd">奇校验</option>
                <option value="mark">标记校验</option>
                <option value="space">空格校验</option>
              </select>
            </div>

            <div class="form-group">
              <label for="defaultStopBits">默认停止位</label>
              <select
                id="defaultStopBits"
                v-model="serialSettings.defaultStopBits"
              >
                <option value="1">1</option>
                <option value="1.5">1.5</option>
                <option value="2">2</option>
              </select>
            </div>

            <div class="form-group">
              <label for="defaultFlowControl">默认流控制</label>
              <select
                id="defaultFlowControl"
                v-model="serialSettings.defaultFlowControl"
              >
                <option value="none">无</option>
                <option value="hardware">硬件流控</option>
                <option value="software">软件流控</option>
              </select>
            </div>
          </div>

          <div class="settings-card">
            <h3 class="card-title">串口监视器设置</h3>

            <div class="form-group">
              <label for="maxBufferSize">最大缓冲区大小 (行)</label>
              <input
                type="number"
                id="maxBufferSize"
                v-model.number="serialSettings.maxBufferSize"
                min="100"
                max="10000"
                step="100"
              />
              <div class="form-hint">超过此值时将清除最早的数据</div>
            </div>

            <div class="option-item">
              <div class="option-label">
                <span>默认启用自动滚动</span>
              </div>
              <label class="switch">
                <input
                  type="checkbox"
                  v-model="serialSettings.defaultAutoScroll"
                />
                <span class="slider round"></span>
              </label>
            </div>

            <div class="option-item">
              <div class="option-label">
                <span>自动重连</span>
                <div class="tooltip">
                  <span class="material-icons info-icon">info</span>
                  <div class="tooltip-text">串口断开后自动尝试重新连接</div>
                </div>
              </div>
              <label class="switch">
                <input type="checkbox" v-model="serialSettings.autoReconnect" />
                <span class="slider round"></span>
              </label>
            </div>
          </div>
        </div>

        <!-- 界面设置 -->
        <div v-if="activeSection === 'appearance'" class="settings-section">
          <h2 class="section-title">界面设置</h2>

          <div class="settings-card">
            <h3 class="card-title">主题设置</h3>

            <div class="theme-selector">
              <div
                v-for="theme in themes"
                :key="theme.id"
                class="theme-option"
                :class="{ active: appearanceSettings.theme === theme.id }"
                @click="appearanceSettings.theme = theme.id"
              >
                <div
                  class="theme-preview"
                  :style="{ backgroundColor: theme.backgroundColor }"
                >
                  <div
                    class="theme-header"
                    :style="{ backgroundColor: theme.headerColor }"
                  ></div>
                  <div
                    class="theme-sidebar"
                    :style="{ backgroundColor: theme.sidebarColor }"
                  ></div>
                  <div
                    class="theme-content"
                    :style="{ backgroundColor: theme.contentColor }"
                  ></div>
                </div>
                <div class="theme-name">{{ theme.name }}</div>
              </div>
            </div>

            <div class="form-group">
              <label for="fontSize">字体大小</label>
              <div class="range-control">
                <input
                  type="range"
                  id="fontSize"
                  v-model.number="appearanceSettings.fontSize"
                  min="12"
                  max="20"
                  step="1"
                />
                <span class="range-value"
                  >{{ appearanceSettings.fontSize }}px</span
                >
              </div>
            </div>
          </div>

          <div class="settings-card">
            <h3 class="card-title">显示选项</h3>

            <div class="option-item">
              <div class="option-label">
                <span>显示状态栏</span>
              </div>
              <label class="switch">
                <input
                  type="checkbox"
                  v-model="appearanceSettings.showStatusBar"
                />
                <span class="slider round"></span>
              </label>
            </div>

            <div class="option-item">
              <div class="option-label">
                <span>显示工具提示</span>
              </div>
              <label class="switch">
                <input
                  type="checkbox"
                  v-model="appearanceSettings.showTooltips"
                />
                <span class="slider round"></span>
              </label>
            </div>

            <div class="option-item">
              <div class="option-label">
                <span>紧凑模式</span>
                <div class="tooltip">
                  <span class="material-icons info-icon">info</span>
                  <div class="tooltip-text">减少界面元素间距，显示更多内容</div>
                </div>
              </div>
              <label class="switch">
                <input
                  type="checkbox"
                  v-model="appearanceSettings.compactMode"
                />
                <span class="slider round"></span>
              </label>
            </div>
          </div>
        </div>

        <!-- 高级设置 -->
        <div v-if="activeSection === 'advanced'" class="settings-section">
          <h2 class="section-title">高级设置</h2>

          <div class="settings-card">
            <h3 class="card-title">性能选项</h3>

            <div class="form-group">
              <label for="frameUpdateInterval">界面刷新间隔 (毫秒)</label>
              <input
                type="number"
                id="frameUpdateInterval"
                v-model.number="advancedSettings.frameUpdateInterval"
                min="16"
                max="1000"
                step="16"
              />
              <div class="form-hint">较低的值会增加 CPU 使用率</div>
            </div>

            <div class="form-group">
              <label for="logLevel">日志级别</label>
              <select id="logLevel" v-model="advancedSettings.logLevel">
                <option value="error">错误</option>
                <option value="warn">警告</option>
                <option value="info">信息</option>
                <option value="debug">调试</option>
                <option value="verbose">详细</option>
              </select>
            </div>

            <div class="option-item">
              <div class="option-label">
                <span>启用硬件加速</span>
                <div class="tooltip">
                  <span class="material-icons info-icon">info</span>
                  <div class="tooltip-text">
                    使用 GPU 加速渲染，可能提高性能但增加内存使用
                  </div>
                </div>
              </div>
              <label class="switch">
                <input
                  type="checkbox"
                  v-model="advancedSettings.hardwareAcceleration"
                />
                <span class="slider round"></span>
              </label>
            </div>
          </div>

          <div class="settings-card">
            <h3 class="card-title">数据存储</h3>

            <div class="form-group">
              <label for="dataStoragePath">数据存储路径</label>
              <div class="path-input">
                <input
                  type="text"
                  id="dataStoragePath"
                  v-model="advancedSettings.dataStoragePath"
                  readonly
                />
                <button class="btn btn-secondary" @click="selectStoragePath">
                  <span class="material-icons">folder_open</span>
                </button>
              </div>
            </div>

            <div class="form-group">
              <label for="autoBackupInterval">自动备份间隔 (分钟)</label>
              <input
                type="number"
                id="autoBackupInterval"
                v-model.number="advancedSettings.autoBackupInterval"
                min="5"
                max="1440"
                step="5"
              />
              <div class="form-hint">设置为 0 禁用自动备份</div>
            </div>

            <div class="settings-actions">
              <button class="btn btn-secondary" @click="backupData">
                <span class="material-icons">backup</span>
                立即备份
              </button>

              <button class="btn btn-danger" @click="confirmResetSettings">
                <span class="material-icons">restore</span>
                重置所有设置
              </button>
            </div>
          </div>
        </div>

        <!-- 关于 -->
        <div v-if="activeSection === 'about'" class="settings-section">
          <h2 class="section-title">关于</h2>

          <div class="settings-card about-card">
            <div class="app-info">
              <div class="app-logo">
                <img src="../../assets/logo.png" alt="App Logo" />
              </div>
              <div class="app-details">
                <h3 class="app-name">RS485 上位机工具</h3>
                <div class="app-version">版本 1.0.0</div>
                <div class="app-copyright">© 2023 All Rights Reserved</div>
              </div>
            </div>

            <div class="about-description">
              <p>
                这是一个基于 Electron 和 Vue 开发的 RS485
                通信工具，用于与各种支持 Modbus 和自定义协议的 RS485
                设备进行通信。
              </p>
              <p>特色功能包括串口监控、命令控制、帧结构定义、数据解析等。</p>
            </div>

            <div class="tech-stack">
              <div class="tech-title">技术栈:</div>
              <div class="tech-list">
                <div class="tech-item">
                  <span class="tech-label">Electron</span>
                  <span class="tech-version">v22.0.0</span>
                </div>
                <div class="tech-item">
                  <span class="tech-label">Vue</span>
                  <span class="tech-version">v3.2.45</span>
                </div>
                <div class="tech-item">
                  <span class="tech-label">TypeScript</span>
                  <span class="tech-version">v4.9.4</span>
                </div>
                <div class="tech-item">
                  <span class="tech-label">Pinia</span>
                  <span class="tech-version">v2.0.28</span>
                </div>
                <div class="tech-item">
                  <span class="tech-label">SerialPort</span>
                  <span class="tech-version">v10.5.0</span>
                </div>
              </div>
            </div>

            <div class="about-actions">
              <button class="btn btn-primary" @click="openGithub">
                <span class="material-icons">code</span>
                项目仓库
              </button>

              <button class="btn btn-secondary" @click="checkForUpdates">
                <span class="material-icons">update</span>
                检查更新
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 重置确认对话框 -->
    <div v-if="showResetConfirm" class="dialog-backdrop" @click="cancelReset">
      <div class="dialog-container" @click.stop>
        <div class="dialog-header">
          <h3>确认重置设置</h3>
          <button class="close-btn" @click="cancelReset">
            <span class="material-icons">close</span>
          </button>
        </div>
        <div class="dialog-content">
          <p>确定要重置所有设置到默认值吗？</p>
          <p class="warning-text">此操作无法撤销，所有自定义设置将丢失。</p>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-secondary" @click="cancelReset">取消</button>
          <button class="btn btn-danger" @click="resetSettings">重置</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";

// 设置部分
const settingSections = [
  { id: "serial", name: "串口设置", icon: "settings_ethernet" },
  { id: "appearance", name: "界面设置", icon: "palette" },
  { id: "advanced", name: "高级设置", icon: "tune" },
  { id: "about", name: "关于", icon: "info" },
];

const activeSection = ref("serial");

// 串口设置
const baudRates = [
  300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 38400, 57600, 115200, 128000,
  256000,
];

const serialSettings = reactive({
  defaultBaudRate: 9600,
  defaultDataBits: 8,
  defaultParity: "none",
  defaultStopBits: 1,
  defaultFlowControl: "none",
  maxBufferSize: 1000,
  defaultAutoScroll: true,
  autoReconnect: true,
});

// 界面设置
const themes = [
  {
    id: "dark",
    name: "深色主题",
    backgroundColor: "#121212",
    headerColor: "#1E1E1E",
    sidebarColor: "#1A1A1A",
    contentColor: "#232323",
  },
  {
    id: "blue",
    name: "蓝色主题",
    backgroundColor: "#0A1929",
    headerColor: "#0D2341",
    sidebarColor: "#0B1C33",
    contentColor: "#0E2A4B",
  },
  {
    id: "green",
    name: "绿色主题",
    backgroundColor: "#0A1F1A",
    headerColor: "#0D3325",
    sidebarColor: "#0B1F15",
    contentColor: "#0E382A",
  },
  {
    id: "light",
    name: "浅色主题",
    backgroundColor: "#F5F5F5",
    headerColor: "#FFFFFF",
    sidebarColor: "#EEEEEE",
    contentColor: "#FFFFFF",
  },
];

const appearanceSettings = reactive({
  theme: "dark",
  fontSize: 14,
  showStatusBar: true,
  showTooltips: true,
  compactMode: false,
});

// 高级设置
const advancedSettings = reactive({
  frameUpdateInterval: 64,
  logLevel: "info",
  hardwareAcceleration: true,
  dataStoragePath: "/users/data",
  autoBackupInterval: 30,
});

// 重置确认
const showResetConfirm = ref(false);

// 方法
const selectStoragePath = () => {
  // 使用 Electron 的对话框 API 选择目录
  console.log("选择数据存储路径");
};

const backupData = () => {
  console.log("正在备份数据...");
  // 这里应该调用备份 API
  setTimeout(() => {
    alert("数据备份成功");
  }, 1000);
};

const confirmResetSettings = () => {
  showResetConfirm.value = true;
};

const cancelReset = () => {
  showResetConfirm.value = false;
};

const resetSettings = () => {
  // 重置所有设置到默认值
  console.log("重置所有设置");
  showResetConfirm.value = false;

  // 这里应该调用重置 API
  setTimeout(() => {
    alert("设置已重置为默认值");
  }, 500);
};

const openGithub = () => {
  // 使用 Electron 的 shell API 打开浏览器
  console.log("打开 GitHub 仓库");
};

const checkForUpdates = () => {
  console.log("检查更新...");
  // 这里应该调用更新检查 API
  setTimeout(() => {
    alert("您的应用已是最新版本");
  }, 1500);
};
</script>

<style scoped>
.settings-page {
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

.settings-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.settings-sidebar {
  width: 220px;
  padding-right: 16px;
}

.settings-nav {
  background-color: #1a202c;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #334155;
}

.nav-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  width: 100%;
  border: none;
  background: none;
  color: #94a3b8;
  text-align: left;
  cursor: pointer;
  border-bottom: 1px solid #2d3748;
  transition: all 0.2s;
}

.nav-item:last-child {
  border-bottom: none;
}

.nav-item:hover {
  background-color: #2d3748;
  color: #e2e8f0;
}

.nav-item.active {
  background-color: #2c5282;
  color: white;
}

.nav-item .material-icons {
  margin-right: 12px;
  font-size: 20px;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding-right: 16px;
}

.settings-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 16px;
}

.settings-card {
  background-color: #1a202c;
  border-radius: 8px;
  padding: 16px;
  border: 1px solid #334155;
  margin-bottom: 16px;
}

.settings-card:last-child {
  margin-bottom: 0;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #e2e8f0;
  margin-top: 0;
  margin-bottom: 16px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  color: #94a3b8;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 8px 12px;
  background-color: #233046;
  border: 1px solid #334155;
  border-radius: 4px;
  color: #e2e8f0;
  font-size: 14px;
}

.form-hint {
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}

.option-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.option-item:last-child {
  margin-bottom: 0;
}

.option-label {
  display: flex;
  align-items: center;
  font-size: 14px;
  color: #e2e8f0;
}

.tooltip {
  position: relative;
  display: inline-block;
  margin-left: 6px;
}

.info-icon {
  font-size: 16px;
  color: #64748b;
  cursor: help;
}

.tooltip-text {
  visibility: hidden;
  width: 200px;
  background-color: #0f172a;
  color: #e2e8f0;
  text-align: center;
  border-radius: 6px;
  padding: 8px;
  position: absolute;
  z-index: 1;
  bottom: 125%;
  left: 50%;
  margin-left: -100px;
  opacity: 0;
  transition: opacity 0.3s;
  font-size: 12px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}

.tooltip:hover .tooltip-text {
  visibility: visible;
  opacity: 1;
}

.switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 20px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #334155;
  transition: 0.4s;
}

.slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  transition: 0.4s;
}

input:checked + .slider {
  background-color: #3b82f6;
}

input:checked + .slider:before {
  transform: translateX(20px);
}

.slider.round {
  border-radius: 20px;
}

.slider.round:before {
  border-radius: 50%;
}

.range-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.range-control input {
  flex: 1;
}

.range-value {
  width: 50px;
  text-align: right;
  font-size: 14px;
  color: #e2e8f0;
}

.path-input {
  display: flex;
  gap: 8px;
}

.path-input input {
  flex: 1;
}

.path-input button {
  padding: 8px;
}

.path-input .material-icons {
  font-size: 18px;
}

.settings-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.btn {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn .material-icons {
  font-size: 18px;
  margin-right: 6px;
}

.btn-primary {
  background-color: #3b82f6;
  color: white;
}

.btn-primary:hover {
  background-color: #2563eb;
}

.btn-secondary {
  background-color: #475569;
  color: white;
}

.btn-secondary:hover {
  background-color: #64748b;
}

.btn-danger {
  background-color: #ef4444;
  color: white;
}

.btn-danger:hover {
  background-color: #dc2626;
}

.theme-selector {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.theme-option {
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.theme-option.active {
  border-color: #3b82f6;
}

.theme-preview {
  height: 80px;
  position: relative;
  padding: 6px;
}

.theme-header {
  height: 12px;
  width: 100%;
  border-radius: 4px;
  margin-bottom: 6px;
}

.theme-sidebar {
  position: absolute;
  left: 6px;
  top: 24px;
  bottom: 6px;
  width: 20px;
  border-radius: 4px;
}

.theme-content {
  position: absolute;
  left: 32px;
  right: 6px;
  top: 24px;
  bottom: 6px;
  border-radius: 4px;
}

.theme-name {
  text-align: center;
  font-size: 12px;
  padding: 6px;
  color: #94a3b8;
}

/* 关于页面样式 */
.about-card {
  padding: 24px;
}

.app-info {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}

.app-logo {
  width: 64px;
  height: 64px;
  margin-right: 16px;
  background-color: #2c5282;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-logo img {
  width: 80%;
  height: 80%;
}

.app-name {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 4px 0;
}

.app-version {
  font-size: 14px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.app-copyright {
  font-size: 12px;
  color: #64748b;
}

.about-description {
  margin-bottom: 20px;
  color: #94a3b8;
  line-height: 1.5;
}

.about-description p {
  margin-bottom: 8px;
}

.tech-stack {
  margin-bottom: 24px;
}

.tech-title {
  font-weight: 600;
  margin-bottom: 8px;
  color: #e2e8f0;
}

.tech-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.tech-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background-color: #233046;
  border-radius: 20px;
  font-size: 12px;
}

.tech-label {
  font-weight: 600;
  color: #e2e8f0;
}

.tech-version {
  color: #94a3b8;
}

.about-actions {
  display: flex;
  gap: 12px;
}

/* 对话框样式 */
.dialog-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-container {
  width: 400px;
  background-color: #1a202c;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #334155;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  border: none;
  background-color: transparent;
  color: #cbd5e1;
  cursor: pointer;
}

.close-btn:hover {
  background-color: #2d3748;
}

.dialog-content {
  padding: 24px 16px;
}

.warning-text {
  color: #ef4444;
  font-size: 14px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid #334155;
}
</style>
