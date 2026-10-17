import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { grpcServerOptions, resolveProto } from '@yunyan-live/nest-shared';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: grpcServerOptions({
      package: 'mail',
      protoPath: resolveProto('mail.proto'),
      url: `${process.env.GRPC_HOST || '127.0.0.1'}:${process.env.GRPC_PORT || 50053}`
    })
  });

  await app.listen();
  console.log(`Mail service gRPC listening on port ${process.env.GRPC_PORT || 50053}`);
}
bootstrap();
