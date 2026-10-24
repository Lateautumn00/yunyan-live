import {
  Body,
  Controller,
  Get,
  Inject,
  OnModuleInit,
  Param,
  Post,
  Query,
  Request,
  UseGuards
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClientGrpc } from '@nestjs/microservices';
import { JwtService } from '@nestjs/jwt';
import { Observable } from 'rxjs';
import {
  AdminJwtAuthGuard,
  AdminRoles,
  AdminRolesGuard,
  AUDIT_ACTIONS,
  AUDIT_PUBLISHER,
  JWT_EXPIRES_IN_SECONDS,
  ok,
  SessionService,
  userIdMetadata,
  type AuditPublisher
} from '@yunyan-live/nest-shared';
import { STRICT_THROTTLE } from '../common/guards/rate-limit.guard';
import { grpcCall } from '../common/helpers/grpc.helper';

interface AdminLoginData {
  id: string;
  username: string;
  email: string | null;
  role: number;
  status: string;
}

interface AdminItem {
  id: string;
  username: string;
  email: string | null;
  role: number;
  status: string;
  last_login_at: string | null;
  created_at: string;
}

interface UserItem {
  id: string;
  username: string;
  email: string;
  role: number;
  created_at: string;
  status: string;
  banned_at: string | null;
  banned_by: string | null;
}

interface CommonResponse {
  code: string;
  msg: string;
}

interface AdminEnvelope {
  code: string;
  msg: string;
  data?: AdminItem;
  total?: number;
  items?: AdminItem[];
}

interface UserEnvelope {
  code: string;
  msg: string;
  data?: UserItem;
  total?: number;
  items?: UserItem[];
}

interface AdminLoginEnvelope {
  code: string;
  msg: string;
  data?: AdminLoginData;
}

interface AdminServiceClient {
  adminLogin(data: { username: string; password: string }): Observable<AdminLoginEnvelope>;
  getAdmin(data: { admin_id: string }): Observable<AdminEnvelope>;
  listAdmins(data: {
    page: number;
    page_size: number;
    keyword: string;
  }): Observable<AdminEnvelope & { total: number; items: AdminItem[] }>;
  createAdmin(
    data: { username: string; email: string; password: string; role: number },
    metadata?: unknown
  ): Observable<AdminEnvelope>;
  updateAdminRole(
    data: { admin_id: string; role: number },
    metadata?: unknown
  ): Observable<CommonResponse>;
  setAdminStatus(
    data: { admin_id: string; status: string },
    metadata?: unknown
  ): Observable<CommonResponse>;
  listUsers(data: {
    page: number;
    page_size: number;
    keyword: string;
    role: number;
    status: string;
  }): Observable<UserEnvelope & { total: number; items: UserItem[] }>;
  getUser(data: { user_id: string }): Observable<UserEnvelope>;
  banUser(
    data: { user_id: string; reason: string },
    metadata?: unknown
  ): Observable<CommonResponse>;
  unbanUser(data: { user_id: string }, metadata?: unknown): Observable<CommonResponse>;
  setUserRole(
    data: { user_id: string; role: number },
    metadata?: unknown
  ): Observable<CommonResponse>;
}

interface AdminRequestUser {
  user: {
    adminId: string;
    username: string;
    role: number;
  };
  requestId?: string;
  ip?: string;
}

/**
 * 批次 7 / GAP-F8：管理后台网关 HTTP 面（/admin 路由组）。
 * - 数据面经 ADMIN_GRPC 转发到独立 admin-service（:50056），gateway 不直连 admins 表。
 * - 鉴权独立：AdminJwtStrategy（audience=admin）+ AdminRolesGuard，与用户 JwtStrategy 物理隔离。
 * - 写端点经 userIdMetadata(adminId) 复用 S10b HMAC 签名闭环，admin-service 侧 actorFrom 校验操作者。
 */
@Controller('admin')
export class AdminController implements OnModuleInit {
  constructor(
    @Inject('ADMIN_GRPC') private adminClient: ClientGrpc,
    private jwtService: JwtService,
    private sessionService: SessionService,
    @Inject(AUDIT_PUBLISHER) private audit: AuditPublisher
  ) {}

  private adminService: AdminServiceClient;

  onModuleInit() {
    this.adminService = this.adminClient.getService<AdminServiceClient>('AdminService');
  }

  // ---------- 登录（免鉴权，限流） ----------

