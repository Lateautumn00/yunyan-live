import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'net';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  getHealth() {
    return {
      status: 'ok',
      service: '@yunyan-live/server',
      timestamp: Date.now()
    };
  }

  private tcpProbe(host: string, port: number, timeoutMs = 3000): Promise<boolean> {
    return new Promise(resolve => {
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
    // gRPC 探测目标与 clients.module 同源（env 可覆盖，容器内指向服务名）
    const target = (name: string, url: string) => {
      const [host, port] = url.split(':');
      return { name, host: host || '127.0.0.1', port: Number(port) || 0 };
    };
    const services = [
      target('auth-service', process.env.AUTH_GRPC_URL || '127.0.0.1:50051'),
      target('live-service', process.env.LIVE_GRPC_URL || '127.0.0.1:50052'),
      target('mail-service', process.env.MAIL_GRPC_URL || '127.0.0.1:50053')
    ];

    const results = await Promise.all(
      services.map(async service => {
        const ok = await this.tcpProbe(service.host, service.port);
        return {
          name: service.name,
          port: service.port,
          status: ok ? 'ok' : 'unavailable'
        };
      })
    );

    const allHealthy = results.every(r => r.status === 'ok');

    return {
      status: allHealthy ? 'ok' : 'degraded',
      service: '@yunyan-live/server',
      timestamp: Date.now(),
      services: results
    };
  }
}
