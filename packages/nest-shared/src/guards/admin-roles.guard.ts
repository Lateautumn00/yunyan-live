import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ADMIN_ROLES_KEY } from './admin-roles.decorator';

interface AdminRequestUser {
  user?: { role?: number };
}

/**
 * 管理员角色守卫（批次 7 / GAP-F8）：从 AdminJwtStrategy 注入的 `req.user.role`（admins.role）
 * 读取角色，与 @AdminRoles() 声明比对。
 * - 未声明 @AdminRoles() → 放行
 * - user 缺失 / role 非数字 / 不在白名单 → 403（fail-closed）
 */
@Injectable()
export class AdminRolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const required: number[] | undefined = Reflect.getMetadata(
      ADMIN_ROLES_KEY,
      context.getHandler()
    );
    if (!required || required.length === 0) return true;
    const req = context.switchToHttp().getRequest<AdminRequestUser>();
    const role = req.user?.role;
    return typeof role === 'number' && required.includes(role);
  }
}
