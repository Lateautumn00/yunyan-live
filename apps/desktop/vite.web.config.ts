import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { rendererConfig } from './electron.vite.config';

export default defineConfig({
  root: resolve('src/renderer'),
  envDir: resolve('.'),
  server: { port: 5173 },
  ...rendererConfig
});
