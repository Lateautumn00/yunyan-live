import type { Ref } from 'vue';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ClassroomHelpersOptions {
  top: Ref<any>;
  chat: Ref<any>;
  pople: Ref<any>;
  video: Ref<any>;
  liveType: Ref<string>;
  type: Ref<string>;
  audioTarget: Ref<any>;
  diaBlaSyncsLiveType?: boolean;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export function useClassroomHelpers(options: ClassroomHelpersOptions) {
  const {
    top,
    chat,
    pople,
    video,
    liveType,
    type,
    audioTarget,
    diaBlaSyncsLiveType = false
  } = options;

  function sendTime(time: string) {
    top.value?.sendTime(time);
  }

  function socketClose() {
    chat.value?.liveSocketClose();
  }

  function setLiveType(_liveType: string) {
    liveType.value = _liveType;
  }

  function setDiaBla(status: boolean) {
    top.value?.setDiaBla(status);
    if (diaBlaSyncsLiveType) setLiveType(liveType.value);
  }

  function openLive(status: boolean, _liveType: string, _type: string, liveTimeLen: number) {
    if (_liveType !== 'screen') setLiveType(_liveType);
    type.value = _type;
    video.value?.openLive(status, _liveType, _type, liveTimeLen);
  }

  function updatePopleList(poples: unknown[]) {
    pople.value?.updatePopleList(poples);
  }

  function setAudioAll(user: string) {
    audioTarget.value?.setAudioAll(user);
  }

  return { sendTime, socketClose, setLiveType, setDiaBla, openLive, updatePopleList, setAudioAll };
}
