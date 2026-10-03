import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { jwtModuleAsyncOptions, JwtStrategy, SessionService } from '@yunyan-live/nest-shared';
import { AuthController } from './auth.controller';
import { GatewayClientsModule } from '../gateway/clients.module';

@Module({
  imports: [
    GatewayClientsModule,
    PassportModule,
    JwtModule.registerAsync(jwtModuleAsyncOptions()),
  ],
  controllers: [AuthController],
  providers: [JwtStrategy, SessionService],
})
export class AuthModule {}
