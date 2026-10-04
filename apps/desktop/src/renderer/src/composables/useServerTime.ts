import api from '@/api';

export function useServerTime() {
  async function getServerTime(): Promise<string> {
    try {
      const res = await api.getNowTime();
      return res.data?.nowTime ?? '';
    } catch (e) {
      console.error(e);
      return '';
    }
  }

  return { getServerTime };
}
