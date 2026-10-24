import { describe, expect, it, vi } from 'vitest';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { AdminService } from './admin.service';
import type { AdminsService } from './admins.service';

/**
 * 回归点：adminLogin 的信封必须与 admin.proto 的 AdminAuthResponse 对齐——
 * 管理员信息放在 data 里，顶层只有 access_token / expires_in。
 * 曾经把字段平铺在顶层，gRPC 序列化后 data 为空，网关读 `result.data.id` 直接 500。
 */
function build(adminOverride?: Record<string, unknown>) {
  const admin = {
    id: 'admin-1',
    username: 'admin',
    email: null,
    role: 1,
    status: 'active',
    lastLoginAt: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    ...adminOverride
  };
  const admins = {
    verifyCredentials: vi.fn().mockResolvedValue(adminOverride === null ? null : admin),
    touchLastLogin: vi.fn().mockResolvedValue(undefined)
  };
  const service = new AdminService(
    admins as unknown as AdminsService,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );
  return { service, admins };
}

describe('AdminService.adminLogin 信封', () => {
  it('管理员信息放在 data，顶层只含 access_token / expires_in', async () => {
    const { service } = build();
    const res = await service.adminLogin({ username: 'admin', password: 'x' });

    expect(res.access_token).toBe('');
    expect(res.expires_in).toBe(0);
    expect(res.data).toMatchObject({
      id: 'admin-1',
      username: 'admin',
      email: '',
      role: 1,
      status: 'active',
      created_at: '2026-10-01T00:00:00.000Z'
    });
    // 平铺字段不应再出现（否则说明信封回退了）
    expect((res as unknown as Record<string, unknown>).id).toBeUndefined();
  });

  it('凭据错误 → UNAUTHENTICATED', async () => {
    const { service } = build(null as unknown as Record<string, unknown>);
    const err = await service.adminLogin({ username: 'admin', password: 'bad' }).catch(e => e);
    expect(err).toBeInstanceOf(RpcException);
    expect((err.getError() as { code: number }).code).toBe(status.UNAUTHENTICATED);
  });

  it('账号停用 → FAILED_PRECONDITION', async () => {
    const { service } = build({ status: 'disabled' });
    const err = await service.adminLogin({ username: 'admin', password: 'x' }).catch(e => e);
    expect(err).toBeInstanceOf(RpcException);
    expect((err.getError() as { code: number }).code).toBe(status.FAILED_PRECONDITION);
  });
});
