<template>
  <div
    class="classroom-chat"
    :class="!isTeacher && (isInteraction == 2 || isInteraction == 3) ? 'chats1' : 'chats2'"
  >
    <div class="con">
      <ul ref="dialogueList" @scroll="fetchData">
        <li v-for="(item, index) in tanmuMessage" :key="index">
          <div v-if="item.showTime" class="msg-time">
            {{ formatChatTime(item.time) }}
          </div>
          <div v-if="!item.liveUser" :class="item.isMe ? 'user end' : 'user'">
            <div class="name">
              {{ item.userName }}
            </div>
            <div v-if="!item.isMe && item.isTeacher" class="span teacher">
              <el-icon><UserFilled /></el-icon>
              主讲
            </div>

            <div v-if="item.isMe" class="span me">
              <el-icon><UserFilled /></el-icon> 我
            </div>
          </div>
          <div
            :class="[
              item.isMe ? 'message message-me' : 'message',
              item.mentionMe ? 'mention-me' : ''
            ]"
          >
            <template v-for="(seg, si) in item.segments" :key="si">
              <span v-if="seg.mention" class="mention">{{ seg.text }}</span>
              <template v-else>
                {{ seg.text }}
              </template>
            </template>
          </div>
        </li>
      </ul>
      <el-tooltip
        class="item"
        effect="dark"
        :content="noSpeakMessageNum + '条未读消息'"
        placement="top"
        :value="!isBottom && noSpeakMessageNum > 0"
      >
        <div />
      </el-tooltip>
    </div>

    <div class="tool">
      <el-tooltip
        class="item"
        effect="dark"
        :content="speechClose == 1 ? '全部禁言' : '解除禁言'"
        placement="top"
      >
        <div>
          <el-icon
            v-if="isTeacher && speechClose == 1"
            aria-label="全部禁言"
            @click="updateForbid(0)"
          >
            <Mute />
          </el-icon>
          <el-icon
            v-if="isTeacher && speechClose == 0"
            aria-label="解除禁言"
            @click="updateForbid(1)"
          >
            <Bell />
          </el-icon>
        </div>
      </el-tooltip>
      <el-tooltip
        class="item"
        effect="dark"
        :content="
          isInteraction == 0
            ? '举手发言'
            : isInteraction == 1
              ? '等待同意...'
              : isInteraction == 2
                ? '发言中...'
                : isInteraction == 3
                  ? '禁止发言'
                  : ''
        "
        placement="top"
      >
        <div v-if="!isTeacher" class="hand" :class="isInteraction == 3 ? 'allowed' : ''">
          <el-icon v-if="btn && isInteraction === 0" aria-label="举手发言" @click="apply(true, 3)">
            <RaiseHand />
          </el-icon>
          <el-icon v-if="btn && isInteraction === 1" aria-label="取消举手" @click="apply(false, 6)">
            <ArrowUpBold />
          </el-icon>
          <el-icon v-if="btn && isInteraction === 2" aria-label="退出发言">
            <ArrowUpBold />
          </el-icon>
          <el-icon v-if="btn && isInteraction === 3" aria-label="禁止举手">
            <RaiseHand />
          </el-icon>
        </div>
      </el-tooltip>
      <EmojiPicker @select="insertEmoji" />
      <el-mention
        ref="mentionRef"
        v-model="sendContent"
        :options="mentionOptions"
        :maxlength="CHAT_LIMITS.MAX_MESSAGE_LENGTH"
        :disabled="isTeacher ? false : speechClose == 1 ? false : true"
        placeholder="请输入内容"
        @select="onMentionSelect"
        @keydown.enter.exact="onEnter"
      />
      <el-icon
        v-if="sendContent.length"
        class="send"
        color="#61ba47"
        aria-label="发送"
        @click="sendMes(1)"
      >
        <Promotion />
      </el-icon>
      <el-icon v-else class="send" aria-label="发送">
        <Promotion />
      </el-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onUnmounted, onUpdated, ref } from 'vue';
