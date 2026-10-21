import {
  Body,
  Controller,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  OnModuleInit,
  Post,
  Request,
  UseGuards
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import type { Metadata } from '@grpc/grpc-js';
import type { Observable } from 'rxjs';
import {
  AUDIT_ACTIONS,
  AUDIT_PUBLISHER,
  JwtAuthGuard,
  ModerationKickDto,
  ModerationMuteDto,
  ModerationReleaseDto,
  publishModeration,
  publishRecall,
  RecallMessageDto,
  REDIS_CLIENT,
  Roles,
  RolesGuard,
  UpdateForbidDto,
  userIdMetadata,
  writeForbid,
  type AuditPublisher
} from '@yunyan-live/nest-shared';
import type { Redis } from 'ioredis';
import { grpcCall } from '../common/helpers/grpc.helper';

/** 教师角色（JWT payload.role；与 auth-service 签发一致，role 1 = 教师） */
const TEACHER_ROLE = 1;

interface CheckRoomAccessResponse {
  code: string;
  msg: string;
  data?: { allowed?: boolean; is_teacher?: boolean };
}

interface ModerateUserResponse {
  code: string;
  msg: string;
}

interface RecallMessageResponse {
  code: string;
  msg: string;
}

interface PushLiveServiceClient {
  checkRoomAccess(
    data: { room_id: string; user_id: string },
    metadata?: Metadata
  ): Observable<CheckRoomAccessResponse>;
  moderateUser(
    data: { room_id: string; user_id: string; kind: string; op: string; minutes: number },
    metadata?: Metadata
  ): Observable<ModerateUserResponse>;
  recallMessage(
    data: { room_id: string; msg_id: string },
    metadata?: Metadata
  ): Observable<RecallMessageResponse>;
}

/**
 * 课堂管控状态入口（全房禁言 + F3 单用户禁言/踢出）：
 * - 全房禁言：写 Redis live:forbid:{roomId} 并 publish live:forbid
 * - 单用户：gRPC ModerateUser 落 PG（chat_moderation，live-service 独占 DB）后 publish live:moderation
 * 状态由 chat-ws-service 订阅转播给房间内客户端。
 */
@Controller('live/push')
export class PushController implements OnModuleInit {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject('LIVE_GRPC') private readonly liveClient: ClientGrpc,
    @Inject(AUDIT_PUBLISHER) private readonly audit: AuditPublisher
  ) {}

  private liveService: PushLiveServiceClient;

  onModuleInit() {
    this.liveService = this.liveClient.getService<PushLiveServiceClient>('LiveService');
  }

  /**
   * S4 域层下沉：房间归属判定走 live-service CheckRoomAccess（唯一落层）。
   * 身份经签名 metadata 透传，域层交叉校验后按 is_teacher 判定；非房主 403。
   */
  private async assertRoomOwner(user: { userId: string }, roomId: string): Promise<void> {
    const access = await grpcCall(
      this.liveService.checkRoomAccess(
        { room_id: roomId, user_id: user.userId },
        userIdMetadata(user.userId)
      )
    );
    if (!access.data?.allowed || !access.data?.is_teacher) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
  }

  @Post('updateForbid')
  @UseGuards(JwtAuthGuard)
  async updateForbid(
    @Body() dto: UpdateForbidDto,
    @Request() req: { user: { userId: string; role?: number } }
  ): Promise<{ updated: boolean }> {
    // 仅教师可改全房禁言态（现状任意登录学生可调用，服务端强制后放大为全房 DoS）
    if (req.user.role !== TEACHER_ROLE) {
      throw new ForbiddenException('仅教师可修改禁言状态');
    }
    // 房间归属判定（域层 CheckRoomAccess）：他房教师不得改本房间禁言态
    await this.assertRoomOwner(req.user, dto.roomId);
    await writeForbid(this.redis, dto.roomId, dto.status);
    return { updated: true };
  }

  @Post('mute')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(TEACHER_ROLE)
  async mute(
    @Body() dto: ModerationMuteDto,
    @Request() req: { user: { userId: string; role?: number }; requestId?: string; ip?: string }
  ): Promise<{ updated: true }> {
    // 归属判定由域层 ModerateUser 执行（S4 域层下沉：操作者必须是房主，非房主 PERMISSION_DENIED→403）
    const res = await grpcCall(
      this.liveService.moderateUser(
        {
          room_id: dto.roomId,
          user_id: dto.userId,
          kind: 'mute',
          op: 'set',
          minutes: dto.minutes
        },
        userIdMetadata(req.user.userId)
      )
    );
    if (res.code !== '0') throw new HttpException(res.msg || '禁言失败', HttpStatus.BAD_GATEWAY);
    await publishModeration(this.redis, {
      roomId: dto.roomId,
      userId: dto.userId,
      kind: 'mute',
      op: 'set',
      untilMs: Date.now() + dto.minutes * 60_000
    });
    this.audit.publish({
      actor: req.user.userId,
      action: AUDIT_ACTIONS.MODERATION_MUTE,
      targetType: 'room',
      targetId: dto.roomId,
      requestId: req.requestId,
      ip: req.ip,
      detail: { userId: dto.userId, minutes: dto.minutes }
    });
    return { updated: true };
  }

  @Post('kick')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(TEACHER_ROLE)
  async kick(
    @Body() dto: ModerationKickDto,
    @Request() req: { user: { userId: string; role?: number }; requestId?: string; ip?: string }
  ): Promise<{ updated: true }> {
    // 归属判定由域层 ModerateUser 执行（S4 域层下沉）
    const res = await grpcCall(
      this.liveService.moderateUser(
        { room_id: dto.roomId, user_id: dto.userId, kind: 'kick', op: 'set', minutes: 0 },
        userIdMetadata(req.user.userId)
      )
    );
    if (res.code !== '0') throw new HttpException(res.msg || '移出失败', HttpStatus.BAD_GATEWAY);
    await publishModeration(this.redis, {
      roomId: dto.roomId,
      userId: dto.userId,
      kind: 'kick',
      op: 'set'
    });
    this.audit.publish({
      actor: req.user.userId,
      action: AUDIT_ACTIONS.MODERATION_KICK,
      targetType: 'room',
      targetId: dto.roomId,
      requestId: req.requestId,
      ip: req.ip,
      detail: { userId: dto.userId }
    });
    return { updated: true };
  }

  @Post('release')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(TEACHER_ROLE)
  async release(
    @Body() dto: ModerationReleaseDto,
    @Request() req: { user: { userId: string; role?: number }; requestId?: string; ip?: string }
  ): Promise<{ updated: true }> {
    // 归属判定由域层 ModerateUser 执行（S4 域层下沉）
    const res = await grpcCall(
      this.liveService.moderateUser(
        {
          room_id: dto.roomId,
          user_id: dto.userId,
          kind: dto.kind,
          op: 'release',
          minutes: 0
        },
        userIdMetadata(req.user.userId)
      )
    );
    if (res.code !== '0') throw new HttpException(res.msg || '解除失败', HttpStatus.BAD_GATEWAY);
    await publishModeration(this.redis, {
      roomId: dto.roomId,
      userId: dto.userId,
      kind: dto.kind,
      op: 'release'
    });
    this.audit.publish({
      actor: req.user.userId,
      action: AUDIT_ACTIONS.MODERATION_RELEASE,
      targetType: 'room',
      targetId: dto.roomId,
      requestId: req.requestId,
      ip: req.ip,
      detail: { userId: dto.userId, kind: dto.kind }
    });
    return { updated: true };
  }

  /**
   * F4 撤回：不做房间归属断言——发言者（学生）自撤必须放行；
   * 权限（发言者本人/房主）+ 2 分钟窗 + 幂等由 live-service RecallMessage 裁决
   * （单一裁决点，防双口径）。成功且非幂等重复 → publish live:recall + 审计 message.recall。
   */
  @Post('recall')
  @UseGuards(JwtAuthGuard)
  async recall(
    @Body() dto: RecallMessageDto,
    @Request() req: { user: { userId: string; role?: number }; requestId?: string; ip?: string }
  ): Promise<{ recalled: true }> {
    const res = await grpcCall(
      this.liveService.recallMessage(
        { room_id: dto.roomId, msg_id: dto.msgId },
        userIdMetadata(req.user.userId)
      )
    );
    if (res.code !== '0') {
      if (res.msg === 'not found') {
        throw new HttpException('消息不存在', HttpStatus.NOT_FOUND);
      }
      if (res.msg === 'forbidden') {
        throw new HttpException('仅发言者本人或房主可撤回', HttpStatus.FORBIDDEN);
      }
      if (res.msg === 'expired') {
        throw new HttpException('超过2分钟撤回时限', HttpStatus.BAD_REQUEST);
      }
      throw new HttpException(res.msg || '撤回失败', HttpStatus.BAD_GATEWAY);
    }
    if (res.msg !== 'already_recalled') {
      await publishRecall(this.redis, { roomId: dto.roomId, msgId: dto.msgId });
      this.audit.publish({
        actor: req.user.userId,
        action: AUDIT_ACTIONS.MESSAGE_RECALL,
        targetType: 'message',
        targetId: dto.msgId,
        requestId: req.requestId,
        ip: req.ip,
        detail: { roomId: dto.roomId }
      });
    }
    return { recalled: true };
  }
}
