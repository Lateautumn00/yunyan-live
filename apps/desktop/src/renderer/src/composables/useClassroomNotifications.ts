import type { Ref } from 'vue';

interface ClassNotificationHandle {
  add: (text: string, duration?: number) => void;
}

export function useClassroomNotifications(
  classNotification: Ref<ClassNotificationHandle | null>,
  logTag: string
) {
  function onParticipantJoin(name: string) {
    console.log(`${logTag} onParticipantJoin:`, name);
    classNotification.value?.add(`${name} 进入直播间`);
  }

  function onParticipantLeave(name: string) {
    console.log(`${logTag} onParticipantLeave:`, name);
    classNotification.value?.add(`${name} 离开直播间`);
  }

  function onBroadcastStart() {
    classNotification.value?.add('开始直播');
  }

  function onBroadcastStop(status?: string) {
    classNotification.value?.add(status === 'stop' ? '暂停直播' : '直播已结束');
  }

  return { onParticipantJoin, onParticipantLeave, onBroadcastStart, onBroadcastStop };
}
