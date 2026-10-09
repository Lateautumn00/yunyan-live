import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { ok, userIdFromMetadata } from '@yunyan-live/nest-shared';

import { LiveService } from './live.service';

@Controller()
export class LiveController {
  private readonly logger = new Logger(LiveController.name);

  constructor(private readonly liveService: LiveService) {}

  @GrpcMethod('LiveService', 'CreateLive')
  async createLive(
    data: {
      title: string;
      type?: number;
      start_time: string;
      duration?: number;
      room_id?: string;
    },
    metadata: Metadata
  ) {
    const userId = userIdFromMetadata(metadata);
    this.logger.log(`gRPC CreateLive: ${data.title} by ${userId}`);
    const room = await this.liveService.create(
      {
        title: data.title,
        type: data.type,
        startTime: data.start_time,
        duration: data.duration,
        roomId: data.room_id
      },
      userId
    );
    return ok({
      data: {
        room_id: room.roomId,
        title: room.title,
        speaker_name: '',
        join_code: room.joinCode,
        status: room.status
      }
    });
  }

  @GrpcMethod('LiveService', 'JoinLive')
  async joinLive(data: { join_code: string; live_user_id?: string }) {
    this.logger.log(`gRPC JoinLive: ${data.join_code}`);
    const result = await this.liveService.join({
      joinCode: data.join_code,
      liveUserId: data.live_user_id
    });
    return ok({
      data: {
        live_user_id: result.liveUserId,
        room_id: result.roomId,
        role_name: result.roleName,
        join_code: result.joinCode,
        live_type: result.liveType,
        status: result.status
      }
    });
  }

  @GrpcMethod('LiveService', 'ShowRoom')
  async showRoom(data: { room_id: string }) {
    this.logger.log(`gRPC ShowRoom: ${data.room_id}`);
    const room = await this.liveService.showRoom(data.room_id);
    return ok({
      data: {
        room_id: room.roomId,
        title: room.title,
        speaker_name: '',
        join_code: room.joinCode,
        status: room.status,
        type: room.type,
        live_started_at: room.liveStartedAt?.getTime().toString() || '',
        live_user_id: room.liveUserId
      }
    });
  }

  @GrpcMethod('LiveService', 'ChangeStatus')
  async changeStatus(data: { room_id: string; status: number }) {
    this.logger.log(`gRPC ChangeStatus: ${data.room_id} -> ${data.status}`);
    const room = await this.liveService.changeStatus({ roomId: data.room_id, status: data.status });
    return ok({
      data: {
        room_id: room.roomId,
        title: room.title,
        speaker_name: '',
        join_code: room.joinCode,
        status: room.status
      }
    });
  }

  @GrpcMethod('LiveService', 'UpdateLive')
  async updateLive(data: {
    room_id: string;
    title?: string;
    type?: number;
    start_time?: string;
    duration?: number;
  }) {
    this.logger.log(`gRPC UpdateLive: ${data.room_id}`);
    const room = await this.liveService.update({
      roomId: data.room_id,
      title: data.title,
      type: data.type,
      startTime: data.start_time,
      duration: data.duration
    });
    return ok({
      data: {
        room_id: room.roomId,
        title: room.title,
        speaker_name: '',
        join_code: room.joinCode,
        status: room.status,
        type: room.type,
        start_time:
          room.startTime instanceof Date
            ? room.startTime.getTime().toString()
            : String(room.startTime || ''),
        duration: room.duration
      }
    });
  }

  @GrpcMethod('LiveService', 'CmsList')
  async cmsList(
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
    metadata: Metadata
  ) {
    const userId = userIdFromMetadata(metadata);
    this.logger.log(`gRPC CmsList: page=${data.page}`);
    const result = await this.liveService.cmsList(
      data.page,
      data.page_size,
      data.status,
      userId,
      data.search_name,
      data.start_time,
      data.end_time,
      data.type
    );
    return ok({
      data: {
        items: result.list.map(item => ({
          room_id: item.roomId,
          title: item.title,
          speaker_name: '',
          live_user_id: item.liveUserId,
          join_code: item.joinCode,
          status: item.status,
          type: item.type,
          start_time:
            item.startTime instanceof Date
              ? item.startTime.getTime().toString()
              : String(item.startTime || ''),
          teacher_code: item.teacherCode,
          student_code: item.studentCode,
          duration: item.duration
        })),
        total: result.total
      }
    });
  }

