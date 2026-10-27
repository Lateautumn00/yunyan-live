import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  HttpExceptionFilter,
  ResponseInterceptor,
  createServiceMetrics,
  httpMetricsMiddleware,
  metricsRequestHandler,
  requestIdMiddleware,
  startMetricsServer,
  validationPipeOptions
} from '@yunyan-live/nest-shared';
import { AppModule } from './app.module';
import { RpcExceptionFilter } from './http/rpc-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();

  const metrics = createServiceMetrics('admin-service');
  app.use(requestIdMiddleware);
  app.use(httpMetricsMiddleware(metrics));
  app.use('/metrics', metricsRequestHandler(metrics));

  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  app.useGlobalFilters(new RpcExceptionFilter(), new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:8848'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization', 'token', 'X-Request-Id']
  });

  const port = Number(process.env.ADMIN_PORT) || 3100;
  await app.listen(port, '0.0.0.0');
  console.log(`Admin service listening on http://localhost:${port}`);

  startMetricsServer(metrics, Number(process.env.METRICS_PORT) || 9467);
}

bootstrap();
