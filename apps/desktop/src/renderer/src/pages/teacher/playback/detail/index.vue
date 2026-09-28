<template>
  <div class="detail-index">
    <sidebar-menu :active-key="activeKey" />
    <div class="backstage-center play-detail">
      <el-breadcrumb separator-icon="ArrowRight">
        <el-breadcrumb-item :to="{ path: '/teacher/playback' }">
          <el-icon><ArrowLeft /></el-icon>
          {{ roomTitle }}
        </el-breadcrumb-item>
      </el-breadcrumb>
      <div class="search-select">
        <label for="">录制时间</label>
        <el-date-picker
          v-model="timerange"
          type="datetimerange"
          range-separator="|"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          align="right"
          @change="getVideoDetail"
        />
        <div class="delete">
          <el-button
            :disabled="multipleSelection.length === 0"
            @click="multiDeleteClick"
          >
            批量删除
          </el-button>
        </div>
      </div>

      <el-table
        :data="tableData"
        style="width: 100%"
        border
        stripe
        @selection-change="handleSelectionChange"
      >
        <el-table-column
          type="selection"
          width="40"
          align="center"
        />
        <el-table-column
          prop="roomId"
          label="教室ID"
          min-width="90"
        />
        <el-table-column
          prop="id"
          label="视频ID"
          min-width="90"
        />
        <el-table-column
          prop="createTime"
          label="录制时间"
          min-width="140"
        >
          <template #default="scope">
            <span>{{ formatDate(Number(scope.row.createTime)) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          prop="duration"
          label="时长"
          min-width="90"
        >
          <template #default="scope">
            <span>{{ scope.row.duration < 60 ? `${scope.row.duration}秒` : `${Math.floor(scope.row.duration / 60)}分${scope.row.duration % 60}秒` }}</span>
          </template>
        </el-table-column>
        <el-table-column
          prop=""
          label="操作"
          min-width="120"
        >
          <template #default="scope">
            <el-button
              type="text"
              size="small"
              @click="playClick(scope.row as VideoItem)"
            >
              播放
            </el-button>
            <el-button
              type="text"
              size="small"
              @click="downloadClick(scope.row as VideoItem)"
            >
              下载
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div
        v-show="total !== 0"
        class="tc-page"
      >
        <el-pagination
          background
          :current-page="params.pageNum"
          :page-size="params.pageSize"
          layout="prev, pager, next, jumper"
          :total="total"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </div>
    <el-dialog
      v-model="centerDialogVisible"
      title=""
      width="min(480px, 90vw)"
      align-center
    >
      <el-icon
        class="jinggao"
        aria-label="警告"
      >
        <WarningFilled />
      </el-icon>
      <span>删除后，将无法恢复，确定删除么？</span>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="centerDialogVisible = false">取 消</el-button>
          <el-button
            type="primary"
            @click="submitDelete"
          >确 定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type DatePickerProps } from 'element-plus';
import dayjs from 'dayjs';
import { formatDate } from '@yunyan-live/utils';
import SidebarMenu from '@/layouts/sidebar.vue';
import type { VideoItem } from '@/types/pages/teacher/live';
import Live from '@/api/backstage';
import { saveBinaryFile } from '@/utils/webBridge';

interface VideoDetailResult {
  list: VideoItem[];
  pageInfo: { totalElements: number };
}

const route = useRoute();
const router = useRouter();

const activeKey = '3';
const params = ref({ pageNum: 1, pageSize: 6 });
const timerange = ref<DatePickerProps['modelValue']>([]);
const tableData = ref<VideoItem[]>([]);
const roomTitle = ref('');
const total = ref(0);
const multipleSelection = ref<VideoItem[]>([]);
const videoIdList = ref<string[]>([]);
const centerDialogVisible = ref(false);

function handleSelectionChange(val: VideoItem[]) {
  multipleSelection.value = val;
}

function handleSizeChange(size: number) {
  params.value.pageSize = size;
  params.value.pageNum = 1;
  void getVideoDetail();
}

function handleCurrentChange(current: number) {
  params.value.pageNum = current;
  void getVideoDetail();
}

function multiDeleteClick() {
  centerDialogVisible.value = true;
  videoIdList.value = [];
  multipleSelection.value.forEach((item) => {
    if (item.id) videoIdList.value.push(item.id);
  });
}

function playClick(row: VideoItem) {
  const recordType = row.recordType ?? 1;
  console.log('[playback/index] playClick', { recordType, filePath: row.filePath, address: row.address, roomId: row.roomId });
  void router.push({
    path: '/teacher/playback/detail/playback',
    query: {
      roomId: row.roomId,
      videoId: recordType === 1 ? (row.filePath || row.address) : row.address,
      recordType: String(recordType),
      title: `${recordType === 1 ? '窗口录制' : '流录制'} - ${getTextTime(Number(row.createTime))}`,
      duration: String(row.duration || 0),
      createTime: row.createTime,
      filePath: row.filePath || '',
    }
  });
}

function getTextTime(time: number) {
  const day = dayjs(time).format('YYYY-MM-DD');
  const a = dayjs(time).format('A') === 'AM' ? '上午' : '下午';
  const times = dayjs(time).format('HH:mm:ss');
  return `${day} ${a} ${times}`;
}

async function downloadClick(row: VideoItem) {
  const recordType = row.recordType ?? 1;
  if (recordType !== 2) {
    ElMessage.warning('仅流录制支持下载');
    return;
  }
  const videoId = row.address || row.id;
  if (!videoId) {
    ElMessage.warning('无效的视频记录');
    return;
  }
  try {
    const statusRes = await Live.download_recording(videoId);
    if (statusRes.data.code === 2002) {
      ElMessage.info(statusRes.data.msg || '视频转码中，请稍候...');
      startPolling(videoId, row.createTime);
      return;
    }
    await doDownload(videoId, row.createTime);
  } catch (e) {
    console.error(e);
    ElMessage.error('下载失败');
  }
}

function startPolling(videoId: string, createTime?: string | number) {
  let count = 0;
  const maxCount = 200;
  const timer = setInterval(async () => {
    count++;
    if (count >= maxCount) {
      clearInterval(timer);
      ElMessage.warning('转码时间过长，请稍后再试');
      return;
    }
    try {
      const res = await Live.download_recording(videoId);
      if (res.data.code !== 2002) {
        clearInterval(timer);
        await doDownload(videoId, createTime);
      }
    } catch {
      clearInterval(timer);
      ElMessage.error('下载失败');
    }
  }, 3000);
}

async function doDownload(videoId: string, createTime?: string | number) {
  try {
    ElMessage.info('正在下载，请稍候...');
    const res = await Live.download_recording_file(videoId);
    const blob = new Blob([res.data], { type: 'video/mp4' });
    const buffer = await blob.arrayBuffer();
    const defaultName = `录制_${getTextTime(Number(createTime))}.mp4`;
    const saved = await saveBinaryFile(buffer, defaultName);
    if (saved) {
      ElMessage.success('下载成功');
    } else {
      ElMessage.info('已取消下载');
    }
  } catch (e) {
    console.error(e);
    ElMessage.error('下载失败');
  }
}

async function submitDelete() {
  centerDialogVisible.value = false;
  try {
    const res = await Live.videoids_delete({ videoIds: videoIdList.value });
    ElMessage.success(res.data.msg ?? '删除成功');
    void getVideoDetail();
  } catch (e) {
    console.error(e);
  }
}

async function getVideoDetail() {
  const range = timerange.value as Array<string | Date> | null;
  const startTime = range && range.length > 0 ? String(range[0]) : '';
  const endTime = range && range.length > 1 ? String(range[1]) : '';
  try {
    const res = await Live.video_detail({
      pageNum: params.value.pageNum,
      pageSize: params.value.pageSize,
      roomId: route.query.roomId,
      startTime,
      endTime
    });
    const data = res.data.data as VideoDetailResult;
    console.log('[playback/index] getVideoDetail', data.list?.map(i => ({ id: i.id, recordType: i.recordType, filePath: i.filePath, address: i.address })));
    tableData.value = data.list;
    total.value = data.pageInfo.totalElements;
  } catch (e) {
    console.error(e);
  }
}

onMounted(() => {
  roomTitle.value = (route.query.name as string) ?? '';
  void getVideoDetail();
});
</script>

<style lang="less" scoped>
@import '~@/assets/styles/common/mixin.less';

.play-detail {
  background: #f8f8f8;
  box-shadow: none;
}
.el-icon-arrow-left {
  cursor: pointer;
}
.search-select {
  margin-top: 8px;
  display: grid;
  grid-template-columns: 66px 1.4fr 1.2fr;
  grid-template-rows: 1fr;
  gap: 2px 2px;
  grid-template-areas: '. . .';

  > label {
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: @fs14;
    font-weight: bold;
    color: @color-2c2c34;
    height: 34px;
  }
  .delete {
    display: flex;
    justify-content: flex-end;
  }
}
.el-table {
  margin-top: 20px;
}
</style>

<style lang="less">
@import '~@/assets/styles/pages/noscope.less';
.play-detail {
  .el-button.el-button--text.el-button--small {
    span {
      color: @color-051540;
      font-size: @fs12;
    }
  }
}
.detail-index {
  .el-dialog__headerbtn {
    top: 10px;
  }
}
</style>
