import { describe, expect, it, vi } from 'vitest';
import { createLiveService } from './test-utils';

type Q = ReturnType<typeof vi.fn>;

const MSG_ID = '3f1c9a02-1d4e-4b7a-9c2f-8e5d6a4b3c21';

type Row = Record<string, unknown>;

function row(overrides: Row = {}): Row {
  return { sender_id: 'u1', recalled: false, in_window: true, owner_id: 't1', ...overrides };
}

describe('LiveService.recallMessage（F4 chat_messages 写路径）', () => {
  it('发言者 2 分钟内撤自己：SELECT 单行定位 + live_rooms JOIN，UPDATE 置空原文留痕', async () => {
    const { service, manager } = createLiveService();
    const q = manager.query as Q;
    q.mockResolvedValueOnce([row()]);
    await expect(service.recallMessage('r1', MSG_ID, 'u1')).resolves.toBe('ok');

    const [sel, selParams] = q.mock.calls[0] as [string, unknown[]];
    expect(sel).toContain('JOIN live_rooms r ON r."roomId" = m.room_id');
    expect(sel).toContain('WHERE m.msg_id = $1 AND m.room_id = $2');
    expect(sel).toContain(`interval '1 minute'`);
    // RECALL_WINDOW_MINUTES 单源（@yunyan-live/types RECALL_WINDOW_MS / 60000 = 2）
    expect(selParams).toEqual([MSG_ID, 'r1', 2]);

    expect(q.mock.calls.length).toBe(2);
    const [upd, updParams] = q.mock.calls[1] as [string, unknown[]];
    expect(upd).toContain('SET recalled_at = now()');
    expect(upd).toContain(`content = ''`);
    expect(upd).toContain('mentions = NULL');
    expect(upd).toContain('extra = NULL');
    expect(upd).toContain('recalled_at IS NULL');
    expect(updParams).toEqual([MSG_ID, 'r1', 'u1']);
  });

  it('房主（liveUserId）可撤本房他人：非发言者但 owner 匹配放行', async () => {
    const { service, manager } = createLiveService();
    const q = manager.query as Q;
    q.mockResolvedValueOnce([row({ sender_id: 'u-student', owner_id: 't-owner' })]);
    await expect(service.recallMessage('r1', MSG_ID, 't-owner')).resolves.toBe('ok');
    expect(q.mock.calls.length).toBe(2);
  });

  it('非发言者且非房主 → forbidden，单次 SELECT 后早退（他房教师/无关学生不可撤）', async () => {
    const { service, manager } = createLiveService();
    const q = manager.query as Q;
    q.mockResolvedValueOnce([row({ owner_id: 't-owner' })]);
    await expect(service.recallMessage('r1', MSG_ID, 'other-teacher')).resolves.toBe('forbidden');
    expect(q.mock.calls.length).toBe(1);
  });

  it('无行（不存在/跨房伪造 msgId）→ not_found', async () => {
    const { service, manager } = createLiveService();
    const q = manager.query as Q;
    q.mockResolvedValueOnce([]);
    await expect(service.recallMessage('r1', MSG_ID, 'u1')).resolves.toBe('not_found');
    expect(q.mock.calls.length).toBe(1);
  });

  it('已撤回 → already（幂等：不重复 UPDATE、不重置留痕）', async () => {
    const { service, manager } = createLiveService();
    const q = manager.query as Q;
    q.mockResolvedValueOnce([row({ recalled: true, in_window: false })]);
    await expect(service.recallMessage('r1', MSG_ID, 'u1')).resolves.toBe('already');
    expect(q.mock.calls.length).toBe(1);
  });

  it('超 2 分钟窗 → expired，不 UPDATE（窗口由 SQL 侧 now() 裁决）', async () => {
    const { service, manager } = createLiveService();
    const q = manager.query as Q;
    q.mockResolvedValueOnce([row({ in_window: false })]);
    await expect(service.recallMessage('r1', MSG_ID, 'u1')).resolves.toBe('expired');
    expect(q.mock.calls.length).toBe(1);
  });

  it('权限先于窗口：他房超窗调用返回 forbidden 而非 expired（不泄露消息状态）', async () => {
    const { service, manager } = createLiveService();
    const q = manager.query as Q;
    q.mockResolvedValueOnce([row({ owner_id: 't-owner', in_window: false })]);
    await expect(service.recallMessage('r1', MSG_ID, 'u3')).resolves.toBe('forbidden');
    expect(q.mock.calls.length).toBe(1);
  });
});
