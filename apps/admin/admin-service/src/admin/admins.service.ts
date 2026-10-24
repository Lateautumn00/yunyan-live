import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Admin } from '@yunyan-live/shared';
import { hashAdminPassword, verifyAdminPassword } from './password-crypto';

export interface AdminListQuery {
  page: number;
  pageSize: number;
  keyword?: string;
}

@Injectable()
export class AdminsService {
  constructor(
    @InjectRepository(Admin)
    private repo: Repository<Admin>
  ) {}

  async findByUsername(username: string): Promise<Admin | null> {
    return this.repo.findOne({ where: { username } });
  }

  async findById(id: string): Promise<Admin | null> {
    return this.repo.findOne({ where: { id } });
  }

  async verifyCredentials(username: string, password: string): Promise<Admin | null> {
    const admin = await this.findByUsername(username);
    if (!admin) return null;
    if (!verifyAdminPassword(password, admin.passwordHash)) return null;
    return admin;
  }

  async create(data: {
    username: string;
    email?: string;
    password: string;
    role: number;
  }): Promise<Admin> {
    const existing = await this.findByUsername(data.username);
    if (existing) {
      throw new Error('admin username already exists');
    }
    const admin = this.repo.create({
      username: data.username,
      email: data.email ?? null,
      passwordHash: await hashAdminPassword(data.password),
      role: data.role,
      status: 'active'
    });
    return this.repo.save(admin);
  }

  async updateRole(id: string, role: number): Promise<void> {
    await this.repo.update(id, { role });
  }

  async setStatus(id: string, status: string): Promise<void> {
    await this.repo.update(id, { status });
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.repo.update(id, { lastLoginAt: new Date() });
  }

  async list(query: AdminListQuery): Promise<{ total: number; items: Admin[] }> {
    const qb = this.repo.createQueryBuilder('a');
    if (query.keyword) {
      qb.andWhere('a.username LIKE :kw', { kw: `%${query.keyword}%` });
    }
    qb.orderBy('a.created_at', 'DESC');
    qb.skip((query.page - 1) * query.pageSize).take(query.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { total, items };
  }
}
