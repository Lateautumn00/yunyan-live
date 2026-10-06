import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, REDIS_CLIENT, UpdateForbidDto, writeForbid } from '@yunyan-live/nest-shared';
import type { Redis } from 'ioredis';

/**
 * 课堂禁言状态入口：写 Redis（live:forbid:{roomId}）并 publish 到 live:forbid 频道，
 * 由 chat-ws-service 订阅后广播给房间内客户端。
 */
@Controller('live/push')
export class PushController {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  @Post('updateForbid')
  @UseGuards(JwtAuthGuard)
  async updateForbid(@Body() dto: UpdateForbidDto): Promise<{ updated: boolean }> {
    await writeForbid(this.redis, dto.roomId, dto.status);
    return { updated: true };
  }
}
