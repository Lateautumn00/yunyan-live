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
    environment: 'happy-dom',
    include: ['src/renderer/**/*.spec.ts']
  }
});
