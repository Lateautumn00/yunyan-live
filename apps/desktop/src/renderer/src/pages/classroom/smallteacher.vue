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
import { defineComponent, ref } from 'vue';
import { uid } from '@yunyan-live/utils';
import Top from '@/components/ClassRoom/Top.vue';
import VideoView from '@/components/ClassRoom/Video.vue';
import Chat from '@/components/ClassRoom/Chat.vue';
import Apply from '@/components/ClassRoom/Apply.vue';
import VideoList from '@/components/ClassRoom/Small/VideoList.vue';
import VideoPlayer from '@/components/ClassRoom/VideoPlayer.vue';
import Pople from '@/components/ClassRoom/Pople.vue';
import WhiteBoard from '@/components/ClassRoom/WhiteBoard.vue';
import TabBar from '@/components/ClassRoom/TabBar.vue';
import FlexibleLayout from '@/components/ClassRoom/FlexibleLayout.vue';
import ClassNotification from '@/components/ClassRoom/ClassNotification.vue';
import { useClassroomNotifications } from '@/composables/useClassroomNotifications';
import { useClassroomTabs } from '@/composables/useClassroomTabs';
import { useClassroomHelpers } from '@/composables/useClassroomHelpers';
import { useClassroomRoom } from '@/composables/useClassroomRoom';
import { useClassroomDisplay } from '@/composables/useClassroomDisplay';
import { useClassroomWhiteboard } from '@/composables/useClassroomWhiteboard';
import { useClassroomTeacherHooks } from '@/composables/useClassroomTeacherHooks';

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
    VideoPlayer,
    TabBar,
    FlexibleLayout,
    ClassNotification,
  },
  setup() {
    const top = ref<InstanceType<typeof Top> | null>(null);
    const video = ref<InstanceType<typeof VideoView> | null>(null);
    const chat = ref<InstanceType<typeof Chat> | null>(null);
    const apply = ref<InstanceType<typeof Apply> | null>(null);
    const pople = ref<InstanceType<typeof Pople> | null>(null);
    const videoListComp = ref<InstanceType<typeof VideoList> | null>(null);
    const classNotification = ref<InstanceType<typeof ClassNotification> | null>(null);

    const {
      activeName,
      chatNum,
      max,
      num,
      badgeNum: raisehandsNum,
      layoutNum,
      chatVisible,
      videosVisible,
      handleClick,
      updateNum,
      setLayouts,
      popleNum
    } = useClassroomTabs({
      role: 'teacher',
      initialLayoutNum: 2,
      withVideosPane: true,
      video
    });

    const { router, roomId, nickName, roomInfo, getRoomInfo } = useClassroomRoom({
      role: 'teacher',
      top,
      video,
      chat,
      updateNum
    });

    const userName = ref(nickName);
    const opaqueId = ref(uid());
    const isTeacher = ref(true);
    const isInteraction = ref(0);
    const liveType = ref('');
    const type = ref('');
    const btn = ref(false);

    const { teacherStage, getWhiteBoard, act, sendWhiteboardNews } = useClassroomWhiteboard({
      video,
      chat,
      roomId,
      actMode: 'log',
      actLogText: '白板实时接收消息',
      actLogData: true
    });

    const { isDisplay, dis, setDisplay, setDisplay2, pall } = useClassroomDisplay({
      video,
      rootSelector: '.small-teacher'
    });

    const { sendTime, socketClose, setLiveType, setDiaBla, openLive, updatePopleList, setAudioAll } =
      useClassroomHelpers({
        top,
        chat,
        pople,
        video,
        liveType,
        type,
        audioTarget: videoListComp
      });

    const {
      onRoomCreated,
      onOpenLive,
      setRecord,
      recording,
      applyList,
      agree,
      application,
      stopApplication,
      lookLive,
      setHires,
      isTalking,
      studentMediaStream,
      delUserList
    } = useClassroomTeacherHooks({
      top,
      video,
      chat,
      apply,
      videoListComp,
      roomId,
      router,
      btn,
      liveType,
      type,
      num,
      isInteraction,
      roomInfo,
      socketClose,
      updateNum
    });

    const {
      onParticipantJoin,
      onParticipantLeave,
      onBroadcastStart,
      onBroadcastStop
    } = useClassroomNotifications(classNotification, '[SmallTeacher]');

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
