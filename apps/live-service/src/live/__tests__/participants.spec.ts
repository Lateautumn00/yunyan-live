import { describe, expect, it, vi } from 'vitest';
import { createLiveService } from './test-utils';

describe('LiveService.getStudentRooms', () => {
  function roomRow(overrides: Record<string, unknown> = {}) {
    return {
      joinedAt: new Date(1704067320000),
      roomId: 'r3',
      title: 'C',
      liveUserId: 't1',
      joinCode: 'SC1',
      status: 1,
      startTime: new Date(1704067320000),
      type: 0,
      ...overrides
    };
  }

  function stubQueries(manager: Record<string, unknown>, pageRows: unknown[], total: number) {
    const q = manager.query as ReturnType<typeof vi.fn>;
    q.mockReset().mockResolvedValueOnce(pageRows).mockResolvedValueOnce([{ total }]);
    return q;
  }

  it('无参与记录返回空列表；软删房间由 JOIN 过滤（total 与页一致）', async () => {
    const { service, manager } = createLiveService();
    const q = stubQueries(manager, [], 0);
    await expect(service.getStudentRooms('u1')).resolves.toEqual({ items: [], total: 0 });
    expect(q).toHaveBeenCalledTimes(2);
    expect(q.mock.calls[0][0]).toContain('JOIN live_rooms r');
    expect(q.mock.calls[0][0]).toContain('r."deletedAt" IS NULL');
    expect(q.mock.calls[0][0]).toContain('ORDER BY p."joinedAt" DESC, p.id DESC');
    expect(q.mock.calls[0][1]).toEqual(['u1', 10, 0]);
  });

  it('分页参数下推 LIMIT/OFFSET 并完整映射字段', async () => {
    const { service, manager } = createLiveService();
    const q = stubQueries(manager, [roomRow()], 3);
    const res = await service.getStudentRooms('u1', 2, 2);
    expect(res.total).toBe(3);
    expect(q.mock.calls[0][1]).toEqual(['u1', 2, 2]);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toEqual({
      id: 'r3',
      roomId: 'r3',
      title: 'C',
      liveUserId: 't1',
      joinCode: 'SC1',
      status: 1,
      startTime: new Date(1704067320000),
      type: 0,
      joinedAt: new Date(1704067320000)
    });
  });

  it('pageSize 钳制上限 100（防大 pageSize 穿透）', async () => {
    const { service, manager } = createLiveService();
    const q = stubQueries(manager, [], 0);
    await service.getStudentRooms('u1', 1, 999999);
    expect(q.mock.calls[0][1]).toEqual(['u1', 100, 0]);
  });

  it('合法 cursor 走 keyset，非法 cursor 回落 OFFSET', async () => {
    const { service, manager } = createLiveService();
    const q = stubQueries(manager, [roomRow()], 1);
    await service.getStudentRooms('u1', 1, 10, '1704067200000|pid-9');
    expect(q.mock.calls[0][0]).toContain('(p."joinedAt", p.id) <');
    expect(q.mock.calls[0][1]).toEqual(['u1', new Date(1704067200000), 'pid-9', 10, 0]);
    stubQueries(manager, [], 0);
    await service.getStudentRooms('u1', 1, 10, 'bad-cursor');
    expect(q.mock.calls[0][0]).not.toContain('(p."joinedAt", p.id) <');
    expect(q.mock.calls[0][1]).toEqual(['u1', 10, 0]);
  });
});

