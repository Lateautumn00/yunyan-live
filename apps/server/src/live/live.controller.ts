import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Param,
  Res,
  UseGuards,
  Request,
  Inject,
  OnModuleInit,
  Logger,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { Observable } from 'rxjs';
import { Response } from 'express';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { grpcCall } from '../common/helpers/grpc.helper';
import {
  ChangeStatusDto,
  CreateCoursewareDto,
  CreateLiveDto,
  JoinLiveDto,
  JwtAuthGuard,
  normalizePageQuery,
  Roles,
  RolesGuard,
  toGrpcPage,
  UpdateLiveDto,
  userIdMetadata
} from '@yunyan-live/nest-shared';

/** 与 push.controller 口径一致：1 = 教师 */
const TEACHER_ROLE = 1;

interface LiveResponse {
  code: string;
  msg: string;
  data?: Record<string, unknown>;
}

interface JoinLiveResponse {
  liveUserId?: string;
  roomId: string;
  roleName: string;
  joinCode: string;
  liveType: string;
  status: number;
}

interface ShowRoomResponse {
  code: string;
  msg: string;
  data: {
    room_id: string;
    title: string;
    speaker_name: string;
    join_code: string;
    status: number;
    type: number;
    start_time?: string;
    duration?: number;
    live_started_at?: string;
    live_user_id?: string;
  };
}

interface CmsListResponse {
  code: string;
  msg: string;
  data: {
    items: Array<{
      room_id: string;
      title: string;
      speaker_name: string;
      live_user_id: string;
      join_code: string;
      status: number;
      type: number;
      start_time: string;
      duration: number;
    }>;
    total: number;
  };
}

interface UpdateCodeResponse {
  code: string;
  msg: string;
  join_code: string;
}

interface StudentRoomsItem {
  room_id: string;
  title: string;
  speaker_name: string;
  join_code: string;
  status: number;
  start_time: string;
  type: number;
  live_user_id: string;
}

interface StudentRoomsResponse {
  code: string;
  msg: string;
  data: {
    items: StudentRoomsItem[];
    total: number;
  };
}

