import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';

@Entity('live_rooms')
export class LiveRoom {
  @PrimaryColumn({ length: 50 })
  roomId: string;

  @Column({ length: 200 })
  title: string;

  @Column({ length: 20, unique: true })
  joinCode: string;

  @Column({ type: 'int', default: 0 })
  type: number;

  @Column({ type: 'int', default: 1 })
  status: number;

  @Column({ type: 'timestamp' })
  startTime: Date;

  @Column({ type: 'int', default: 60 })
  duration: number;

  @Column({ length: 50 })
  liveUserId: string;

  @Column({ type: 'int', default: 0 })
  liveNums: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
