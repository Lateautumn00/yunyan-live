import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('live_transfer_codes')
export class LiveTransferCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 20, unique: true })
  code: string;

  @Column({ length: 50 })
  roomId: string;

  @Column({ length: 50 })
  targetUserId: string;

  @Column({ type: 'int', default: 0 })
  status: number; // 0=待使用, 1=已使用, 2=已过期

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}
