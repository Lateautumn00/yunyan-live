import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ClientGrpc, RpcException } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import * as bcrypt from 'bcryptjs';
import { status } from '@grpc/grpc-js';
import { UsersService } from '../users/users.service';
import { LoginDto, RegisterDto, ResetPasswordDto, ChangePasswordDto } from './dto/auth.dto';

interface MailServiceClient {
  verifyCode(data: { email: string; code: string }): Observable<{ code: string; msg: string; valid: boolean }>;
}

function grpcError(grpcStatus: number, message: string) {
  return new RpcException({ code: grpcStatus, message });
}

@Injectable()
export class AuthService implements OnModuleInit {
  private mailService: MailServiceClient;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @Inject('MAIL_GRPC') private mailClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.mailService = this.mailClient.getService<MailServiceClient>('MailService');
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw grpcError(status.NOT_FOUND, '用户不存在');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw grpcError(status.UNAUTHENTICATED, '密码错误');

    const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role });
    const result = {
      code: '0',
      msg: 'success',
      access_token: token,
      expires_in: 604800,
      guid: user.id,
      role: user.role,
    };
    return result;
  }

  async register(dto: RegisterDto) {
    const emailExists = await this.usersService.findByEmail(dto.email);
    if (emailExists) throw grpcError(status.ALREADY_EXISTS, '邮箱已存在');

    const result = await firstValueFrom<{ valid: boolean }>(this.mailService.verifyCode({ email: dto.email, code: dto.code }));
    if (!result.valid) throw grpcError(status.INVALID_ARGUMENT, '验证码无效或已过期');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      username: dto.userName,
      email: dto.email,
      passwordHash,
      role: dto.role || 2,
    });

    return {
      code: '0',
      msg: 'success',
      guid: user.id,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw grpcError(status.NOT_FOUND, '邮箱未注册');

    const result = await firstValueFrom<{ valid: boolean }>(this.mailService.verifyCode({ email: dto.email, code: dto.code }));
    if (!result.valid) throw grpcError(status.INVALID_ARGUMENT, '验证码无效或已过期');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.usersService.updatePassword(user.id, passwordHash);

    return { code: '0', msg: 'success' };
  }

  async changePassword(dto: ChangePasswordDto, userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw grpcError(status.NOT_FOUND, '用户不存在');

    const valid = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!valid) throw grpcError(status.INVALID_ARGUMENT, '旧密码错误');

    if (dto.oldPassword === dto.password) {
      throw grpcError(status.INVALID_ARGUMENT, '新密码不能与旧密码相同');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.usersService.updatePassword(userId, passwordHash);

    return { code: '0', msg: 'success' };
  }

  async getUser(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw grpcError(status.NOT_FOUND, '用户不存在');

    return {
      code: '0',
      msg: 'success',
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    };
  }

  async updateUserName(userId: string, username: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw grpcError(status.NOT_FOUND, '用户不存在');

    await this.usersService.updateUsername(userId, username);
    return { code: '0', msg: 'success' };
  }

  async batchGetUsers(userIds: string[]) {
    const users = await this.usersService.findByIds(userIds);
    return {
      code: '0',
      msg: 'success',
      data: users.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
      })),
    };
  }

  async searchTeachers(keyword: string) {
    const users = await this.usersService.searchTeachers(keyword);
    return {
      code: '0',
      msg: 'success',
      data: users.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
      })),
    };
  }
}
