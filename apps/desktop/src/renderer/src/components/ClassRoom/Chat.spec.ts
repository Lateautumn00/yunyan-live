import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import Chat from '@/components/ClassRoom/Chat.vue';

const apiMocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  updateForbid: vi.fn()
}));

const storeMocks = vi.hoisted(() => ({
  sessionInterrupted: vi.fn()
}));

vi.mock('@/api', () => ({
  default: {
    sendMessage: (id: string, params: unknown) => apiMocks.sendMessage(id, params),
    updateForbid: (params: unknown) => apiMocks.updateForbid(params)
  },
  config: {
    messageWs: 'ws://test.local/socket'
  }
}));

vi.mock('@/store/user', () => ({
  useUserStore: () => ({ sessionInterrupted: storeMocks.sessionInterrupted })
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onclose: ((e?: Event) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.onclose?.();
  }
}

function baseProps() {
  return {
    liveUserId: 'u1',
    roomId: 'r1',
    userName: '小明',
    isTeacher: false,
    isInteraction: 0,
    btn: true
  };
}

function vmOf(wrapper: ReturnType<typeof mount>) {
  return wrapper.vm as unknown as {
    createTutorSocket: () => void;
    setSocketSend: (data: string) => void;
    liveSocketClose: (e?: Event) => void;
    over: (msg: string) => void;
    sendContent: string;
  };
}

function closeEventWith(code: number): Event {
  return new CloseEvent('close', { code });
}

describe('ClassRoom Chat.vue', () => {
  beforeEach(() => {
    apiMocks.sendMessage.mockReset();
    apiMocks.updateForbid.mockReset();
    storeMocks.sessionInterrupted.mockReset();
    MockWebSocket.instances = [];
    localStorage.removeItem('token');
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mountChat(overrides: Record<string, unknown> = {}) {
    return mount(Chat, {
      props: { ...baseProps(), ...overrides },
      global: { plugins: [ElementPlus], components: { ...ElementPlusIconsVue } }
    });
  }

  it('学生端展示举手按钮', () => {
    const wrapper = mountChat();
    const input = wrapper.find('input');
    expect(input.exists()).toBeTruthy();
    expect(input.attributes('placeholder')).toBe('请输入内容');
    const hand = wrapper.findAll('[aria-label="举手发言"]');
    expect(hand).toHaveLength(1);
  });

  it('createTutorSocket 建立连接并发送白板请求', async () => {
    const wrapper = mount(Chat, { props: baseProps(), global: { plugins: [ElementPlus] } });
    vmOf(wrapper).createTutorSocket();
    const ws = MockWebSocket.instances[0];
    expect(ws).toBeTruthy();
    expect(ws!.url).toBe('ws://test.local/socket?roomId=r1&liveUserId=u1');
    ws!.onopen?.();
    await flushPromises();
    expect(ws!.sent[0]).toContain('getwhiteBoard');
  });

  it('sendMes 发送成功后清空输入并上屏', async () => {
    apiMocks.sendMessage.mockResolvedValue({ code: 1000 });
    const wrapper = mountChat();
    const vm = vmOf(wrapper);
    vm.createTutorSocket();
    const ws = MockWebSocket.instances[0]!;
    ws.onopen?.();
    await flushPromises();
    vm.sendContent = '大家好';
    await wrapper.vm.$nextTick();
    const sendOk = wrapper.findAll('[aria-label="发送"]')[0];
    await sendOk!.trigger('click');
    await flushPromises();
    expect(apiMocks.sendMessage).toHaveBeenCalledWith('u1', expect.objectContaining({ type: 'bullet' }));
    expect(wrapper.text()).toContain('大家好');
    expect(vm.sendContent).toBe('');
  });

  it('收到 bullet 弹幕渲染到列表', async () => {
    const wrapper = mount(Chat, { props: baseProps(), global: { plugins: [ElementPlus] } });
    vmOf(wrapper).createTutorSocket();
    const ws = MockWebSocket.instances[0]!;
    ws.onmessage?.({
      data: JSON.stringify({
        type: 'bullet',
        data: {
          liveMsg: { name: '李四', msg: '弹幕内容' },
          info: { liveUserId: 'u2', isTeacher: false }
        }
      })
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('弹幕内容');
    expect(wrapper.text()).toContain('李四');
  });

  it('收到 updateForbid 更新禁言状态', async () => {
    const wrapper = mount(Chat, { props: baseProps(), global: { plugins: [ElementPlus] } });
    vmOf(wrapper).createTutorSocket();
    const ws = MockWebSocket.instances[0]!;
    ws.onmessage?.({ data: JSON.stringify({ type: 'updateForbid', status: 0 }) });
    await wrapper.vm.$nextTick();
    const input = wrapper.find('input');
    expect(input.attributes('disabled')).toBeDefined();
  });

  it('over 发送直播结束消息', async () => {
    const wrapper = mount(Chat, { props: baseProps(), global: { plugins: [ElementPlus] } });
    vmOf(wrapper).createTutorSocket();
    const ws = MockWebSocket.instances[0]!;
    vmOf(wrapper).over('下课');
    expect(ws.sent.at(-1)).toContain('"type": "over"');
  });

  it('关闭码 4002 触发被踢处理并停止重连', async () => {
    const wrapper = mount(Chat, { props: baseProps(), global: { plugins: [ElementPlus] } });
    const vm = vmOf(wrapper);
    vm.createTutorSocket();
    expect(MockWebSocket.instances).toHaveLength(1);

    vm.liveSocketClose(closeEventWith(4002));
    await flushPromises();
    expect(storeMocks.sessionInterrupted).toHaveBeenCalledWith('kicked');

    vm.createTutorSocket();
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('关闭码 4001 且有 token 时触发过期处理', async () => {
    localStorage.setItem('token', 'some-token');
    const wrapper = mount(Chat, { props: baseProps(), global: { plugins: [ElementPlus] } });
    const vm = vmOf(wrapper);
    vm.createTutorSocket();

    vm.liveSocketClose(closeEventWith(4001));
    await flushPromises();
    expect(storeMocks.sessionInterrupted).toHaveBeenCalledWith('expired');
    localStorage.removeItem('token');
  });

  it('普通关闭码不触发会话中断', async () => {
    const wrapper = mount(Chat, { props: baseProps(), global: { plugins: [ElementPlus] } });
    const vm = vmOf(wrapper);
    vm.createTutorSocket();

    vm.liveSocketClose(closeEventWith(1006));
    await flushPromises();
    expect(storeMocks.sessionInterrupted).not.toHaveBeenCalled();
  });

  it('卸载时清理 WebSocket 与定时器', async () => {
    const wrapper = mount(Chat, { props: baseProps(), global: { plugins: [ElementPlus] } });
    const vm = vmOf(wrapper);
    vm.createTutorSocket();
    const ws = MockWebSocket.instances[0]!;
    ws.onopen?.();

    wrapper.unmount();
    expect(ws.sent.filter((s) => s.includes('ping'))).toHaveLength(0);
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});