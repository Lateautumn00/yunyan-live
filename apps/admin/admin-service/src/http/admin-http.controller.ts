import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Request,
  UnauthorizedException,
  UseGuards
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';
import {
  AdminJwtAuthGuard,
  AdminRoles,
  AdminRolesGuard,
  AUDIT_ACTIONS,
  AUDIT_PUBLISHER,
  JWT_EXPIRES_IN_SECONDS,
  SessionService,
  ok,
  type AuditPublisher
} from '@yunyan-live/nest-shared';
import { AdminService, type UserItem } from '../admin/admin.service';
import { LiveAdminService } from '../live-admin/live-admin.service';
import { JanusClient } from './janus.client';
import { LoginThrottleGuard } from './login-throttle.guard';

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
 * 管理后台 HTTP 面（批次 7 / GAP-F8 收口为单进程服务）：
 * - 数据面直连共享库（本服务内的 AdminService/UsersAdminService/LiveAdminService/...）
 * - 鉴权独立：AdminJwtStrategy（audience=admin）+ AdminRolesGuard
 * - 副作用：封禁踢会话（Redis）、删除直播间（Janus destroy + 软删）、审计（RabbitMQ）
 */
@Controller('admin')
export class AdminHttpController {
  constructor(
    private readonly adminService: AdminService,
    private readonly liveAdminService: LiveAdminService,
    private readonly janus: JanusClient,
    private readonly jwtService: JwtService,
    private readonly sessionService: SessionService,
    @Inject(AUDIT_PUBLISHER) private readonly audit: AuditPublisher
  ) {}

  // ---------- 登录（免鉴权，限流 5 次/60s） ----------

  @Post('login')
  @UseGuards(LoginThrottleGuard)
  async login(
    @Body() body: { username: string; password: string },
    @Request() req: { requestId?: string; ip?: string }
  ) {
    let result: Awaited<ReturnType<AdminService['adminLogin']>>;
    try {
      result = await this.adminService.adminLogin(body);
    } catch (err) {
      this.audit.publish({
        actor: body.username,
        action: AUDIT_ACTIONS.ADMIN_LOGIN_FAILED,
        targetType: 'admin',
        requestId: req.requestId,
        ip: req.ip,
        detail: { reason: 'rejected' }
      });
      throw this.mapLoginError(err);
    }

    const admin = result.data;
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

  /** 凭据错 → 401；账号停用 → 403（原先经网关时被吞成 500） */
  private mapLoginError(err: unknown): unknown {
    if (err instanceof RpcException) {
      const code = (err.getError() as { code?: number } | undefined)?.code;
      if (code === GrpcStatus.UNAUTHENTICATED) {
        return new UnauthorizedException('管理员账号或密码错误');
      }
      if (code === GrpcStatus.FAILED_PRECONDITION) {
        return new ForbiddenException('账号已停用');
      }
    }
    return err;
  }

  // ---------- 当前管理员信息 ----------

  @Get('me')
  @UseGuards(AdminJwtAuthGuard)
  async me(@Request() req: AdminRequestUser) {
    const result = await this.adminService.getAdmin({ admin_id: req.user.adminId });
    const data = result.data;
    return {
      id: data.id,
      username: data.username,
      email: data.email,
      role: data.role,
      status: data.status,
      lastLoginAt: data.last_login_at
    };
  }

  // ---------- 管理员账号管理（仅超管） ----------

  @Get('admins')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1)
  async listAdmins(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('keyword') keyword = ''
  ) {
    const result = await this.adminService.listAdmins({
      page: Number(page) || 1,
      page_size: Number(pageSize) || 20,
      keyword
    });
    return { total: result.total ?? 0, items: result.items ?? [] };
  }

