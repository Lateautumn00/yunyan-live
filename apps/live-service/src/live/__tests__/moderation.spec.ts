import { describe, expect, it, vi } from 'vitest';
import { createLiveService } from './test-utils';

type Q = ReturnType<typeof vi.fn>;

describe('LiveService.moderateUser（F3 chat_moderation 写路径）', () => {
  it('set+mute：先 deactivate 同房活跃 mute（replaced 留痕）再 insert 带 until 的活跃行', async () => {
    const { service, manager } = createLiveService();
    const q = manager.query as Q;
    await service.moderateUser('r1', 'u1', 'mute', 'set', 5, 'teacher-1');

    const [sql, params] = q.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WITH deactivated AS');
    expect(sql).toContain("released_reason = 'replaced'");
    expect(sql).toContain("kind = 'mute' AND active = true");
    expect(sql).toContain(`now() + ($3 * interval '1 minute')`);
    expect(sql).toContain('INSERT INTO chat_moderation');
    expect(params).toEqual(['r1', 'u1', 5, 'teacher-1']);
  });

  it('set+kick：deactivate 活跃 kick 后 insert until=NULL 行（本场级）', async () => {
    const { service, manager } = createLiveService();
    const q = manager.query as Q;
    await service.moderateUser('r1', 'u1', 'kick', 'set', 0, 'teacher-1');

    const [sql, params] = q.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("kind = 'kick' AND active = true");
    expect(sql).toContain(`VALUES ($1, $2, 'kick', NULL, true, $3)`);
    expect(params).toEqual(['r1', 'u1', 'teacher-1']);
  });

  it('release：单条 UPDATE 置 active=false（manual 留痕），不 insert', async () => {
    const { service, manager } = createLiveService();
    const q = manager.query as Q;
    await service.moderateUser('r1', 'u1', 'mute', 'release', 0, 'teacher-1');

    expect(q.mock.calls.length).toBe(1);
    const [sql, params] = q.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('SET active = false');
    expect(sql).toContain("released_reason = 'manual'");
    expect(sql).not.toContain('INSERT');
    expect(params).toEqual(['r1', 'u1', 'mute']);
  });

  it('release 对无活跃行也只 UPDATE（幂等，affected=0 不报错）', async () => {
    const { service, manager } = createLiveService();
    const q = manager.query as Q;
    q.mockResolvedValueOnce(undefined);
    await expect(
      service.moderateUser('r1', 'u9', 'kick', 'release', 0, 'teacher-1')
    ).resolves.toBeUndefined();
    expect(q.mock.calls[0][1]).toEqual(['r1', 'u9', 'kick']);
  });
});
