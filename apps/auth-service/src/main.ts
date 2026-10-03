import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { grpcServerOptions, resolveProto } from '@yunyan-live/nest-shared';import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: grpcServerOptions({
      package: 'auth',
      protoPath: resolveProto('auth.proto'),
      url: `0.0.0.0:${process.env.GRPC_PORT || 50051}`
    })
  });

  await app.listen();
  console.log(`Auth service gRPC listening on port ${process.env.GRPC_PORT || 50051}`);
}
bootstrap();
