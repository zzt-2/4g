import { defineConfig, presetUno, presetAttributify, presetIcons } from 'unocss';

export default defineConfig({
  // 使用预设
  presets: [
    presetUno(), // 基础预设
    presetAttributify(), // 启用属性模式
    presetIcons(), // 图标支持
  ],
  // 自定义规则
  rules: [
    // 可以添加自定义规则
  ],
  // 主题配置
  theme: {
    colors: {
      primary: '#1976D2', // Quasar 主题色
      secondary: '#26A69A',
      accent: '#9C27B0',
      dark: '#1d1d1d',
      'dark-page': '#121212',
      positive: '#21BA45',
      negative: '#C10015',
      info: '#31CCEC',
      warning: '#F2C037',
    },
  },
  // 快捷方式
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
    'grid-center': 'grid place-items-center',
    // === 基础安全容器 ===
    'container-safe': 'w-full h-full overflow-hidden',
    'flex-col-safe': 'flex flex-col overflow-hidden h-full',
    'flex-row-safe': 'flex flex-row overflow-hidden w-full',
    'flex-content-safe': 'flex flex-col overflow-auto min-h-0 min-w-0',
    'panel-safe': 'bg-dark-800 border border-gray-700 rounded-md p-4 overflow-hidden',

    // === 滚动容器 ===
    'scroll-y-container': 'overflow-y-auto overflow-x-hidden min-h-0',
    'scroll-x-container': 'overflow-x-auto overflow-y-hidden min-w-0',
    'fixed-height-container': 'overflow-auto min-h-0 h-full',

    // === flex 子项控制 ===
    'flex-child-fixed': 'flex-shrink-0 flex-grow-0',
    'flex-child-adaptive': 'flex-shrink-1 flex-grow-1 min-h-0 min-w-0',
    'flex-child-shrink': 'flex-shrink-1 flex-grow-0 min-h-0 min-w-0',
    'flex-child-grow': 'flex-shrink-0 flex-grow-1',

    // === 高度分配 ===
    'h-header': 'h-16 flex-shrink-0',
    'h-subheader': 'h-12 flex-shrink-0',
    'h-footer': 'h-12 flex-shrink-0',
    'h-content': 'flex-grow-1 min-h-0 overflow-auto',

    // === 宽度分配 ===
    'w-sidebar': 'w-64 flex-shrink-0',
    'w-detail': 'w-80 flex-shrink-0',
    'w-content': 'flex-grow-1 min-w-0',

    // === 常见布局组合 ===
    'layout-vertical': 'flex-col-safe',
    'layout-horizontal': 'flex-row-safe',
    'layout-panel': 'panel-safe min-h-0 overflow-hidden',
    'layout-table': 'w-full min-h-0 flex flex-col',
    'table-container': 'min-h-0 overflow-auto',
    'tabs-content': 'min-h-0 overflow-auto flex-grow-1',

    // === 工业面板样式 ===
    'industrial-panel': 'bg-dark-800 border border-gray-700 rounded-md p-4',
    'data-table': 'w-full border-collapse',
    'table-header': 'bg-dark-700 text-white font-medium p-x-3 p-y-2 text-left',
    'table-cell': 'p-x-3 p-y-2 border-b border-gray-700',
    'table-row': 'hover:bg-white/5',

    // === 按钮样式 ===
    'btn-primary':
      'px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors',
    'btn-secondary':
      'px-4 py-2 bg-transparent border border-gray-600 text-gray-100 rounded-md hover:bg-white/5 transition-colors',

    // === 状态指示 ===
    'status-online': 'text-emerald-500',
    'status-offline': 'text-rose-500',
    'status-pending': 'text-amber-500',
    'status-badge': 'px-2 py-0.5 rounded-full text-xs inline-flex items-center',
  },
  // 安全列表 - 防止类名被清除
  safelist: [
    // 防止Quasar框架的一些类被清除
    'q-layout',
    'q-page-container',
    'q-page',
    'q-header',
    'q-footer',
    'q-drawer',
    'q-toolbar',
  ],
});
