<template>
  <div class="small-video-list">
    <div class="pre-or-next">
      <div
        class="swiper-button-prevs pre"
        @click="scrollPrev"
      >
        <el-icon><ArrowLeft /></el-icon>
      </div>
      <div
        class="swiper-button-nexts next"
        @click="scrollNext"
      >
        <el-icon><ArrowRight /></el-icon>
      </div>
    </div>
    <div
      ref="swiperContainer"
      class="swiper-container"
    >
      <div class="swiper-wrapper">
        <div
          v-for="(item, index) in list"
          v-show="!item.isShow"
          :key="index"
          class="swiper-slide"
          :class="
            item.display[0] === 'ST' &&
              (isInteraction == 2 || isInteraction == 3)
              ? 'swiper-slide-d'
              : 'swiper-slide-f'
          "
          @mouseenter="topClick(item.id, true)"
          @mouseleave="topClick(item.id, false)"
        >
          <div
            class="top-click"
            :class="topId === item.id ? 'isMouse' : 'notMouse'"
            @click="setDisplayBig(item.id)"
          >
            <el-icon><Expand /></el-icon><span v-if="clickId === item.id">缩回视图</span><span v-else>放大视图</span>
          </div>
          <div
            v-if="
              item.display[0] === 'ST' &&
                (isInteraction == 2 || isInteraction == 3)
            "
            class="top"
          >
            <div class="right">
              <el-icon
                class="sound-icon"
                aria-label="发言中"
              >
                <Mic />
              </el-icon>
            </div>
          </div>
          <div class="bottom">
            <div class="left">
              <el-icon
                v-if="opaqueId === item.display[1]"
                class="me-icon"
                aria-label="我"
              >
                <UserFilled />
              </el-icon>
              <span>{{ item.display[2] }}</span>
            </div>
            <div class="right">
              <div
                v-if="opaqueId === item.display[1]"
                class="interaction-get1"
              >
                <el-icon
                  v-if="cameraType"
                  aria-label="摄像头"
                  @click="setCameraStudent(false, isSpeak)"
                >
                  <VideoCameraFilled />
                </el-icon>

                <el-icon
                  v-if="!cameraType"
                  class="is-off"
                  aria-label="摄像头"
                  @click="setCameraStudent(true, isSpeak)"
                >
                  <VideoCamera />
                </el-icon>
              </div>
              <div
                v-if="
                  item.display[0] === 'ST' &&
                    ((isTeacher && isInteraction == 3) ||
                      (!isTeacher &&
                        isInteraction == 2 &&
                        opaqueId === item.display[1]))
                "
                class="interaction-get2"
              >
                <el-icon
                  v-if="isSpeak"
                  aria-label="麦克风"
                  @click="isTalking('off', 'ST')"
                >
                  <Microphone />
                </el-icon>
                <el-icon
                  v-else
                  class="is-off"
                  aria-label="麦克风"
                  @click="isTalking('on', 'ST')"
                >
                  <Mic />
                </el-icon>
                <el-icon
                  aria-label="关闭发言"
                  @click="stopApplication"
                >
                  <CloseBold />
                </el-icon>
              </div>
            </div>
          </div>
          <div
            :id="`video${item.id}`"
            class="patert"
          >
            <VideoPlayer
              :ref="`video${item.id}`"
              :is-muted="true"
              :radius="true"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getCurrentInstance, nextTick, ref } from 'vue';
import VideoPlayer from '@/components/ClassRoom/VideoPlayer.vue';

const instance = getCurrentInstance();

withDefaults(
  defineProps<{
    isTeacher?: boolean;
    opaqueId?: string;
    isInteraction?: number;
    liveType?: string;
  }>(),
  { isTeacher: false, opaqueId: '', isInteraction: 0, liveType: '' }
);

const emit = defineEmits<{
  (e: 'setCameraStudent', status: boolean, isSpeak: boolean): void;
  (e: 'setDisplay2', dis: string, mouse: string): void;
  (e: 'isTalking', type: string, userType: string): void;
  (e: 'stopApplication'): void;
}>();

const swiperContainer = ref<HTMLDivElement | null>(null);
const cameraType = ref(false);
const list = ref<Array<{ display: string[]; id: string; isShow: boolean }>>([]);
const isSpeak = ref(false);
const topId = ref('');
const clickId = ref('');
const mouse = ref('over');

function scrollPrev() {
  swiperContainer.value?.scrollBy({
    left: -200,
    behavior: 'smooth'
  });
}

function scrollNext() {
  swiperContainer.value?.scrollBy({
    left: 200,
    behavior: 'smooth'
  });
}

function setCameraStudent(status: boolean, isSpeak: boolean) {
  emit('setCameraStudent', status, isSpeak);
}

function setCameraType(status: boolean) {
  cameraType.value = status;
}

function topClick(index: string, status: boolean) {
  topId.value = status ? index : '';
}

function setDisplayBig(index: string) {
  if (clickId.value !== '' && clickId.value !== index) {
    setDisplayBig(clickId.value);
  }
  if (clickId.value === index) {
    mouse.value = 'leave';
    clickId.value = '';
  } else {
    mouse.value = 'over';
    clickId.value = index;
  }
  setDisplay2(`video${index}`, mouse.value);
}

function setDisplay2(dis: string, mouse: string) {
  emit('setDisplay2', dis, mouse);
}

function isTalking(type: string, userType: string) {
  emit('isTalking', type, userType);
}

function stopApplication() {
  emit('stopApplication');
}

function setAudioAll(user: string[]) {
  isSpeak.value = user[3] === 'off' ? false : true;
}

