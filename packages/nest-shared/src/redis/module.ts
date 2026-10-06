import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRedisClient } from './client';
import { REDIS_CLIENT } from './token';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const client = createRedisClient({
          host: configService.get('REDIS_HOST', '127.0.0.1'),
          port: configService.get('REDIS_PORT', 6379)
        });

        client.on('connect', () => {
          console.log('[Redis] Connected successfully');
        });

        client.on('error', (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[Redis] Connection error: ${message}`);
        });

        return client;
      },
      inject: [ConfigService]
    }
  ],
  exports: [REDIS_CLIENT]
})
export class RedisModule {}
