<template>
  <div class="top">
    <div class="title">
      {{ roomInfo.title }}
    </div>
    <div class="classroom-top">
      <div class="left">
        <div class="top-left">
          <div
            v-if="!visible2"
            class="tf"
          >
            <el-tooltip
              class="item"
              effect="dark"
              :content="'延迟' + delayed + 'ms'"
              placement="bottom-end"
            >
              <el-icon
                v-if="delayed >= 0 && delayed <= 100"
                :size="18"
                color="#61ba47"
                aria-label="良好"
              >
                <Connection />
              </el-icon>
              <el-icon
                v-else-if="delayed > 100 && delayed <= 500"
                :size="18"
                color="#f8821a"
                aria-label="较差"
              >
                <Connection />
              </el-icon>
              <el-icon
                v-else-if="delayed > 500 && delayed < 1000"
                :size="18"
                color="#e0383e"
                aria-label="很差"
              >
                <Connection />
              </el-icon>
              <el-icon
                v-else
                :size="18"
                color="#989898"
                aria-label="无法访问"
              >
                <Connection />
              </el-icon>
            </el-tooltip>
          </div>
          <div
            v-else
            class="tf"
          >
            <el-tooltip
              class="item"
              effect="dark"
              content="网络未连接"
              placement="bottom-end"
            >
              <el-icon
                :size="18"
                color="#989898"
                aria-label="无法访问"
              >
                <Connection />
              </el-icon>
            </el-tooltip>
          </div>
        </div>
        <el-popover
          placement="bottom"
          width="300"
          trigger="hover"
          :visible-arrow="false"
          popper-class="lay1"
        >
          <ul>
            <li>
              <span class="name">直播名称：</span><span>{{ roomInfo.title }}</span>
            </li>
            <li>
              <span class="name">老师：</span><span>{{ roomInfo.speakerName }}</span>
            </li>
            <li>
              <span class="name">参加码：</span><span>{{ roomInfo.joinCode }}</span>
              <el-icon
                class="copy"
                @click="copy(roomInfo.joinCode ?? '')"
              >
                <CopyDocument />
              </el-icon>
            </li>
            <li>
              <span class="name">参加链接：</span><span>http://abc</span>
              <el-icon
                class="copy"
                @click="copy('http://abc')"
              >
                <CopyDocument />
              </el-icon>
            </li>
            <li>
              <span class="name">直播时长：</span><span>{{ roomInfo.duration }}min</span>
            </li>
          </ul>
          <template #reference>
            <div class="top-left">
              <el-icon :size="18">
                <InfoFilled />
              </el-icon>
            </div>
          </template>
        </el-popover>

        <el-popover
          placement="bottom"
          width="150"
          trigger="hover"
          :visible-arrow="false"
          popper-class="lay2"
        >
          <ul class="layout">
            <li
              :class="layoutNum === 1 ? 'not' : ''"
              @click="setLayout(1)"
            >
              <el-icon :class="layoutNum === 1 ? 'click-btn' : ''">
                <Grid />
              </el-icon><span>白板模式</span>
            </li>
            <li
              :class="layoutNum === 3 ? 'not' : ''"
              @click="setLayout(3)"
            >
              <el-icon :class="layoutNum === 3 ? 'click-btn' : ''">
                <Platform />
              </el-icon><span>默认模式</span>
            </li>
          </ul>
          <template #reference>
            <div class="top-left left-pointer">
              <div class="dot-pos">
                <el-badge
                  :is-dot="layoutNum === 1 && isDotNum > 0 ? true : false"
                  class="item"
                >
                  <el-icon
                    v-if="layoutNum === 1"
                    :size="18"
                    aria-label="布局"
                  >
                    <Grid />
                  </el-icon>
                  <el-icon
                    v-else
                    :size="18"
                    aria-label="布局"
                  >
                    <Platform />
                  </el-icon>
                </el-badge>
              </div>
            </div>
          </template>
        </el-popover>

        <el-popover
          placement="bottom"
          width="150"
          trigger="hover"
          :visible-arrow="false"
          popper-class="lay2"
        >
          <div class="settings-panel">
            <el-checkbox
              :model-value="chatVisible"
              @change="(val: boolean | string | number) => emit('update:chatVisible', !!val)"
            >
              聊天面板
            </el-checkbox>
            <el-checkbox
              v-if="isSmall"
              :model-value="videosVisible"
              @change="(val: boolean | string | number) => emit('update:videosVisible', !!val)"
            >
              学生视频
            </el-checkbox>
          </div>
          <template #reference>
            <div class="top-left left-pointer">
              <el-icon :size="18">
                <Setting />
              </el-icon>
            </div>
          </template>
        </el-popover>

        <div class="top-left content">
          <el-icon :size="18">
            <Timer />
          </el-icon><span>{{ formatStopwatch(liveTimeLen) }}</span>
        </div>
      </div>
      <div class="right">
        <div
          v-if="!btn && isTeacher && type !== 'stop'"
          class="top-right content"
          @click="openLives(true, 'hires', 'open')"
        >
          <el-icon :size="16">
            <VideoPlay />
          </el-icon><span>开始直播</span>
        </div>
        <div
          v-if="!btn && isTeacher && type === 'stop'"
          class="top-right content"
          @click="openLives(true, 'hires', 'open')"
        >
          <el-icon :size="16">
            <VideoPlay />
          </el-icon><span>继续直播</span>
        </div>
        <div
          v-if="!btn && isTeacher"
          class="top-right content"
          @click="lookLive(false)"
        >
          <el-icon :size="16">
            <CircleClose />
          </el-icon><span>退出</span>
        </div>
        <div
          v-if="btn && isTeacher"
          class="top-right content"
          @click="openLives(false, '', 'stop')"
        >
          <el-icon :size="16">
            <VideoPause />
          </el-icon><span>暂停直播</span>
        </div>
        <div
          v-if="btn && (isTeacher || isInteraction === 2) && liveType === 'hires'"
          class="top-right content"
          @click="openLives(true, 'screen', 'update')"
        >
          <el-icon :size="16">
            <Monitor />
          </el-icon><span>共享桌面</span>
        </div>
        <div
          v-if="btn && (isTeacher || isInteraction === 2) && liveType === 'screen'"
          class="top-right content"
          @click="openLives(true, 'hires', 'update')"
        >
          <el-icon :size="16">
            <Monitor />
          </el-icon><span>结束共享</span>
        </div>
        <div
          v-if="!recordType && btn && isTeacher"
          class="top-right content"
          @click="record(true, recordTimeLen)"
        >
          <el-icon :size="16">
            <VideoCamera />
          </el-icon><span>录制</span>
        </div>
        <div
          v-if="recordType && btn && isTeacher"
          class="top-right content"
          @click="record(false, recordTimeLen)"
          @mouseover="recordMouse(true)"
          @mouseleave="recordMouse(false)"
        >
          <el-icon
            :size="16"
            color="#e0383e"
            aria-label="录制中"
          >
            <VideoCameraFilled />
          </el-icon><span v-show="!recordMouseType">{{ formatStopwatch(recordTimeLen) }}</span><span v-show="recordMouseType">停止录制</span>
        </div>
        <div
          v-if="btn && isTeacher"
          class="top-right content closebgcolor"
          @click="end()"
        >
          <el-icon :size="16">
            <CircleClose />
          </el-icon><span>结束</span>
        </div>
        <div
          v-if="!isTeacher"
          class="top-right content closebgcolor"
          @click="lookLive(false)"
        >
          <el-icon :size="16">
            <CircleClose />
          </el-icon><span>退出</span>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="visible"
      title="确认结束直播？"
      width="min(420px, 90vw)"
      center
      class="dia-visibles"
      top="0vh"
    >
      <div class="visible">
        <div class="share-bottom">
          <el-button
            class="share-cancl"
            @click="visible = false"
          >
            继续直播
          </el-button><el-button
            class="share-share"
            @click="openLives(false, 'hires', 'close')"
          >
            结束
          </el-button>
        </div>
      </div>
    </el-dialog>
    <el-dialog
      v-model="visible1"
      width="min(420px, 90vw)"
      center
      :show-close="true"
      top="0vh"
      class="dia-visible"
      :close-on-press-escape="false"
      :close-on-click-modal="false"
      :teleported="false"
    >
      <div class="visible1">
        <div class="title1">
          直播已结束
        </div>
        <div class="title2">
          {{ roomInfo.title }}直播间
        </div>
        <div class="num">
          <div class="timeLen">
            <span class="con">{{ formatStopwatch(endMessage.realDuration) }}</span><span class="title2">总时长</span>
          </div>

          <el-divider direction="vertical" />
          <div class="popleNum">
            <span class="con">{{ endMessage.totalWatchNum }}</span><span class="title2">观看人次</span>
          </div>
        </div>
        <div class="share-bottom">
          <el-button
            class="share-share"
            @click="lookLive(false)"
          >
            退出直播间
          </el-button>
        </div>
      </div>
    </el-dialog>
    <el-dialog
      v-model="visible2"
      width="min(420px, 90vw)"
      center
      :show-close="true"
      top="0vh"
      class="dia-visible2"
      :close-on-press-escape="false"
      :close-on-click-modal="false"
    >
      <div class="visible2">
        <div class="con">
          <img
            src="~@/assets/imgs/classroom/wifi-close.png"
            alt="/"
          >
          <div class="vis-con">
            <div class="title">
              网络连接失败
            </div>
            <div class="cons">
              请检查网络状态并重新进入直播间
            </div>
          </div>
        </div>
        <div class="share-bottom">
          <el-button
            class="share-share"
            @click="goBack()"
          >
            返回首页
          </el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Setting } from '@element-plus/icons-vue';
