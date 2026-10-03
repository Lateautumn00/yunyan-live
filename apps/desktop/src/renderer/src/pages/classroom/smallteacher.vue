<template>
  <div class="small-teacher">
    <Top
      ref="top"
      v-model:chat-visible="chatVisible"
      v-model:videos-visible="videosVisible"
      :is-teacher="isTeacher"
      :room-info="roomInfo"
      :room-id="roomId"
      :live-type="liveType"
      :type="type"
      :btn="btn"
      :is-small="true"
      @open-live="openLive"
      @look-live="lookLive"
      @set-layouts="setLayouts"
      @recording="recording"
    />
    <FlexibleLayout
      v-model:chat-visible="chatVisible"
      v-model:videos-visible="videosVisible"
    >
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
      <template #student-videos>
        <VideoList
          ref="videoListComp"
          :is-teacher="isTeacher"
          :opaque-id="opaqueId"
          :is-interaction="isInteraction"
          @is-talking="isTalking"
          @stop-application="stopApplication"
          @set-display2="setDisplay2"
        />
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
      @apply-list="applyList"
      @application="application"
      @set-audio-all="setAudioAll"
      @student-media-stream="studentMediaStream"
      @del-user-list="delUserList"
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
import { uid } from '@yunyan-live/utils';
import Top from '@/components/ClassRoom/Top.vue';
import VideoView from '@/components/ClassRoom/Video.vue';
import Chat from '@/components/ClassRoom/Chat.vue';
import Apply from '@/components/ClassRoom/Apply.vue';
import VideoList from '@/components/ClassRoom/Small/VideoList.vue';
import Pople from '@/components/ClassRoom/Pople.vue';
import api from '@/api';
import WhiteBoard from '@/components/ClassRoom/WhiteBoard.vue';
import TabBar from '@/components/ClassRoom/TabBar.vue';
import FlexibleLayout from '@/components/ClassRoom/FlexibleLayout.vue';
import ClassNotification from '@/components/ClassRoom/ClassNotification.vue';

export default defineComponent({
  name: 'SmallTeacher',
  components: {
    Top,
    VideoView,
    Chat,
    Apply,
    Pople,
    WhiteBoard,
    VideoList,
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
    const videoListComp = ref<InstanceType<typeof VideoList> | null>(null);
    const classNotification = ref<InstanceType<typeof ClassNotification> | null>(null);

    const raisehandsNum = ref(0);
    const chatNum = ref(0);
    const max = ref(99);
    const userName = ref(nickName);
    const opaqueId = ref(uid());
    const isTeacher = ref(true);
    const activeName = ref('chat');
    const layoutNum = ref(3);
    const chatVisible = ref(true);
    const videosVisible = ref(true);
    const isDisplay = ref(true);
    const roomInfo = ref<{ status: number; [key: string]: unknown }>({ status: 0 });
    const num = ref(0);
    const isInteraction = ref(0);
    const liveType = ref('');
    const type = ref('');
    const btn = ref(false);
    const dis = ref('');
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
      const that = { roomId: roomId };
      const datastring = JSON.stringify(data);
      const base = 10240;
      const n = Math.ceil(datastring.length / base);
      new Promise<void>((resolve) => {
        const string = datastring;
        new Promise<void>((resolve2) => {
          for (let i = 0; i < n; i++) {
            const v = string.substring(i * base, (i + 1) * base);
            video.value?.sendData(
              'public',
              JSON.stringify({ type: 0, data: v })
            );
          }
          resolve2();
        }).then(() => {
          resolve();
        });
      }).then(() => {
        video.value?.sendData(
          'public',
          JSON.stringify({ type: 0, data: '|WBDATAEND|' })
        );
      });
      chat.value?.setSocketSend(
        JSON.stringify({
          type: 'whiteBoard',
          data: { liveMsg: { roomId: that.roomId, msg: data } }
        })
      );
    }

    function act(data: string) {
      console.log('白板实时接收消息', data);
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
      videoListComp.value?.setAudioAll(user);
    }

    function isTalking(talkType: number, userType: string) {
      video.value?.isTalkingTxt(talkType, userType);
    }

    function stopApplication() {
      video.value?.stopApplicationTxt();
    }

    function popleNum(numArg: number) {
      num.value = numArg;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function applyList(status: boolean, data: any) {
      apply.value?.applyList(status, data);
      updateNum(status, 1, 'raisehands');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function agree(status: boolean, item: any, _index: number, numArg: number) {
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
      videosVisible.value = num !== 1;
    }

    async function recording(status: boolean, time: number) {
      video.value?.recording(status, time);
    }

    function setRecord(status: boolean) {
      top.value?.setRecord(status);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function updatePopleList(poples: any[]) {
      pople.value?.updatePopleList(poples);
    }

    function setDisplay2(disStr: string, mouse: string) {
      if (!isDisplay.value) {
        setDisplay();
      }
      if (mouse === 'over' && dis.value === disStr) return;
      dis.value = mouse === 'over' ? disStr : '';
      const el = document.querySelector('.small-teacher') as HTMLElement | null;
      if (!el) return;
      const disChild = el.querySelector(`#${disStr}`)?.firstChild as Node | null;
      const divChild = el.querySelector('#div5')?.firstChild as Node | null;
      if (disChild && divChild) {
        el.querySelector('#div5')?.appendChild(disChild);
        el.querySelector(`#${disStr}`)?.appendChild(divChild);
      }
    }

    function setDisplay() {
      if (dis.value == 'over') {
        setDisplay2(dis.value, 'leave');
      }
      const el = document.querySelector('.small-teacher') as HTMLElement | null;
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function studentMediaStream(stream: any, display: string[], id: string) {
      videoListComp.value?.studentMediaStream(stream, display, id);
    }

    function delUserList(leaving: string) {
      videoListComp.value?.delUserList(leaving);
    }

    function onParticipantJoin(name: string) {
      console.log('[SmallTeacher] onParticipantJoin:', name);
      classNotification.value?.add(`${name} 进入直播间`);
    }

    function onParticipantLeave(name: string) {
      console.log('[SmallTeacher] onParticipantLeave:', name);
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
      videoListComp, classNotification, raisehandsNum,
      chatNum, max, userName, opaqueId, isTeacher, activeName, layoutNum,
      chatVisible, videosVisible,
      isDisplay, roomInfo, num, isInteraction, liveType, type, btn, dis,
      teacherStage,
      sendWhiteboardNews, act, getWhiteBoard, sendTime,
      updateNum, socketClose, openLive, lookLive, setDiaBla,
      setLiveType, onOpenLive, application, setAudioAll, isTalking,
      stopApplication, popleNum, applyList, agree,
      getRoomInfo, setHires, handleClick, setLayouts, recording, setRecord,
      updatePopleList, setDisplay2, setDisplay, pall,
      studentMediaStream, delUserList, onRoomCreated,
      onParticipantJoin, onParticipantLeave,
      onBroadcastStart, onBroadcastStop
    };
  }
});
</script>
<style lang="less" scoped>
.small-teacher {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  .whiteboard-wrapper,
  #div1,
  .player,
  .player1 {
    width: 100%;
    height: 100%;
  }
  .whiteboard-wrapper {
    position: relative;
  }
  .player,
  .player1 {
    display: flex;
    align-items: center;
    background: #000000;
    justify-content: center;
    z-index: 888;
#div5 {
  width: 100%;
  max-width: 875px;
  aspect-ratio: 16 / 9;
}
  }
  .player {
    position: absolute;
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
