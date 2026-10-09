import { status as GrpcStatus } from '@grpc/grpc-js';
import { describe, expect, it, vi } from 'vitest';
import { createLiveService, expectGrpcError } from './test-utils';

function fillKeepFind(find: ReturnType<typeof vi.fn>, n: number) {
  find.mockResolvedValue(
    Array.from({ length: n }, (_, i) => ({ id: `s${n - i}` })) as unknown as never
  );
}

describe('LiveService.saveBoardSnapshot', () => {
  it('六字段入库（lessonId 缺省 null、formatVersion 缺省 1、size=字节数）并返回 id', async () => {
    const { service, boardSnapshot } = createLiveService();
    boardSnapshot.repo.find.mockResolvedValue([] as never);
    boardSnapshot.repo.create.mockReturnValueOnce({ id: 'snap1' });
    const data = new Uint8Array([1, 2, 3, 4]);
    const res = await service.saveBoardSnapshot({ roomId: 'r1', data });
    expect(boardSnapshot.repo.create).toHaveBeenCalledWith({
      roomId: 'r1',
      lessonId: null,
      formatVersion: 1,
      data: Buffer.from(data),
      size: 4
    });
    expect(boardSnapshot.repo.save).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ id: 'snap1' });
  });

  it('显式 lessonId 与 formatVersion 原样入库', async () => {
    const { service, boardSnapshot } = createLiveService();
    boardSnapshot.repo.find.mockResolvedValue([] as never);
    await service.saveBoardSnapshot({
      roomId: 'r1',
      lessonId: 'L-9',
      formatVersion: 2,
      data: new Uint8Array([9])
    });
    expect(boardSnapshot.repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ lessonId: 'L-9', formatVersion: 2, size: 1 })
    );
  });

  it('未达保留上限（10）不裁剪', async () => {
    const { service, boardSnapshot } = createLiveService();
    fillKeepFind(boardSnapshot.repo.find, 9);
    await service.saveBoardSnapshot({ roomId: 'r1', data: new Uint8Array([1]) });
    expect(boardSnapshot.repo.delete).not.toHaveBeenCalled();
  });

  it('达到保留上限才裁剪：删除条件限定同房间且不在最新 10 条内', async () => {
    const { service, boardSnapshot } = createLiveService();
    fillKeepFind(boardSnapshot.repo.find, 10);
    await service.saveBoardSnapshot({ roomId: 'r1', data: new Uint8Array([1]) });
    expect(boardSnapshot.repo.delete).toHaveBeenCalledTimes(1);
    const criteria = boardSnapshot.repo.delete.mock.calls[0][0] as Record<string, unknown>;
    expect(criteria.roomId).toBe('r1');
    expect(criteria.id).toBeDefined();
  });

  it('roomId 缺失抛 INVALID_ARGUMENT，不写库', async () => {
    const { service, boardSnapshot } = createLiveService();
    await expectGrpcError(
      service.saveBoardSnapshot({ roomId: '', data: new Uint8Array([1]) }),
      GrpcStatus.INVALID_ARGUMENT,
      'roomId is required'
    );
    expect(boardSnapshot.repo.create).not.toHaveBeenCalled();
  });
});

