import { Controller, Get, Post, Put, Delete, Body, Query, Param, Res, UseGuards, Request, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { Observable } from 'rxjs';
import { Response } from 'express';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { grpcCall } from '../common/helpers/grpc.helper';
import { ChangeStatusDto, CreateCoursewareDto, CreateLiveDto, JoinLiveDto, JwtAuthGuard, normalizePageQuery, toGrpcPage, UpdateLiveDto, userIdMetadata } from '@yunyan-live/nest-shared';

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
  createLive(data: { title: string; type?: number; start_time: string; duration?: number; room_id?: string }, metadata?: Metadata): Observable<LiveResponse>;
  joinLive(data: { join_code: string; live_user_id?: string }): Observable<JoinLiveResponse>;
  showRoom(data: { room_id: string }): Observable<ShowRoomResponse>;
  changeStatus(data: { room_id: string; status: number }): Observable<LiveResponse>;
  updateLive(data: { room_id: string; title: string; type: number; start_time: string; duration: number }): Observable<LiveResponse>;
  cmsList(data: { page?: number; page_size?: number; status?: number; live_user_id?: string; search_name?: string; start_time?: string; end_time?: string; type?: number }, metadata?: Metadata): Observable<CmsListResponse>;
  cmsDetail(data: { room_id: string }): Observable<ShowRoomResponse>;
  deleteLive(data: { room_id: string }): Observable<LiveResponse>;
  updateCode(data: { room_id: string }): Observable<UpdateCodeResponse>;
  getStudentRooms(data: { page?: number; page_size?: number }, metadata?: Metadata): Observable<StudentRoomsResponse>;
  leaveRoom(data: { room_id: string }, metadata?: Metadata): Observable<LiveResponse>;
  batchLeave(data: { room_ids: string[] }, metadata?: Metadata): Observable<LiveResponse>;
  getParticipants(data: { room_id: string }): Observable<unknown>;
  generateTransferCode(data: { room_id: string; target_user_id: string }): Observable<{ code: string; msg: string; transfer_code: string; expires_at: string }>;
  executeTransfer(data: { room_id: string; transfer_code: string; from_user_id: string }): Observable<{ code: string; msg: string }>;
  saveVideoRecording(data: { room_id: string; file_path: string; file_name: string; file_size: number; duration: number; record_type: number; teacher_name: string }): Observable<{ code: string; msg: string }>;
  getVideoList(data: { page?: number; page_size?: number; live_user_id?: string; search_name?: string; start_time?: string; end_time?: string; type?: number }): Observable<{ code: string; msg: string; data: { items: Array<{ room_id: string; title: string; teacher_name: string; type: number; start_time: string; count: number }>; total: number } }>;
  getVideoDetail(data: { room_id: string; start_time?: string; end_time?: string }): Observable<{ code: string; msg: string; data: { items: Array<{ id: string; room_id: string; file_path: string; file_name: string; file_size: number; duration: number; record_type: number; teacher_name: string; created_at: string }>; total: number } }>;
  deleteVideoByRoomIds(data: { room_ids: string[] }): Observable<{ code: string; msg: string }>;
  deleteVideoByVideoIds(data: { video_ids: string[] }): Observable<{ code: string; msg: string }>;
  getUserWatchTimeList(data: { page?: number; page_size?: number; room_id?: string; search_name?: string }): Observable<{ code: string; msg: string; data: { items: Array<{ user_id: string; username: string; watch_time: number; joined_at: string; left_at: string; is_online: boolean }>; total: number; total_time_by_room: number } }>;
  saveCourseware(data: { room_id: string; filename: string; filext: string; filesize: number; fileurl: string; create_user_id?: string }, metadata?: Metadata): Observable<{ code: string; msg: string }>;
  listCourseware(data: { room_id: string }): Observable<{ code: string; msg: string; data: { items: Array<{ id: string; room_id: string; filename: string; filext: string; filesize: number; fileurl: string; created_at: string }>; total: number } }>;
  deleteCourseware(data: { id: string }): Observable<{ code: string; msg: string }>;
}

interface UserData {
  id: string;
  username: string;
  email: string;
  role: number;
}

interface AuthServiceClient {
  getUser(data: { user_id: string }): Observable<{ code: string; msg: string; data?: UserData }>;
  batchGetUsers(data: { user_ids: string[] }): Observable<{ code: string; msg: string; data?: UserData[] }>;
  searchTeachers(data: { keyword: string }): Observable<{ code: string; msg: string; data?: UserData[] }>;
}

