import { Metadata } from '@grpc/grpc-js';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_ID_KEY,
  ADMIN_SIG_KEY,
  ADMIN_TS_KEY,
  USER_ID_KEY,
  USER_SIG_MAX_AGE_MS,
  USER_SIG_KEY,
  USER_TS_KEY,
  adminIdFromMetadata,
  adminIdMetadata,
  userIdMetadata,
  verifyAdminCall,
  verifyUserCall
} from '../metadata';

const SECRET = 'test-shared-secret';

describe('userIdMetadata 签名', () => {
  it('携带 secret 时写入 user-id/user-ts/user-sig 三键', () => {
    const md = userIdMetadata('u1', SECRET);
    expect(md.get(USER_ID_KEY)[0]?.toString()).toBe('u1');
    expect(md.get(USER_TS_KEY)[0]?.toString()).toMatch(/^\d+$/);
    expect(md.get(USER_SIG_KEY)[0]?.toString()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('未携带 secret 时仅写 user-id（本地开发零变化）', () => {
    const md = userIdMetadata('u1', undefined);
    expect(md.get(USER_ID_KEY)[0]?.toString()).toBe('u1');
    expect(md.get(USER_TS_KEY)).toHaveLength(0);
    expect(md.get(USER_SIG_KEY)).toHaveLength(0);
    expect(verifyUserCall(md, undefined)).toBe('no-secret');
  });
});

describe('verifyUserCall 五态', () => {
  it('ok：合法签名放行', () => {
    expect(verifyUserCall(userIdMetadata('u1', SECRET), SECRET)).toBe('ok');
  });

  it('absent：无 user-id（系统调用）放行', () => {
    expect(verifyUserCall(new Metadata(), SECRET)).toBe('absent');
    expect(verifyUserCall(undefined, SECRET)).toBe('absent');
    const empty = new Metadata();
    empty.add(USER_ID_KEY, '');
    expect(verifyUserCall(empty, SECRET)).toBe('absent');
  });

  it('no-secret：服务端未配置密钥放行', () => {
    const md = new Metadata();
    md.add(USER_ID_KEY, 'u1');
    expect(verifyUserCall(md, undefined)).toBe('no-secret');
  });

  it('missing：有 user-id 但缺 user-ts 或 user-sig 拒绝', () => {
    const bare = new Metadata();
    bare.add(USER_ID_KEY, 'u1');
    expect(verifyUserCall(bare, SECRET)).toBe('missing');

    const onlyTs = userIdMetadata('u1', SECRET);
    onlyTs.remove(USER_SIG_KEY);
    expect(verifyUserCall(onlyTs, SECRET)).toBe('missing');

    const onlySig = userIdMetadata('u1', SECRET);
    onlySig.remove(USER_TS_KEY);
    expect(verifyUserCall(onlySig, SECRET)).toBe('missing');
  });

  it('stale：时间戳超出 ±5 分钟窗口（过期与超前）拒绝', () => {
    const now = Date.now();

    const past = userIdMetadata('u1', SECRET);
    past.remove(USER_TS_KEY);
    past.add(USER_TS_KEY, String(now - USER_SIG_MAX_AGE_MS - 1000));
    expect(verifyUserCall(past, SECRET, now)).toBe('stale');

    const future = userIdMetadata('u1', SECRET);
    future.remove(USER_TS_KEY);
    future.add(USER_TS_KEY, String(now + USER_SIG_MAX_AGE_MS + 1000));
    expect(verifyUserCall(future, SECRET, now)).toBe('stale');

    expect(verifyUserCall(userIdMetadata('u1', SECRET), SECRET, now)).toBe('ok');
  });

  it('bad-signature：篡改签名/换用户/换密钥均拒绝', () => {
    const tampered = userIdMetadata('u1', SECRET);
    tampered.remove(USER_SIG_KEY);
    tampered.add(USER_SIG_KEY, 'f'.repeat(64));
    expect(verifyUserCall(tampered, SECRET)).toBe('bad-signature');

    const relabeled = userIdMetadata('u1', SECRET);
    relabeled.remove(USER_ID_KEY);
    relabeled.add(USER_ID_KEY, 'u2');
    expect(verifyUserCall(relabeled, SECRET)).toBe('bad-signature');

    expect(verifyUserCall(userIdMetadata('u1', SECRET), 'other-secret')).toBe('bad-signature');
  });

  it('时间戳非数字：无法判定窗口，按 stale 拒绝', () => {
    const md = userIdMetadata('u1', SECRET);
    md.remove(USER_TS_KEY);
    md.add(USER_TS_KEY, 'not-a-number');
    expect(verifyUserCall(md, SECRET)).toBe('stale');
  });
});

describe('批次 7c：管理员身份签名', () => {
  it('adminIdMetadata 写独立 key，不与 user-id 混用', () => {
    const md = adminIdMetadata('admin-1', SECRET);
    expect(md.get(ADMIN_ID_KEY)[0]?.toString()).toBe('admin-1');
    expect(md.get(ADMIN_TS_KEY)[0]?.toString()).toMatch(/^\d+$/);
    expect(md.get(ADMIN_SIG_KEY)[0]?.toString()).toMatch(/^[0-9a-f]{64}$/);
    expect(md.get(USER_ID_KEY)).toHaveLength(0);
  });

  it('管理员签名不能冒充用户身份，反之亦然', () => {
    expect(verifyAdminCall(adminIdMetadata('admin-1', SECRET), SECRET)).toBe('ok');
    // 用户签名里没有 admin-id → absent
    expect(verifyAdminCall(userIdMetadata('u1', SECRET), SECRET)).toBe('absent');
    // 管理签名里没有 user-id → 用户链路 absent
    expect(verifyUserCall(adminIdMetadata('admin-1', SECRET), SECRET)).toBe('absent');
  });

  it('换密钥/篡改签名/过窗 → 不视为管理员', () => {
    const now = Date.now();
    expect(verifyAdminCall(adminIdMetadata('admin-1', 'other-secret'), SECRET)).toBe(
      'bad-signature'
    );
    expect(adminIdFromMetadata(adminIdMetadata('admin-1', 'other-secret'), SECRET)).toBeUndefined();

    const stale = adminIdMetadata('admin-1', SECRET);
    stale.remove(ADMIN_TS_KEY);
    stale.add(ADMIN_TS_KEY, String(now - USER_SIG_MAX_AGE_MS - 1000));
    expect(verifyAdminCall(stale, SECRET, now)).toBe('stale');
    expect(adminIdFromMetadata(stale, SECRET, now)).toBeUndefined();
  });

  it('本地开发（无密钥）：no-secret 放行，与 user 链路同口径', () => {
    const md = adminIdMetadata('admin-1', undefined);
    expect(verifyAdminCall(md, undefined)).toBe('no-secret');
    expect(adminIdFromMetadata(md, undefined)).toBe('admin-1');
    // 无 admin-id 时始终 undefined（不误判为管理员）
    expect(adminIdFromMetadata(new Metadata(), SECRET)).toBeUndefined();
    expect(adminIdFromMetadata(undefined, SECRET)).toBeUndefined();
  });
});
