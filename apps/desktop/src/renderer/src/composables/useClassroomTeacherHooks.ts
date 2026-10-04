import type { Ref } from 'vue';
import type { Router } from 'vue-router';
import { ElMessage } from 'element-plus';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ClassroomTeacherHooksOptions {
  top: Ref<any>;
  video: Ref<any>;
  chat: Ref<any>;
  apply: Ref<any>;
  videoListComp?: Ref<any>;
  roomId: string;
  router: Router;
  btn: Ref<boolean>;
  liveType: Ref<string>;
  type: Ref<string>;
  num: Ref<number>;
  isInteraction: Ref<number>;
  roomInfo: Ref<{ status: number; [key: string]: unknown }>;
  socketClose: () => void;
  updateNum: (status: boolean, numArg: number, typeStr: string) => void;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export function useClassroomTeacherHooks(options: ClassroomTeacherHooksOptions) {
  const {
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
  } = options;

  function onRoomCreated() {
    chat.value?.setSocketSend(
      JSON.stringify({
        type: 'live_started',
        data: { liveMsg: { roomId } }
      })
    );
  }

  function onOpenLive(status: boolean, _liveType: string, _liveTimeLen: number) {
    btn.value = status;
    top.value?.onOpenLive(status, liveType.value, type.value, num.value);
    if (type.value === 'close') {
      socketClose();
    }
  }

  function setRecord(status: boolean) {
    top.value?.setRecord(status);
  }

  async function recording(status: boolean, time: number | string) {
    video.value?.recording(status, time);
  }

  function applyList(status: boolean, data: unknown) {
    apply.value?.applyList(status, data);
    updateNum(status, 1, 'raisehands');
  }

  function agree(status: boolean, item: unknown, _index: number, numArg: number) {
    video.value?.apply(status, numArg, item);
  }

  function application(numArg: number, message = '') {
    isInteraction.value = numArg;
    if (message !== '') ElMessage.success(message);
  }

  function stopApplication() {
    video.value?.stopApplicationTxt();
  }

  function lookLive(status: boolean) {
    video.value?.lookLive(status);
    if (!status) {
      stopApplication();
      socketClose();
      router.push('/');
    }
  }

  function setHires() {
    if (roomInfo.value.status == 2) top.value?.setHires();
  }

  function isTalking(talkType: number, userType?: string) {
    video.value?.isTalkingTxt(talkType, userType);
  }

  function studentMediaStream(stream: unknown, display: string[], id: string) {
    videoListComp?.value?.studentMediaStream(stream, display, id);
  }

  function delUserList(leaving: string) {
    videoListComp?.value?.delUserList(leaving);
  }

  return {
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
  };
}
