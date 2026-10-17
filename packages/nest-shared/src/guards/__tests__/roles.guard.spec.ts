import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { RolesGuard } from '../roles.guard';
import { Roles, ROLES_KEY } from '../roles.decorator';

const TEACHER = 1;
const STUDENT = 2;

function makeContext(handler: (...args: unknown[]) => unknown, user?: { role?: number }) {
  return {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => ({ user }) })
  } as never;
}

describe('Roles 装饰器', () => {
  it('把角色白名单写入 ROLES_KEY 元数据', () => {
    const handler = () => undefined;
    Roles(TEACHER)(handler);
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([TEACHER]);
  });
});

describe('RolesGuard', () => {
  it('未声明 @Roles() → 放行（含未登录场景）', () => {
    const guard = new RolesGuard();
    const handler = () => undefined;
    expect(guard.canActivate(makeContext(handler, undefined))).toBe(true);
  });

  it('声明 @Roles(教师) 且 user.role=1 → 放行', () => {
    const guard = new RolesGuard();
    const handler = () => undefined;
    Roles(TEACHER)(handler);
    expect(guard.canActivate(makeContext(handler, { role: TEACHER }))).toBe(true);
  });

  it('声明 @Roles(教师) 且 user.role=2（学生）→ 拒绝', () => {
    const guard = new RolesGuard();
    const handler = () => undefined;
    Roles(TEACHER)(handler);
    expect(guard.canActivate(makeContext(handler, { role: STUDENT }))).toBe(false);
  });

  it('声明 @Roles(教师) 且 user 缺失 → 拒绝（fail-closed）', () => {
    const guard = new RolesGuard();
    const handler = () => undefined;
    Roles(TEACHER)(handler);
    expect(guard.canActivate(makeContext(handler, undefined))).toBe(false);
  });

  it('role 非数字（payload 异常）→ 拒绝（fail-closed）', () => {
    const guard = new RolesGuard();
    const handler = () => undefined;
    Roles(TEACHER)(handler);
    expect(guard.canActivate(makeContext(handler, { role: '1' as never }))).toBe(false);
  });

  it('多角色白名单任一命中即放行', () => {
    const guard = new RolesGuard();
    const handler = () => undefined;
    Roles(TEACHER, STUDENT)(handler);
    expect(guard.canActivate(makeContext(handler, { role: STUDENT }))).toBe(true);
  });
});
