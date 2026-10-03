import { createHttpClient } from '@yunyan-live/http';
import { loadConfig } from '@yunyan-live/config';
import { ElMessage } from 'element-plus';
import { ApiCode, type ApiResult } from '@yunyan-live/types';
import { useUserStore } from '@/store/user';

export const config = loadConfig(import.meta.env as unknown as Record<string, string | undefined>);

export const http = createHttpClient({
  baseURL: '',
  timeout: 10000,
  withCredentials: false,
  tokenProvider: () => ({
    token: localStorage.getItem('token'),
    guid: localStorage.getItem('guid')
  }),
  onMessageError: (msg) => {
    ElMessage({ message: msg, type: 'error', duration: 2000 });
  },
  onUnauthorized: (data?: ApiResult) => {
    // Form submissions (wrong password) and token-less startup probes also get 401 —
    // only a request that carried a token means the session was interrupted.
    if (!localStorage.getItem('token')) return;
    const reason = data?.code === ApiCode.SESSION_KICKED ? 'kicked' : 'expired';
    useUserStore().sessionInterrupted(reason);
  },
  onServerError: (msg) => {
    ElMessage({ message: msg, type: 'error', duration: 2000 });
  }
});