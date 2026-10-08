<template>
  <div
    class="classroom-video"
    :class="{ floating: isFloating }"
    :style="
      isFloating
        ? {
            left: posX + 'px',
            top: posY + 'px',
            width: floatingWidth + 'px',
            height: floatingHeight + 'px'
          }
        : {}
    "
    @mousedown="isFloating && onDragStart($event)"
  >
    <div class="bottom">
      <span>{{ teacherName }}</span>
      <div class="imgs">
        <el-tooltip
          class="item"
          effect="dark"
          :content="cameraType ? '关闭摄像头' : '打开摄像头'"
          placement="bottom-end"
        >
          <el-icon
            v-if="cameraType && isTeacher && liveType == 'hires'"
            aria-label="摄像头"
            @click.stop="setCamera(false)"
          >
            <VideoCameraFilled />
          </el-icon>

          <el-icon
            v-if="!cameraType && isTeacher && liveType == 'hires'"
            class="is-off"
            aria-label="摄像头"
            @click.stop="setCamera(true)"
          >
            <VideoCamera />
          </el-icon>
        </el-tooltip>
        <el-tooltip
          class="item"
          effect="dark"
          :content="microphoneType ? '关闭麦克风' : '打开麦克风'"
          placement="bottom-end"
        >
          <el-icon
            v-if="microphoneType && isTeacher && liveType == 'hires'"
            aria-label="麦克风"
            @click.stop="setMicrophone(false)"
          >
            <Microphone />
          </el-icon>
          <el-icon
            v-if="!microphoneType && isTeacher && liveType == 'hires'"
            class="is-off"
            aria-label="麦克风"
            @click.stop="setMicrophone(true)"
          >
            <Mic />
          </el-icon>
        </el-tooltip>
        <el-tooltip
          v-if="!isTeacher"
          class="item"
          effect="dark"
          content="全屏观看"
          placement="bottom-end"
        >
          <el-icon aria-label="全屏" @click.stop="pall">
            <FullScreen />
          </el-icon>
        </el-tooltip>
      </div>
    </div>
    <VideoPlayer ref="videoPlayer" :is-muted="isTeacher" />
    <div v-if="!isTeacher && !remoteCameraOn" class="camera-off-overlay">
      <div v-if="remoteMicOn" class="overlay-content">
        <el-icon class="is-off" aria-label="摄像头">
          <VideoCamera />
        </el-icon>
        <span>摄像头未开启</span>
      </div>
    </div>
    <audio
      v-show="false"
      ref="audioEl"
      class="rounded centered"
      width="100%"
      height="100%"
      controls
      autoplay
    />
    <el-dialog
      v-model="shareDig"
      title="选择共享窗口"
      width="min(861px, 90vw)"
      center
      top="0vh"
      class="dia-shares"
      @close="closeDig()"
    >
      <div class="shares">
        <div class="over">
          <div class="share">
            <div
              v-for="(item, index) in sources"
              :key="index"
              class="share-con"
              @click="setDig(index)"
            >
              <div
                class="share-player"
                :class="index === sourcesNum ? 'share-select' : 'share-default'"
              >
                <img :src="item.thumbnailDataUrl" />
              </div>
              <div class="share-name" :class="index === sourcesNum ? 'share-select-name' : ''">
                {{ item.name }}
              </div>
            </div>
          </div>
        </div>

        <div class="share-bottom">
          <el-button class="share-cancl" @click="closeDig()"> 取消 </el-button>
          <el-button class="share-share" @click="goShare()"> 共享 </el-button>
        </div>
      </div>
    </el-dialog>
    <template v-if="isFloating">
      <div
        class="resize-handle resize-n"
        :style="{
          position: 'fixed',
          left: posX + 'px',
          top: posY + 'px',
          width: floatingWidth + 'px',
          height: '10px'
        }"
        @mousedown.stop="onResizeStart($event, false, false, true, false)"
      />
      <div
        class="resize-handle resize-s"
        :style="{
          position: 'fixed',
          left: posX + 'px',
          top: posY + floatingHeight - 10 + 'px',
          width: floatingWidth + 'px',
          height: '10px'
        }"
        @mousedown.stop="onResizeStart($event, false, false, false, true)"
      />
      <div
        class="resize-handle resize-e"
        :style="{
          position: 'fixed',
          left: posX + floatingWidth - 10 + 'px',
          top: posY + 'px',
          width: '10px',
          height: floatingHeight + 'px'
        }"
        @mousedown.stop="onResizeStart($event, false, true, false, false)"
      />
      <div
        class="resize-handle resize-w"
        :style="{
          position: 'fixed',
          left: posX + 'px',
          top: posY + 'px',
          width: '10px',
          height: floatingHeight + 'px'
        }"
        @mousedown.stop="onResizeStart($event, true, false, false, false)"
      />
      <div
        class="resize-handle resize-ne"
        :style="{
          position: 'fixed',
          left: posX + floatingWidth - 16 + 'px',
          top: posY + 'px',
          width: '16px',
          height: '16px'
        }"
        @mousedown.stop="onResizeStart($event, false, true, true, false)"
      />
      <div
        class="resize-handle resize-nw"
        :style="{
          position: 'fixed',
          left: posX + 'px',
          top: posY + 'px',
          width: '16px',
          height: '16px'
        }"
        @mousedown.stop="onResizeStart($event, true, false, true, false)"
      />
      <div
        class="resize-handle resize-se"
        :style="{
          position: 'fixed',
          left: posX + floatingWidth - 16 + 'px',
          top: posY + floatingHeight - 16 + 'px',
          width: '16px',
          height: '16px'
        }"
        @mousedown.stop="onResizeStart($event, false, true, false, true)"
      />
      <div
        class="resize-handle resize-sw"
        :style="{
          position: 'fixed',
          left: posX + 'px',
          top: posY + floatingHeight - 16 + 'px',
          width: '16px',
          height: '16px'
        }"
        @mousedown.stop="onResizeStart($event, true, false, false, true)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { DesktopSource } from '@yunyan-live/ipc';
import { frameThrottle, randomString } from '@yunyan-live/utils';
import '@/vendor/live/adapter/adapter.min';
import Live from '@/vendor/live/live';
import type { JanusHandle, JanusSession } from '@/vendor/live/live';
import api from '@/api';
import { config } from '@/api';
import { useServerTime } from '@/composables/useServerTime';
import VideoPlayer from '@/components/ClassRoom/VideoPlayer.vue';

const props = withDefaults(
  defineProps<{
    opaqueId?: string;
    roomId?: string;
    isTeacher?: boolean;
    userName?: string;
    isInteraction?: number;
    roomInfo?: { status?: number } & Record<string, unknown>;
    isSmall?: boolean;
    embed?: boolean;
    roomTitle?: string;
    teacherName?: string;
  }>(),
  {
    opaqueId: '',
    roomId: '',
    isTeacher: false,
    userName: '',
    isInteraction: 0,
    roomInfo: () => ({}),
    isSmall: true,
    embed: false,
    roomTitle: '',
    teacherName: ''
  }
);

