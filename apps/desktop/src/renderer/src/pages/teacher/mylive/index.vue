<template>
  <div>
    <sidebar-menu :active-key="activeKey" />
    <div class="backstage-center my-live">
      <div class="search-row1">
        <label for="searchName">直播名称</label>
        <el-input
          v-model="searchName"
          placeholder="请输入直播名称"
          style="width: 200px"
          @keyup.enter="onSearch"
        />
        <label for="startTime">选择时间</label>
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
        <label for="status">直播状态</label>
        <el-select
          v-model="status"
          placeholder="请选择"
          style="width: 150px"
        >
          <el-option
            v-for="item in statusOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <label for="type">直播类型</label>
        <el-select
          v-model="type"
          placeholder="请选择"
          clearable
          style="width: 150px"
        >
          <el-option
            label="全部"
            :value="''"
          />
          <el-option
            v-for="item in typeOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-button
          type="primary"
          :loading="loading"
          @click="onSearch"
        >
          搜索
        </el-button>
        <el-button
          :loading="loading"
          @click="onReset"
        >
          重置
        </el-button>
      </div>
      <div
        v-loading="loading"
        class="live-list"
        style="overflow-x: auto"
      >
        <el-table
          v-if="tableData.length > 0"
          :data="tableData"
          style="width: 100%"
          border
          stripe
          @row-click="goToDetail"
        >
          <el-table-column
            prop="roomId"
            label="教室ID"
            min-width="81"
            class-name="no-row-click"
          />
          <el-table-column
            prop="title"
            label="直播名称"
            min-width="126"
          />
          <el-table-column
            prop="type"
            label="直播类型"
            min-width="80"
          >
            <template #default="scope">
              <span>{{ typeOptions[scope.row.type]!['label'] }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="joinCode"
            label="直播码"
            min-width="90"
          />
          <el-table-column
            prop="startTime"
            label="开始时间"
            min-width="133"
            :formatter="dateFormatter"
          />
          <el-table-column
            prop="status"
            label="状态"
            min-width="56"
          >
            <template #default="scope">
              <span>{{ statusOptions[scope.row.status]!['label'] }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="hasVideo"
            label="回放"
            min-width="60"
          >
            <template #default="scope">
              <span
                v-if="scope.row.status > 2"
                class="has-video"
                @click="nav.goplayback(scope.row as LiveRoom)"
              >回放</span>
            </template>
          </el-table-column>
          <el-table-column
            label="操作"
            min-width="60"
            align="center"
          >
            <template #default="scope">
              <RoomActions
                variant="dropdown"
                :room="scope.row as LiveRoom"
                @updated="getLiveList"
                @deleted="getLiveList"
                @transferred="getLiveList"
              />
            </template>
          </el-table-column>
        </el-table>
        <el-empty
          v-else-if="!loading"
          :description="emptyDescription"
        >
          <el-button
            v-if="isFiltered"
            type="primary"
            :loading="loading"
            @click="onReset"
          >
            清空筛选
          </el-button>
        </el-empty>
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
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { DatePickerProps } from 'element-plus';
import { formatDate } from '@yunyan-live/utils';
import SidebarMenu from '@/layouts/sidebar.vue';
import RoomActions from '@/components/teacher/RoomActions.vue';
import type { LiveRoom } from '@/types/pages/teacher/live';
import Live from '@/api/backstage';
import { useRoomNavigation } from '@/composables/useRoomNavigation';
import { usePagedList } from '@/composables/usePagedList';

interface LiveListResult {
  list: LiveRoom[];
  total: number;
}

const router = useRouter();
const nav = useRoomNavigation();

const activeKey = '2';
const timerange = ref<DatePickerProps['modelValue']>([]);
const searchName = ref('');
const type = ref<number | string>('');
const status = ref<number | null>(null);
const typeOptions = ref([
  { value: 0, label: '小班教学' },
  { value: 1, label: '大班教学' }
]);
const statusOptions = ref([
  { value: 0, label: '全部' },
  { value: 1, label: '未开始' },
  { value: 2, label: '直播中' },
  { value: 3, label: '已结束' },
  { value: 4, label: '暂停' }
]);
const {
  params,
  list: tableData,
  total,
  loading,
  load,
  handleSizeChange,
  handleCurrentChange
} = usePagedList<LiveRoom>({
  pageSize: 10,
  initialLoading: true,
  onError: (e) => console.error('[mylive] getLiveList error:', e),
  fetchPage: async (query) => {
    let startTime = '';
    let endTime = '';
    const toTimestamp = (value?: string | Date) =>
      value === undefined
        ? ''
        : String(value instanceof Date ? value.getTime() : new Date(value).getTime());
    const range = timerange.value as Array<string | Date> | null;
    if (range && range.length > 0) {
      startTime = toTimestamp(range[0]);
      endTime = toTimestamp(range[1]);
    }
    const res = await Live.live_list({
      page: query.pageNum,
      pageSize: query.pageSize,
      startTime,
      endTime,
      status: status.value ? status.value : null,
      type: type.value === '' ? null : type.value,
      searchName: searchName.value
    });
    const data = res.data as LiveListResult;
    return { list: data.list, total: data.total };
  }
});
const getLiveList = load;

const isFiltered = computed(() => {
  const range = timerange.value as Array<string | Date> | null;
  return (
    searchName.value !== '' ||
    Boolean(range && range.length > 0) ||
    Boolean(status.value) ||
    type.value !== ''
  );
});

const emptyDescription = computed(() =>
  isFiltered.value ? '未找到符合条件的直播' : '暂无直播数据'
);

function resetFilters() {
  searchName.value = '';
  timerange.value = [];
  status.value = null;
  type.value = '';
  params.value.pageNum = 1;
  void getLiveList();
}

function onSearch() {
  if (loading.value) return;
  void getLiveList();
}

function onReset() {
  if (loading.value) return;
  resetFilters();
}

function dateFormatter(row: LiveRoom): string {
  return formatDate(Number(row.startTime));
}

function goToDetail(row: LiveRoom, _column: unknown, event: Event) {
  const target = event.target as HTMLElement;
  if (
    target.closest('.el-dropdown') ||
    target.closest('.has-video') ||
    target.closest('.no-row-click')
  )
    return;
  void router.push({
    path: '/teacher/createlive/detail',
    query: {
      roomId: row.roomId
    }
  });
}

onMounted(() => {
  void getLiveList();
});
</script>

<style lang="less" scoped>
@import '~@/assets/styles/common/mixin.less';

:deep(.el-table__body tr) {
  cursor: pointer;
}

.my-live {
  background: #f8f8f8;
  box-shadow: none;
}
.search-row1,
.search-row2 {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;

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

.live-list {
  min-height: 120px;
}

.el-table {
  margin-top: 17px;
  .has-video {
    cursor: pointer;
  }
}

.el-empty {
  margin-top: 17px;
}
</style>

<style lang="less">
@import '~@/assets/styles/pages/noscope.less';

.search-row1 .el-date-editor .el-range-separator {
  line-height: 32px;
}

.el-date-range-picker__time-header .el-input.el-input--small .el-input__inner {
  min-width: auto;
}
</style>
