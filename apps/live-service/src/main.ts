import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { join } from 'path';
import { grpcServerOptions } from '@yunyan-live/nest-shared';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: grpcServerOptions({
      package: 'live',
      protoPath: join(__dirname, '../proto/live.proto'),
      url: `0.0.0.0:${process.env.GRPC_PORT || 50052}`
    })
  });

  await app.listen();
  console.log(`Live service gRPC listening on port ${process.env.GRPC_PORT || 50052}`);
}
bootstrap();