  @GrpcMethod('LiveService', 'CmsDetail')
  async cmsDetail(data: { room_id: string }) {
    this.logger.log(`gRPC CmsDetail: ${data.room_id}`);
    const room = await this.liveService.cmsDetail(data.room_id);
    return ok({
      data: {
        room_id: room.roomId,
        title: room.title,
        speaker_name: '',
        join_code: room.joinCode,
        status: room.status,
        type: room.type,
        start_time:
          room.startTime instanceof Date
            ? room.startTime.getTime().toString()
            : String(room.startTime),
        duration: room.duration,
        teacher_code: room.joinCode,
        student_code: room.joinCode
      }
    });
  }

  @GrpcMethod('LiveService', 'DeleteLive')
  async deleteLive(data: { room_id: string }) {
    this.logger.log(`gRPC DeleteLive: ${data.room_id}`);
    await this.liveService.delete(data.room_id);
    return ok();
  }

  @GrpcMethod('LiveService', 'UpdateCode')
  async updateCode(data: { room_id: string }) {
    this.logger.log(`gRPC UpdateCode: ${data.room_id}`);
    const joinCode = await this.liveService.updateCode(data.room_id);
    return ok({ join_code: joinCode });
  }

  @GrpcMethod('LiveService', 'GetStudentRooms')
  async getStudentRooms(data: { page?: number; page_size?: number }, metadata: Metadata) {
    const userId = userIdFromMetadata(metadata);
    this.logger.log(`gRPC GetStudentRooms: ${userId}`);
    const { items, total } = await this.liveService.getStudentRooms(
      userId,
      data.page,
      data.page_size
    );
    return ok({
      data: {
        items: items.map(r => ({
          room_id: r.roomId,
          title: r.title,
          speaker_name: '',
          live_user_id: r.liveUserId,
          join_code: r.joinCode,
          status: r.status,
          start_time:
            r.startTime instanceof Date
              ? r.startTime.getTime().toString()
              : String(r.startTime || ''),
          type: r.type
        })),
        total
      }
    });
  }

  @GrpcMethod('LiveService', 'LeaveRoom')
  async leaveRoom(data: { room_id: string }, metadata: Metadata) {
    const userId = userIdFromMetadata(metadata);
    this.logger.log(`gRPC LeaveRoom: ${data.room_id} by ${userId}`);
    await this.liveService.leaveRoom(userId, data.room_id);
    return ok();
  }

  @GrpcMethod('LiveService', 'BatchLeave')
  async batchLeave(data: { room_ids: string[] }, metadata: Metadata) {
    const userId = userIdFromMetadata(metadata);
    this.logger.log(`gRPC BatchLeave: ${data.room_ids} by ${userId}`);
    await this.liveService.batchLeave(userId, data.room_ids);
    return ok();
  }

  @GrpcMethod('LiveService', 'GetParticipants')
  async getParticipants(data: { room_id: string }) {
    this.logger.log(`gRPC GetParticipants: ${data.room_id}`);
    const participants = await this.liveService.getParticipants(data.room_id);
    return ok({
      data: {
        items: participants.map(p => ({
          user_id: p.userId,
          username: p.userId,
          joined_at: p.joinedAt.toISOString()
        })),
        total: participants.length
      }
    });
  }

  @GrpcMethod('LiveService', 'GenerateTransferCode')
  async generateTransferCode(data: { room_id: string; target_user_id: string }) {
    this.logger.log(
      `gRPC GenerateTransferCode: room=${data.room_id} target=${data.target_user_id}`
    );
    const result = await this.liveService.generateRoomTransferCode(
      data.room_id,
      data.target_user_id
    );
    return ok({
      transfer_code: result.code,
      expires_at: result.expiresAt
    });
  }

  @GrpcMethod('LiveService', 'ExecuteTransfer')
  async executeTransfer(data: { room_id: string; transfer_code: string; from_user_id: string }) {
    this.logger.log(`gRPC ExecuteTransfer: room=${data.room_id} code=${data.transfer_code}`);
    await this.liveService.executeRoomTransfer(data.room_id, data.transfer_code, data.from_user_id);
    return ok(undefined, '转移成功');
  }

