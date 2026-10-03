import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { jwtModuleAsyncOptions, SessionService } from '@yunyan-live/nest-shared';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
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
