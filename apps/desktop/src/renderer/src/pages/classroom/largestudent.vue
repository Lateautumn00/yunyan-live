<template>
  <div class="large-student">
    <Top
      ref="top"
      v-model:chat-visible="chatVisible"
      :is-teacher="isTeacher"
      :is-interaction="isInteraction"
      :room-info="roomInfo"
      :room-id="roomId"
      :btn="btn"
      :live-type="liveType"
      @look-live="lookLive"
      @set-layouts="setLayouts"
      @open-live="openLive"
    />
    <FlexibleLayout :enable-videos="false">
      <template #whiteboard>
        <div class="whiteboard-wrapper">
          <div
            v-show="dis"
            class="player"
          >
            <div id="div5">
              <VideoPlayer :is-muted="true" />
            </div>
          </div>
          <div class="player1">
            <div id="div1">
              <WhiteBoard
                :is-teacher="isTeacher"
                :is-display="isDisplay"
                :room-id="roomId"
                :opaque-id="opaqueId"
                :teacher-stage="teacherStage"
                :user-name="userName"
                :layouts="3"
              />
            </div>
            <div
              v-show="false"
              id="div3"
            />
          </div>
        </div>
      </template>
      <template #chat>
        <div class="chat-area">
          <TabBar
            :tabs="[
              { key: 'playback', label: '回放', badge: playbackNum },
              { key: 'chat', label: '聊天', badge: chatNum },
              { key: 'people', label: `人数(${num})` },
            ]"
            :active-name="activeName"
            :max="max"
            @click="handleClick"
          />
          <div class="tab-cons">
            <History
              v-show="activeName === 'playback'"
              ref="history"
              :is-teacher="isTeacher"
              @paly-history-video="palyHistoryVideo"
            />
            <Apply
              v-if="!isTeacher"
              v-show="activeName === 'chat'"
              ref="apply"
              :is-teacher="isTeacher"
              :is-interaction="isInteraction"
              @is-talking="isTalking"
              @stop-application="stopApplication"
            />
            <Chat
              v-show="activeName === 'chat'"
              ref="chat"
              :room-id="roomId"
              :live-user-id="opaqueId"
              :user-name="userName"
              :is-teacher="isTeacher"
              :is-interaction="isInteraction"
              :btn="btn"
              @apply="handleApply"
              @update-num="updateNum"
              @send-time="sendTime"
              @get-white-board="getWhiteBoard"
              @live-started="onLiveStarted"
            />
            <Pople
              v-show="activeName === 'people'"
              ref="pople"
              :live-user-id="opaqueId"
            />
          </div>
        </div>
      </template>
    </FlexibleLayout>
    <VideoView
      ref="video"
      :room-info="roomInfo"
      :is-interaction="isInteraction"
      :opaque-id="opaqueId"
      :is-teacher="isTeacher"
      :room-id="roomId"
      :user-name="userName"
      @set-display="setDisplay"
      @pall="pall"
      @on-look-live="onLookLive"
      @update-pople-list="updatePopleList"
      @pople-num="popleNum"
      @video-list="videoList"
      @application="application"
      @set-audio-all="setAudioAll"
      @set-time="setTime"
      @student-media-stream="studentMediaStream"
      @set-hires="setHires"
      @act="act"
      @set-live-type="setLiveType"
      @set-dia-bla="setDiaBla"
      @set-camera-type="setCameraType"
      @participant-join="onParticipantJoin"
      @participant-leave="onParticipantLeave"
      @broadcast-start="onBroadcastStart"
      @broadcast-stop="onBroadcastStop"
    />
    <HistoryVideoDialog
      :visible="centerDialogVisible"
      :play-id="playId"
      :play-title="playTitle"
      :opaque-id="opaqueId"
      @close="closedPlay"
    />
    <ClassNotification ref="classNotification" />
  </div>
