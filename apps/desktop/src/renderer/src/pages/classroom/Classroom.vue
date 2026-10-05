<template>
  <div :class="variant">
    <Top
      ref="top"
      v-model:chat-visible="chatVisible"
      :videos-visible="isSmall ? videosVisible : undefined"
      :is-teacher="isTeacher"
      :is-interaction="isStudent ? isInteraction : undefined"
      :room-info="roomInfo"
      :room-id="roomId"
      :live-type="liveType"
      :type="isTeacher ? type : undefined"
      :btn="btn"
      :is-small="isSmall"
      @open-live="openLive"
      @look-live="lookLive"
      @set-layouts="setLayouts"
      @recording="recording"
      @update:videos-visible="onVideosVisibleChange"
    />
    <FlexibleLayout
      :chat-visible="bindChatModel ? chatVisible : undefined"
      :videos-visible="isSmall ? videosVisible : undefined"
      :enable-videos="isLarge ? false : undefined"
      @update:chat-visible="onChatVisibleChange"
      @update:videos-visible="onVideosVisibleChange"
    >
      <template #whiteboard>
        <div class="whiteboard-wrapper">
          <div
            v-if="isLargeTeacher"
            class="player"
          >
            <div id="div1">
              <WhiteBoard
                :is-teacher="isTeacher"
                :is-display="isDisplay"
                :room-id="roomId"
                :opaque-id="opaqueId"
                :teacher-stage="teacherStage"
                :layouts="3"
                @paint-log="paintLog"
              />
            </div>
            <div
              v-show="false"
              id="div3"
            />
          </div>
          <template v-else>
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
                  :user-name="isStudent ? userName : undefined"
                  :layouts="3"
                  @paint-log="paintLog"
                />
              </div>
              <div
                v-show="false"
                id="div3"
              />
            </div>
          </template>
        </div>
      </template>
      <template #chat>
        <div class="chat-area">
          <TabBar
            :tabs="[
              isTeacher
                ? { key: 'raisehands', label: '举手', badge: badgeNum }
                : { key: 'playback', label: '回放', badge: badgeNum },
              { key: 'chat', label: '聊天', badge: chatNum },
              { key: 'people', label: `人数(${num})` },
            ]"
            :active-name="activeName"
            :max="max"
            @click="handleClick"
          />
          <div class="tab-cons">
            <History
              v-if="isStudent"
              v-show="activeName === 'playback'"
              ref="history"
              :is-teacher="isTeacher"
              @paly-history-video="palyHistoryVideo"
            />
            <Apply
              v-if="hasApply"
              v-show="activeName === applyTab"
              ref="applyRef"
              :is-teacher="isTeacher"
              :is-interaction="isInteraction"
              @agree="agree"
              @is-talking="applyIsTalking"
              @stop-application="applyStopApplication"
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
          :live-type="isStudent ? liveType : undefined"
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
      :is-teacher="isTeacher"
      :opaque-id="opaqueId"
      :room-id="roomId"
      :user-name="userName"
      :is-interaction="isInteraction"
      :room-title="isTeacher ? roomInfo.title : undefined"
      :teacher-name="isTeacher ? roomInfo.speakerName : undefined"
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
      @student-media-stream="studentMediaStream"
      @del-user-list="delUserList"
      @set-hires="setHires"
      @act="act"
      @set-live-type="setLiveType"
      @set-dia-bla="setDiaBla"
      @room-created="onRoomCreated"
      @set-time="setTime"
      @set-camera-type="setCameraType"
      @self-joined="onSelfJoined"
      @on-look-live="onLookLive"
      @participant-join="onParticipantJoin"
      @participant-leave="onParticipantLeave"
      @broadcast-start="onBroadcastStart"
      @broadcast-stop="onBroadcastStop"
    />
    <HistoryVideoDialog
      v-if="isStudent"
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
import Apply from '@/components/ClassRoom/Apply.vue';
import TabBar from '@/components/ClassRoom/TabBar.vue';
import VideoList from '@/components/ClassRoom/Small/VideoList.vue';
import HistoryVideoDialog from '@/components/ClassRoom/HistoryVideoDialog.vue';
import VideoPlayer from '@/components/ClassRoom/VideoPlayer.vue';
import FlexibleLayout from '@/components/ClassRoom/FlexibleLayout.vue';
import ClassNotification from '@/components/ClassRoom/ClassNotification.vue';
import { useClassroomNotifications } from '@/composables/useClassroomNotifications';
import { useClassroomTabs } from '@/composables/useClassroomTabs';
import { useClassroomHelpers } from '@/composables/useClassroomHelpers';
import { useClassroomRoom } from '@/composables/useClassroomRoom';
import { useClassroomDisplay } from '@/composables/useClassroomDisplay';
import { useClassroomWhiteboard } from '@/composables/useClassroomWhiteboard';
import { useClassroomTeacherHooks } from '@/composables/useClassroomTeacherHooks';
import { useClassroomStudentHooks } from '@/composables/useClassroomStudentHooks';

