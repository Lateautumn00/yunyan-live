import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'net';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  getHealth() {
    return {
      status: 'ok',
      service: '@yunyan-live/server',
      timestamp: Date.now(),
    };
  }

  private tcpProbe(host: string, port: number, timeoutMs = 3000): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new Socket();
      let done = false;
      const finish = (result: boolean) => {
        if (done) return;
        done = true;
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
      socket.connect(port, host);
    });
  }

  async getServicesHealth() {
    const services = [
      { name: 'auth-service', host: '127.0.0.1', port: 50051 },
      { name: 'live-service', host: '127.0.0.1', port: 50052 },
      { name: 'mail-service', host: '127.0.0.1', port: 50053 },
    ];

    const results = await Promise.all(
      services.map(async (service) => {
        const ok = await this.tcpProbe(service.host, service.port);
        return {
          name: service.name,
          port: service.port,
          status: ok ? 'ok' : 'unavailable',
        };
      }),
    );

    const allHealthy = results.every((r) => r.status === 'ok');

    return {
      status: allHealthy ? 'ok' : 'degraded',
      service: '@yunyan-live/server',
      timestamp: Date.now(),
      services: results,
    };
  }
}
