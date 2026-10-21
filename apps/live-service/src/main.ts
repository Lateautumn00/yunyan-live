import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { DataSource } from 'typeorm';
import {
  GrpcAuthGuard,
  GrpcMetricsInterceptor,
  createServiceMetrics,
  grpcServerOptions,
  resolveProto,
  startMetricsServer
} from '@yunyan-live/nest-shared';
import { AppModule } from './app.module';
import { createAuditConsumer } from './audit/consumer';

/** S12 审计消费者接线：RABBITMQ_URL 空 → 不启动（gateway 侧 publisher 同语义丢弃）；深度 30s 进指标。 */
function startAuditConsumer(
  metrics: ReturnType<typeof createServiceMetrics>,
  db: DataSource
): void {
  const url = process.env.RABBITMQ_URL || '';
  if (!url) {
    console.log('[AuditMQ] RABBITMQ_URL not set — audit consumer disabled');
    return;
  }
  const consumer = createAuditConsumer(url, db);
  const poller = setInterval(() => {
    void consumer.depths().then(depths => {
      if (!depths) return;
      metrics.auditQueueDepth.set({ queue: 'work' }, depths.work);
      metrics.auditQueueDepth.set({ queue: 'dlq' }, depths.dlq);
      if (depths.dlq > 0) {
        console.error(`[AuditMQ] dlq_depth=${depths.dlq}`);
      }
    });
  }, 30_000);
  poller.unref?.();
  process.once('SIGTERM', () => {
    clearInterval(poller);
    void consumer.stop();
  });
}

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
  app.useGlobalInterceptors(new GrpcMetricsInterceptor(metrics), new GrpcAuthGuard());

  await app.listen();
  console.log(`Live service gRPC listening on port ${process.env.GRPC_PORT || 50052}`);
  startAuditConsumer(metrics, app.get(DataSource));
  startMetricsServer(metrics, Number(process.env.METRICS_PORT) || 9465);
}
bootstrap();
