import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Unique } from 'typeorm';

@Index('idx_live_participants_user_joined', ['userId', 'joinedAt', 'id'])
@Entity('live_participants')
@Unique(['userId', 'roomId'])
export class LiveParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  roomId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  joinedAt: Date;
}