  @Post('admins')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1)
  async createAdmin(
    @Body() body: { username: string; email?: string; password: string; role?: number },
    @Request() req: AdminRequestUser
  ) {
    const result = await this.adminService.createAdmin(
      {
        username: body.username,
        email: body.email ?? '',
        password: body.password,
        role: body.role ?? 2
      },
      req.user.adminId
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
    const result = await this.adminService.updateAdminRole(
      { admin_id: adminId, role: body.role },
      req.user.adminId
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
    const result = await this.adminService.setAdminStatus(
      { admin_id: adminId, status: body.status },
      req.user.adminId
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

  // ---------- 用户管理（读：超管/运营；写：仅超管） ----------

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
    const result = await this.adminService.listUsers({
      page: Number(page) || 1,
      page_size: Number(pageSize) || 20,
      keyword,
      role: role ? Number(role) : -1,
      status: status || '-1'
    });
    return {
      total: result.total ?? 0,
      items: (result.items ?? []).map((u: UserItem) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        status: u.status,
        bannedAt: u.banned_at,
        bannedBy: u.banned_by,
        createdAt: u.created_at
      }))
    };
  }

  @Get('users/:id')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1, 2)
  async getUser(@Param('id') userId: string) {
    const result = await this.adminService.getUser({ user_id: userId });
    const u = result.data;
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      status: u.status,
      bannedAt: u.banned_at,
      bannedBy: u.banned_by,
      createdAt: u.created_at
    };
  }

  @Post('users/:id/ban')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1)
  async banUser(
    @Param('id') userId: string,
    @Body() body: { reason?: string },
    @Request() req: AdminRequestUser
  ) {
    const reason = body.reason ?? 'admin.ban';
    const result = await this.adminService.banUser({ user_id: userId, reason }, req.user.adminId);
    // 封禁三语义之一：踢掉该用户全部在线会话（Redis session:kick 广播）
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
    const result = await this.adminService.unbanUser({ user_id: userId }, req.user.adminId);
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
    const result = await this.adminService.setUserRole(
      { user_id: userId, role: body.role },
      req.user.adminId
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

  // ---------- 直播间全局管理 ----------

  @Get('live/rooms')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1, 2)
  async listLiveRooms(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('keyword') keyword = '',
    @Query('status') status = '0',
    @Query('type') type = '-1',
    @Query('startTime') startTime = '',
    @Query('endTime') endTime = ''
  ) {
    const result = await this.adminService.listLiveRooms({
      page: Number(page) || 1,
      page_size: Number(pageSize) || 20,
      keyword,
      status: Number(status) || 0,
      type: Number(type),
      start_time_ms: startTime,
      end_time_ms: endTime
    });
    return {
      total: result.total ?? 0,
      items: result.items ?? []
    };
  }

  @Get('live/rooms/:roomId')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1, 2)
  async getLiveRoom(@Param('roomId') roomId: string) {
    const result = await this.adminService.getLiveRoom({ room_id: roomId });
    return result.data;
  }

  @Delete('live/rooms/:roomId')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1)
  async deleteLiveRoom(@Param('roomId') roomId: string, @Request() req: AdminRequestUser) {
    await this.janus.destroyRoom(roomId);
    await this.liveAdminService.deleteRoom(roomId);
    this.audit.publish({
      actor: req.user.adminId,
      action: AUDIT_ACTIONS.DELETE_LIVE,
      targetType: 'room',
      targetId: roomId,
      requestId: req.requestId,
      ip: req.ip,
      detail: { byAdmin: true }
    });
    return ok({});
  }

  @Get('live/recordings')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1, 2)
  async listRecordings(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('keyword') keyword = '',
    @Query('roomId') roomId = ''
  ) {
    const result = await this.adminService.listRecordings({
      page: Number(page) || 1,
      page_size: Number(pageSize) || 20,
      keyword,
      room_id: roomId
    });
    return {
      total: result.total ?? 0,
      items: result.items ?? []
    };
  }

  /**
   * 批量删除录像：`by=room` 按房间删、`by=video` 按录像 id 删。
   * 审计动作区分 video.delete_rooms / video.delete_ids（沿用 S12 既有枚举）。
   */
  @Post('live/recordings/delete')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1)
  async deleteRecordings(
    @Body() body: { by: 'room' | 'video'; ids: string[] },
    @Request() req: AdminRequestUser
  ) {
    const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
    if (ids.length === 0) return ok({ deleted: 0 });
    if (body.by === 'video') {
      await this.liveAdminService.deleteVideosByIds(ids);
      this.audit.publish({
        actor: req.user.adminId,
        action: AUDIT_ACTIONS.DELETE_VIDEO_IDS,
        targetType: 'video',
        targetId: ids.join(','),
        requestId: req.requestId,
        ip: req.ip,
        detail: { byAdmin: true, count: ids.length }
      });
    } else {
      await this.liveAdminService.deleteVideosByRoomIds(ids);
      this.audit.publish({
        actor: req.user.adminId,
        action: AUDIT_ACTIONS.DELETE_VIDEO_ROOMS,
        targetType: 'room',
        targetId: ids.join(','),
        requestId: req.requestId,
        ip: req.ip,
        detail: { byAdmin: true, count: ids.length }
      });
    }
    return ok({ deleted: ids.length });
  }

  @Get('live/coursewares')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1, 2)
  async listCoursewares(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('keyword') keyword = '',
    @Query('roomId') roomId = ''
  ) {
    const result = await this.adminService.listCoursewares({
      page: Number(page) || 1,
      page_size: Number(pageSize) || 20,
      keyword,
      room_id: roomId
    });
    return {
      total: result.total ?? 0,
      items: result.items ?? []
    };
  }

  @Delete('live/coursewares/:id')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1)
  async deleteCourseware(@Param('id') id: string, @Request() req: AdminRequestUser) {
    await this.liveAdminService.deleteCourseware(id);
    this.audit.publish({
      actor: req.user.adminId,
      action: AUDIT_ACTIONS.DELETE_COURSEWARE,
      targetType: 'courseware',
      targetId: id,
      requestId: req.requestId,
      ip: req.ip,
      detail: { byAdmin: true }
    });
    return ok({});
  }

  // ---------- 数据看板 / 审计日志（只读） ----------

  @Get('dashboard/stats')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1, 2)
  async dashboardStats() {
    const result = await this.adminService.getDashboardStats();
    return result.data;
  }

  @Get('audit/logs')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1, 2)
  async listAuditLogs(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
    @Query('action') action = '',
    @Query('actor') actor = '',
    @Query('from') from = '',
    @Query('to') to = ''
  ) {
    const result = await this.adminService.listAuditLogs({
      page: Number(page) || 1,
      page_size: Number(pageSize) || 50,
      action,
      actor,
      from_ms: from,
      to_ms: to
    });
    return {
      total: result.total ?? 0,
      items: (result.items ?? []).map(row => {
        let detail: unknown = null;
        if (row.detail) {
          try {
            detail = JSON.parse(row.detail);
          } catch {
            detail = row.detail;
          }
        }
        return {
          id: row.id,
          occurredAt: row.occurredAt,
          actor: row.actor,
          action: row.action,
          targetType: row.targetType,
          targetId: row.targetId,
          requestId: row.requestId,
          ip: row.ip,
          detail
        };
      })
    };
  }
}
