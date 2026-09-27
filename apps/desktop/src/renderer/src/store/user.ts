import { defineStore } from 'pinia';
import { ElMessage } from 'element-plus';
import type { LiveInfo, UserInfo } from '@yunyan-live/types';
import api from '@/api';
import router from '@/router';

interface UserState {
  userInfo: UserInfo;
  token: string;
  guid: string;
  liveInfo: LiveInfo;
}

const emptyUser: UserInfo = { guid: '', token: '', userName: '', email: '', role: 2 };
const emptyLive: LiveInfo = { liveUserId: '', nickName: '', joinCode: '' };

export type SessionInterrupt = 'kicked' | 'expired';

const SESSION_MESSAGES: Record<SessionInterrupt, string> = {
  kicked: '账号已在其他设备登录',
  expired: '登录已过期，请重新登录'
};

// Multiple in-flight requests can all hit 401 after a kick — only react once.
let sessionInterruptHandled = false;

function resetSessionInterrupt() {
  sessionInterruptHandled = false;
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    userInfo: { ...emptyUser },
    token: '',
    guid: '',
    liveInfo: { ...emptyLive }
  }),
  actions: {
    setToken(token: string) {
      resetSessionInterrupt();
      this.token = token;
      localStorage.setItem('token', token);
    },
    setGuid(guid: string) {
      this.guid = guid;
      localStorage.setItem('guid', guid);
    },
    setUserInfo(userInfo: UserInfo) {
      this.userInfo = userInfo;
    },
    setName(name: string) {
      this.userInfo.userName = name;
    },
    setEmail(email: string) {
      this.userInfo.email = email;
    },
    delToken() {
      this.token = '';
      localStorage.removeItem('token');
    },
    sessionInterrupted(kind: SessionInterrupt) {
      if (sessionInterruptHandled) return;
      sessionInterruptHandled = true;
      this.delToken();
      this.delGuid();
      localStorage.removeItem('role');
      if (localStorage.getItem('popup')) {
        localStorage.removeItem('popup');
      }
      ElMessage({ message: SESSION_MESSAGES[kind], type: 'warning', duration: 3000 });
      void router.replace({ path: '/login', query: { reason: kind } });
    },
    delGuid() {
      this.guid = '';
      localStorage.removeItem('guid');
    },
    setLiveInfo(liveInfo: LiveInfo) {
      this.liveInfo = liveInfo;
    },
    async login(params: { email: string; password: string }) {
      try {
        const res = await api.user_login(params);
        if (res.data.code === 1000) {
          const { token, guid, role } = res.data.data;
          this.setToken(token);
          this.setGuid(guid);
          this.setUserInfo(res.data.data);
          localStorage.setItem('role', String(role));
          await this.user_msg();
        } else {
          this.delToken();
          this.delGuid();
        }
      } catch (err) {
        this.delToken();
        this.delGuid();
        console.log('loginErr===>', err);
      }
    },
    async login_out(params: { token: string; guid: string }) {
      try {
        const res = await api.user_logout(params);
        if (res.data.code === 1000) {
          this.delToken();
          this.delGuid();
          localStorage.removeItem('role');
          if (localStorage.getItem('popup')) {
            localStorage.removeItem('popup');
          }
        }
      } catch (err) {
        this.delToken();
        this.delGuid();
        localStorage.removeItem('role');
        console.log('loginErr===>', err);
      }
    },
    async user_msg() {
      try {
        const res = await api.user_msg();
        if (res.data.code === 1000) {
          const { token, guid } = res.data.data;
          this.setToken(token);
          this.setGuid(guid);
          this.setUserInfo(res.data.data);
        } else {
          this.delToken();
        }
      } catch (err) {
        this.delToken();
        console.log('loginErr===>', err);
      }
    },
    async live(liveInfo: LiveInfo) {
      this.setLiveInfo(liveInfo);
    }
  }
});