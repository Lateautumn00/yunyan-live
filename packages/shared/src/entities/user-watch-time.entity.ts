import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Index('idx_user_watch_times_created', ['createdAt', 'id'])
@Index('idx_user_watch_times_room_created', ['roomId', 'createdAt'])
@Entity('user_watch_times')
export class UserWatchTime {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', length: 50 })
  userId: string;

  @Column({ name: 'room_id', length: 50 })
  roomId: string;

  @Column({ type: 'timestamptz', name: 'joined_at' })
  joinedAt: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'left_at' })
  leftAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
