import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { Observable, of, throwError } from 'rxjs';
import {
  ChangeStatusDto,
  CreateCoursewareDto,
  CreateLiveDto,
  JoinLiveDto,
  UpdateLiveDto
} from '@yunyan-live/nest-shared';
import { LiveController } from './live.controller';

/** 允许缺省 query 参数（模拟 express 未传入该 query） */
const q = (s?: string) => s as string;

interface UserRow {
  id: string;
  username: string;
  email: string;
  role: number;
}

function createController() {
  const liveService = {
    createLive: vi.fn((_payload: unknown, _metadata: unknown) => of({ code: '0', msg: 'ok' })),
    joinLive: vi.fn(() =>
      of({ roomId: 'r1', roleName: 'student', joinCode: 'S1', liveType: '1', status: 1 })
    ),
    showRoom: vi.fn(() => of(roomPayload())),
    changeStatus: vi.fn(() => of({ code: '0', msg: 'ok' })),
    updateLive: vi.fn(() => of({ code: '0', msg: 'ok' })),
    cmsList: vi.fn(() => of(listPayload())),
    cmsDetail: vi.fn(() => of(roomPayload())),
    deleteLive: vi.fn(() => of({ code: '0', msg: 'ok' })),
    updateCode: vi.fn(() => of({ code: '0', msg: 'ok', join_code: 'SNEW1234' })),
    getStudentRooms: vi.fn(() => of(studentRoomsPayload())),
    leaveRoom: vi.fn(() => of({ code: '0', msg: 'ok' })),
    batchLeave: vi.fn(() => of({ code: '0', msg: 'ok' })),
    generateTransferCode: vi.fn(() =>
      of({ code: '0', msg: 'ok', transfer_code: 'T1', expires_at: 'x' })
    ),
    executeTransfer: vi.fn(() => of({ code: '0', msg: 'ok' })),
    saveVideoRecording: vi.fn(() => of({ code: '0', msg: 'ok' })),
    getVideoList: vi.fn(
      (): Observable<{
        code: string;
        msg: string;
        data?: { items: Array<Record<string, unknown>>; total: number };
      }> =>
        of({
          code: '0',
          msg: 'ok',
          data: {
            items: [
              {
                room_id: 'r1',
                title: '回放一',
                teacher_name: '张老师',
                type: 1,
                start_time: '1704067200000',
                count: 3
              }
            ],
            total: 1
          }
        })
    ),
    getVideoDetail: vi.fn(
      (): Observable<{
        code: string;
        msg: string;
        data?: { items: Array<Record<string, unknown>>; total: number };
      }> =>
        of({
          code: '0',
          msg: 'ok',
          data: {
            items: [
              {
                id: 'v1',
                room_id: 'r1',
                file_path: '/rec/v1.mp4',
                file_name: 'v1.mp4',
                file_size: 10,
                duration: 60,
                record_type: 1,
                teacher_name: '张老师',
                created_at: '1704067200000'
              }
            ],
            total: 1
          }
        })
    ),
    deleteVideoByRoomIds: vi.fn(() => of({ code: '0', msg: 'ok' })),
    deleteVideoByVideoIds: vi.fn(() => of({ code: '0', msg: 'ok' })),
    getUserWatchTimeList: vi.fn(
      (): Observable<{
        code: string;
        msg: string;
        data?: {
          items: Array<Record<string, unknown>>;
          total: number;
          total_time_by_room: number;
        };
      }> =>
        of({
          code: '0',
          msg: 'ok',
          data: {
            items: [
              {
                user_id: 'u1',
                username: '甲同学',
                watch_time: 300,
                joined_at: 'a',
                left_at: 'b',
                is_online: true
              }
            ],
            total: 1,
            total_time_by_room: 900
          }
        })
    ),
    saveCourseware: vi.fn(() => of({ code: '0', msg: 'ok' })),
    listCourseware: vi.fn(
      (): Observable<{
        code: string;
        msg: string;
        data?: { items: Array<Record<string, unknown>>; total: number };
      }> =>
        of({
          code: '0',
          msg: 'ok',
          data: {
            items: [
              {
                id: 'c1',
                room_id: 'r1',
                filename: 'a.pptx',
                filext: 'pptx',
                filesize: 123,
                fileurl: '/u/a.pptx',
                created_at: '1704067200000'
              }
            ],
            total: 1
          }
        })
    ),
    deleteCourseware: vi.fn(() => of({ code: '0', msg: 'ok' }))
  };
  const authService = {
    getUser: vi.fn(
      (): Observable<{ code: string; msg: string; data?: UserRow }> =>
        of({ code: '0', msg: 'ok', data: { id: 't1', username: '张老师', email: 't@b.com', role: 1 } })
    ),
    batchGetUsers: vi.fn(
      (): Observable<{ code: string; msg: string; data?: UserRow[] }> =>
        of({
          code: '0',
          msg: 'ok',
          data: [
            { id: 'u1', username: '甲同学', email: '', role: 2 },
            { id: 't1', username: '张老师', email: '', role: 1 }
          ]
        })
    ),
    searchTeachers: vi.fn(
      (): Observable<{ code: string; msg: string; data?: UserRow[] }> =>
        of({ code: '0', msg: 'ok', data: [{ id: 't1', username: '张老师', email: '', role: 1 }] })
    )
  };
  const liveClient = { getService: vi.fn(() => liveService) };
  const authClient = { getService: vi.fn(() => authService) };
  const controller = new LiveController(liveClient as never, authClient as never);
  controller.onModuleInit();
  return { controller, liveService, authService, liveClient, authClient };
}