interface LiveServiceClient {
  createLive(
    data: { title: string; type?: number; start_time: string; duration?: number; room_id?: string },
    metadata?: Metadata
  ): Observable<LiveResponse>;
  joinLive(data: { join_code: string; live_user_id?: string }): Observable<JoinLiveResponse>;
  showRoom(data: { room_id: string }): Observable<ShowRoomResponse>;
  changeStatus(
    data: { room_id: string; status: number },
    metadata?: Metadata
  ): Observable<LiveResponse>;
  updateLive(
    data: {
      room_id: string;
      title: string;
      type: number;
      start_time: string;
      duration: number;
    },
    metadata?: Metadata
  ): Observable<LiveResponse>;
  cmsList(
    data: {
      page?: number;
      page_size?: number;
      status?: number;
      live_user_id?: string;
      search_name?: string;
      start_time?: string;
      end_time?: string;
      type?: number;
    },
    metadata?: Metadata
  ): Observable<CmsListResponse>;
  cmsDetail(data: { room_id: string }): Observable<ShowRoomResponse>;
  deleteLive(data: { room_id: string }, metadata?: Metadata): Observable<LiveResponse>;
  updateCode(data: { room_id: string }, metadata?: Metadata): Observable<UpdateCodeResponse>;
  getStudentRooms(
    data: { page?: number; page_size?: number },
    metadata?: Metadata
  ): Observable<StudentRoomsResponse>;
  leaveRoom(data: { room_id: string }, metadata?: Metadata): Observable<LiveResponse>;
  batchLeave(data: { room_ids: string[] }, metadata?: Metadata): Observable<LiveResponse>;
  generateTransferCode(data: {
    room_id: string;
    target_user_id: string;
  }): Observable<{ code: string; msg: string; transfer_code: string; expires_at: string }>;
  executeTransfer(data: {
    room_id: string;
    transfer_code: string;
    from_user_id: string;
  }): Observable<{ code: string; msg: string }>;
  saveVideoRecording(
    data: {
      room_id: string;
      file_path: string;
      file_name: string;
      file_size: number;
      duration: number;
      record_type: number;
      teacher_name: string;
    },
    metadata?: Metadata
  ): Observable<{ code: string; msg: string }>;
  getVideoList(data: {
    page?: number;
    page_size?: number;
    live_user_id?: string;
    search_name?: string;
    start_time?: string;
    end_time?: string;
    type?: number;
  }): Observable<{
    code: string;
    msg: string;
    data: {
      items: Array<{
        room_id: string;
        title: string;
        teacher_name: string;
        type: number;
        start_time: string;
        count: number;
      }>;
      total: number;
    };
  }>;
  getVideoDetail(data: { room_id: string; start_time?: string; end_time?: string }): Observable<{
    code: string;
    msg: string;
    data: {
      items: Array<{
        id: string;
        room_id: string;
        file_path: string;
        file_name: string;
        file_size: number;
        duration: number;
        record_type: number;
        teacher_name: string;
        created_at: string;
      }>;
      total: number;
    };
  }>;
  deleteVideoByRoomIds(
    data: { room_ids: string[] },
    metadata?: Metadata
  ): Observable<{ code: string; msg: string }>;
  deleteVideoByVideoIds(
    data: { video_ids: string[] },
    metadata?: Metadata
  ): Observable<{ code: string; msg: string }>;
  getVideoRoomMap(data: { video_ids: string[] }): Observable<{
    code: string;
    msg: string;
    data: { items: Array<{ video_id: string; room_id: string }> };
  }>;
  getCoursewareRoom(data: { id: string }): Observable<{
    code: string;
    msg: string;
    data: { room_id: string };
  }>;
  getUserWatchTimeList(data: {
    page?: number;
    page_size?: number;
    room_id?: string;
    search_name?: string;
  }): Observable<{
    code: string;
    msg: string;
    data: {
      items: Array<{
        user_id: string;
        username: string;
        watch_time: number;
        joined_at: string;
        left_at: string;
        is_online: boolean;
      }>;
      total: number;
      total_time_by_room: number;
    };
  }>;
  saveCourseware(
    data: {
      room_id: string;
      filename: string;
      filext: string;
      filesize: number;
      fileurl: string;
      create_user_id?: string;
    },
    metadata?: Metadata
  ): Observable<{ code: string; msg: string }>;
  listCourseware(data: { room_id: string }): Observable<{
    code: string;
    msg: string;
    data: {
      items: Array<{
        id: string;
        room_id: string;
        filename: string;
        filext: string;
        filesize: number;
        fileurl: string;
        created_at: string;
      }>;
      total: number;
    };
  }>;
  deleteCourseware(
    data: { id: string },
    metadata?: Metadata
  ): Observable<{ code: string; msg: string }>;
  saveBoardSnapshot(data: {
    room_id: string;
    lesson_id?: string;
    format_version?: number;
    data: Uint8Array;
  }): Observable<{ code: string; msg: string }>;
  listBoardSnapshots(data: { room_id: string; cursor?: string; limit?: number }): Observable<{
    code: string;
    msg: string;
    data: {
      items: Array<{
        id: string;
        room_id: string;
        lesson_id: string;
        format_version: number;
        size: number;
        created_at: string;
      }>;
      has_more: boolean;
    };
  }>;
  getBoardSnapshot(data: { id: string }): Observable<{
    code: string;
    msg: string;
    data: {
      id: string;
      room_id: string;
      lesson_id: string;
      format_version: number;
      data: Uint8Array;
      created_at: string;
    };
  }>;
}

interface UserData {
  id: string;
  username: string;
  email: string;
  role: number;
}

interface AuthServiceClient {
  getUser(data: { user_id: string }): Observable<{ code: string; msg: string; data?: UserData }>;
  batchGetUsers(data: {
    user_ids: string[];
  }): Observable<{ code: string; msg: string; data?: UserData[] }>;
  searchTeachers(data: {
    keyword: string;
  }): Observable<{ code: string; msg: string; data?: UserData[] }>;
}

@Controller('live/liveInfo')
export class LiveController implements OnModuleInit {
  private readonly logger = new Logger(LiveController.name);