import { ElMessage, type MentionInstance } from 'element-plus';
import { Top as RaiseHand } from '@element-plus/icons-vue';
import { ChatMessageItem, WsClose, type MentionTarget } from '@yunyan-live/types';
import api from '@/api';
import { config } from '@/api';
import { useUserStore } from '@/store/user';
import { useAsyncAction } from '@/composables/useAsyncAction';
import { useChatInput } from '@/composables/useChatInput';
import EmojiPicker from './EmojiPicker.vue';
import {
  CHAT_LIMITS,
  extractMentions,
  formatChatTime,
  segmentMessage,
  type MessageSegment
} from '@/utils/chatFormat';

type DisplayMessage = ChatMessageItem & {
  segments: MessageSegment[];
  mentionMe: boolean;
  showTime: boolean;
};

/** Redis 禁言极性：0=禁言 1=可发言（与服务端 FORBID_FORBIDDEN/FORBID_ALLOWED 一致） */
const FORBID_FORBIDDEN = 0;
/** 分组时间间隔：超过该间隔的新消息重新显示时间 */
const TIME_GAP_MS = 5 * 60 * 1000;

const props = withDefaults(
  defineProps<{
    liveUserId?: string;
    roomId?: string;
    userName?: string;
    isTeacher?: boolean;
    isInteraction?: number;
    btn?: boolean;
    useToken?: boolean;
  }>(),
  {
    liveUserId: '',
    roomId: '',
    userName: '',
    isTeacher: false,
    isInteraction: 0,
    btn: false,
    useToken: true
  }
);

const emit = defineEmits<{
  (e: 'apply', status: boolean, num: number): void;
  (e: 'sendTime', time: number): void;
  (e: 'getWhiteBoard', data: unknown): void;
  (e: 'updateNum', status: boolean, num: number, type: string): void;
  (e: 'liveStarted'): void;
}>();

let connectNum = 0;
const isBottom = ref(true);
const noSpeakMessageNum = ref(0);
let lockReconnect = false;
let time = 0;
let sessionClosed = false;
const speechClose = ref(1);
const sockets = ref<{
  liveSocket: WebSocket | null;
  socketUrl: string;
  socketHeartTime: number;
  socketUpdateTime: number;
  liveSocketTimer: ReturnType<typeof setInterval> | null;
  updateTimer: ReturnType<typeof setInterval> | null;
  startTime: number;
  endTime: number;
}>({
  liveSocket: null,
  socketUrl: `${config.messageWs}`,
  socketHeartTime: 4000,
  socketUpdateTime: 30000,
  liveSocketTimer: null,
  updateTimer: null,
  startTime: 0,
  endTime: 0
});
const sendContent = ref('');
const tanmuMessage = ref<DisplayMessage[]>([]);
const dialogueList = ref<HTMLElement | null>(null);
const mentionRef = ref<MentionInstance | null>(null);
const { mentionTargets, mentionOptions, onMentionSelect, insertEmoji, onEnter } = useChatInput({
  sendContent,
  mentionRef,
  isTeacher: () => props.isTeacher,
  onEnterSend: () => void sendMes(1)
});

function fetchData(e: Event) {
  const target = e.target as HTMLElement;
  const scrollTop = Math.floor(target.scrollTop);
  const clientHeight = Math.floor(target.clientHeight);
  const scrollHeight = Math.floor(target.scrollHeight);
  if (scrollHeight > clientHeight && scrollTop + clientHeight === scrollHeight) {
    updateBottom();
  } else {
    isBottom.value = false;
  }
}

function updateBottom() {
  isBottom.value = true;
  noSpeakMessageNum.value = 0;
}

function setNum() {
  if (isBottom.value) return;
  noSpeakMessageNum.value += 1;
}

onUpdated(handleScrollToBottom);

function handleScrollToBottom() {
  if (!isBottom.value) return;
  const ele = dialogueList.value;
  if (ele) ele.scrollTop = ele.scrollHeight;
}

onUnmounted(() => {
  stopReconnect();
  clearLiveSocket();
});