function roomPayload() {
  return {
    code: '0',
    msg: 'ok',
    data: {
      room_id: 'r1',
      title: '第一课',
      speaker_name: '张老师',
      join_code: 'SA1',
      status: 1,
      type: 0,
      start_time: '1704067200000',
      duration: 60,
      live_started_at: '1704067260000',
      live_user_id: 't1'
    }
  };
}

function listPayload() {
  return {
    code: '0',
    msg: 'ok',
    data: {
      items: [
        {
          room_id: 'r1',
          title: '第一课',
          speaker_name: '张老师',
          live_user_id: 't1',
          join_code: 'SA1',
          status: 1,
          type: 0,
          start_time: '1704067200000',
          duration: 60
        }
      ],
      total: 1
    }
  };
}

function studentRoomsPayload() {
  return {
    code: '0',
    msg: 'ok',
    data: {
      items: [
        {
          room_id: 'r2',
          title: '第二课',
          speaker_name: '张老师',
          join_code: 'SB1',
          status: 2,
          start_time: '1704153600000',
          type: 1,
          live_user_id: 't1'
        }
      ],
      total: 1
    }
  };
}

const req = (userId: string) => ({ user: { userId } });

beforeAll(() => {
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LiveController.onModuleInit', () => {
  it('解析 LiveService 与 AuthService 客户端', () => {
    const { liveClient, authClient } = createController();
    expect(liveClient.getService).toHaveBeenCalledWith('LiveService');
    expect(authClient.getService).toHaveBeenCalledWith('AuthService');
  });
});

describe('LiveController create / updateLive / join', () => {
  it('create 映射字段并携带 user-id 元数据，缺省回落 0/空串', async () => {
    const { controller, liveService } = createController();
    const dto = Object.assign(new CreateLiveDto(), { title: '第一课', startTime: '1704067200000' });
    await controller.create(dto, req('u1'));
    expect(liveService.createLive).toHaveBeenCalledWith(
      {
        title: '第一课',
        type: 0,
        start_time: '1704067200000',
        duration: 0,
        room_id: ''
      },
      expect.any(Metadata)
    );
    const metadata = liveService.createLive.mock.calls[0]?.[1] as Metadata;
    expect(metadata.get('user-id')[0]?.toString()).toBe('u1');
  });

  it('create 全字段透传', async () => {
    const { controller, liveService } = createController();
    const dto = Object.assign(new CreateLiveDto(), {
      title: '大班课',
      type: 1,
      startTime: '1704067200000',
      duration: 90,
      roomId: 'r9'
    });
    await controller.create(dto, req('u1'));
    expect(liveService.createLive).toHaveBeenCalledWith(
      expect.objectContaining({ type: 1, duration: 90, room_id: 'r9' }),
      expect.any(Metadata)
    );
  });

  it('updateLive 缺省字段回落空串/0', async () => {
    const { controller, liveService } = createController();
    const dto = Object.assign(new UpdateLiveDto(), { roomId: 'r1' });
    await controller.updateLive(dto);
    expect(liveService.updateLive).toHaveBeenCalledWith({
      room_id: 'r1',
      title: '',
      type: 0,
      start_time: '',
      duration: 0
    });
  });

  it('join 映射 join_code 并注入当前用户，忽略 nickName', async () => {
    const { controller, liveService } = createController();
    const dto = Object.assign(new JoinLiveDto(), {
      joinCode: 'SA1',
      nickName: '昵称'
    });
    const res = await controller.join(dto, req('u1'));
    expect(liveService.joinLive).toHaveBeenCalledWith({
      join_code: 'SA1',
      live_user_id: 'u1'
    });
    expect(res).toEqual({ roomId: 'r1', roleName: 'student', joinCode: 'S1', liveType: '1', status: 1 });
  });
});

