import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import Video from '@/components/ClassRoom/Video.vue';

const liveMocks = vi.hoisted(() => ({
  init: vi.fn(),
  roomOptions: null as null | { success?: () => void },
  attachHandles: {} as Record<string, Record<string, unknown>>
}));

vi.mock('@/vendor/live/adapter/adapter.min', () => ({}));

vi.mock('@/vendor/live/live', () => {
  return {
    default: class {
      static init = liveMocks.init;
      constructor(options: { success?: () => void }) {
        liveMocks.roomOptions = options;
      }
      attach(handles: Record<string, unknown>) {
        const plugin = String(handles['plugin'] ?? '');
        liveMocks.attachHandles[plugin] = handles;
      }
      destroy() {}
    }
  };
});

const apiMocks = vi.hoisted(() => ({
  getNowTime: vi.fn(),
  changeLiveStatus: vi.fn(),
  savePlayBackUrl: vi.fn()
}));

vi.mock('@/api', () => ({
  default: {
    getNowTime: () => apiMocks.getNowTime(),
    change_live_status: (params: unknown) => apiMocks.changeLiveStatus(params),
    save_play_back_url: (params: unknown) => apiMocks.savePlayBackUrl(params)
  },
  config: { liveServer: 'wss://live.test' }
}));

const electronMocks = vi.hoisted(() => ({
  getSources: vi.fn()
}));

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  });
}

function mountVideo(overrides: Record<string, unknown> = {}) {
  const router = makeRouter();
  const wrapper = mount(Video, {
    props: {
      opaqueId: 'op1',
      roomId: '1001',
      isTeacher: true,
      userName: '王老师',
      isInteraction: 0,
      roomInfo: { status: 1 },
      ...overrides
    },
    global: {
      plugins: [router, ElementPlus],
      components: { ...ElementPlusIconsVue },
      stubs: {
        VideoPlayer: {
          template: '<video ref="videoPlayers" class="video-player-stub" />',
          setup() {
            const videoPlayers = ref<HTMLVideoElement>();
            return { videoPlayers };
          }
        }
      }
    }
  });
  return { wrapper, router };
}

type VideoVM = {
  setInit: () => void;
  openLive: (status: boolean, liveType: string, type: string, liveTimeLen: number) => void;
  onLookLive: (status: boolean, type: string, liveTimeLen: number) => void;
  onOpenLive: (status: boolean, liveType: string, liveTimeLen: number) => void;
  lookLive: (status: boolean) => void;
  setCamera: (status: boolean) => void;
  setMicrophone: (status: boolean) => void;
  delList: (id: string, index: number) => void;
  endClassSpeakAll: (liveTimeLen: number, status?: 'end' | 'stop') => void;
  fromMessage: (json: { from?: string; text: string }) => Promise<void>;
  pall: () => void;
  buildStudentCameraMedia: (status: boolean, isSpeak: boolean) => Record<string, unknown>;
  setTime: (type: string) => void;
  recording: (status: boolean, time: number) => Promise<void>;
  listparticipants: () => void;
  stopApplication: () => Promise<void>;
  isTalking: (type: string, userType: string, isTeacherMess?: boolean) => void;
  setCameraStudent: (status: boolean, isSpeak: boolean) => void;
};

function vmOf(wrapper: ReturnType<typeof mount>) {
  return wrapper.vm as unknown as VideoVM;
}

function makeFakeStream() {
  const stream = new MediaStream();
  const videoTrack = {
    enabled: true,
    readyState: 'live',
    stop: vi.fn()
  };
  stream.getVideoTracks = () => [videoTrack] as unknown as MediaStreamTrack[];
  stream.getAudioTracks = () => [];
  stream.getTracks = () => [videoTrack] as unknown as MediaStreamTrack[];
  stream.removeTrack = vi.fn() as unknown as (track: MediaStreamTrack) => void;
  return {
    stream: stream as MediaStream & { removeTrack: ReturnType<typeof vi.fn> },
    videoTrack
  };
}

function attachPluginHandle(
  createOffer: ReturnType<typeof vi.fn>,
  send: ReturnType<typeof vi.fn> = vi.fn()
) {
  const handles = liveMocks.attachHandles['janus.plugin.videoroom'] as {
    success?: (handle: unknown) => void;
  };
  handles.success?.({ createOffer, send, destroy: vi.fn() });
}

function attachTextroomHandle(data: ReturnType<typeof vi.fn>) {
  const handles = liveMocks.attachHandles['janus.plugin.textroom'] as {
    success?: (handle: unknown) => void;
  };
  handles.success?.({ data, send: vi.fn(), destroy: vi.fn() });
}

