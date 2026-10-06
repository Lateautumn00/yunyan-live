import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { userIdMetadata } from '@yunyan-live/nest-shared';
import { LiveController } from '../live.controller';
import type { LiveService } from '../live.service';

type ServiceMock = Record<string, ReturnType<typeof vi.fn>>;

function makeService(): ServiceMock {
  return {
    create: vi.fn(),
    update: vi.fn(),
    join: vi.fn(),
    showRoom: vi.fn(),
    changeStatus: vi.fn(),
    cmsList: vi.fn(),
    cmsDetail: vi.fn(),
    delete: vi.fn(),
    updateCode: vi.fn(),
    getStudentRooms: vi.fn(),
    leaveRoom: vi.fn(),
    batchLeave: vi.fn(),
    getParticipants: vi.fn(),
    generateRoomTransferCode: vi.fn(),
    executeRoomTransfer: vi.fn(),
    saveVideoRecording: vi.fn(),
    getVideoList: vi.fn(),
    getVideoDetail: vi.fn(),
    deleteVideoByRoomIds: vi.fn(),
    deleteVideoByVideoIds: vi.fn(),
    saveCourseware: vi.fn(),
    listCoursewares: vi.fn(),
    deleteCourseware: vi.fn(),
    getUserWatchTimeList: vi.fn()
  };
}

function makeController() {
  const service = makeService();
  const controller = new LiveController(service as unknown as LiveService);
  return { controller, service };
}

