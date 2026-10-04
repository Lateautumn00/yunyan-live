import { encryptPassword } from '@/utils/passwordCrypto';
import { http, config } from './instance';

export { config } from './instance';

export default {
  user_msg() {
    return http.get(`${config.userApi}/user/getUserMsg`);
  },
  async user_login(params: { email: string; password: string }) {
    return http.post(`${config.userApi}/user/login`, {
      ...params,
      password: await encryptPassword(params.password)
    });
  },
  user_logout(params: { token: string; guid: string }) {
    return http.post(`${config.userApi}/user/logout`, params);
  },
  getNowTime() {
    return http.get(`${config.userApi}/user/getNowTime`);
  },
  updateForbid(params: { roomId: string; liveUserId: string; status: number }) {
    return http.post(`${config.liveApi}/push/updateForbid`, params);
  },
  async register(params: { email: string; userName: string; password: string; role?: number; code: string }) {
    return http.post(`${config.userApi}/user/register`, {
      ...params,
      password: await encryptPassword(params.password)
    });
  },
  email_code(params: { email: string }) {
    return http.post(`${config.userApi}/mail/reqEmailCode`, params);
  },
  join_live(params: { joinCode: string; nickName: string }) {
    return http.post(`${config.liveApi}/liveInfo/joinLive`, params);
  },
  show_room_info(params: Record<string, unknown>) {
    return http.get(`${config.liveApi}/liveInfo/showRoomInfo`, { params });
  },
  change_live_status(params: Record<string, unknown>) {
    return http.put(`${config.liveApi}/liveInfo/changeLiveStatus`, params);
  },
  save_play_back_url(params: Record<string, unknown>) {
    return http.post(`${config.liveApi}/liveInfo/savePlayBackUrl`, params);
  },
  student_rooms(params: { page: number; pageSize: number }) {
    return http.get(`${config.liveApi}/liveInfo/studentRooms`, { params });
  },
  leave_room(roomId: string) {
    return http.delete(`${config.liveApi}/liveInfo/leave`, { data: { roomId } });
  },
  batch_leave(roomIds: string[]) {
    return http.delete(`${config.liveApi}/liveInfo/batchLeave`, { data: { roomIds } });
  },
  async reset_password(params: { email: string; code: string; password: string }) {
    return http.post(`${config.userApi}/user/resetPassword`, {
      ...params,
      password: await encryptPassword(params.password)
    });
  },
  async change_password(params: { oldPassword: string; password: string }) {
    return http.post(`${config.userApi}/user/changePassword`, {
      oldPassword: await encryptPassword(params.oldPassword),
      password: await encryptPassword(params.password)
    });
  },
  update_user_name(params: { userName: string }) {
    return http.post(`${config.userApi}/user/updateUserName`, params);
  }
};