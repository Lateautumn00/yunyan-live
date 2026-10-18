import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import {
  GrpcMetricsInterceptor,
  createServiceMetrics,
  grpcServerOptions,
  resolveProto,
  startMetricsServer
} from '@yunyan-live/nest-shared';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: grpcServerOptions({
      package: 'live',
      protoPath: resolveProto('live.proto'),
      url: `${process.env.GRPC_HOST || '127.0.0.1'}:${process.env.GRPC_PORT || 50052}`
    })
  });

  const metrics = createServiceMetrics('live-service');
  app.useGlobalInterceptors(new GrpcMetricsInterceptor(metrics));

  await app.listen();
  console.log(`Live service gRPC listening on port ${process.env.GRPC_PORT || 50052}`);
  startMetricsServer(metrics, Number(process.env.METRICS_PORT) || 9465);
}
bootstrap();