function apply(status: boolean, num: number) {
  emit('apply', status, num);
}

const { run: updateForbid } = useAsyncAction(
  async (status: number) => {
    const data = {
      roomId: props.roomId ?? '',
      liveUserId: props.liveUserId ?? '',
      status
    };
    await api.updateForbid(data);
    speechClose.value = status;
  },
  { onError: e => console.error(e) }
);

function createTutorSocket() {
  if (sessionClosed) {
    stopReconnect();
    return;
  }
  const token = props.useToken ? localStorage.getItem('token') || '' : '';
  const tokenParam = token ? `&token=${token}` : '';
  const nickParam = `&nickName=${encodeURIComponent(props.userName ?? '')}`;
  const url = `${sockets.value.socketUrl}?roomId=${props.roomId ?? ''}&liveUserId=${props.liveUserId ?? ''}${tokenParam}${nickParam}`;
  sockets.value.liveSocket = new WebSocket(url);
  sockets.value.liveSocket.onopen = liveSocketOpen;
  sockets.value.liveSocket.onerror = liveSocketError;
  sockets.value.liveSocket.onmessage = liveSocketMessage;
  sockets.value.liveSocket.onclose = liveSocketClose;
}

function liveSocketOpen() {
  if (connectNum === 0) {
    const dataWhiteBoard = `{
                "type": "getwhiteBoard",
                "data": {
                    "liveMsg": {
                      "roomId":"${props.roomId}"
                    }
                }
            }`;
    setSocketSend(dataWhiteBoard);
  }
  connectNum++;
  liveHeartCheckFun();
  socketUpdateFun();
  lockReconnect = true;
  console.log('聊天网络连接成功');
  if (time > 0) {
    clearInterval(time);
    time = 0;
  }
}

function liveSocketError(e: Event) {
  clearLiveSocket();
  console.error('聊天网络连接错误', e);
}

function getTime() {
  const t = Math.floor((sockets.value.endTime - sockets.value.startTime) / 2);
  sendTime(t);
  sockets.value.startTime = 0;
  sockets.value.endTime = 0;
}

function sendTime(time: number) {
  emit('sendTime', time);
}

function getWhiteBoard(data: unknown) {
  emit('getWhiteBoard', data);
}

function liveSocketMessage(e: MessageEvent) {
  const redata = JSON.parse(e.data);
  switch (redata.type) {
    case 'pong':
      sockets.value.endTime = new Date().getTime();
      getTime();
      break;
    case 'updateForbid':
      speechClose.value = Number(redata.status);
      break;
    case 'bullet':
      if (redata.data && redata.data.liveMsg) {
        infoList(redata.data);
      }
      break;
    case 'msg': {
      // 连接期/轮询下发的房间禁言态（0=禁言 1=可发言）：修复中途进场学生假可输入
      const forbid = redata.data?.liveMsg?.forbid;
      if (forbid !== undefined) speechClose.value = Number(forbid);
      break;
    }
    case 'bullet_rejected':
      if (redata.reason === 'forbidden') ElMessage.warning('当前处于禁言状态，无法发言');
      else if (redata.reason === 'too_long')
        ElMessage.warning(`消息超过${CHAT_LIMITS.MAX_MESSAGE_LENGTH}字`);
      else ElMessage.error('消息发送失败');
      break;
    case 'error':
      if (redata.data.cause && redata.data.cause === '被占用') {
        ElMessage.error('聊天通道被占用');
        console.error(redata.data.cause);
        return;
      }
      reconnect();
      break;
    case 'getWhiteBoard':
      if (redata) {
        console.log('getwhiteboard redata', redata);
        if (
          redata.data !== null &&
          redata.data !== undefined &&
          redata.data.liveMsg !== undefined
        ) {
          const stageData = redata.data.liveMsg.msg;
          getWhiteBoard(stageData);
        }
      }
      break;
    case 'live_started':
      emit('liveStarted');
      break;
    default:
      break;
  }
}

