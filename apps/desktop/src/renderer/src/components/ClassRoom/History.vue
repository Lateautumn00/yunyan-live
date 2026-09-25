<template>
  <div class="classroom-history">
    <ul>
      <li
        v-for="(item, index) in videoList"
        :key="index"
      >
        <div
          class="top"
          @click="palyHistoryVideo(item.address || item.playBackUrl, `回放${item.title}`)"
        >
          <span>回放{{ item.title }}</span>
        </div>
        <div class="bottom">
          <span class="time">时长:{{ conversions(item.duration) }}</span>
          <div class="img-but">
            <el-icon
              aria-label="回放"
              class="del"
              @click="palyHistoryVideo(item.address || item.playBackUrl, `回放${item.title}`)"
            >
              <VideoPlay />
            </el-icon>
            <el-icon
              v-if="isTeacher"
              aria-label="删除"
              class="del"
              @click="delVideoList(item.id, index)"
            >
              <Delete />
            </el-icon>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import dayjs from 'dayjs';
import apiBackstage from '@/api/backstage';

interface HistoryVideoItem {
  id?: string;
  address?: string;
  playBackUrl?: string;
  title?: string;
  duration?: number;
  createTime?: number;
}

defineProps<{ isTeacher?: boolean }>();

const emit = defineEmits<{
  (e: 'palyHistoryVideo', id: string | undefined, title: string): void;
  (e: 'delList', id: string | undefined, index: number): void;
}>();

const videoList = ref<HistoryVideoItem[]>([]);

function conversions(time: number | undefined): string {
  let str = `00'00"`;
  if (time && time > 0) {
    const minute = Math.floor(time / 60);
    const second = time % 60;
    if (minute < 10 && second < 10) {
      str = `0${minute}'0${second}"`;
    } else if (minute < 10 && second >= 10) {
      str = `0${minute}'${second}"`;
    } else if (minute >= 10 && second < 10) {
      str = `${minute}'0${second}"`;
    } else {
      str = `${minute}'${second}"`;
    }
  }
  return str;
}

function getTextTime(time: number) {
  const day = dayjs(time).format('YYYY-MM-DD');
  const a = dayjs(time).format('A') === 'AM' ? '上午' : '下午';
  const times = dayjs(time).format('HH:mm:ss');
  return `${day} ${a} ${times}`;
}

function palyHistoryVideo(id: string | undefined, title: string) {
  if (!id) {
    ElMessage.warning('该视频无有效播放地址，无法回放');
    return;
  }
  emit('palyHistoryVideo', id, title);
}

function videoLists(status: boolean, data: HistoryVideoItem) {
  data.title = getTextTime(data.createTime as number);
  if (status) videoList.value.unshift(data);
}

function delVideoList(id: string | undefined, index: number) {
  void apiBackstage
    .videoids_delete({ data: { videoIds: [id] } })
    .then(() => {
      delList(id, index);
    })
    .catch((e) => {
      console.error(e);
      ElMessage.error('删除服务异常');
    });
}

function setSplice(index: number) {
  videoList.value.splice(index, 1);
}

function delList(id: string | undefined, index: number) {
  emit('delList', id, index);
}

defineExpose({ videoLists, setSplice, delList });
</script>

<style lang="less" scoped>
.classroom-history {
  color: #323232;
  padding: 0px 7px;
  height: 100%;
  ul {
    overflow-y: scroll;
    overflow: auto;
    height: 100%;
    padding: 0px;
    padding-inline-start: 0px !important;
    margin-block-start: 0px !important;
    margin-block-end: 0px !important;
    li {
      list-style-type: none;
      height: 86px;
      padding: 6px 6px;
      border-radius: 6px;
      border: 1px solid #dfdfdf;
      margin-top: 6px;

      &:hover {
        background: #e2e2e7;
        border-radius: 3px;
      }
      .top {
        font-size: 14px;
        font-weight: 600;
        color: #414141;
        cursor: pointer;
      }
      .bottom {
        margin-top: 46px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        .img-but {
          display: flex;
          align-items: center;
          .el-icon {
            cursor: pointer;
            &:hover {
              background: #ffffff;
              border-radius: 4px;
            }
          }
        }
        .time {
          font-size: 12px;
          color: #7e7e7e;
        }
        .del {
          font-size: 24px;
        }
      }
    }
  }
}
</style>