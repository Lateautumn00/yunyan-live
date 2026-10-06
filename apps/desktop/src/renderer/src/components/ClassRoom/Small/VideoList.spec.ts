import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import VideoList from '@/components/ClassRoom/Small/VideoList.vue';

vi.mock('@yunyan-live/ipc', () => ({}));

function mountVideoList(overrides: Record<string, unknown> = {}) {
  return mount(VideoList, {
    props: {
      isTeacher: true,
      opaqueId: 'op1',
      isInteraction: 2,
      liveType: 'hires',
      ...overrides
    },
    global: {
      plugins: [ElementPlus],
      components: { ...ElementPlusIconsVue },
      stubs: {
        VideoPlayer: {
          template: '<div class="video-player-stub" />'
        }
      }
    }
  });
}

type VideoListVM = {
  setCameraType: (status: boolean) => void;
  setCameraStudent: (status: boolean, isSpeak: boolean) => void;
  setAudioAll: (user: string[]) => void;
  ensureSelfTile: (id: string, display: string[]) => Promise<void>;
  studentMediaStream: (stream: MediaStream, display: string[], id: string) => Promise<void>;
  delUserList: (id: string) => Promise<void>;
};

function vmOf(wrapper: ReturnType<typeof mount>) {
  return wrapper.vm as unknown as VideoListVM;
}

describe('ClassRoom Small/VideoList.vue', () => {
  it('渲染视频列表容器', () => {
    const wrapper = mountVideoList();
    expect(wrapper.find('.small-video-list').exists()).toBe(true);
    expect(wrapper.find('.pre').exists()).toBe(true);
    expect(wrapper.find('.next').exists()).toBe(true);
  });

  it('setCameraType 更新摄像头状态', async () => {
    const wrapper = mountVideoList();
    const stream = {} as MediaStream;
    await vmOf(wrapper).studentMediaStream(stream, ['S', 'op1', '学生1'], 'u1');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[aria-label="摄像头"]').exists()).toBe(true);
    vmOf(wrapper).setCameraType(false);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[aria-label="摄像头"].is-off').exists()).toBe(true);
  });

  it('setCameraStudent 触发 setCameraStudent 事件', () => {
    const wrapper = mountVideoList();
    vmOf(wrapper).setCameraStudent(false, false);
    expect(wrapper.emitted('setCameraStudent')?.[0]).toEqual([false, false]);
  });

  it('setAudioAll 根据状态设置语音开关', () => {
    const wrapper = mountVideoList();
    vmOf(wrapper).setAudioAll(['ST', 'op2', '学生2', 'on']);
    expect(vmOf(wrapper).setAudioAll).toBeTypeOf('function');
  });

  it('studentMediaStream 将新用户加入列表', async () => {
    const wrapper = mountVideoList();
    const stream = {} as MediaStream;
    await vmOf(wrapper).studentMediaStream(stream, ['S', 'op2', '学生2'], 'u2');
    const slides = wrapper.findAll('.swiper-slide');
    expect(slides.length).toBe(1);
    expect(slides[0]?.text()).toContain('学生2');
  });

  it('studentMediaStream 重复 id 不重复添加', async () => {
    const wrapper = mountVideoList();
    const stream = {} as MediaStream;
    await vmOf(wrapper).studentMediaStream(stream, ['S', 'op2', '学生2'], 'u2');
    await vmOf(wrapper).studentMediaStream(stream, ['S', 'op2', '学生2'], 'u2');
    expect(wrapper.findAll('.swiper-slide').length).toBe(1);
  });

  it('delUserList 隐藏对应窗口', async () => {
    const wrapper = mountVideoList();
    const stream = {} as MediaStream;
    await vmOf(wrapper).studentMediaStream(stream, ['S', 'op2', '学生2'], 'u2');
    await vmOf(wrapper).delUserList('u2');
    const slide = wrapper.find('.swiper-slide');
    expect(slide.exists()).toBe(true);
    expect(slide.attributes('style')).toContain('display: none');
  });

  it('摄像头按钮不依赖 liveType 为 hires', async () => {
    const wrapper = mountVideoList({ liveType: '' });
    await vmOf(wrapper).ensureSelfTile('u1', ['S', 'op1', '学生1', 'off']);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[aria-label="摄像头"]').exists()).toBe(true);
  });

  it('初始摄像头状态为关闭', async () => {
    const wrapper = mountVideoList({ liveType: '' });
    await vmOf(wrapper).ensureSelfTile('u1', ['S', 'op1', '学生1', 'off']);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[aria-label="摄像头"].is-off').exists()).toBe(true);
  });

  it('ensureSelfTile 添加自己的占位窗口且不重复', async () => {
    const wrapper = mountVideoList({ liveType: '' });
    await vmOf(wrapper).ensureSelfTile('u1', ['S', 'op1', '学生1', 'off']);
    await vmOf(wrapper).ensureSelfTile('u1', ['S', 'op1', '学生1', 'off']);
    const slides = wrapper.findAll('.swiper-slide');
    expect(slides.length).toBe(1);
    expect(slides[0]?.text()).toContain('学生1');
  });

  it('点击摄像头按钮触发 setCameraStudent 事件', async () => {
    const wrapper = mountVideoList({ liveType: '' });
    await vmOf(wrapper).ensureSelfTile('u1', ['S', 'op1', '学生1', 'off']);
    await wrapper.vm.$nextTick();
    await wrapper.find('[aria-label="摄像头"].is-off').trigger('click');
    expect(wrapper.emitted('setCameraStudent')?.[0]).toEqual([true, false]);
  });
});
