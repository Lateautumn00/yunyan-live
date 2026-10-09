import { expect, vi } from 'vitest';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { LiveService } from '../live.service';

type QbResults = {
  getManyAndCount?: [unknown[], number];
  getRawMany?: unknown[];
  getCount?: number;
};

const CHAIN_METHODS = [
  'select',
  'addSelect',
  'where',
  'andWhere',
  'orderBy',
  'groupBy',
  'innerJoin',
  'skip',
  'take'
] as const;

type Mock = ReturnType<typeof vi.fn>;

type MockQb = Record<string, unknown>;
type ManagerMock = Record<string, Mock>;
type QueryRunnerMock = {
  connect: Mock;
  startTransaction: Mock;
  commitTransaction: Mock;
  rollbackTransaction: Mock;
  release: Mock;
  manager: ManagerMock;
};
type RepoMock = { qb: MockQb; repo: Record<string, Mock> };
type JanusMock = { createRoom: Mock; destroyRoom: Mock };
type DataSourceMock = {
  manager: ManagerMock;
  queryRunner: QueryRunnerMock;
  dataSource: { createQueryRunner: Mock };
};

function mockQueryBuilder(results: QbResults = {}): MockQb {
  const qb: MockQb = {};
  for (const name of CHAIN_METHODS) {
    qb[name] = vi.fn(() => qb);
  }
  qb.getManyAndCount = vi.fn().mockResolvedValue(results.getManyAndCount ?? [[], 0]);
  qb.getRawMany = vi.fn().mockResolvedValue(results.getRawMany ?? []);
  qb.getCount = vi.fn().mockResolvedValue(results.getCount ?? 0);
  return qb;
}

export function chainCalls(qb: MockQb, method: string): unknown[][] {
  return (qb[method] as ReturnType<typeof vi.fn>).mock.calls;
}

export function mockRepo(results: QbResults = {}): RepoMock {
  const qb = mockQueryBuilder(results);
  const repo: Record<string, Mock> = {
    createQueryBuilder: vi.fn(() => qb),
    findOne: vi.fn(),
    find: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn((input: unknown) => input),
    save: vi.fn((input: unknown) => Promise.resolve(input)),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue({ affected: 0 }),
    softDelete: vi.fn().mockResolvedValue(undefined),
    findByIds: vi.fn().mockResolvedValue([]),
    remove: vi.fn((input: unknown) => Promise.resolve(input))
  };
  return { qb, repo };
}

function mockDataSource(): DataSourceMock {
  const manager: ManagerMock = {
    findOne: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    save: vi.fn((input: unknown) => Promise.resolve(input))
  };
  const queryRunner: QueryRunnerMock = {
    connect: vi.fn().mockResolvedValue(undefined),
    startTransaction: vi.fn().mockResolvedValue(undefined),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    rollbackTransaction: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    manager
  };
  const dataSource = { createQueryRunner: vi.fn(() => queryRunner) };
  return { manager, queryRunner, dataSource };
}

type LiveServiceHarness = {
  service: LiveService;
  room: RepoMock;
  participant: RepoMock;
  transfer: RepoMock;
  video: RepoMock;
  watchTime: RepoMock;
  courseware: RepoMock;
  boardSnapshot: RepoMock;
  janus: JanusMock;
  manager: ManagerMock;
  queryRunner: QueryRunnerMock;
  dataSource: { createQueryRunner: Mock };
};

export function createLiveService(
  opts: {
    room?: RepoMock;
    participant?: RepoMock;
    transfer?: RepoMock;
    video?: RepoMock;
    watchTime?: RepoMock;
    courseware?: RepoMock;
    boardSnapshot?: RepoMock;
    janus?: JanusMock;
    database?: DataSourceMock;
  } = {}
): LiveServiceHarness {
  const room = opts.room ?? mockRepo();
  const participant = opts.participant ?? mockRepo();
  const transfer = opts.transfer ?? mockRepo();
  const video = opts.video ?? mockRepo();
  const watchTime = opts.watchTime ?? mockRepo();
  const courseware = opts.courseware ?? mockRepo();
  const boardSnapshot = opts.boardSnapshot ?? mockRepo();
  const janus = opts.janus ?? { createRoom: vi.fn(), destroyRoom: vi.fn() };
  const database = opts.database ?? mockDataSource();
  const service = new LiveService(
    room.repo as never,
    participant.repo as never,
    transfer.repo as never,
    video.repo as never,
    watchTime.repo as never,
    courseware.repo as never,
    boardSnapshot.repo as never,
    database.dataSource as never,
    janus as never
  );
  return {
    service,
    room,
    participant,
    transfer,
    video,
    watchTime,
    courseware,
    boardSnapshot,
    janus,
    ...database
  };
}

export async function expectGrpcError(
  promise: Promise<unknown>,
  code: (typeof GrpcStatus)[keyof typeof GrpcStatus],
  message: string
) {
  const err = await promise.then(
    () => {
      throw new Error('expected promise to reject with RpcException');
    },
    (e: unknown) => e as RpcException
  );
  expect(err).toBeInstanceOf(RpcException);
  expect(err.message).toBe(message);
  expect((err.getError() as { code: number }).code).toBe(code);
}
