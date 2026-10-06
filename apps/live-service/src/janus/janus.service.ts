import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { janusConfig } from './janus.config';

@Injectable()
export class JanusService {
  private readonly logger = new Logger(JanusService.name);
  private axios: AxiosInstance;

  constructor() {
    this.axios = axios.create({
      baseURL: janusConfig.baseUrl,
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private transactionId(): string {
    return `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async createRoom(roomId: string, description: string): Promise<void> {
    const numericId = parseInt(roomId.replace(/\D/g, ''), 10) || Math.floor(Math.random() * 100000);
    try {
      await this.axios.post(janusConfig.adminPath, {
        janus: 'videoroom',
        transaction: this.transactionId(),
        request: 'create',
        room: numericId,
        description
      });
      this.logger.log(`Janus room created: ${numericId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Janus createRoom failed: ${message}`);
    }
  }

  async destroyRoom(roomId: string): Promise<void> {
    const numericId = parseInt(roomId.replace(/\D/g, ''), 10) || 0;
    if (numericId === 0) return;

    try {
      await this.axios.post(janusConfig.adminPath, {
        janus: 'videoroom',
        transaction: this.transactionId(),
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
