import { describe, expect, it } from 'vitest';
import {
  keyOf,
  MESSAGE_LIST_LIMIT,
  SEEN_KEYS_LIMIT,
  TIME_GAP_MS,
  useChatMessages,
  type ChatEntry
} from './useChatMessages';

const SELF = { liveUserId: 'u1', isTeacher: false };

function msgs() {
  return useChatMessages({ self: () => SELF });
}

function entry(i: number, overrides: Record<string, unknown> = {}): ChatEntry {
  return {
    msgId: `m-${i}`,
    liveMsg: { msg: `内容${i}`, name: `用户${i % 2}`, time: 1700000000000 + i * 1000 },
    info: { liveUserId: `u${i % 2}`, isTeacher: false },
    ...overrides
  };
}

describe('keyOf 稳定键', () => {
  it('bullet 信封与展示面同源：msgId|time|name|msg', () => {
    const e = entry(1);
    expect(keyOf(e)).toBe('m-1|1700000001000|用户1|内容1');
  });

  it('time 非 number 不进键（不产伪造时间键），与 number 形态不相等', () => {
    const base = { msgId: 'x', liveMsg: { name: 'a', msg: 'b' } };
    const withStr = keyOf({ ...base, liveMsg: { ...base.liveMsg, time: '1700000000000' } });
    const withNum = keyOf({ ...base, liveMsg: { ...base.liveMsg, time: 1700000000000 } });
    expect(withStr).toBe('x||a|b');
    expect(withNum).toBe('x|1700000000000|a|b');
    expect(withStr).not.toContain('1700000000000');
  });

  it('展示面（DisplayMessage）键与信封键一致', () => {
    const m = msgs();
    m.appendLive(entry(5));
    const built = m.messages.value[0]!;
    expect(keyOf(built)).toBe(keyOf(entry(5)));
    expect(built.msgId).toBe('m-5');
  });
});

describe('appendLive 去重与裁剪', () => {
  it('msgId 重复投递只入列一次，不重复渲染', () => {
    const m = msgs();
    expect(m.appendLive(entry(1))).toBe(true);
    expect(m.appendLive(entry(1))).toBe(false);
    expect(m.messages.value).toHaveLength(1);
  });

  it('白板 host 标记消息不入列', () => {
    const m = msgs();
    expect(m.appendLive(entry(2, { liveMsg: { msg: 'x', info: { host: 'stage' } } }))).toBe(false);
    expect(m.messages.value).toHaveLength(0);
  });

  it('超过 500 → 头部裁剪，保留最新 500（端语义）', () => {
    const m = msgs();
    for (let i = 0; i < MESSAGE_LIST_LIMIT + 20; i += 1) m.appendLive(entry(i));
    expect(m.messages.value).toHaveLength(MESSAGE_LIST_LIMIT);
    expect(m.messages.value[0]!.msgId).toBe('m-20'); // 最旧 20 条被裁
    expect(m.messages.value.at(-1)!.msgId).toBe(`m-${MESSAGE_LIST_LIMIT + 19}`);
  });

  it('seenKeys 有界：超 1500 淘汰最旧键，被淘汰键的消息可再次入列', () => {
    const m = msgs();
    for (let i = 0; i <= SEEN_KEYS_LIMIT; i += 1) m.appendLive(entry(i)); // 1501 条 → 淘汰 i=0 的键
    // 第 0 条的键已淘汰（同时消息也被裁剪）→ 同键可再入
    expect(m.appendLive(entry(0))).toBe(true);
    // 尚在窗内的键仍拒绝
    expect(m.appendLive(entry(SEEN_KEYS_LIMIT - 1))).toBe(false);
  });
});