describe('LiveController showRoom / cmsDetail / changeStatus', () => {
  it('showRoom 解析讲师名并镜像双码，恒带空 videoList', async () => {
    const { controller, authService } = createController();
    const res = await controller.showRoom('r1');
    expect(authService.getUser).toHaveBeenCalledWith({ user_id: 't1' });
    expect(res).toEqual({
      roomId: 'r1',
      title: '第一课',
      speakerName: '张老师',
      liveUserId: 't1',
      joinCode: 'SA1',
      status: 1,
      type: 0,
      videoList: [],
      liveStartedAt: '1704067260000'
    });
  });

  it('showRoom 无讲师时跳过用户查询，缺开播时间回落当前时间', async () => {
    const { controller, liveService, authService } = createController();
    const payload = roomPayload();
    payload.data.live_user_id = '';
    payload.data.live_started_at = '';
    liveService.showRoom.mockReturnValueOnce(of(payload));
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const res = await controller.showRoom('r1');
    expect(authService.getUser).not.toHaveBeenCalled();
    expect(res.speakerName).toBe('');
    expect(res.liveStartedAt).toBe('1700000000000');
  });

  it('showRoom 讲师查询失败时静默兜底空名', async () => {
    const { controller, authService } = createController();
    authService.getUser.mockReturnValueOnce(throwError(() => ({ code: 16, details: 'boom' })));
    const res = await controller.showRoom('r1');
    expect(res.speakerName).toBe('');
  });

  it('cmsDetail 同样解析讲师但不返回 videoList', async () => {
    const { controller } = createController();
    const res = await controller.cmsDetail('r1');
    expect(res).toEqual({
      roomId: 'r1',
      title: '第一课',
      speakerName: '张老师',
      joinCode: 'SA1',
      status: 1,
      type: 0,
      startTime: '1704067200000',
      duration: 60
    });
    expect('videoList' in res).toBe(false);
  });

  it('changeStatus 透传 room_id/status', async () => {
    const { controller, liveService } = createController();
    const dto = Object.assign(new ChangeStatusDto(), { roomId: 'r1', status: 3 });
    await controller.changeStatus(dto);
    expect(liveService.changeStatus).toHaveBeenCalledWith({ room_id: 'r1', status: 3 });
  });
});

