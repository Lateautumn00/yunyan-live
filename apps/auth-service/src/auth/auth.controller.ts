import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @GrpcMethod('AuthService', 'Login')
  async login(data: { email: string; password: string }) {
    this.logger.log(`gRPC Login: ${data.email}`);
    return this.authService.login(data);
  }

  @GrpcMethod('AuthService', 'Register')
  async register(data: { username: string; email: string; password: string; code: string; role: number }) {
    this.logger.log(`gRPC Register: ${data.email}`);
    return this.authService.register({
      userName: data.username,
      email: data.email,
      password: data.password,
      code: data.code,
      role: data.role,
    });
  }

  @GrpcMethod('AuthService', 'ResetPassword')
  async resetPassword(data: { email: string; code: string; password: string }) {
    this.logger.log(`gRPC ResetPassword: ${data.email}`);
    return this.authService.resetPassword(data);
  }

  @GrpcMethod('AuthService', 'ChangePassword')
  async changePassword(data: { old_password: string; new_password: string }, metadata: Metadata) {
    const userId = metadata.get('user-id')?.[0] as string;
    this.logger.log(`gRPC ChangePassword: ${userId}`);
    return this.authService.changePassword(
      { oldPassword: data.old_password, password: data.new_password },
      userId,
    );
  }

  @GrpcMethod('AuthService', 'GetUser')
  async getUser(data: { user_id: string }) {
    this.logger.log(`gRPC GetUser: ${data.user_id}`);
    return this.authService.getUser(data.user_id);
  }

  @GrpcMethod('AuthService', 'UpdateUserName')
  async updateUserName(data: { user_id: string; username: string }) {
    this.logger.log(`gRPC UpdateUserName: ${data.user_id}`);
    return this.authService.updateUserName(data.user_id, data.username);
  }

  @GrpcMethod('AuthService', 'BatchGetUsers')
  async batchGetUsers(data: { user_ids: string[] }) {
    this.logger.log(`gRPC BatchGetUsers: ${data.user_ids.length} users`);
    return this.authService.batchGetUsers(data.user_ids);
  }

  @GrpcMethod('AuthService', 'SearchTeachers')
  async searchTeachers(data: { keyword: string }) {
    this.logger.log(`gRPC SearchTeachers: ${data.keyword}`);
    return this.authService.searchTeachers(data.keyword);
  }
}
