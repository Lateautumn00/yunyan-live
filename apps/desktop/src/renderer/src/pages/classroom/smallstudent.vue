<template>
  <div class="small-student">
    <Top
      ref="top"
      v-model:chat-visible="chatVisible"
      v-model:videos-visible="videosVisible"
      :is-teacher="isTeacher"
      :is-interaction="isInteraction"
      :room-info="roomInfo"
      :room-id="roomId"
      :btn="btn"
      :live-type="liveType"
      :is-small="true"
      @look-live="lookLive"
      @set-layouts="setLayouts"
      @open-live="openLive"
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
            <Chat
              v-show="activeName === 'chat'"
              ref="chat"
              :room-id="roomId"
              :live-user-id="opaqueId"
              :user-name="userName"
              :is-teacher="isTeacher"
              :is-interaction="isInteraction"
              :btn="btn"
              @apply="apply"
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
      <template #student-videos>
        <VideoList
          ref="videoListComp"
          :is-teacher="isTeacher"
          :opaque-id="opaqueId"
          :is-interaction="isInteraction"
          :live-type="liveType"
          @is-talking="isTalking"
          @stop-application="stopApplication"
          @set-display2="setDisplay2"
          @set-camera-student="setCameraStudent"
        />
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
      @del-user-list="delUserList"
      @act="act"
      @set-live-type="setLiveType"
      @set-dia-bla="setDiaBla"
      @set-camera-type="setCameraType"
      @self-joined="onSelfJoined"
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
import { defineComponent, ref } from 'vue';
import { uid } from '@yunyan-live/utils';
import Top from '@/components/ClassRoom/Top.vue';
import History from '@/components/ClassRoom/History.vue';
import WhiteBoard from '@/components/ClassRoom/WhiteBoard.vue';
import VideoView from '@/components/ClassRoom/Video.vue';
import Chat from '@/components/ClassRoom/Chat.vue';
import Pople from '@/components/ClassRoom/Pople.vue';
import TabBar from '@/components/ClassRoom/TabBar.vue';
import VideoList from '@/components/ClassRoom/Small/VideoList.vue';
import HistoryVideoDialog from '@/components/ClassRoom/HistoryVideoDialog.vue';
import FlexibleLayout from '@/components/ClassRoom/FlexibleLayout.vue';
import ClassNotification from '@/components/ClassRoom/ClassNotification.vue';
import { useClassroomNotifications } from '@/composables/useClassroomNotifications';
import { useClassroomTabs } from '@/composables/useClassroomTabs';
import { useClassroomHelpers } from '@/composables/useClassroomHelpers';
import { useClassroomRoom } from '@/composables/useClassroomRoom';
import { useClassroomDisplay } from '@/composables/useClassroomDisplay';
import { useClassroomWhiteboard } from '@/composables/useClassroomWhiteboard';
import { useClassroomStudentHooks } from '@/composables/useClassroomStudentHooks';

export default defineComponent({
  name: 'SmallStudent',
  components: {
    Top,
    WhiteBoard,
    VideoView,
    Chat,
    Pople,
    History,
    VideoList,
    TabBar,
    HistoryVideoDialog,
    FlexibleLayout,
    ClassNotification,
  },
  setup() {
    const top = ref<InstanceType<typeof Top> | null>(null);
    const video = ref<InstanceType<typeof VideoView> | null>(null);
    const chat = ref<InstanceType<typeof Chat> | null>(null);
    const pople = ref<InstanceType<typeof Pople> | null>(null);
    const history = ref<InstanceType<typeof History> | null>(null);
    const videoListComp = ref<InstanceType<typeof VideoList> | null>(null);
    const classNotification = ref<InstanceType<typeof ClassNotification> | null>(null);

    const {
      activeName,
      chatNum,
      max,
      num,
      badgeNum: playbackNum,
      layoutNum,
      chatVisible,
      videosVisible,
      handleClick,
      updateNum,
      setLayouts,
      popleNum
    } = useClassroomTabs({
      role: 'student',
      initialLayoutNum: 2,
      withVideosPane: true,
      video
    });

    const { router, roomId, nickName, roomInfo, getRoomInfo, videoList } = useClassroomRoom({
      role: 'student',
      top,
      video,
      chat,
      updateNum,
      history
    });

    const userName = ref(nickName);
    const opaqueId = ref(uid());
    const isTeacher = ref(false);
    const isInteraction = ref(0);
    const btn = ref(false);
    const liveType = ref('');
    const type = ref('');

    const { teacherStage, wbdata, getWhiteBoard, act } = useClassroomWhiteboard({
      video,
      chat,
      roomId,
      actMode: 'assemble',
      actLogText: '白板实时接收消息',
      actLogData: false
    });

    const { isDisplay, dis, setDisplay, setDisplay2, pall } = useClassroomDisplay({
      video,
      rootSelector: '.small-student'
    });

    const { sendTime, socketClose, setLiveType, setDiaBla, openLive, updatePopleList, setAudioAll } =
      useClassroomHelpers({
        top,
        chat,
        pople,
        video,
        liveType,
        type,
        audioTarget: videoListComp,
        diaBlaSyncsLiveType: true
      });

    const {
      centerDialogVisible,
      playId,
      playTitle,
      onLookLive,
      onLiveStarted,
      closedPlay,
      palyHistoryVideo,
      setTime,
      apply,
      application,
      stopApplication,
      isTalking,
      lookLive,
      setHires,
      studentMediaStream,
      delUserList
    } = useClassroomStudentHooks({
      top,
      video,
      videoListComp,
      router,
      btn,
      num,
      isInteraction,
      socketClose,
      getRoomInfo,
      setDiaBla
    });

    function setCameraStudent(status: boolean, isSpeak: boolean) {
      video.value?.setCameraStudent(status, isSpeak);
    }

    function setCameraType(status: boolean) {
      videoListComp.value?.setCameraType(status);
    }

    function onSelfJoined(id: string, display: string) {
      videoListComp.value?.ensureSelfTile(id, display.split('#'));
    }

    const {
      onParticipantJoin,
      onParticipantLeave,
      onBroadcastStart,
      onBroadcastStop
    } = useClassroomNotifications(classNotification, '[SmallStudent]');

    return {
      roomId, top, video, chat, pople, history,
      videoListComp, classNotification, centerDialogVisible, playId, playTitle, playbackNum,
      chatNum, max, userName, opaqueId, isTeacher, activeName, layoutNum,
      chatVisible, videosVisible,
      isDisplay, roomInfo, num, isInteraction, btn, teacherStage, liveType,
      type, dis, wbdata,
      act, getWhiteBoard, setCameraStudent, setHires,
      sendTime, closedPlay, palyHistoryVideo, updateNum, openLive,
      setDiaBla, setLiveType, setCameraType, onSelfJoined, lookLive, onLookLive,
      isTalking, stopApplication, setAudioAll, apply, videoList, application,
      getRoomInfo, setTime, popleNum, socketClose, updatePopleList,
      handleClick, setLayouts, setDisplay2, setDisplay, pall,
      studentMediaStream, delUserList, onLiveStarted,
      onParticipantJoin, onParticipantLeave,
      onBroadcastStart, onBroadcastStop
    };
  }
});
</script>
<style lang="less" scoped>
.small-student {
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
