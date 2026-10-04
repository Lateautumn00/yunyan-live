import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import {
  createMemoryHistory,
  createRouter,
  type LocationQueryRaw,
  type RouteRecordRaw,
  type Router
} from 'vue-router';
import { createPinia, type Pinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import type { Component } from 'vue';

export interface MountPageOptions {
  routes?: RouteRecordRaw[];
  initialRoute?: string | { path: string; query?: LocationQueryRaw };
  beforeMount?: (pinia: Pinia) => void | Promise<void>;
}

export function ok<T>(data: T) {
  return { code: 1000, msg: undefined, data };
}

export async function mountPage(
  component: Component,
  options: MountPageOptions = {}
): Promise<{ wrapper: VueWrapper; router: Router }> {
  const pinia = createPinia();
  await options.beforeMount?.(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: options.routes ?? []
  });
  if (options.initialRoute !== undefined) {
    await router.push(options.initialRoute);
    await router.isReady();
  }
  const wrapper = mount(component, {
    global: {
      plugins: [pinia, router, ElementPlus],
      components: { ...ElementPlusIconsVue }
    }
  });
  await flushPromises();
  return { wrapper, router };
}