function liveSocketClose(e?: Event) {
  clearLiveSocket();
  const code = e instanceof CloseEvent ? e.code : 0;
  if (code === WsClose.SESSION_KICKED) {
    sessionClosed = true;
    stopReconnect();
    useUserStore().sessionInterrupted('kicked');
    return;
  }
  if (code === WsClose.UNAUTHORIZED && localStorage.getItem('token')) {
    sessionClosed = true;
    stopReconnect();
    useUserStore().sessionInterrupted('expired');
    return;
  }
  console.error('聊天网络已断开...', e);
}

function stopReconnect() {
  if (time > 0) {
    clearInterval(time);
    time = 0;
  }
}

function reconnect() {
  if (sessionClosed) return;
  if (props.useToken && !localStorage.getItem('token')) return;
  if (lockReconnect) return;
  lockReconnect = true;
  time = setInterval(function () {
    if (props.useToken && !localStorage.getItem('token')) {
      stopReconnect();
      return;
    }
    createTutorSocket();
  }, 4000);
}

function infoList(data: {
  liveMsg?: {
    info?: { host?: string };
    msg?: string;
    name?: string;
    time?: number;
    mentions?: MentionTarget[];
  };
  info?: { liveUserId?: string; isTeacher?: boolean };
}) {
  const { liveMsg } = data;
  if (liveMsg && liveMsg.info && liveMsg.info.host) {
    return;
  }
  const msg = liveMsg?.msg ?? '';
  const mentions = Array.isArray(liveMsg?.mentions) ? liveMsg.mentions : [];
  const isMe = data.info?.liveUserId === props.liveUserId;
  // 渲染/徽标事实源 = 载荷 mentions（与成员名单解耦，离线成员同样高亮）
  const mentionMe =
    !isMe && mentions.some(m => m.userId === props.liveUserId || m.userId === 'all');
  const len = tanmuMessage.value.length;
  const prev = len > 0 ? tanmuMessage.value[len - 1] : undefined;
  const liveUser = !!prev && data.info?.liveUserId == prev.liveUserId;
  const time = typeof liveMsg?.time === 'number' ? liveMsg.time : Date.now();
  const showTime = !prev || !liveUser || time - (prev.time ?? 0) > TIME_GAP_MS;
  tanmuMessage.value.push({
    userName: liveMsg?.name,
    message: msg,
    isMe,
    isTeacher: data.info?.isTeacher,
    liveUserId: data.info?.liveUserId,
    liveUser,
    time,
    mentions: mentions.length ? mentions : undefined,
    segments: segmentMessage(msg, mentions),
    mentionMe,
    showTime
  });
  updateNum(true, 1, 'chat');
  if (mentionMe) emit('updateNum', true, 1, 'chat-mention');
}

function updateNum(status: boolean, num: number, type: string) {
  emit('updateNum', status, num, type);
  setNum();
}

function setSocketSend(data: string) {
  const { liveSocket } = sockets.value;
  if (liveSocket) {
    liveSocket.send(data);
  }
}

function liveHeartCheckFun() {
  const data = `{"type": "ping","data": {}}`;
  sockets.value.liveSocketTimer = setInterval(function () {
    const { liveSocket } = sockets.value;
    if (liveSocket) {
      sockets.value.startTime = new Date().getTime();
      liveSocket.send(data);
    }
    peopleNum();
  }, sockets.value.socketHeartTime);
}

function socketUpdateFun() {
  sockets.value.updateTimer = setInterval(function () {
    const { liveSocket } = sockets.value;
    if (liveSocket) {
      const data = `{
                "type": "update",
                "data": {
                    "liveMsg": {
                        "liveUserId":"${props.liveUserId}",
                        "roomId":"${props.roomId}"
                    }
                }
            }`;
      liveSocket.send(data);
    }
  }, sockets.value.socketUpdateTime);
}

function clearLiveSocket() {
  const { liveSocketTimer, liveSocket, updateTimer } = sockets.value;
  // Detach before close() so the resulting onclose callback cannot re-enter.
  sockets.value.liveSocket = null;
  if (liveSocket) {
    liveSocket.close();
    lockReconnect = false;
  }
  if (liveSocketTimer) clearInterval(liveSocketTimer);
  if (updateTimer) clearInterval(updateTimer);
}

