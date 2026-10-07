import { describe, expect, it } from 'vitest';
import { CHAT_LIMITS } from '@yunyan-live/types';
import { buildBullet, sanitizeName, type BulletContext } from './bullet';

function rawBullet(data: Record<string, unknown>): string {
  return JSON.stringify({ type: 'bullet', data });
}

function liveMsg(data: Record<string, unknown>): string {
  return rawBullet({ liveMsg: data, info: { type: 1, isTeacher: false, liveUserId: 'u9' } });
}

function ctx(overrides: Partial<BulletContext> = {}): BulletContext {
  return {
    roomId: 'r1',
    nickName: '连接昵称',
    liveUserId: 'u1',
    isTeacher: false,
    msgId: '00000000-0000-4000-8000-000000000001',
    senderId: 's1',
    ...overrides
  };
}

function parsed(result: ReturnType<typeof buildBullet>): {
  type?: string;
  data?: { liveMsg?: Record<string, unknown>; info?: Record<string, unknown>; msgId?: string };
} {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return JSON.parse(result.payload);
}

describe('buildBullet 禁言极性（FORBID_FORBIDDEN=0 禁言，FORBID_ALLOWED=1 可发言）', () => {
  it('forbid=1 可发言 + 学生 → 放行', () => {
    expect(buildBullet(liveMsg({ msg: 'hi' }), ctx({ forbid: 1 })).ok).toBe(true);
  });

  it('forbid=0 禁言 + 学生 → 拒发 forbidden', () => {
    const result = buildBullet(liveMsg({ msg: 'hi' }), ctx({ forbid: 0 }));
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('forbid=0 禁言 + 教师 → 放行', () => {
    expect(buildBullet(liveMsg({ msg: 'hi' }), ctx({ forbid: 0, isTeacher: true })).ok).toBe(true);
  });

  it('forbid=undefined 未知 → fail-open 放行', () => {
    expect(buildBullet(liveMsg({ msg: 'hi' }), ctx({ forbid: undefined })).ok).toBe(true);
  });
});

describe('buildBullet 长度与空串', () => {
  it('199 字放行且不截断', () => {
    const text = 'a'.repeat(199);
    const out = parsed(buildBullet(liveMsg({ msg: text }), ctx()));
    expect(out.data?.liveMsg?.msg).toBe(text);
  });

  it('200 字放行且不截断', () => {
    const text = 'a'.repeat(200);
    const out = parsed(buildBullet(liveMsg({ msg: text }), ctx()));
    expect(out.data?.liveMsg?.msg).toBe(text);
  });

  it('201 字截断至 200（旧客户端无 maxlength，不拒发）', () => {
    const text = 'a'.repeat(201);
    const out = parsed(buildBullet(liveMsg({ msg: text }), ctx()));
    expect(out.data?.liveMsg?.msg).toHaveLength(CHAT_LIMITS.MAX_MESSAGE_LENGTH);
  });

  it('空串拒 invalid', () => {
    expect(buildBullet(liveMsg({ msg: '' }), ctx())).toEqual({ ok: false, reason: 'invalid' });
  });

  it('缺 msg 拒 invalid', () => {
    expect(buildBullet(liveMsg({}), ctx())).toEqual({ ok: false, reason: 'invalid' });
  });

  it('非 JSON 拒 invalid', () => {
    expect(buildBullet('not json', ctx())).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('buildBullet 身份重建', () => {
  it('payload 伪造 info.isTeacher:true 被 JWT 覆盖为 false', () => {
    const raw = rawBullet({
      liveMsg: { msg: 'hi' },
      info: { type: 1, isTeacher: true, liveUserId: 'u9' }
    });
    const out = parsed(buildBullet(raw, ctx({ isTeacher: false })));
    expect(out.data?.info?.isTeacher).toBe(false);
  });

  it('JWT 教师身份重建为 true（payload 声明 false 无效）', () => {
    const raw = rawBullet({
      liveMsg: { msg: 'hi' },
      info: { type: 1, isTeacher: false, liveUserId: 'u9' }
    });
    const out = parsed(buildBullet(raw, ctx({ isTeacher: true })));
    expect(out.data?.info?.isTeacher).toBe(true);
  });

  it('name/liveUserId 被连接期值覆盖', () => {
    const raw = rawBullet({
      liveMsg: { msg: 'hi', name: '伪造名' },
      info: { type: 1, isTeacher: false, liveUserId: '伪造id' }
    });
    const out = parsed(buildBullet(raw, ctx()));
    expect(out.data?.liveMsg?.name).toBe('连接昵称');
    expect(out.data?.info?.liveUserId).toBe('u1');
  });

  it('连接期 nickName 为空时回退 payload name 并清洗', () => {
    const raw = rawBullet({ liveMsg: { msg: 'hi', name: '回退名' } });
    const out = parsed(buildBullet(raw, ctx({ nickName: '' })));
    expect(out.data?.liveMsg?.name).toBe('回退名');
  });

  it('payload name 含控制符被剔除', () => {
    const raw = rawBullet({ liveMsg: { msg: 'hi', name: 'ab\u0000\u0007cd' } });
    const out = parsed(buildBullet(raw, ctx({ nickName: '' })));
    expect(out.data?.liveMsg?.name).toBe('abcd');
  });
});

describe('sanitizeName', () => {
  it('非 string 返回空串', () => {
    expect(sanitizeName(undefined)).toBe('');
    expect(sanitizeName(42)).toBe('');
    expect(sanitizeName(null)).toBe('');
  });

  it('截断至 MAX_NAME_LENGTH', () => {
    expect(sanitizeName('一'.repeat(60))).toHaveLength(CHAT_LIMITS.MAX_NAME_LENGTH);
  });

  it('剔除控制字符但保留 emoji 等多字节字符', () => {
    expect(sanitizeName('张\u001f三😀')).toBe('张三😀');
  });
});

describe('buildBullet mentions 清洗', () => {
  const mention = (userId: string, userName: string) => ({ userId, userName });

  it('缺 mentions 不带该字段', () => {
    const out = parsed(buildBullet(liveMsg({ msg: 'hi' }), ctx()));
    expect('mentions' in (out.data?.liveMsg ?? {})).toBe(false);
  });

  it('非数组拒 invalid', () => {
    expect(buildBullet(liveMsg({ msg: 'hi', mentions: 'x' }), ctx())).toEqual({
      ok: false,
      reason: 'invalid'
    });
    expect(buildBullet(liveMsg({ msg: 'hi', mentions: {} }), ctx())).toEqual({
      ok: false,
      reason: 'invalid'
    });
  });

  it('单条 userName 超 64 截断', () => {
    const out = parsed(
      buildBullet(liveMsg({ msg: 'hi', mentions: [mention('u2', '一'.repeat(70))] }), ctx())
    );
    const mentions = out.data?.liveMsg?.mentions as Array<{ userName: string }>;
    expect(mentions[0].userName).toHaveLength(CHAT_LIMITS.MAX_MENTION_NAME_LENGTH);
  });

  it('超过 50 条截断', () => {
    const many = Array.from({ length: 60 }, (_, i) => mention(`u${i}`, `n${i}`));
    const out = parsed(buildBullet(liveMsg({ msg: 'hi', mentions: many }), ctx()));
    const mentions = out.data?.liveMsg?.mentions as unknown[];
    expect(mentions).toHaveLength(CHAT_LIMITS.MAX_MENTIONS);
  });

  it('非法条目（缺 userId / 非 string userName）被丢弃', () => {
    const out = parsed(
      buildBullet(
        liveMsg({
          msg: 'hi',
          mentions: [mention('u2', 'ok'), { userName: 123 }, 'junk', { userId: '', userName: 'x' }]
        }),
        ctx()
      )
    );
    const mentions = out.data?.liveMsg?.mentions as Array<{ userId: string }>;
    expect(mentions).toEqual([{ userId: 'u2', userName: 'ok' }]);
  });

  it("非教师的 'all' 条目被剥离", () => {
    const out = parsed(
      buildBullet(
        liveMsg({ msg: 'hi', mentions: [mention('all', '所有人'), mention('u2', '李四')] }),
        ctx({ isTeacher: false })
      )
    );
    expect(out.data?.liveMsg?.mentions).toEqual([{ userId: 'u2', userName: '李四' }]);
  });

  it("教师的 'all' 条目保留", () => {
    const out = parsed(
      buildBullet(
        liveMsg({ msg: 'hi', mentions: [mention('all', '所有人')] }),
        ctx({ isTeacher: true })
      )
    );
    expect(out.data?.liveMsg?.mentions).toEqual([{ userId: 'all', userName: '所有人' }]);
  });

  it('全部条目非法时 mentions 为空数组不带字段', () => {
    const out = parsed(buildBullet(liveMsg({ msg: 'hi', mentions: ['junk'] }), ctx()));
    expect('mentions' in (out.data?.liveMsg ?? {})).toBe(false);
  });
});

describe('buildBullet 信封形状与时间戳', () => {
  it('重建后外层键集合不变（type/data），data 键为 liveMsg/info', () => {
    const out = parsed(buildBullet(liveMsg({ msg: 'hi' }), ctx()));
    expect(Object.keys(out)).toEqual(['type', 'data']);
    expect(out.type).toBe('bullet');
    expect(Object.keys(out.data ?? {}).sort()).toEqual(['info', 'liveMsg', 'msgId']);
    expect(Object.keys(out.data?.liveMsg ?? {})).toEqual(['msg', 'roomId', 'name', 'time']);
  });

  it('liveMsg.info.host 早退字段透传保留', () => {
    const raw = rawBullet({ liveMsg: { msg: 'hi', info: { host: 'stage' } } });
    const out = parsed(buildBullet(raw, ctx()));
    expect(out.data?.liveMsg?.info).toEqual({ host: 'stage' });
  });

  it('注入服务端权威 time 且为毫秒时间戳', () => {
    const before = Date.now();
    const out = parsed(buildBullet(liveMsg({ msg: 'hi' }), ctx()));
    const time = out.data?.liveMsg?.time as number;
    expect(time).toBeGreaterThanOrEqual(before);
    expect(time).toBeLessThanOrEqual(Date.now());
  });

  it('roomId 取连接期权威值', () => {
    const raw = rawBullet({ liveMsg: { msg: 'hi', roomId: '伪造房' } });
    const out = parsed(buildBullet(raw, ctx({ roomId: 'r1' })));
    expect(out.data?.liveMsg?.roomId).toBe('r1');
  });

  it('info.type 缺失时不带该字段', () => {
    const raw = JSON.stringify({ type: 'bullet', data: { liveMsg: { msg: 'hi' } } });
    const out = parsed(buildBullet(raw, ctx()));
    expect('type' in (out.data?.info ?? {})).toBe(false);
  });
});

describe('buildBullet 持久化行（方案 §4.1）', () => {
  it('data.msgId 注入为连接期权威值', () => {
    const out = parsed(buildBullet(liveMsg({ msg: 'hi' }), ctx({ msgId: 'mid-1' })));
    expect(out.data?.msgId).toBe('mid-1');
  });

  it('客户端伪造 msgId 被连接期权威值覆盖', () => {
    const raw = rawBullet({ liveMsg: { msg: 'hi' }, msgId: 'forged' });
    const out = parsed(buildBullet(raw, ctx({ msgId: 'mid-2' })));
    expect(out.data?.msgId).toBe('mid-2');
  });

  it('entry 字段齐全：msgId/senderId/extra 结构/createdAtMs 与信封 time 一致', () => {
    const result = buildBullet(
      rawBullet({ liveMsg: { msg: 'hi', mentions: [{ userId: 'u2', userName: '小明' }] } }),
      ctx({ msgId: 'mid-3', senderId: 's3', liveUserId: 'u7' })
    );
    expect(result.ok).toBe(true);
    if (!result.ok || !result.entry) throw new Error('expected entry');
    const entry = result.entry;
    expect(entry.msgId).toBe('mid-3');
    expect(entry.senderId).toBe('s3');
    expect(entry.roomId).toBe('r1');
    expect(entry.content).toBe('hi');
    expect(entry.msgType).toBe(1);
    expect(entry.mentions).toEqual([{ userId: 'u2', userName: '小明' }]);
    expect(entry.extra).toEqual({ liveUserId: 'u7' });
    const envelope = parsed(result);
    expect(entry.createdAtMs).toBe(envelope.data?.liveMsg?.time as number);
  });

  it('白板 host 标记消息不落库（entry undefined），但照常广播', () => {
    const result = buildBullet(
      rawBullet({ liveMsg: { msg: '{"ops":[]}', info: { host: 'stage' } } }),
      ctx({ msgId: 'mid-4' })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.entry).toBeUndefined();
    expect(JSON.parse(result.payload).data.liveMsg.info).toEqual({ host: 'stage' });
  });

  it('拒发时无 payload 也无 entry（result.ok=false 即终点）', () => {
    const result = buildBullet(liveMsg({ msg: 'hi' }), ctx({ forbid: 0 }));
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });
});
