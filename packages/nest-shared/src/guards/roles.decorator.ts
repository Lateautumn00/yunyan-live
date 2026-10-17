import { SetMetadata } from '@nestjs/common';

/** 路由级角色白名单元数据键（RolesGuard 读取） */
export const ROLES_KEY = 'roles';

/**
 * 声明处理器允许的 role 列表（口径与 push.controller 一致：1 = 教师，2 = 学生）。
 * 用法：`@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(TEACHER_ROLE)`。
 * 与房间归属断言（assertRoomTeacher）互补：本守卫只管角色，归属仍需接口内断言。
 */
export const Roles = (...roles: number[]) => SetMetadata(ROLES_KEY, roles);
