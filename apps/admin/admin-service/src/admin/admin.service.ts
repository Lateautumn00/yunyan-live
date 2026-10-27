import { Injectable } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { grpcError, ok } from '@yunyan-live/nest-shared';
import { AdminsService } from './admins.service';
import { UsersAdminService } from '../users-admin/users-admin.service';
import {
  LiveAdminService,
  type CoursewareRow,
  type LiveRoomRow,
  type RecordingRow
} from '../live-admin/live-admin.service';
import {
  DashboardAdminService,
  type DashboardStatsRow
} from '../dashboard-admin/dashboard-admin.service';
import { AuditAdminService, type AuditLogRow } from '../audit-admin/audit-admin.service';

// ---------- gRPC 信封类型（export 供 controller 标注返回类型，声明文件生成需要） ----------

export interface AdminItem {
  id: string;
  username: string;
  email: string;
  role: number;
  status: string;
  last_login_at: string | null;
  created_at: string;
}

export interface UserItem {
  id: string;
  username: string;
  email: string;
  role: number;
  created_at: string;
  status: string;
  banned_at: string | null;
  banned_by: string | null;
}

export interface AdminLoginResult {
  code: string;
  msg: string;
  access_token: string;
  expires_in: number;
  /** 与 HTTP 层 AdminData 结构对齐 */
  data: AdminItem;
}

export interface AdminGetResult {
  code: string;
  msg: string;
  data: AdminItem;
}

export interface AdminListResult {
  code: string;
  msg: string;
  total: number;
  items: AdminItem[];
}

export interface UserGetResult {
  code: string;
  msg: string;
  data: UserItem;
}

export interface UserListResult {
  code: string;
  msg: string;
  total: number;
  items: UserItem[];
}

export interface CommonResult {
  code: string;
  msg: string;
}

// ---------- 批次 7c：全局管理面信封 ----------

export interface LiveRoomListResult {
  code: string;
  msg: string;
  total: number;
  items: LiveRoomRow[];
}

export interface LiveRoomGetResult {
  code: string;
  msg: string;
  data: LiveRoomRow;
}

export interface RecordingListResult {
  code: string;
  msg: string;
  total: number;
  items: RecordingRow[];
}

export interface CoursewareListResult {
  code: string;
  msg: string;
  total: number;
  items: CoursewareRow[];
}

export interface DashboardStatsResult {
  code: string;
  msg: string;
  data: DashboardStatsRow;
}

export interface AuditLogListResult {
  code: string;
  msg: string;
  total: number;
  items: AuditLogRow[];
}

@Injectable()
export class AdminService {
  constructor(
    private adminsService: AdminsService,
    private usersAdminService: UsersAdminService,
    private liveAdminService: LiveAdminService,
    private dashboardAdminService: DashboardAdminService,
    private auditAdminService: AuditAdminService
  ) {}

  // 登录成功后吊销旧会话（7b 扩展点；此处 7a 先不接 Redis，留接口）

  private toAdminItem(a: {
    id: string;
    username: string;
    email: string | null;
    role: number;
    status: string;
    lastLoginAt: Date | null;
    createdAt: Date;
  }): AdminItem {
    return {
      id: a.id,
      username: a.username,
      email: a.email ?? '',
      role: a.role,
      status: a.status,
      last_login_at: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
      created_at: a.createdAt.toISOString()
    };
  }

