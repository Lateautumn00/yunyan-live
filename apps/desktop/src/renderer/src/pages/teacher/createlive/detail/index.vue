<template>
  <div>
    <sidebar-menu :active-key="activeKey" />
    <div class="backstage-center live-detail">
      <div class="page-header">
        <h3>直播概况</h3>
        <div class="header-actions">
          <el-button
            type="primary"
            plain
            @click="coursewareVisible = true"
          >
            上传课件
          </el-button>
          <RoomActions
            variant="buttons"
            :room="roomDetail"
            @updated="getRoomDetail"
            @deleted="goBackList"
            @transferred="goBackList"
            @share="highlightLinks"
          />
        </div>
      </div>
      <div class="grid-container">
        <div class="title">
          <div>直播名称:</div>
          <div>
            {{ roomDetail.title }}
          </div>
        </div>
        <div class="time">
          <div>开始时间:</div>
          <div>
            <p>
              {{ dateFormatter(roomDetail.startTime) }}
            </p>
            <p>({{ roomDetail.duration }}min)</p>
          </div>
        </div>
        <div class="type">
          <div>直播类型:</div>
          <div>{{ roomDetail.type == 0 ? '小班教学' : '大班教学' }}</div>
        </div>
        <div
          ref="linksSection"
          class="links"
          :class="{ 'is-highlight': linksHighlight }"
        >
          <div>
            <p>登录方式：</p>
            <p>下面为登录链接，您可以将其分享给各角色</p>
          </div>
          <section>
            <ShareLinks
              :room-id="roomId"
              :join-code="roomDetail.joinCode"
              @updated="onCodeUpdated"
            />
          </section>
        </div>
      </div>
    </div>

    <CoursewareUpload
      v-model="coursewareVisible"
      :room-id="roomId"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { formatDate } from '@yunyan-live/utils';
import SidebarMenu from '@/layouts/sidebar.vue';
import RoomActions from '@/components/teacher/RoomActions.vue';
import CoursewareUpload from '@/components/teacher/CoursewareUpload.vue';
import ShareLinks from '@/components/teacher/ShareLinks.vue';
import type { LiveRoom } from '@/types/pages/teacher/live';
import Live from '@/api/backstage';

const route = useRoute();
const router = useRouter();

const activeKey = '1';
const roomDetail = ref<LiveRoom>({
  title: '',
  speakerName: '',
  startTime: '',
  type: 0,
  duration: 0
});
const roomId = ref('');
const coursewareVisible = ref(false);
const linksSection = ref<HTMLElement | null>(null);
const linksHighlight = ref(false);

onMounted(() => {
  roomId.value = (route.query.roomId as string) ?? '';
  void getRoomDetail();
});

async function getRoomDetail() {
  try {
    const res = await Live.room_detail(roomId.value);
    const data = res.data.data as LiveRoom;
    roomDetail.value = data;
  } catch (e) {
    console.error(e);
  }
}

function onCodeUpdated(code: string) {
  roomDetail.value.joinCode = code;
}

function goBackList() {
  void router.replace('/teacher/mylive');
}

function highlightLinks() {
  linksSection.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  linksHighlight.value = true;
  setTimeout(() => {
    linksHighlight.value = false;
  }, 1500);
}

function dateFormatter(startTime: string): string {
  return formatDate(Number(startTime));
}
</script>

<style lang="less" scoped>
@import '~@/assets/styles/common/mixin.less';

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
}

.live-detail {
  background: #f8f8f8;
  box-shadow: none;

  h3 {
    margin: 0;
  }

  > div {
    width: 100%;
  }
}
.grid-container {
  width: 100%;
  margin-top: 20px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 0.7fr 0.7fr 1.6fr;
  gap: 20px 20px;
  grid-template-areas:
    'title speaker'
    'time type'
    'links links';
}

.title {
  grid-area: title;
}

.speaker {
  grid-area: speaker;
}

.time {
  grid-area: time;

  > div:last-of-type {
    display: flex;
    align-items: center;

    > p {
      margin-top: 0;
    }

    > p:last-of-type {
      font-size: 18px;
      margin-left: 30px;
    }
  }
}

.type {
  grid-area: type;
}

.title,
.speaker,
.time,
.type {
  min-width: 334px;
  width: auto;
  min-height: 87px;
  height: auto;
  padding: 14px 20px;
  background: @color-FFF;
  box-shadow: 0px 2px 12px 0px rgba(0, 0, 0, 0.06);
  border-radius: 8px;

  > div:first-of-type {
    margin-bottom: 20px;
    color: @color-2c2c34;
    font-size: @fs14;
    font-weight: bold;
  }

  > div:last-of-type {
    color: @color-666666;
    font-size: @fs14;
  }
}

.links {
  grid-area: links;
  height: 300px;
  background: #ffffff;
  box-shadow: 0px 2px 12px 0px rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  transition: box-shadow 0.3s;

  &.is-highlight {
    box-shadow:
      0 0 0 2px @color-1989fa,
      0 2px 12px 0 rgba(0, 0, 0, 0.06);
  }

  > div:first-of-type {
    display: flex;
    margin: 20px;
    p {
      margin: 0;
    }
    p:first-of-type {
      color: @color-2c2c34;
      font-weight: bold;
    }
    p:last-of-type {
      margin-left: 0;
      color: @color-666666;
    }
  }
  section {
    padding: 27px 20px 54px 20px;
    color: @color-666666;

    :deep(.share-links) {
      width: 100%;
    }
  }
}
</style>

<style lang="less">
.live-detail {
  .el-input {
    width: 127px;
    height: 34px;
    .el-input__inner {
      height: 34px;
    }
  }
}
</style>
