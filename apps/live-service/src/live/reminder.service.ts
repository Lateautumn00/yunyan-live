import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Between, type Repository } from 'typeorm';
import type { DataSource } from 'typeorm';
import { LiveRoom } from '@yunyan-live/shared';
import { NOTIFY_PUBLISHER, type NotifyPublisher } from '@yunyan-live/nest-shared';

/** 巡检间隔：startTime 分钟级精度足够，15s 抖动可接受 */
const TICK_MS = 15_000;
/** 内存去重保留期：覆盖场次窗口 + 余量；重启丢表由消费端 Redis 7d NX 兜底 */
const DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ROOMS_PER_TICK = 50;
const MAX_RECIPIENTS_PER_ROOM = 500;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * F9 开课提醒：每 15s 扫 status=1（未开播）且 startTime ∈ [now, now+lead) 的场次，
 * 给教师 + 曾入房学生（email 非空，去重）逐收件人发布 class_reminder。
 * - live-service 无 Redis → 进程内 Map 按场次去重；重启重发由消费端 dedupeKey 兜底
 * - publisher 未就绪（RABBITMQ_URL 空/断连）→ 整轮跳过，不占用去重位
 */
@Injectable()
export class ReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderService.name);
  private readonly sentSessions = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    @InjectRepository(LiveRoom) private readonly rooms: Repository<LiveRoom>,
    @InjectDataSource() private readonly db: DataSource,
    @Inject(NOTIFY_PUBLISHER) private readonly notify: NotifyPublisher
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private leadMinutes(): number {
    const n = Number(process.env.NOTIFY_REMINDER_LEAD_MIN);
    return Number.isFinite(n) && n > 0 ? n : 10;
  }

  async tick(): Promise<void> {
    if (this.ticking || !this.notify.isReady()) return;
    this.ticking = true;
    try {
      const now = new Date();
      const horizon = new Date(now.getTime() + this.leadMinutes() * 60_000);
      const rooms = await this.rooms.find({
        where: { status: 1, startTime: Between(now, horizon) },
        order: { startTime: 'ASC' },
        take: MAX_ROOMS_PER_TICK
      });
      this.prune(now);
      for (const room of rooms) {
        await this.notifyRoom(room, now);
      }
    } catch (err) {
      this.logger.error(`reminder tick failed: ${errorMessage(err)}`);
    } finally {
      this.ticking = false;
    }
  }

  /** 场次唯一键 = roomId + startTime（同房间改期算新场次） */
  private sessionKey(room: LiveRoom): string {
    return `${room.roomId}:${new Date(room.startTime).getTime()}`;
  }

  private prune(now: Date): void {
    for (const [key, expireAt] of this.sentSessions) {
      if (expireAt < now.getTime()) this.sentSessions.delete(key);
    }
  }

  private async notifyRoom(room: LiveRoom, now: Date): Promise<void> {
    const key = this.sessionKey(room);
    if (this.sentSessions.has(key)) return;

    // 先占去重位：单轮内后续 tick 不重入；消费端 7d NX 挡重启重发
    this.sentSessions.set(key, now.getTime() + DEDUPE_TTL_MS);

    const teacherRows = await this.db.query<Array<{ email: string }>>(
      `SELECT u.email FROM live_rooms r
       INNER JOIN users u ON u.id = r."liveUserId"
       WHERE r."roomId" = $1 AND u.email <> ''`,
      [room.roomId]
    );
    const studentRows = await this.db.query<Array<{ email: string }>>(
      `SELECT DISTINCT u.email FROM live_participants p
       INNER JOIN users u ON u.id = p."userId"
       WHERE p."roomId" = $1 AND u.email <> ''`,
      [room.roomId]
    );

    const recipients = [
      ...new Set(
        [...teacherRows, ...studentRows].map(row => String(row.email ?? '')).filter(Boolean)
      )
    ].slice(0, MAX_RECIPIENTS_PER_ROOM);

    const startTime = new Date(room.startTime).toISOString();
    for (const to of recipients) {
      this.notify.publish({
        kind: 'class_reminder',
        to,
        scope: key,
        payload: { title: room.title, startTime }
      });
    }
    this.logger.log(
      `class_reminder: room=${room.roomId} startTime=${startTime} recipients=${recipients.length}`
    );
  }
}