  constructor(
    @Inject('LIVE_GRPC') private liveClient: ClientGrpc,
    @Inject('AUTH_GRPC') private authClient: ClientGrpc
  ) {}

  private liveService: LiveServiceClient;
  private authService: AuthServiceClient;

  onModuleInit() {
    this.liveService = this.liveClient.getService<LiveServiceClient>('LiveService');
    this.authService = this.authClient.getService<AuthServiceClient>('AuthService');
  }

  /** 房间级 403：仅教师（role=1）且为该房间 liveUserId 所有者可访问板书快照（5.9.2，Q4 MVP 仅教师） */
  private async assertRoomTeacher(
    user: { userId: string; role?: number },
    roomId: string
  ): Promise<void> {
    if (user.role !== TEACHER_ROLE) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
    const room = await grpcCall(this.liveService.showRoom({ room_id: roomId }));
    if (room?.data?.live_user_id !== user.userId) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
  }

  private async resolveUsernames(userIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueIds.length === 0) return map;
    try {
      const result = await grpcCall(this.authService.batchGetUsers({ user_ids: uniqueIds }));
      if (result.data) {
        for (const user of result.data) {
          map.set(user.id, user.username);
        }
      }
    } catch (err) {
      this.logger.error(`resolveUsernames failed: ${(err as Error).message}`, (err as Error).stack);
    }
    return map;
  }

  @Post('createLive')
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateLiveDto, @Request() req: { user: { userId: string } }) {
    const metadata = userIdMetadata(req.user.userId);
    return grpcCall(
      this.liveService.createLive(
        {
          title: dto.title,
          type: dto.type ?? 0,
          start_time: dto.startTime,
          duration: dto.duration ?? 0,
          room_id: dto.roomId ?? ''
        },
        metadata
      )
    );
  }

  @Put('updateLive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(TEACHER_ROLE)
  async updateLive(
    @Body() dto: UpdateLiveDto,
    @Request() req: { user: { userId: string; role?: number } }
  ) {
    // S4 补偿控制：房间归属 + 角色（域层下沉待 S10b）
    await this.assertRoomTeacher(req.user, dto.roomId);
    return grpcCall(
      this.liveService.updateLive(
        {
          room_id: dto.roomId,
          title: dto.title ?? '',
          type: dto.type ?? 0,
          start_time: dto.startTime ?? '',
          duration: dto.duration ?? 0
        },
        userIdMetadata(req.user.userId)
      )
    );
  }

  @Post('joinLive')
  @UseGuards(JwtAuthGuard)
  async join(@Body() dto: JoinLiveDto, @Request() req: { user: { userId: string } }) {
    return grpcCall(
      this.liveService.joinLive({
        join_code: dto.joinCode,
        live_user_id: req.user.userId
      })
    );
  }

  @Get('showRoomInfo')
  async showRoom(@Query('roomId') roomId: string) {
    const result = await grpcCall(this.liveService.showRoom({ room_id: roomId }));
    const d = result.data;
    let speakerName = '';
    if (d.live_user_id) {
      try {
        const userResult = await grpcCall(this.authService.getUser({ user_id: d.live_user_id }));
        if (userResult.data) {
          speakerName = userResult.data.username;
        }
      } catch {
        // fallback
      }
    }
    return {
      roomId: d.room_id,
      title: d.title,
      speakerName,
      liveUserId: d.live_user_id,
      joinCode: d.join_code,
      status: d.status,
      type: d.type,
      videoList: [],
      liveStartedAt: d.live_started_at || Date.now().toString()
    };
  }

  @Put('changeLiveStatus')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(TEACHER_ROLE)
  async changeStatus(
    @Body() dto: ChangeStatusDto,
    @Request() req: { user: { userId: string; role?: number } }
  ) {
    // S4 补偿控制：房间归属 + 角色（域层下沉待 S10b）
    await this.assertRoomTeacher(req.user, dto.roomId);
    return grpcCall(
      this.liveService.changeStatus(
        {
          room_id: dto.roomId,
          status: dto.status
        },
        userIdMetadata(req.user.userId)
      )
    );
  }

  @Post('cmsLiveList')
  @UseGuards(JwtAuthGuard)
  async cmsList(
    @Body()
    body: {
      page?: number;
      pageNum?: number;
      pageSize?: number;
      status?: number;
      searchName?: string;
      startTime?: string;
      endTime?: string;
      type?: number;
    },
    @Request() req: { user: { userId: string } }
  ) {
    const metadata = userIdMetadata(req.user.userId);
    const result = await grpcCall(
      this.liveService.cmsList(
        {
          ...toGrpcPage(
            normalizePageQuery({ page: body.page, pageNum: body.pageNum, pageSize: body.pageSize })
          ),
          status: body.status,
          live_user_id: req.user.userId,
          search_name: body.searchName || '',
          start_time: body.startTime || '',
          end_time: body.endTime || '',
          type: body.type ?? -1
        },
        metadata
      )
    );

    const userIds = result.data.items.map(r => r.live_user_id).filter(Boolean);
    const usernameMap = await this.resolveUsernames(userIds);

    return {
      list: result.data.items.map(r => ({
        roomId: r.room_id,
        title: r.title,
        speakerName: usernameMap.get(r.live_user_id) || '',
        joinCode: r.join_code,
        status: r.status,
        type: r.type,
        startTime: r.start_time,
        duration: r.duration
      })),
      total: result.data.total
    };
  }

  @Get('cmsLiveDetail')
  @UseGuards(JwtAuthGuard)
  async cmsDetail(@Query('roomId') roomId: string) {
    const result = await grpcCall(this.liveService.cmsDetail({ room_id: roomId }));
    const d = result.data;
    let speakerName = '';
    if (d.live_user_id) {
      try {
        const userResult = await grpcCall(this.authService.getUser({ user_id: d.live_user_id }));
        if (userResult.data) {
          speakerName = userResult.data.username;
        }
      } catch {
        // fallback
      }
    }
    return {
      roomId: d.room_id,
      title: d.title,
      speakerName,
      joinCode: d.join_code,
      status: d.status,
      type: d.type,
      startTime: d.start_time,
      duration: d.duration
    };
  }

  @Delete('deleteLive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(TEACHER_ROLE)
  async delete(
    @Body('roomId') roomId: string,
    @Request() req: { user: { userId: string; role?: number } }
  ) {
    // S4 补偿控制：房间归属 + 角色（域层下沉待 S10b）
    await this.assertRoomTeacher(req.user, roomId);
    await grpcCall(
      this.liveService.deleteLive({ room_id: roomId }, userIdMetadata(req.user.userId))
    );
    return { msg: '删除成功' };
  }

  @Put('updateLiveCode')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(TEACHER_ROLE)
  async updateCode(
    @Body() body: { roomId: string; operateType: string },
    @Request() req: { user: { userId: string; role?: number } }
  ) {
    // S4 补偿控制：房间归属 + 角色（域层下沉待 S10b）
    await this.assertRoomTeacher(req.user, body.roomId);
    const result = await grpcCall(
      this.liveService.updateCode({ room_id: body.roomId }, userIdMetadata(req.user.userId))
    );
    return result.join_code;
  }

  @Get('studentRooms')
  @UseGuards(JwtAuthGuard)
  async getStudentRooms(
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Request() req: { user: { userId: string } }
  ) {
    const metadata = userIdMetadata(req.user.userId);
    const result = await grpcCall(
      this.liveService.getStudentRooms(
        {
          ...toGrpcPage(normalizePageQuery({ page, pageSize }))
        },
        metadata
      )
    );

    const userIds = result.data.items.map(r => r.live_user_id).filter(Boolean);
    const usernameMap = await this.resolveUsernames(userIds);

    return {
      list: result.data.items.map(r => ({
        roomId: r.room_id,
        title: r.title,
        speakerName: usernameMap.get(r.live_user_id) || '',
        liveUserId: r.live_user_id,
        joinCode: r.join_code,
        status: r.status,
        startTime: r.start_time,
        type: r.type
      })),
      total: result.data.total
    };
  }

  @Delete('leave')
  @UseGuards(JwtAuthGuard)
  leaveRoom(@Body('roomId') roomId: string, @Request() req: { user: { userId: string } }) {
    const metadata = userIdMetadata(req.user.userId);
    return grpcCall(this.liveService.leaveRoom({ room_id: roomId }, metadata));
  }

  @Delete('batchLeave')
  @UseGuards(JwtAuthGuard)
  batchLeave(@Body('roomIds') roomIds: string[], @Request() req: { user: { userId: string } }) {
    const metadata = userIdMetadata(req.user.userId);
    return grpcCall(this.liveService.batchLeave({ room_ids: roomIds }, metadata));
  }

  @Post('generateTransferCode')
  @UseGuards(JwtAuthGuard)
  generateTransferCode(
    @Body() body: { roomId: string },
    @Request() req: { user: { userId: string } }
  ) {
    return grpcCall(
      this.liveService.generateTransferCode({
        room_id: body.roomId,
        target_user_id: req.user.userId
      })
    );
  }

  @Post('executeTransfer')
  @UseGuards(JwtAuthGuard)
  executeTransfer(
    @Body() body: { roomId: string; transferCode: string },
    @Request() req: { user: { userId: string } }
  ) {
    return grpcCall(
      this.liveService.executeTransfer({
        room_id: body.roomId,
        transfer_code: body.transferCode,
        from_user_id: req.user.userId
      })
    );
  }

  @Get('searchTeachers')
  @UseGuards(JwtAuthGuard)
  searchTeachers(@Query('keyword') keyword: string) {
    return grpcCall(this.authService.searchTeachers({ keyword: keyword || '' }));
  }

  @Get('videoList')
  @UseGuards(JwtAuthGuard)
  async getVideoList(
    @Query('page') page: string,
    @Query('pageNum') pageNum: string,
    @Query('pageSize') pageSize: string,
    @Query('searchName') searchName: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @Query('type') type: string,
    @Request() req: { user: { userId: string } }
  ) {
    const result = await grpcCall(
      this.liveService.getVideoList({
        ...toGrpcPage(normalizePageQuery({ page, pageNum, pageSize })),
        live_user_id: req.user.userId,
        search_name: searchName || '',
        start_time: startTime || '',
        end_time: endTime || '',
        type: parseInt(type) >= 0 ? parseInt(type) : -1
      })
    );
    const items = (result?.data?.items || []).map((item: Record<string, unknown>) => ({
      roomId: item.room_id,
      title: item.title,
      speakerName: item.teacher_name,
      type: item.type,
      time: item.start_time,
      count: item.count
    }));
    return {
      list: items,
      pageInfo: { totalElements: result?.data?.total || 0 }
    };
  }

  @Get('videoDetail')
  @UseGuards(JwtAuthGuard)
  async getVideoDetail(
    @Query('roomId') roomId: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string
  ) {
    const result = await grpcCall(
      this.liveService.getVideoDetail({
        room_id: roomId,
        start_time: startTime || '',
        end_time: endTime || ''
      })
    );
    const items = (result?.data?.items || []).map((item: Record<string, unknown>) => ({
      roomId: item.room_id,
      id: item.id,
      address: item.file_path,
      duration: item.duration,
      createTime: item.created_at,
      recordType: item.record_type,
      filePath: item.file_path
    }));
    return {
      list: items,
      pageInfo: { totalElements: result?.data?.total || 0 }
    };
  }

  @Delete('deleteVideo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(TEACHER_ROLE)
  async deleteVideoByRoomIds(
    @Body('roomIds') roomIds: string[],
    @Request() req: { user: { userId: string; role?: number } }
  ) {
    // S4 补偿控制：逐房间归属断言（域层下沉待 S10b）
    for (const roomId of roomIds) {
      await this.assertRoomTeacher(req.user, roomId);
    }
    return grpcCall(
      this.liveService.deleteVideoByRoomIds({ room_ids: roomIds }, userIdMetadata(req.user.userId))
    );
  }

  @Delete('deleteVideoByIds')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(TEACHER_ROLE)
  async deleteVideoByVideoIds(
    @Body('videoIds') videoIds: string[],
    @Request() req: { user: { userId: string; role?: number } }
  ) {
    // S4 补偿控制：video→room 映射后逐房归属断言（映射不存在的 id 跳过＝删除幂等）
    const map = await grpcCall(this.liveService.getVideoRoomMap({ video_ids: videoIds }));
    const roomIds = [...new Set((map.data?.items || []).map(i => i.room_id))];
    for (const roomId of roomIds) {
      await this.assertRoomTeacher(req.user, roomId);
    }
    return grpcCall(
      this.liveService.deleteVideoByVideoIds(
        { video_ids: videoIds },
        userIdMetadata(req.user.userId)
      )
    );
  }

  @Post('saveCourseware')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(TEACHER_ROLE)
  async saveCourseware(
    @Body() dto: CreateCoursewareDto,
    @Request() req: { user: { userId: string; role?: number } }
  ) {
    // S4 补偿控制：房间归属 + 角色（域层下沉待 S10b）
    await this.assertRoomTeacher(req.user, dto.roomId);
    const metadata = userIdMetadata(req.user.userId);
    return grpcCall(
      this.liveService.saveCourseware(
        {
          room_id: dto.roomId,
          filename: dto.filename,
          filext: dto.filext || '',
          filesize: dto.filesize ?? 0,
          fileurl: dto.fileUrl,
          create_user_id: req.user.userId
        },
        metadata
      )
    );
  }

  @Get('coursewareList')
  @UseGuards(JwtAuthGuard)
  async coursewareList(@Query('roomId') roomId: string) {
    const result = await grpcCall(this.liveService.listCourseware({ room_id: roomId }));
    const items = (result?.data?.items || []).map((item: Record<string, unknown>) => ({
      id: item.id,
      roomId: item.room_id,
      filename: item.filename,
      filext: item.filext,
      filesize: item.filesize,
      fileUrl: item.fileurl,
      createdAt: item.created_at
    }));
    return {
      list: items,
      pageInfo: { totalElements: result?.data?.total || 0 }
    };
  }

  @Delete('deleteCourseware')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(TEACHER_ROLE)
  async deleteCourseware(
    @Body('id') id: string,
    @Request() req: { user: { userId: string; role?: number } }
  ) {
    // S4 补偿控制：courseware→room 映射后归属断言（域层下沉待 S10b）
    const room = await grpcCall(this.liveService.getCoursewareRoom({ id }));
    await this.assertRoomTeacher(req.user, room.data.room_id);
    return grpcCall(this.liveService.deleteCourseware({ id }, userIdMetadata(req.user.userId)));
  }

  @Post('boardSnapshot')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(TEACHER_ROLE)
  async saveBoardSnapshot(
    @Body() body: { roomId: string; lessonId?: string; data: string },
    @Request() req: { user: { userId: string; role?: number } }
  ) {
    await this.assertRoomTeacher(req.user, body.roomId);
    await grpcCall(
      this.liveService.saveBoardSnapshot({
        room_id: body.roomId,
        lesson_id: body.lessonId,
        format_version: 1,
        data: Buffer.from(body.data || '', 'base64')
      })
    );
    return { success: true };
  }

  @Get('boardHistory')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(TEACHER_ROLE)
  async boardHistory(
    @Query('roomId') roomId: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Request() req: { user: { userId: string; role?: number } }
  ) {
    await this.assertRoomTeacher(req.user, roomId);
    const result = await grpcCall(
      this.liveService.listBoardSnapshots({
        room_id: roomId,
        cursor: cursor || undefined,
        limit: limit ? Number(limit) : undefined
      })
    );
    return {
      items: (result?.data?.items || []).map(item => ({
        id: item.id,
        roomId: item.room_id,
        lessonId: item.lesson_id,
        formatVersion: item.format_version,
        size: item.size,
        createdAt: item.created_at
      })),
      hasMore: result?.data?.has_more ?? false
    };
  }

  @Get('boardSnapshot/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(TEACHER_ROLE)
  async getBoardSnapshot(
    @Param('id') id: string,
    @Request() req: { user: { userId: string; role?: number } }
  ) {
    const snapshot = await grpcCall(this.liveService.getBoardSnapshot({ id }));
    await this.assertRoomTeacher(req.user, snapshot.data.room_id);
    return {
      id: snapshot.data.id,
      roomId: snapshot.data.room_id,
      lessonId: snapshot.data.lesson_id,
      formatVersion: snapshot.data.format_version,
      createdAt: snapshot.data.created_at,
      data: Buffer.from(snapshot.data.data).toString('base64')
    };
  }

  @Post('savePlayBackUrl')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(TEACHER_ROLE)
  async savePlayBackUrl(
    @Body() body: { roomId: string; playBackUrl: string; duration: number },
    @Request() req: { user: { userId: string; role?: number } }
  ) {
    // S4 补偿控制：房间归属 + 角色（域层下沉待 S10b）
    await this.assertRoomTeacher(req.user, body.roomId);
    await grpcCall(
      this.liveService.saveVideoRecording(
        {
          room_id: body.roomId,
          file_path: body.playBackUrl,
          file_name: body.playBackUrl,
          file_size: 0,
          duration: body.duration || 0,
          record_type: 2,
          teacher_name: ''
        },
        userIdMetadata(req.user.userId)
      )
    );
    return { roomId: body.roomId, playBackUrl: body.playBackUrl };
  }

  @Post('getUserWatchTimeList')
  @UseGuards(JwtAuthGuard)
  async getUserWatchTimeList(
    @Body() body: { pageNum?: number; pageSize?: number; roomId?: string; searchName?: string }
  ) {
    const result = await grpcCall(
      this.liveService.getUserWatchTimeList({
        ...toGrpcPage(normalizePageQuery({ pageNum: body.pageNum, pageSize: body.pageSize })),
        room_id: body.roomId || '',
        search_name: body.searchName || ''
      })
    );
    const items = result?.data?.items || [];
    const userIds = items.map((item: { user_id: string }) => item.user_id);
    const usernameMap = await this.resolveUsernames(userIds);
    return {
      list: items.map(
        (item: {
          user_id: string;
          watch_time: number;
          joined_at: string;
          left_at: string;
          is_online: boolean;
        }) => ({
          userId: item.user_id,
          nickName: usernameMap.get(item.user_id) || item.user_id,
          watchTime: item.watch_time,
          joinedAt: item.joined_at,
          leftAt: item.left_at,
          isOnline: item.is_online
        })
      ),
      other: { totalTimeByRoomId: result?.data?.total_time_by_room || 0 },
      pageInfo: { totalElements: result?.data?.total || 0 }
    };
  }

  @Get('downloadRecording/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(TEACHER_ROLE)
  async downloadRecording(
    @Param('id') id: string,
    @Query('download') download: string,
    @Res() res: Response,
    @Request() req: { user: { userId: string; role?: number } }
  ) {
    // S8 安全白名单：录制 id 由 Math.random().toString(36) 生成（[a-z0-9]），
    // 拒绝路径穿越（. / \）与命令注入元字符；后续全部路径拼接与 docker exec 均以此为前提
    if (!isSafeRecordingId(id)) {
      return res.status(400).json({ code: 400, msg: '非法录制 id' });
    }

    // S4 补偿控制：recording→room 映射后归属断言（映射不存在→交文件层 404）
    const recMap = await grpcCall(this.liveService.getVideoRoomMap({ video_ids: [id] }));
    const recRoomId = recMap.data?.items?.[0]?.room_id;
    if (recRoomId) {
      await this.assertRoomTeacher(req.user, recRoomId);
    }

    const hostRecordingsDir = process.env.RECORDINGS_DIR || '/home/janus/recordings';
    const hostVideoMjr = path.join(hostRecordingsDir, `rec-${id}-video.mjr`);

    if (!fs.existsSync(hostVideoMjr)) {
      return res.status(404).json({ code: 404, msg: '录制文件不存在' });
    }

    const hostAudioMjr = path.join(hostRecordingsDir, `rec-${id}-audio.mjr`);
    const mp4Path = path.join(hostRecordingsDir, `${id}.mp4`);
    const markerFile = path.join(hostRecordingsDir, `${id}.converting`);

    if (download === 'true') {
      if (!fs.existsSync(mp4Path)) {
        return res.json({ code: 2002, msg: '转码中，请稍后' });
      }
      const stat = fs.statSync(mp4Path);
      res.set({
        'Content-Type': 'video/mp4',
        'Content-Length': stat.size.toString(),
        'Content-Disposition': `attachment; filename="${id}.mp4"`
      });
      fs.createReadStream(mp4Path).pipe(res);
      return;
    }

    if (fs.existsSync(mp4Path)) {
      return res.json({ code: 1000, msg: '转码完成' });
    }

    if (fs.existsSync(markerFile)) {
      return res.json({ code: 2002, msg: '转码中，请稍后' });
    }

    const container = process.env.JANUS_CONTAINER || 'janus-gateway';
    const ppRecBin = process.env.JANUS_PP_REC || '/opt/janus/bin/janus-pp-rec';
    const containerRecordings = '/tmp/janus/recordings';

    fs.writeFileSync(markerFile, '');

    // 异步转码：数组传参 docker exec（不经 shell），finally 必删 marker 保证失败可重试
    void this.transcodeRecording({
      container,
      ppRecBin,
      hasAudio: fs.existsSync(hostAudioMjr),
      containerVideoMjr: `${containerRecordings}/rec-${id}-video.mjr`,
      containerAudioMjr: `${containerRecordings}/rec-${id}-audio.mjr`,
      containerVideoWebm: `${containerRecordings}/${id}-video.webm`,
      containerAudioOpus: `${containerRecordings}/${id}-audio.opus`,
      containerMp4: `${containerRecordings}/${id}.mp4`,
      markerFile
    });

    return res.json({ code: 2002, msg: '转码中，请稍后' });
  }

  /** .mjr → .webm/.opus → .mp4 串行转码；失败删除半成品 mp4 并清理 marker（可重试） */
  private async transcodeRecording(args: {
    container: string;
    ppRecBin: string;
    hasAudio: boolean;
    containerVideoMjr: string;
    containerAudioMjr: string;
    containerVideoWebm: string;
    containerAudioOpus: string;
    containerMp4: string;
    markerFile: string;
  }): Promise<void> {
    const exec = (inner: string[]): Promise<void> =>
      new Promise((resolve, reject) => {
        const child = spawn('docker', ['exec', args.container, ...inner], { stdio: 'ignore' });
        child.on('error', reject);
        child.on('close', code =>
          code === 0 ? resolve() : reject(new Error(`docker exec exit ${code}`))
        );
      });

    try {
      await exec([args.ppRecBin, args.containerVideoMjr, args.containerVideoWebm]);
      if (args.hasAudio) {
        await exec([args.ppRecBin, args.containerAudioMjr, args.containerAudioOpus]);
      }
      await exec(
        args.hasAudio
          ? [
              'ffmpeg',
              '-y',
              '-i',
              args.containerVideoWebm,
              '-i',
              args.containerAudioOpus,
              '-c:v',
              'libx264',
              '-preset',
              'ultrafast',
              '-c:a',
              'aac',
              args.containerMp4
            ]
          : [
              'ffmpeg',
              '-y',
              '-i',
              args.containerVideoWebm,
              '-c:v',
              'libx264',
              '-preset',
              'ultrafast',
              args.containerMp4
            ]
      );
      await exec(
        args.hasAudio
          ? ['rm', '-f', args.containerVideoWebm, args.containerAudioOpus]
          : ['rm', '-f', args.containerVideoWebm]
      );
    } catch (err) {
      // 失败时删除半成品 mp4，避免损坏文件被当作"转码完成"下发
      try {
        fs.rmSync(args.containerMp4, { force: true });
      } catch {
        /* best effort */
      }
      console.error('[live] recording transcode failed:', err);
    } finally {
      try {
        fs.rmSync(args.markerFile, { force: true });
      } catch {
        /* best effort */
      }
    }
  }
}

/** 录制 id 安全白名单：仅字母数字与 -_（防路径穿越与 shell 元字符） */
export function isSafeRecordingId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id);
}