async function ensureSelfTile(id: string, display: string[]) {
  const num = await getC(id);
  if (num > -1) return;
  list.value.push({ display, id, isShow: false });
}

async function studentMediaStream(
  stream: MediaStream,
  display: string[],
  id: string
) {
  let num = await getC(id);
  const current = num > -1 ? list.value[num] : undefined;
  if (current && current.isShow) {
    list.value.splice(num, 1);
    num = -1;
  }
  const current2 = num > -1 ? list.value[num] : undefined;
  if (current2 && !current2.isShow) {
    if (current2.display[0] !== display[0]) {
      current2.display = display;
    }
  } else {
    list.value.push({ display, id, isShow: false });
  }
  await nextTick();
  const player = getVideoElement(id);
  if (player) {
    playStream(player, stream);
  }
}

function getVideoElement(id: string) {
  const refs = instance?.proxy?.$refs as Record<string, unknown> | undefined;
  if (!refs) return undefined;
  const refValue = refs[`video${id}`];
  const components = Array.isArray(refValue) ? refValue : [refValue];
  const target = components.find((item) => !!item);
  return (
    target as unknown as {
      videoPlayers?: HTMLVideoElement;
    }
  )?.videoPlayers;
}

function playStream(
  element: HTMLVideoElement | undefined,
  stream: MediaStream
) {
  if (!element) return;
  try {
    element.srcObject = stream;
    element.onloadedmetadata = () => void element.play();
  } catch (e) {
    try {
      element.src = URL.createObjectURL(stream as unknown as Blob);
      element.onloadedmetadata = () => void element.play();
    } catch (err) {
      console.error('Error attaching stream to element');
    }
  }
}

function getC(id: string): Promise<number> {
  return new Promise((resolve) => {
    let bNum = -1;
    try {
      list.value.forEach((item, index) => {
        if (item.id == id) {
          bNum = index;
          throw new Error('EndIterative');
        }
      });
    } catch (e) {
      if ((e as Error).message != 'EndIterative') throw e;
    }
    resolve(bNum);
  });
}

async function delUserList(id: string) {
  const num = await getC(id);
  if (num === -1) return;
  const video = getVideoElement(id);
  if (video) {
    video.srcObject = null;
    video.onloadedmetadata = () => video.pause();
  }
  const current = list.value[num];
  if (current) current.isShow = true;
}

defineExpose({
  setCameraType,
  setCameraStudent,
  setAudioAll,
  ensureSelfTile,
  studentMediaStream,
  delUserList
});
</script>

<style lang="less" scoped>
.flex() {
  display: flex;
  align-items: center;
}
.small-video-list {
  width: 100%;
  height: 100%;
  background: #000000;
  position: relative;
  .interaction-get1,
  .interaction-get2 {
    .flex();
  }
  .patert {
    height: 100%;
  }
  .swiper-slide {
    width: 160px;
    height: 90px;
    margin-left: 6px;
    position: relative;
    border-radius: 4px;
    .isMouse {
      .flex();
      justify-content: center;
      .el-icon {
        font-size: 14px;
      }
      span {
        font-size: 10px;
        color: #ffffff;
        font-weight: 500;
        margin-left: 7px;
      }
    }
    .notMouse {
      display: none;
    }
    .top-click {
      position: absolute;
      height: 70px;
      width: 100%;
      z-index: 1005;
      top: 0px;
      left: 0px;
      background: rgba(0, 0, 0, 0.5);
    }
    .top {
      position: absolute;
      z-index: 999;
      right: 0px;
      .right {
        width: 24px;
        height: 16px;
        background: #f8821a;
        border-radius: 0px 4px 0px 4px;
        border: 1px solid #f8821a;
        .flex();
        justify-content: center;
        .sound-icon {
          font-size: 14px;
          color: #ffffff;
        }
      }
    }
    .bottom {
      position: absolute;
      height: 20px;
      line-height: 20px;
      z-index: 999;
      justify-content: space-between;
      width: 100%;
      bottom: 0px;
      color: #fff;
      font-size: 10px;
      font-weight: 500;

      background: linear-gradient(270deg, rgba(0, 0, 0, 0) 0%, #000000 100%);
      border-radius: 0px 0px 0px 4px;
      .flex();
      .left {
        .flex();
        margin-left: 7px;
        .me-icon {
          font-size: 10px;
          width: 10px;
          height: 12px;
          margin-right: 5px;
          color: #61ba47;
        }
      }
      .right {
        .flex();
        margin-right: 2px;
        .el-icon {
          width: 20px;
          height: 20px;
          font-size: 20px;
          margin-left: 4px;
          cursor: pointer;
          &.is-off {
            color: #989898;
          }
        }
      }
    }
  }
  .swiper-container {
    width: calc(100% - 130px);
    position: absolute;
    left: 62px;
    z-index: 999;
    overflow-x: scroll;
    overflow-y: hidden;
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  }
  .swiper-slide-d {
    border: 2px solid #f8821a;
  }
  .swiper-slide-f {
    border: 2px solid #000000;
  }
  .swiper-wrapper {
    margin-top: 6px;
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    width: max-content;
  }
  .pre-or-next {
    .flex();
    justify-content: space-between;
    position: absolute;
    width: calc(100% - 12px);
    top: 50%;
    transform: translateY(-50%);
    z-index: 998;
    margin-left: 6px;
  }
  .pre,
  .next {
    width: 56px;
    height: 90px;
    background: #272727;
    border-radius: 4px;
    outline: none;
    cursor: pointer;
    .flex();
    justify-content: center;
    .el-icon {
      font-size: 16px;
      color: #ffffff;
    }
  }
}
</style>
<style lang="less">
.swiper-slide {
  width: max-content;
  height: max-content;
}
</style>