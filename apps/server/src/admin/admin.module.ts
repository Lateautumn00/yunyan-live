import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import {
  AdminJwtStrategy,
  AdminJwtAuthGuard,
  AdminRolesGuard,
  AuditModule,
  RedisModule,
  SessionService,
  jwtModuleAsyncOptions
} from '@yunyan-live/nest-shared';
import { GatewayClientsModule } from '../gateway/clients.module';
import { AdminController } from './admin.controller';

/**
 * 批次 7 / GAP-F8：管理后台网关模块（/admin 路由组）。
 * 鉴权：独立 AdminJwtStrategy（audience=admin）+ AdminRolesGuard，与用户链路物理隔离。
 * 数据面：经 ADMIN_GRPC 转发到独立 admin-service（:50056），gateway 不直连 admins/users 管理表。
 */
@Module({
  imports: [
    GatewayClientsModule,
    RedisModule,
    AuditModule,
    PassportModule,
    JwtModule.registerAsync(jwtModuleAsyncOptions())
  ],
  controllers: [AdminController],
  // SessionService：封禁时踢在线会话（与 AuthModule 同源，RedisModule 为 @Global）
  providers: [AdminJwtStrategy, AdminJwtAuthGuard, AdminRolesGuard, SessionService]
})
export class AdminModule {}
