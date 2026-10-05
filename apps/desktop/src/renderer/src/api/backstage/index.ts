import type { LiveForm } from '@/types/pages/teacher/live';
import { http, config } from '../instance';

interface RecordingStatusBody {
  code: number;
  msg?: string;
}

export default {
  create_live(params: LiveForm) {
    return http.post(`${config.liveApi}/liveInfo/createLive`, params);
  },
  update_live(params: object) {
    return http.put(`${config.liveApi}/liveInfo/updateLive`, params);
  },
  room_detail(roomId: string) {
    return http.get(`${config.liveApi}/liveInfo/cmsLiveDetail`, {
      params: { roomId }
    });
  },
  live_list(params: object) {
    return http.post(`${config.liveApi}/liveInfo/cmsLiveList`, params);
  },
  live_delete(params: object) {
    return http.delete(`${config.liveApi}/liveInfo/deleteLive`, { data: params });
  },
  update_code(params: object) {
    return http.put(`${config.liveApi}/liveInfo/updateLiveCode`, params);
  },
  watchtime_list(params: object) {
    return http.post(`${config.liveApi}/liveInfo/getUserWatchTimeList`, params);
  },
  video_list(params: object) {
    return http.get(`${config.liveApi}/liveInfo/videoList`, { params });
  },
  video_detail(params: object) {
    return http.get(`${config.liveApi}/liveInfo/videoDetail`, { params });
  },
  roomids_delete(params: object) {
    return http.delete(`${config.liveApi}/liveInfo/deleteVideo`, { data: params });
  },
  videoids_delete(params: object) {
    return http.delete(`${config.liveApi}/liveInfo/deleteVideoByIds`, { data: params });
  },
  generate_transfer_code(params: object) {
    return http.post(`${config.liveApi}/liveInfo/generateTransferCode`, params);
  },
  execute_transfer(params: object) {
    return http.post(`${config.liveApi}/liveInfo/executeTransfer`, params);
  },
  save_courseware(params: { roomId: string; filename: string; filext?: string; filesize?: number; fileUrl: string }) {
    return http.post(`${config.liveApi}/liveInfo/saveCourseware`, params);
  },
  courseware_list(roomId: string) {
    return http.get(`${config.liveApi}/liveInfo/coursewareList`, { params: { roomId } });
  },
  delete_courseware(id: string) {
    return http.delete(`${config.liveApi}/liveInfo/deleteCourseware`, { data: { id } });
  },
  download_recording(id: string) {
    return http.get<RecordingStatusBody>(`${config.liveApi}/liveInfo/downloadRecording/${id}`, {
      raw: true,
      timeout: 0
    });
  },
  download_recording_file(id: string) {
    return http.get<Blob>(`${config.liveApi}/liveInfo/downloadRecording/${id}?download=true`, {
      responseType: 'blob',
      raw: true,
      timeout: 0
    });
  }
};
