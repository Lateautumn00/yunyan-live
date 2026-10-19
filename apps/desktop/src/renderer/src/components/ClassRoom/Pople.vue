<template>
  <div class="classroom-pople">
    <ul>
      <li v-for="(item, index) in userList" :key="index">
        <div class="name">
          {{ item.userName }}
        </div>
        <div v-if="item.isTeacher" class="span teacher">
          <el-icon><UserFilled /></el-icon> 主讲
        </div>
        <div v-if="item.opaqueId == liveUserId" class="span me">
          <el-icon><UserFilled /></el-icon> 我
        </div>
        <div v-if="badgeOf(item)" class="span moderation">{{ badgeOf(item) }}</div>
        <el-dropdown
          v-if="canModerate(item)"
          trigger="click"
          @command="(cmd: string) => handleModeration(cmd, item)"
        >
          <span class="ops" aria-label="成员操作">
            <el-icon><MoreFilled /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="mute1">禁言 1 分钟</el-dropdown-item>
              <el-dropdown-item command="mute5">禁言 5 分钟</el-dropdown-item>
              <el-dropdown-item command="mute10">禁言 10 分钟</el-dropdown-item>
              <el-dropdown-item command="releaseMute">解除禁言</el-dropdown-item>
              <el-dropdown-item command="kick" divided>移出本场</el-dropdown-item>
              <el-dropdown-item command="releaseKick">解除移出</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoomStore } from '@/store/room';
import { useUserStore } from '@/store/user';
import api from '@/api';

interface PopleUser {
  userName?: string;
  opaqueId?: string;
  isTeacher?: boolean;
}

const props = defineProps<{ liveUserId?: string; roomId?: string }>();

const userList = ref<PopleUser[]>([]);
const roomStore = useRoomStore();
const userStore = useUserStore();

function updatePopleList(poples: PopleUser[]) {
  userList.value = poples;
  // 单漏斗双写：局部渲染 ref + room store（@提及选项消费）
  roomStore.setMembers(poples);
}

/** chat roster（liveUserId=Janus opaqueId → senderId=JWT sub）：禁言/踢出的落库身份来源 */
const rosterByLiveId = computed(() => {
  const map = new Map<string, string>();
  for (const m of roomStore.chatRoster) {
    if (!map.has(m.liveUserId)) map.set(m.liveUserId, m.senderId);
  }
  return map;
});

function senderIdOf(item: PopleUser): string {
  return (item.opaqueId ? rosterByLiveId.value.get(item.opaqueId) : '') ?? '';
}

function canModerate(item: PopleUser): boolean {
  // UI 门槛仅作引导（教师/本人/目标教师/未入 chat 名册不可点）；服务端仍做房间归属断言
  return (
    userStore.userInfo.role === 1 &&
    !!senderIdOf(item) &&
    item.opaqueId !== props.liveUserId &&
    !item.isTeacher
  );
}

function badgeOf(item: PopleUser): string {
  const senderId = senderIdOf(item);
  const view = senderId ? roomStore.moderation[senderId] : undefined;
  if (!view) return '';
  if (view.kicked) return '已移出';
  if (view.mutedUntilMs !== undefined) return '已禁言';
  return '';
}

const MUTE_MINUTES: Record<string, number> = { mute1: 1, mute5: 5, mute10: 10 };

async function handleModeration(command: string, item: PopleUser) {
  const userId = senderIdOf(item);
  const roomId = props.roomId ?? '';
  if (!userId || !roomId) return;
  try {
    const minutes = MUTE_MINUTES[command];
    if (minutes !== undefined) {
      await api.mute({ roomId, userId, minutes });
      ElMessage.success('已禁言');
    } else if (command === 'kick') {
      await api.kick({ roomId, userId });
      ElMessage.success('已移出本场');
    } else if (command === 'releaseMute') {
      await api.releaseModeration({ roomId, userId, kind: 'mute' });
      ElMessage.success('已解除禁言');
    } else if (command === 'releaseKick') {
      await api.releaseModeration({ roomId, userId, kind: 'kick' });
      ElMessage.success('已解除移出');
    }
  } catch (err) {
    console.error(err);
    ElMessage.error('操作失败，请重试');
  }
}

defineExpose({ updatePopleList, handleModeration });
</script>

<style lang="less" scoped>
.classroom-pople {
  color: #323232;
  padding: 0px 6px;
  height: 100%;
  ul {
    overflow-y: scroll;
    overflow: auto;
    height: 100%;
    padding: 0px;
    padding-inline-start: 0px !important;
    margin-block-start: 0px !important;
    margin-block-end: 0px !important;
    li {
      list-style-type: none;
      min-height: 32px;
      margin-bottom: 8px;
      line-height: normal;
      font-size: 14px;
      display: flex;
      flex-direction: row;
      align-items: center;
      padding: 0 6px;
      &:first-child {
        margin-top: 0;
      }
      &:hover {
        background: #e2e2e7;
        border-radius: 3px;
      }
      .name {
        font-weight: 400;
        color: #323232;
      }
      .span {
        height: 16px;
        line-height: 16px;
        border-radius: 8px;
        padding-left: 10px;
        padding-right: 10px;
        font-weight: bold;
        display: flex;
        align-items: center;
        margin-left: 6px;
        img {
          width: 10px;
          height: 12px;
        }
        .el-icon {
          font-size: 10px;
          width: 10px;
          height: 12px;
          margin-right: 4px;
        }
      }
      .teacher {
        background: rgba(248, 130, 26, 0.2);
        color: #f8821a;
      }
      .me {
        background: rgba(97, 186, 71, 0.2);
        color: #61ba47;
      }
      .moderation {
        background: rgba(245, 108, 108, 0.2);
        color: #f56c6c;
      }
      .ops {
        margin-left: auto;
        cursor: pointer;
        color: #909399;
        display: flex;
        align-items: center;
        .el-icon {
          font-size: 14px;
        }
        &:hover {
          color: #323232;
        }
      }
    }
  }
}
</style>