import { formatStopwatch } from '@yunyan-live/utils';
import api from '@/api';
import { copyText } from '@/utils/webBridge';

interface RoomInfo {
  title?: string;
  speakerName?: string;
  joinCode?: string;
  duration?: number;
}

interface EndMessage {
  realDuration?: number;
  totalWatchNum?: number;
}

const props = withDefaults(
  defineProps<{
    isTeacher?: boolean;
    roomInfo: RoomInfo;
    btn?: boolean;
    liveType?: string;
    type?: string;
    roomId?: string;
    isSmall?: boolean;
    isInteraction?: number;
    chatVisible?: boolean;
    videosVisible?: boolean;
  }>(),
  {
    isTeacher: false,
    btn: false,
    liveType: 'hires',
    type: '',
    roomId: '',
    isSmall: false,
    isInteraction: 0,
    chatVisible: true,
    videosVisible: true
  }
);

const emit = defineEmits<{
  (e: 'lookLive', status: boolean): void;
  (e: 'openLive', status: boolean, liveType: string, type: string, liveTimeLen: number): void;
  (e: 'setLayouts', layoutNum: number): void;
  (e: 'recording', status: boolean, time: number): void;
  (e: 'update:chatVisible', value: boolean): void;
  (e: 'update:videosVisible', value: boolean): void;
}>();

