import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import { createPinia } from 'pinia';
import Chat from '@/components/ClassRoom/Chat.vue';
import { useRoomStore } from '@/store/room';

const apiMocks = vi.hoisted(() => ({
  updateForbid: vi.fn()
}));

const storeMocks = vi.hoisted(() => ({
  sessionInterrupted: vi.fn()
}));

vi.mock('@/api', () => ({
  default: {
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
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  url: string;
  readyState = 0;
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
    this.readyState = 3;
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
    sendMes: (type: number) => void;
    sendContent: string;
  };
}

function closeEventWith(code: number): Event {
  return new CloseEvent('close', { code });
}

async function openSocket(wrapper: ReturnType<typeof mount>): Promise<MockWebSocket> {
  vmOf(wrapper).createTutorSocket();
  const ws = MockWebSocket.instances[0]!;
  ws.readyState = 1;
  ws.onopen?.();
  await flushPromises();
  return ws;
}

function pushBullet(
  ws: MockWebSocket,
  data: { liveMsg: Record<string, unknown>; info: Record<string, unknown> }
) {
  ws.onmessage?.({ data: JSON.stringify({ type: 'bullet', data }) });
}

interface SentBullet {
  data: { liveMsg: Record<string, unknown> };
}

function lastSent(ws: MockWebSocket): SentBullet {
  return JSON.parse(ws.sent.at(-1)!) as SentBullet;
}

describe('ClassRoom Chat.vue', () => {
  beforeEach(() => {
    apiMocks.updateForbid.mockReset();
    storeMocks.sessionInterrupted.mockReset();
    MockWebSocket.instances = [];
    localStorage.removeItem('token');
    document.body.innerHTML = '';
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function mountChat(overrides: Record<string, unknown> = {}, pinia = createPinia()) {
    return mount(Chat, {
      props: { ...baseProps(), ...overrides },
      attachTo: document.body,
      global: { plugins: [ElementPlus, pinia], components: { ...ElementPlusIconsVue } }
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
    const wrapper = mountChat();
    vmOf(wrapper).createTutorSocket();
    const ws = MockWebSocket.instances[0];
    expect(ws).toBeTruthy();
    expect(ws!.url).toBe(
      'ws://test.local/socket?roomId=r1&liveUserId=u1&nickName=%E5%B0%8F%E6%98%8E'
    );
    ws!.readyState = 1;
    ws!.onopen?.();
    await flushPromises();
    expect(ws!.sent[0]).toContain('getwhiteBoard');
  });

  it('sendMes 经 WebSocket 发送弹幕并清空输入', async () => {
    const wrapper = mountChat();
    const vm = vmOf(wrapper);
    const ws = await openSocket(wrapper);
    vm.sendContent = '大家好';
    await wrapper.vm.$nextTick();
    const sendOk = wrapper.findAll('[aria-label="发送"]')[0];
    await sendOk!.trigger('click');
    await flushPromises();
    expect(ws.sent.at(-1)).toContain('"type":"bullet"');
    expect(ws.sent.at(-1)).toContain('大家好');
    expect(vm.sendContent).toBe('');
    expect(lastSent(ws).data.liveMsg.mentions).toBeUndefined();
  });

  it('收到 bullet 弹幕渲染到列表', async () => {
    const wrapper = mountChat();
    const ws = await openSocket(wrapper);
    pushBullet(ws, {
      liveMsg: { name: '李四', msg: '弹幕内容' },
      info: { liveUserId: 'u2', isTeacher: false }
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('弹幕内容');
    expect(wrapper.text()).toContain('李四');
  });

  it('@提及高亮渲染并触发 chat-mention 徽标（成员离线同样高亮）', async () => {
    const wrapper = mountChat();
    const ws = await openSocket(wrapper);
    pushBullet(ws, {
      liveMsg: {
        name: '李四',
        msg: '@小明 你好',
        time: 1700000000000,
        mentions: [{ userId: 'u1', userName: '小明' }]
      },
      info: { liveUserId: 'u2', isTeacher: false }
    });
    await wrapper.vm.$nextTick();
    const mentions = wrapper.findAll('.mention');
    expect(mentions).toHaveLength(1);
    expect(mentions.at(0)!.text()).toBe('@小明');
    expect(wrapper.findAll('.mention-me')).toHaveLength(1);
    expect(wrapper.emitted('updateNum')).toContainEqual([true, 1, 'chat-mention']);
    expect(wrapper.emitted('updateNum')).toContainEqual([true, 1, 'chat']);
  });

  it('@所有人 提及同样高亮并触发 chat-mention', async () => {
    const wrapper = mountChat();
    const ws = await openSocket(wrapper);
    pushBullet(ws, {
      liveMsg: {
        name: '王五',
        msg: '@所有人 看黑板',
        mentions: [{ userId: 'all', userName: '所有人' }]
      },
      info: { liveUserId: 'u3', isTeacher: true }
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.mention').at(0)!.text()).toBe('@所有人');
    expect(wrapper.findAll('.mention-me')).toHaveLength(1);
    expect(wrapper.emitted('updateNum')).toContainEqual([true, 1, 'chat-mention']);
  });

  it('自己发送的消息含 @自己 不计 chat-mention', async () => {
    const wrapper = mountChat();
    const ws = await openSocket(wrapper);
    pushBullet(ws, {
      liveMsg: {
        name: '小明',
        msg: '@小明 自言自语',
        mentions: [{ userId: 'u1', userName: '小明' }]
      },
      info: { liveUserId: 'u1', isTeacher: false }
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.mention-me')).toHaveLength(0);
    const updates = (wrapper.emitted('updateNum') ?? []).flat();
    expect(updates).not.toContain('chat-mention');
  });

  it('时间戳按 5 分钟分组显示', async () => {
    const wrapper = mountChat();
    const ws = await openSocket(wrapper);
    const T0 = 1700000000000;
    const info = { liveUserId: 'u2', isTeacher: false };
    pushBullet(ws, { liveMsg: { name: '李四', msg: '第一条', time: T0 }, info });
    await wrapper.vm.$nextTick();
    pushBullet(ws, { liveMsg: { name: '李四', msg: '第二条', time: T0 + 60_000 }, info });
    await wrapper.vm.$nextTick();
    pushBullet(ws, { liveMsg: { name: '李四', msg: '第三条', time: T0 + 400_000 }, info });
    await wrapper.vm.$nextTick();
    const times = wrapper.findAll('.msg-time');
    expect(times).toHaveLength(2);
    expect(times.at(0)!.text()).toMatch(/^\d{2}:\d{2}$/);
  });

  it('emoji 面板选择插入到输入框', async () => {
    const wrapper = mountChat();
    const vm = vmOf(wrapper);
    await wrapper.find('.emoji-btn').trigger('click');
    expect(wrapper.find('.emoji-panel').exists()).toBeTruthy();
    await wrapper.find('.emoji-item').trigger('click');
    await flushPromises();
    expect(vm.sendContent).toContain('😀');
  });

  it('超长消息截断至 200 字并提示', async () => {
    const wrapper = mountChat();
    const vm = vmOf(wrapper);
    const ws = await openSocket(wrapper);
    vm.sendContent = 'x'.repeat(201);
    vm.sendMes(1);
    await flushPromises();
    const sent = lastSent(ws).data.liveMsg.msg as string;
    expect(sent).toHaveLength(200);
    expect(document.body.textContent).toContain('消息超长（201字），已截断至200字');
    expect(vm.sendContent).toBe('');
  });

  it('禁言状态禁发并给出提示', async () => {
    const wrapper = mountChat();
    const vm = vmOf(wrapper);
    const ws = await openSocket(wrapper);
    ws.onmessage?.({ data: JSON.stringify({ type: 'updateForbid', status: 0 }) });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('input').attributes('disabled')).toBeDefined();
    const sentBefore = ws.sent.length;
    vm.sendContent = '不该发出';
    vm.sendMes(1);
    await flushPromises();
    expect(ws.sent).toHaveLength(sentBefore);
    expect(document.body.textContent).toContain('当前处于禁言状态，无法发言');
  });

  it('msg 下发 forbid=0 禁用输入，bullet_rejected 拒发提示', async () => {
    const wrapper = mountChat();
    const ws = await openSocket(wrapper);
    ws.onmessage?.({
      data: JSON.stringify({ type: 'msg', data: { liveMsg: { forbid: 0, msg: '房间公告' } } })
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('input').attributes('disabled')).toBeDefined();
    ws.onmessage?.({ data: JSON.stringify({ type: 'bullet_rejected', reason: 'too_long' }) });
    await flushPromises();
    expect(document.body.textContent).toContain('消息超过200字');
  });

  it('@select 快照兜底：离线成员仍可完成提及载荷', async () => {
    const wrapper = mountChat();
    const vm = vmOf(wrapper);
    const ws = await openSocket(wrapper);
    const mention = wrapper.findComponent({ name: 'ElMention' });
    mention.vm.$emit('select', { value: '所有人', label: '所有人', userId: 'all' }, '@');
    vm.sendContent = '@所有人 看这里';
    vm.sendMes(1);
    await flushPromises();
    expect(lastSent(ws).data.liveMsg.mentions).toEqual([{ userId: 'all', userName: '所有人' }]);
  });

  it('IME 组字中 Enter 不误发，组字结束 Enter 正常发送', async () => {
    const wrapper = mountChat();
    const ws = await openSocket(wrapper);
    const vm = vmOf(wrapper);
    const input = wrapper.find('input');
    vm.sendContent = '你好';
    await wrapper.vm.$nextTick();

    const composing = new KeyboardEvent('keydown', { key: 'Enter' });
    Object.defineProperty(composing, 'isComposing', { value: true });
    input.element.dispatchEvent(composing);
    await flushPromises();
    expect(ws.sent.filter(s => s.includes('"type":"bullet"'))).toHaveLength(0);

    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(ws.sent.filter(s => s.includes('"type":"bullet"'))).toHaveLength(1);
    expect(vm.sendContent).toBe('');
  });

  it('补全下拉打开时 Enter 不触发发送', async () => {
    // isTeacher 置顶'所有人'保证补全选项非空，下拉可真实打开
    const wrapper = mountChat({ isTeacher: true });
    const ws = await openSocket(wrapper);
    const vm = vmOf(wrapper);
    vm.sendContent = '@';
    await wrapper.vm.$nextTick();

    const input = wrapper.find('input');
    const el = input.element as HTMLInputElement;
    el.focus();
    el.setSelectionRange(1, 1);
    await input.trigger('input');
    await new Promise(resolve => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const inst = wrapper.findComponent({ name: 'ElMention' }).vm.$ as unknown as {
      exposed?: { dropdownVisible?: { value: boolean } };
    };
    expect(inst.exposed?.dropdownVisible?.value).toBe(true);

    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(ws.sent.filter(s => s.includes('"type":"bullet"'))).toHaveLength(0);
  });

  it('收到 updateForbid 更新禁言状态', async () => {
    const wrapper = mountChat();
    const ws = await openSocket(wrapper);
    ws.onmessage?.({ data: JSON.stringify({ type: 'updateForbid', status: 0 }) });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('input').attributes('disabled')).toBeDefined();
  });

  it('关闭码 4002 触发被踢处理并停止重连', async () => {
    const wrapper = mountChat();
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
    const wrapper = mountChat();
    const vm = vmOf(wrapper);
    vm.createTutorSocket();

    vm.liveSocketClose(closeEventWith(4001));
    await flushPromises();
    expect(storeMocks.sessionInterrupted).toHaveBeenCalledWith('expired');
    localStorage.removeItem('token');
  });

  it('普通关闭码不触发会话中断', async () => {
    const wrapper = mountChat();
    const vm = vmOf(wrapper);
    vm.createTutorSocket();

    vm.liveSocketClose(closeEventWith(1006));
    await flushPromises();
    expect(storeMocks.sessionInterrupted).not.toHaveBeenCalled();
  });

  it('卸载时清理 WebSocket 与定时器', async () => {
    const wrapper = mountChat();
    const vm = vmOf(wrapper);
    vm.createTutorSocket();
    const ws = MockWebSocket.instances[0]!;
    ws.readyState = 1;
    ws.onopen?.();

    wrapper.unmount();
    expect(ws.sent.filter(s => s.includes('ping'))).toHaveLength(0);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('断开后发送提示网络异常且 4 秒后自动重连', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']
    });
    localStorage.setItem('token', 'some-token');
    try {
      const wrapper = mountChat();
      const vm = vmOf(wrapper);
      const ws = await openSocket(wrapper);

      ws.readyState = 3;
      vm.liveSocketClose(closeEventWith(1006));
      await flushPromises();

      vm.sendContent = '掉线时的消息';
      vm.sendMes(1);
      await flushPromises();
      expect(document.body.textContent).toContain('聊天网络异常，发送失败');
      expect(ws.sent.filter(s => s.includes('掉线时的消息'))).toHaveLength(0);

      vi.advanceTimersByTime(4000);
      expect(MockWebSocket.instances).toHaveLength(2);

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
      localStorage.removeItem('token');
    }
  });

  it('心跳持续无 pong 超时强制断开并重连', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']
    });
    localStorage.setItem('token', 'some-token');
    try {
      const wrapper = mountChat();
      const ws = await openSocket(wrapper);

      vi.advanceTimersByTime(4000);
      expect(ws.sent.filter(s => s.includes('ping'))).toHaveLength(1);
      vi.advanceTimersByTime(4000);
      expect(ws.readyState).toBe(1);
      vi.advanceTimersByTime(4000);
      expect(ws.readyState).toBe(3);

      vi.advanceTimersByTime(4000);
      expect(MockWebSocket.instances).toHaveLength(2);

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
      localStorage.removeItem('token');
    }
  });

  it('@提及补全排除自身，他人与所有人保留', async () => {
    const pinia = createPinia();
    useRoomStore(pinia).setMembers([
      { userName: '小明', opaqueId: 'u1' },
      { userName: '李四', opaqueId: 'u2' }
    ]);

    const wrapper = mountChat({}, pinia);
    await openSocket(wrapper);
    const mention = wrapper.findComponent({ name: 'ElMention' });
    const values = (mention.props('options') as Array<{ value: string }>).map(o => o.value);
    expect(values).toContain('李四');
    expect(values).not.toContain('小明');
    wrapper.unmount();

    const teacherWrapper = mountChat({ isTeacher: true }, pinia);
    const teacherValues = (
      teacherWrapper.findComponent({ name: 'ElMention' }).props('options') as Array<{
        value: string;
      }>
    ).map(o => o.value);
    expect(teacherValues[0]).toBe('所有人');
    expect(teacherValues).toContain('李四');
    expect(teacherValues).not.toContain('小明');
    teacherWrapper.unmount();
  });

  it('正文含自身昵称发送时不产生自身提及载荷', async () => {
    const pinia = createPinia();
    useRoomStore(pinia).setMembers([
      { userName: '小明', opaqueId: 'u1' },
      { userName: '李四', opaqueId: 'u2' }
    ]);
    const wrapper = mountChat({}, pinia);
    const vm = vmOf(wrapper);
    const ws = await openSocket(wrapper);
    vm.sendContent = '@小明 @李四 大家早';
    vm.sendMes(1);
    await flushPromises();
    expect(lastSent(ws).data.liveMsg.mentions).toEqual([{ userId: 'u2', userName: '李四' }]);
    wrapper.unmount();
  });
});