  @Post('login')
  @Throttle({ default: STRICT_THROTTLE })
  async login(
    @Body() body: { username: string; password: string },
    @Request() req: { requestId?: string; ip?: string }
  ) {
    let result: AdminLoginEnvelope;
    try {
      result = await grpcCall(this.adminService.adminLogin(body));
    } catch {
      this.audit.publish({
        actor: body.username,
        action: AUDIT_ACTIONS.ADMIN_LOGIN_FAILED,
        targetType: 'admin',
        requestId: req.requestId,
        ip: req.ip,
        detail: { reason: 'rejected' }
      });
      throw new Error('管理员登录失败');
    }
    const admin = result.data!;
    // gateway 统一签发 admin JWT（audience=admin），避免双份 JWT_SECRET 配置漂移
    const token = this.jwtService.sign(
      {
        sub: admin.id,
        username: admin.username,
        role: admin.role,
        aud: 'admin'
      },
      { expiresIn: '7d' }
    );
    this.audit.publish({
      actor: admin.id,
      action: AUDIT_ACTIONS.ADMIN_LOGIN_OK,
      targetType: 'admin',
      targetId: admin.id,
      requestId: req.requestId,
      ip: req.ip
    });
    return {
      token,
      expiresIn: JWT_EXPIRES_IN_SECONDS,
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        status: admin.status
      }
    };
  }

  // ---------- 当前管理员信息 ----------

  @Get('me')
  @UseGuards(AdminJwtAuthGuard)
  async me(@Request() req: AdminRequestUser) {
    const result = await grpcCall(this.adminService.getAdmin({ admin_id: req.user.adminId }));
    const data = result.data!;
    return {
      id: data.id,
      username: data.username,
      email: data.email,
      role: data.role,
      status: data.status,
      lastLoginAt: data.last_login_at
    };
  }

  // ---------- 管理员账号管理（写端点，仅超管） ----------

  @Get('admins')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1)
  async listAdmins(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('keyword') keyword = ''
  ) {
    const result = await grpcCall(
      this.adminService.listAdmins({
        page: Number(page) || 1,
        page_size: Number(pageSize) || 20,
        keyword
      })
    );
    return { total: result.total ?? 0, items: result.items ?? [] };
  }

  @Post('admins')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1)
  async createAdmin(
    @Body() body: { username: string; email?: string; password: string; role?: number },
    @Request() req: AdminRequestUser
  ) {
    const metadata = userIdMetadata(req.user.adminId);
    const result = await grpcCall(
      this.adminService.createAdmin(
        {
          username: body.username,
          email: body.email ?? '',
          password: body.password,
          role: body.role ?? 2
        },
        metadata
      )
    );
    this.audit.publish({
      actor: req.user.adminId,
      action: AUDIT_ACTIONS.ADMIN_ADMIN_CREATE,
      targetType: 'admin',
      targetId: result.data?.id,
      requestId: req.requestId,
      ip: req.ip,
      detail: { username: body.username, role: body.role ?? 2 }
    });
    return ok(result.data ?? {});
  }

  @Post('admins/:id/role')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1)
  async updateAdminRole(
    @Param('id') adminId: string,
    @Body() body: { role: number },
    @Request() req: AdminRequestUser
  ) {
    const metadata = userIdMetadata(req.user.adminId);
    const result = await grpcCall(
      this.adminService.updateAdminRole({ admin_id: adminId, role: body.role }, metadata)
    );
    this.audit.publish({
      actor: req.user.adminId,
      action: AUDIT_ACTIONS.ADMIN_ROLE_CHANGE,
      targetType: 'admin',
      targetId: adminId,
      requestId: req.requestId,
      ip: req.ip,
      detail: { role: body.role }
    });
    return result;
  }

  @Post('admins/:id/status')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1)
  async setAdminStatus(
    @Param('id') adminId: string,
    @Body() body: { status: string },
    @Request() req: AdminRequestUser
  ) {
    const metadata = userIdMetadata(req.user.adminId);
    const result = await grpcCall(
      this.adminService.setAdminStatus({ admin_id: adminId, status: body.status }, metadata)
    );
    this.audit.publish({
      actor: req.user.adminId,
      action: AUDIT_ACTIONS.ADMIN_ADMIN_STATUS_CHANGE,
      targetType: 'admin',
      targetId: adminId,
      requestId: req.requestId,
      ip: req.ip,
      detail: { status: body.status }
    });
    return result;
  }

  // ---------- 用户管理（读端点：超管+运营；写端点：仅超管） ----------

  @Get('users')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1, 2)
  async listUsers(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('keyword') keyword = '',
    @Query('role') role = '',
    @Query('status') status = ''
  ) {
    const result = await grpcCall(
      this.adminService.listUsers({
        page: Number(page) || 1,
        page_size: Number(pageSize) || 20,
        keyword,
        role: role ? Number(role) : -1,
        status: status || '-1'
      })
    );
    return { total: result.total ?? 0, items: result.items ?? [] };
  }

  @Get('users/:id')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1, 2)
  async getUser(@Param('id') userId: string) {
    const result = await grpcCall(this.adminService.getUser({ user_id: userId }));
    return result.data;
  }

  @Post('users/:id/ban')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1)
  async banUser(
    @Param('id') userId: string,
    @Body() body: { reason?: string },
    @Request() req: AdminRequestUser
  ) {
    const metadata = userIdMetadata(req.user.adminId);
    const reason = body.reason ?? 'admin.ban';
    const result = await grpcCall(this.adminService.banUser({ user_id: userId, reason }, metadata));
    // 7b：踢在线会话（Redis session:kick 通道）
    await this.sessionService.revokeAllSessions(userId);
    this.audit.publish({
      actor: req.user.adminId,
      action: AUDIT_ACTIONS.ADMIN_BAN_USER,
      targetType: 'user',
      targetId: userId,
      requestId: req.requestId,
      ip: req.ip,
      detail: { reason }
    });
    return result;
  }

  @Post('users/:id/unban')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1)
  async unbanUser(@Param('id') userId: string, @Request() req: AdminRequestUser) {
    const metadata = userIdMetadata(req.user.adminId);
    const result = await grpcCall(this.adminService.unbanUser({ user_id: userId }, metadata));
    this.audit.publish({
      actor: req.user.adminId,
      action: AUDIT_ACTIONS.ADMIN_UNBAN_USER,
      targetType: 'user',
      targetId: userId,
      requestId: req.requestId,
      ip: req.ip
    });
    return result;
  }

  @Post('users/:id/role')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1)
  async setUserRole(
    @Param('id') userId: string,
    @Body() body: { role: number },
    @Request() req: AdminRequestUser
  ) {
    const metadata = userIdMetadata(req.user.adminId);
    const result = await grpcCall(
      this.adminService.setUserRole({ user_id: userId, role: body.role }, metadata)
    );
    this.audit.publish({
      actor: req.user.adminId,
      action: AUDIT_ACTIONS.ADMIN_ROLE_CHANGE,
      targetType: 'user',
      targetId: userId,
      requestId: req.requestId,
      ip: req.ip,
      detail: { role: body.role }
    });
    return result;
  }
}
