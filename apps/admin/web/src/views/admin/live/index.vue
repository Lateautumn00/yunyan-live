<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useUserStoreHook } from '@/store/modules/user';
import {
  listLiveRooms,
  deleteLiveRoom,
  listRecordings,
  deleteRecordings,
  listCoursewares,
  deleteCourseware,
  type LiveRoomItem,
  type RecordingItem,
  type CoursewareItem
} from '@/api/admin';

defineOptions({ name: 'AdminLiveList' });

/**
 * 直播间全局管理（批次 7c）
 * - 读：admin-service /admin/live/{rooms,recordings,coursewares} → admin-service 直查共享库
 * - 写：删除经 live-service（Janus 销毁 + 软删），仅超管（role=1）可见
 */
const userStore = useUserStoreHook();
const isSuperAdmin = computed(() => userStore.roles.includes('admin'));

const activeTab = ref<'rooms' | 'recordings' | 'coursewares'>('rooms');

// ---------- 直播间 ----------
const roomLoading = ref(false);
const rooms = ref<LiveRoomItem[]>([]);
const roomTotal = ref(0);
const roomPage = ref(1);
const roomPageSize = ref(20);
const roomKeyword = ref('');
const roomStatus = ref(0);

const ROOM_STATUS: Record<number, { label: string; type: 'success' | 'info' | 'warning' }> = {
  1: { label: '未开播', type: 'info' },
  2: { label: '直播中', type: 'success' },
  3: { label: '已结束', type: 'warning' }
};

async function fetchRooms() {
  roomLoading.value = true;
  try {
    const res = await listLiveRooms({
      page: roomPage.value,
      pageSize: roomPageSize.value,
      keyword: roomKeyword.value,
      status: roomStatus.value
    });
    rooms.value = res.items;
    roomTotal.value = res.total;
  } catch (e: any) {
    ElMessage.error(e?.message || '加载直播间列表失败');
  } finally {
    roomLoading.value = false;
  }
}

async function removeRoom(row: LiveRoomItem) {
  await ElMessageBox.confirm(
    `确定删除直播间「${row.title}」？删除后学生端不可再进入。`,
    '删除确认',
    { type: 'warning' }
  );
  await deleteLiveRoom(row.roomId);
  ElMessage.success('已删除');
  await fetchRooms();
}

// ---------- 录像 ----------
const recLoading = ref(false);
const records = ref<RecordingItem[]>([]);
const recTotal = ref(0);
const recPage = ref(1);
const recPageSize = ref(20);
const recKeyword = ref('');

async function fetchRecordings() {
  recLoading.value = true;
  try {
    const res = await listRecordings({
      page: recPage.value,
      pageSize: recPageSize.value,
      keyword: recKeyword.value
    });
    records.value = res.items;
    recTotal.value = res.total;
  } catch (e: any) {
    ElMessage.error(e?.message || '加载录像列表失败');
  } finally {
    recLoading.value = false;
  }
}

async function removeRecording(row: RecordingItem) {
  await ElMessageBox.confirm(`确定删除录像「${row.fileName}」？`, '删除确认', { type: 'warning' });
  await deleteRecordings('video', [row.id]);
  ElMessage.success('已删除');
  await fetchRecordings();
}

// ---------- 课件 ----------
const cwLoading = ref(false);
const coursewares = ref<CoursewareItem[]>([]);
const cwTotal = ref(0);
const cwPage = ref(1);
const cwPageSize = ref(20);
const cwKeyword = ref('');

async function fetchCoursewares() {
  cwLoading.value = true;
  try {
    const res = await listCoursewares({
      page: cwPage.value,
      pageSize: cwPageSize.value,
      keyword: cwKeyword.value
    });
    coursewares.value = res.items;
    cwTotal.value = res.total;
  } catch (e: any) {
    ElMessage.error(e?.message || '加载课件列表失败');
  } finally {
    cwLoading.value = false;
  }
}

async function removeCourseware(row: CoursewareItem) {
  await ElMessageBox.confirm(`确定删除课件「${row.filename}」？`, '删除确认', { type: 'warning' });
  await deleteCourseware(row.id);
  ElMessage.success('已删除');
  await fetchCoursewares();
}

function formatTime(ts: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-CN');
}