describe('LiveController cmsList / getStudentRooms', () => {
  it('cmsList 映射分页与过滤条件，列表镜像讲师名', async () => {
    const { controller, liveService, authService } = createController();
    const res = await controller.cmsList(
      { pageNum: 2, pageSize: 5, status: 1, searchName: '数学', type: 0 },
      req('u1')
    );
    expect(liveService.cmsList).toHaveBeenCalledWith(
      {
        page: 2,
        page_size: 5,
        status: 1,
        live_user_id: 'u1',
        search_name: '数学',
        start_time: '',
        end_time: '',
        type: 0
      },
      expect.any(Metadata)
    );
    expect(authService.batchGetUsers).toHaveBeenCalledWith({ user_ids: ['t1'] });
    expect(res).toEqual({
      list: [
        {
          roomId: 'r1',
          title: '第一课',
          speakerName: '张老师',
          joinCode: 'SA1',
          status: 1,
          type: 0,
          startTime: '1704067200000',
          duration: 60
        }
      ],
      total: 1
    });
  });

  it('cmsList 缺省过滤：status 透传 undefined、type 兜底 -1、空串条件', async () => {
    const { controller, liveService } = createController();
    await controller.cmsList({}, req('u1'));
    expect(liveService.cmsList).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        page_size: 10,
        status: undefined,
        search_name: '',
        start_time: '',
        end_time: '',
        type: -1
      }),
      expect.any(Metadata)
    );
  });

  it('cmsList 空列表不触发批量用户名查询', async () => {
    const { controller, liveService, authService } = createController();
    liveService.cmsList.mockReturnValueOnce(of({ code: '0', msg: 'ok', data: { items: [], total: 0 } }));
    const res = await controller.cmsList({}, req('u1'));
    expect(authService.batchGetUsers).not.toHaveBeenCalled();
    expect(res).toEqual({ list: [], total: 0 });
  });

  it('cmsList 用户查询失败时兜底空讲师名（错误被吞）', async () => {
    const { controller, authService } = createController();
    authService.batchGetUsers.mockReturnValueOnce(
      throwError(() => ({ code: 13, details: 'auth down' }))
    );
    const res = await controller.cmsList({}, req('u1'));
    expect(res.list[0]?.speakerName).toBe('');
  });

  it('getStudentRooms query 字符串分页并映射 liveUserId', async () => {
    const { controller, liveService } = createController();
    const res = await controller.getStudentRooms(q('2'), q('7'), req('u1'));
    expect(liveService.getStudentRooms).toHaveBeenCalledWith(
      { page: 2, page_size: 7 },
      expect.any(Metadata)
    );
    expect(res).toEqual({
      list: [
        {
          roomId: 'r2',
          title: '第二课',
          speakerName: '张老师',
          liveUserId: 't1',
          joinCode: 'SB1',
          status: 2,
          startTime: '1704153600000',
          type: 1
        }
      ],
      total: 1
    });
  });

  it('getStudentRooms 缺省分页 1/10', async () => {
    const { controller, liveService } = createController();
    await controller.getStudentRooms(q(), q(), req('u1'));
    expect(liveService.getStudentRooms).toHaveBeenCalledWith(
      { page: 1, page_size: 10 },
      expect.any(Metadata)
    );
  });
});

describe('LiveController delete / updateCode / leave', () => {
  it('delete 返回文档约定的中文 msg', async () => {
    const { controller, liveService } = createController();
    const res = await controller.delete('r1');
    expect(liveService.deleteLive).toHaveBeenCalledWith({ room_id: 'r1' });
    expect(res).toEqual({ msg: '删除成功' });
  });

  it('updateCode 返回裸 join_code 字符串且忽略 operateType', async () => {
    const { controller, liveService } = createController();
    const res = await controller.updateCode({ roomId: 'r1', operateType: 'refresh' });
    expect(liveService.updateCode).toHaveBeenCalledWith({ room_id: 'r1' });
    expect(res).toBe('SNEW1234');
  });

  it('leaveRoom/batchLeave 携带 user-id 元数据', async () => {
    const { controller, liveService } = createController();
    await controller.leaveRoom('r1', req('u1'));
    expect(liveService.leaveRoom).toHaveBeenCalledWith({ room_id: 'r1' }, expect.any(Metadata));
    await controller.batchLeave(['r1', 'r2'], req('u1'));
    expect(liveService.batchLeave).toHaveBeenCalledWith(
      { room_ids: ['r1', 'r2'] },
      expect.any(Metadata)
    );
  });
});

