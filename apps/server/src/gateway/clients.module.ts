import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { grpcClientOptions } from '@yunyan-live/nest-shared';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'MAIL_GRPC',
        transport: Transport.GRPC,
        options: grpcClientOptions({
          package: 'mail',
          protoPath: join(__dirname, '../proto/mail.proto'),
          url: 'localhost:50053'
        })
      },
      {
        name: 'AUTH_GRPC',
        transport: Transport.GRPC,
        options: grpcClientOptions({
          package: 'auth',
          protoPath: join(__dirname, '../proto/auth.proto'),
          url: 'localhost:50051'
        })
      },
      {
        name: 'LIVE_GRPC',
        transport: Transport.GRPC,
        options: grpcClientOptions({
          package: 'live',
          protoPath: join(__dirname, '../proto/live.proto'),
          url: 'localhost:50052'
        })
      }
    ])
  ],
  exports: [ClientsModule]
})
export class GatewayClientsModule {}
