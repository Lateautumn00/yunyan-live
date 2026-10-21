import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import type { Metadata } from '@grpc/grpc-js';
import { userIdMetadata } from '@yunyan-live/nest-shared';
import { LiveController } from '../live.controller';
import type { LiveService } from '../live.service';
import { expectGrpcError } from './test-utils';

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
    getVideoRoomMap: vi.fn(),
    getCoursewareRoom: vi.fn(),
    saveCourseware: vi.fn(),
    listCoursewares: vi.fn(),
    deleteCourseware: vi.fn(),
    saveBoardSnapshot: vi.fn(),
    listBoardSnapshots: vi.fn(),
    getBoardSnapshot: vi.fn(),
    getLatestBoardSnapshot: vi.fn(),
    checkRoomAccess: vi.fn(),
    getUserWatchTimeList: vi.fn(),
    moderateUser: vi.fn(),
    recallMessage: vi.fn()
  };
}

function makeCheckinService(): ServiceMock {
  return {
    create: vi.fn(),
    respond: vi.fn(),
    end: vi.fn(),
    openMakeup: vi.fn(),
    state: vi.fn(),
    listSessions: vi.fn(),
    records: vi.fn()
  };
}

function makeController() {
  const service = makeService();
  const checkinService = makeCheckinService();
  const controller = new LiveController(
    service as unknown as LiveService,
    checkinService as unknown as ConstructorParameters<typeof LiveController>[1]
  );
  return { controller, service, checkinService };
}

