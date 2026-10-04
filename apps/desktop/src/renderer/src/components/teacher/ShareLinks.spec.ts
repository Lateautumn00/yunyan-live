import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import type { ElectronApi } from '@yunyan-live/ipc';
import { ok } from '@/testing/utils';
import ShareLinks from '@/components/teacher/ShareLinks.vue';

const mocks = vi.hoisted(() => ({
  updateCode: vi.fn(),
  clipboardWriteText: vi.fn()
}));

vi.mock('@/api/backstage', () => ({
  default: {
    update_code: (params: unknown) => mocks.updateCode(params)
  }
}));

async function mountLinks() {
  const wrapper = mount(ShareLinks, {
    props: { roomId: 'R1', joinCode: 'CODE001' },
    global: {
      plugins: [ElementPlus],
      components: { ...ElementPlusIconsVue }
    }
  });
  await flushPromises();
  return wrapper;
}

function findButton(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('button').find(b => b.text().includes(text));
}

beforeEach(() => {
  mocks.updateCode.mockResolvedValue(ok('NEW123'));
  Object.assign(window, {
    electronAPI: {
      clipboardWriteText: mocks.clipboardWriteText
    } as unknown as ElectronApi
  });
});

describe('components/teacher/ShareLinks.vue', () => {
  it('复制参加码调用剪贴板', async () => {
    const wrapper = await mountLinks();
    expect(wrapper.text()).toContain('CODE001');
    await wrapper.find('.code .copy').trigger('click');
    await flushPromises();
    expect(mocks.clipboardWriteText).toHaveBeenCalledWith('CODE001');
    expect(document.body.textContent).toContain('复制成功');
  });

  it('更新参加码调用 API 并 emit updated', async () => {
    const wrapper = await mountLinks();
    await findButton(wrapper, '更新参加码')?.trigger('click');
    await flushPromises();
    expect(mocks.updateCode).toHaveBeenCalledWith({ roomId: 'R1' });
    expect(wrapper.emitted('updated')?.[0]).toEqual(['NEW123']);
    expect(wrapper.text()).toContain('NEW123');
    expect(document.body.textContent).toContain('更新成功');
  });
});
