import { useRouter } from 'vue-router';
import { useUserStore } from '@/store/user';
import type { LiveRoom } from '@/types/pages/teacher/live';

export function useRoomNavigation() {
  const router = useRouter();
  const userStore = useUserStore();

  function goplayback(room: LiveRoom) {
    void router.push({
      path: '/teacher/playback/detail',
      query: { roomId: room.roomId, name: room.title }
    });
  }

  function gowatchlist(room: LiveRoom) {
    void router.push({
      path: '/teacher/mylive/watchlist',
      query: { roomId: room.roomId, name: room.title }
    });
  }

  function goLiveRoom(room: LiveRoom, identity: number) {
    const type = room.type === 0 ? 'small' : 'large';
    const role = identity === 1 ? 'teacher' : 'student';
    setTimeout(() => {
      void router.push({
        path: `/classroom/${type}${role}`,
        query: {
          roomId: room.roomId,
          code: room.joinCode,
          identity: role,
          nickName: userStore.userInfo.userName
        }
      });
    }, 500);
  }

  return { goplayback, gowatchlist, goLiveRoom };
}
