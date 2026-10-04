import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // vitest 4 默认 exclude 不再包含 dist；nest build 构建产物可能混入 spec，显式排除
    exclude: [...configDefaults.exclude, '**/dist/**'],
    environment: 'node'
  }
});