describe('mergeHistory 升序合并', () => {
  it('空列表 + 升序批次 → 原序追加', () => {
    const m = msgs();
    expect(m.mergeHistory([entry(1), entry(2), entry(3)])).toBe(true);
    expect(m.messages.value.map(x => x.msgId)).toEqual(['m-1', 'm-2', 'm-3']);
  });

  it('既有列表中部插入更旧消息 → 归并到正确位置且不重排既有相邻关系', () => {
    const m = msgs();
    m.appendLive(entry(10));
    m.appendLive(entry(30));
    m.mergeHistory([entry(20)]);
    expect(m.messages.value.map(x => x.msgId)).toEqual(['m-10', 'm-20', 'm-30']);
  });

  it('批次含更新消息（断窗补收）→ 追加到尾部', () => {
    const m = msgs();
    m.appendLive(entry(10));
    m.mergeHistory([entry(40), entry(50)]);
    expect(m.messages.value.map(x => x.msgId)).toEqual(['m-10', 'm-40', 'm-50']);
  });

  it('重连重复 50 条：全部键已见 → 不重复、不重排、返回 false', () => {
    const m = msgs();
    const batch = Array.from({ length: 50 }, (_, i) => entry(100 + i));
    m.mergeHistory(batch);
    const before = m.messages.value.map(x => x.msgId);
    expect(m.mergeHistory(batch)).toBe(false);
    expect(m.messages.value.map(x => x.msgId)).toEqual(before);
    expect(m.messages.value).toHaveLength(50);
  });

  it('重连批次部分重叠：仅新增条目并入，重叠部分位置不动', () => {
    const m = msgs();
    const batch = Array.from({ length: 10 }, (_, i) => entry(200 + i)); // 200..209
    m.mergeHistory(batch);
    m.appendLive(entry(210)); // 实时续上 210
    // 重连批次 = 205..215（前6条重叠，211..215 新）
    const again = Array.from({ length: 11 }, (_, i) => entry(205 + i));
    expect(m.mergeHistory(again)).toBe(true);
    expect(m.messages.value.map(x => x.msgId)).toEqual(
      Array.from({ length: 16 }, (_, i) => `m-${200 + i}`)
    );
  });

  it('纯重叠批次不更新 maxSeenTime（时间地板只进不退）', () => {
    const m = msgs();
    m.mergeHistory([entry(1), entry(2)]);
    const seen = m.maxSeenTime();
    m.mergeHistory([entry(1)]);
    expect(m.maxSeenTime()).toBe(seen);
  });
});

describe('未读门（单一漏斗 time > maxSeenTime）', () => {
  it('首连 history 不计：mergeHistory 只抬地板不产出未读判定调用方', () => {
    const m = msgs();
    expect(m.isUnread(1700000001000)).toBe(true); // 地板 0 → 可计
    m.mergeHistory([entry(1), entry(2)]);
    // history 之后地板已抬到批次最大时间；调用方不走 isUnread（gate 本身对 history 无感）
    expect(m.isUnread(1700000002000)).toBe(false);
    expect(m.isUnread(1700000002001)).toBe(true);
  });

  it('断窗实时消息 time > maxSeenTime → 计入；重复投递不重复计', () => {
    const m = msgs();
    m.mergeHistory([entry(1)]); // 地板 = 1700000001000
    const gapBullet = entry(2); // time 更新 → 计入
    expect(m.isUnread(gapBullet.liveMsg!.time as number)).toBe(true);
    m.appendLive(gapBullet);
    // 同批重放（time 等于地板）→ 不再计
    expect(m.isUnread(gapBullet.liveMsg!.time as number)).toBe(false);
  });
});

describe('分组边界重算（showTime / liveUser）', () => {
  it('无 prev → showTime', () => {
    const m = msgs();
    m.appendLive(entry(1));
    expect(m.messages.value[0]!.showTime).toBe(true);
  });

  it('同人 <5min 连发 → 仅首条带时间（对齐 Chat.spec 5 分组用例）', () => {
    const m = msgs();
    const t0 = 1700000000000;
    const mk = (i: number, t: number): ChatEntry => ({
      msgId: `g-${i}`,
      liveMsg: { msg: `m${i}`, name: '同人', time: t },
      info: { liveUserId: 'u9', isTeacher: false }
    });
    m.appendLive(mk(1, t0));
    m.appendLive(mk(2, t0 + 60_000));
    m.appendLive(mk(3, t0 + 400_000)); // 与上条隔 340s > 300s
    expect(m.messages.value.map(x => x.showTime)).toEqual([true, false, true]);
  });

  it('prepend 后原首条 showTime 重算：不再与更旧新邻居重复出时间', () => {
    const m = msgs();
    const t0 = 1700000000000;
    const mk = (id: string, t: number, user: string): ChatEntry => ({
      msgId: id,
      liveMsg: { msg: id, name: user, time: t },
      info: { liveUserId: user, isTeacher: false }
    });
    // 先到同人两条：首条 showTime=true
    m.appendLive(mk('a', t0, 'u9'));
    m.appendLive(mk('b', t0 + 1000, 'u9'));
    expect(m.messages.value[0]!.showTime).toBe(true);
    // prepend 同人更旧一条 → 原首条变成第二条（同人 <5min）→ showTime 重算为 false
    m.mergeHistory([mk('older', t0 - 1000, 'u9')]);
    expect(m.messages.value.map(x => [x.msgId, x.showTime])).toEqual([
      ['older', true],
      ['a', false],
      ['b', false]
    ]);
  });

  it('跨用户边界始终出时间（liveUser=false → showTime=true）', () => {
    const m = msgs();
    m.appendLive(entry(1)); // 用户1
    m.appendLive(entry(2)); // 用户0
    expect(m.messages.value[1]!.liveUser).toBe(false);
    expect(m.messages.value[1]!.showTime).toBe(true);
    expect(TIME_GAP_MS).toBe(300000);
  });
});
