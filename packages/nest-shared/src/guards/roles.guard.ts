import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ROLES_KEY } from './roles.decorator';

interface RequestWithUser {
  user?: { role?: number };
}

/**
 * 角色守卫：从 JWT 策略注入的 `req.user.role` 读取角色，与 @Roles() 声明比对。
 * - 未声明 @Roles() → 放行（守卫可全局挂载）
 * - user 缺失/role 不在白名单 → 403
 *
 * S4：角色守卫留边缘（JWT role）；房间归属校验已下沉 live-service 域层（S10b 验签 metadata）。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const required: number[] | undefined = Reflect.getMetadata(ROLES_KEY, context.getHandler());
    if (!required || required.length === 0) return true;
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const role = req.user?.role;
    return typeof role === 'number' && required.includes(role);
  }
}
