import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // vitest 4 默认 exclude 不再包含 dist；tsc 构建产物可能混入 spec，显式排除
    exclude: [...configDefaults.exclude, '**/dist/**'],
    // beforeAll 需冷加载 nest-shared/koa 模块图；本工作区位于 /mnt/e（DrvFs），
    // 文件元数据延迟使该加载可达 ~30s（原生 node 导入 koa 亦 >3s），默认 15s 不足
    hookTimeout: 60000,
    teardownTimeout: 60000
  }
});