const ACT_LOG_TEXT: Record<string, string> = {
  'small-teacher': '白板实时接收消息',
  'large-teacher': '白板实时接收消息...',
  'small-student': '白板实时接收消息',
  'large-student': '1白板实时接收消息'
};

export default defineComponent({
  name: 'Classroom',
  components: {
    Top,
    History,
    WhiteBoard,
    VideoView,
    Chat,
    Pople,
    Apply,
    TabBar,
    VideoList,
    HistoryVideoDialog,
    VideoPlayer,
    FlexibleLayout,
    ClassNotification
  },
  props: {
    role: { type: String, required: true },
    size: { type: String, required: true }
  },
  setup(props) {
    const isTeacher = props.role === 'teacher';
    const isStudent = !isTeacher;
    const isSmall = props.size === 'small';
    const isLarge = !isSmall;
    const variant = `${props.size}-${props.role}`;
    const isLargeTeacher = variant === 'large-teacher';
    const isSmallStudent = variant === 'small-student';
    const bindChatModel = variant !== 'large-student';
    const hasApply = variant !== 'small-student';
    const applyTab = isTeacher ? 'raisehands' : 'chat';

    const top = ref<InstanceType<typeof Top> | null>(null);
    const video = ref<InstanceType<typeof VideoView> | null>(null);
    const chat = ref<InstanceType<typeof Chat> | null>(null);
    const applyRef = ref<InstanceType<typeof Apply> | null>(null);
    const pople = ref<InstanceType<typeof Pople> | null>(null);
    const history = ref<InstanceType<typeof History> | null>(null);
    const videoListComp = ref<InstanceType<typeof VideoList> | null>(null);
    const classNotification = ref<InstanceType<typeof ClassNotification> | null>(null);

    const {
      activeName,
      chatNum,
      max,
      num,
      badgeNum,
      layoutNum,
      chatVisible,
      videosVisible,
      handleClick,
      updateNum,
      setLayouts,
      popleNum
    } = useClassroomTabs({
      role: props.role,
      initialLayoutNum: isSmall ? 2 : 3,
      withVideosPane: isSmall,
      video,
      dotTop: variant === 'large-student' ? top : undefined
    });

    const { router, roomId, nickName, roomInfo, getRoomInfo, videoList: roomVideoList } =
      useClassroomRoom({
        role: props.role,
        top,
        video,
        chat,
        updateNum,
        history: isStudent ? history : undefined
      });

    const userName = ref(nickName);
    const opaqueId = ref(uid());
    const isInteraction = ref(0);
    const liveType = ref('');
    const type = ref('');
    const btn = ref(false);

    const { teacherStage, wbdata, getWhiteBoard, act, sendWhiteboardNews } = useClassroomWhiteboard(
      {
        video,
        chat,
        roomId,
        actMode: isTeacher ? 'log' : 'assemble',
        actLogText: ACT_LOG_TEXT[variant],
        actLogData: variant !== 'small-student'
      }
    );

    const { isDisplay, dis, setDisplay, setDisplay2, pall } = useClassroomDisplay({
      video,
      rootSelector: `.${variant}`,
      withHoverSwap: !isLargeTeacher
    });

    const { sendTime, socketClose, setLiveType, setDiaBla, openLive, updatePopleList, setAudioAll } =
      useClassroomHelpers({
        top,
        chat,
        pople,
        video,
        liveType,
        type,
        audioTarget: isSmall ? videoListComp : applyRef,
        diaBlaSyncsLiveType: isStudent
      });

    const teacherHooks = isTeacher
      ? useClassroomTeacherHooks({
          top,
          video,
          chat,
          apply: applyRef,
          videoListComp: variant === 'small-teacher' ? videoListComp : undefined,
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
        })
      : null;

    const studentHooks = isStudent
      ? useClassroomStudentHooks({
          top,
          video,
          videoListComp: isSmallStudent ? videoListComp : undefined,
          router,
          btn,
          num,
          isInteraction,
          socketClose,
          getRoomInfo,
          setDiaBla
        })
      : null;

    const hooks = teacherHooks || studentHooks;

    const {
      onParticipantJoin,
      onParticipantLeave,
      onBroadcastStart,
      onBroadcastStop
    } = useClassroomNotifications(
      classNotification,
      `[${isSmall ? 'Small' : 'Large'}${isTeacher ? 'Teacher' : 'Student'}]`
    );

    function handleSetCameraStudent(status: boolean, isSpeak: boolean) {
      video.value?.setCameraStudent(status, isSpeak);
    }

    function handleSetCameraType(status: boolean) {
      videoListComp.value?.setCameraType(status);
    }

    function handleSelfJoined(id: string, display: string) {
      videoListComp.value?.ensureSelfTile(id, display.split('#'));
    }

    const setCameraStudent = isSmallStudent ? handleSetCameraStudent : undefined;
    const setCameraType = isStudent ? handleSetCameraType : undefined;
    const onSelfJoined = isSmallStudent ? handleSelfJoined : undefined;

    function onVideosVisibleChange(val: boolean) {
      if (isSmall) videosVisible.value = val;
    }

    function onChatVisibleChange(val: boolean) {
      if (bindChatModel) chatVisible.value = val;
    }

    // Per-variant handler exposure: undefined reproduces the original
    // pages' missing @event bindings (Vue skips falsy handlers silently).
    const recording = teacherHooks?.recording;
    const onOpenLive = teacherHooks?.onOpenLive;
    const setRecord = teacherHooks?.setRecord;
    const applyList = teacherHooks?.applyList;
    const onRoomCreated = teacherHooks?.onRoomCreated;
    const agree = teacherHooks?.agree;
    const paintLog = isTeacher ? sendWhiteboardNews : undefined;
    const videoList = isStudent ? roomVideoList : undefined;
    const studentMediaStream = isLargeTeacher ? undefined : hooks?.studentMediaStream;
    const delUserList = isSmall ? hooks?.delUserList : undefined;
    const apply = studentHooks?.apply;
    const onLookLive = studentHooks?.onLookLive;
    const onLiveStarted = studentHooks?.onLiveStarted;
    const setTime = studentHooks?.setTime;
    const centerDialogVisible = studentHooks?.centerDialogVisible;
    const playId = studentHooks?.playId;
    const playTitle = studentHooks?.playTitle;
    const closedPlay = studentHooks?.closedPlay;
    const palyHistoryVideo = studentHooks?.palyHistoryVideo;
    const lookLive = hooks?.lookLive;
    const setHires = hooks?.setHires;
    const isTalking = hooks?.isTalking;
    const stopApplication = hooks?.stopApplication;
    const application = hooks?.application;
    const applyIsTalking = isLarge ? hooks?.isTalking : undefined;
    const applyStopApplication = isLarge ? hooks?.stopApplication : undefined;

    return {
      variant, isSmall, isLarge, isStudent, isTeacher, isLargeTeacher, hasApply, applyTab,
      bindChatModel, roomId, top, video, chat, applyRef, pople, history, videoListComp,
      classNotification, badgeNum, chatNum, max, num, userName, opaqueId, activeName, layoutNum,
      chatVisible, videosVisible, isDisplay, roomInfo, isInteraction, liveType, type, btn, dis,
      teacherStage, wbdata, openLive, lookLive, setLayouts, recording, onOpenLive, setRecord,
      applyList, onRoomCreated, agree, paintLog, videoList, studentMediaStream, delUserList,
      apply, onLookLive, onLiveStarted, setTime, centerDialogVisible, playId, playTitle,
      closedPlay, palyHistoryVideo, setHires, isTalking, stopApplication, application,
      applyIsTalking, applyStopApplication, setCameraStudent, setCameraType, onSelfJoined,
      onVideosVisibleChange, onChatVisibleChange, act, getWhiteBoard, sendTime, updateNum,
      socketClose, setDiaBla, setLiveType, setAudioAll, popleNum, getRoomInfo, handleClick,
      setDisplay2, setDisplay, pall, sendWhiteboardNews, onParticipantJoin, onParticipantLeave,
      onBroadcastStart, onBroadcastStop, updatePopleList
    };
  }
});
</script>
<style lang="less" scoped>
.small-teacher,
.large-teacher,
.small-student,
.large-student {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  .whiteboard-wrapper {
    position: relative;
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
.small-teacher,
.small-student {
  .whiteboard-wrapper,
  #div1,
  .player,
  .player1 {
    width: 100%;
    height: 100%;
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
}
.large-teacher,
.large-student {
  .whiteboard-wrapper,
  #div1,
  .player {
    width: 100%;
    height: 100%;
  }
  .player {
    display: flex;
    align-items: center;
    background: #000000;
    justify-content: center;
    z-index: 999;
  }
}
</style>
