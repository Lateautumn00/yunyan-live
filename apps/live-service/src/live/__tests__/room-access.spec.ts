import { status as GrpcStatus } from '@grpc/grpc-js';
import { describe, expect, it } from 'vitest';
import { createLiveService, expectGrpcError } from './test-utils';

describe('LiveService.checkRoomAccess', () => {
  it('roomId/userId 缺失抛 INVALID_ARGUMENT，不查库', async () => {
    const { service, room, participant } = createLiveService();
    await expectGrpcError(
      service.checkRoomAccess('', 'u1'),
      GrpcStatus.INVALID_ARGUMENT,
      'roomId and userId are required'
    );
    await expectGrpcError(
      service.checkRoomAccess('r1', ''),
      GrpcStatus.INVALID_ARGUMENT,
      'roomId and userId are required'
    );
    expect(room.repo.findOne).not.toHaveBeenCalled();
    expect(participant.repo.findOne).not.toHaveBeenCalled();
  });

  it('房间不存在（含软删被 findOne 排除）→ 拒绝且不再查参与者', async () => {
    const { service, room, participant } = createLiveService();
    room.repo.findOne.mockResolvedValue(null);
    const res = await service.checkRoomAccess('r1', 'u1');
    expect(room.repo.findOne).toHaveBeenCalledWith({ where: { roomId: 'r1' } });
    expect(res).toEqual({ allowed: false, isTeacher: false });
    expect(participant.repo.findOne).not.toHaveBeenCalled();
  });

  it('房间教师（liveUserId 匹配）→ 允许且 isTeacher=true，不查参与者', async () => {
    const { service, room, participant } = createLiveService();
    room.repo.findOne.mockResolvedValue({ roomId: 'r1', liveUserId: 'u1' });
    const res = await service.checkRoomAccess('r1', 'u1');
    expect(res).toEqual({ allowed: true, isTeacher: true });
    expect(participant.repo.findOne).not.toHaveBeenCalled();
  });

  it('在册学生（live_participants 存在）→ 允许且 isTeacher=false', async () => {
    const { service, room, participant } = createLiveService();
    room.repo.findOne.mockResolvedValue({ roomId: 'r1', liveUserId: 'teacher-1' });
    participant.repo.findOne.mockResolvedValue({ id: 'p1', roomId: 'r1', userId: 'u1' });
    const res = await service.checkRoomAccess('r1', 'u1');
    expect(participant.repo.findOne).toHaveBeenCalledWith({
      where: { roomId: 'r1', userId: 'u1' }
    });
    expect(res).toEqual({ allowed: true, isTeacher: false });
  });

  it('非房间教师且不在册 → 拒绝', async () => {
    const { service, room, participant } = createLiveService();
    room.repo.findOne.mockResolvedValue({ roomId: 'r1', liveUserId: 'teacher-1' });
    participant.repo.findOne.mockResolvedValue(null);
    const res = await service.checkRoomAccess('r1', 'u1');
    expect(res).toEqual({ allowed: false, isTeacher: false });
  });
});
