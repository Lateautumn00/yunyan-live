import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { REDIS_CLIENT } from '../redis/token';
import { validateSession } from './kick';
import {
  KickPayload,
  SESSION_KICK_CHANNEL,
  SESSION_TTL_SECONDS,
  SessionState,
  sessionKey,
} from './constants';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async createSession(guid: string): Promise<{ sid: string; oldSid: string | null }> {
    const sid = randomUUID();
    try {
      const oldSid = await this.redis.get(sessionKey(guid));
      await this.redis.set(sessionKey(guid), sid, 'EX', SESSION_TTL_SECONDS);
      if (oldSid && oldSid !== sid) {
        const payload: KickPayload = { guid, oldSid };
        await this.redis.publish(SESSION_KICK_CHANNEL, JSON.stringify(payload));
        this.logger.log(`Session replaced for guid=${guid}, kicked old sid=${oldSid}`);
      }
      return { sid, oldSid: oldSid ?? null };
    } catch (err) {
      // Redis outage: still hand out the new sid (fail-open), the old client keeps
      // working until Redis recovers — same trade-off as validateSid.
      this.logger.error(`createSession failed for guid=${guid}: ${String(err)}`);
      return { sid, oldSid: null };
    }
  }

  async validateSid(guid: string, sid: string | undefined): Promise<SessionState> {
    return validateSession(this.redis, guid, sid, (err) =>
      this.logger.error(`validateSid fail-open for guid=${guid}: ${String(err)}`),
    );
  }

  async removeSession(guid: string, sid: string | undefined): Promise<void> {
    if (!sid) return;
    try {
      const current = await this.redis.get(sessionKey(guid));
      if (current === sid) {
        await this.redis.del(sessionKey(guid));
      }
    } catch (err) {
      this.logger.error(`removeSession failed for guid=${guid}: ${String(err)}`);
    }
  }

  async touchSession(guid: string): Promise<void> {
    try {
      await this.redis.expire(sessionKey(guid), SESSION_TTL_SECONDS);
    } catch (err) {
      this.logger.error(`touchSession failed for guid=${guid}: ${String(err)}`);
    }
  }
}