const emit = defineEmits<{
  (e: 'popleNum', num: number): void;
  (e: 'updatePopleList', poples: unknown): void;
  (e: 'onLookLive', status: boolean, type: string, liveTimeLen: number): void;
  (e: 'onOpenLive', status: boolean, liveType: string, liveTimeLen: number): void;
  (e: 'setDiaBla', status: boolean): void;
  (e: 'setLiveType', liveType: string): void;
  (e: 'setRecord', status: boolean): void;
  (e: 'setAudioAll', user: string[]): void;
  (e: 'setTime', type: string): void;
  (e: 'pall'): void;
  (e: 'videoList', status: boolean, data: unknown): void;
  (e: 'applyList', status: boolean, data: unknown): void;
  (e: 'application', num: number, message: string): void;
  (e: 'setCameraType', status: boolean): void;
  (e: 'studentMediaStream', stream: MediaStream, display: string[], id: string): void;
  (e: 'delUserList', leaving: unknown): void;
  (e: 'roomCreated'): void;
  (e: 'participantJoin', name: string): void;
  (e: 'participantLeave', name: string): void;
  (e: 'broadcastStart'): void;
  (e: 'broadcastStop', type?: string): void;
  (e: 'selfJoined', id: string, display: string): void;
}>();

const router = useRouter();

const isFloating = ref(!props.embed);
const isDragging = ref(false);
const posX = ref(window.innerWidth - 280);
const posY = ref(60);
const floatingWidth = ref(280);
const floatingHeight = ref(158);
const dragOffsetX = ref(0);
const dragOffsetY = ref(0);

const RATIO = 280 / 158;
const RESIZE_MIN_W = 280;
const RESIZE_MAX_W = 840;
const isResizing = ref(false);
const resizeDir = { left: false, right: false, top: false, bottom: false };
const resizeStartX = ref(0);
const resizeStartY = ref(0);
const resizeStartW = ref(0);
const resizeStartH = ref(0);
const resizeStartPosX = ref(0);
const resizeStartPosY = ref(0);

function onDragStart(e: MouseEvent) {
  isDragging.value = true;
  dragOffsetX.value = e.clientX - posX.value;
  dragOffsetY.value = e.clientY - posY.value;
  document.addEventListener('mousemove', throttledDragMove);
  document.addEventListener('mouseup', onDragEnd);
  e.preventDefault();
}

function onDragMove(e: MouseEvent) {
  if (!isDragging.value) return;
  posX.value = Math.max(
    0,
    Math.min(window.innerWidth - floatingWidth.value, e.clientX - dragOffsetX.value)
  );
  posY.value = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffsetY.value));
}

function onDragEnd() {
  throttledDragMove.flush();
  isDragging.value = false;
  document.removeEventListener('mousemove', throttledDragMove);
  document.removeEventListener('mouseup', onDragEnd);
}

function onResizeStart(
  e: MouseEvent,
  left: boolean,
  right: boolean,
  top: boolean,
  bottom: boolean
) {
  isResizing.value = true;
  resizeDir.left = left;
  resizeDir.right = right;
  resizeDir.top = top;
  resizeDir.bottom = bottom;
  resizeStartX.value = e.clientX;
  resizeStartY.value = e.clientY;
  resizeStartW.value = floatingWidth.value;
  resizeStartH.value = floatingHeight.value;
  resizeStartPosX.value = posX.value;
  resizeStartPosY.value = posY.value;
  document.addEventListener('mousemove', throttledResizeMove);
  document.addEventListener('mouseup', onResizeEnd);
  e.preventDefault();
  e.stopPropagation();
}

function onResizeMove(e: MouseEvent) {
  if (!isResizing.value) return;
  const dx = e.clientX - resizeStartX.value;
  const dy = e.clientY - resizeStartY.value;
  let newW = resizeStartW.value;
  let newH = resizeStartH.value;

  if (resizeDir.right) {
    newW = Math.min(RESIZE_MAX_W, Math.max(RESIZE_MIN_W, resizeStartW.value + dx));
    newH = newW / RATIO;
  } else if (resizeDir.left) {
    newW = Math.min(RESIZE_MAX_W, Math.max(RESIZE_MIN_W, resizeStartW.value - dx));
    newH = newW / RATIO;
    posX.value = Math.max(
      0,
      Math.min(window.innerWidth - newW, resizeStartPosX.value + resizeStartW.value - newW)
    );
  } else if (resizeDir.bottom) {
    newH = Math.min(RESIZE_MAX_W / RATIO, Math.max(RESIZE_MIN_W / RATIO, resizeStartH.value + dy));
    newW = newH * RATIO;
  } else if (resizeDir.top) {
    newH = Math.min(RESIZE_MAX_W / RATIO, Math.max(RESIZE_MIN_W / RATIO, resizeStartH.value - dy));
    newW = newH * RATIO;
    posY.value = Math.max(
      0,
      Math.min(window.innerHeight - 40, resizeStartPosY.value + resizeStartH.value - newH)
    );
  }

  floatingWidth.value = newW;
  floatingHeight.value = newH;
}

