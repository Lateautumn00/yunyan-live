import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import {
  GrpcAuthGuard,
  GrpcMetricsInterceptor,
  createServiceMetrics,
  grpcServerOptions,
  resolveProto,
  startMetricsServer,
  validationPipeOptions
} from '@yunyan-live/nest-shared';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: grpcServerOptions({
      package: 'admin',
      protoPath: resolveProto('admin.proto'),
      url: `${process.env.GRPC_HOST || '127.0.0.1'}:${process.env.GRPC_PORT || 50056}`
    })
  });

  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));

  const metrics = createServiceMetrics('admin-service');
  app.useGlobalInterceptors(new GrpcMetricsInterceptor(metrics), new GrpcAuthGuard());

  await app.listen();
  console.log(`Admin service gRPC listening on port ${process.env.GRPC_PORT || 50056}`);
  startMetricsServer(metrics, Number(process.env.METRICS_PORT) || 9467);
}
bootstrap();
