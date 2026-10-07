import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '~@': resolve('src/renderer/src')
    }
  },
  test: {
    environment: 'jsdom',
    include: ['src/renderer/**/*.spec.ts'],
    setupFiles: [resolve('src/renderer/src/testing/setup.ts')],
    // WSL/drvfs 高 I/O 延迟：16 核默认 15 forks 会超时 worker 启动，限流保证稳定
    maxWorkers: 4,
    minWorkers: 1
  }
});
