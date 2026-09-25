<template>
  <div class="large-teacher">
    <Top
      ref="top"
      v-model:chat-visible="chatVisible"
      :is-teacher="isTeacher"
      :room-info="roomInfo"
      :room-id="roomId"
      :live-type="liveType"
      :type="type"
      :btn="btn"
      @open-live="openLive"
      @look-live="lookLive"
      @set-layouts="setLayouts"
      @recording="recording"
    />
    <FlexibleLayout
      v-model:chat-visible="chatVisible"
      :enable-videos="false"
    >
      <template #whiteboard>
        <div class="whiteboard-wrapper">
          <div class="player">
            <div id="div1">
              <WhiteBoard
                :is-teacher="isTeacher"
                :is-display="isDisplay"
                :room-id="roomId"
                :opaque-id="opaqueId"
                :teacher-stage="teacherStage"
                :layouts="3"
                @paint-log="sendWhiteboardNews"
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
              { key: 'raisehands', label: '举手', badge: raisehandsNum },
              { key: 'chat', label: '聊天', badge: chatNum },
              { key: 'people', label: `人数(${num})` },
            ]"
            :active-name="activeName"
            :max="max"
            @click="handleClick"
          />
          <div class="tab-cons">
            <Apply
              v-show="activeName === 'raisehands'"
              ref="apply"
              :is-teacher="isTeacher"
              :is-interaction="isInteraction"
              @agree="agree"
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
              @update-num="updateNum"
              @send-time="sendTime"
              @get-white-board="getWhiteBoard"
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
      :is-teacher="isTeacher"
      :opaque-id="opaqueId"
      :room-id="roomId"
      :user-name="userName"
      :is-interaction="isInteraction"
      :room-title="roomInfo.title"
      :teacher-name="roomInfo.speakerName"
      @on-open-live="onOpenLive"
      @set-display="setDisplay"
      @pall="pall"
      @set-record="setRecord"
      @update-pople-list="updatePopleList"
      @pople-num="popleNum"
      @video-list="videoList"
      @apply-list="applyList"
      @application="application"
      @set-audio-all="setAudioAll"
      @set-hires="setHires"
      @act="act"
      @set-live-type="setLiveType"
      @set-dia-bla="setDiaBla"
      @room-created="onRoomCreated"
      @participant-join="onParticipantJoin"
      @participant-leave="onParticipantLeave"
      @broadcast-start="onBroadcastStart"
      @broadcast-stop="onBroadcastStop"
    />
    <ClassNotification ref="classNotification" />
  </div>
