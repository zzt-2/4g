import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// vue() 让测试能 import .vue 文件。frame/index.ts 等 barrel re-export 了 .vue 组件
// (如 FrameSelector.vue),不带此插件会让所有 import 了这些 barrel 的测试
// (receive/runtime/storage 等纯 TS 逻辑测试)因 .vue 解析失败而集体跑不起来。
// 该插件已是 pnpm 依赖(vite-plugin-vue-devtools 间接拉入),此处只补注册。
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      src: fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts', 'src-electron/**/*.spec.ts'],
    testTimeout: 10000,
  },
});