  @GrpcMethod('LiveService', 'SaveVideoRecording')
  async saveVideoRecording(data: {
    room_id: string;
    file_path: string;
    file_name: string;
    file_size: number;
    duration: number;
    record_type: number;
    teacher_name: string;
  }) {
    this.logger.log(`gRPC SaveVideoRecording: room=${data.room_id} type=${data.record_type}`);
    await this.liveService.saveVideoRecording({
      roomId: data.room_id,
      filePath: data.file_path,
      fileName: data.file_name,
      fileSize: data.file_size,
      duration: data.duration,
      recordType: data.record_type,
      teacherName: data.teacher_name
    });
    return ok();
  }

  @GrpcMethod('LiveService', 'GetVideoList')
  async getVideoList(data: {
    page?: number;
    page_size?: number;
    live_user_id?: string;
    search_name?: string;
    start_time?: string;
    end_time?: string;
    type?: number;
  }) {
    this.logger.log(`gRPC GetVideoList: page=${data.page}`);
    const result = await this.liveService.getVideoList({
      page: data.page,
      pageSize: data.page_size,
      liveUserId: data.live_user_id,
      searchName: data.search_name,
      startTime: data.start_time,
      endTime: data.end_time,
      type: data.type
    });
    return ok({
      data: {
        items: result.items.map(item => ({
          room_id: item.roomId,
          title: item.title,
          teacher_name: item.teacherName,
          type: item.type,
          start_time: item.startTime,
          count: item.count
        })),
        total: result.total
      }
    });
  }

  @GrpcMethod('LiveService', 'GetVideoDetail')
  async getVideoDetail(data: { room_id: string; start_time?: string; end_time?: string }) {
    this.logger.log(`gRPC GetVideoDetail: room=${data.room_id}`);
    const result = await this.liveService.getVideoDetail({
      roomId: data.room_id,
      startTime: data.start_time,
      endTime: data.end_time
    });
    return ok({
      data: {
        items: result.items.map(item => ({
          id: item.id,
          room_id: item.roomId,
          file_path: item.filePath,
          file_name: item.fileName,
          file_size: item.fileSize,
          duration: item.duration,
          record_type: item.recordType,
          teacher_name: item.teacherName,
          created_at: item.createdAt
        })),
        total: result.total
      }
    });
  }

  @GrpcMethod('LiveService', 'DeleteVideoByRoomIds')
  async deleteVideoByRoomIds(data: { room_ids: string[] }) {
    this.logger.log(`gRPC DeleteVideoByRoomIds: ${data.room_ids}`);
    await this.liveService.deleteVideoByRoomIds(data.room_ids);
    return ok();
  }

  @GrpcMethod('LiveService', 'DeleteVideoByVideoIds')
  async deleteVideoByVideoIds(data: { video_ids: string[] }) {
    this.logger.log(`gRPC DeleteVideoByVideoIds: ${data.video_ids}`);
    await this.liveService.deleteVideoByVideoIds(data.video_ids);
    return ok();
  }

  @GrpcMethod('LiveService', 'SaveCourseware')
  async saveCourseware(data: {
    room_id: string;
    filename: string;
    filext: string;
    filesize: number;
    fileurl: string;
    create_user_id?: string;
  }) {
    this.logger.log(`gRPC SaveCourseware: room=${data.room_id} name=${data.filename}`);
    await this.liveService.saveCourseware({
      roomId: data.room_id,
      filename: data.filename,
      filext: data.filext,
      filesize: Number(data.filesize) || 0,
      fileurl: data.fileurl,
      createUserId: data.create_user_id
    });
    return ok();
  }

  @GrpcMethod('LiveService', 'ListCourseware')
  async listCourseware(data: { room_id: string }) {
    this.logger.log(`gRPC ListCourseware: room=${data.room_id}`);
    const result = await this.liveService.listCoursewares(data.room_id);
    return ok({
      data: {
        items: result.items.map(item => ({
          id: item.id,
          room_id: item.roomId,
          filename: item.filename,
          filext: item.filext,
          filesize: item.filesize,
          fileurl: item.fileurl,
          created_at: item.createdAt
        })),
        total: result.total
      }
    });
  }

