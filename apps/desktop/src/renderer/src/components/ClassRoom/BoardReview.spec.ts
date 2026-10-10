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
