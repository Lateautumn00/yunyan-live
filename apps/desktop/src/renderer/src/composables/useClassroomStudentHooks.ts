import { ref, type Ref } from 'vue';
import type { Router } from 'vue-router';
import { ElMessage } from 'element-plus';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ClassroomStudentHooksOptions {
  top: Ref<any>;
  video: Ref<any>;
  videoListComp?: Ref<any>;
  router: Router;
  btn: Ref<boolean>;
  num: Ref<number>;
  isInteraction: Ref<number>;
  socketClose: () => void;
  getRoomInfo: (init?: boolean, retryCount?: number) => Promise<void>;
  setDiaBla: (status: boolean) => void;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export function useClassroomStudentHooks(options: ClassroomStudentHooksOptions) {
  const {
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
  } = options;

  const centerDialogVisible = ref(false);
  const playId = ref('');
  const playTitle = ref('');

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

  function onLiveStarted() {
    video.value?.retryExists();
  }

  function closedPlay() {}

  function palyHistoryVideo(id: string, title: string) {
    playId.value = id;
    playTitle.value = title;
    centerDialogVisible.value = true;
  }

  function setTime(typeStr: string) {
    top.value?.setTime(typeStr);
  }

  function apply(status: boolean, numArg: number) {
    isInteraction.value = status ? 1 : 0;
    video.value?.apply(status, numArg);
  }

  function application(numArg: number, message: string) {
    isInteraction.value = numArg;
    if (message !== '') ElMessage.success(message);
  }

  function stopApplication() {
    video.value?.stopApplication();
  }

  function isTalking(talkType: number, userType: string) {
    video.value?.isTalking(talkType, userType);
  }

  function lookLive(status: boolean) {
    video.value?.lookLive(status);
  }

  function setHires() {
    top.value?.setHires();
  }

  function studentMediaStream(stream: unknown, display: string[], id: string) {
    videoListComp?.value?.studentMediaStream(stream, display, id);
    setDiaBla(false);
  }

  function delUserList(leaving: string) {
    videoListComp?.value?.delUserList(leaving);
  }

  return {
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
  };
}
