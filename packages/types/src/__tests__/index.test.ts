import { describe, expect, it } from 'vitest';
import type { ApiResult, LiveInfo, SessionTokens, UserInfo } from '../common';
import type { JanusSession, RemoteFeed, VideoRoomMessage } from '../janus';

describe('shared domain types (compile-time contract)', () => {
  it('UserInfo shape', () => {
    const user: UserInfo = {
      guid: 'g1',
      token: 't1',
      userName: 'u1',
      email: 'a@b.com',
      role: 1
    };
    expect(user.guid).toBe('g1');
    expect(user.role).toBe(1);
  });

  it('LiveInfo shape', () => {
    const live: LiveInfo = { liveUserId: '1', nickName: 'n', joinCode: 'j' };
    expect(live.joinCode).toBe('j');
  });

  it('ApiResult accepts optional data/msg', () => {
    const ok: ApiResult = { code: 1000 };
    const withData: ApiResult<{ id: number }> = { code: 1000, data: { id: 1 } };
    const err: ApiResult = { code: 4001, msg: 'bad' };
    expect(ok.code).toBe(1000);
    expect(withData.data?.id).toBe(1);
    expect(err.msg).toBe('bad');
  });

  it('SessionTokens shape', () => {
    const t: SessionTokens = { token: 't', guid: 'g' };
    expect(t).toMatchObject({ token: 't', guid: 'g' });
  });

  it('Janus types stay structurally compatible', () => {
    const feed: RemoteFeed = { id: '1', display: 'd', audio: true, video: true };
    const msg: VideoRoomMessage = { videoroom: 'joined', room: 1234 };
    expect(feed.display).toBe('d');
    expect(msg.room).toBe(1234);
    const session: Pick<JanusSession, 'isConnected'> = { isConnected: () => true };
    expect(session.isConnected()).toBe(true);
  });
});
