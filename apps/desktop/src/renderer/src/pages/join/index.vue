<template>
  <div class="join-page">
    <div class="join-card">
      <template v-if="phase === 'loading'">
        <p class="headline">正在获取直播间信息…</p>
      </template>

      <template v-else-if="phase === 'invalid'">
        <p class="headline">链接无效</p>
        <p class="desc warn">{{ reason }}</p>
        <el-button type="primary" @click="goHome">返回首页</el-button>
      </template>

      <template v-else-if="phase === 'ended'">
        <p class="headline">{{ room.title || '直播间' }}</p>
        <p class="desc">主讲：{{ room.speakerName || '未知老师' }}</p>
        <p class="desc warn">该直播已结束，无法进入</p>
        <el-button type="primary" @click="goHome">返回首页</el-button>
      </template>

      <template v-else>
        <p class="headline">{{ room.title || '直播间' }}</p>
        <p class="desc">主讲：{{ room.speakerName || '未知老师' }} · {{ statusText }}</p>
        <template v-if="phase === 'failed'">
          <p class="desc warn">{{ reason }}</p>
          <el-button type="primary" :loading="entering" @click="retry">重试进入</el-button>
        </template>
        <template v-else>
          <p class="desc">正在进入直播间…</p>
          <el-button type="primary" loading disabled>进入中</el-button>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '@yunyan-live/http';
import api from '@/api';
import { useUserStore } from '@/store/user';
import { RoomStatus, ROOM_STATUS_TEXT } from '@/constants/room';

type Phase = 'loading' | 'invalid' | 'ended' | 'entering' | 'failed';

interface JoinRoom {
  roomId?: string;
  title?: string;
  speakerName?: string;
  liveUserId?: string;
  joinCode?: string;
  status?: number;
  type?: number;
}

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const roomId = typeof route.query.room === 'string' ? route.query.room.trim() : '';
const code = typeof route.query.code === 'string' ? route.query.code.trim() : '';

const phase = ref<Phase>('loading');
const reason = ref('');
const room = ref<JoinRoom>({});
const roomLoaded = ref(false);
const entering = ref(false);

const statusText = computed(() => ROOM_STATUS_TEXT[room.value.status ?? 0] || '');

function setInvalid(message: string) {
  reason.value = message;
  phase.value = 'invalid';
}

function goHome() {
  void router.push('/');
}

async function enter() {
  if (entering.value) return;
  if (room.value.status === RoomStatus.ENDED) {
    phase.value = 'ended';
    return;
  }
  const joinCode = code || room.value.joinCode || '';
  if (!roomId || !joinCode) {
    setInvalid('链接无效：缺少房间或参加码');
    return;
  }
  entering.value = true;
  phase.value = 'entering';
  const type = room.value.type === 0 ? 'small' : 'large';
  const identity = room.value.liveUserId === userStore.guid ? 'teacher' : 'student';
  if (identity === 'student') {
    try {
      await api.join_live({ joinCode, nickName: userStore.userInfo.userName });
    } catch (err) {
      reason.value =
        err instanceof ApiError
          ? err.message || '无法加入直播间，请检查参加码'
          : '网络异常，请稍后重试';
      phase.value = 'failed';
      entering.value = false;
      return;
    }
  }
  phase.value = 'entering';
  try {
    await router.push({
      path: `/classroom/${type}${identity}`,
      query: {
        roomId,
        code: joinCode,
        identity,
        nickName: userStore.userInfo.userName
      }
    });
  } catch {
    reason.value = '进入直播间失败，请重试';
    phase.value = 'failed';
  } finally {
    entering.value = false;
  }
}

async function load() {
  if (!roomId || !code) {
    setInvalid('链接无效：缺少房间或参加码参数');
    return;
  }
  phase.value = 'loading';
  roomLoaded.value = false;
  try {
    const res = await api.show_room_info({ roomId });
    const data = res.data as JoinRoom;
    if (!data || !data.roomId) {
      setInvalid('直播间不存在或链接已失效');
      return;
    }
    if (data.joinCode !== code) {
      setInvalid('参加码已更新，此链接已失效，请向老师索取最新链接');
      return;
    }
    room.value = data;
    roomLoaded.value = true;
    if (data.status === RoomStatus.ENDED) {
      phase.value = 'ended';
      return;
    }
    await enter();
  } catch (err) {
    if (err instanceof ApiError) {
      setInvalid('直播间不存在或链接已失效');
    } else {
      reason.value = '网络异常，获取直播间信息失败';
      phase.value = 'failed';
    }
  }
}

function retry() {
  if (roomLoaded.value) {
    void enter();
  } else {
    void load();
  }
}

onMounted(() => {
  void load();
});
</script>

<style lang="less" scoped>
.join-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
}

.join-card {
  width: 360px;
  padding: 32px 28px;
  text-align: center;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);

  .headline {
    margin: 0 0 12px;
    font-size: 18px;
    font-weight: 600;
    color: #303133;
    word-break: break-all;
  }

  .desc {
    margin: 0 0 8px;
    font-size: 14px;
    color: #606266;

    &.warn {
      color: #f56c6c;
    }
  }

  .el-button {
    margin-top: 12px;
  }
}
</style>
