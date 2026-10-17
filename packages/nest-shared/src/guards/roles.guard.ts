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
 * S4（补偿控制）：域层下沉待 S10b（gRPC 身份可信）落地。
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
