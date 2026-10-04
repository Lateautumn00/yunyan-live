import { describe, expect, it, vi } from 'vitest';
import { createLiveService } from './test-utils';

describe('LiveService.getStudentRooms', () => {
  it('无参与记录时短路返回空列表', async () => {
    const { service, participant, room } = createLiveService();
    participant.repo.find.mockResolvedValue([]);
    await expect(service.getStudentRooms('u1')).resolves.toEqual({ items: [], total: 0 });
    expect(room.repo.findByIds).not.toHaveBeenCalled();
    expect(participant.repo.find).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      order: { joinedAt: 'DESC' }
    });
  });

  it('分页取参与记录并按房间补全，total 为全量参与数', async () => {
    const { service, participant, room } = createLiveService();
    const p1 = { userId: 'u1', roomId: 'r1', joinedAt: new Date(1704067200000) };
    const p2 = { userId: 'u1', roomId: 'r2', joinedAt: new Date(1704067260000) };
    const p3 = { userId: 'u1', roomId: 'r3', joinedAt: new Date(1704067320000) };
    participant.repo.find.mockResolvedValue([p1, p2, p3]);
    room.repo.findByIds.mockResolvedValue([
      { roomId: 'r3', title: 'C', liveUserId: 't1', joinCode: 'SC1', status: 1, startTime: new Date(1704067320000), type: 0 }
    ]);
    const res = await service.getStudentRooms('u1', 2, 2);
    expect(res.total).toBe(3);
    expect(room.repo.findByIds).toHaveBeenCalledWith(['r3']);
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
      joinedAt: p3.joinedAt
    });
  });

  it('参与记录对应房间已消失时过滤该项', async () => {
    const { service, participant, room } = createLiveService();
    participant.repo.find.mockResolvedValue([
      { userId: 'u1', roomId: 'rGone', joinedAt: new Date() }
    ]);
    room.repo.findByIds.mockResolvedValue([]);
    const res = await service.getStudentRooms('u1');
    expect(res.items).toHaveLength(0);
    expect(res.total).toBe(1);
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

  it('关闭在线时长并递减 liveNums', async () => {
    const { service, watchTime, room } = createLiveService();
    const wt = { userId: 'u1', roomId: 'r1', leftAt: null as Date | null };
    const roomRow = { roomId: 'r1', liveNums: 3 };
    watchTime.repo.findOne.mockResolvedValue(wt);
    room.repo.findOne.mockResolvedValue(roomRow);
    await expect(service.leaveRoom('u1', 'r1')).resolves.toEqual({ success: true });
    expect(wt.leftAt).toBeInstanceOf(Date);
    expect(watchTime.repo.save).toHaveBeenCalledWith(wt);
    expect(roomRow.liveNums).toBe(2);
    expect(room.repo.save).toHaveBeenCalledWith(roomRow);
  });

  it('liveNums 已为 0 时不写房间，避免负数', async () => {
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
      where: [{ userId: 'u1', roomId: 'r1' }, { userId: 'u1', roomId: 'r2' }]
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

  it('逐房间关闭时长并递减各自 liveNums', async () => {
    const { service, participant, watchTime, room } = createLiveService();
    participant.repo.find.mockResolvedValue([]);
    const wt1 = { userId: 'u1', roomId: 'r1', leftAt: null as Date | null };
    const wt2 = { userId: 'u1', roomId: 'r2', leftAt: null as Date | null };
    watchTime.repo.findOne
      .mockResolvedValueOnce(wt1)
      .mockResolvedValueOnce(wt2);
    const room1 = { roomId: 'r1', liveNums: 2 };
    const room2 = { roomId: 'r2', liveNums: 1 };
    room.repo.findOne
      .mockResolvedValueOnce(room1)
      .mockResolvedValueOnce(room2);
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
