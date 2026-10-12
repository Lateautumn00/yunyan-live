import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import * as Y from 'yjs';
/* eslint-disable @typescript-eslint/no-explicit-any */

const liveMocks = {
  boardHistory: vi.fn(),
  boardSnapshot: vi.fn()
};

vi.mock('@/api/backstage', () => ({
  default: {
    board_history: (roomId: string, cursor?: string, limit?: number) =>
      liveMocks.boardHistory(roomId, cursor, limit),
    board_snapshot: (id: string) => liveMocks.boardSnapshot(id)
  }
}));

const replayMocks = {
  fetchReplay: vi.fn()
};

vi.mock('./whiteboard/replayPlayer', async importOriginal => {
  const orig = await importOriginal<typeof import('./whiteboard/replayPlayer')>();
  return {
    ...orig,
    fetchReplay: (roomId: string, wsUrl?: string, fromSeq?: number) =>
      replayMocks.fetchReplay(roomId, wsUrl, fromSeq)
  };
});

import BoardReview from './BoardReview.vue';

function makeSnapshotB64(pageIds: string[]): string {
  const doc = new Y.Doc();
  const pages = doc.getArray<Y.Map<any>>('pages');
  for (const id of pageIds) {
    const p = new Y.Map();
    p.set('id', id);
    pages.push([p]);
    const elements = new Y.Array();
    p.set('elements', elements);
    const el = new Y.Map();
    el.set('id', `${id}_e1`);
    el.set('type', 'rect');
    el.set('x', 5);
    el.set('y', 6);
    elements.push([el]);
  }
  const update = Y.encodeStateAsUpdate(doc);
  let binary = '';
  for (const b of update) binary += String.fromCharCode(b);
  doc.destroy();
  return btoa(binary);
}

function mountReview(roomId = 'r1') {
  return mount(BoardReview, {
    props: { roomId },
    global: {
      plugins: [ElementPlus],
      components: { ...ElementPlusIconsVue }
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BoardReview 课后回看（F6.3）', () => {
  it('正向：挂载拉取历史列表并渲染条目', async () => {
    liveMocks.boardHistory.mockResolvedValue({
      data: {
        items: [
          { id: 's1', roomId: 'r1', size: 2048, createdAt: 1700000000000 },
          { id: 's2', roomId: 'r1', size: 1024, createdAt: 1700000100000 }
        ],
        hasMore: false
      }
    });
    const wrapper = mountReview();
    await vi.waitFor(() => {
      expect(wrapper.findAll('.br-item')).toHaveLength(2);
    });
    expect(liveMocks.boardHistory).toHaveBeenCalledWith('r1', undefined, undefined);
    wrapper.unmount();
  });

  it('正向：点击条目拉取快照、解码并读出页（选中高亮）', async () => {
    liveMocks.boardHistory.mockResolvedValue({
      data: { items: [{ id: 's1', roomId: 'r1' }], hasMore: false }
    });
    liveMocks.boardSnapshot.mockResolvedValue({
      data: { id: 's1', data: makeSnapshotB64(['p1', 'p2']) }
    });
    const wrapper = mountReview();
    await vi.waitFor(() => {
      expect(wrapper.findAll('.br-item')).toHaveLength(1);
    });
    await wrapper.find('.br-item').trigger('click');
    const vm = wrapper.vm as unknown as { pages: Array<{ id: string }>; selectedId: string };
    await vi.waitFor(() => {
      expect(vm.pages.map(p => p.id)).toEqual(['p1', 'p2']);
    });
    expect(vm.selectedId).toBe('s1');
    expect(liveMocks.boardSnapshot).toHaveBeenCalledWith('s1');
    wrapper.unmount();
  });

  it('负向：历史接口 403（非本房教师）→ 无权限文案，不渲染列表', async () => {
    liveMocks.boardHistory.mockRejectedValue({ response: { status: 403 } });
    const wrapper = mountReview();
    await vi.waitFor(() => {
      expect(wrapper.find('.br-error').text()).toContain('无权限');
    });
    expect(wrapper.findAll('.br-item')).toHaveLength(0);
    wrapper.unmount();
  });
});

describe('BoardReview 过程回放（F6.4）', () => {
  function toB64(u: Uint8Array): string {
    let s = '';
    for (const b of u) s += String.fromCharCode(b);
    return btoa(s);
  }

  function makeReplayData() {
    const doc = new Y.Doc();
    const baseline = toB64(Y.encodeStateAsUpdate(doc));
    const updates: string[] = [];
    doc.on('update', (u: Uint8Array) => updates.push(toB64(u)));
    doc.getArray('elements').push(['rx1']);
    doc.getArray('elements').push(['rx2']);
    doc.destroy();
    return {
      baseline,
      events: updates.map((u, i) => ({ seq: i + 1, ts: 1000 + i * 100, u })),
      lastSeq: updates.length
    };
  }

  it('正向：打开快照后点过程回放，拉取事件流并出现播放条', async () => {
    liveMocks.boardHistory.mockResolvedValue({
      data: { items: [{ id: 's1', roomId: 'r1' }], hasMore: false }
    });
    liveMocks.boardSnapshot.mockResolvedValue({
      data: { id: 's1', data: makeSnapshotB64(['p1']) }
    });
    replayMocks.fetchReplay.mockResolvedValue(makeReplayData());
    const wrapper = mountReview();
    await vi.waitFor(() => expect(wrapper.findAll('.br-item')).toHaveLength(1));
    await wrapper.find('.br-item').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.br-replay-btn').exists()).toBe(true));
    await wrapper.find('.br-replay-btn').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.replay-controls').exists()).toBe(true));
    expect(replayMocks.fetchReplay).toHaveBeenCalledWith('r1', undefined, 0);
    expect(wrapper.find('.rc-num').text()).toContain('/2');
    wrapper.unmount();
  });

  it('负向：空流空态——播放条显示暂无过程回放说明', async () => {
    liveMocks.boardHistory.mockResolvedValue({
      data: { items: [{ id: 's1', roomId: 'r1' }], hasMore: false }
    });
    liveMocks.boardSnapshot.mockResolvedValue({
      data: { id: 's1', data: makeSnapshotB64(['p1']) }
    });
    replayMocks.fetchReplay.mockResolvedValue({ baseline: null, events: [], lastSeq: 0 });
    const wrapper = mountReview();
    await vi.waitFor(() => expect(wrapper.findAll('.br-item')).toHaveLength(1));
    await wrapper.find('.br-item').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.br-replay-btn').exists()).toBe(true));
    await wrapper.find('.br-replay-btn').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.replay-controls').exists()).toBe(true));
    expect(wrapper.text()).toContain('暂无过程回放');
    expect(wrapper.find('.rc-play').exists()).toBe(false);
    wrapper.unmount();
  });

  it('负向：回放接口失败显示加载失败文案', async () => {
    liveMocks.boardHistory.mockResolvedValue({
      data: { items: [{ id: 's1', roomId: 'r1' }], hasMore: false }
    });
    liveMocks.boardSnapshot.mockResolvedValue({
      data: { id: 's1', data: makeSnapshotB64(['p1']) }
    });
    replayMocks.fetchReplay.mockRejectedValue(new Error('network'));
    const wrapper = mountReview();
    await vi.waitFor(() => expect(wrapper.findAll('.br-item')).toHaveLength(1));
    await wrapper.find('.br-item').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.br-replay-btn').exists()).toBe(true));
    await wrapper.find('.br-replay-btn').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('.br-replay-error').text()).toContain('回放数据加载失败');
    });
    wrapper.unmount();
  });
});
