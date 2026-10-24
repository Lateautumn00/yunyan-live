import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import type { PluginOption } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';

const workspacePackages = [
  '@yunyan-live/config',
  '@yunyan-live/http',
  '@yunyan-live/ipc',
  '@yunyan-live/types',
  '@yunyan-live/utils',
  '@yunyan-live/validation'
];

export const rendererConfig = {
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '~@': resolve('src/renderer/src')
    }
  },
  plugins: [
    vue(),
    AutoImport({
      imports: ['vue', 'vue-router'],
      resolvers: [ElementPlusResolver({ importStyle: false })],
      dts: 'src/types/auto-imports.d.ts'
    }),
    Components({
      resolvers: [ElementPlusResolver({ importStyle: false })],
      dts: 'src/types/components.d.ts'
    })
    // monorepo 里同时存在多份 vite（admin/web 用 8.x），unplugin 解析到的 Plugin 与本包
    // 的 Plugin 结构等价但类型标识不同；运行时无差异，此处按本包 vite 的 PluginOption 断言。
  ] as PluginOption[],
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true
      }
    }
  }
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    resolve: {
      alias: {
        '@': resolve('src/main')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    resolve: {
      alias: {
        '@': resolve('src/preload')
      }
    }
  },
  renderer: rendererConfig
});
