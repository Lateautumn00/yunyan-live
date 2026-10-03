import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { grpcServerOptions, resolveProto } from '@yunyan-live/nest-shared';import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: grpcServerOptions({
      package: 'live',
      protoPath: resolveProto('live.proto'),
      url: `0.0.0.0:${process.env.GRPC_PORT || 50052}`
    })
  });

  await app.listen();
  console.log(`Live service gRPC listening on port ${process.env.GRPC_PORT || 50052}`);
}
bootstrap();
