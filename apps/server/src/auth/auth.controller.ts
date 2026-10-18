import {
  Controller,
  Post,
  Get,
  Body,
  HttpException,
  UseGuards,
  Request,
  Inject,
  OnModuleInit
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClientGrpc } from '@nestjs/microservices';
import { JwtService } from '@nestjs/jwt';
import { Metadata } from '@grpc/grpc-js';
import { Observable } from 'rxjs';
import { grpcCall } from '../common/helpers/grpc.helper';
import { STRICT_THROTTLE } from '../common/guards/rate-limit.guard';
import {
  AUDIT_ACTIONS,
  AUDIT_PUBLISHER,
  ChangePasswordDto,
  JwtAuthGuard,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  SessionService,
  UpdateUserNameDto,
  userIdMetadata,
  type AuditPublisher
} from '@yunyan-live/nest-shared';

interface AuthResponse {
  code: string;
  msg: string;
  data?: string;
  access_token?: string;
  expires_in?: number;
  guid?: string;
  role?: number;
}

interface RegisterResponse {
  code: string;
  msg: string;
  guid?: string;
}

interface CommonResponse {
  code: string;
  msg: string;
}

interface UserResponse {
  code: string;
  msg: string;
  data?: { id: string; username: string; email: string; role: number };
}

interface AuthServiceClient {
  login(data: { email: string; password: string }): Observable<AuthResponse>;
  register(data: {
    username: string;
    email: string;
    password: string;
    code: string;
    role: number;
  }): Observable<RegisterResponse>;
  resetPassword(data: {
    email: string;
    code: string;
    password: string;
  }): Observable<RegisterResponse>;
  changePassword(
    data: { user_id: string; old_password: string; new_password: string },
    metadata?: Metadata
  ): Observable<CommonResponse>;
  getUser(data: { user_id: string }): Observable<UserResponse>;
  updateUserName(data: { user_id: string; username: string }): Observable<CommonResponse>;
}

@Controller('user/user')
export class AuthController implements OnModuleInit {
  constructor(
    @Inject('AUTH_GRPC') private authClient: ClientGrpc,
    private jwtService: JwtService,
    private sessionService: SessionService,
    @Inject(AUDIT_PUBLISHER) private audit: AuditPublisher
  ) {}

  private authService: AuthServiceClient;

  onModuleInit() {
    this.authService = this.authClient.getService<AuthServiceClient>('AuthService');
  }

  @Post('login')
  @Throttle({ default: STRICT_THROTTLE })
  async login(@Body() dto: LoginDto, @Request() req: { requestId?: string; ip?: string }) {
    let result: AuthResponse;
    try {
      result = await grpcCall(this.authService.login(dto));
    } catch (err) {
      // S12：登录失败记录点（detail 白名单只留原因分类，不落凭据）
      this.audit.publish({
        actor: dto.email,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        requestId: req.requestId,
        ip: req.ip,
        detail: {
          reason: 'rejected',
          status: err instanceof HttpException ? err.getStatus() : 500
        }
      });
      throw err;
    }
    const { sid, oldSid } = await this.sessionService.createSession(result.guid!);
    // Token comes from the internal gRPC response (already authenticated by auth-service),
    // so decode instead of verify to avoid coupling to its JWT_SECRET.
    const payload = this.jwtService.decode<{ sub: string; email: string; role: number }>(
      result.access_token ?? ''
    );
    const token = this.jwtService.sign({
      sub: payload?.sub ?? result.guid,
      email: payload?.email ?? dto.email,
      role: payload?.role ?? result.role ?? 2,
      sid
    });
    // S12：登录成功 + 顶下线（旧会话被顶掉时的踢人记录）
    this.audit.publish({
      actor: result.guid ?? dto.email,
      action: AUDIT_ACTIONS.LOGIN_OK,
      targetType: 'user',
      targetId: result.guid ?? undefined,
      requestId: req.requestId,
      ip: req.ip
    });
    if (oldSid) {
      this.audit.publish({
        actor: result.guid ?? dto.email,
        action: AUDIT_ACTIONS.SESSION_KICK,
        targetType: 'user',
        targetId: result.guid ?? undefined,
        requestId: req.requestId,
        ip: req.ip,
        detail: { reason: 'replaced_by_login' }
      });
    }
    return {
      token,
      guid: result.guid,
      role: result.role
    };
  }

