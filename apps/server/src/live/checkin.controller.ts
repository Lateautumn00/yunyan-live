import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  OnModuleInit,
  Param,
  Post,
  Query,
  Request,
  UseGuards
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { Observable } from 'rxjs';
import {
  CheckinPayload,
  CheckinSessionActionDto,
  JwtAuthGuard,
  REDIS_CLIENT,
  RespondCheckinDto,
  StartCheckinDto,
  normalizePageQuery,
  publishCheckin,
  toGrpcPage,
  userIdMetadata
} from '@yunyan-live/nest-shared';
import type { Redis } from 'ioredis';
import { grpcCall } from '../common/helpers/grpc.helper';

interface GrpcSessionData {
  session_id: string;
  room_id: string;
  teacher_id: string;
  started_at: string;
  deadline_at: string;
  ended_at: string;
  attendee_count: number;
  signed_count: number;
  makeup_open: boolean;
  status: number;
  my_signed: boolean;
  my_method: number;
}

interface CheckinGrpcClient {
  createCheckin(
    data: { room_id: string; duration: number },
    metadata?: Metadata
  ): Observable<{ code: string; msg: string; data: GrpcSessionData }>;
  respondCheckin(
    data: { room_id: string; session_id: string; makeup: boolean },
    metadata?: Metadata
  ): Observable<{
    code: string;
    msg: string;
    signed_count: number;
    already_signed: boolean;
    makeup: boolean;
  }>;
  endCheckin(
    data: { room_id: string; session_id: string },
    metadata?: Metadata
  ): Observable<{ code: string; msg: string; data: GrpcSessionData }>;
  openCheckinMakeup(
    data: { room_id: string; session_id: string },
    metadata?: Metadata
  ): Observable<{ code: string; msg: string; data: GrpcSessionData }>;
  getCheckinState(
    data: { room_id: string },
    metadata?: Metadata
  ): Observable<{
    code: string;
    msg: string;
    data: { has_session: boolean; is_owner: boolean; session?: GrpcSessionData };
  }>;
  listCheckinSessions(
    data: { room_id: string; page?: number; page_size?: number },
    metadata?: Metadata
  ): Observable<{
    code: string;
    msg: string;
    data: { items: GrpcSessionData[]; total: number };
  }>;
  getCheckinRecords(
    data: { session_id: string },
    metadata?: Metadata
  ): Observable<{
    code: string;
    msg: string;
    data: {
      items: Array<{
        user_id: string;
        in_denominator: boolean;
        signed: boolean;
        method: number;
        responded_at: string;
      }>;
      total: number;
      attendee_count: number;
      signed_count: number;
      attended_count: number;
    };
  }>;
}

interface UserData {
  id: string;
  username: string;
}

interface AuthGrpcClient {
  batchGetUsers(data: {
    user_ids: string[];
  }): Observable<{ code: string; msg: string; data?: UserData[] }>;
}

type HttpSession = {
  sessionId: string;
  roomId: string;
  teacherId: string;
  startedAt: string;
  deadlineAt: string;
  endedAt: string | null;
  attendeeCount: number;
  signedCount: number;
  makeupOpen: boolean;
  status: number;
  mySigned: boolean;
  myMethod: number;
};

/**
 * 签到 HTTP 入口：gRPC 透传归属/成员校验（live-service 内执行），
 * 成功后向 live:checkin 频道广播（评审修订①：publish 失败仅告警，不影响本次签到结果）。
 */
@Controller('live/checkin')
export class CheckinController implements OnModuleInit {
  private readonly logger = new Logger(CheckinController.name);
  private liveService: CheckinGrpcClient;
  private authService: AuthGrpcClient;

  constructor(
    @Inject('LIVE_GRPC') private liveClient: ClientGrpc,
    @Inject('AUTH_GRPC') private authClient: ClientGrpc,
    @Inject(REDIS_CLIENT) private redis: Redis
  ) {}

  onModuleInit() {
    this.liveService = this.liveClient.getService<CheckinGrpcClient>('LiveService');
    this.authService = this.authClient.getService<AuthGrpcClient>('AuthService');
  }

  /** Redis 故障不回滚已成功的签到：捕获并告警（修订①） */
  private async publish(payload: CheckinPayload): Promise<void> {
    try {
      await publishCheckin(this.redis, payload);
    } catch (err) {
      this.logger.warn(`publishCheckin failed: ${(err as Error).message}`);
    }
  }

