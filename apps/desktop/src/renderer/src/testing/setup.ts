import { beforeEach, vi } from 'vitest';
import { config } from '@vue/test-utils';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';

config.global.components = {
  ...config.global.components,
  ...ElementPlusIconsVue
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
