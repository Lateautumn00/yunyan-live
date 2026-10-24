import { SetMetadata } from '@nestjs/common';

/** 路由级管理员角色白名单元数据键（AdminRolesGuard 读取；与用户侧 ROLES_KEY 物理隔离） */
export const ADMIN_ROLES_KEY = 'adminRoles';

/**
 * 声明管理员处理器允许的 admin role 列表（admins.role 值域：1 = 超管(admin)，2 = 运营(operator)）。
 * 用法：`@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)` + `@AdminRoles(1)`。
 * 数字与 users.role 同值域但语义不同，靠独立 audience JWT + 独立元数据键隔离，不混用。
 */
export const AdminRoles = (...roles: number[]) => SetMetadata(ADMIN_ROLES_KEY, roles);
