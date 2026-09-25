import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

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