/** S4 域层下沉：房主 fixture（checkRoomAccess 判定 mock） */
const OWNER = 't1';
const ownerMeta = () => userIdMetadata(OWNER);
function mockOwner(service: ServiceMock) {
  service.checkRoomAccess.mockResolvedValue({ allowed: true, isTeacher: true });
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
    mockOwner(service);
    service.changeStatus.mockResolvedValue({
      roomId: 'r1',
      title: '第一课',
      joinCode: 'SA1',
      status: 2
    });
    const res = await controller.changeStatus({ room_id: 'r1', status: 2 }, ownerMeta());
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
    mockOwner(service);
    service.update.mockResolvedValue({
      roomId: 'r1',
      title: '改名',
      joinCode: 'SA1',
      status: 1,
      type: 1,
      startTime: new Date(1704153600000),
      duration: 90
    });
    const res = await controller.updateLive(
      {
        room_id: 'r1',
        title: '改名',
        type: 1,
        start_time: '1704153600000',
        duration: 90
      },
      ownerMeta()
    );
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
    mockOwner(service);
    service.delete.mockResolvedValue({ success: true });
    const res = await controller.deleteLive({ room_id: 'r1' }, ownerMeta());
    expect(service.delete).toHaveBeenCalledWith('r1');
    expect(res).toEqual({ code: '0', msg: 'success' });
  });

  it('UpdateCode：join_code 平铺返回（不包 data）', async () => {
    const { controller, service } = makeController();
    mockOwner(service);
    service.updateCode.mockResolvedValue('SB9ZZZZZ');
    const res = await controller.updateCode({ room_id: 'r1' }, ownerMeta());
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
    expect(service.getStudentRooms).toHaveBeenCalledWith('u1', 2, 3, undefined);

    service.getStudentRooms.mockClear();
    await controller.getStudentRooms(
      { page: 1, page_size: 10, cursor: '1704067200000|pid-9' },
      userIdMetadata('u1')
    );
    expect(service.getStudentRooms).toHaveBeenCalledWith('u1', 1, 10, '1704067200000|pid-9');
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
    mockOwner(service);
    service.saveVideoRecording.mockResolvedValue(undefined);
    const res = await controller.saveVideoRecording(
      {
        room_id: 'r1',
        file_path: '/r/v1.mp4',
        file_name: 'v1.mp4',
        file_size: 1024,
        duration: 3600,
        record_type: 1,
        teacher_name: '张老师'
      },
      ownerMeta()
    );
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
    mockOwner(service);
    service.deleteVideoByRoomIds.mockResolvedValue({ success: true });
    const res = await controller.deleteVideoByRoomIds({ room_ids: ['r1', 'r2'] }, ownerMeta());
    expect(service.deleteVideoByRoomIds).toHaveBeenCalledWith(['r1', 'r2']);
    expect(res).toEqual({ code: '0', msg: 'success' });
  });

  it('DeleteVideoByVideoIds：数组透传', async () => {
    const { controller, service } = makeController();
    mockOwner(service);
    service.getVideoRoomMap.mockResolvedValue([{ videoId: 'v1', roomId: 'r1' }]);
    service.deleteVideoByVideoIds.mockResolvedValue({ success: true });
    const res = await controller.deleteVideoByVideoIds({ video_ids: ['v1'] }, ownerMeta());
    expect(service.deleteVideoByVideoIds).toHaveBeenCalledWith(['v1']);
    expect(res).toEqual({ code: '0', msg: 'success' });
  });

  it('SaveCourseware：filesize 数字化，非法值回退 0', async () => {
    const { controller, service } = makeController();
    mockOwner(service);
    service.saveCourseware.mockResolvedValue(undefined);
    await controller.saveCourseware(
      {
        room_id: 'r1',
        filename: 'a.pptx',
        filext: 'pptx',
        filesize: '123' as unknown as number,
        fileurl: '/u/a.pptx',
        create_user_id: 'u1'
      },
      ownerMeta()
    );
    expect(service.saveCourseware).toHaveBeenCalledWith({
      roomId: 'r1',
      filename: 'a.pptx',
      filext: 'pptx',
      filesize: 123,
      fileurl: '/u/a.pptx',
      createUserId: 'u1'
    });

    await controller.saveCourseware(
      {
        room_id: 'r1',
        filename: 'b.pdf',
        filext: 'pdf',
        filesize: 'garbage' as unknown as number,
        fileurl: '/u/b.pdf'
      },
      ownerMeta()
    );
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
    mockOwner(service);
    service.getCoursewareRoom.mockResolvedValue('r1');
    service.deleteCourseware.mockResolvedValue(undefined);
    const res = await controller.deleteCourseware({ id: 'c1' }, ownerMeta());
    expect(service.deleteCourseware).toHaveBeenCalledWith('c1');
    expect(res).toEqual({ code: '0', msg: 'success' });
  });

  it('SaveBoardSnapshot：snake_case 入参映射，返回空成功信封（无身份=系统路径放行）', async () => {
    const { controller, service } = makeController();
    service.saveBoardSnapshot.mockResolvedValue({ id: 's1' });
    const bytes = new Uint8Array([1, 2]);
    const res = await controller.saveBoardSnapshot({
      room_id: 'r1',
      lesson_id: 'L-9',
      format_version: 1,
      data: bytes
    });
    expect(service.checkRoomAccess).not.toHaveBeenCalled(); // 无身份=系统调用，不触发归属
    expect(service.saveBoardSnapshot).toHaveBeenCalledWith({
      roomId: 'r1',
      lessonId: 'L-9',
      formatVersion: 1,
      data: bytes
    });
    expect(res).toEqual({ code: '0', msg: 'success' });

    // lesson_id/format_version 缺省时透传 undefined，由 service 层回填默认值
    await controller.saveBoardSnapshot({ room_id: 'r1', data: bytes });
    expect(service.saveBoardSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({ lessonId: undefined, formatVersion: undefined })
    );
  });

  it('ListBoardSnapshots：条目 snake_case 映射，lessonId 空值转空串', async () => {
    const { controller, service } = makeController();
    mockOwner(service);
    service.listBoardSnapshots.mockResolvedValue({
      items: [
        {
          id: 's1',
          roomId: 'r1',
          lessonId: null,
          formatVersion: 1,
          size: 64,
          createdAt: '1704067200000'
        }
      ],
      hasMore: true
    });
    const res = await controller.listBoardSnapshots(
      {
        room_id: 'r1',
        cursor: '1704067200000',
        limit: 20
      },
      ownerMeta()
    );
    expect(service.listBoardSnapshots).toHaveBeenCalledWith({
      roomId: 'r1',
      cursor: '1704067200000',
      limit: 20
    });
    expect(res.data).toEqual({
      items: [
        {
          id: 's1',
          room_id: 'r1',
          lesson_id: '',
          format_version: 1,
          size: 64,
          created_at: '1704067200000'
        }
      ],
      has_more: true
    });
  });

  it('GetBoardSnapshot：id 透传，data 字节与 snake_case 元信息回传', async () => {
    const { controller, service } = makeController();
    mockOwner(service);
    const bytes = Buffer.from([7, 8]);
    service.getBoardSnapshot.mockResolvedValue({
      id: 's1',
      roomId: 'r1',
      lessonId: 'L-9',
      formatVersion: 1,
      data: bytes,
      createdAt: '1704067200000'
    });
    const res = await controller.getBoardSnapshot({ id: 's1' }, ownerMeta());
    expect(service.getBoardSnapshot).toHaveBeenCalledWith('s1');
    expect(res.data).toEqual({
      id: 's1',
      room_id: 'r1',
      lesson_id: 'L-9',
      format_version: 1,
      data: bytes,
      created_at: '1704067200000'
    });
  });

  it('GetLatestBoardSnapshot：room_id 映射并复用详情信封', async () => {
    const { controller, service } = makeController();
    service.getLatestBoardSnapshot.mockResolvedValue({
      id: 's2',
      roomId: 'r1',
      lessonId: null,
      formatVersion: 1,
      data: Buffer.from([1]),
      createdAt: '1704067200001'
    });
    const res = await controller.getLatestBoardSnapshot({ room_id: 'r1' });
    expect(service.getLatestBoardSnapshot).toHaveBeenCalledWith('r1');
    expect(res.data).toEqual({
      id: 's2',
      room_id: 'r1',
      lesson_id: '',
      format_version: 1,
      data: Buffer.from([1]),
      created_at: '1704067200001'
    });
  });

  it('CheckRoomAccess：room_id/user_id 透传，data 映射 snake_case', async () => {
    const { controller, service } = makeController();
    service.checkRoomAccess.mockResolvedValue({ allowed: true, isTeacher: false });
    const res = await controller.checkRoomAccess(
      { room_id: 'r1', user_id: 'u1' },
      userIdMetadata('u1')
    );
    expect(service.checkRoomAccess).toHaveBeenCalledWith('r1', 'u1');
    expect(res.code).toBe('0');
    expect(res.data).toEqual({ allowed: true, is_teacher: false });
  });

  it('CheckRoomAccess：缺 user-id 身份 → UNAUTHENTICATED，不透传（S10b）', async () => {
    const { controller, service } = makeController();
    await expectGrpcError(
      controller.checkRoomAccess({ room_id: 'r1', user_id: 'u1' }, userIdMetadata('')),
      GrpcStatus.UNAUTHENTICATED,
      'missing user-id metadata'
    );
    expect(service.checkRoomAccess).not.toHaveBeenCalled();
  });

  it('CheckRoomAccess：签名身份 ≠ body user_id → PERMISSION_DENIED（S10b）', async () => {
    const { controller, service } = makeController();
    await expectGrpcError(
      controller.checkRoomAccess({ room_id: 'r1', user_id: 'victim' }, userIdMetadata('attacker')),
      GrpcStatus.PERMISSION_DENIED,
      'user_id mismatch with authenticated identity'
    );
    expect(service.checkRoomAccess).not.toHaveBeenCalled();
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

  it('ModerateUser：操作者身份只信 metadata（S11①），透传 kind/op/minutes', async () => {
    const { controller, service } = makeController();
    mockOwner(service);
    service.moderateUser.mockResolvedValue(undefined);
    const res = await controller.moderateUser(
      { room_id: 'r1', user_id: 'u1', kind: 'mute', op: 'set', minutes: 5 },
      userIdMetadata('teacher-1')
    );
    expect(res.code).toBe('0');
    expect(service.checkRoomAccess).toHaveBeenCalledWith('r1', 'teacher-1');
    expect(service.moderateUser).toHaveBeenCalledWith('r1', 'u1', 'mute', 'set', 5, 'teacher-1');
  });

  it('ModerateUser：metadata 缺失身份 → unauthorized，不落库', async () => {
    const { controller, service } = makeController();
    const res = await controller.moderateUser(
      { room_id: 'r1', user_id: 'u1', kind: 'mute', op: 'set', minutes: 5 },
      userIdMetadata('')
    );
    expect(res.code).toBe('1');
    expect(res.msg).toBe('unauthorized');
    expect(service.moderateUser).not.toHaveBeenCalled();
  });

  it('ModerateUser：非法 kind/op → fail envelope，不落库', async () => {
    const { controller, service } = makeController();
    const badKind = await controller.moderateUser(
      { room_id: 'r1', user_id: 'u1', kind: 'ban', op: 'set', minutes: 5 },
      userIdMetadata('t1')
    );
    expect(badKind).toMatchObject({ code: '1', msg: 'invalid kind' });
    const badOp = await controller.moderateUser(
      { room_id: 'r1', user_id: 'u1', kind: 'mute', op: 'nuke', minutes: 5 },
      userIdMetadata('t1')
    );
    expect(badOp).toMatchObject({ code: '1', msg: 'invalid op' });
    expect(service.moderateUser).not.toHaveBeenCalled();
  });

  it('ModerateUser：mute set 仅接受 1/5/10 分钟；kick/release 不校验 minutes', async () => {
    const { controller, service } = makeController();
    mockOwner(service);
    service.moderateUser.mockResolvedValue(undefined);
    const bad = await controller.moderateUser(
      { room_id: 'r1', user_id: 'u1', kind: 'mute', op: 'set', minutes: 7 },
      userIdMetadata('t1')
    );
    expect(bad).toMatchObject({ code: '1', msg: 'invalid minutes' });
    const kick = await controller.moderateUser(
      { room_id: 'r1', user_id: 'u1', kind: 'kick', op: 'set', minutes: 0 },
      userIdMetadata('t1')
    );
    expect(kick.code).toBe('0');
    expect(service.moderateUser).toHaveBeenCalledTimes(1);
    expect(service.moderateUser).toHaveBeenCalledWith('r1', 'u1', 'kick', 'set', 0, 't1');
  });
});

