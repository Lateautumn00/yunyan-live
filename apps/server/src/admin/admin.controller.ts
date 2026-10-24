import {
  Body,
  Controller,
  Delete,
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
  adminIdMetadata,
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

// ---------- 批次 7c：全局管理面 ----------

interface LiveRoomItem {
  room_id: string;
  title: string;
  live_user_id: string;
  speaker_name: string;
  join_code: string;
  status: number;
  type: number;
  start_time: string;
  duration: number;
  live_nums: number;
  created_at: string;
}

interface RecordingItem {
  id: string;
  room_id: string;
  room_title: string;
  file_name: string;
  file_path: string;
  file_size: number;
  duration: number;
  record_type: number;
  teacher_name: string;
  created_at: string;
}

interface CoursewareItem {
  id: string;
  room_id: string;
  room_title: string;
  filename: string;
  filext: string;
  filesize: number;
  fileurl: string;
  create_user_id: string;
  created_at: string;
}

interface DashboardStatsData {
  total_users: number;
  today_new_users: number;
  banned_users: number;
  total_live_rooms: number;
  active_live_rooms: number;
  total_records: number;
  total_coursewares: number;
  today_new_rooms: number;
}

interface AuditLogItem {
  id: string;
  occurred_at: string;
  actor: string;
  action: string;
  target_type: string;
  target_id: string;
  request_id: string;
  ip: string;
  detail: string;
}

/** live-service 管理端写操作的最小面（删除类必须经域层保 Janus/软删不变量）。 */
interface LiveAdminClient {
  deleteLive(data: { room_id: string }, metadata?: unknown): Observable<CommonResponse>;
  deleteVideoByRoomIds(
    data: { room_ids: string[] },
    metadata?: unknown
  ): Observable<CommonResponse>;
  deleteVideoByVideoIds(
    data: { video_ids: string[] },
    metadata?: unknown
  ): Observable<CommonResponse>;
  deleteCourseware(data: { id: string }, metadata?: unknown): Observable<CommonResponse>;
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
  // 批次 7c
  listLiveRooms(data: {
    page: number;
    page_size: number;
    keyword: string;
    status: number;
    type: number;
    start_time_ms: string;
    end_time_ms: string;
  }): Observable<{ code: string; msg: string; total: number; items: LiveRoomItem[] }>;
  getLiveRoom(data: {
    room_id: string;
  }): Observable<{ code: string; msg: string; data?: LiveRoomItem }>;
  listRecordings(data: {
    page: number;
    page_size: number;
    keyword: string;
    room_id: string;
  }): Observable<{ code: string; msg: string; total: number; items: RecordingItem[] }>;
  listCoursewares(data: {
    page: number;
    page_size: number;
    keyword: string;
    room_id: string;
  }): Observable<{ code: string; msg: string; total: number; items: CoursewareItem[] }>;
  getDashboardStats(data: Record<string, never>): Observable<{
    code: string;
    msg: string;
    data?: DashboardStatsData;
  }>;
  listAuditLogs(data: {
    page: number;
    page_size: number;
    action: string;
    actor: string;
    from_ms: string;
    to_ms: string;
  }): Observable<{ code: string; msg: string; total: number; items: AuditLogItem[] }>;
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
    @Inject('LIVE_GRPC') private liveClient: ClientGrpc,
    private jwtService: JwtService,
    private sessionService: SessionService,
    @Inject(AUDIT_PUBLISHER) private audit: AuditPublisher
  ) {}

  private adminService: AdminServiceClient;
  private liveService: LiveAdminClient;

  onModuleInit() {
    this.adminService = this.adminClient.getService<AdminServiceClient>('AdminService');
    this.liveService = this.liveClient.getService<LiveAdminClient>('LiveService');
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
    return {
      total: result.total ?? 0,
      items: (result.items ?? []).map(u => ({
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
    const result = await grpcCall(this.adminService.getUser({ user_id: userId }));
    const u = result.data!;
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

  // ---------- 批次 7c：直播间全局管理 ----------
  // 读端点经 ADMIN_GRPC 直查共享库（管理面读模型）；写端点经 LIVE_GRPC 保 Janus/软删不变量。

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
    const result = await grpcCall(
      this.adminService.listLiveRooms({
        page: Number(page) || 1,
        page_size: Number(pageSize) || 20,
        keyword,
        status: Number(status) || 0,
        type: Number(type),
        start_time_ms: startTime,
        end_time_ms: endTime
      })
    );
    return {
      total: result.total ?? 0,
      items: (result.items ?? []).map(r => ({
        roomId: r.room_id,
        title: r.title,
        liveUserId: r.live_user_id,
        speakerName: r.speaker_name,
        joinCode: r.join_code,
        status: r.status,
        type: r.type,
        startTime: r.start_time,
        duration: r.duration,
        liveNums: r.live_nums,
        createdAt: r.created_at
      }))
    };
  }

  @Get('live/rooms/:roomId')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1, 2)
  async getLiveRoom(@Param('roomId') roomId: string) {
    const result = await grpcCall(this.adminService.getLiveRoom({ room_id: roomId }));
    const r = result.data!;
    return {
      roomId: r.room_id,
      title: r.title,
      liveUserId: r.live_user_id,
      speakerName: r.speaker_name,
      joinCode: r.join_code,
      status: r.status,
      type: r.type,
      startTime: r.start_time,
      duration: r.duration,
      liveNums: r.live_nums,
      createdAt: r.created_at
    };
  }

  @Delete('live/rooms/:roomId')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1)
  async deleteLiveRoom(@Param('roomId') roomId: string, @Request() req: AdminRequestUser) {
    await grpcCall(
      this.liveService.deleteLive({ room_id: roomId }, adminIdMetadata(req.user.adminId))
    );
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
    const result = await grpcCall(
      this.adminService.listRecordings({
        page: Number(page) || 1,
        page_size: Number(pageSize) || 20,
        keyword,
        room_id: roomId
      })
    );
    return {
      total: result.total ?? 0,
      items: (result.items ?? []).map(r => ({
        id: r.id,
        roomId: r.room_id,
        roomTitle: r.room_title,
        fileName: r.file_name,
        filePath: r.file_path,
        fileSize: r.file_size,
        duration: r.duration,
        recordType: r.record_type,
        teacherName: r.teacher_name,
        createdAt: r.created_at
      }))
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
    const metadata = adminIdMetadata(req.user.adminId);
    if (body.by === 'video') {
      await grpcCall(this.liveService.deleteVideoByVideoIds({ video_ids: ids }, metadata));
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
      await grpcCall(this.liveService.deleteVideoByRoomIds({ room_ids: ids }, metadata));
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
    const result = await grpcCall(
      this.adminService.listCoursewares({
        page: Number(page) || 1,
        page_size: Number(pageSize) || 20,
        keyword,
        room_id: roomId
      })
    );
    return {
      total: result.total ?? 0,
      items: (result.items ?? []).map(c => ({
        id: c.id,
        roomId: c.room_id,
        roomTitle: c.room_title,
        filename: c.filename,
        filext: c.filext,
        filesize: c.filesize,
        fileurl: c.fileurl,
        createUserId: c.create_user_id,
        createdAt: c.created_at
      }))
    };
  }

  @Delete('live/coursewares/:id')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1)
  async deleteCourseware(@Param('id') id: string, @Request() req: AdminRequestUser) {
    await grpcCall(this.liveService.deleteCourseware({ id }, adminIdMetadata(req.user.adminId)));
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

  // ---------- 批次 7c：数据看板 / 审计日志（只读） ----------

  @Get('dashboard/stats')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(1, 2)
  async dashboardStats() {
    const result = await grpcCall(this.adminService.getDashboardStats({}));
    const d = result.data;
    return {
      totalUsers: Number(d?.total_users ?? 0),
      todayNewUsers: Number(d?.today_new_users ?? 0),
      bannedUsers: Number(d?.banned_users ?? 0),
      totalLiveRooms: Number(d?.total_live_rooms ?? 0),
      activeLiveRooms: Number(d?.active_live_rooms ?? 0),
      totalRecords: Number(d?.total_records ?? 0),
      totalCoursewares: Number(d?.total_coursewares ?? 0),
      todayNewRooms: Number(d?.today_new_rooms ?? 0)
    };
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
    const result = await grpcCall(
      this.adminService.listAuditLogs({
        page: Number(page) || 1,
        page_size: Number(pageSize) || 50,
        action,
        actor,
        from_ms: from,
        to_ms: to
      })
    );
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
          occurredAt: row.occurred_at,
          actor: row.actor,
          action: row.action,
          targetType: row.target_type,
          targetId: row.target_id,
          requestId: row.request_id,
          ip: row.ip,
          detail
        };
      })
    };
  }
}
