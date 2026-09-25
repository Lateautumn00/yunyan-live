<template>
  <div>
    <sidebar-menu :active-key="activeKey" />
    <div class="backstage-center live-detail">
      <h3>直播概况</h3>
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
        <div class="links">
          <div>
            <p>登录方式：</p>
            <p>下面为登录链接，您可以将其分享给各角色</p>
          </div>
          <section>
            <div>
              <div>
                <div class="code">
                  <span>直播码</span>
                  <span>{{ roomDetail.joinCode }}</span>
                  <el-icon
                    class="copy"
                    aria-label="复制"
                    @click="copyLink(roomDetail.joinCode)"
                  >
                    <CopyDocument />
                  </el-icon>
                </div>
                <el-button @click="updateCode">
                  更新参加码
                </el-button>
              </div>
              <div>
                <div class="copy-line">
                  <label for="">客户端进入</label>
                  <el-input value="http://abc" />
                </div>
                <span
                  class="copy"
                  @click="copyLink('http://abc')"
                >复制</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { formatDate } from '@yunyan-live/utils';
import SidebarMenu from '@/layouts/sidebar.vue';
import type { LiveRoom } from '@/types/pages/teacher/live';
import Live from '@/api/backstage';

const route = useRoute();

const activeKey = '1';
const roomDetail = ref<LiveRoom>({
  title: '',
  speakerName: '',
  startTime: '',
  type: 0,
  duration: 0
});
const roomId = ref('');

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

async function updateCode() {
  try {
    const res = await Live.update_code({
      roomId: roomId.value
    });
    const data = res.data.data as string;
    roomDetail.value.joinCode = data;
    ElMessage.success(res.data.msg ?? '更新成功');
  } catch (e) {
    console.error(e);
  }
}

function dateFormatter(startTime: string): string {
  return formatDate(Number(startTime));
}

function copyLink(content: string | undefined) {
  if (content) {
    window.electronAPI.clipboardWriteText(content);
  }
  ElMessage.success('复制成功');
}
</script>

<style lang="less" scoped>
@import '~@/assets/styles/common/mixin.less';

.code {
  display: flex;
  align-items: center;
  .copy {
    font-size: 14px;
    margin-left: 4px;
    cursor: pointer;
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

  > div {
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
    display: flex;
    justify-content: space-between;
    color: @color-666666;
    > div {
      width: 45%;
      > div {
        margin-bottom: 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        > div span:last-of-type {
          color: @color-286bff;
          margin-left: 20px;
        }
        .copy-line {
          display: flex;
          label {
            width: 104px;
          }
          .el-input {
            width: 218px;
          }
        }
        .copy {
          cursor: pointer;
        }
        > span {
          color: @color-286bff;
        }
      }
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