describe('LiveService.leaveRoom', () => {
  it('无进行中的在线时长记录时直接成功', async () => {
    const { service, watchTime, room } = createLiveService();
    watchTime.repo.findOne.mockResolvedValue(null);
    await expect(service.leaveRoom('u1', 'r1')).resolves.toEqual({ success: true });
    expect(watchTime.repo.save).not.toHaveBeenCalled();
    expect(room.repo.save).not.toHaveBeenCalled();
    expect(watchTime.repo.findOne).toHaveBeenCalledWith({
      where: { userId: 'u1', roomId: 'r1', leftAt: null }
    });
  });

  it('关闭在线时长并按在线数重算 liveNums', async () => {
    const { service, watchTime, room } = createLiveService();
    const wt = { userId: 'u1', roomId: 'r1', leftAt: null as Date | null };
    const roomRow = { roomId: 'r1', liveNums: 3 };
    watchTime.repo.findOne.mockResolvedValue(wt);
    watchTime.repo.count.mockResolvedValue(2);
    room.repo.findOne.mockResolvedValue(roomRow);
    await expect(service.leaveRoom('u1', 'r1')).resolves.toEqual({ success: true });
    expect(wt.leftAt).toBeInstanceOf(Date);
    expect(watchTime.repo.save).toHaveBeenCalledWith(wt);
    expect(roomRow.liveNums).toBe(2);
    expect(room.repo.save).toHaveBeenCalledWith(roomRow);
  });

  it('liveNums 与在线数不一致时按在线数纠正（自愈）', async () => {
    const { service, watchTime, room } = createLiveService();
    const wt = { userId: 'u1', roomId: 'r1', leftAt: null as Date | null };
    watchTime.repo.findOne.mockResolvedValue(wt);
    watchTime.repo.count.mockResolvedValue(3);
    room.repo.findOne.mockResolvedValue({ roomId: 'r1', liveNums: 0 });
    await service.leaveRoom('u1', 'r1');
    expect(room.repo.save).toHaveBeenCalledWith({ roomId: 'r1', liveNums: 3 });
  });

  it('liveNums 与在线数一致时不重复写房间', async () => {
    const { service, watchTime, room } = createLiveService();
    const wt = { userId: 'u1', roomId: 'r1', leftAt: null as Date | null };
    watchTime.repo.findOne.mockResolvedValue(wt);
    room.repo.findOne.mockResolvedValue({ roomId: 'r1', liveNums: 0 });
    await service.leaveRoom('u1', 'r1');
    expect(watchTime.repo.save).toHaveBeenCalled();
    expect(room.repo.save).not.toHaveBeenCalled();
  });

  it('房间已不存在时仍关闭在线时长', async () => {
    const { service, watchTime, room } = createLiveService();
    const wt = { userId: 'u1', roomId: 'r1', leftAt: null as Date | null };
    watchTime.repo.findOne.mockResolvedValue(wt);
    room.repo.findOne.mockResolvedValue(null);
    await service.leaveRoom('u1', 'r1');
    expect(watchTime.repo.save).toHaveBeenCalledWith(wt);
    expect(room.repo.save).not.toHaveBeenCalled();
  });
});

describe('LiveService.batchLeave', () => {
  it('无参与记录不调用 remove，逐房间关闭在线时长', async () => {
    const { service, participant, watchTime } = createLiveService();
    participant.repo.find.mockResolvedValue([]);
    watchTime.repo.findOne.mockResolvedValue(null);
    await expect(service.batchLeave('u1', ['r1', 'r2'])).resolves.toEqual({ success: true });
    expect(participant.repo.remove).not.toHaveBeenCalled();
    expect(watchTime.repo.findOne).toHaveBeenCalledTimes(2);
    expect(watchTime.repo.save).not.toHaveBeenCalled();
    expect(participant.repo.find).toHaveBeenCalledWith({
      where: [
        { userId: 'u1', roomId: 'r1' },
        { userId: 'u1', roomId: 'r2' }
      ]
    });
  });

  it('批量移除参与记录', async () => {
    const { service, participant, watchTime } = createLiveService();
    const list = [{ userId: 'u1', roomId: 'r1' }];
    participant.repo.find.mockResolvedValue(list);
    watchTime.repo.findOne.mockResolvedValue(null);
    await service.batchLeave('u1', ['r1']);
    expect(participant.repo.remove).toHaveBeenCalledWith(list);
  });

  it('逐房间关闭时长并按各自在线数重算 liveNums', async () => {
    const { service, participant, watchTime, room } = createLiveService();
    participant.repo.find.mockResolvedValue([]);
    const wt1 = { userId: 'u1', roomId: 'r1', leftAt: null as Date | null };
    const wt2 = { userId: 'u1', roomId: 'r2', leftAt: null as Date | null };
    watchTime.repo.findOne.mockResolvedValueOnce(wt1).mockResolvedValueOnce(wt2);
    watchTime.repo.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const room1 = { roomId: 'r1', liveNums: 2 };
    const room2 = { roomId: 'r2', liveNums: 1 };
    room.repo.findOne.mockResolvedValueOnce(room1).mockResolvedValueOnce(room2);
    await service.batchLeave('u1', ['r1', 'r2']);
    expect(wt1.leftAt).toBeInstanceOf(Date);
    expect(wt2.leftAt).toBeInstanceOf(Date);
    expect(watchTime.repo.save).toHaveBeenCalledTimes(2);
    expect(room1.liveNums).toBe(1);
    expect(room2.liveNums).toBe(0);
    expect(room.repo.save).toHaveBeenCalledTimes(2);
  });
});

describe('LiveService.getParticipants', () => {
  it('按加入时间倒序透传参与者', async () => {
    const { service, participant } = createLiveService();
    const list = [{ userId: 'u2' }, { userId: 'u1' }];
    participant.repo.find.mockResolvedValue(list);
    const res = await service.getParticipants('r1');
    expect(res).toBe(list);
    expect(participant.repo.find).toHaveBeenCalledWith({
      where: { roomId: 'r1' },
      order: { joinedAt: 'DESC' }
    });
    expect(participant.repo.find).toHaveBeenCalledTimes(1);
    expect(vi.mocked(participant.repo.find)).toBeTruthy();
  });
});
