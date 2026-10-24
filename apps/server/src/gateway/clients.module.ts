import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { grpcClientOptions, resolveProto } from '@yunyan-live/nest-shared';
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'MAIL_GRPC',
        transport: Transport.GRPC,
        options: grpcClientOptions({
          package: 'mail',
          protoPath: resolveProto('mail.proto'),
          url: process.env.MAIL_GRPC_URL || 'localhost:50053'
        })
      },
      {
        name: 'AUTH_GRPC',
        transport: Transport.GRPC,
        options: grpcClientOptions({
          package: 'auth',
          protoPath: resolveProto('auth.proto'),
          url: process.env.AUTH_GRPC_URL || 'localhost:50051'
        })
      },
      {
        name: 'LIVE_GRPC',
        transport: Transport.GRPC,
        options: grpcClientOptions({
          package: 'live',
          protoPath: resolveProto('live.proto'),
          url: process.env.LIVE_GRPC_URL || 'localhost:50052'
        })
      },
      {
        name: 'ADMIN_GRPC',
        transport: Transport.GRPC,
        options: grpcClientOptions({
          package: 'admin',
          protoPath: resolveProto('admin.proto'),
          url: process.env.ADMIN_GRPC_URL || 'localhost:50056'
        })
      }
    ])
  ],
  exports: [ClientsModule]
})
export class GatewayClientsModule {}
