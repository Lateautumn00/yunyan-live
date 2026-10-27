import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

/**
 * Janus 管理面客户端（仅用于管理后台删除直播间时销毁房间）。
 * 与 live-service 的 JanusService.destroyRoom 同语义：失败只告警，不阻断 DB 软删。
 */
@Injectable()
export class JanusClient {
  private readonly logger = new Logger(JanusClient.name);
  private readonly axios: AxiosInstance;

  constructor() {
    this.axios = axios.create({
      baseURL: process.env.JANUS_URL || 'http://127.0.0.1:8088',
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async destroyRoom(roomId: string): Promise<void> {
    const numericId = parseInt(roomId.replace(/\D/g, ''), 10) || 0;
    if (numericId === 0) return;
    try {
      await this.axios.post('/janus/admin', {
        janus: 'videoroom',
        transaction: `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        request: 'destroy',
        room: numericId
      });
      this.logger.log(`Janus room destroyed: ${numericId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Janus destroyRoom failed: ${message}`);
    }
  }
}
