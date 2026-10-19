import { describe, expect, it, vi } from 'vitest';
import type { ModerationPayload } from '@yunyan-live/nest-shared';
import {
  applyModeration,
  collectExpired,
  dropRoom,
  ensureRoom,
  isMuted,
  loadModeration,
  sweepExpiredModeration,
  type ModerationState
} from './moderation';

const NOW = 1_700_000_000_000;

function state(): ModerationState {
  return new Map();
}

function mute(overrides: Partial<ModerationPayload> = {}): ModerationPayload {
  return {
    roomId: 'r1',
    userId: 'u1',
    kind: 'mute',
    op: 'set',
    untilMs: NOW + 60_000,
    ...overrides
  };
}

describe('applyModeration / isMuted（缓存读写）', () => {
  it('mute set → isMuted true；到期后惰性过期为 false 并清条目字段', () => {
    const s = state();
    applyModeration(s, mute());
    expect(isMuted(s, 'r1', 'u1', NOW + 30_000)).toBe(true);
    expect(isMuted(s, 'r1', 'u1', NOW + 60_000)).toBe(false);
    // 惰性清理后仍为 false
    expect(isMuted(s, 'r1', 'u1', NOW + 61_000)).toBe(false);
    expect(s.get('r1')?.get('u1')?.muteUntilMs).toBeUndefined();
  });

  it('mute release → 解除禁言；条目空则回收', () => {
    const s = state();
    applyModeration(s, mute());
    applyModeration(s, mute({ op: 'release' }));
    expect(isMuted(s, 'r1', 'u1', NOW)).toBe(false);
    expect(s.get('r1')?.has('u1')).toBe(false);
  });

  it('kick set/release 走 kicked 标记；空条目回收', () => {
    const s = state();
    applyModeration(s, mute({ kind: 'kick', op: 'set', untilMs: undefined }));
    expect(s.get('r1')?.get('u1')?.kicked).toBe(true);
    applyModeration(s, mute({ kind: 'kick', op: 'release', untilMs: undefined }));
    expect(s.get('r1')?.has('u1')).toBe(false);
  });

  it('不同房间/用户互不影响；authUserId 缺省不判禁言', () => {
    const s = state();
    applyModeration(s, mute());
    expect(isMuted(s, 'r2', 'u1', NOW)).toBe(false);
    expect(isMuted(s, 'r1', 'u2', NOW)).toBe(false);
    expect(isMuted(s, 'r1', undefined, NOW)).toBe(false);
  });

  it('ensureRoom 复用同一 room map；dropRoom 整房清除（重进靠握手回填）', () => {
    const s = state();
    const a = ensureRoom(s, 'r1');
    a.set('u1', { kicked: true });
    expect(ensureRoom(s, 'r1')).toBe(a);
    dropRoom(s, 'r1');
    expect(s.has('r1')).toBe(false);
  });
});

describe('collectExpired（15s 轮询广播源）', () => {
  it('收集到期 mute 并清条目；未到期与 kick 不收集；空房整房回收', () => {
    const s = state();
    applyModeration(s, mute({ userId: 'u1', untilMs: NOW + 1_000 })); // 未到期
    applyModeration(s, mute({ userId: 'u2', untilMs: NOW - 1 })); // 到期
    applyModeration(s, mute({ kind: 'kick', op: 'set', userId: 'u3', untilMs: undefined }));

    const expired = collectExpired(s, NOW);
    expect(expired).toEqual([{ roomId: 'r1', userId: 'u2' }]);
    expect(isMuted(s, 'r1', 'u1', NOW)).toBe(true);
    expect(s.get('r1')?.has('u2')).toBe(false);
    expect(s.get('r1')?.get('u3')?.kicked).toBe(true);

    // 全部清空后整房回收
    applyModeration(s, mute({ userId: 'u1', op: 'release' }));
    s.get('r1')?.delete('u3');
    collectExpired(s, NOW);
    expect(s.has('r1')).toBe(false);
  });
});

describe('loadModeration（握手 PG 回填）', () => {
  it('无池 → null（fail-open）', async () => {
    expect(await loadModeration(null, 'r1', 'u1')).toBeNull();
  });

  it('活跃 kick 行 → {kicked:true}；SQL 谓词带 active 与 until 兜底', async () => {
    const query = vi.fn(async () => ({ rows: [{ kind: 'kick', until: null }] }));
    const pool = { query } as never;
    const res = await loadModeration(pool, 'r1', 'u1');
    expect(res).toEqual({ kicked: true, muteUntilMs: undefined });
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('FROM chat_moderation');
    expect(sql).toContain('active = true');
    expect(sql).toContain('until IS NULL OR until > now()');
    expect(params).toEqual(['r1', 'u1']);
  });

  it('活跃 mute 行 → muteUntilMs 毫秒；kicked false', async () => {
    const until = new Date(NOW + 60_000);
    const query = vi.fn(async () => ({ rows: [{ kind: 'mute', until }] }));
    const res = await loadModeration({ query } as never, 'r1', 'u1');
    expect(res).toEqual({ kicked: false, muteUntilMs: NOW + 60_000 });
  });

  it('无活跃行 → null；查询失败 → null（fail-open 且不抛）', async () => {
    const empty = vi.fn(async () => ({ rows: [] }));
    expect(await loadModeration({ query: empty } as never, 'r1', 'u1')).toBeNull();
    const boom = vi.fn(async () => {
      throw new Error('pg down');
    });
    expect(await loadModeration({ query: boom } as never, 'r1', 'u1')).toBeNull();
  });
});

describe('sweepExpiredModeration（到期行收口留痕）', () => {
  it('无池 → 0；有池 → UPDATE 置 active=false released_reason=expired', async () => {
    expect(await sweepExpiredModeration(null)).toBe(0);
    const query = vi.fn(async () => ({ rowCount: 2 }));
    const n = await sweepExpiredModeration({ query } as never);
    expect(n).toBe(2);
    const sql = (query.mock.calls[0] as unknown as [string])[0];
    expect(sql).toContain('released_reason =');
    expect(sql).toContain('expired');
    expect(sql).toContain('until IS NOT NULL AND until <= now()');
  });
});
