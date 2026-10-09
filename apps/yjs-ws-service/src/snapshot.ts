import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { GRPC_LOADER_OPTIONS, resolveProto } from '@yunyan-live/nest-shared';

/** 快照格式版本：Yjs v1 update（Y.encodeStateAsUpdate），写入与恢复共用 */
export const SNAPSHOT_FORMAT_VERSION = 1;

/** LIVE_GRPC_URL 置空可整体关闭持久化（本地开发/纯测试场景） */
const GRPC_URL = process.env.LIVE_GRPC_URL ?? '127.0.0.1:50052';
const DISABLED = GRPC_URL === '';

export type LoadLatestResult = { ok: true; bytes: Uint8Array | null } | { ok: false };

interface SaveResponse {
  code: string;
  msg: string;
}

interface DetailResponse {
  code: string;
  msg: string;
  data?: {
    id: string;
    room_id: string;
    format_version: number;
    data: Uint8Array;
    created_at: string;
  };
}

interface BoardSnapshotClient {
  SaveBoardSnapshot(
    req: {
      room_id: string;
      lesson_id?: string;
      format_version: number;
      data: Uint8Array;
    },
    cb: (err: (grpc.ServiceError & { code?: number }) | null, res?: SaveResponse) => void
  ): void;
  GetLatestBoardSnapshot(
    req: { room_id: string },
    cb: (err: (grpc.ServiceError & { code?: number }) | null, res?: DetailResponse) => void
  ): void;
}

let client: BoardSnapshotClient | null = null;

function getClient(): BoardSnapshotClient {
  if (!client) {
    const definition = protoLoader.loadSync(resolveProto('live.proto'), GRPC_LOADER_OPTIONS);
    const pkg = grpc.loadPackageDefinition(definition) as unknown as {
      live: {
        LiveService: new (
          address: string,
          credentials: grpc.ChannelCredentials
        ) => BoardSnapshotClient;
      };
    };
    client = new pkg.live.LiveService(GRPC_URL, grpc.credentials.createInsecure());
  }
  return client;
}

function call<T>(
  invoke: (cb: (err: (grpc.ServiceError & { code?: number }) | null, res?: T) => void) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    invoke((err, res) => {
      if (err) reject(err);
      else resolve(res as T);
    });
  });
}

/** 写入房间快照；失败抛错交由调用方重试（不阻塞课堂，D1/F6.2） */
export async function saveSnapshot(
  roomId: string,
  bytes: Uint8Array,
  lessonId?: string
): Promise<void> {
  if (DISABLED) return;
  const res = await call<SaveResponse>(cb =>
    getClient().SaveBoardSnapshot(
      {
        room_id: roomId,
        lesson_id: lessonId,
        format_version: SNAPSHOT_FORMAT_VERSION,
        data: bytes
      },
      cb
    )
  );
  if (res && res.code !== '0') {
    throw new Error(`saveSnapshot rejected: code=${res.code} msg=${res.msg}`);
  }
}

/**
 * 拉取房间最新快照。
 * - ok:true + bytes:null = 无历史（正常新房间）
 * - ok:false = 存储不可达/异常 → 调用方必须跳过该房间的 flush，避免用空文档覆盖新快照
 */
export async function loadLatestSnapshot(roomId: string): Promise<LoadLatestResult> {
  if (DISABLED) return { ok: true, bytes: null };
  try {
    const res = await call<DetailResponse>(cb =>
      getClient().GetLatestBoardSnapshot({ room_id: roomId }, cb)
    );
    if (res?.code !== '0' || !res.data?.id) return { ok: true, bytes: null };
    return { ok: true, bytes: res.data.data ?? null };
  } catch (err) {
    const code = (err as { code?: number })?.code;
    // NOT_FOUND = 该房间从未存过快照，属正常空态
    if (code === grpc.status.NOT_FOUND) return { ok: true, bytes: null };
    console.error(
      '[YjsWS] loadLatestSnapshot failed:',
      err instanceof Error ? err.message : String(err)
    );
    return { ok: false };
  }
}