const router = useRouter();

const isNavigating = ref(false);
const visible = ref(false);
const visible1 = ref(false);
const visible2 = ref(false);
const endMessage = ref<EndMessage>({});
const liveTypeLs = ref('');
const liveTimeLen = ref(0);
let time = 0;
const layoutNum = ref(props.isSmall ? 2 : 3);
const recordType = ref(false);
let recordTime = 0;
const recordTimeLen = ref(0);
const recordMouseType = ref(false);
let dia = false;
const delayed = ref(0);
const isDotNum = ref(0);

function getOnline() {
  if (!navigator.onLine) visible2.value = true;
}

onMounted(() => {
  window.addEventListener('online', getOnline);
  window.addEventListener('offline', getOnline);
  getOnline();
});

onUnmounted(() => {
  window.removeEventListener('online', getOnline);
  window.removeEventListener('offline', getOnline);
  if (!isNavigating.value) {
    if (props.isTeacher) openLives(false, 'hires', 'close');
    if (!props.isTeacher) lookLive(false);
  }
  clearInterval(time);
  clearInterval(recordTime);
});

function setIsDotNum(num: number) {
  if (num === 0) {
    isDotNum.value = 0;
  } else {
    isDotNum.value += 1;
  }
}

function setHires() {
  openLives(true, 'hires', 'open');
}

function sendTime(time: number) {
  delayed.value = time;
}

function copy(content: string) {
  void copyText(content);
  ElMessage.success('复制成功');
}

function lookLive(status: boolean) {
  isNavigating.value = true;
  emit('lookLive', status);
}

async function onLookLive(status: boolean) {
  if (!status) {
    setTime('close');
  }
}

async function endClass(liveTimeLen: number, participantCount: number) {
  visible.value = false;
  endMessage.value = { realDuration: Number(liveTimeLen), totalWatchNum: participantCount };
  visible1.value = true;
}

function goBack() {
  isNavigating.value = true;
  void router.push('/');
  visible1.value = false;
}

function end() {
  visible.value = true;
}

