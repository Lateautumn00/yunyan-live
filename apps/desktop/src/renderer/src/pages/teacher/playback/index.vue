<template>
  <div>
    <sidebar-menu :active-key="activeKey" />
    <div class="backstage-center play-back">
      <div class="search-row1">
        <label for="searchName">直播名称</label>
        <el-input
          v-model="searchName"
          placeholder="请输入直播名称"
          style="width: 200px"
          @keyup.enter="onSearch"
        />
        <label for="timerange">选择时间</label>
        <el-date-picker
          v-model="timerange"
          type="datetimerange"
          range-separator="|"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          align="right"
          style="width: 340px"
        />
      </div>
      <div class="search-row2">
        <label for="type">直播类型</label>
        <el-select v-model="type" placeholder="请选择" style="width: 150px">
          <el-option label="全部" value="" />
          <el-option
            v-for="item in typeOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-button type="primary" :loading="listLoading" @click="onSearch"> 搜索 </el-button>
        <el-button :loading="listLoading" @click="onReset"> 重置 </el-button>
        <div class="delete">
          <el-button
            :disabled="multipleSelection.length === 0"
            :loading="deleting"
            @click="handleDelete"
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
        <el-table-column type="selection" width="40" align="center" />
        <el-table-column prop="roomId" label="教室ID" min-width="78px" />
        <el-table-column prop="title" label="直播名称" min-width="213" />
        <el-table-column prop="type" label="直播类型" min-width="68">
          <template #default="scope">
            <span v-if="scope.row.type === 0">小班教学</span>
            <span v-else>大班教学</span>
          </template>
        </el-table-column>
        <el-table-column prop="time" label="录制时间" min-width="133">
          <template #default="scope">
            <span>{{ formatDate(Number(scope.row.time)) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="count" label="录制数量" min-width="68" />
        <el-table-column label="操作" width="100">
          <template #default="scope">
            <el-button text size="small" @click="handleClick(scope.row as LiveRoom)">
              查看详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-show="total !== 0" class="tc-page">
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
import { useRouter } from 'vue-router';
import { type DatePickerProps } from 'element-plus';
import { formatDate } from '@yunyan-live/utils';
import SidebarMenu from '@/layouts/sidebar.vue';
import type { LiveRoom } from '@/types/pages/teacher/live';
import Live from '@/api/backstage';
import { usePagedList } from '@/composables/usePagedList';
import { useConfirmDelete } from '@/composables/useConfirmDelete';

interface VideoListResult {
  list: LiveRoom[];
  pageInfo: { totalElements: number };
}

const router = useRouter();

const activeKey = '3';
const timerange = ref<DatePickerProps['modelValue']>([]);
const searchName = ref('');
const type = ref<number | ''>('');
const typeOptions = ref([
  { value: 0, label: '小班教学' },
  { value: 1, label: '大班教学' }
]);
const multipleSelection = ref<LiveRoom[]>([]);

const {
  params,
  list: tableData,
  total,
  loading: listLoading,
  load,
  handleSizeChange,
  handleCurrentChange
} = usePagedList<LiveRoom>({
  pageSize: 6,
  fetchPage: async query => {
    let startTime = '';
    let endTime = '';
    const range = timerange.value as Array<string | Date> | null;
    if (range && range.length > 0) {
      startTime = String(range[0]);
      endTime = String(range[1]);
    }
    const res = await Live.video_list({
      pageNum: query.pageNum,
      pageSize: query.pageSize,
      startTime,
      endTime,
      type: type.value,
      searchName: searchName.value
    });
    const data = res.data as VideoListResult;
    return { list: data.list, total: data.pageInfo.totalElements };
  }
});
const getVideoList = load;

function handleSelectionChange(val: LiveRoom[]) {
  multipleSelection.value = val;
}

function handleClick(row: LiveRoom) {
  void router.push({
    path: '/teacher/playback/detail',
    query: {
      roomId: row.roomId,
      name: row.title
    }
  });
}

const { deleting, confirmAndDelete } = useConfirmDelete<{ roomIds: string[] }>({
  message: () => '批量删除后将无法恢复，确定删除么？',
  action: async payload => {
    const res = await Live.roomids_delete({ roomIds: payload.roomIds });
    return res;
  },
  successMessage: result => (result as { msg?: string }).msg ?? '删除成功',
  refresh: () => getVideoList(),
  onError: e => console.error(e)
});

async function handleDelete() {
  const roomIds: string[] = [];
  multipleSelection.value.forEach(item => {
    if (item.roomId) roomIds.push(item.roomId);
  });
  await confirmAndDelete({ roomIds });
}

function resetFilters() {
  searchName.value = '';
  timerange.value = [];
  type.value = '';
  params.value.pageNum = 1;
  void getVideoList();
}

function onSearch() {
  if (listLoading.value) return;
  void getVideoList();
}

function onReset() {
  if (listLoading.value) return;
  resetFilters();
}

onMounted(() => {
  void getVideoList();
});
</script>

<style lang="less" scoped>
@import '~@/assets/styles/common/mixin.less';

.play-back {
  background: #f8f8f8;
  box-shadow: none;
}
.search-row1,
.search-row2 {
  display: flex;
  align-items: center;
  gap: 10px;

  > label {
    flex-shrink: 0;
    font-size: @fs14;
    font-weight: bold;
    color: @color-2c2c34;
  }
}

.search-row2 {
  margin-top: 16px;
}

.delete {
  margin-left: auto;
}

.el-table {
  margin-top: 17px;
}
</style>

<style lang="less">
@import '~@/assets/styles/pages/noscope.less';

.play-back {
  .el-button.el-button--text.el-button--small {
    span {
      color: @color-051540;
    }
  }
}
</style>
