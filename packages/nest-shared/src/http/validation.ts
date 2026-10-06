import { ValidationPipeOptions } from '@nestjs/common';

/** 全局 ValidationPipe 统一参数（HTTP 网关与 gRPC 服务共用） */
export const validationPipeOptions: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true
};