  @Post('register')
  @Throttle({ default: STRICT_THROTTLE })
  register(@Body() dto: RegisterDto) {
    // S5-A: 服务端强制学生角色，忽略客户端传入的 role（前端可能仍传 2，保持 API 契约）
    // S5-B 邀请码开教师：待 S9a 解冻新增表后补（生成/分发/失效/单次使用），当前冻结
    return grpcCall(
      this.authService.register({
        username: dto.userName,
        email: dto.email,
        password: dto.password,
        code: dto.code,
        role: 2
      })
    );
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Request() req: { user: { userId: string; sid?: string } }) {
    await this.sessionService.removeSession(req.user.userId, req.user.sid);
    return { success: true };
  }

  @Post('resetPassword')
  @Throttle({ default: STRICT_THROTTLE })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Request() req: { requestId?: string; ip?: string }
  ) {
    const result = await grpcCall(this.authService.resetPassword(dto));
    // S6: 重置密码后吊销该用户全部会话（含其它设备），强制重新登录
    if (result.guid) {
      await this.sessionService.revokeAllSessions(result.guid);
    }
    // S12：改密类记录点（actor 取 guid，无 guid 时回落邮箱）
    this.audit.publish({
      actor: result.guid ?? dto.email,
      action: AUDIT_ACTIONS.RESET_PASSWORD,
      targetType: 'user',
      targetId: result.guid ?? undefined,
      requestId: req.requestId,
      ip: req.ip,
      detail: { sessionsRevoked: Boolean(result.guid) }
    });
    return result;
  }

  @Post('changePassword')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Request() req: { user: { userId: string }; requestId?: string; ip?: string }
  ) {
    const metadata = userIdMetadata(req.user.userId);
    const result = await grpcCall(
      this.authService.changePassword(
        { user_id: req.user.userId, old_password: dto.oldPassword, new_password: dto.password },
        metadata
      )
    );
    // S6: 改密成功后吊销该用户全部会话，当前设备也需重新登录
    await this.sessionService.revokeAllSessions(req.user.userId);
    // S12：改密记录点（detail 白名单 sessionsRevoked，不落任何密码字段）
    this.audit.publish({
      actor: req.user.userId,
      action: AUDIT_ACTIONS.CHANGE_PASSWORD,
      targetType: 'user',
      targetId: req.user.userId,
      requestId: req.requestId,
      ip: req.ip,
      detail: { sessionsRevoked: true }
    });
    return result;
  }

  @Get('getUserMsg')
  @UseGuards(JwtAuthGuard)
  async getMe(
    @Request() req: { user: { userId: string; email: string; role: number; sid?: string } }
  ) {
    const result = await grpcCall(this.authService.getUser({ user_id: req.user.userId }));
    const userData = result.data!;
    await this.sessionService.touchSession(req.user.userId);
    const token = this.jwtService.sign({
      sub: req.user.userId,
      email: req.user.email,
      role: req.user.role,
      sid: req.user.sid
    });
    return {
      token,
      guid: userData.id,
      userName: userData.username,
      email: userData.email,
      role: userData.role
    };
  }

  @Post('updateUserName')
  @UseGuards(JwtAuthGuard)
  async updateUserName(
    @Body() dto: UpdateUserNameDto,
    @Request() req: { user: { userId: string } }
  ) {
    return grpcCall(
      this.authService.updateUserName({
        user_id: req.user.userId,
        username: dto.userName
      })
    );
  }
}