  private async resolveUsernames(userIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueIds.length === 0) return map;
    try {
      const result = await grpcCall(this.authService.batchGetUsers({ user_ids: uniqueIds }));
      if (result.data) {
        for (const user of result.data) map.set(user.id, user.username);
      }
    } catch (err) {
      this.logger.error(`resolveUsernames failed: ${(err as Error).message}`, (err as Error).stack);
    }
    return map;
  }

  private toHttpSession(session: GrpcSessionData): HttpSession {
    return {
      sessionId: session.session_id,
      roomId: session.room_id,
      teacherId: session.teacher_id,
      startedAt: session.started_at,
      deadlineAt: session.deadline_at,
      endedAt: session.ended_at || null,
      attendeeCount: session.attendee_count,
      signedCount: session.signed_count,
      makeupOpen: session.makeup_open,
      status: session.status,
      mySigned: session.my_signed,
      myMethod: session.my_method
    };
  }

  @Post('start')
  @UseGuards(JwtAuthGuard)
  async start(@Body() dto: StartCheckinDto, @Request() req: { user: { userId: string } }) {
    const result = await grpcCall(
      this.liveService.createCheckin(
        { room_id: dto.roomId, duration: dto.duration },
        userIdMetadata(req.user.userId)
      )
    );
    const session = this.toHttpSession(result.data);
    await this.publish({
      roomId: session.roomId,
      action: 'started',
      sessionId: session.sessionId,
      deadlineAt: session.deadlineAt
    });
    return { code: 1000, msg: 'success', data: session };
  }

  @Post('respond')
  @UseGuards(JwtAuthGuard)
  async respond(@Body() dto: RespondCheckinDto, @Request() req: { user: { userId: string } }) {
    const result = await grpcCall(
      this.liveService.respondCheckin(
        { room_id: dto.roomId, session_id: dto.sessionId, makeup: dto.makeup ?? false },
        userIdMetadata(req.user.userId)
      )
    );
    await this.publish({
      roomId: dto.roomId,
      action: 'update',
      sessionId: dto.sessionId,
      signedCount: result.signed_count
    });
    return {
      code: 1000,
      msg: 'success',
      data: {
        signedCount: result.signed_count,
        alreadySigned: result.already_signed,
        makeup: result.makeup
      }
    };
  }

  @Post('end')
  @UseGuards(JwtAuthGuard)
  async end(@Body() dto: CheckinSessionActionDto, @Request() req: { user: { userId: string } }) {
    const result = await grpcCall(
      this.liveService.endCheckin(
        { room_id: dto.roomId, session_id: dto.sessionId },
        userIdMetadata(req.user.userId)
      )
    );
    const session = this.toHttpSession(result.data);
    await this.publish({
      roomId: dto.roomId,
      action: 'ended',
      sessionId: dto.sessionId,
      signedCount: session.signedCount
    });
    return { code: 1000, msg: 'success', data: session };
  }

  @Post('openMakeup')
  @UseGuards(JwtAuthGuard)
  async openMakeup(
    @Body() dto: CheckinSessionActionDto,
    @Request() req: { user: { userId: string } }
  ) {
    const result = await grpcCall(
      this.liveService.openCheckinMakeup(
        { room_id: dto.roomId, session_id: dto.sessionId },
        userIdMetadata(req.user.userId)
      )
    );
    const session = this.toHttpSession(result.data);
    await this.publish({
      roomId: dto.roomId,
      action: 'makeup',
      sessionId: dto.sessionId
    });
    return { code: 1000, msg: 'success', data: session };
  }

  @Get('state/:roomId')
  @UseGuards(JwtAuthGuard)
  async state(@Param('roomId') roomId: string, @Request() req: { user: { userId: string } }) {
    const result = await grpcCall(
      this.liveService.getCheckinState({ room_id: roomId }, userIdMetadata(req.user.userId))
    );
    return {
      code: 1000,
      msg: 'success',
      data: {
        hasSession: result.data.has_session,
        isOwner: result.data.is_owner,
        session: result.data.session ? this.toHttpSession(result.data.session) : null
      }
    };
  }

  @Get('sessions/:roomId')
  @UseGuards(JwtAuthGuard)
  async sessions(
    @Param('roomId') roomId: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Request() req: { user: { userId: string } }
  ) {
    const result = await grpcCall(
      this.liveService.listCheckinSessions(
        {
          room_id: roomId,
          ...toGrpcPage(normalizePageQuery({ page, pageSize }))
        },
        userIdMetadata(req.user.userId)
      )
    );
    return {
      code: 1000,
      msg: 'success',
      data: {
        items: result.data.items.map(item => this.toHttpSession(item)),
        total: result.data.total
      }
    };
  }

  @Get('records/:sessionId')
  @UseGuards(JwtAuthGuard)
  async records(
    @Param('sessionId') sessionId: string,
    @Request() req: { user: { userId: string } }
  ) {
    const result = await grpcCall(
      this.liveService.getCheckinRecords({ session_id: sessionId }, userIdMetadata(req.user.userId))
    );
    const usernameMap = await this.resolveUsernames(result.data.items.map(item => item.user_id));
    return {
      code: 1000,
      msg: 'success',
      data: {
        items: result.data.items.map(item => ({
          userId: item.user_id,
          nickName: usernameMap.get(item.user_id) || item.user_id,
          inDenominator: item.in_denominator,
          signed: item.signed,
          method: item.method,
          respondedAt: item.responded_at
        })),
        total: result.data.total,
        attendeeCount: result.data.attendee_count,
        signedCount: result.data.signed_count,
        attendedCount: result.data.attended_count
      }
    };
  }
}