  private toUserItem(u: {
    id: string;
    username: string;
    email: string;
    role: number;
    createdAt: Date;
    bannedAt: Date | null;
    bannedBy: string | null;
  }): UserItem {
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      created_at: u.createdAt.toISOString(),
      status: u.bannedAt ? 'banned' : 'active',
      banned_at: u.bannedAt ? u.bannedAt.toISOString() : null,
      banned_by: u.bannedBy
    };
  }

  /** 管理员登录：校验 admins 表（scrypt）；JWT 由 HTTP 控制器在本进程签发（audience=admin）。 */
  async adminLogin(data: { username: string; password: string }): Promise<AdminLoginResult> {
    const admin = await this.adminsService.verifyCredentials(data.username, data.password);
    if (!admin) throw grpcError(status.UNAUTHENTICATED, '管理员账号或密码错误');
    if (admin.status !== 'active') throw grpcError(status.FAILED_PRECONDITION, '账号已停用');
    await this.adminsService.touchLastLogin(admin.id);
    // 保持既有信封形状（管理员信息在 data 里，顶层只放 access_token / expires_in）；
    // token 由控制器填充，服务层不感知 JWT。
    const result = ok({
      access_token: '',
      expires_in: 0,
      data: this.toAdminItem(admin)
    });
    return result as unknown as AdminLoginResult;
  }

  async getAdmin(data: { admin_id: string }): Promise<AdminGetResult> {
    const admin = await this.adminsService.findById(data.admin_id);
    if (!admin) throw grpcError(status.NOT_FOUND, 'admin not found');
    return ok({ data: this.toAdminItem(admin) }) as unknown as AdminGetResult;
  }

  async listAdmins(data: {
    page: number;
    page_size: number;
    keyword: string;
  }): Promise<AdminListResult> {
    const { total, items } = await this.adminsService.list({
      page: data.page || 1,
      pageSize: data.page_size || 20,
      keyword: data.keyword || undefined
    });
    return ok({ total, items: items.map(a => this.toAdminItem(a)) }) as unknown as AdminListResult;
  }

  async createAdmin(
    data: { username: string; email: string; password: string; role: number },
    _actorId: string
  ): Promise<AdminGetResult> {
    try {
      const admin = await this.adminsService.create({
        username: data.username,
        email: data.email || undefined,
        password: data.password,
        role: data.role || 1
      });
      // S12 审计动作 admin.admin_create（7b 接审计）
      return ok({ data: this.toAdminItem(admin) }) as unknown as AdminGetResult;
    } catch (err) {
      if (err instanceof Error && err.message === 'admin username already exists') {
        throw grpcError(status.ALREADY_EXISTS, 'username already exists');
      }
      throw err;
    }
  }

  async updateAdminRole(
    data: { admin_id: string; role: number },
    _actorId: string
  ): Promise<CommonResult> {
    if (data.role !== 1 && data.role !== 2) {
      throw grpcError(status.INVALID_ARGUMENT, 'role must be 1 or 2');
    }
    const target = await this.adminsService.findById(data.admin_id);
    if (!target) throw grpcError(status.NOT_FOUND, 'admin not found');
    await this.adminsService.updateRole(data.admin_id, data.role);
    return ok({}) as unknown as CommonResult;
  }

  async setAdminStatus(
    data: { admin_id: string; status: string },
    _actorId: string
  ): Promise<CommonResult> {
    if (data.status !== 'active' && data.status !== 'disabled') {
      throw grpcError(status.INVALID_ARGUMENT, "status must be 'active' or 'disabled'");
    }
    const target = await this.adminsService.findById(data.admin_id);
    if (!target) throw grpcError(status.NOT_FOUND, 'admin not found');
    await this.adminsService.setStatus(data.admin_id, data.status);
    return ok({}) as unknown as CommonResult;
  }

  async listUsers(data: {
    page: number;
    page_size: number;
    keyword: string;
    role: number;
    status: string;
  }): Promise<UserListResult> {
    const { total, items } = await this.usersAdminService.list({
      page: data.page || 1,
      pageSize: data.page_size || 20,
      keyword: data.keyword || undefined,
      role: data.role || -1,
      status: data.status || undefined
    });
    return ok({ total, items: items.map(u => this.toUserItem(u)) }) as unknown as UserListResult;
  }

  async getUser(data: { user_id: string }): Promise<UserGetResult> {
    const user = await this.usersAdminService.findById(data.user_id);
    if (!user) throw grpcError(status.NOT_FOUND, 'user not found');
    return ok({ data: this.toUserItem(user) }) as unknown as UserGetResult;
  }

  async banUser(data: { user_id: string; reason: string }, actorId: string): Promise<CommonResult> {
    const actor = actorId;
    const target = await this.usersAdminService.findById(data.user_id);
    if (!target) throw grpcError(status.NOT_FOUND, 'user not found');
    await this.usersAdminService.banUser(data.user_id, actor);
    // 封禁三语义：禁登录（auth-service 登录前查 banned_at）/ 踢会话（HTTP 控制器调用
    // SessionService.revokeAllSessions）/ 进行中直播不中断。
    // S12 审计动作 admin.ban_user（detail 含 reason，走白名单脱敏）
    return ok({}) as unknown as CommonResult;
  }

  async unbanUser(data: { user_id: string }, _actorId: string): Promise<CommonResult> {
    const target = await this.usersAdminService.findById(data.user_id);
    if (!target) throw grpcError(status.NOT_FOUND, 'user not found');
    await this.usersAdminService.unbanUser(data.user_id);
    return ok({}) as unknown as CommonResult;
  }

  async setUserRole(
    data: { user_id: string; role: number },
    _actorId: string
  ): Promise<CommonResult> {
    if (data.role !== 1 && data.role !== 2) {
      throw grpcError(status.INVALID_ARGUMENT, 'role must be 1 or 2');
    }
    const target = await this.usersAdminService.findById(data.user_id);
    if (!target) throw grpcError(status.NOT_FOUND, 'user not found');
    await this.usersAdminService.setRole(data.user_id, data.role);
    // S12 审计动作 admin.role_change
    return ok({}) as unknown as CommonResult;
  }

  // ---------- 批次 7c：全局管理面（只读；删除动作走 live-service） ----------

  async listLiveRooms(data: {
    page: number;
    page_size: number;
    keyword: string;
    status: number;
    type: number;
    start_time_ms: string;
    end_time_ms: string;
  }): Promise<LiveRoomListResult> {
    const { total, items } = await this.liveAdminService.listLiveRooms({
      page: data.page || 1,
      pageSize: data.page_size || 20,
      keyword: data.keyword || undefined,
      status: data.status || 0,
      type: data.type ?? -1,
      startTimeMs: data.start_time_ms || undefined,
      endTimeMs: data.end_time_ms || undefined
    });
    return ok({ total, items }) as unknown as LiveRoomListResult;
  }

  async getLiveRoom(data: { room_id: string }): Promise<LiveRoomGetResult> {
    const room = await this.liveAdminService.getLiveRoom(data.room_id);
    if (!room) throw grpcError(status.NOT_FOUND, 'room not found');
    return ok({ data: room }) as unknown as LiveRoomGetResult;
  }

  async listRecordings(data: {
    page: number;
    page_size: number;
    keyword: string;
    room_id: string;
  }): Promise<RecordingListResult> {
    const { total, items } = await this.liveAdminService.listRecordings({
      page: data.page || 1,
      pageSize: data.page_size || 20,
      keyword: data.keyword || undefined,
      roomId: data.room_id || undefined
    });
    return ok({ total, items }) as unknown as RecordingListResult;
  }

  async listCoursewares(data: {
    page: number;
    page_size: number;
    keyword: string;
    room_id: string;
  }): Promise<CoursewareListResult> {
    const { total, items } = await this.liveAdminService.listCoursewares({
      page: data.page || 1,
      pageSize: data.page_size || 20,
      keyword: data.keyword || undefined,
      roomId: data.room_id || undefined
    });
    return ok({ total, items }) as unknown as CoursewareListResult;
  }

  async getDashboardStats(): Promise<DashboardStatsResult> {
    const data = await this.dashboardAdminService.stats();
    return ok({ data }) as unknown as DashboardStatsResult;
  }

  async listAuditLogs(data: {
    page: number;
    page_size: number;
    action: string;
    actor: string;
    from_ms: string;
    to_ms: string;
  }): Promise<AuditLogListResult> {
    const { total, items } = await this.auditAdminService.list({
      page: data.page || 1,
      pageSize: data.page_size || 50,
      action: data.action || undefined,
      actor: data.actor || undefined,
      fromMs: data.from_ms || undefined,
      toMs: data.to_ms || undefined
    });
    return ok({ total, items }) as unknown as AuditLogListResult;
  }
}