describe('LiveController RecallMessage（F4 撤回信封映射）', () => {
  const MSG_ID = '3f1c9a02-1d4e-4b7a-9c2f-8e5d6a4b3c21';

  it('裁决 ok → code=0/success，身份只信 metadata（S11①）透传 room/msg', async () => {
    const { controller, service } = makeController();
    service.recallMessage.mockResolvedValue('ok');
    const res = await controller.recallMessage(
      { room_id: 'r1', msg_id: MSG_ID },
      userIdMetadata('u1')
    );
    expect(res.code).toBe('0');
    expect(res.msg).toBe('success');
    expect(service.recallMessage).toHaveBeenCalledWith('r1', MSG_ID, 'u1');
  });

  it('already（幂等重复）→ code=0 + msg=already_recalled（网关据此跳过广播/审计）', async () => {
    const { controller, service } = makeController();
    service.recallMessage.mockResolvedValue('already');
    const res = await controller.recallMessage(
      { room_id: 'r1', msg_id: MSG_ID },
      userIdMetadata('u1')
    );
    expect(res).toMatchObject({ code: '0', msg: 'already_recalled' });
  });

  it('not_found / forbidden / expired → 一一映射 fail msg', async () => {
    const { controller, service } = makeController();
    service.recallMessage.mockResolvedValue('not_found');
    const nf = await controller.recallMessage(
      { room_id: 'r1', msg_id: MSG_ID },
      userIdMetadata('u1')
    );
    expect(nf).toMatchObject({ code: '1', msg: 'not found' });
    service.recallMessage.mockResolvedValue('forbidden');
    const fb = await controller.recallMessage(
      { room_id: 'r1', msg_id: MSG_ID },
      userIdMetadata('u1')
    );
    expect(fb).toMatchObject({ code: '1', msg: 'forbidden' });
    service.recallMessage.mockResolvedValue('expired');
    const ex = await controller.recallMessage(
      { room_id: 'r1', msg_id: MSG_ID },
      userIdMetadata('u1')
    );
    expect(ex).toMatchObject({ code: '1', msg: 'expired' });
  });

  it('metadata 缺失身份 → unauthorized，不查库', async () => {
    const { controller, service } = makeController();
    const res = await controller.recallMessage(
      { room_id: 'r1', msg_id: MSG_ID },
      userIdMetadata('')
    );
    expect(res).toMatchObject({ code: '1', msg: 'unauthorized' });
    expect(service.recallMessage).not.toHaveBeenCalled();
  });

  it('缺 room_id/msg_id → missing，不查库', async () => {
    const { controller, service } = makeController();
    const res = await controller.recallMessage({ room_id: 'r1' }, userIdMetadata('u1'));
    expect(res).toMatchObject({ code: '1', msg: 'missing room_id/msg_id' });
    expect(service.recallMessage).not.toHaveBeenCalled();
  });

  it('非法 msg_id（非 uuid）→ not found，不落库不抛错', async () => {
    const { controller, service } = makeController();
    const res = await controller.recallMessage(
      { room_id: 'r1', msg_id: 'not-a-uuid' },
      userIdMetadata('u1')
    );
    expect(res).toMatchObject({ code: '1', msg: 'not found' });
    expect(service.recallMessage).not.toHaveBeenCalled();
  });
});

