import {
  Body,
  Controller,
  ForbiddenException,
  Inject,
  Post,
  Request,
  UseGuards
} from '@nestjs/common';
import { JwtAuthGuard, REDIS_CLIENT, UpdateForbidDto, writeForbid } from '@yunyan-live/nest-shared';
import type { Redis } from 'ioredis';

/** 教师角色（JWT payload.role；与 auth-service 签发一致，role 1 = 教师） */
const TEACHER_ROLE = 1;

/**
 * 课堂禁言状态入口：写 Redis（live:forbid:{roomId}）并 publish 到 live:forbid 频道，
 * 由 chat-ws-service 订阅后广播给房间内客户端。
 */
@Controller('live/push')
export class PushController {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  @Post('updateForbid')
  @UseGuards(JwtAuthGuard)
  async updateForbid(
    @Body() dto: UpdateForbidDto,
    @Request() req: { user: { role: number } }
  ): Promise<{ updated: boolean }> {
    // 仅教师可改全房禁言态（现状任意登录学生可调用，服务端强制后放大为全房 DoS）
    if (req.user.role !== TEACHER_ROLE) {
      throw new ForbiddenException('仅教师可修改禁言状态');
    }
    await writeForbid(this.redis, dto.roomId, dto.status);
    return { updated: true };
  }
}
