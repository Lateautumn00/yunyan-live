import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { grpcClientOptions, jwtModuleAsyncOptions, resolveProto } from '@yunyan-live/nest-shared';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    ConfigModule,
    JwtModule.registerAsync(jwtModuleAsyncOptions()),
    ClientsModule.register([
      {
        name: 'MAIL_GRPC',
        transport: Transport.GRPC,
        options: grpcClientOptions({
          package: 'mail',
          protoPath: resolveProto('mail.proto'),
          url: process.env.MAIL_GRPC_URL || 'localhost:50053'
        })
      }
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
