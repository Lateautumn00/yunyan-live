import { createHttpClient } from '@yunyan-live/http';
import { loadConfig } from '@yunyan-live/config';
import { ElMessage } from 'element-plus';
import router from '@/router';

export const config = loadConfig(import.meta.env as unknown as Record<string, string | undefined>);

export const http = createHttpClient({
  baseURL: '',
  timeout: 10000,
  tokenProvider: () => ({
    token: localStorage.getItem('token'),
    guid: localStorage.getItem('guid')
  }),
  onMessageError: (msg) => {
    ElMessage({ message: msg, type: 'error', duration: 2000 });
  },
  onUnauthorized: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('guid');
    router.replace('/');
  },
  onServerError: (msg) => {
    ElMessage({ message: msg, type: 'error', duration: 2000 });
  }
});