describe('LiveController transfer / searchTeachers', () => {
  it('generateTransferCode 的 target_user_id 是当前调用者', async () => {
    const { controller, liveService } = createController();
    const res = await controller.generateTransferCode({ roomId: 'r1' }, req('u9'));
    expect(liveService.generateTransferCode).toHaveBeenCalledWith({
      room_id: 'r1',
      target_user_id: 'u9'
    });
    expect(res).toEqual({ code: '0', msg: 'ok', transfer_code: 'T1', expires_at: 'x' });
  });

  it('executeTransfer 映射 transfer_code/from_user_id', async () => {
    const { controller, liveService } = createController();
    await controller.executeTransfer({ roomId: 'r1', transferCode: 'T1' }, req('u1'));
    expect(liveService.executeTransfer).toHaveBeenCalledWith({
      room_id: 'r1',
      transfer_code: 'T1',
      from_user_id: 'u1'
    });
  });

  it('searchTeachers 空 keyword 回落空串', async () => {
    const { controller, authService } = createController();
    await controller.searchTeachers(q());
    expect(authService.searchTeachers).toHaveBeenCalledWith({ keyword: '' });
    await controller.searchTeachers('张');
    expect(authService.searchTeachers).toHaveBeenCalledWith({ keyword: '张' });
  });
});

describe('LiveController video list / detail / delete', () => {
  it('getVideoList 分页别名解析、type 解析与字段映射', async () => {
    const { controller, liveService } = createController();
    const res = await controller.getVideoList(
      q(),
      q('2'),
      q('5'),
      '数学',
      '1704000000000',
      '1704999999000',
      '1',
      req('u1')
    );
    expect(liveService.getVideoList).toHaveBeenCalledWith({
      page: 2,
      page_size: 5,
      live_user_id: 'u1',
      search_name: '数学',
      start_time: '1704000000000',
      end_time: '1704999999000',
      type: 1
    });
    expect(res).toEqual({
      list: [
        {
          roomId: 'r1',
          title: '回放一',
          speakerName: '张老师',
          type: 1,
          time: '1704067200000',
          count: 3
        }
      ],
      pageInfo: { totalElements: 1 }
    });
  });

  it('getVideoList type 非法回 -1，缺 data 返回空列表', async () => {
    const { controller, liveService } = createController();
    await controller.getVideoList(q(), q(), q(), q(), q(), q(), 'abc', req('u1'));
    expect(liveService.getVideoList).toHaveBeenCalledWith(
      expect.objectContaining({ type: -1, page: 1, page_size: 10 })
    );
    liveService.getVideoList.mockReturnValueOnce(of({ code: '0', msg: 'ok' }));
    const res = await controller.getVideoList(q(), q(), q(), q(), q(), q(), '', req('u1'));
    expect(res).toEqual({ list: [], pageInfo: { totalElements: 0 } });
  });

  it('getVideoDetail 把 file_path 同时映射为 address 与 filePath', async () => {
    const { controller, liveService } = createController();
    const res = await controller.getVideoDetail('r1', '1704000000000', '1704999999000');
    expect(liveService.getVideoDetail).toHaveBeenCalledWith({
      room_id: 'r1',
      start_time: '1704000000000',
      end_time: '1704999999000'
    });
    expect(res.list[0]).toEqual({
      roomId: 'r1',
      id: 'v1',
      address: '/rec/v1.mp4',
      duration: 60,
      createTime: '1704067200000',
      recordType: 1,
      filePath: '/rec/v1.mp4'
    });
    expect(res.pageInfo).toEqual({ totalElements: 1 });
  });

  it('deleteVideo 两个入口透传 id 数组', async () => {
    const { controller, liveService } = createController();
    await controller.deleteVideoByRoomIds(['r1', 'r2']);
    expect(liveService.deleteVideoByRoomIds).toHaveBeenCalledWith({ room_ids: ['r1', 'r2'] });
    await controller.deleteVideoByVideoIds(['v1']);
    expect(liveService.deleteVideoByVideoIds).toHaveBeenCalledWith({ video_ids: ['v1'] });
  });
});

