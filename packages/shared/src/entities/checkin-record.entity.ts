import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/** 签到记录（(sessionId,userId) 唯一 → 幂等） */
@Entity('checkin_records')
@Index('UQ_checkin_records_session_user', ['sessionId', 'userId'], { unique: true })
export class CheckinRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ length: 50 })
  userId: string;

  @Column({ type: 'timestamptz' })
  respondedAt: Date;

  /** 1=窗口内正常签到，2=补签 */
  @Column({ type: 'smallint', default: 1 })
  method: number;
}