  @GrpcMethod('LiveService', 'DeleteCourseware')
  async deleteCourseware(data: { id: string }) {
    this.logger.log(`gRPC DeleteCourseware: ${data.id}`);
    await this.liveService.deleteCourseware(data.id);
    return ok();
  }

  @GrpcMethod('LiveService', 'SaveBoardSnapshot')
  async saveBoardSnapshot(data: {
    room_id: string;
    lesson_id?: string;
    format_version?: number;
    data: Uint8Array;
  }) {
    this.logger.log(`gRPC SaveBoardSnapshot: room=${data.room_id} bytes=${data.data?.length}`);
    await this.liveService.saveBoardSnapshot({
      roomId: data.room_id,
      lessonId: data.lesson_id,
      formatVersion: data.format_version,
      data: data.data
    });
    return ok();
  }

  @GrpcMethod('LiveService', 'ListBoardSnapshots')
  async listBoardSnapshots(data: { room_id: string; cursor?: string; limit?: number }) {
    this.logger.log(`gRPC ListBoardSnapshots: room=${data.room_id} cursor=${data.cursor || ''}`);
    const result = await this.liveService.listBoardSnapshots({
      roomId: data.room_id,
      cursor: data.cursor,
      limit: data.limit
    });
    return ok({
      data: {
        items: result.items.map(item => ({
          id: item.id,
          room_id: item.roomId,
          lesson_id: item.lessonId || '',
          format_version: item.formatVersion,
          size: item.size,
          created_at: item.createdAt
        })),
        has_more: result.hasMore
      }
    });
  }

  @GrpcMethod('LiveService', 'GetBoardSnapshot')
  async getBoardSnapshot(data: { id: string }) {
    this.logger.log(`gRPC GetBoardSnapshot: ${data.id}`);
    const snapshot = await this.liveService.getBoardSnapshot(data.id);
    return this.boardSnapshotEnvelope(snapshot);
  }

  @GrpcMethod('LiveService', 'GetLatestBoardSnapshot')
  async getLatestBoardSnapshot(data: { room_id: string }) {
    this.logger.log(`gRPC GetLatestBoardSnapshot: room=${data.room_id}`);
    const snapshot = await this.liveService.getLatestBoardSnapshot(data.room_id);
    return this.boardSnapshotEnvelope(snapshot);
  }

  @GrpcMethod('LiveService', 'CheckRoomAccess')
  async checkRoomAccess(data: { room_id: string; user_id: string }) {
    const access = await this.liveService.checkRoomAccess(data.room_id, data.user_id);
    return ok({
      data: {
        allowed: access.allowed,
        is_teacher: access.isTeacher
      }
    });
  }

  private boardSnapshotEnvelope(snapshot: {
    id: string;
    roomId: string;
    lessonId: string | null;
    formatVersion: number;
    data: Uint8Array;
    createdAt: string;
  }) {
    return ok({
      data: {
        id: snapshot.id,
        room_id: snapshot.roomId,
        lesson_id: snapshot.lessonId || '',
        format_version: snapshot.formatVersion,
        data: snapshot.data,
        created_at: snapshot.createdAt
      }
    });
  }

  @GrpcMethod('LiveService', 'GetUserWatchTimeList')
  async getUserWatchTimeList(data: {
    page?: number;
    page_size?: number;
    room_id?: string;
    search_name?: string;
  }) {
    this.logger.log('gRPC GetUserWatchTimeList');
    const result = await this.liveService.getUserWatchTimeList({
      page: data.page,
      pageSize: data.page_size,
      roomId: data.room_id,
      searchName: data.search_name
    });
    return ok({
      data: {
        items: result.items.map(item => ({
          user_id: item.userId,
          username: item.userId,
          watch_time: item.leftAt
            ? Math.floor((item.leftAt.getTime() - item.joinedAt.getTime()) / 1000)
            : Math.floor((Date.now() - item.joinedAt.getTime()) / 1000),
          joined_at: item.joinedAt.toISOString(),
          left_at: item.leftAt ? item.leftAt.toISOString() : '',
          is_online: item.isOnline
        })),
        total: result.total,
        total_time_by_room: result.totalTime
      }
    });
  }
}
