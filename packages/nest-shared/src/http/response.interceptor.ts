import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, map } from 'rxjs';

interface ApiResponse<T> {
  code: number;
  msg?: string;
  data: T;
}

/** 成功响应统一信封：`{ code: 1000, msg: 'success', data }` */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map(data => {
        return { code: 1000, msg: 'success', data };
      })
    );
  }
}
