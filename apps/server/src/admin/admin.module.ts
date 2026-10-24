import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import {
  AdminJwtStrategy,
  AdminJwtAuthGuard,
  AdminRolesGuard,
  AuditModule,
  RedisModule,
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
  providers: [AdminJwtStrategy, AdminJwtAuthGuard, AdminRolesGuard]
})
export class AdminModule {}