describe('LiveService.listBoardSnapshots', () => {
  it('默认 20 条：take=21、createdAt 倒序、select 排除 data 大字段', async () => {
    const { service, boardSnapshot } = createLiveService();
    boardSnapshot.repo.find.mockResolvedValue([] as never);
    const res = await service.listBoardSnapshots({ roomId: 'r1' });
    expect(res).toEqual({ items: [], hasMore: false });
    const args = boardSnapshot.repo.find.mock.calls[0][0] as Record<string, unknown>;
    expect(args.where).toEqual({ roomId: 'r1' });
    expect(args.order).toEqual({ createdAt: 'DESC' });
    expect(args.take).toBe(21);
    expect(args.select).not.toContain('data');
  });

  it('cursor 追加 createdAt LessThan，limit 上限夹取 100（take=101）', async () => {
    const { service, boardSnapshot } = createLiveService();
    boardSnapshot.repo.find.mockResolvedValue([] as never);
    await service.listBoardSnapshots({ roomId: 'r1', cursor: '1704067200000', limit: 500 });
    const args = boardSnapshot.repo.find.mock.calls[0][0] as {
      where: Record<string, unknown>;
      take: number;
    };
    expect(args.take).toBe(101);
    expect(args.where.roomId).toBe('r1');
    expect(args.where.createdAt).toBeDefined();
    expect((args.where.createdAt as { type: string }).type).toBe('lessThan');
  });

  it('多取一条命中 hasMore=true 并截断到 limit', async () => {
    const { service, boardSnapshot } = createLiveService();
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `s${i}`,
      roomId: 'r1',
      lessonId: null,
      formatVersion: 1,
      size: 10,
      createdAt: new Date(1704067200000 + i)
    }));
    boardSnapshot.repo.find.mockResolvedValue(rows as never);
    const res = await service.listBoardSnapshots({ roomId: 'r1', limit: 2 });
    expect(res.hasMore).toBe(true);
    expect(res.items).toHaveLength(2);
    expect(res.items[0]).toMatchObject({ id: 's0', createdAt: '1704067200000' });
  });

  it('roomId 缺失抛 INVALID_ARGUMENT', async () => {
    const { service } = createLiveService();
    await expectGrpcError(
      service.listBoardSnapshots({ roomId: '' }),
      GrpcStatus.INVALID_ARGUMENT,
      'roomId is required'
    );
  });
});

describe('LiveService.getBoardSnapshot', () => {
  it('不存在抛 NOT_FOUND', async () => {
    const { service, boardSnapshot } = createLiveService();
    boardSnapshot.repo.findOne.mockResolvedValue(null as never);
    await expectGrpcError(
      service.getBoardSnapshot('missing'),
      GrpcStatus.NOT_FOUND,
      'board snapshot not found'
    );
  });

  it('返回映射：createdAt 序列化毫秒字符串、data 原样带出', async () => {
    const { service, boardSnapshot } = createLiveService();
    boardSnapshot.repo.findOne.mockResolvedValue({
      id: 'snap1',
      roomId: 'r1',
      lessonId: 'L-9',
      formatVersion: 1,
      data: Buffer.from([7, 8]),
      createdAt: new Date(1704067200000)
    } as never);
    const res = await service.getBoardSnapshot('snap1');
    expect(res).toEqual({
      id: 'snap1',
      roomId: 'r1',
      lessonId: 'L-9',
      formatVersion: 1,
      data: Buffer.from([7, 8]),
      createdAt: '1704067200000'
    });
  });

  it('空 id 抛 INVALID_ARGUMENT', async () => {
    const { service } = createLiveService();
    await expectGrpcError(
      service.getBoardSnapshot(''),
      GrpcStatus.INVALID_ARGUMENT,
      'snapshot id is required'
    );
  });
});

describe('LiveService.getLatestBoardSnapshot', () => {
  it('按 createdAt 倒序取该房间最新一条并映射', async () => {
    const { service, boardSnapshot } = createLiveService();
    boardSnapshot.repo.findOne.mockResolvedValue({
      id: 'snap9',
      roomId: 'r1',
      lessonId: null,
      formatVersion: 1,
      data: Buffer.from([1]),
      createdAt: new Date(1704067200000)
    } as never);
    const res = await service.getLatestBoardSnapshot('r1');
    const args = boardSnapshot.repo.findOne.mock.calls[0][0] as Record<string, unknown>;
    expect(args.where).toEqual({ roomId: 'r1' });
    expect(args.order).toEqual({ createdAt: 'DESC' });
    expect(res).toMatchObject({ id: 'snap9', createdAt: '1704067200000' });
  });

  it('房间无快照抛 NOT_FOUND（yjs-ws 视为可新建空文档）', async () => {
    const { service, boardSnapshot } = createLiveService();
    boardSnapshot.repo.findOne.mockResolvedValue(null as never);
    await expectGrpcError(
      service.getLatestBoardSnapshot('fresh'),
      GrpcStatus.NOT_FOUND,
      'board snapshot not found'
    );
  });

  it('roomId 缺失抛 INVALID_ARGUMENT', async () => {
    const { service } = createLiveService();
    await expectGrpcError(
      service.getLatestBoardSnapshot(''),
      GrpcStatus.INVALID_ARGUMENT,
      'roomId is required'
    );
  });
});
