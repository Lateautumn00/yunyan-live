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
          url: 'localhost:50053'
        })
      },
      {
        name: 'AUTH_GRPC',
        transport: Transport.GRPC,
        options: grpcClientOptions({
          package: 'auth',
          protoPath: resolveProto('auth.proto'),
          url: 'localhost:50051'
        })
      },
      {
        name: 'LIVE_GRPC',
        transport: Transport.GRPC,
        options: grpcClientOptions({
          package: 'live',
          protoPath: resolveProto('live.proto'),
          url: 'localhost:50052'
        })
      }
    ])
  ],
  exports: [ClientsModule]
})
export class GatewayClientsModule {}
