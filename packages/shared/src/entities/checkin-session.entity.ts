import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/** 签到轮次（一轮=一次限时签到；状态由 endedAt/deadlineAt 派生，无 status 列） */
@Entity('checkin_sessions')
@Index('IDX_checkin_sessions_room_started', ['roomId', 'startedAt'])
export class CheckinSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  roomId: string;

  /** 发起人（= live_rooms.liveUserId，归属校验在服务内执行） */
  @Column({ length: 50 })
  teacherId: string;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  /** 截止时刻（客户端本地倒计时依据；服务器拒迟到 respond） */
  @Column({ type: 'timestamptz' })
  deadlineAt: Date;

  /** 教师手动结束时刻；NULL=未手动结束（超时自然关闭不回写） */
  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  /** 发起时刻在线分母快照（user_watch_times left_at IS NULL，排除教师） */
  @Column({ type: 'jsonb' })
  attendeeIds: string[];

  @Column({ type: 'int', default: 0 })
  attendeeCount: number;

  /** 教师是否已为本轮开启补签 */
  @Column({ type: 'boolean', default: false })
  makeupOpen: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
