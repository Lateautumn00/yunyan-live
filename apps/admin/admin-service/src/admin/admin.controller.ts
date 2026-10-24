import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { AdminService } from './admin.service';

@Controller()
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}

  @GrpcMethod('AdminService', 'AdminLogin')
  async adminLogin(data: { username: string; password: string }) {
    this.logger.log(`gRPC AdminLogin: ${data.username}`);
    return this.adminService.adminLogin(data);
  }

  @GrpcMethod('AdminService', 'GetAdmin')
  async getAdmin(data: { admin_id: string }, _metadata: Metadata) {
    return this.adminService.getAdmin(data, _metadata);
  }

  @GrpcMethod('AdminService', 'ListAdmins')
  async listAdmins(data: { page: number; page_size: number; keyword: string }) {
    return this.adminService.listAdmins(data);
  }

  @GrpcMethod('AdminService', 'CreateAdmin')
  async createAdmin(
    data: { username: string; email: string; password: string; role: number },
    metadata: Metadata
  ) {
    this.logger.log(`gRPC CreateAdmin: ${data.username}`);
    return this.adminService.createAdmin(data, metadata);
  }

  @GrpcMethod('AdminService', 'UpdateAdminRole')
  async updateAdminRole(data: { admin_id: string; role: number }, metadata: Metadata) {
    return this.adminService.updateAdminRole(data, metadata);
  }

  @GrpcMethod('AdminService', 'SetAdminStatus')
  async setAdminStatus(data: { admin_id: string; status: string }, metadata: Metadata) {
    return this.adminService.setAdminStatus(data, metadata);
  }

  @GrpcMethod('AdminService', 'ListUsers')
  async listUsers(data: {
    page: number;
    page_size: number;
    keyword: string;
    role: number;
    status: string;
  }) {
    return this.adminService.listUsers(data);
  }

  @GrpcMethod('AdminService', 'GetUser')
  async getUser(data: { user_id: string }) {
    return this.adminService.getUser(data);
  }

  @GrpcMethod('AdminService', 'BanUser')
  async banUser(data: { user_id: string; reason: string }, metadata: Metadata) {
    this.logger.log(`gRPC BanUser: ${data.user_id}`);
    return this.adminService.banUser(data, metadata);
  }

  @GrpcMethod('AdminService', 'UnbanUser')
  async unbanUser(data: { user_id: string }, metadata: Metadata) {
    return this.adminService.unbanUser(data, metadata);
  }

  @GrpcMethod('AdminService', 'SetUserRole')
  async setUserRole(data: { user_id: string; role: number }, metadata: Metadata) {
    return this.adminService.setUserRole(data, metadata);
  }

  // ---------- 批次 7c：全局管理面（只读） ----------

  @GrpcMethod('AdminService', 'ListLiveRooms')
  async listLiveRooms(data: {
    page: number;
    page_size: number;
    keyword: string;
    status: number;
    type: number;
    start_time_ms: string;
    end_time_ms: string;
  }) {
    return this.adminService.listLiveRooms(data);
  }

  @GrpcMethod('AdminService', 'GetLiveRoom')
  async getLiveRoom(data: { room_id: string }) {
    return this.adminService.getLiveRoom(data);
  }

  @GrpcMethod('AdminService', 'ListRecordings')
  async listRecordings(data: {
    page: number;
    page_size: number;
    keyword: string;
    room_id: string;
  }) {
    return this.adminService.listRecordings(data);
  }

  @GrpcMethod('AdminService', 'ListCoursewares')
  async listCoursewares(data: {
    page: number;
    page_size: number;
    keyword: string;
    room_id: string;
  }) {
    return this.adminService.listCoursewares(data);
  }

  @GrpcMethod('AdminService', 'GetDashboardStats')
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @GrpcMethod('AdminService', 'ListAuditLogs')
  async listAuditLogs(data: {
    page: number;
    page_size: number;
    action: string;
    actor: string;
    from_ms: string;
    to_ms: string;
  }) {
    return this.adminService.listAuditLogs(data);
  }
}
