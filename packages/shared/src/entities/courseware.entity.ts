import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('coursewares')
export class Courseware {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  roomId: string;

  @Column({ length: 255 })
  filename: string;

  @Column({ length: 20, default: '' })
  filext: string;

  @Column({ type: 'bigint', default: 0 })
  filesize: number;

  @Column({ type: 'text' })
  fileurl: string;

  @Column({ length: 50, default: '' })
  createUserId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
