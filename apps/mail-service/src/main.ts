import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import {
  GrpcAuthGuard,
  GrpcMetricsInterceptor,
  createServiceMetrics,
  grpcServerOptions,
  resolveProto,
  startMetricsServer
} from '@yunyan-live/nest-shared';
import { AppModule } from './app.module';
import { MailService } from './mail/mail.service';
import { startNotifyConsumer } from './mail/notify-consumer';

async function bootstrap() {
  const metrics = createServiceMetrics('mail-service');
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: grpcServerOptions({
      package: 'mail',
      protoPath: resolveProto('mail.proto'),
      url: `${process.env.GRPC_HOST || '127.0.0.1'}:${process.env.GRPC_PORT || 50053}`
    })
  });

  app.useGlobalInterceptors(new GrpcMetricsInterceptor(metrics), new GrpcAuthGuard());

  await app.listen();
  console.log(`Mail service gRPC listening on port ${process.env.GRPC_PORT || 50053}`);

  // F9：通知消费端接线（RABBITMQ_URL 空 → 不启动）+ 深度/结果进指标
  startNotifyConsumer(metrics, event => app.get(MailService).notify(event));
  startMetricsServer(metrics, Number(process.env.METRICS_PORT) || 9466);
}
bootstrap();