@Controller('live/liveInfo')
export class LiveController implements OnModuleInit {
  private readonly logger = new Logger(LiveController.name);

  constructor(
    @Inject('LIVE_GRPC') private liveClient: ClientGrpc,
    @Inject('AUTH_GRPC') private authClient: ClientGrpc,
  ) {}

  private liveService: LiveServiceClient;
  private authService: AuthServiceClient;

  onModuleInit() {
    this.liveService = this.liveClient.getService<LiveServiceClient>('LiveService');
    this.authService = this.authClient.getService<AuthServiceClient>('AuthService');
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
    return grpcCall(this.liveService.createLive({
      title: dto.title,
      type: dto.type ?? 0,
      start_time: dto.startTime,
      duration: dto.duration ?? 0,
      room_id: dto.roomId ?? '',
    }, metadata));
  }

  @Put('updateLive')
  @UseGuards(JwtAuthGuard)
  updateLive(@Body() dto: UpdateLiveDto) {
    return grpcCall(this.liveService.updateLive({
      room_id: dto.roomId,
      title: dto.title ?? '',
      type: dto.type ?? 0,
      start_time: dto.startTime ?? '',
      duration: dto.duration ?? 0,
    }));
  }

  @Post('joinLive')
  @UseGuards(JwtAuthGuard)
  async join(@Body() dto: JoinLiveDto, @Request() req: { user: { userId: string } }) {
    return grpcCall(this.liveService.joinLive({
      join_code: dto.joinCode,
      live_user_id: req.user.userId,
    }));
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
      liveStartedAt: d.live_started_at || Date.now().toString(),
    };
  }

  @Put('changeLiveStatus')
  @UseGuards(JwtAuthGuard)
  changeStatus(@Body() dto: ChangeStatusDto) {
    return grpcCall(this.liveService.changeStatus({
      room_id: dto.roomId,
      status: dto.status,
    }));
  }

  @Post('cmsLiveList')
  @UseGuards(JwtAuthGuard)
  async cmsList(@Body() body: { page?: number; pageNum?: number; pageSize?: number; status?: number; searchName?: string; startTime?: string; endTime?: string; type?: number }, @Request() req: { user: { userId: string } }) {
    const metadata = userIdMetadata(req.user.userId);
    const result = await grpcCall(this.liveService.cmsList({
      ...toGrpcPage(normalizePageQuery({ page: body.page, pageNum: body.pageNum, pageSize: body.pageSize })),
      status: body.status,
      live_user_id: req.user.userId,
      search_name: body.searchName || '',
      start_time: body.startTime || '',
      end_time: body.endTime || '',
      type: body.type ?? -1,
    }, metadata));

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
        duration: r.duration,
      })),
      total: result.data.total,
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
      duration: d.duration,
    };
  }

  @Delete('deleteLive')
  @UseGuards(JwtAuthGuard)
  async delete(@Body('roomId') roomId: string) {
    await grpcCall(this.liveService.deleteLive({ room_id: roomId }));
    return { msg: '閸掔娀娅庨幋鎰' };
  }

  @Put('updateLiveCode')
  @UseGuards(JwtAuthGuard)
  async updateCode(@Body() body: { roomId: string; operateType: string }) {
    const result = await grpcCall(this.liveService.updateCode({ room_id: body.roomId }));
    return result.join_code;
  }

  @Get('studentRooms')
  @UseGuards(JwtAuthGuard)
  async getStudentRooms(@Query('page') page: string, @Query('pageSize') pageSize: string, @Request() req: { user: { userId: string } }) {
    const metadata = userIdMetadata(req.user.userId);
    const result = await grpcCall(this.liveService.getStudentRooms({
      ...toGrpcPage(normalizePageQuery({ page, pageSize })),
    }, metadata));

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
        type: r.type,
      })),
      total: result.data.total,
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

  @Get('participants')
  @UseGuards(JwtAuthGuard)
  getParticipants(@Query('roomId') roomId: string) {
    return grpcCall(this.liveService.getParticipants({ room_id: roomId }));
  }

  @Post('generateTransferCode')
  @UseGuards(JwtAuthGuard)
  generateTransferCode(@Body() body: { roomId: string }, @Request() req: { user: { userId: string } }) {
    return grpcCall(this.liveService.generateTransferCode({
      room_id: body.roomId,
      target_user_id: req.user.userId,
    }));
  }

  @Post('executeTransfer')
  @UseGuards(JwtAuthGuard)
  executeTransfer(@Body() body: { roomId: string; transferCode: string }, @Request() req: { user: { userId: string } }) {
    return grpcCall(this.liveService.executeTransfer({
      room_id: body.roomId,
      transfer_code: body.transferCode,
      from_user_id: req.user.userId,
    }));
  }

  @Get('searchTeachers')
  @UseGuards(JwtAuthGuard)
  searchTeachers(@Query('keyword') keyword: string) {
    return grpcCall(this.authService.searchTeachers({ keyword: keyword || '' }));
  }

  @Post('saveVideoRecording')
  @UseGuards(JwtAuthGuard)
  saveVideoRecording(@Body() body: {
    roomId: string;
    filePath: string;
    fileName: string;
    fileSize: number;
    duration: number;
    recordType: number;
    teacherName?: string;
  }, @Request() req: { user: { userId: string } }) {
    return grpcCall(this.liveService.saveVideoRecording({
      room_id: body.roomId,
      file_path: body.filePath,
      file_name: body.fileName,
      file_size: body.fileSize,
      duration: body.duration,
      record_type: body.recordType,
      teacher_name: body.teacherName || req.user.userId,
    }));
  }

  @Get('videoList')
  @UseGuards(JwtAuthGuard)
  async getVideoList(@Query('page') page: string, @Query('pageNum') pageNum: string, @Query('pageSize') pageSize: string, @Query('searchName') searchName: string, @Query('startTime') startTime: string, @Query('endTime') endTime: string, @Query('type') type: string, @Request() req: { user: { userId: string } }) {
    const result = await grpcCall(this.liveService.getVideoList({
      ...toGrpcPage(normalizePageQuery({ page, pageNum, pageSize })),
      live_user_id: req.user.userId,
      search_name: searchName || '',
      start_time: startTime || '',
      end_time: endTime || '',
      type: parseInt(type) >= 0 ? parseInt(type) : -1,
    }));
    const items = (result?.data?.items || []).map((item: Record<string, unknown>) => ({
      roomId: item.room_id,
      title: item.title,
      speakerName: item.teacher_name,
      type: item.type,
      time: item.start_time,
      count: item.count,
    }));
    return {
      list: items,
      pageInfo: { totalElements: result?.data?.total || 0 },
    };
  }

  @Get('videoDetail')
  @UseGuards(JwtAuthGuard)
  async getVideoDetail(@Query('roomId') roomId: string, @Query('startTime') startTime: string, @Query('endTime') endTime: string) {
    const result = await grpcCall(this.liveService.getVideoDetail({
      room_id: roomId,
      start_time: startTime || '',
      end_time: endTime || '',
    }));
    const items = (result?.data?.items || []).map((item: Record<string, unknown>) => ({
      roomId: item.room_id,
      id: item.id,
      address: item.file_path,
      duration: item.duration,
      createTime: item.created_at,
      recordType: item.record_type,
      filePath: item.file_path,
    }));
    return {
      list: items,
      pageInfo: { totalElements: result?.data?.total || 0 },
    };
  }

  @Delete('deleteVideo')
  @UseGuards(JwtAuthGuard)
  deleteVideoByRoomIds(@Body('roomIds') roomIds: string[]) {
    return grpcCall(this.liveService.deleteVideoByRoomIds({ room_ids: roomIds }));
  }

  @Delete('deleteVideoByIds')
  @UseGuards(JwtAuthGuard)
  deleteVideoByVideoIds(@Body('videoIds') videoIds: string[]) {
    return grpcCall(this.liveService.deleteVideoByVideoIds({ video_ids: videoIds }));
  }

  @Post('saveCourseware')
  @UseGuards(JwtAuthGuard)
  saveCourseware(@Body() dto: CreateCoursewareDto, @Request() req: { user: { userId: string } }) {
    const metadata = userIdMetadata(req.user.userId);
    return grpcCall(this.liveService.saveCourseware({
      room_id: dto.roomId,
      filename: dto.filename,
      filext: dto.filext || '',
      filesize: dto.filesize ?? 0,
      fileurl: dto.fileUrl,
      create_user_id: req.user.userId,
    }, metadata));
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
      createdAt: item.created_at,
    }));
    return {
      list: items,
      pageInfo: { totalElements: result?.data?.total || 0 },
    };
  }

  @Delete('deleteCourseware')
  @UseGuards(JwtAuthGuard)
  deleteCourseware(@Body('id') id: string) {
    return grpcCall(this.liveService.deleteCourseware({ id }));
  }

  @Post('savePlayBackUrl')
  @UseGuards(JwtAuthGuard)
  async savePlayBackUrl(@Body() body: { roomId: string; playBackUrl: string; duration: number }) {
    await grpcCall(this.liveService.saveVideoRecording({
      room_id: body.roomId,
      file_path: body.playBackUrl,
      file_name: body.playBackUrl,
      file_size: 0,
      duration: body.duration || 0,
      record_type: 2,
      teacher_name: '',
    }));
    return {
      code: 1000,
      msg: '娣囨繂鐡ㄩ幋鎰',
      data: {
        roomId: body.roomId,
        playBackUrl: body.playBackUrl,
      },
    };
  }

  @Get('liveEndInfo')
  @UseGuards(JwtAuthGuard)
  async liveEndInfo(@Query('roomId') roomId: string) {
    try {
      const result = await grpcCall(this.liveService.getParticipants({ room_id: roomId })) as { data?: { total?: number } };
      return {
        code: 1000,
        msg: 'success',
        data: {
          totalWatchNum: result?.data?.total || 0,
        },
      };
    } catch {
      return {
        code: 1000,
        msg: 'success',
        data: {
          totalWatchNum: 0,
        },
      };
    }
  }

  @Post("getUserWatchTimeList")
  @UseGuards(JwtAuthGuard)
  async getUserWatchTimeList(@Body() body: { pageNum?: number; pageSize?: number; roomId?: string; searchName?: string }) {
    const result = await grpcCall(this.liveService.getUserWatchTimeList({
      ...toGrpcPage(normalizePageQuery({ pageNum: body.pageNum, pageSize: body.pageSize })),
      room_id: body.roomId || "",
      search_name: body.searchName || "",
    }));
    const items = result?.data?.items || [];
    const userIds = items.map((item: { user_id: string }) => item.user_id);
    const usernameMap = await this.resolveUsernames(userIds);
    return {
      list: items.map((item: { user_id: string; watch_time: number; joined_at: string; left_at: string; is_online: boolean }) => ({
        userId: item.user_id,
        nickName: usernameMap.get(item.user_id) || item.user_id,
        watchTime: item.watch_time,
        joinedAt: item.joined_at,
        leftAt: item.left_at,
        isOnline: item.is_online,
      })),
      other: { totalTimeByRoomId: result?.data?.total_time_by_room || 0 },
      pageInfo: { totalElements: result?.data?.total || 0 },
    };
  }

  @Get('downloadRecording/:id')
  @UseGuards(JwtAuthGuard)
  async downloadRecording(@Param('id') id: string, @Query('download') download: string, @Res() res: Response) {
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
        'Content-Disposition': `attachment; filename="${id}.mp4"`,
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
    const containerVideoWebm = `${containerRecordings}/${id}-video.webm`;

    fs.writeFileSync(markerFile, '');

    const hasAudio = fs.existsSync(hostAudioMjr);
    const containerVideoMjr = `${containerRecordings}/rec-${id}-video.mjr`;
    const containerAudioMjr = `${containerRecordings}/rec-${id}-audio.mjr`;
    const containerMp4 = `${containerRecordings}/${id}.mp4`;
    const containerAudioOpus = `${containerRecordings}/${id}-audio.opus`;

    const step1 = `docker exec ${container} ${ppRecBin} "${containerVideoMjr}" "${containerVideoWebm}"`;
    const step2a = hasAudio
      ? `docker exec ${container} ${ppRecBin} "${containerAudioMjr}" "${containerAudioOpus}"`
      : '';
    const step2b = hasAudio
      ? `docker exec ${container} ffmpeg -y -i "${containerVideoWebm}" -i "${containerAudioOpus}" -c:v libx264 -preset ultrafast -c:a aac "${containerMp4}"`
      : `docker exec ${container} ffmpeg -y -i "${containerVideoWebm}" -c:v libx264 -preset ultrafast "${containerMp4}"`;
    const step4 = hasAudio
      ? `docker exec ${container} rm -f "${containerVideoWebm}" "${containerAudioOpus}"`
      : `docker exec ${container} rm -f "${containerVideoWebm}"`;

    const script = [step1, step2a, step2b, step4, `rm -f "${markerFile}"`].filter(Boolean).join(' && ');
    const child = spawn('sh', ['-c', script], { detached: true, stdio: 'ignore' });
    child.unref();

    return res.json({ code: 2002, msg: '转码中，请稍后' });
  }
}



