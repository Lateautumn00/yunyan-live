/// <reference types="vite/client" />
/// <reference types="element-plus/global" />

declare module '*.wav' {
  const src: string;
  export default src;
}

import type { ElectronApi } from '@yunyan-live/ipc';

declare global {
  interface Window {
    electronAPI: ElectronApi;
  }
}

export {};
