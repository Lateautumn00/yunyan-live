<template>
  <div>
    <sidebar-menu :active-key="activeKey" />
    <div class="backstage-center my-live">
      <el-breadcrumb separator-icon="ArrowRight">
        <el-breadcrumb-item :to="{ path: '/teacher/mylive' }">
          <el-icon><ArrowLeft /></el-icon>
          {{ roomTitle }}
        </el-breadcrumb-item>
      </el-breadcrumb>

      <div style="overflow-x: auto">
        <el-table
          :data="tableData"
          style="width: 100%"
          border
          stripe
        >
          <el-table-column
            prop="nickName"
            label="昵称"
            min-width="193"
          />
          <el-table-column
            prop="watchTime"
            label="观看时长"
            min-width="193"
          >
            <template #default="scope">
              <span>{{ formatDurationCn(scope.row.watchTime) }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="joinedAt"
            label="进入时间"
            min-width="193"
          >
            <template #default="scope">
              <span>{{ formatTime(scope.row.joinedAt) }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="leftAt"
            label="离开时间"
            min-width="193"
          >
            <template #default="scope">
              <span>{{ scope.row.leftAt ? formatTime(scope.row.leftAt) : (scope.row.isOnline ? '在线' : '已离开') }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
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
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { formatDurationCn } from '@yunyan-live/utils';
import SidebarMenu from '@/layouts/sidebar.vue';
import type { WatchItem } from '@/types/pages/teacher/live';
import Live from '@/api/backstage';
import { usePagedList } from '@/composables/usePagedList';

interface WatchListResult {
  list: WatchItem[];
  pageInfo: { totalElements: number };
}

const route = useRoute();

const activeKey = '2';
const roomTitle = ref('');

const {
  params,
  list: tableData,
  total,
  load: getWatchList,
  handleSizeChange,
  handleCurrentChange
} = usePagedList<WatchItem>({
  pageSize: 6,
  fetchPage: async (query) => {
    const res = await Live.watchtime_list({
      pageNum: query.pageNum,
      pageSize: query.pageSize,
      roomId: route.query.roomId,
    });
    const data = res.data as WatchListResult;
    return { list: data.list, total: data.pageInfo.totalElements };
  }
});

function formatTime(ts: string): string {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', { hour12: false });
}

onMounted(() => {
  roomTitle.value = (route.query.name as string) ?? '';
  void getWatchList();
});
</script>

<style lang="less" scoped>
@import '~@/assets/styles/common/mixin.less';

.my-live {
  background: #f8f8f8;
  box-shadow: none;
}
.el-icon-arrow-left {
  cursor: pointer;
}
.el-table {
  margin-top: 17px;
}
</style>