function onResizeEnd() {
  throttledResizeMove.flush();
  isResizing.value = false;
  document.removeEventListener('mousemove', throttledResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
}

function onWindowResize() {
  if (!isFloating.value) return;
  posX.value = Math.max(0, Math.min(window.innerWidth - floatingWidth.value, posX.value));
  posY.value = Math.max(0, Math.min(window.innerHeight - 40, posY.value));
}

const throttledDragMove = frameThrottle(onDragMove);
const throttledResizeMove = frameThrottle(onResizeMove);
const throttledWindowResize = frameThrottle(onWindowResize);

onMounted(() => {
  window.addEventListener('resize', throttledWindowResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', throttledWindowResize);
  throttledWindowResize.cancel();
});

const setAudioType = ref({ type: false, display: '' });
const sourcesNum = ref(-1);
const sources = ref<DesktopSource[]>([]);
const shareDig = ref(false);
const recordingId = ref('');
const room = ref<JanusSession | null>(null);
const plugin = ref<JanusHandle | null>(null);
const recordPlay = ref<JanusHandle | null>(null);
const webrtcPlugin = ref<JanusHandle | null>(null);
const privateId = ref('');
const liveType = ref('');
const type = ref('');
const num = ref(0);
const participantDisplays = new Map<string, string>();
const participantNames = new Map<string, string>();
const recentlyNotified = new Set<string>();
const previousParticipantIds = new Set<string>();
let firstListparticipantsDone = false;
let listparticipantsTimer: ReturnType<typeof setInterval> | null = null;
let endLiveTimer: ReturnType<typeof setTimeout> | null = null;
let isBroadcastActive = false;
const cameraType = ref(true);
const microphoneType = ref(false);
const isCameraType = ref(props.isTeacher);
const isSelfTalking = ref(false);
const remoteCameraOn = ref(true);
const remoteMicOn = ref(true);
const recordTimeLen = ref(0);
const open = ref(false);
const teacher = ref({ id: '', display: '' });
const liveUser = ref({ id: '', display: '' });
const audio = ref({ id: '', display: '' });
const teacherNameText = ref('');
const display = ref('');
const videoPlayer = ref<InstanceType<typeof VideoPlayer>>();
const audioEl = ref<HTMLAudioElement | null>(null);

function onOpaqueId() {
  display.value = props.isTeacher
    ? `T#${props.opaqueId}#${props.userName}#off`
    : `S#${props.opaqueId}#${props.userName}#off`;
}

watch([() => props.opaqueId, () => props.userName], onOpaqueId, { immediate: true });

watch(display, val => {
  if (liveUser.value.id && val) {
    participantDisplays.set(liveUser.value.id, val);
  }
});

async function apply(_status: boolean, num: number, displayParam: string = '') {
  const user = await getDisplay(displayParam == '' ? teacher.value.display : displayParam);
  sendData(
    'private',
    JSON.stringify({
      type: num,
      data: display.value
    }),
    user[1] ?? ''
  );
}

function endClassSpeakAll(liveTimeLen: number, status: 'end' | 'stop' = 'end') {
  sendData(
    'private',
    JSON.stringify({
      type: 9,
      data: {
        type: status,
        liveTimeLen
      }
    })
  );
}

async function fromMessage(json: { from?: string; text: string }) {
  if (json['from'] != props.opaqueId) {
    const obj = JSON.parse(json.text) as {
      type: number;
      data: { type?: string; liveTimeLen?: number } & string;
    };
    if (obj.type === 1) {
      void stopApplication();
    } else if (obj.type === 2) {
      isTalking(obj.data as string, 'ST');
    } else if (obj.type === 3) {
      const data = await getDisplay(obj.data as string);
      applyList(true, {
        userName: data[2],
        display: obj.data,
        opaqueId: data[1],
        type: data[0],
        status: data[3]
      });
    } else if (obj.type === 4) {
      application(2, '老师同意了您的举手请求');
      isTalking('on', 'ST', true);
    } else if (obj.type === 5) {
      application(0, '老师拒绝了您的举手请求');
    } else if (obj.type === 6) {
      const data = await getDisplay(obj.data as string);
      applyList(false, {
        userName: data[2],
        display: obj.data,
        opaqueId: data[1],
        type: data[0],
        status: data[3]
      });
    } else if (obj.type === 7) {
      videoList(true, obj.data);
    } else if (obj.type === 8) {
      videoList(false, obj.data);
    } else if (obj.type === 9) {
      isBroadcastActive = false;
      clearVideoStream();
      emit('broadcastStop', (obj.data as { type?: string }).type ?? 'end');
      onLookLive(
        false,
        (obj.data as { type: string }).type,
        (obj.data as { liveTimeLen: number }).liveTimeLen
      );
    }
  }
}

function joinText() {
  const data = {
    textroom: 'join',
    transaction: randomString(8),
    room: parseInt(props.roomId as string),
    username: props.opaqueId,
    display: display.value
  };
  webrtcPluginData(data);
}

function sendData(
  whisper: string = 'public',
  data: unknown,
  to: string = '',
  from: string = '',
  tos: string[] = [],
  date: string = '',
  ack: boolean = false
) {
  const message: Record<string, unknown> = {
    textroom: 'message',
    transaction: randomString(8),
    room: parseInt(props.roomId as string),
    text: data,
    ack
  };
  if (from !== '') message.from = from;
  if (to !== '') message.to = to;
  if (tos.length > 0) message.tos = tos;
  if (date !== '') message.date = date;
  if (whisper === 'private') message.whisper = false;
  webrtcPluginData(message);
}

function webrtcPluginData(message: unknown) {
  webrtcPlugin.value?.data({
    text: JSON.stringify(message),
    error: function (reason: unknown) {
      console.error(reason);
    },
    success: function () {}
  });
}

function listparticipants() {
  const data = {
    request: 'listparticipants',
    room: parseInt(props.roomId as string)
  };
  pluginSend(data);
}

watch(num, () => {
  popleNum(num.value);
  listparticipants();
});

function popleNum(num: number) {
  emit('popleNum', num);
}

function startListparticipantsPoll() {
  if (listparticipantsTimer) clearInterval(listparticipantsTimer);
  listparticipantsTimer = setInterval(() => {
    if (liveUser.value.id) listparticipants();
  }, 5000);
}

function emitJoin(name: string, id: string) {
  if (recentlyNotified.has(id)) return;
  recentlyNotified.add(id);
  setTimeout(() => recentlyNotified.delete(id), 2000);
  emit('participantJoin', name);
}

function updatePopleList(poples: unknown) {
  emit('updatePopleList', poples);
}

function delList(id: string, index: number) {
  sendData(
    'public',
    JSON.stringify({
      type: 8,
      data: {
        id,
        index
      }
    })
  );
}

function onLookLive(status: boolean, type: string, liveTimeLen: number) {
  open.value = status;
  emit('onLookLive', status, type, liveTimeLen);
}

function onOpenLive(status: boolean, liveType: string, liveTimeLen: number) {
  open.value = status;
  if (
    status &&
    type.value === 'open' &&
    (props.roomInfo?.status === 1 || props.roomInfo?.status === 3 || props.roomInfo?.status === 4)
  )
    void changeLiveStatus(2);
  if (!status && type.value === 'close') void changeLiveStatus(3);
  emit('onOpenLive', status, liveType, liveTimeLen);
}

function lookLive(status: boolean) {
  if (!status) {
    if (endLiveTimer) {
      clearTimeout(endLiveTimer);
      endLiveTimer = null;
    }
    recentlyNotified.delete('bstop_' + String(teacher.value.id));
    recentlyNotified.delete('pleave_' + String(teacher.value.id));
    endLive();
  }
}

function endLive() {
  if (listparticipantsTimer) {
    clearInterval(listparticipantsTimer);
    listparticipantsTimer = null;
  }
  const data = {
    request: 'leave',
    room: parseInt(props.roomId as string)
  };
  pluginSend(data);
  if (!endLiveTimer) {
    endLiveTimer = setTimeout(() => {
      endLiveTimer = null;
      if (plugin.value) plugin.value.detach();
      room.value?.destroy();
      onLookLive(false, '', 0);
    }, 3000);
  }
}

async function getSources() {
  if (!window.electronAPI) {
    ElMessage.warning('屏幕共享需在桌面客户端中使用');
    return;
  }
  const sourceList = await window.electronAPI.getSources();
  const list = sourceList.filter(item => !item.name.includes('云砚直播'));
  sources.value = list;
  shareDig.value = true;
}

function closeDig() {
  sourcesNum.value = -1;
  shareDig.value = false;
  setDiaBla(false);
}

function setDiaBla(status: boolean) {
  emit('setDiaBla', status);
}

function goShare() {
  if (sourcesNum.value === -1) {
    ElMessage.error('未选择共享窗口');
    return;
  }
  switchSource();
  setLiveType('screen');
}

function setLiveType(liveType: string) {
  emit('setLiveType', liveType);
}

function setDig(index: number) {
  sourcesNum.value = index;
}

function openLive(_status: boolean, liveTypeParam: string, typeParam: string, liveTimeLen: number) {
  liveType.value = liveTypeParam;
  type.value = typeParam;
  if (typeParam == 'open') {
    openMyLive();
  } else if (typeParam === 'update') {
    if (liveTypeParam === 'screen') {
      void getSources();
    } else if (liveTypeParam === 'hires') {
      switchSource();
    }
  } else if (typeParam === 'stop') {
    stopLocalTracks();
    clearVideoStream();
    endClassSpeakAll(0, 'stop');
    stopLive(true);
    cameraType.value = true;
    microphoneType.value = false;
    onOpenLive(false, '', 0);
  } else if (typeParam === 'close') {
    close(liveTimeLen);
  }
}

function close(liveTimeLen: number) {
  endClassSpeakAll(liveTimeLen);
  onOpenLive(false, '', liveTimeLen);
  liveType.value = '';
  cameraType.value = true;
  microphoneType.value = false;
  void stopApplicationTxt();
  stopLive(true, false);
}

function pluginSend(data: Record<string, unknown>, jsep: unknown = null) {
  plugin.value?.send({
    message: data,
    ...(jsep !== null ? { jsep } : {}),
    success: (result: Record<string, unknown>) => {
      if (data.request === 'exists') {
        const exists = (result as { exists?: boolean }).exists;
        if (!exists) {
          if (props.isTeacher) {
            createRoom();
          } else {
            if (props.roomInfo?.status === 3) {
              const startMs = new Date(props.roomInfo.startTime as string).getTime();
              const endMs = startMs + ((props.roomInfo.duration as number) || 60) * 60 * 1000;
              if (Date.now() > endMs) {
                ElMessage.error('直播已结束');
                return;
              }
            }
            ElMessage.info('等待老师开播...');
          }
          return;
        } else {
          joinRoom(props.isTeacher ? 'publisher' : 'subscriber');
        }
      } else if (data.request === 'create') {
        if (props.isTeacher) {
          emit('roomCreated');
        }
        joinRoom(props.isTeacher ? 'publisher' : 'subscriber');
      } else if (data.request === 'listparticipants') {
        const participants =
          (
            result as {
              participants?: Array<{ id: string; display: string }>;
            }
          ).participants ?? [];
        const poples: Array<{
          userName: string;
          opaqueId: string;
          isTeacher: boolean;
          id: string;
        }> = [];
        participants?.forEach(item => {
          let displayStr = item.display;
          if (displayStr && item.id) {
            participantDisplays.set(String(item.id), displayStr);
          }
          if (!displayStr) {
            displayStr = participantDisplays.get(String(item.id)) ?? '';
          }
          if (!displayStr && String(item.id) === String(liveUser.value.id)) {
            displayStr = props.isTeacher
              ? `T#${props.opaqueId}#${props.userName}#off`
              : `S#${props.opaqueId}#${props.userName}#off`;
          }
          const user = getDisplay(displayStr);
          if (user[2]) {
            participantNames.set(item.id, user[2]);
          }
          poples.push({
            userName: user[2] ?? '',
            opaqueId: user[1] ?? '',
            isTeacher: user[0] == 'T' ? true : false,
            id: item.id
          });
        });
        const currentParticipantIds = new Set(participants.map(p => String(p.id)));
        if (!firstListparticipantsDone) {
          firstListparticipantsDone = true;
        } else {
          for (const id of currentParticipantIds) {
            if (id === String(liveUser.value.id)) continue;
            if (!previousParticipantIds.has(id)) {
              const displayStr = participantDisplays.get(id) ?? '';
              const user = getDisplay(displayStr);
              emitJoin(user[2] || '新用户', id);
            }
          }
          for (const id of previousParticipantIds) {
            if (id === String(liveUser.value.id)) continue;
            if (!currentParticipantIds.has(id)) {
              const displayStr = participantDisplays.get(id) ?? '';
              const user = getDisplay(displayStr);
              const isTeacherUser = user[0] === 'T' || id === String(teacher.value.id);
              const isDeduped =
                recentlyNotified.has('bstop_' + id) || recentlyNotified.has('pleave_' + id);
              if (isDeduped) {
                participantDisplays.delete(id);
                participantNames.delete(id);
                delUserList(id);
                continue;
              }
              const dedupeKey = isTeacherUser ? 'bstop_' + id : 'pleave_' + id;
              if (isTeacherUser) {
                if (isBroadcastActive) {
                  clearVideoStream();
                  onLookLive(false, 'stop', 0);
                  setTime('close');
                  emit('broadcastStop', 'end');
                } else {
                  const leaveName = user[2] || participantNames.get(id) || '老师';
                  emit('participantLeave', leaveName);
                }
              } else {
                // participantLeave 由 leaving 事件处理器统一 emit
              }
              recentlyNotified.add(dedupeKey);
              setTimeout(() => recentlyNotified.delete(dedupeKey), 10000);
              participantDisplays.delete(id);
              participantNames.delete(id);
              delUserList(id);
            }
          }
        }
        previousParticipantIds.clear();
        currentParticipantIds.forEach(id => previousParticipantIds.add(id));
        num.value = participants.length;
        updatePopleList(poples);
      }
    },
    error: (error: unknown) => {
      if (error === 'Is the server down? (connected=false)') return;
      console.error(error);
    }
  });
}

function switchSource() {
  const media: Record<string, unknown> = {
    video: liveType.value,
    replaceVideo: true,
    replaceAudio: true
  };
  if (liveType.value === 'screen') {
    const selected = sources.value[sourcesNum.value];
    if (selected) media.playId = selected.id;
    closeDig();
  }
  const data = {
    request: 'configure',
    audio: true,
    video: true
  };
  pluginCreateOffer(media, data);
}

function pluginCreateOffer(media: Record<string, unknown>, data: Record<string, unknown>) {
  plugin.value?.createOffer({
    media,
    success: (jsep: unknown) => {
      pluginSend(data, jsep);
    },
    error: (error: unknown) => {
      console.error('WebRTC error:', error);
      if (open.value) {
        emit('setDiaBla', false);
        ElMessage.error('未检测到摄像头/麦克风，请检查设备后重试');
      }
    }
  });
}

function setCameraType(status: boolean) {
  emit('setCameraType', status);
}

function isTalking(type: string, userType: string, isTeacherMess: boolean = false) {
  const media: Record<string, unknown> = {
    videoSend: isTeacherMess ? true : isCameraType.value,
    audioSend: type === 'off' ? false : true
  };
  const data = {
    request: 'configure',
    video: true,
    audio: true,
    display: `${userType}#${props.opaqueId}#${props.userName}#${type}`
  };
  if (isTeacherMess) {
    isCameraType.value = true;
    setCameraType(true);
  }
  audio.value.display = userType == 'ST' ? data.display : '';
  if (userType == 'S') audio.value.id = '';
  liveUser.value.display = data.display;
  if (!props.isTeacher) {
    if (type === 'on') isSelfTalking.value = true;
    if (type === 'off') isSelfTalking.value = false;
  }
  pluginCreateOffer(media, data);
}

function setCameraStudent(status: boolean, isSpeak: boolean) {
  const media = buildStudentCameraMedia(status, isSpeak);
  const data = {
    request: 'configure',
    audio: true,
    video: true
  };
  isCameraType.value = status;
  pluginCreateOffer(media, data);
  setCameraType(status);
}

function buildStudentCameraMedia(status: boolean, isSpeak: boolean): Record<string, unknown> {
  const video = liveType.value || 'stdres-16:9';
  if (status) {
    return isSpeak
      ? { video, videoSend: true, addVideo: true }
      : { video, videoSend: true, audio: false, audioSend: false };
  }
  return isSpeak
    ? { removeVideo: true, videoSend: false }
    : { removeVideo: true, videoSend: false, audio: false, audioSend: false };
}

function setCamera(status: boolean) {
  let media: Record<string, unknown>;
  if (microphoneType.value) {
    media = status
      ? { video: liveType.value, addVideo: true }
      : {
          removeVideo: true
        };
  } else {
    media = status
      ? { video: liveType.value, addVideo: true, removeAudio: true }
      : {
          removeVideo: true,
          removeAudio: true
        };
  }
  const data = {
    request: 'configure',
    audio: true,
    video: true
  };
  pluginCreateOffer(media, data);
  cameraType.value = status;
}

function stopLive(status: boolean, changeStatus = true) {
  const data = {
    request: 'unpublish',
    room: parseInt(props.roomId as string)
  };
  pluginSend(data);
  if (changeStatus) void changeLiveStatus(status ? 4 : 2);
}

function setMicrophone(status: boolean) {
  let media: Record<string, unknown>;
  if (cameraType.value) {
    media = status
      ? { video: liveType.value, addAudio: true }
      : {
          removeAudio: true
        };
  } else {
    media = status
      ? { removeVideo: true, addAudio: true }
      : {
          removeAudio: true,
          removeVideo: true
        };
  }
  const data = {
    request: 'configure',
    audio: true,
    video: true
  };
  pluginCreateOffer(media, data);
  microphoneType.value = status;
}

function clearVideoStream() {
  const video = videoPlayer.value?.videoPlayers;
  if (video) {
    video.srcObject = null;
  }
}

function stopLocalTracks() {
  const video = videoPlayer.value?.videoPlayers;
  const stream = video?.srcObject as MediaStream | null;
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
    stream.removeTrack(track);
  }
}

function attachMediaStream(stream: MediaStream) {
  const video = videoPlayer.value?.videoPlayers;
  playStream(video, stream);
  if (props.isTeacher) {
    onOpenLive(true, liveType.value, 0);
  } else {
    onLookLive(true, '', 0);
  }
}

function playStream(element: HTMLVideoElement | HTMLAudioElement | undefined, stream: MediaStream) {
  if (!element) return;
  const videoTracks = stream.getVideoTracks();
  if (videoTracks.length === 0) {
    element.srcObject = null;
    return;
  }
  try {
    element.srcObject = stream;
    element.onloadedmetadata = () => void element.play();
  } catch (e) {
    try {
      element.src = URL.createObjectURL(stream as unknown as Blob);
      element.onloadedmetadata = () => void element.play();
    } catch (err) {
      console.error('Error attaching stream to element');
    }
  }
}

function studentMediaStream(stream: MediaStream, display: string[], id: string) {
  emit('studentMediaStream', stream, display, id);
}

async function attachAudio(stream: MediaStream) {
  const el = audioEl.value;
  if (el) {
    playStream(el, stream);
    if (props.isInteraction == 2) el.muted = true;
  }
  const user = await getDisplay(audio.value.display);
  setAudioAll(user);
}

function setRecordAttach(msg: Record<string, unknown>, jsep: unknown) {
  const result = msg['result'] as Record<string, unknown> | undefined;
  if (result) {
    if (result['status'] === 'recording') {
      if (jsep) {
        recordPlay.value?.handleRemoteJsep({
          jsep
        });
      }
      if (result['id']) {
        recordingId.value = result['id'] as string;
        setRecord(true);
      }
    } else if (result['status'] === 'stopped') {
      void savePlayBackUrl();
      recordPlay.value?.hangup();
      setRecord(false);
    }
  } else {
    console.error(msg);
    ElMessage.error('操作异常');
  }
}

async function recording(status: boolean, time: number) {
  recordTimeLen.value = time;
  if (status) {
    const getServerTimeRes = await getServerTime();
    const id = randomString(2, true);
    const roomId = `${getServerTimeRes}${id}`;
    const media = {
      video: 'screen',
      audioSend: true,
      videoSend: true,
      videoRecv: false,
      audioRecv: false
    };
    const data = { request: 'record', name: props.roomId, id: parseInt(roomId) };
    recordPlay.value?.createOffer({
      media,
      success: (jsep: unknown) => {
        recordPlaySend(data, jsep);
      },
      error: (error: unknown) => {
        console.error(error);
      }
    });
  } else {
    const data = {
      request: 'stop'
    };
    recordPlaySend(data);
  }
}

function recordPlaySend(data: Record<string, unknown>, jsep: unknown = null) {
  recordPlay.value?.send({
    message: data,
    ...(jsep !== null ? { jsep } : {}),
    success: () => {},
    error: (error: unknown) => {
      console.error('失败', error);
    }
  });
}

function setRecord(status: boolean) {
  emit('setRecord', status);
}

function setInit() {
  janusInit();
}

function janusInit() {
  Live.init({
    debug: 'true',
    callback: function () {
      room.value = new Live({
        server: config.liveServer,
        success: function () {
          liveAttach();
          recordAttach();
          textAttach();
        },
        error: function (error: unknown) {
          ElMessage.error(String(error));
        }
      });
    }
  });
}

function liveAttach() {
  room.value?.attach({
    plugin: 'janus.plugin.videoroom',
    opaqueId: props.opaqueId,
    success: (pluginHandle: JanusHandle) => {
      plugin.value = pluginHandle;
      exists();
    },
    error: (error: unknown) => {
      console.error(error);
    },
    webrtcState: () => {},
    onmessage: (msg, jsep) => {
      if (props.isTeacher) {
        setLiveMessageTeacher(msg, jsep);
      } else {
        setLiveMessageStudent(msg, jsep);
      }
    },
    onlocalstream: stream => {
      if (props.isTeacher) {
        attachMediaStream(stream);
      } else {
        if (props.isInteraction == 2) {
          void attachAudio(stream);
        }
        const displayArr = getDisplay(liveUser.value.display);
        studentMediaStream(stream, displayArr, liveUser.value.id);
      }
    },
    onremotestream: () => {},
    oncleanup: () => {}
  });
}

function textAttach() {
  room.value?.attach({
    plugin: 'janus.plugin.textroom',
    opaqueId: props.opaqueId,
    success: (pluginHandle: JanusHandle) => {
      webrtcPlugin.value = pluginHandle;
      webrtcPlugin.value?.send({
        message: {
          request: 'setup'
        }
      });
    },
    error: (error: unknown) => {
      console.error(error);
    },
    onmessage: (_msg, jsep) => {
      if (jsep) {
        webrtcPlugin.value?.createAnswer({
          jsep,
          media: {
            audio: false,
            video: false,
            data: true
          },
          success: (answerJsep: unknown) => {
            const body = {
              request: 'ack'
            };
            webrtcPlugin.value?.send({
              message: body,
              jsep: answerJsep
            });
          },
          error: (error: unknown) => {
            console.error('WebRTC error:', error);
          }
        });
      }
    },
    ondataopen: () => {
      joinText();
    },
    ondata: (data: string) => {
      const json = JSON.parse(data) as {
        textroom?: string;
        from?: string;
        text: string;
      };
      const textRoom = json['textroom'];
      if (textRoom === 'message') {
        void fromMessage(json);
      } else if (textRoom === 'announcement') {
        console.warn('announcement');
      } else if (textRoom === 'join') {
        console.warn('join');
      } else if (textRoom === 'leave') {
        console.warn('leave');
      } else if (textRoom === 'kicked') {
        console.warn('kicked');
      } else if (textRoom === 'destroyed') {
        console.warn('destroyed');
      }
    },
    oncleanup: () => {}
  });
}

function recordAttach() {
  room.value?.attach({
    plugin: 'janus.plugin.recordplay',
    opaqueId: props.opaqueId,
    success: (pluginHandle: JanusHandle) => {
      recordPlay.value = pluginHandle;
    },
    error: (error: unknown) => {
      console.error(error);
    },
    webrtcState: () => {},
    onmessage: (msg, jsep) => {
      setRecordAttach(msg, jsep);
    },
    onlocalstream: () => {},
    onremotestream: () => {},
    oncleanup: () => {}
  });
}

function exists() {
  const data = {
    request: 'exists',
    room: parseInt(props.roomId as string)
  };
  pluginSend(data);
}

function createRoom() {
  const data = {
    request: 'create',
    room: parseInt(props.roomId as string)
  };
  pluginSend(data);
}

function retryExists() {
  exists();
}

function joinRoom(_role: string) {
  const data = {
    request: 'join',
    room: parseInt(props.roomId as string),
    ptype: 'publisher',
    display: display.value
  };
  pluginSend(data);
}

function setAudioAll(user: string[]) {
  emit('setAudioAll', user);
}

interface VideoRoomPublisher {
  id: string;
  display: string;
  audio_codec?: string;
  video_codec?: string;
}

interface VideoRoomAttendee {
  id: string;
  display: string;
}

interface VideoRoomMessage {
  videoroom?: string;
  id?: string;
  private_id?: string;
  publishers?: VideoRoomPublisher[];
  attendees?: VideoRoomAttendee[];
  joining?: unknown;
  leaving?: string;
  unpublished?: string;
  error?: string;
  display?: string;
  configured?: unknown;
}

function setLiveMessageTeacher(msg: VideoRoomMessage, jsep: unknown) {
  const event = msg['videoroom'];
  if (event) {
    if (event === 'joined') {
      const publishers = msg['publishers']?.length ?? 0;
      const attendees = msg['attendees']?.length ?? 0;
      num.value = publishers + attendees + 1;
      for (const value of msg['attendees'] ?? []) {
        if (value.display) participantDisplays.set(String(value.id), value.display);
        const user = getDisplay(value.display);
        if (user[0] === 'T' && value.id !== msg.id) {
          ElMessage.error('该房间已存在老师');
          room.value?.destroy();
          void router.push('/');
          return;
        }
      }
      if (publishers > 0) {
        for (const value of msg['publishers'] ?? []) {
          if (value.display) participantDisplays.set(String(value.id), value.display);
          const user = getDisplay(value.display);
          if (user[0] === 'T') {
            ElMessage.error('该房间有老师正在直播中');
            void router.push('/');
            return;
          }
          newRemoteFeed(
            value.id,
            value.display,
            value.audio_codec ?? '',
            value.video_codec ?? '',
            user
          );
        }
      }
      teacherNameText.value = props.userName as string;
      liveUser.value.id = msg.id ?? '';
      liveUser.value.display = display.value;
      if (msg.id) participantDisplays.set(String(msg.id), display.value);
      privateId.value = msg['private_id'] ?? '';
      teacher.value.id = msg.id ?? '';
      teacher.value.display = display.value;
      listparticipants();
      startListparticipantsPoll();
    } else if (event === 'destroyed') {
      console.error('The room has been destroyed!');
    } else if (event === 'event') {
      if (msg['publishers']) {
        if (msg['publishers']?.length) {
          for (const value of msg['publishers'] ?? []) {
            if (value.display) participantDisplays.set(String(value.id), value.display);
            const user = getDisplay(value.display);
            emitJoin(user[2] || '新用户', String(value.id));
            newRemoteFeed(
              value.id,
              value.display,
              value.audio_codec ?? '',
              value.video_codec ?? '',
              user
            );
          }
          listparticipants();
        }
      } else if (msg['joining']) {
        const joinInfo = msg['joining'] as { id?: string; display?: string };
        if (joinInfo?.id) {
          participantDisplays.set(String(joinInfo.id), joinInfo.display ?? '');
        }
        const joinDisplay = getDisplay(joinInfo?.display ?? '');
        if (joinInfo?.id && joinDisplay[2]) {
          participantNames.set(String(joinInfo.id), joinDisplay[2]);
        }
        const joinName = joinDisplay[2] || '新用户';
        emitJoin(joinName, String(joinInfo?.id ?? ''));
        listparticipants();
      } else if (msg['leaving']) {
        if (
          props.isInteraction === 3 &&
          (msg['leaving'] === audio.value.id || msg['leaving'] === 'ok')
        ) {
          setAudioing(false, '');
        }
        if (msg['leaving'] === 'ok') {
          if (plugin.value) plugin.value.detach();
          room.value?.destroy();
        } else {
          const leaveId = String(msg['leaving']);
          const leaveDisplayStr = participantDisplays.get(leaveId) ?? '';
          const leaveDisplay = getDisplay(leaveDisplayStr);
          const leaveName = leaveDisplay[2] || participantNames.get(leaveId) || '用户';
          emit('participantLeave', leaveName);
        }
        participantDisplays.delete(String(msg['leaving']));
        participantNames.delete(String(msg['leaving']));
        delUserList(msg['leaving']);
        listparticipants();
      } else if (msg['unpublished']) {
        if (
          props.isInteraction === 3 &&
          (msg['unpublished'] === audio.value.id || msg['unpublished'] === 'ok')
        ) {
          setAudioing(false, '');
        }
      } else if (msg['error']) {
        void (msg.error as string).indexOf('No such room');
      } else if (msg['display']) {
        if (msg['id'] && msg['display']) participantDisplays.set(String(msg['id']), msg['display']);
        const user = getDisplay(msg['display']);
        if (user[0] == 'S' || user[0] == 'ST') {
          if (user[0] == 'ST') {
            setAudioType.value.type = true;
            setAudioType.value.display = msg['display'];
            audio.value.id = msg['id'] ?? '';
            audio.value.display = msg['display'];
          } else if (user[0] == 'S') {
            if (audio.value.display) {
              const userAudio = getDisplay(audio.value.display);
              if (user[1] == userAudio[1]) {
                setAudioing(true, msg['display']);
              }
            }
          }
          application(user[0] == 'S' ? 0 : 3, '');
          setAudioAll(user);
        }
      } else if (msg['configured']) {
        void msg['configured'];
      }
    }
  }
  if (jsep !== undefined && jsep !== null) {
    plugin.value?.handleRemoteJsep({
      jsep
    });
  }
}

function setAudioing(type: boolean, display: string) {
  setAudioType.value.type = type;
  setAudioType.value.display = display;
  audio.value.id = '';
  audio.value.display = '';
  application(0, '');
}

function setLiveMessageStudent(msg: VideoRoomMessage, jsep: unknown) {
  const event = msg['videoroom'];
  if (event) {
    if (event === 'joined') {
      const publishers = msg['publishers']?.length ?? 0;
      const attendees = msg['attendees']?.length ?? 0;
      num.value = publishers + attendees + 1;
      const studentNum = publishers > 0 ? num.value - 1 : num.value;
      if (studentNum >= config.smallClassNum) {
        ElMessage.error('房间人数已达上限');
        void router.push('/');
        return;
      }
      liveUser.value.id = msg.id ?? '';
      liveUser.value.display = display.value;
      if (msg.id) participantDisplays.set(String(msg.id), display.value);
      if (liveUser.value.id) emit('selfJoined', liveUser.value.id, display.value);
      for (const value of msg['attendees'] ?? []) {
        if (value.display) participantDisplays.set(String(value.id), value.display);
      }
      privateId.value = msg['private_id'] ?? '';
      if ((msg['publishers']?.length ?? 0) == 0) {
        ElMessage.success('当前无老师直播!');
        setTime('close');
      } else {
        for (const value of msg['publishers'] ?? []) {
          if (value.display) participantDisplays.set(String(value.id), value.display);
          const user = getDisplay(value.display);
          newRemoteFeed(
            value.id,
            value.display,
            value.audio_codec ?? '',
            value.video_codec ?? '',
            user
          );
        }
      }
      listparticipants();
      startListparticipantsPoll();
    } else if (event === 'destroyed') {
      console.error('The room has been destroyed!');
    } else if (event === 'event') {
      if (msg['publishers']) {
        const len = msg['publishers']?.length ?? 0;
        if (len) {
          for (const value of msg['publishers'] ?? []) {
            if (value.display) participantDisplays.set(String(value.id), value.display);
            const user = getDisplay(value.display);
            if (user[0] === 'T') {
              isBroadcastActive = true;
              emit('broadcastStart');
            } else {
              emitJoin(user[2] || '新用户', String(value.id));
            }
            newRemoteFeed(
              value.id,
              value.display,
              value.audio_codec ?? '',
              value.video_codec ?? '',
              user
            );
          }
          listparticipants();
        }
      } else if (msg['joining']) {
        const joinInfo = msg['joining'] as { id?: string; display?: string };
        if (joinInfo?.id) {
          participantDisplays.set(String(joinInfo.id), joinInfo.display ?? '');
        }
        const joinDisplay = getDisplay(joinInfo?.display ?? '');
        if (joinInfo?.id && joinDisplay[2]) {
          participantNames.set(String(joinInfo.id), joinDisplay[2]);
        }
        const joinName = joinDisplay[2] || '新用户';
        emitJoin(joinName, String(joinInfo?.id ?? ''));
        listparticipants();
      } else if (msg['leaving']) {
        const leaveId = String(msg['leaving']);
        if (recentlyNotified.has('bstop_' + leaveId) || recentlyNotified.has('pleave_' + leaveId)) {
          // 已处理，跳过
        } else if (msg['leaving'] === teacher.value.id) {
          if (isBroadcastActive) {
            clearVideoStream();
            onLookLive(false, 'stop', 0);
            setTime('close');
            emit('broadcastStop', 'end');
            recentlyNotified.add('bstop_' + leaveId);
            recentlyNotified.add(String(teacher.value.id));
            setTimeout(() => {
              recentlyNotified.delete('bstop_' + leaveId);
              recentlyNotified.delete(String(teacher.value.id));
            }, 10000);
          } else {
            const leaveName = participantNames.get(leaveId) || '老师';
            emit('participantLeave', leaveName);
            recentlyNotified.add('pleave_' + leaveId);
            setTimeout(() => recentlyNotified.delete('pleave_' + leaveId), 10000);
          }
        } else if (msg['leaving'] === 'ok') {
          if (plugin.value) plugin.value.detach();
          room.value?.destroy();
          onLookLive(false, '', 0);
        } else {
          const leaveDisplayStr = participantDisplays.get(leaveId) ?? '';
          const leaveDisplay = getDisplay(leaveDisplayStr);
          const leaveName = leaveDisplay[2] || participantNames.get(leaveId) || '用户';
          emit('participantLeave', leaveName);
          recentlyNotified.add('pleave_' + leaveId);
          setTimeout(() => recentlyNotified.delete('pleave_' + leaveId), 10000);
        }
        if (
          props.isInteraction === 3 &&
          (msg['leaving'] === audio.value.id || msg['leaving'] === teacher.value.id)
        ) {
          setAudioing(false, '');
        }
        participantDisplays.delete(String(msg['leaving']));
        participantNames.delete(String(msg['leaving']));
        delUserList(msg['leaving']);
        listparticipants();
      } else if (msg['unpublished']) {
        if (
          (props.isInteraction === 2 || props.isInteraction === 3) &&
          (msg['unpublished'] === teacher.value.id ||
            msg['unpublished'] === 'ok' ||
            msg['unpublished'] === audio.value.id)
        ) {
          if (msg['unpublished'] === teacher.value.id) void stopApplication();
          setAudioing(false, '');
        }
        if (msg['unpublished'] === teacher.value.id) {
          const unpubId = String(msg['unpublished']);
          if (
            isBroadcastActive &&
            !recentlyNotified.has(unpubId) &&
            !recentlyNotified.has('bstop_' + unpubId)
          ) {
            clearVideoStream();
            onLookLive(false, 'stop', 0);
            setTime('close');
            isBroadcastActive = false;
            recentlyNotified.add(unpubId);
            setTimeout(() => recentlyNotified.delete(unpubId), 10000);
          }
        }
      } else if (msg['error']) {
        void (msg.error as string).indexOf('No such room');
      } else if (msg['configured']) {
        const user = getDisplay(audio.value.display);
        setAudioAll(user);
      } else if (msg['display']) {
        if (msg['id'] && msg['display']) participantDisplays.set(String(msg['id']), msg['display']);
        const user = getDisplay(msg['display']);
        if (user[0] === 'S' || user[0] === 'ST') {
          if (user[0] == 'ST') {
            setAudioType.value.type = true;
            setAudioType.value.display = msg['display'];
            audio.value.id = msg['id'] ?? '';
            audio.value.display = msg['display'];
          } else if (user[0] == 'S') {
            if (audio.value.display) {
              const userAudio = getDisplay(audio.value.display);
              if (user[1] == userAudio[1]) {
                setAudioing(true, msg['display']);
              }
            }
          }
          application(user[0] == 'S' ? 0 : 3, '');
          setAudioAll(user);
        }
      }
    }
  }
  if (jsep !== undefined && jsep !== null) {
    plugin.value?.handleRemoteJsep({
      jsep
    });
  }
}

function delUserList(leaving: unknown) {
  emit('delUserList', leaving);
}

function setTime(type: string) {
  emit('setTime', type);
}

function newRemoteFeed(
  id: string,
  display: string,
  audioCodec: string,
  videoCodec: string,
  user: string[]
) {
  let remoteFeed: JanusHandle | null = null;
  room.value?.attach({
    plugin: 'janus.plugin.videoroom',
    opaqueId: props.opaqueId,
    success: (pluginHandle: JanusHandle) => {
      remoteFeed = pluginHandle;
      const data = {
        request: 'join',
        room: parseInt(props.roomId as string),
        ptype: 'subscriber',
        feed: id,
        private_id: privateId.value
      };
      if (user[0] === 'T') {
        teacherNameText.value = user[2] ?? '';
        teacher.value.id = id;
        teacher.value.display = display;
      } else if (user[0] === 'ST') {
        setAudioType.value.type = true;
        setAudioType.value.display = display;
        audio.value.id = id;
        audio.value.display = display;
        application(3, '');
      }
      if (videoCodec) remoteFeed.videoCodec = videoCodec;
      if (audioCodec) remoteFeed.audioCodec = audioCodec;
      remoteFeed.send({
        message: data
      });
    },
    error: (error: unknown) => {
      console.error(error);
    },
    onmessage: (_msg, jsep) => {
      if (jsep) {
        remoteFeed?.createAnswer({
          jsep,
          media: {
            audioSend: false,
            videoSend: false
          },
          success: (answerJsep: unknown) => {
            const data = {
              request: 'start',
              room: parseInt(props.roomId as string)
            };
            remoteFeed?.send({
              message: data,
              jsep: answerJsep
            });
          },
          error: (error: unknown) => {
            console.error('WebRTC error:', error);
          }
        });
      }
    },
    onlocalstream: () => {},
    onremotestream: stream => {
      if (user[0] === 'T') {
        const updateState = () => {
          const videoTracks = stream.getVideoTracks();
          const audioTracks = stream.getAudioTracks();
          remoteCameraOn.value = videoTracks.length > 0 && videoTracks[0]!.readyState === 'live';
          remoteMicOn.value = audioTracks.length > 0 && audioTracks[0]!.readyState === 'live';
          if (remoteCameraOn.value) {
            attachMediaStream(stream);
          } else {
            clearVideoStream();
          }
        };
        updateState();
        stream.getVideoTracks().forEach(track => {
          track.onmute = () => updateState();
          track.onunmute = () => updateState();
          track.onended = () => updateState();
        });
      } else {
        if (user[0] === 'ST' && setAudioType.value.type) {
          const audioUser = getDisplay(setAudioType.value.display);
          if (audio.value.display === setAudioType.value.display) {
            void attachAudio(stream);
            void audioUser;
          }
          setAudioType.value.type = false;
          setAudioType.value.display = '';
        }
        studentMediaStream(stream, user, id);
      }
    },
    oncleanup: () => {
      if (user[0] === 'T') {
        clearVideoStream();
      }
    }
  });
}

function getDisplay(display: string) {
  return display.split('#');
}

function pall() {
  emit('pall');
}

async function changeLiveStatus(status: number) {
  const params = {
    roomId: props.roomId,
    status
  };
  try {
    await api.change_live_status(params);
  } catch (e) {
    console.error(e);
    ElMessage.error('更新数据异常');
  }
}

async function savePlayBackUrl() {
  const params = {
    roomId: props.roomId,
    playBackUrl: recordingId.value,
    duration: recordTimeLen.value
  };
  try {
    const res = await api.save_play_back_url(params);
    ElMessage.success('回放地址已保存');
    const videoData = { ...res.data.data, address: recordingId.value };
    videoList(true, videoData);
    sendData(
      'public',
      JSON.stringify({
        type: 7,
        data: videoData
      })
    );
  } catch (e) {
    console.error(e);
  }
}

function videoList(status: boolean, data: unknown) {
  emit('videoList', status, data);
}

function applyList(status: boolean, data: unknown) {
  emit('applyList', status, data);
}

function application(num: number, message: string) {
  emit('application', num, message);
}

function openMyLive() {
  microphoneType.value = false;
  const media: Record<string, unknown> = {
    video: liveType.value,
    audioSend: false,
    videoSend: true,
    videoRecv: false,
    audioRecv: false
  };
  const data = {
    request: 'configure',
    audio: false,
    video: true
  };
  pluginCreateOffer(media, data);
}

async function stopApplication() {
  if (props.isTeacher || isCameraType.value || isSelfTalking.value) {
    isTalking('off', 'S');
  }
  const user = await getDisplay(`S#${props.opaqueId}#${props.userName}#off`);
  setAudioAll(user);
  setAudioing(false, '');
}

async function stopApplicationTxt() {
  const user = await getDisplay(audio.value.display);
  sendData(
    'private',
    JSON.stringify({
      type: 1,
      data: 'leave'
    }),
    user[1] ?? ''
  );
}

async function isTalkingTxt(type: string) {
  const user = await getDisplay(audio.value.display);
  sendData(
    'private',
    JSON.stringify({
      type: 2,
      data: type
    }),
    user[1] ?? ''
  );
}

const { getServerTime } = useServerTime();

defineExpose({
  apply,
  sendData,
  setInit,
  listparticipants,
  recording,
  lookLive,
  openLive,
  isTalking,
  isTalkingTxt,
  stopApplication,
  stopApplicationTxt,
  setCamera,
  setCameraStudent,
  buildStudentCameraMedia,
  setMicrophone,
  setCameraType,
  delList,
  endClassSpeakAll,
  fromMessage,
  onLookLive,
  onOpenLive,
  retryExists
});
</script>

<style lang="less" scoped>
.flex() {
  display: flex;
  align-items: center;
}

.classroom-video {
  width: 100%;
  height: 100%;
  position: relative;
  &.floating {
    position: fixed;
    z-index: 10000;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    background: #000;
    cursor: move;
    border: 1px solid transparent;
    transition: border-color 0.2s;
    &:hover {
      border-color: rgba(255, 255, 255, 0.3);
    }
  }
  .resize-handle {
    z-index: 10001;
  }
  .resize-n {
    cursor: n-resize;
  }
  .resize-s {
    cursor: s-resize;
  }
  .resize-e {
    cursor: e-resize;
  }
  .resize-w {
    cursor: w-resize;
  }
  .resize-ne {
    cursor: ne-resize;
  }
  .resize-nw {
    cursor: nw-resize;
  }
  .resize-se {
    cursor: se-resize;
  }
  .resize-sw {
    cursor: sw-resize;
  }
  .bottom {
    .flex();
    position: absolute;
    z-index: 999;
    bottom: 2px;
    height: 20px;
    color: #ffffff;

    font-weight: 500;
    font-size: 12px;
    background: linear-gradient(270deg, rgba(0, 0, 0, 0) 0%, #000000 100%);
    width: 100%;
    .floating & {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 32px;
      border-radius: 0;
      background: rgba(0, 0, 0, 0.7);
    }
    span {
      margin-left: 6px;
      cursor: move;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .imgs {
      .flex();
      margin-left: auto;
      margin-right: 6px;
      .el-icon {
        width: 20px;
        height: 20px;
        font-size: 20px;
        margin-left: 6px;
        cursor: pointer;
        &.is-off {
          color: #989898;
        }
      }
    }
  }
  .camera-off-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 998;
    background: #000;
    .overlay-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      color: rgba(255, 255, 255, 0.5);
      font-size: 14px;
      .el-icon {
        font-size: 40px;
        margin-bottom: 8px;
        opacity: 0.5;
      }
    }
  }
}
.dia-shares {
  .flex();
}
.shares {
  width: 100%;

  .share {
    .flex();
    flex-wrap: wrap;
    padding: 0 0 0 46px;
    .share-con:nth-child(3n) {
      margin-right: 0px;
    }
    .share-select {
      border: 2px solid #0f74ff;
    }
    .share-default {
      border: 2px solid #ffffff;
    }
    .share-con {
      margin-right: 24px;
      width: 240px;
      margin-top: 16px;
      cursor: pointer;
      .share-player {
        width: 100%;
        height: 135px;
        background: #d8d8d8;
      }
      .share-select-name {
        color: #0f74ff;
      }
      .share-name {
        height: 20px;
        font-size: 14px;
        font-weight: 400;
        color: #333333;
        line-height: 20px;
        margin-top: 8px;
      }
    }
  }
  .over {
    overflow-y: scroll;
    overflow: auto;
    height: 366px;
  }
  .share-bottom {
    .flex();
    justify-content: center;
    margin-top: 34px;
    margin-bottom: 21px;
    .share-cancl {
      border: 2px solid #0f74ff;
    }
    .share-share {
      background: #0f74ff;
    }
  }
}
</style>
<style lang="less">
.classroom-video {
  .el-dialog {
    border-radius: 12px;
  }
  .el-dialog__header {
    padding-top: 30px !important;
    padding-bottom: 40px !important;
    .el-dialog__title {
      font-size: 22px;
      font-weight: bold;
      color: #333333;
      line-height: 33px;
      height: 33px;
    }
  }
  .el-dialog__headerbtn {
    top: 35px;
  }
}

.shares {
  .el-button.el-button--default {
    width: 140px;
    height: 40px;
    font-weight: bold;
    border-radius: 28px;
    span {
      font-size: 16px;
    }
  }
  .share-cancl {
    span {
      color: #0f74ff;
    }
  }
  .share-share {
    span {
      color: #ffffff;
    }
  }
}
</style>
