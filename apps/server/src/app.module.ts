import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { RedisModule } from '@yunyan-live/nest-shared';
import { GatewayClientsModule } from './gateway/clients.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LiveModule } from './live/live.module';
import { MailModule } from './mail/mail.module';
import { UploadModule } from './upload/upload.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DEFAULT_THROTTLE, RateLimitGuard } from './common/guards/rate-limit.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 数组形式：commonOptions 置空，key 生成与 429 响应统一由 RateLimitGuard 覆写决定
    ThrottlerModule.forRoot([DEFAULT_THROTTLE]),
    RedisModule,
    GatewayClientsModule,
    AuthModule,
    UsersModule,
    LiveModule,
    MailModule,
    UploadModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard
    }
  ]
})
export class AppModule {}