describe('LiveController S4 域层下沉：房间归属断言唯一落层', () => {
  const OWNER_CALLS: Array<{
    name: string;
    invoke: (c: LiveController, meta: Metadata | undefined) => Promise<unknown>;
    /** 读端点（如 GetBoardSnapshot）无写方法，可省略 */
    write?: string;
    setup?: (s: ServiceMock) => void;
  }> = [
    {
      name: 'ChangeStatus',
      invoke: (c, m) => c.changeStatus({ room_id: 'r1', status: 2 }, m),
      write: 'changeStatus'
    },
    {
      name: 'UpdateLive',
      invoke: (c, m) => c.updateLive({ room_id: 'r1', title: 'x' }, m),
      write: 'update'
    },
    {
      name: 'DeleteLive',
      invoke: (c, m) => c.deleteLive({ room_id: 'r1' }, m),
      write: 'delete'
    },
    {
      name: 'UpdateCode',
      invoke: (c, m) => c.updateCode({ room_id: 'r1' }, m),
      write: 'updateCode'
    },
    {
      name: 'SaveVideoRecording',
      invoke: (c, m) =>
        c.saveVideoRecording(
          {
            room_id: 'r1',
            file_path: '/r/v1.mp4',
            file_name: 'v1.mp4',
            file_size: 1,
            duration: 1,
            record_type: 1,
            teacher_name: 't'
          },
          m
        ),
      write: 'saveVideoRecording'
    },
    {
      name: 'DeleteVideoByRoomIds',
      invoke: (c, m) => c.deleteVideoByRoomIds({ room_ids: ['r1'] }, m),
      write: 'deleteVideoByRoomIds'
    },
    {
      name: 'DeleteVideoByVideoIds',
      invoke: (c, m) => c.deleteVideoByVideoIds({ video_ids: ['v1'] }, m),
      write: 'deleteVideoByVideoIds',
      setup: s => s.getVideoRoomMap.mockResolvedValue([{ videoId: 'v1', roomId: 'r1' }])
    },
    {
      name: 'SaveCourseware',
      invoke: (c, m) =>
        c.saveCourseware(
          { room_id: 'r1', filename: 'a.pptx', filext: 'pptx', filesize: 1, fileurl: '/u/a.pptx' },
          m
        ),
      write: 'saveCourseware'
    },
    {
      name: 'DeleteCourseware',
      invoke: (c, m) => c.deleteCourseware({ id: 'c1' }, m),
      write: 'deleteCourseware',
      setup: s => s.getCoursewareRoom.mockResolvedValue('r1')
    },
    {
      name: 'ListBoardSnapshots',
      invoke: (c, m) => c.listBoardSnapshots({ room_id: 'r1' }, m),
      write: 'listBoardSnapshots'
    },
    {
      name: 'GetBoardSnapshot',
      invoke: (c, m) => c.getBoardSnapshot({ id: 's1' }, m),
      setup: s =>
        s.getBoardSnapshot.mockResolvedValue({
          id: 's1',
          roomId: 'r1',
          lessonId: 'L-9',
          formatVersion: 1,
          data: Buffer.from([]),
          createdAt: '1704067200000'
        })
    }
  ];

  it.each(OWNER_CALLS)(
    '$name：缺 metadata → UNAUTHENTICATED（fail-closed，不查归属不落写）',
    async ({ invoke, setup }) => {
      const { controller, service } = makeController();
      setup?.(service);
      await expectGrpcError(
        invoke(controller, undefined),
        GrpcStatus.UNAUTHENTICATED,
        'missing user-id metadata'
      );
      expect(service.checkRoomAccess).not.toHaveBeenCalled();
    }
  );

  it.each(OWNER_CALLS)(
    '$name：非房主 → PERMISSION_DENIED，写方法零调用',
    async ({ invoke, write, setup }) => {
      const { controller, service } = makeController();
      setup?.(service);
      service.checkRoomAccess.mockResolvedValue({ allowed: true, isTeacher: false });
      await expectGrpcError(
        invoke(controller, userIdMetadata('student-1')),
        GrpcStatus.PERMISSION_DENIED,
        'not room owner'
      );
      expect(service.checkRoomAccess).toHaveBeenCalledWith('r1', 'student-1');
      if (write) expect(service[write]).not.toHaveBeenCalled();
    }
  );

  it('SaveBoardSnapshot：带身份非房主 → PERMISSION_DENIED（网关路径）；无身份 → 系统路径放行（yjs-ws）', async () => {
    const { controller, service } = makeController();
    service.saveBoardSnapshot.mockResolvedValue({ id: 's1' });
    service.checkRoomAccess.mockResolvedValue({ allowed: true, isTeacher: false });
    const bytes = new Uint8Array([1]);
    await expectGrpcError(
      controller.saveBoardSnapshot({ room_id: 'r1', data: bytes }, userIdMetadata('student-1')),
      GrpcStatus.PERMISSION_DENIED,
      'not room owner'
    );
    expect(service.saveBoardSnapshot).not.toHaveBeenCalled();

    // 无身份（yjs-ws 系统落盘）：不触发归属，直接落库
    await controller.saveBoardSnapshot({ room_id: 'r1', data: bytes });
    expect(service.saveBoardSnapshot).toHaveBeenCalledTimes(1);
  });

  it('ModerateUser：缺身份 → unauthorized 信封；非房主 → PERMISSION_DENIED 且零落写', async () => {
    const { controller, service } = makeController();
    service.moderateUser.mockResolvedValue(undefined);

    const noAuth = await controller.moderateUser(
      { room_id: 'r1', user_id: 'u1', kind: 'kick', op: 'set' },
      undefined as unknown as Metadata
    );
    expect(noAuth).toMatchObject({ code: '1', msg: 'unauthorized' });
    expect(service.moderateUser).not.toHaveBeenCalled();

    service.checkRoomAccess.mockResolvedValue({ allowed: true, isTeacher: false });
    await expectGrpcError(
      controller.moderateUser(
        { room_id: 'r1', user_id: 'u1', kind: 'kick', op: 'set' },
        userIdMetadata('student-1')
      ),
      GrpcStatus.PERMISSION_DENIED,
      'not room owner'
    );
    expect(service.moderateUser).not.toHaveBeenCalled();
  });
});