</template>
<script lang="ts">
// @ts-nocheck — TODO: align event-handler types with sub-component emits
import { defineComponent, ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import Top from '@/components/ClassRoom/Top.vue';
import History from '@/components/ClassRoom/History.vue';
import WhiteBoard from '@/components/ClassRoom/WhiteBoard.vue';
import VideoView from '@/components/ClassRoom/Video.vue';
import Chat from '@/components/ClassRoom/Chat.vue';
import Pople from '@/components/ClassRoom/Pople.vue';
import Apply from '@/components/ClassRoom/Apply.vue';
import api from '@/api';
import TabBar from '@/components/ClassRoom/TabBar.vue';
import HistoryVideoDialog from '@/components/ClassRoom/HistoryVideoDialog.vue';
import FlexibleLayout from '@/components/ClassRoom/FlexibleLayout.vue';
import ClassNotification from '@/components/ClassRoom/ClassNotification.vue';

export default defineComponent({
  name: 'LargeStudent',
  components: {
    Top,
    WhiteBoard,
    VideoView,
    Chat,
    Pople,
    History,
    Apply,
    TabBar,
    HistoryVideoDialog,
    FlexibleLayout,
    ClassNotification,
  },
  setup() {
    const router = useRouter();
    const route = useRoute();
    const roomId = (route.query.roomId as string) || '';
    const nickName = (route.query.nickName as string) || '';
    const top = ref<InstanceType<typeof Top> | null>(null);
    const video = ref<InstanceType<typeof VideoView> | null>(null);
    const chat = ref<InstanceType<typeof Chat> | null>(null);
    const apply = ref<InstanceType<typeof Apply> | null>(null);
    const pople = ref<InstanceType<typeof Pople> | null>(null);
    const history = ref<InstanceType<typeof History> | null>(null);
    const classNotification = ref<InstanceType<typeof ClassNotification> | null>(null);

    const centerDialogVisible = ref(false);
    const playId = ref('');
    const playTitle = ref('');
    const playbackNum = ref(0);
    const chatNum = ref(0);
    const max = ref(99);
    const userName = ref(nickName);
    const opaqueId = ref(Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
    const isTeacher = ref(false);
    const activeName = ref('chat');
    const layoutNum = ref(3);
    const chatVisible = ref(true);
    const isDisplay = ref(true);
    const roomInfo = ref<{ status: number; [key: string]: unknown }>({ status: 0 });
    const num = ref(0);
    const isInteraction = ref(0);
    const btn = ref(false);
    const teacherStage = ref<{ [key: string]: unknown } | null>(null);
    const wbdata = ref('');
    const liveType = ref('');
    const type = ref('');
    const dis = ref('');

    function act(data: string) {
      console.log('1白板实时接收消息', data);
      if (data !== '|WBDATAEND|') {
        wbdata.value += data;
      } else {
        try {
          console.log('拼接完成数据字符串');
          teacherStage.value = JSON.parse(wbdata.value);
          wbdata.value = '';
        } catch (_err) {
          console.error('获取白板数据字符串出错', wbdata.value);
          wbdata.value = '';
        }
      }
    }

    function getWhiteBoard(data: Record<string, unknown>) {
      console.log('白板历史信息', data);
      teacherStage.value = data;
    }

    function onLiveStarted() {
      video.value?.retryExists();
    }

    function sendTime(time: string) {
      top.value?.sendTime(time);
    }

    function closedPlay() {
    }

    function palyHistoryVideo(id: string, title: string) {
      playId.value = id;
      playTitle.value = title;
      centerDialogVisible.value = true;
    }

    function updateNum(status: boolean, numArg: number, typeStr: string) {
      if (layoutNum.value === 1) top.value?.setIsDotNum(1);
      if (activeName.value === typeStr) return;
      if (status) {
        if (typeStr === 'playback') playbackNum.value += numArg;
        if (typeStr === 'chat') chatNum.value += numArg;
      } else {
        if (numArg === 0) {
          if (typeStr === 'playback') playbackNum.value = 0;
          if (typeStr === 'chat') chatNum.value = 0;
        } else {
          if (typeStr === 'playback') playbackNum.value -= numArg;
          if (typeStr === 'chat') chatNum.value -= numArg;
        }
      }
    }

    function lookLive(status: boolean) {
      video.value?.lookLive(status);
    }

    function onLookLive(status: boolean, _type: string, liveTimeLen: number) {
      if (status && btn.value === false) getRoomInfo(false);
      btn.value = status;
      top.value?.onLookLive(status);
      if (!status) {
        if (_type == 'end' || _type == '') socketClose();
        stopApplication();
        if (_type == '') router.push('/');
        if (_type == 'end') top.value?.endClass(liveTimeLen, num.value);
      }
    }

    function isTalking(talkType: number, userType: string) {
      video.value?.isTalking(talkType, userType);
    }

    function setHires() {
      top.value?.setHires();
    }

    function setDiaBla(status: boolean) {
      top.value?.setDiaBla(status);
      setLiveType(liveType.value);
    }

    function setLiveType(_liveType: string) {
      liveType.value = _liveType;
    }

    function openLive(status: boolean, _liveType: string, _type: string, liveTimeLen: number) {
      if (_liveType !== 'screen') liveType.value = _liveType;
      type.value = _type;
      video.value?.openLive(status, _liveType, _type, liveTimeLen);
    }

    function setCameraType(_status: boolean) {
    }

    function studentMediaStream(_stream: MediaStream, _display: string, _id: string) {
      setDiaBla(false);
    }

    function stopApplication() {
      video.value?.stopApplication();
    }

    function setAudioAll(user: string) {
      apply.value?.setAudioAll(user);
    }

    function handleApply(status: boolean, numArg: number) {
      isInteraction.value = status ? 1 : 0;
      video.value?.apply(status, numArg);
    }

    function videoList(status: boolean, data: Record<string, unknown>) {
      if (status) {
        history.value?.videoLists(status, data);
      } else {
        history.value?.setSplice((data as { index: number }).index);
      }
      updateNum(status, 1, 'playback');
    }

    function application(numArg: number, message: string) {
      isInteraction.value = numArg;
      if (message !== '') ElMessage.success(message);
    }

    async function getRoomInfo(status: boolean, retryCount = 0) {
      try {
        const dataMessage = await api.show_room_info({ roomId });
        const { code, data, msg } = dataMessage.data;
        if (code === 1000) {
          roomInfo.value = data;
          if (data.status == 2) {
            top.value?.setsTime(data.liveStartedAt || Date.now().toString());
          }
          if (status) {
            if (data.videoList?.length) {
              const list = data.videoList.reverse();
              list.forEach((item: Record<string, unknown>) => {
                videoList(true, item);
              });
            }
            video.value?.setInit();
            chat.value?.createTutorSocket();
          }
        } else {
          ElMessage.error(msg);
          router.push('/');
        }
      } catch (e) {
        console.error('getRoomInfo failed:', e);
        if (retryCount < 1) {
          setTimeout(() => getRoomInfo(status, retryCount + 1), 2000);
        } else {
          ElMessage.error('获取房间信息失败，请检查网络连接');
          setTimeout(() => router.push('/'), 1500);
        }
      }
    }

    function setTime(typeStr: string) {
      top.value?.setTime(typeStr);
    }

    function popleNum(numArg: number) {
      num.value = numArg;
    }

    function socketClose() {
      chat.value?.liveSocketClose();
    }

    function updatePopleList(poples: unknown[]) {
      pople.value?.updatePopleList(poples);
    }

    function handleClick(tab: string) {
      if (tab === 'people') video.value?.listparticipants();
      if (tab === 'playback' || tab === 'chat') updateNum(false, 0, tab);
      activeName.value = tab;
    }

    function setLayouts(_layoutNum: number) {
      layoutNum.value = _layoutNum;
      chatVisible.value = _layoutNum !== 1;
    }

    function setDisplay2(disStr: string, mouse: string) {
      if (!isDisplay.value) {
        setDisplay();
      }
      if (mouse === 'over' && dis.value === disStr) return;
      dis.value = mouse === 'over' ? disStr : '';
      const el = document.querySelector('.large-student') as HTMLElement | null;
      if (!el) return;
      const disChild = el.querySelector(`#${disStr}`)?.firstChild as Node | null;
      const divChild = el.querySelector('#div5')?.firstChild as Node | null;
      if (disChild && divChild) {
        el.querySelector('#div5')?.appendChild(disChild);
        el.querySelector(`#${disStr}`)?.appendChild(divChild);
      }
    }

    function setDisplay() {
      if (dis.value === 'over') {
        setDisplay2(dis.value, 'leave');
      }
      const el = document.querySelector('.large-student') as HTMLElement | null;
      if (!el) return;
      const div1 = el.querySelector('#div1');
      const div2 = el.querySelector('#div2');
      const div3 = el.querySelector('#div3');
      const div4 = el.querySelector('#div4');
      if (!div1 || !div2 || !div3 || !div4) return;
      if (isDisplay.value) {
        div3.before(div2);
        div4.before(div1);
      } else {
        div3.before(div1);
        div4.before(div2);
      }
      isDisplay.value = !isDisplay.value;
    }

    function pall() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ele = (video.value as any)?.$refs?.videoPlayer?.$refs?.videoPlayers;
      if (!ele) return;
      if (ele.requestFullscreen) {
        ele.requestFullscreen();
      } else if (ele.mozRequestFullScreen) {
        ele.mozRequestFullScreen();
      } else if (ele.webkitRequestFullScreen) {
        ele.webkitRequestFullScreen();
      } else if (ele.msRequestFullscreen) {
        ele.msRequestFullscreen();
      } else if (ele.webkitEnterFullScreen || ele.enterFullScreen) {
        if (ele.webkitEnterFullscreen) ele.webkitEnterFullscreen();
        if (ele.enterFullScreen) ele.enterFullScreen();
      }
    }

    function onParticipantJoin(name: string) {
      console.log('[LargeStudent] onParticipantJoin:', name);
      classNotification.value?.add(`${name} 进入直播间`);
    }

    function onParticipantLeave(name: string) {
      console.log('[LargeStudent] onParticipantLeave:', name);
      classNotification.value?.add(`${name} 离开直播间`);
    }

    function onBroadcastStart() {
      classNotification.value?.add('开始直播');
    }

    function onBroadcastStop(status?: string) {
      classNotification.value?.add(status === 'stop' ? '暂停直播' : '直播已结束');
    }

    onBeforeUnmount(() => {
      if (roomId) {
        void api.leave_room(roomId).catch(() => {});
      }
    });

    onMounted(() => {
      getRoomInfo(true);
    });

    return {
      roomId, top, video, chat, apply, pople, history,
      classNotification, centerDialogVisible, playId, playTitle, playbackNum,
      chatNum, max, userName, opaqueId, isTeacher, activeName, layoutNum,
      chatVisible,
      isDisplay, roomInfo, num, isInteraction, btn, teacherStage, wbdata,
      liveType, type, dis, act, getWhiteBoard, sendTime, closedPlay,
      palyHistoryVideo, updateNum, lookLive, onLookLive, openLive, isTalking,
      setHires, setDiaBla, setLiveType, setCameraType,
      stopApplication, setAudioAll, studentMediaStream, handleApply, videoList, application,
      getRoomInfo, setTime, popleNum, socketClose, updatePopleList,
      handleClick, setLayouts, setDisplay2, setDisplay, pall, onLiveStarted,
      onParticipantJoin, onParticipantLeave,
      onBroadcastStart, onBroadcastStop
    };
  }
});
</script>
<style lang="less" scoped>
.large-student {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  .whiteboard-wrapper,
  #div1,
  .player {
    width: 100%;
    height: 100%;
  }
  .whiteboard-wrapper {
    position: relative;
  }
  .player {
    display: flex;
    align-items: center;
    background: #000000;
    justify-content: center;
    z-index: 999;
  }
  .chat-area {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .tab-cons {
    flex: 1;
    overflow: hidden;
    border-left: 1px solid #efeff4;
    border-right: 1px solid #efeff4;
    background: #fff;
  }
}
</style>
