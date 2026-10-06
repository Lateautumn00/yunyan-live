import { ref, type Ref } from 'vue';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ClassroomTabsOptions {
  role: 'teacher' | 'student';
  initialLayoutNum: number;
  withVideosPane: boolean;
  video: Ref<any>;
  dotTop?: Ref<any>;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export function useClassroomTabs(options: ClassroomTabsOptions) {
  const { role, initialLayoutNum, withVideosPane, video, dotTop } = options;
  const badgeKey = role === 'teacher' ? 'raisehands' : 'playback';

  const activeName = ref('chat');
  const chatNum = ref(0);
  const chatMentionNum = ref(0);
  const max = ref(99);
  const num = ref(0);
  const badgeNum = ref(0);
  const layoutNum = ref(initialLayoutNum);
  const chatVisible = ref(true);
  const videosVisible = ref(true);

  function updateNum(status: boolean, numArg: number, typeStr: string) {
    if (dotTop && layoutNum.value === 1) dotTop.value?.setIsDotNum(1);
    // @提及徽标归属聊天页签：聊天可见时同样走早退（防可见仍亮标）
    const earlyKey = typeStr === 'chat-mention' ? 'chat' : typeStr;
    if (activeName.value === earlyKey) return;
    if (status) {
      if (typeStr === badgeKey) badgeNum.value += numArg;
      if (typeStr === 'chat') chatNum.value += numArg;
      if (typeStr === 'chat-mention') chatMentionNum.value += numArg;
    } else {
      if (numArg === 0) {
        if (typeStr === badgeKey) badgeNum.value = 0;
        if (typeStr === 'chat') {
          chatNum.value = 0;
          chatMentionNum.value = 0;
        }
        if (typeStr === 'chat-mention') chatMentionNum.value = 0;
      } else {
        if (typeStr === badgeKey) badgeNum.value -= numArg;
        if (typeStr === 'chat') chatNum.value -= numArg;
        if (typeStr === 'chat-mention') chatMentionNum.value -= numArg;
      }
    }
  }

  function handleClick(tab: string) {
    if (tab === 'people') video.value?.listparticipants();
    // 清零必须在 activeName 赋值前，否则早退分支会让徽标永不清零
    if (tab === badgeKey || tab === 'chat') updateNum(false, 0, tab);
    activeName.value = tab;
  }

  function setLayouts(n: number) {
    layoutNum.value = n;
    chatVisible.value = n !== 1;
    if (withVideosPane) videosVisible.value = n !== 1;
  }

  function popleNum(numArg: number) {
    num.value = numArg;
  }

  return {
    activeName,
    chatNum,
    chatMentionNum,
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
  };
}
