import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin, User } from '@yunyan-live/shared';
import {
  AdminJwtAuthGuard,
  AdminJwtStrategy,
  AdminRolesGuard,
  AuditModule,
  RedisModule,
  SessionService,
  jwtModuleAsyncOptions
} from '@yunyan-live/nest-shared';
import { AdminService } from '../admin/admin.service';
import { AdminsService } from '../admin/admins.service';
import { UsersAdminService } from '../users-admin/users-admin.service';
import { LiveAdminService } from '../live-admin/live-admin.service';
import { DashboardAdminService } from '../dashboard-admin/dashboard-admin.service';
import { AuditAdminService } from '../audit-admin/audit-admin.service';
import { AdminHttpController } from './admin-http.controller';
import { LoginThrottleGuard } from './login-throttle.guard';
import { JanusClient } from './janus.client';

/**
 * 管理后台 HTTP 面（单进程，无微服务）：
 * - 鉴权：AdminJwtStrategy（audience=admin）+ AdminRolesGuard，与用户 JWT 物理隔离
 * - 数据：本服务直连共享库（TypeORM / DataSource），不再经网关或 gRPC
 * - 副作用：封禁踢会话走 Redis SessionService；审计走 AuditModule（RabbitMQ）
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Admin, User]),
    RedisModule,
    AuditModule,
    PassportModule,
    JwtModule.registerAsync(jwtModuleAsyncOptions())
  ],
  controllers: [AdminHttpController],
  providers: [
    AdminService,
    AdminsService,
    UsersAdminService,
    LiveAdminService,
    DashboardAdminService,
    AuditAdminService,
    JanusClient,
    SessionService,
    AdminJwtStrategy,
    AdminJwtAuthGuard,
    AdminRolesGuard,
    LoginThrottleGuard
  ]
})
export class AdminHttpModule {}
