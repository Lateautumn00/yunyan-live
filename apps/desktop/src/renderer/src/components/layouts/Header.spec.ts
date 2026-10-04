import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import type { ElectronApi } from '@yunyan-live/ipc';
import Header from '@/components/layouts/Header.vue';
import { useUserStore } from '@/store/user';

vi.mock('@/api', () => ({
  default: {
    user_logout: () => Promise.resolve({ code: 1000 }),
    user_login: () => Promise.resolve({ code: 1000 }),
    user_msg: () => Promise.resolve({ code: 1000 })
  }
}));

async function mountHeader(userName: string) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useUserStore();
  store.setUserInfo({ guid: 'G1', token: 'T1', userName, email: 'a@b.com', role: 2 });
  store.setToken('T1');
  store.setGuid('G1');

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(Header, {
    global: {
      plugins: [pinia, router, ElementPlus],
    }
  });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  Object.assign(window, {
    electronAPI: {
      openExternal: vi.fn(),
      clipboardWriteText: vi.fn(),
      onMessage: vi.fn(() => () => undefined)
    } as unknown as ElectronApi
  });
});

describe('Header.vue', () => {
  it('渲染用户名与欢迎语', async () => {
    const { wrapper } = await mountHeader('云砚老师');
    expect(wrapper.find('.login-name').text()).toBe('云砚老师');
    expect(wrapper.text()).toContain('欢迎您');
  });
});
