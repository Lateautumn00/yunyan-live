import type { LiveForm } from '@/types/pages/teacher/live';
import axios from 'axios';
import { http, config } from '../instance';

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
  save_video_recording(params: object) {
    return http.post(`${config.liveApi}/liveInfo/saveVideoRecording`, params);
  },
  update_pass(params: object) {
    return http.post(`${config.userApi}/user/updatePassword`, params);
  },
  update_user(params: object) {
    return http.post(`${config.userApi}/user/updateSysUserInfo`, params);
  },
  email_code(params: object) {
    return http.post(`${config.userApi}/mail/reqEmailCode`, params);
  },
  update_email(params: object) {
    return http.get(`${config.userApi}/user/updateEmail`, { params });
  },
  generate_transfer_code(params: object) {
    return http.post(`${config.liveApi}/liveInfo/generateTransferCode`, params);
  },
  execute_transfer(params: object) {
    return http.post(`${config.liveApi}/liveInfo/executeTransfer`, params);
  },
  search_teachers(params: object) {
    return http.get(`${config.liveApi}/liveInfo/searchTeachers`, { params });
  },
  download_recording(id: string) {
    const token = localStorage.getItem('token');
    return axios.get(`${config.liveApi}/liveInfo/downloadRecording/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  download_recording_file(id: string) {
    const token = localStorage.getItem('token');
    return axios.get(`${config.liveApi}/liveInfo/downloadRecording/${id}?download=true`, {
      responseType: 'blob',
      headers: { Authorization: `Bearer ${token}` }
    });
  }
};