function peopleNum() {
  const { liveSocket } = sockets.value;
  const data = `{"type": "msg" , "data": {"liveMsg": {"roomId":"${props.roomId}"}}}`;
  if (liveSocket && liveSocket.send) {
    liveSocket.send(data);
  }
}

async function sendMes(type: number) {
  if (!lockReconnect) {
    ElMessage.error('聊天网络异常，发送失败！');
    return;
  }
  if (!props.isTeacher && speechClose.value === FORBID_FORBIDDEN) {
    ElMessage.warning('当前处于禁言状态，无法发言');
    return;
  }
  if (!sendContent.value) {
    ElMessage.warning('消息不能为空！');
    return;
  }
  let content = sendContent.value;
  if (content.length > CHAT_LIMITS.MAX_MESSAGE_LENGTH) {
    ElMessage.warning(
      `消息超长（${content.length}字），已截断至${CHAT_LIMITS.MAX_MESSAGE_LENGTH}字`
    );
    content = content.slice(0, CHAT_LIMITS.MAX_MESSAGE_LENGTH);
  }
  const mentions = extractMentions(content, mentionTargets.value);
  const mess = {
    type: 'bullet',
    data: {
      liveMsg: {
        msg: content,
        roomId: props.roomId,
        name: props.userName,
        ...(mentions.length ? { mentions } : {})
      },
      info: {
        type,
        isTeacher: props.isTeacher,
        liveUserId: props.liveUserId
      }
    }
  };
  setSocketSend(JSON.stringify(mess));
  updateBottom();
  sendContent.value = '';
}

defineExpose({ createTutorSocket, liveSocketClose, setSocketSend, sendMes });
</script>

<style lang="less" scoped>
.flex() {
  display: flex;
  align-items: center;
}
.chats1 {
  height: calc(100% - 32px);
}
.chats2 {
  height: 100%;
}
.classroom-chat {
  .con {
    height: calc(100% - 44px);
    ul {
      overflow-x: hidden;
      overflow-y: auto;
      height: 100%;
      padding: 0;
      padding-inline-start: 0px !important;
      margin-block-start: 0px !important;
      margin-block-end: 0px !important;
      li {
        list-style-type: none;
        font-size: 14px;
        color: #323232;
        margin-top: 4px;
        padding: 0px 12px;
        .msg-time {
          text-align: center;
          color: #9ca3af;
          font-size: 12px;
          margin: 6px 0 2px;
        }
        .mention {
          color: #1989fa;
          font-weight: 600;
        }
        .mention-me {
          background: #fff2cc;
        }
        .message-me .mention {
          color: #fff7b1;
        }
        .end {
          justify-content: flex-end;
        }
        .user {
          height: 18px;
          line-height: 18px;
          font-size: 12px;
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          .name {
            font-weight: bold;
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
        }
        .message {
          background: #ebebf0;
          border-radius: 0px 6px 6px 6px;
          line-height: 36px;
          width: fit-content;
          padding-left: 10px;
          padding-right: 5px;
          word-break: break-all;
        }
        .message-me {
          margin-left: auto;
          background: #61ba47;
          border-radius: 6px 0px 6px 6px;
          color: #ffffff;
        }
      }
    }
  }
  .tool {
    height: 44px;
    background: #efeff4;
    .flex();
    .el-mention {
      flex: 1;
      min-width: 0;
    }
    .hand {
      cursor: pointer;
    }
    .allowed {
      cursor: not-allowed;
    }
    .el-icon {
      font-size: 18px;
      width: 32px;
      height: 32px;
      margin: 0 6px;
      vertical-align: middle;
      cursor: pointer;
      &:hover {
        background: #e2e2e7;
        border-radius: 6px;
      }
    }
  }
}
</style>
<style lang="less">
.classroom-chat {
  .el-input__inner {
    height: 32px;
    line-height: 32px;
  }
}
</style>