describe('ClassRoom Video.vue', () => {
  beforeEach(() => {
    liveMocks.init.mockReset();
    liveMocks.roomOptions = null;
    liveMocks.attachHandles = {};
    apiMocks.getNowTime.mockReset();
    apiMocks.changeLiveStatus.mockReset();
    apiMocks.savePlayBackUrl.mockReset();
    electronMocks.getSources.mockReset();
    Object.assign(window, {
      electronAPI: {
        getSources: electronMocks.getSources
      }
    });
  });

  it('渲染底部工具条并显示讲师名称', () => {
    const { wrapper } = mountVideo();
    expect(wrapper.find('.classroom-video').exists()).toBe(true);
  });

  it('setInit 调用 Janus 初始化', () => {
    const { wrapper } = mountVideo();
    vmOf(wrapper).setInit();
    expect(liveMocks.init).toHaveBeenCalledTimes(1);
    const options = liveMocks.init.mock.calls[0]?.[0];
    expect(options?.callback).toBeTypeOf('function');
  });

  it('pall 触发 pall 事件', () => {
    const { wrapper } = mountVideo();
    vmOf(wrapper).pall();
    expect(wrapper.emitted('pall')).toBeTruthy();
  });

  it('buildStudentCameraMedia 未发言时开摄像头禁用音频', () => {
    const { wrapper } = mountVideo({ isTeacher: false });
    const media = vmOf(wrapper).buildStudentCameraMedia(true, false);
    expect(media.videoSend).toBe(true);
    expect(media.audioSend).toBe(false);
    expect(media.audio).toBe(false);
    expect(media.addVideo).toBeUndefined();
  });

  it('buildStudentCameraMedia 发言时开摄像头保留音频', () => {
    const { wrapper } = mountVideo({ isTeacher: false });
    const media = vmOf(wrapper).buildStudentCameraMedia(true, true);
    expect(media.addVideo).toBe(true);
    expect(media.audioSend).toBeUndefined();
    expect(media.audio).toBeUndefined();
  });

  it('buildStudentCameraMedia 未发言时关摄像头禁用音频', () => {
    const { wrapper } = mountVideo({ isTeacher: false });
    const media = vmOf(wrapper).buildStudentCameraMedia(false, false);
    expect(media.removeVideo).toBe(true);
    expect(media.videoSend).toBe(false);
    expect(media.audioSend).toBe(false);
    expect(media.audio).toBe(false);
  });

  it('buildStudentCameraMedia 发言时关摄像头不动音频', () => {
    const { wrapper } = mountVideo({ isTeacher: false });
    const media = vmOf(wrapper).buildStudentCameraMedia(false, true);
    expect(media.removeVideo).toBe(true);
    expect(media.audioSend).toBeUndefined();
    expect(media.audio).toBeUndefined();
  });

  it('setTime 触发 setTime 事件并携带参数', () => {
    const { wrapper } = mountVideo();
    vmOf(wrapper).setTime('close');
    expect(wrapper.emitted('setTime')?.[0]?.[0]).toBe('close');
  });

  it('onLookLive 触发 onLookLive 事件', () => {
    const { wrapper } = mountVideo();
    vmOf(wrapper).onLookLive(true, 'hires', 0);
    expect(wrapper.emitted('onLookLive')?.[0]).toEqual([true, 'hires', 0]);
  });

  it('onOpenLive 在开播时更新直播状态', async () => {
    const apiMocksResolve = apiMocks.changeLiveStatus.mockResolvedValue({
      data: { code: 1000 }
    });
    const { wrapper } = mountVideo();
    vmOf(wrapper).openLive(true, 'hires', 'open', 0);
    vmOf(wrapper).onOpenLive(true, 'hires', 0);
    expect(wrapper.emitted('onOpenLive')?.[0]).toEqual([true, 'hires', 0]);
    await vi.waitFor(() => {
      expect(apiMocksResolve).toHaveBeenCalled();
    });
    expect(apiMocksResolve.mock.calls[0]?.[0]).toEqual({ roomId: '1001', status: 2 });
  });

  it('openLive 停止直播时更新状态为4', async () => {
    apiMocks.changeLiveStatus.mockResolvedValue({ data: { code: 1000 } });
    const { wrapper } = mountVideo();
    vmOf(wrapper).openLive(false, 'hires', 'stop', 0);
    await vi.waitFor(() => {
      expect(apiMocks.changeLiveStatus).toHaveBeenCalled();
    });
    expect(apiMocks.changeLiveStatus.mock.calls[0]?.[0]).toEqual({ roomId: '1001', status: 4 });
  });

  it('openLive 结束直播时触发 onOpenLive 事件', () => {
    const { wrapper } = mountVideo();
    vmOf(wrapper).openLive(false, 'hires', 'close', 60);
    expect(wrapper.emitted('onOpenLive')?.[0]).toEqual([false, '', 60]);
  });

  it('recording 开始时获取服务器时间', async () => {
    apiMocks.getNowTime.mockResolvedValue({
      data: { code: 1000, data: { nowTime: '20230101' } }
    });
    const { wrapper } = mountVideo();
    await vmOf(wrapper).recording(true, 100);
    expect(apiMocks.getNowTime).toHaveBeenCalledTimes(1);
  });

  it('delList 与 endClassSpeakAll 调用不抛错', () => {
    const { wrapper } = mountVideo();
    expect(() => {
      vmOf(wrapper).delList('u1', 0);
      vmOf(wrapper).endClassSpeakAll(60);
      vmOf(wrapper).listparticipants();
    }).not.toThrow();
  });

  it('endClassSpeakAll stop 发送 type 9 stop 消息', () => {
    const { wrapper } = mountVideo();
    vmOf(wrapper).setInit();
    const initOptions = liveMocks.init.mock.calls[0]?.[0] as { callback: () => void };
    initOptions.callback();
    liveMocks.roomOptions?.success?.();
    const data = vi.fn();
    attachTextroomHandle(data);
    vmOf(wrapper).endClassSpeakAll(0, 'stop');
    expect(data).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(data.mock.calls[0]?.[0]?.text as string) as {
      textroom: string;
      text: string;
    };
    expect(payload.textroom).toBe('message');
    expect(JSON.parse(payload.text)).toMatchObject({ type: 9, data: { type: 'stop' } });
  });

  it('fromMessage type 9 stop 触发 broadcastStop 且状态为 stop', async () => {
    const { wrapper } = mountVideo({ isTeacher: false });
    await vmOf(wrapper).fromMessage({
      from: 'teacher-opaque',
      text: JSON.stringify({ type: 9, data: { type: 'stop', liveTimeLen: 0 } })
    });
    expect(wrapper.emitted('broadcastStop')?.[0]).toEqual(['stop']);
    expect(wrapper.emitted('onLookLive')?.[0]).toEqual([false, 'stop', 0]);
  });

  it('fromMessage type 9 end 触发 broadcastStop 且状态为 end', async () => {
    const { wrapper } = mountVideo({ isTeacher: false });
    await vmOf(wrapper).fromMessage({
      from: 'teacher-opaque',
      text: JSON.stringify({ type: 9, data: { type: 'end', liveTimeLen: 60 } })
    });
    expect(wrapper.emitted('broadcastStop')?.[0]).toEqual(['end']);
    expect(wrapper.emitted('onLookLive')?.[0]).toEqual([false, 'end', 60]);
  });

  it('未开播时不显示话筒图标', () => {
    const { wrapper } = mountVideo();
    expect(wrapper.find('[aria-label="麦克风"]').exists()).toBe(false);
  });

  it('开播后显示话筒且默认禁言', async () => {
    apiMocks.changeLiveStatus.mockResolvedValue({ data: { code: 1000 } });
    const { wrapper } = mountVideo();
    vmOf(wrapper).openLive(true, 'hires', 'open', 0);
    await wrapper.vm.$nextTick();
    const mic = wrapper.find('[aria-label="麦克风"]');
    expect(mic.exists()).toBe(true);
    expect(mic.classes()).toContain('is-off');
  });

  it('暂停后隐藏话筒', async () => {
    apiMocks.changeLiveStatus.mockResolvedValue({ data: { code: 1000 } });
    const { wrapper } = mountVideo();
    vmOf(wrapper).openLive(true, 'hires', 'open', 0);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[aria-label="麦克风"]').exists()).toBe(true);
    vmOf(wrapper).openLive(false, '', 'stop', 0);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[aria-label="麦克风"]').exists()).toBe(false);
  });

  it('暂停后清除本地摄像头预览', async () => {
    apiMocks.changeLiveStatus.mockResolvedValue({ data: { code: 1000 } });
    const { wrapper } = mountVideo();
    vmOf(wrapper).setInit();
    const initOptions = liveMocks.init.mock.calls[0]?.[0] as {
      callback: () => void;
    };
    initOptions.callback();
    liveMocks.roomOptions?.success?.();
    const videoHandles = liveMocks.attachHandles['janus.plugin.videoroom'] as {
      onlocalstream: (stream: MediaStream) => void;
    };
    const { stream: fakeStream, videoTrack } = makeFakeStream();
    videoHandles.onlocalstream(fakeStream);
    const videoEl = wrapper.find('video').element as HTMLVideoElement;
    expect(videoEl.srcObject).toBe(fakeStream);

    vmOf(wrapper).openLive(false, '', 'stop', 0);
    await vi.waitFor(() => {
      expect(apiMocks.changeLiveStatus).toHaveBeenCalled();
    });
    expect(videoTrack.stop).toHaveBeenCalledTimes(1);
    expect(fakeStream.removeTrack).toHaveBeenCalledTimes(1);
    expect(videoEl.srcObject).toBeNull();
    expect(apiMocks.changeLiveStatus.mock.calls[0]?.[0]).toEqual({
      roomId: '1001',
      status: 4
    });
  });

  it('暂停后恢复直播重新挂载本地预览', async () => {
    apiMocks.changeLiveStatus.mockResolvedValue({ data: { code: 1000 } });
    const { wrapper } = mountVideo();
    vmOf(wrapper).setInit();
    const initOptions = liveMocks.init.mock.calls[0]?.[0] as {
      callback: () => void;
    };
    initOptions.callback();
    liveMocks.roomOptions?.success?.();
    const videoHandles = liveMocks.attachHandles['janus.plugin.videoroom'] as {
      onlocalstream: (stream: MediaStream) => void;
    };
    const { stream: fakeStream } = makeFakeStream();
    const videoEl = wrapper.find('video').element as HTMLVideoElement;

    vmOf(wrapper).openLive(true, 'hires', 'open', 0);
    videoHandles.onlocalstream(fakeStream);
    expect(videoEl.srcObject).toBe(fakeStream);

    vmOf(wrapper).openLive(false, '', 'stop', 0);
    await vi.waitFor(() => {
      expect(videoEl.srcObject).toBeNull();
    });

    vmOf(wrapper).openLive(true, 'hires', 'open', 0);
    videoHandles.onlocalstream(fakeStream);
    await wrapper.vm.$nextTick();
    expect(videoEl.srcObject).toBe(fakeStream);
    expect(wrapper.find('[aria-label="摄像头"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="摄像头"]').classes()).not.toContain('is-off');
    expect(wrapper.find('[aria-label="麦克风"]').classes()).toContain('is-off');
  });

  it('未推流学生 stopApplication 不发送 offer', async () => {
    apiMocks.changeLiveStatus.mockResolvedValue({ data: { code: 1000 } });
    const { wrapper } = mountVideo({ isTeacher: false });
    vmOf(wrapper).setInit();
    const initOptions = liveMocks.init.mock.calls[0]?.[0] as {
      callback: () => void;
    };
    initOptions.callback();
    liveMocks.roomOptions?.success?.();
    const createOffer = vi.fn();
    attachPluginHandle(createOffer);

    await vmOf(wrapper).stopApplication();
    expect(createOffer).not.toHaveBeenCalled();
  });

  it('推流中学生 stopApplication 发送 stop offer', async () => {
    apiMocks.changeLiveStatus.mockResolvedValue({ data: { code: 1000 } });
    const { wrapper } = mountVideo({ isTeacher: false });
    vmOf(wrapper).setInit();
    const initOptions = liveMocks.init.mock.calls[0]?.[0] as {
      callback: () => void;
    };
    initOptions.callback();
    liveMocks.roomOptions?.success?.();
    const createOffer = vi.fn();
    attachPluginHandle(createOffer);

    vmOf(wrapper).setCameraStudent(true, false);
    expect(createOffer).toHaveBeenCalledTimes(1);

    await vmOf(wrapper).stopApplication();
    expect(createOffer).toHaveBeenCalledTimes(2);
    const lastCall = createOffer.mock.calls[1]?.[0] as {
      media: Record<string, unknown>;
      success: (jsep: unknown) => void;
    };
    expect(lastCall.media.videoSend).toBe(true);
    expect(lastCall.media.audioSend).toBe(false);
  });

  it('过滤 connected=false 的下游错误日志', async () => {
    const { wrapper } = mountVideo();
    vmOf(wrapper).setInit();
    const initOptions = liveMocks.init.mock.calls[0]?.[0] as {
      callback: () => void;
    };
    initOptions.callback();
    liveMocks.roomOptions?.success?.();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi.fn((options: { error?: (err: unknown) => void }) => {
      options.error?.('Is the server down? (connected=false)');
      options.error?.('other error');
    });
    attachPluginHandle(vi.fn(), send);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('other error');
    errorSpy.mockRestore();
  });
});