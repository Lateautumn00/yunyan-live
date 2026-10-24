import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';

/**
 * 批次 7 / GAP-F8：独立管理后台账号表。
 * 与 users 表完全解耦（零外键、独立鉴权 audience=admin）：
 * 管理员不走 RSA 公钥加密密码链路，password_hash 为 scrypt 派生
 * （格式 scrypt:$<salt-hex>$<hash-hex>，由 admin-service 侧 node:crypto 生成/校验，
 * 与 users 的 bcrypt 格式互不识别，防交叉登录）。
 * role 值域与 users.role(1/2) 物理隔离：1=超管(admin) / 2=运营(operator)。
 */
@Entity('admins')
export class Admin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, unique: true })
  username: string;

  @Column({ length: 200, nullable: true })
  email: string | null;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({ type: 'smallint', default: 1 })
  role: number; // 1=admin(超管), 2=operator(运营)

  @Column({ length: 20, default: 'active' })
  status: string; // active | disabled

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