function openLives(status: boolean, liveType: string, type: string) {
  if (dia || liveTypeLs.value != '') return;
  setDiaBla(true);
  openLive(status, liveType, type, liveTimeLen.value);
}

function openLive(status: boolean, liveType: string, type: string, liveTimeLen: number) {
  if (recordType.value && (type === 'close' || type === 'stop')) {
    liveTypeLs.value = liveType;
    record(false, recordTimeLen.value);
  }
  emit('openLive', status, liveType, type, liveTimeLen);
}

function onOpenLive(status: boolean, liveType: string, type: string, participantCount = 0) {
  void status;
  void liveType;
  setDiaBla(false);
  if (type === 'close') {
    endClass(liveTimeLen.value, participantCount);
  }
  if ((type === 'open' && liveTimeLen.value == 0) || type === 'stop' || type === 'close')
    setTime(type);
}

function setDiaBla(status: boolean) {
  dia = status;
}

function setTime(type: string) {
  if (type === 'open') {
    time = setInterval(function () {
      liveTimeLen.value++;
    }, 1000);
  } else {
    clearInterval(time);
    time = 0;
    liveTimeLen.value = 0;
  }
}

async function setsTime(time: string) {
  setTime('close');
  try {
    const serverTime = await getServerTime();
    const fallbackMs = Number(serverTime) || Date.now();
    let startMs: number;
    if (!time || time === '0' || time === '') {
      startMs = fallbackMs;
    } else {
      startMs = time.includes('T') ? new Date(time).getTime() : Number(time);
    }
    const elapsed = Math.ceil((fallbackMs - startMs) / 1000);
    liveTimeLen.value = elapsed > 0 ? elapsed : 0;
  } catch {
    liveTimeLen.value = 0;
  }
  setTime('open');
}

async function getServerTime() {
  let serverTime = '';
  try {
    const req = await api.getNowTime();
    if (req.data.code === 1000) {
      serverTime = req.data.data.nowTime;
    }
  } catch (e) {
    console.error(e);
  }
  return serverTime;
}

function setLayout(num: number) {
  if (layoutNum.value === num) return;
  layoutNum.value = num;
  setLayouts(num);
}

function setLayouts(layoutNum: number) {
  emit('setLayouts', layoutNum);
}

function record(status: boolean, time: number) {
  if (dia) return;
  setDiaBla(true);
  recording(status, time);
}

function recording(status: boolean, time: number) {
  emit('recording', status, time);
}

function setRecord(status: boolean) {
  recordType.value = status;
  if (status) {
    recordTime = setInterval(function () {
      recordTimeLen.value++;
    }, 1000);
  } else {
    clearInterval(recordTime);
    recordTime = 0;
    recordTimeLen.value = 0;
    recordMouseType.value = false;
  }
  setDiaBla(false);
}

function recordMouse(status: boolean) {
  recordMouseType.value = status;
}

defineExpose({
  setIsDotNum,
  sendTime,
  onLookLive,
  endClass,
  setDiaBla,
  onOpenLive,
  setHires,
  setTime,
  setsTime,
  setRecord,
  setLayouts,
  openLives
});
</script>

<style lang="less" scoped>
@bgcolor: #e2e2e7;
.flex() {
  display: flex;
  align-items: center;
}

.top {
  position: relative;
  .flex();
  flex-direction: column;
  .title {
    text-align: center;
    height: 44px;
    position: absolute;
    line-height: 44px;
  }
}

