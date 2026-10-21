import 'reflect-metadata';
import { join } from 'node:path';
import {
  ChannelCredentials,
  Metadata,
  credentials,
  loadPackageDefinition,
  status as GrpcStatus
} from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { Controller, Module } from '@nestjs/common';
import type { INestMicroservice } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GrpcMethod, Transport } from '@nestjs/microservices';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServiceMetrics, GrpcMetricsInterceptor } from '../../metrics';
import { GRPC_LOADER_OPTIONS } from '../loader';
import { grpcServerOptions } from '../options';
import { GrpcAuthGuard } from '../auth-guard';
import { USER_ID_KEY, USER_TS_KEY, userIdMetadata } from '../metadata';

const PROTO = join(__dirname, 'fixtures', 'eguard.proto');
const PORT = 50651;
const SECRET = 'e2e-shared-secret';

interface ProbeClient {
  Ping(
    req: { note: string },
    metadata: Metadata,
    cb: (err: { code?: number } | null, res?: { note?: string }) => void
  ): void;
  close(): void;
}

@Controller()
class ProbeController {
  @GrpcMethod('Probe', 'Ping')
  ping(data: { note: string }): { note: string } {
    return { note: `pong:${data.note}` };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('GrpcAuthGuard 真实 gRPC 链路（e2e）', () => {
  let app: INestMicroservice;
  let client: ProbeClient;
  let metrics: ReturnType<typeof createServiceMetrics>;

  beforeAll(async () => {
    metrics = createServiceMetrics('guard-e2e');
    app = await NestFactory.createMicroservice(ProbeModule, {
      transport: Transport.GRPC,
      options: grpcServerOptions({
        package: 'eguard',
        protoPath: PROTO,
        url: `127.0.0.1:${PORT}`
      })
    });
    // 与生产 main.ts 相同顺序：metrics 外层计数，guard 内层拒绝
    app.useGlobalInterceptors(new GrpcMetricsInterceptor(metrics), new GrpcAuthGuard(SECRET));
    await app.listen();
    const pkg = loadPackageDefinition(
      protoLoader.loadSync(PROTO, GRPC_LOADER_OPTIONS)
    ) as unknown as {
      eguard: {
        Probe: new (addr: string, creds: ChannelCredentials) => ProbeClient;
      };
    };
    client = new pkg.eguard.Probe(`127.0.0.1:${PORT}`, credentials.createInsecure());
  });

  afterAll(async () => {
    client?.close();
    await app?.close();
  });

  function ping(metadata: Metadata): Promise<{ code?: number; note?: string }> {
    return new Promise(resolve => {
      client.Ping({ note: 'hi' }, metadata, (err, res) => {
        resolve(err ? { code: err.code } : { note: res?.note });
      });
    });
  }

  it('伪造（裸 user-id 无签名）→ UNAUTHENTICATED 16', async () => {
    const forged = new Metadata();
    forged.add(USER_ID_KEY, 'attacker');
    expect(await ping(forged)).toEqual({ code: GrpcStatus.UNAUTHENTICATED });
  });

  it('错误密钥签名 → UNAUTHENTICATED 16', async () => {
    const md = userIdMetadata('u1', 'wrong-secret');
    expect(await ping(md)).toEqual({ code: GrpcStatus.UNAUTHENTICATED });
  });

  it('过期时间戳签名 → UNAUTHENTICATED 16', async () => {
    const md = userIdMetadata('u1', SECRET);
    const staleTs = String(Date.now() - 10 * 60_000);
    md.remove(USER_TS_KEY);
    md.add(USER_TS_KEY, staleTs);
    expect(await ping(md)).toEqual({ code: GrpcStatus.UNAUTHENTICATED });
  });

  it('合法签名 → 到达 handler 正常返回；无 user-id 系统调用同样放行', async () => {
    expect(await ping(userIdMetadata('u1', SECRET))).toEqual({ note: 'pong:hi' });
    expect(await ping(new Metadata())).toEqual({ note: 'pong:hi' });
  });

  it('拒绝被外层 metrics 计入 UNAUTHENTICATED（拦截器顺序）', async () => {
    const family = await metrics.registry.getSingleMetric('yunyan_grpc_requests_total');
    const data = await family?.get();
    const unauth = data?.values
      .filter(v => v.labels['code'] === 'UNAUTHENTICATED')
      .reduce((sum, v) => sum + v.value, 0);
    expect(unauth).toBe(3);
  });
});