describe('LiveController courseware', () => {
  it('saveCourseware 映射字段并携带 user-id 元数据，缺省回落', async () => {
    const { controller, liveService } = createController();
    const dto = Object.assign(new CreateCoursewareDto(), {
      roomId: 'r1',
      filename: 'a.pptx',
      fileUrl: '/u/a.pptx'
    });
    await controller.saveCourseware(dto, req('u1'));
    expect(liveService.saveCourseware).toHaveBeenCalledWith(
      {
        room_id: 'r1',
        filename: 'a.pptx',
        filext: '',
        filesize: 0,
        fileurl: '/u/a.pptx',
        create_user_id: 'u1'
      },
      expect.any(Metadata)
    );
  });

  it('saveCourseware 显式 filext/filesize 透传', async () => {
    const { controller, liveService } = createController();
    const dto = Object.assign(new CreateCoursewareDto(), {
      roomId: 'r1',
      filename: 'a.pptx',
      filext: 'pptx',
      filesize: 123,
      fileUrl: '/u/a.pptx'
    });
    await controller.saveCourseware(dto, req('u1'));
    expect(liveService.saveCourseware).toHaveBeenCalledWith(
      expect.objectContaining({ filext: 'pptx', filesize: 123 }),
      expect.any(Metadata)
    );
  });

  it('coursewareList 映射 fileUrl/createdAt，缺 data 返回空', async () => {
    const { controller, liveService } = createController();
    const res = await controller.coursewareList('r1');
    expect(liveService.listCourseware).toHaveBeenCalledWith({ room_id: 'r1' });
    expect(res.list[0]).toEqual({
      id: 'c1',
      roomId: 'r1',
      filename: 'a.pptx',
      filext: 'pptx',
      filesize: 123,
      fileUrl: '/u/a.pptx',
      createdAt: '1704067200000'
    });
    liveService.listCourseware.mockReturnValueOnce(of({ code: '0', msg: 'ok' }));
    const empty = await controller.coursewareList('r1');
    expect(empty).toEqual({ list: [], pageInfo: { totalElements: 0 } });
  });

  it('deleteCourseware 透传 id', async () => {
    const { controller, liveService } = createController();
    await controller.deleteCourseware('c1');
    expect(liveService.deleteCourseware).toHaveBeenCalledWith({ id: 'c1' });
  });
});

describe('LiveController savePlayBackUrl / getUserWatchTimeList', () => {
  it('savePlayBackUrl 复用录像保存（record_type=2）并返回扁平对象', async () => {
    const { controller, liveService } = createController();
    const res = await controller.savePlayBackUrl({
      roomId: 'r1',
      playBackUrl: 'rec-1',
      duration: 120
    });
    expect(liveService.saveVideoRecording).toHaveBeenCalledWith({
      room_id: 'r1',
      file_path: 'rec-1',
      file_name: 'rec-1',
      file_size: 0,
      duration: 120,
      record_type: 2,
      teacher_name: ''
    });
    expect(res).toEqual({ roomId: 'r1', playBackUrl: 'rec-1' });
  });

  it('savePlayBackUrl duration 缺省 0', async () => {
    const { controller, liveService } = createController();
    await controller.savePlayBackUrl({ roomId: 'r1', playBackUrl: 'rec-1', duration: 0 });
    expect(liveService.saveVideoRecording).toHaveBeenCalledWith(
      expect.objectContaining({ duration: 0 })
    );
  });

  it('getUserWatchTimeList 映射分页与昵称（查不到时回退原始 id）', async () => {
    const { controller, liveService, authService } = createController();
    const res = await controller.getUserWatchTimeList({
      pageNum: 3,
      pageSize: 20,
      roomId: 'r1',
      searchName: '甲'
    });
    expect(liveService.getUserWatchTimeList).toHaveBeenCalledWith({
      page: 3,
      page_size: 20,
      room_id: 'r1',
      search_name: '甲'
    });
    expect(authService.batchGetUsers).toHaveBeenCalledWith({ user_ids: ['u1'] });
    expect(res).toEqual({
      list: [
        {
          userId: 'u1',
          nickName: '甲同学',
          watchTime: 300,
          joinedAt: 'a',
          leftAt: 'b',
          isOnline: true
        }
      ],
      other: { totalTimeByRoomId: 900 },
      pageInfo: { totalElements: 1 }
    });
  });

  it('getUserWatchTimeList 批量用户名查询失败时 nickName 回退原始 id', async () => {
    const { controller, authService } = createController();
    authService.batchGetUsers.mockReturnValueOnce(throwError(() => ({ code: 13, details: 'x' })));
    const res = await controller.getUserWatchTimeList({});
    expect(res.list[0]?.nickName).toBe('u1');
    expect(res.other).toEqual({ totalTimeByRoomId: 900 });
  });
});
