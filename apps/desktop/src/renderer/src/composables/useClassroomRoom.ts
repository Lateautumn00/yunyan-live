import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import api from '@/api';
import { ApiError } from '@yunyan-live/http';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ClassroomRoomOptions {
  role: 'teacher' | 'student';
  top: Ref<any>;
  video: Ref<any>;
  chat: Ref<any>;
  updateNum: (status: boolean, numArg: number, typeStr: string) => void;
  history?: Ref<any>;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export function useClassroomRoom(options: ClassroomRoomOptions) {
  const { role, top, video, chat, updateNum, history } = options;
  const router = useRouter();
  const route = useRoute();
  const roomId = (route.query.roomId as string) || '';
  const nickName = (route.query.nickName as string) || '';
  const roomInfo = ref<{ status: number; [key: string]: unknown }>({ status: 0 });

  function videoList(status: boolean, data: Record<string, unknown>) {
    if (status) {
      history?.value?.videoLists(status, data);
    } else {
      history?.value?.setSplice((data as { index: number }).index);
    }
    updateNum(status, 1, 'playback');
  }

  async function getRoomInfo(init = true, retryCount = 0): Promise<void> {
    try {
      const res = await api.show_room_info({ roomId });
      const data = res.data;
      roomInfo.value = data;
      if (data.status == 2) {
        top.value?.setsTime(data.liveStartedAt || Date.now().toString());
      }
      if (role === 'teacher') {
        video.value?.setInit();
        chat.value?.createTutorSocket();
      } else if (init) {
        if (data.videoList?.length) {
          const list = data.videoList.reverse();
          list.forEach((item: Record<string, unknown>) => {
            videoList(true, item);
          });
        }
        video.value?.setInit();
        chat.value?.createTutorSocket();
      }
    } catch (e) {
      console.error('getRoomInfo failed:', e);
      if (e instanceof ApiError) {
        router.push('/');
      } else if (retryCount < 1) {
        setTimeout(() => getRoomInfo(init, retryCount + 1), 2000);
      } else {
        ElMessage.error('获取房间信息失败，请检查网络连接');
        setTimeout(() => router.push('/'), 1500);
      }
    }
  }

  if (role === 'student') {
    onBeforeUnmount(() => {
      if (roomId) {
        void api.leave_room(roomId).catch(() => {});
      }
    });
  }

  onMounted(() => {
    getRoomInfo();
  });

  return { router, route, roomId, nickName, roomInfo, getRoomInfo, videoList };
}