.classroom-top {
  width: 100vw;
  height: 44px;
  background: #efeff4;
  font-size: 12px;
  color: #404040;
  .flex();
  .left {
    .flex();
    margin-left: 4px;
    height: 100%;

    .left-pointer {
      cursor: pointer;
    }
    .top-left {
      margin-left: 8px;
      border-radius: 6px;
      .tf {
        width: 18px;
        height: 18px;
        .flex();
        justify-content: center;
      }
      img {
        width: 32px;
        height: 32px;
      }
      .el-icon {
        vertical-align: middle;
      }
      &:hover {
        background: @bgcolor;
      }
      span {
        margin-right: 10px;
      }
    }
  }

  .right {
    .flex();
    margin-left: auto;
    .top-right {
      cursor: pointer;
      margin-right: 6px;
      height: 32px;
      border-radius: 6px;
      width: 88px;
      justify-content: center;
      &:hover {
        background: @bgcolor;
      }
      &:active {
        background: #ffffff;
      }
      img {
        width: 16px;
      }
      .el-icon {
        vertical-align: middle;
      }
    }
  }
  .closebgcolor {
    color: #e0383e;
    border: 1px solid #e0383e;
  }
  .content {
    .flex();
    img {
      margin-right: 4px;
    }
    .el-icon {
      margin-right: 4px;
    }
  }
}
.click-btn {
  background: #e2e2e7;
  border-radius: 6px;
  cursor: not-allowed;
}
ul {
  padding: 0;
  padding-inline-start: 0px !important;
  margin-block-start: 0px !important;
  margin-block-end: 0px !important;
  li {
    list-style-type: none;
    font-size: 12px;
    height: 18px;
    line-height: 18px;
    color: #404040;
    .flex();
    font-weight: 500;
    margin-bottom: 8px;
    .copy {
      font-size: 14px;
      width: 14px;
      height: 14px;
      margin-left: 7px;
      cursor: pointer;
      vertical-align: middle;
    }
    .name {
      color: #989898;
      flex-shrink: 0;
      width: 60px;
    }
  }
}
.layout {
  li {
    height: 32px;
    line-height: 32px;
    cursor: pointer;
  }
  .not {
    cursor: not-allowed;
  }
  img {
    width: 32px;
    margin-right: 8px;
  }
  .el-icon {
    font-size: 32px;
    width: 32px;
    height: 32px;
    margin-right: 8px;
    vertical-align: middle;
  }
}
.settings-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dia-visibles {
  .flex();
}
.dia-visible2 {
  .flex();
  .con {
    color: #ffffff;
    .flex();
    img {
      width: 52px;
      height: 37px;
    }
    .vis-con {
      margin-left: 14px;
      .title {
        font-weight: 500;
        line-height: 33px;
        font-size: 22px;
        height: 33px;
      }
      .cons {
        height: 20px;
        font-size: 14px;
        font-weight: 400;
        line-height: 20px;
        margin-top: 38px;
      }
    }
  }
  .share-bottom {
    margin-top: 44px;
    .share-share {
      width: 296px;
      height: 56px;
      border-radius: 28px;
      border: 2px solid #ffffff;
      background: unset;
    }
  }
}
.visible {
  width: 100%;
  .share-bottom {
    .flex();
    justify-content: center;
    margin-top: 19px;
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
.dia-visible {
  .el-dialog {
    border-radius: 12px;
  }
  .el-dialog__body {
    padding: 0 20px 30px;
  }
  .visible1 {
    text-align: center;
    .title1 {
      color: #303133;
      font-size: 22px;
      font-weight: 500;
      text-align: center;
      height: 33px;
      line-height: 33px;
    }
    .title2 {
      color: #909399;
      font-size: 14px;
      height: 20px;
      line-height: 20px;
      text-align: center;
      font-weight: 400;
      margin-top: 5px;
    }
    .con {
      font-weight: bold;
      color: #303133;
      line-height: 29px;
      height: 29px;
      font-size: 20px;
    }
    .num {
      display: flex;
      align-items: center;
      margin-top: 33px;
      justify-content: center;
      height: 64px;
      .timeLen {
        flex-flow: column;
        display: flex;
        align-items: center;
      }
      .popleNum {
        flex-flow: column;
        display: flex;
        align-items: center;
      }
    }
    .share-bottom {
      margin-top: 32px;
      .el-button.el-button--default {
        width: 296px;
        height: 56px;
        font-weight: bold;
        border-radius: 28px;
        span {
          font-size: 16px;
          color: #ffffff;
        }
      }
      .share-share {
        background: #0f74ff;
        border-color: #0f74ff;
      }
    }
  }
}
.lay1 {
  left: 40px !important;
}
.lay2 {
  left: 80px !important;
}
.el-popover {
  background: #efeff4 !important;
}
.dia-visibles {
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
  .visible {
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
}

.dia-visible,
.dia-visible2 {
  .el-dialog__header {
    display: none;
  }
  .el-divider--vertical {
    width: 2px;
    height: 60px;
    background: rgba(204, 204, 204, 0.5);
    padding: 0px;
  }
  .el-dialog {
    background: unset;
    -webkit-box-shadow: unset;
    box-shadow: unset;
  }
  .el-button.el-button--default {
    span {
      font-weight: bold;
      color: #ffffff;
      line-height: 24px;
      height: 24px;
      font-size: 16px;
    }
  }
}
</style>
