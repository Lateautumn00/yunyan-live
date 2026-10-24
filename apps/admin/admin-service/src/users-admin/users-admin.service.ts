import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@yunyan-live/shared';

/**
 * 批次 7 / GAP-F8：users 表管理面（封禁/角色复核/全局列表）。
 * 封禁语义拍板：
 *   1. 禁登录：banned_at IS NOT NULL 时，auth-service Login 拒绝（登录前查，0008 迁移加列）。
 *   2. 踢在线会话：gateway /admin/ban 端点经 SessionService.revokeAllSessions（WS 经 session:kick 频道踢在线连接）。
 *   3. 进行中直播不中断：封禁只影响登录/新建房间，已加入的进行中直播允许看完。
 * 零外键：banned_by 存 admin id 字符串，不建 FK。
 */
@Injectable()
export class UsersAdminService {
  constructor(
    @InjectRepository(User)
    private repo: Repository<User>
  ) {}

  async list(query: {
    page: number;
    pageSize: number;
    keyword?: string;
    role?: number; // 缺省 -1 = 全部
    status?: string; // active | banned | undefined = 全部
  }): Promise<{ total: number; items: User[] }> {
    const qb = this.repo.createQueryBuilder('u');
    if (query.keyword) {
      qb.andWhere('(u.username LIKE :kw OR u.email LIKE :kw)', { kw: `%${query.keyword}%` });
    }
    if (query.role !== undefined && query.role !== -1) {
      qb.andWhere('u.role = :role', { role: query.role });
    }
    if (query.status === 'banned') {
      qb.andWhere('u.banned_at IS NOT NULL');
    } else if (query.status === 'active') {
      qb.andWhere('u.banned_at IS NULL');
    }
    qb.orderBy('u.created_at', 'DESC');
    qb.skip((query.page - 1) * query.pageSize).take(query.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { total, items };
  }

  async findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  async banUser(userId: string, bannedBy: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(User)
      .set({ bannedAt: () => 'now()', bannedBy })
      .where('id = :id', { id: userId })
      .andWhere('banned_at IS NULL')
      .execute();
  }

  async unbanUser(userId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(User)
      .set({ bannedAt: null, bannedBy: null })
      .where('id = :id', { id: userId })
      .execute();
  }

  async setRole(userId: string, role: number): Promise<void> {
    await this.repo.update(userId, { role });
  }

  async findBannedUserIds(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.repo
      .createQueryBuilder('u')
      .select('u.id', 'id')
      .where('u.id IN (:...ids)', { ids: userIds })
      .andWhere('u.banned_at IS NOT NULL')
      .getRawMany<{ id: string }>();
    return new Set(rows.map(r => r.id));
  }

  /** 登录时封禁检查（auth-service Login 调用，0008 迁移列）。 */
  async checkBannedForLogin(email: string): Promise<User | null> {
    const user = await this.repo.findOne({ where: { email } });
    if (user && user.bannedAt) return user;
    return null;
  }
}