function formatSize(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

onMounted(fetchRooms);

/** 页签切换时按需拉取（lazy 页签首次进入无数据） */
function handleTabChange(name: string | number) {
  if (name === 'recordings' && records.value.length === 0) void fetchRecordings();
  if (name === 'coursewares' && coursewares.value.length === 0) void fetchCoursewares();
}
</script>

<template>
  <div class="admin-live-list">
    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <!-- 直播间 -->
      <el-tab-pane label="直播间" name="rooms">
        <div class="search-bar">
          <el-input
            v-model="roomKeyword"
            placeholder="搜索房间名 / 主讲人"
            clearable
            style="width: 240px"
            @keyup.enter="fetchRooms"
          />
          <el-select v-model="roomStatus" style="width: 140px">
            <el-option label="全部状态" :value="0" />
            <el-option label="未开播" :value="1" />
            <el-option label="直播中" :value="2" />
            <el-option label="已结束" :value="3" />
          </el-select>
          <el-button type="primary" @click="((roomPage = 1), fetchRooms())">查询</el-button>
        </div>

        <el-table v-loading="roomLoading" :data="rooms" stripe border>
          <el-table-column prop="title" label="房间名称" min-width="180" show-overflow-tooltip />
          <el-table-column prop="speakerName" label="主讲人" width="140" />
          <el-table-column prop="joinCode" label="房间号" width="120" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="ROOM_STATUS[row.status]?.type ?? 'info'" size="small">
                {{ ROOM_STATUS[row.status]?.label ?? row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="在线" width="80">
            <template #default="{ row }">{{ row.liveNums }}</template>
          </el-table-column>
          <el-table-column label="开始时间" width="180">
            <template #default="{ row }">{{ formatTime(row.startTime) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="isSuperAdmin"
                size="small"
                type="danger"
                @click="removeRoom(row as LiveRoomItem)"
              >
                删除
              </el-button>
              <span v-else class="readonly">只读</span>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          v-model:current-page="roomPage"
          v-model:page-size="roomPageSize"
          :total="roomTotal"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          style="margin-top: 16px; justify-content: flex-end"
          @current-change="fetchRooms"
          @size-change="fetchRooms"
        />
      </el-tab-pane>

      <!-- 录像 -->
      <el-tab-pane label="录像" name="recordings" lazy>
        <div class="search-bar">
          <el-input
            v-model="recKeyword"
            placeholder="搜索文件名 / 房间 / 主讲人"
            clearable
            style="width: 260px"
            @keyup.enter="((recPage = 1), fetchRecordings())"
          />
          <el-button type="primary" @click="((recPage = 1), fetchRecordings())">查询</el-button>
        </div>

        <el-table v-loading="recLoading" :data="records" stripe border>
          <el-table-column prop="fileName" label="文件名" min-width="200" show-overflow-tooltip />
          <el-table-column
            prop="roomTitle"
            label="所属房间"
            min-width="160"
            show-overflow-tooltip
          />
          <el-table-column prop="teacherName" label="主讲人" width="120" />
          <el-table-column label="大小" width="100">
            <template #default="{ row }">{{ formatSize(row.fileSize) }}</template>
          </el-table-column>
          <el-table-column label="时长" width="90">
            <template #default="{ row }">{{ row.duration }}s</template>
          </el-table-column>
          <el-table-column label="录制时间" width="180">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="isSuperAdmin"
                size="small"
                type="danger"
                @click="removeRecording(row as RecordingItem)"
              >
                删除
              </el-button>
              <span v-else class="readonly">只读</span>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          v-model:current-page="recPage"
          v-model:page-size="recPageSize"
          :total="recTotal"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          style="margin-top: 16px; justify-content: flex-end"
          @current-change="fetchRecordings"
          @size-change="fetchRecordings"
        />
      </el-tab-pane>

      <!-- 课件 -->
      <el-tab-pane label="课件" name="coursewares" lazy>
        <div class="search-bar">
          <el-input
            v-model="cwKeyword"
            placeholder="搜索文件名 / 房间"
            clearable
            style="width: 260px"
            @keyup.enter="((cwPage = 1), fetchCoursewares())"
          />
          <el-button type="primary" @click="((cwPage = 1), fetchCoursewares())">查询</el-button>
        </div>

        <el-table v-loading="cwLoading" :data="coursewares" stripe border>
          <el-table-column prop="filename" label="文件名" min-width="220" show-overflow-tooltip />
          <el-table-column
            prop="roomTitle"
            label="所属房间"
            min-width="160"
            show-overflow-tooltip
          />
          <el-table-column prop="filext" label="类型" width="80" />
          <el-table-column label="大小" width="100">
            <template #default="{ row }">{{ formatSize(row.filesize) }}</template>
          </el-table-column>
          <el-table-column label="上传时间" width="180">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="isSuperAdmin"
                size="small"
                type="danger"
                @click="removeCourseware(row as CoursewareItem)"
              >
                删除
              </el-button>
              <span v-else class="readonly">只读</span>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          v-model:current-page="cwPage"
          v-model:page-size="cwPageSize"
          :total="cwTotal"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          style="margin-top: 16px; justify-content: flex-end"
          @current-change="fetchCoursewares"
          @size-change="fetchCoursewares"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.admin-live-list {
  padding: 16px;
}

.search-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.readonly {
  color: #909399;
  font-size: 12px;
}
</style>