</template>
<script lang="ts">
// @ts-nocheck — TODO: align event-handler types with sub-component emits
import { defineComponent, ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import Top from '@/components/ClassRoom/Top.vue';
import WhiteBoard from '@/components/ClassRoom/WhiteBoard.vue';
import VideoView from '@/components/ClassRoom/Video.vue';
import Chat from '@/components/ClassRoom/Chat.vue';
import Pople from '@/components/ClassRoom/Pople.vue';
import Apply from '@/components/ClassRoom/Apply.vue';
import api from '@/api';
import TabBar from '@/components/ClassRoom/TabBar.vue';
import FlexibleLayout from '@/components/ClassRoom/FlexibleLayout.vue';
import ClassNotification from '@/components/ClassRoom/ClassNotification.vue';

export default defineComponent({
  name: 'LargeTeacher',
  components: {
    Top,
    WhiteBoard,
    VideoView,
    Chat,
    Pople,
    Apply,
    TabBar,
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
    const classNotification = ref<InstanceType<typeof ClassNotification> | null>(null);

    const raisehandsNum = ref(0);
    const chatNum = ref(0);
    const max = ref(99);
    const userName = ref(nickName);
    const opaqueId = ref(Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
    const isTeacher = ref(true);
    const activeName = ref('chat');
    const layoutNum = ref(3);
    const chatVisible = ref(true);
    const isDisplay = ref(true);
    const roomInfo = ref<{ status: number; [key: string]: unknown }>({ status: 0 });
    const num = ref(0);
    const isInteraction = ref(0);
    const liveType = ref('');
    const type = ref('');
    const btn = ref(false);
    const teacherStage = ref<{ [key: string]: unknown } | null>(null);

    function onRoomCreated() {
      chat.value?.setSocketSend(
        JSON.stringify({
          type: 'live_started',
          data: { liveMsg: { roomId } }
        })
      );
    }

    function sendWhiteboardNews(data: string) {
      const datastring = JSON.stringify(data);
      const base = 10240;
      const n = Math.ceil(datastring.length / base);
      new Promise<void>((resolve) => {
        const string = datastring;
        for (let i = 0; i < n; i++) {
          const v = string.substring(i * base, (i + 1) * base);
          video.value?.sendData(
            'public',
            JSON.stringify({ type: 0, data: v })
          );
        }
        resolve();
      }).then(() => {
        video.value?.sendData(
          'public',
          JSON.stringify({ type: 0, data: '|WBDATAEND|' })
        );
      });
      chat.value?.setSocketSend(
        JSON.stringify({
          type: 'whiteBoard',
          data: { liveMsg: { roomId: roomId, msg: data } }
        })
      );
    }

    function act(data: string) {
      console.log('白板实时接收消息...', data);
    }

    function getWhiteBoard(data: Record<string, unknown>) {
      console.log('白板历史信息', data);
      teacherStage.value = data;
    }

    function sendTime(time: string) {
      top.value?.sendTime(time);
    }

    function updateNum(status: boolean, numArg: number, typeStr: string) {
      if (activeName.value === typeStr) return;
      if (status) {
        if (typeStr === 'raisehands') raisehandsNum.value += numArg;
        if (typeStr === 'chat') chatNum.value += numArg;
      } else {
        if (numArg === 0) {
          if (typeStr === 'raisehands') raisehandsNum.value = 0;
          if (typeStr === 'chat') chatNum.value = 0;
        } else {
          if (typeStr === 'raisehands') raisehandsNum.value -= numArg;
          if (typeStr === 'chat') chatNum.value -= numArg;
        }
      }
    }

    function socketClose() {
      chat.value?.liveSocketClose();
    }

    function openLive(status: boolean, _liveType: string, _type: string, liveTimeLen: number) {
      if (_liveType !== 'screen') setLiveType(_liveType);
      type.value = _type;
      video.value?.openLive(status, _liveType, _type, liveTimeLen);
    }

    function lookLive(status: boolean) {
      video.value?.lookLive(status);
      if (!status) {
        stopApplication();
        socketClose();
        router.push('/');
      }
    }

    function setDiaBla(status: boolean) {
      top.value?.setDiaBla(status);
    }

    function setLiveType(_liveType: string) {
      liveType.value = _liveType;
    }

    function onOpenLive(status: boolean, _liveType: string, _liveTimeLen: number) {
      btn.value = status;
      top.value?.onOpenLive(status, liveType.value, type.value, num.value);
      if (type.value === 'close') {
        socketClose();
      }
    }

    function application(numArg: number, message = '') {
      isInteraction.value = numArg;
      if (message !== '') ElMessage.success(message);
    }

    function setAudioAll(user: string) {
      apply.value?.setAudioAll(user);
    }

    function isTalking(talkType: number) {
      video.value?.isTalkingTxt(talkType);
    }

    function stopApplication() {
      video.value?.stopApplicationTxt();
    }

    function popleNum(numArg: number) {
      num.value = numArg;
    }

    function applyList(status: boolean, data: unknown) {
      apply.value?.applyList(status, data);
      updateNum(status, 1, 'raisehands');
    }

    function agree(status: boolean, item: unknown, _index: number, numArg: number) {
      video.value?.apply(status, numArg, item);
    }

    async function getRoomInfo(retryCount = 0) {
      try {
        const dataMessage = await api.show_room_info({ roomId });
        const { code, data, msg } = dataMessage.data;
        if (code === 1000) {
          roomInfo.value = data;
          if (data.status == 2) {
            top.value?.setsTime(data.liveStartedAt || Date.now().toString());
          }
          video.value?.setInit();
          chat.value?.createTutorSocket();
        } else {
          ElMessage.error(msg);
          router.push('/');
        }
      } catch (e) {
        console.error('getRoomInfo failed:', e);
        if (retryCount < 1) {
          setTimeout(() => getRoomInfo(retryCount + 1), 2000);
        } else {
          ElMessage.error('获取房间信息失败，请检查网络连接');
          setTimeout(() => router.push('/'), 1500);
        }
      }
    }

    function setHires() {
      if (roomInfo.value.status == 2) top.value?.setHires();
    }

    function handleClick(tab: string) {
      if (tab === 'people') video.value?.listparticipants();
      if (tab === 'raisehands' || tab === 'chat')
        updateNum(false, 0, tab);
      activeName.value = tab;
    }

    function setLayouts(num: number) {
      layoutNum.value = num;
      chatVisible.value = num !== 1;
    }

    async function recording(status: boolean, time: string) {
      video.value?.recording(status, time);
    }

    function setRecord(status: boolean) {
      top.value?.setRecord(status);
    }

    function updatePopleList(poples: unknown[]) {
      pople.value?.updatePopleList(poples);
    }

    function setDisplay() {
      const el = document.querySelector('.large-teacher') as HTMLElement | null;
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
      console.log('[LargeTeacher] onParticipantJoin:', name);
      classNotification.value?.add(`${name} 进入直播间`);
    }

    function onParticipantLeave(name: string) {
      console.log('[LargeTeacher] onParticipantLeave:', name);
      classNotification.value?.add(`${name} 离开直播间`);
    }

    function onBroadcastStart() {
      classNotification.value?.add('开始直播');
    }

    function onBroadcastStop(status?: string) {
      classNotification.value?.add(status === 'stop' ? '暂停直播' : '直播已结束');
    }

    onMounted(() => {
      getRoomInfo();
    });

    return {
      roomId, top, video, chat, apply, pople,
      classNotification, raisehandsNum,
      chatNum, max, userName, opaqueId, isTeacher, activeName, layoutNum,
      chatVisible,
      isDisplay, roomInfo, num, isInteraction, liveType, type, btn, teacherStage,
      sendWhiteboardNews, act, getWhiteBoard, sendTime,
      updateNum, socketClose, openLive, lookLive, setDiaBla,
      setLiveType, onOpenLive, application, setAudioAll, isTalking,
      stopApplication, popleNum, applyList, agree,
      getRoomInfo, setHires, handleClick, setLayouts, recording, setRecord,
      updatePopleList, setDisplay, pall, onRoomCreated,
      onParticipantJoin, onParticipantLeave,
      onBroadcastStart, onBroadcastStop
    };
  }
});
</script>
<style lang="less" scoped>
.large-teacher {
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
