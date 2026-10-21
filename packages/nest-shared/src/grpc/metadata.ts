import { createHmac, timingSafeEqual } from 'node:crypto';
import { Metadata } from '@grpc/grpc-js';

export const USER_ID_KEY = 'user-id';
export const USER_TS_KEY = 'user-ts';
export const USER_SIG_KEY = 'user-sig';

/** 签名时间戳最大允许偏差（防重放窗口） */
export const USER_SIG_MAX_AGE_MS = 5 * 60_000;

function computeUserSig(userId: string, ts: string, secret: string): string {
  return createHmac('sha256', secret).update(`${userId}:${ts}`).digest('hex');
}

/**
 * GAP-S10b：携带 user-id 的 gRPC 调用自动附带 HMAC 签名（user-ts + user-sig）。
 * secret 缺省读 GRPC_SHARED_SECRET；未配置时保持裸 user-id（本地开发零变化），
 * 服务端相应跳过验签。调用点无需改动。
 */
export function userIdMetadata(
  userId: string,
  secret: string | undefined = process.env.GRPC_SHARED_SECRET
): Metadata {
  const metadata = new Metadata();
  metadata.add(USER_ID_KEY, userId);
  if (secret) {
    const ts = String(Date.now());
    metadata.add(USER_TS_KEY, ts);
    metadata.add(USER_SIG_KEY, computeUserSig(userId, ts, secret));
  }
  return metadata;
}

export type UserCallVerifyResult =
  'ok' | 'absent' | 'no-secret' | 'missing' | 'stale' | 'bad-signature';

/**
 * GAP-S10b 服务端验签（纯函数，便于单测）。
 * - absent：未携带 user-id（系统调用）→ 放行
 * - no-secret：服务端未配置密钥（本地开发）→ 放行
 * - missing/stale/bad-signature → 拒绝
 */
export function verifyUserCall(
  metadata: Metadata | undefined,
  secret: string | undefined,
  now: number = Date.now()
): UserCallVerifyResult {
  const userId = metadata?.get(USER_ID_KEY)?.[0];
  if (userId === undefined || userId === '') return 'absent';
  if (!secret) return 'no-secret';
  const ts = metadata?.get(USER_TS_KEY)?.[0];
  const sig = metadata?.get(USER_SIG_KEY)?.[0];
  if (typeof ts !== 'string' || typeof sig !== 'string' || ts === '' || sig === '') {
    return 'missing';
  }
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(now - tsNum) > USER_SIG_MAX_AGE_MS) return 'stale';
  const expected = Buffer.from(computeUserSig(String(userId), ts, secret), 'utf8');
  const actual = Buffer.from(sig, 'utf8');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return 'bad-signature';
  }
  return 'ok';
}

export function userIdFromMetadata(metadata: Metadata): string {
  return metadata.get(USER_ID_KEY)?.[0] as string;
}
