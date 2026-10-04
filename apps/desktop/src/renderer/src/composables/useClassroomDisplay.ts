import { ref, type Ref } from 'vue';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ClassroomDisplayOptions {
  video: Ref<any>;
  rootSelector: string;
  withHoverSwap?: boolean;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export function useClassroomDisplay(options: ClassroomDisplayOptions) {
  const { video, rootSelector, withHoverSwap = true } = options;
  const isDisplay = ref(true);
  const dis = ref('');

  function setDisplay2(disStr: string, mouse: string) {
    if (!isDisplay.value) {
      setDisplay();
    }
    if (mouse === 'over' && dis.value === disStr) return;
    dis.value = mouse === 'over' ? disStr : '';
    const el = document.querySelector(rootSelector) as HTMLElement | null;
    if (!el) return;
    const disChild = el.querySelector(`#${disStr}`)?.firstChild as Node | null;
    const divChild = el.querySelector('#div5')?.firstChild as Node | null;
    if (disChild && divChild) {
      el.querySelector('#div5')?.appendChild(disChild);
      el.querySelector(`#${disStr}`)?.appendChild(divChild);
    }
  }

  function setDisplay() {
    if (withHoverSwap && dis.value === 'over') {
      setDisplay2(dis.value, 'leave');
    }
    const el = document.querySelector(rootSelector) as HTMLElement | null;
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
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const ele = (video.value as any)?.$refs?.videoPlayer?.$refs?.videoPlayers;
    /* eslint-enable @typescript-eslint/no-explicit-any */
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

  return { isDisplay, dis, setDisplay, setDisplay2, pall };
}
