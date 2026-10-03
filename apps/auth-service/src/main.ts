import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { grpcServerOptions, resolveProto, validationPipeOptions } from '@yunyan-live/nest-shared';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: grpcServerOptions({
      package: 'auth',
      protoPath: resolveProto('auth.proto'),
      url: `0.0.0.0:${process.env.GRPC_PORT || 50051}`
    })
  });

  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));

  await app.listen();
  console.log(`Auth service gRPC listening on port ${process.env.GRPC_PORT || 50051}`);
}
bootstrap();