describe('LiveController gRPC 映射', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('CreateLive：snake_case 入参、metadata userId 与 snake_case 响应', async () => {
    const { controller, service } = makeController();
    service.create.mockResolvedValue({
      roomId: 'r1',
      title: '第一课',
      joinCode: 'SA1',
      status: 1
    });
    const res = await controller.createLive(
      { title: '第一课', type: 0, start_time: '1704067200000', duration: 60, room_id: 'x1' },
      userIdMetadata('u1')
    );
    expect(service.create).toHaveBeenCalledWith(
      { title: '第一课', type: 0, startTime: '1704067200000', duration: 60, roomId: 'x1' },
      'u1'
    );
    expect(res).toEqual({
      code: '0',
      msg: 'success',
      data: {
        room_id: 'r1',
        title: '第一课',
        speaker_name: '',
        join_code: 'SA1',
        status: 1
      }
    });
  });

  it('JoinLive：join_code/live_user_id 映射并回传角色与房间状态', async () => {
    const { controller, service } = makeController();
    service.join.mockResolvedValue({
      liveUserId: 'u1',
      roomId: 'r1',
      roleName: 'student',
      joinCode: 'SA1',
      liveType: 'smallClass',
      status: 2
    });
    const res = await controller.joinLive({ join_code: 'SA1', live_user_id: 'u1' });
    expect(service.join).toHaveBeenCalledWith({ joinCode: 'SA1', liveUserId: 'u1' });
    expect(res).toEqual({
      code: '0',
      msg: 'success',
      data: {
        live_user_id: 'u1',
        room_id: 'r1',
        role_name: 'student',
        join_code: 'SA1',
        live_type: 'smallClass',
        status: 2
      }
    });
  });

  it('ShowRoom：liveStartedAt 序列化毫秒字符串，缺失时回空串', async () => {
    const { controller, service } = makeController();
    service.showRoom.mockResolvedValueOnce({
      roomId: 'r1',
      title: '第一课',
      joinCode: 'SA1',
      status: 2,
      type: 0,
      liveStartedAt: new Date(1704067200000),
      liveUserId: 't1'
    });
    const res = await controller.showRoom({ room_id: 'r1' });
    expect(service.showRoom).toHaveBeenCalledWith('r1');
    expect(res.data).toMatchObject({
      room_id: 'r1',
      live_started_at: '1704067200000',
      live_user_id: 't1'
    });

    service.showRoom.mockResolvedValueOnce({
      roomId: 'r2',
      title: 'B',
      joinCode: 'SB1',
      status: 1,
      type: 1,
      liveStartedAt: null,
      liveUserId: 't2'
    });
    const res2 = await controller.showRoom({ room_id: 'r2' });
    expect(res2.data).toMatchObject({ room_id: 'r2', live_started_at: '' });
  });

  it('ChangeStatus：room_id/status 双向映射', async () => {
    const { controller, service } = makeController();
    service.changeStatus.mockResolvedValue({
      roomId: 'r1',
      title: '第一课',
      joinCode: 'SA1',
      status: 2
    });
    const res = await controller.changeStatus({ room_id: 'r1', status: 2 });
    expect(service.changeStatus).toHaveBeenCalledWith({ roomId: 'r1', status: 2 });
    expect(res.data).toEqual({
      room_id: 'r1',
      title: '第一课',
      speaker_name: '',
      join_code: 'SA1',
      status: 2
    });
  });

  it('UpdateLive：字段透传且 startTime 序列化为毫秒字符串', async () => {
    const { controller, service } = makeController();
    service.update.mockResolvedValue({
      roomId: 'r1',
      title: '改名',
      joinCode: 'SA1',
      status: 1,
      type: 1,
      startTime: new Date(1704153600000),
      duration: 90
    });
    const res = await controller.updateLive({
      room_id: 'r1',
      title: '改名',
      type: 1,
      start_time: '1704153600000',
      duration: 90
    });
    expect(service.update).toHaveBeenCalledWith({
      roomId: 'r1',
      title: '改名',
      type: 1,
      startTime: '1704153600000',
      duration: 90
    });
    expect(res.data).toEqual({
      room_id: 'r1',
      title: '改名',
      speaker_name: '',
      join_code: 'SA1',
      status: 1,
      type: 1,
      start_time: '1704153600000',
      duration: 90
    });
  });

  it('CmsList：userId 取自 metadata 而非请求体，分页与过滤参数逐位映射', async () => {
    const { controller, service } = makeController();
    service.cmsList.mockResolvedValue({
      list: [
        {
          roomId: 'r1',
          title: '第一课',
          liveUserId: 't1',
          joinCode: 'SA1',
          status: 2,
          type: 0,
          startTime: new Date(1704067200000),
          teacherCode: 'SA1',
          studentCode: 'SA1',
          duration: 60
        }
      ],
      total: 1,
      page: 1,
      pageSize: 10
    });
    const res = await controller.cmsList(
      {
        page: 1,
        page_size: 10,
        status: 2,
        live_user_id: 'ignored',
        search_name: '数学',
        start_time: '1704000000000',
        end_time: '1704999999000',
        type: 0
      },
      userIdMetadata('u1')
    );
    expect(service.cmsList).toHaveBeenCalledWith(
      1,
      10,
      2,
      'u1',
      '数学',
      '1704000000000',
      '1704999999000',
      0
    );
    expect(res.data).toEqual({
      items: [
        {
          room_id: 'r1',
          title: '第一课',
          speaker_name: '',
          live_user_id: 't1',
          join_code: 'SA1',
          status: 2,
          type: 0,
          start_time: '1704067200000',
          teacher_code: 'SA1',
          student_code: 'SA1',
          duration: 60
        }
      ],
      total: 1
    });
  });

  it('CmsDetail：teacher_code/student_code 回填 joinCode', async () => {
    const { controller, service } = makeController();
    service.cmsDetail.mockResolvedValue({
      roomId: 'r1',
      title: '第一课',
      joinCode: 'SA1',
      status: 1,
      type: 0,
      startTime: new Date(1704067200000),
      duration: 60
    });
    const res = await controller.cmsDetail({ room_id: 'r1' });
    expect(service.cmsDetail).toHaveBeenCalledWith('r1');
    expect(res.data).toEqual({
      room_id: 'r1',
      title: '第一课',
      speaker_name: '',
      join_code: 'SA1',
      status: 1,
      type: 0,
      start_time: '1704067200000',
      duration: 60,
      teacher_code: 'SA1',
      student_code: 'SA1'
    });
  });

  it('DeleteLive：透传 room_id 并返回空成功信封', async () => {
    const { controller, service } = makeController();
    service.delete.mockResolvedValue({ success: true });
    const res = await controller.deleteLive({ room_id: 'r1' });
    expect(service.delete).toHaveBeenCalledWith('r1');
    expect(res).toEqual({ code: '0', msg: 'success' });
  });

  it('UpdateCode：join_code 平铺返回（不包 data）', async () => {
    const { controller, service } = makeController();
    service.updateCode.mockResolvedValue('SB9ZZZZZ');
    const res = await controller.updateCode({ room_id: 'r1' });
    expect(service.updateCode).toHaveBeenCalledWith('r1');
    expect(res).toEqual({ code: '0', msg: 'success', join_code: 'SB9ZZZZZ' });
  });

  it('GetStudentRooms：userId 取自 metadata，items 映射 snake_case', async () => {
    const { controller, service } = makeController();
    service.getStudentRooms.mockResolvedValue({
      items: [
        {
          roomId: 'r1',
          title: '第一课',
          liveUserId: 't1',
          joinCode: 'SA1',
          status: 1,
          startTime: new Date(1704067200000),
          type: 0,
          joinedAt: new Date(1704070000000)
        }
      ],
      total: 5
    });
    const res = await controller.getStudentRooms({ page: 2, page_size: 3 }, userIdMetadata('u1'));
    expect(service.getStudentRooms).toHaveBeenCalledWith('u1', 2, 3);
    expect(res.data).toEqual({
      items: [
        {
          room_id: 'r1',
          title: '第一课',
          speaker_name: '',
          live_user_id: 't1',
          join_code: 'SA1',
          status: 1,
          start_time: '1704067200000',
          type: 0
        }
      ],
      total: 5
    });
  });

  it('LeaveRoom：userId 取自 metadata', async () => {
    const { controller, service } = makeController();
    service.leaveRoom.mockResolvedValue({ success: true });
    const res = await controller.leaveRoom({ room_id: 'r1' }, userIdMetadata('u1'));
    expect(service.leaveRoom).toHaveBeenCalledWith('u1', 'r1');
    expect(res).toEqual({ code: '0', msg: 'success' });
  });

  it('BatchLeave：room_ids 数组与 metadata userId 透传', async () => {
    const { controller, service } = makeController();
    service.batchLeave.mockResolvedValue({ success: true });
    const res = await controller.batchLeave({ room_ids: ['r1', 'r2'] }, userIdMetadata('u1'));
    expect(service.batchLeave).toHaveBeenCalledWith('u1', ['r1', 'r2']);
    expect(res).toEqual({ code: '0', msg: 'success' });
  });

  it('GetParticipants：joined_at 序列化 ISO，username 暂用 userId', async () => {
    const { controller, service } = makeController();
    service.getParticipants.mockResolvedValue([
      { userId: 'u1', joinedAt: new Date(1704067200000) },
      { userId: 'u2', joinedAt: new Date(1704067260000) }
    ]);
    const res = await controller.getParticipants({ room_id: 'r1' });
    expect(service.getParticipants).toHaveBeenCalledWith('r1');
    expect(res.data).toEqual({
      items: [
        { user_id: 'u1', username: 'u1', joined_at: '2024-01-01T00:00:00.000Z' },
        { user_id: 'u2', username: 'u2', joined_at: '2024-01-01T00:01:00.000Z' }
      ],
      total: 2
    });
  });

  it('GenerateTransferCode：transfer_code/expires_at 平铺返回', async () => {
    const { controller, service } = makeController();
    service.generateRoomTransferCode.mockResolvedValue({
      code: 'TABCD123',
      expiresAt: '2024-06-01T01:00:00.000Z'
    });
    const res = await controller.generateTransferCode({ room_id: 'r1', target_user_id: 'u2' });
    expect(service.generateRoomTransferCode).toHaveBeenCalledWith('r1', 'u2');
    expect(res).toEqual({
      code: '0',
      msg: 'success',
      transfer_code: 'TABCD123',
      expires_at: '2024-06-01T01:00:00.000Z'
    });
  });

  it('ExecuteTransfer：三字段映射并返回转移成功消息', async () => {
    const { controller, service } = makeController();
    service.executeRoomTransfer.mockResolvedValue({ success: true });
    const res = await controller.executeTransfer({
      room_id: 'r1',
      transfer_code: 'TABCD123',
      from_user_id: 't1'
    });
    expect(service.executeRoomTransfer).toHaveBeenCalledWith('r1', 'TABCD123', 't1');
    expect(res).toEqual({ code: '0', msg: '转移成功' });
  });

  it('SaveVideoRecording：七个 snake_case 字段映射为 camelCase', async () => {
    const { controller, service } = makeController();
    service.saveVideoRecording.mockResolvedValue(undefined);
    const res = await controller.saveVideoRecording({
      room_id: 'r1',
      file_path: '/r/v1.mp4',
      file_name: 'v1.mp4',
      file_size: 1024,
      duration: 3600,
      record_type: 1,
      teacher_name: '张老师'
    });
    expect(service.saveVideoRecording).toHaveBeenCalledWith({
      roomId: 'r1',
      filePath: '/r/v1.mp4',
      fileName: 'v1.mp4',
      fileSize: 1024,
      duration: 3600,
      recordType: 1,
      teacherName: '张老师'
    });
    expect(res).toEqual({ code: '0', msg: 'success' });
  });

  it('GetVideoList：分页与过滤映射，items 逐字段回 snake_case', async () => {
    const { controller, service } = makeController();
    service.getVideoList.mockResolvedValue({
      items: [
        {
          roomId: 'r1',
          title: '第一课',
          teacherName: '张老师',
          type: 0,
          startTime: '1704067200000',
          count: 3
        }
      ],
      total: 1
    });
    const res = await controller.getVideoList({
      page: 1,
      page_size: 5,
      live_user_id: 't1',
      search_name: '数学',
      start_time: '1704000000000',
      end_time: '1704999999000',
      type: 0
    });
    expect(service.getVideoList).toHaveBeenCalledWith({
      page: 1,
      pageSize: 5,
      liveUserId: 't1',
      searchName: '数学',
      startTime: '1704000000000',
      endTime: '1704999999000',
      type: 0
    });
    expect(res.data).toEqual({
      items: [
        {
          room_id: 'r1',
          title: '第一课',
          teacher_name: '张老师',
          type: 0,
          start_time: '1704067200000',
          count: 3
        }
      ],
      total: 1
    });
  });

  it('GetVideoDetail：明细字段 snake_case 且 created_at 透传', async () => {
    const { controller, service } = makeController();
    service.getVideoDetail.mockResolvedValue({
      items: [
        {
          id: 'v1',
          roomId: 'r1',
          filePath: '/r/v1.mp4',
          fileName: 'v1.mp4',
          fileSize: 1024,
          duration: 3600,
          recordType: 1,
          teacherName: '张老师',
          createdAt: '1704067200000'
        }
      ],
      total: 1
    });
    const res = await controller.getVideoDetail({
      room_id: 'r1',
      start_time: '1704000000000',
      end_time: '1704999999000'
    });
    expect(service.getVideoDetail).toHaveBeenCalledWith({
      roomId: 'r1',
      startTime: '1704000000000',
      endTime: '1704999999000'
    });
    expect(res.data.items[0]).toEqual({
      id: 'v1',
      room_id: 'r1',
      file_path: '/r/v1.mp4',
      file_name: 'v1.mp4',
      file_size: 1024,
      duration: 3600,
      record_type: 1,
      teacher_name: '张老师',
      created_at: '1704067200000'
    });
    expect(res.data.total).toBe(1);
  });

  it('DeleteVideoByRoomIds：数组透传', async () => {
    const { controller, service } = makeController();
    service.deleteVideoByRoomIds.mockResolvedValue({ success: true });
    const res = await controller.deleteVideoByRoomIds({ room_ids: ['r1', 'r2'] });
    expect(service.deleteVideoByRoomIds).toHaveBeenCalledWith(['r1', 'r2']);
    expect(res).toEqual({ code: '0', msg: 'success' });
  });

  it('DeleteVideoByVideoIds：数组透传', async () => {
    const { controller, service } = makeController();
    service.deleteVideoByVideoIds.mockResolvedValue({ success: true });
    const res = await controller.deleteVideoByVideoIds({ video_ids: ['v1'] });
    expect(service.deleteVideoByVideoIds).toHaveBeenCalledWith(['v1']);
    expect(res).toEqual({ code: '0', msg: 'success' });
  });

  it('SaveCourseware：filesize 数字化，非法值回退 0', async () => {
    const { controller, service } = makeController();
    service.saveCourseware.mockResolvedValue(undefined);
    await controller.saveCourseware({
      room_id: 'r1',
      filename: 'a.pptx',
      filext: 'pptx',
      filesize: '123' as unknown as number,
      fileurl: '/u/a.pptx',
      create_user_id: 'u1'
    });
    expect(service.saveCourseware).toHaveBeenCalledWith({
      roomId: 'r1',
      filename: 'a.pptx',
      filext: 'pptx',
      filesize: 123,
      fileurl: '/u/a.pptx',
      createUserId: 'u1'
    });

    await controller.saveCourseware({
      room_id: 'r1',
      filename: 'b.pdf',
      filext: 'pdf',
      filesize: 'garbage' as unknown as number,
      fileurl: '/u/b.pdf'
    });
    expect(service.saveCourseware).toHaveBeenLastCalledWith(
      expect.objectContaining({ filesize: 0, createUserId: undefined })
    );
  });

  it('ListCourseware：条目 snake_case 映射', async () => {
    const { controller, service } = makeController();
    service.listCoursewares.mockResolvedValue({
      items: [
        {
          id: 'c1',
          roomId: 'r1',
          filename: 'a.pptx',
          filext: 'pptx',
          filesize: 123,
          fileurl: '/u/a.pptx',
          createdAt: '2024-01-01'
        }
      ],
      total: 1
    });
    const res = await controller.listCourseware({ room_id: 'r1' });
    expect(service.listCoursewares).toHaveBeenCalledWith('r1');
    expect(res.data).toEqual({
      items: [
        {
          id: 'c1',
          room_id: 'r1',
          filename: 'a.pptx',
          filext: 'pptx',
          filesize: 123,
          fileurl: '/u/a.pptx',
          created_at: '2024-01-01'
        }
      ],
      total: 1
    });
  });

  it('DeleteCourseware：id 透传', async () => {
    const { controller, service } = makeController();
    service.deleteCourseware.mockResolvedValue(undefined);
    const res = await controller.deleteCourseware({ id: 'c1' });
    expect(service.deleteCourseware).toHaveBeenCalledWith('c1');
    expect(res).toEqual({ code: '0', msg: 'success' });
  });

  it('GetUserWatchTimeList：watch_time 秒数计算与在线 left_at 空串', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:05:00Z'));
    const { controller, service } = makeController();
    service.getUserWatchTimeList.mockResolvedValue({
      items: [
        {
          userId: 'u1',
          joinedAt: new Date('2024-01-01T00:04:00Z'),
          leftAt: new Date('2024-01-01T00:04:40Z'),
          isOnline: false
        },
        {
          userId: 'u2',
          joinedAt: new Date('2024-01-01T00:03:00Z'),
          leftAt: null,
          isOnline: true
        }
      ],
      total: 2,
      totalTime: 260
    });
    const res = await controller.getUserWatchTimeList({
      page: 1,
      page_size: 10,
      room_id: 'r1',
      search_name: '小明'
    });
    expect(service.getUserWatchTimeList).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      roomId: 'r1',
      searchName: '小明'
    });
    expect(res.data).toEqual({
      items: [
        {
          user_id: 'u1',
          username: 'u1',
          watch_time: 40,
          joined_at: '2024-01-01T00:04:00.000Z',
          left_at: '2024-01-01T00:04:40.000Z',
          is_online: false
        },
        {
          user_id: 'u2',
          username: 'u2',
          watch_time: 120,
          joined_at: '2024-01-01T00:03:00.000Z',
          left_at: '',
          is_online: true
        }
      ],
      total: 2,
      total_time_by_room: 260
    });
  });
});
