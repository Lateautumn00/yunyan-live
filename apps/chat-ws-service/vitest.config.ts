import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 方案 §7：锁定收集范围，避免 dist/tsc 构建产物混入（vitest 4 默认 exclude 不含 dist）
    include: ['src/**/*.spec.ts']
  }
});
