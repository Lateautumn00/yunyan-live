import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { GRPC_LOADER_OPTIONS, resolveProto } from '@yunyan-live/nest-shared';

/**
 * D8 房间访问校验（握手成员校验 + 写权限判定的房间级来源）。
 * 与快照持久化共用 LIVE_GRPC_URL 开关：置空整体跳过（本地开发/纯测试），
 * 此时调用方退回 JWT 角色判定；gRPC 不可达同样返回 null（fail-open，仅保留写过滤）。
 */
const GRPC_URL = process.env.LIVE_GRPC_URL ?? '127.0.0.1:50052';
const DISABLED = GRPC_URL === '';

const CHECK_DEADLINE_MS = 2000;

export type RoomAccess = { allowed: boolean; isTeacher: boolean };

interface AccessResponse {
  code: string;
  msg: string;
  data?: {
    allowed: boolean;
    is_teacher: boolean;
  };
}

interface RoomAccessClient {
  CheckRoomAccess(
    req: { room_id: string; user_id: string },
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    cb: (err: (grpc.ServiceError & { code?: number }) | null, res?: AccessResponse) => void
  ): void;
}

let client: RoomAccessClient | null = null;

function getClient(): RoomAccessClient {
  if (!client) {
    const definition = protoLoader.loadSync(resolveProto('live.proto'), GRPC_LOADER_OPTIONS);
    const pkg = grpc.loadPackageDefinition(definition) as unknown as {
      live: {
        LiveService: new (
          address: string,
          credentials: grpc.ChannelCredentials
        ) => RoomAccessClient;
      };
    };
    client = new pkg.live.LiveService(GRPC_URL, grpc.credentials.createInsecure());
  }
  return client;
}

/**
 * 校验用户是否可进入白板房间及其房间内角色。
 * 返回 null = 未启用/不可达（调用方按 fail-open 处理，退回 JWT 角色）。
 */
export async function checkRoomAccess(roomId: string, userId: string): Promise<RoomAccess | null> {
  if (DISABLED) return null;
  return new Promise<RoomAccess | null>(resolve => {
    getClient().CheckRoomAccess(
      { room_id: roomId, user_id: userId },
      new grpc.Metadata(),
      { deadline: Date.now() + CHECK_DEADLINE_MS },
      (err, res) => {
        if (err || !res || res.code !== '0' || !res.data) {
          console.error(
            '[YjsWS] checkRoomAccess fail-open:',
            err ? err.message : `code=${res?.code} msg=${res?.msg}`
          );
          resolve(null);
          return;
        }
        resolve({ allowed: res.data.allowed, isTeacher: res.data.is_teacher });
      }
    );
  });
}
