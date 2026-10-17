import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { join } from 'path';
import {
  HttpExceptionFilter,
  ResponseInterceptor,
  validationPipeOptions
} from '@yunyan-live/nest-shared';
import { AppModule } from './app.module';
import { uploadVerifyMiddleware } from './upload/upload-sign';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || [
      'http://localhost:5173',
      'http://localhost:3000'
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization', 'token', 'guid']
  });

  // F6.1 板书导出/pdf.js 需以 file://（Origin: null）读取上传文件像素，CORS 白名单不含 null Origin。
  // /uploads 读取侧凭证是路径签名（S3，非 Authorization 头），故保留 ACAO: *。
  app.use('/uploads', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  });

  // S3：/uploads 读取验签——无签名/签名不匹配/老格式（无 sig 段）一律 404，
  // 合法签名剥段重写后交静态托管（放行顺序：CORS 头 → 验签 → 静态资源）
  app.use('/uploads', uploadVerifyMiddleware);

  app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });

  const port = process.env.SERVER_PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`Server running on http://localhost:${port}`);
}
bootstrap();
