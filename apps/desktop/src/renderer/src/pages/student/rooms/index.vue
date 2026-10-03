<template>
  <div class="student-rooms">
    <div class="rooms-header">
      <ul class="user-info">
        <li class="login-name">
          {{ userStore.userInfo.userName }}
        </li>
        <li>欢迎您</li>
        <li>
          <el-button
            text
            @click="settingsVisible = true"
          >
            设置
          </el-button>
          <SettingsDialog v-model="settingsVisible" />
        </li>
      </ul>
    </div>

    <div class="rooms-list">
      <div class="rooms-toolbar">
        <div class="toolbar-left">
          <el-button
            type="danger"
            :disabled="multipleSelection.length === 0"
            @click="handleBatchDelete"
          >
            批量删除
          </el-button>
        </div>
        <div class="toolbar-right">
          <el-input
            v-model="joinCode"
            placeholder="请输入直播码"
            @keyup.enter="handleJoin"
          />
          <el-button
            type="primary"
            @click="handleJoin"
          >
            加入
          </el-button>
        </div>
      </div>
      <div v-loading="loading">
        <el-table
          v-if="rooms.length > 0"
          :data="rooms"
          style="width: 100%"
          @selection-change="handleSelectionChange"
        >
          <el-table-column
            type="selection"
            width="40"
          />
          <el-table-column
            prop="title"
            label="直播名称"
          />
          <el-table-column
            prop="speakerName"
            label="老师"
          />
          <el-table-column
            label="直播类型"
            min-width="80"
          >
            <template #default="{ row }">
              {{ row.type === 0 ? '小班教学' : '大班教学' }}
            </template>
          </el-table-column>
          <el-table-column
            prop="joinCode"
            label="直播码"
          />
          <el-table-column label="状态">
            <template #default="{ row }">
              <el-tag :type="getStatusType(row.status)">
                {{ getStatusText(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="开始时间">
            <template #default="{ row }">
              {{ formatDate(Number(row.startTime)) }}
            </template>
          </el-table-column>
          <el-table-column
            label="操作"
            min-width="120"
          >
            <template #default="{ row }">
              <el-button
                type="text"
                size="small"
                @click="enterRoom(row as RoomItem)"
              >
                进入
              </el-button>
              <el-button
                type="text"
                size="small"
                @click="deleteRoom(row as RoomItem)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty
          v-else-if="!loading"
          description="暂无直播数据"
        >
          <p class="empty-hint">
            如有直播码，可在上方输入并加入直播
          </p>
        </el-empty>
      </div>
      <el-pagination
        v-show="total !== 0"
        background
        :current-page="params.page"
        :page-size="params.pageSize"
        layout="prev, pager, next, jumper"
        :total="total"
        style="margin-top: 16px; justify-content: flex-end;"
        @current-change="handleCurrentChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/store/user';
import api from '@/api';
import { formatDate } from '@yunyan-live/utils';
import { ElMessage, ElMessageBox } from 'element-plus';
import SettingsDialog from '@/components/SettingsDialog.vue';

interface RoomItem {
  id: string;
  roomId: string;
  title: string;
  speakerName: string;
  liveUserId: string;
  joinCode: string;
  status: number;
  startTime: string;
  type: number;
  joinedAt: string;
}

const router = useRouter();
const userStore = useUserStore();
const joinCode = ref('');
const rooms = ref<RoomItem[]>([]);
const multipleSelection = ref<RoomItem[]>([]);
const params = ref({ page: 1, pageSize: 10 });
const settingsVisible = ref(false);
const total = ref(0);
const loading = ref(true);

function getStatusType(status: number) {
  const map: Record<number, 'info' | 'success' | 'danger' | 'warning'> = {
    1: 'info',
    2: 'success',
    3: 'danger',
    4: 'warning'
  };
  return map[status] || 'info';
}

function getStatusText(status: number) {
  const map: Record<number, string> = {
    1: '已创建',
    2: '直播中',
    3: '已结束',
    4: '暂停'
  };
  return map[status] || '未知';
}

async function loadRooms() {
  loading.value = true;
  try {
    const res = await api.student_rooms({
      page: params.value.page,
      pageSize: params.value.pageSize
    });
    if (res.data.code === 1000) {
      rooms.value = res.data.data.list;
      total.value = res.data.data.total;
    }
  } catch (err) {
    console.error('加载直播间列表失败', err);
  } finally {
    loading.value = false;
  }
}

function handleSelectionChange(val: RoomItem[]) {
  multipleSelection.value = val;
}

async function handleBatchDelete() {
  try {
    await ElMessageBox.confirm(`确定要删除选中的 ${multipleSelection.value.length} 条记录吗？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });

    const roomIds = multipleSelection.value.map(item => item.roomId);
    const res = await api.batch_leave(roomIds);
    if (res.data.code === 1000) {
      ElMessage.success('删除成功');
      void loadRooms();
    }
  } catch {
    // 取消操作
  }
}

function handleCurrentChange(current: number) {
  params.value.page = current;
  void loadRooms();
}

async function handleJoin() {
  if (!joinCode.value.trim()) {
    ElMessage.warning('请输入直播码');
    return;
  }

  try {
    const res = await api.join_live({
      joinCode: joinCode.value.trim(),
      nickName: userStore.userInfo.userName
    });

    if (res.data.code === 1000) {
      ElMessage.success('加入成功');
      joinCode.value = '';
      await loadRooms();
    } else {
      ElMessage.error(res.data.msg || '加入失败');
    }
  } catch {
    ElMessage.error('加入失败，请检查直播码');
  }
}

async function enterRoom(room: RoomItem) {
  if (room.status === 3) {
    ElMessage.warning('该直播已结束');
    return;
  }

  const type = room.type === 0 ? 'small' : 'large';
  const role = room.liveUserId === userStore.guid ? 'teacher' : 'student';

  if (role === 'student') {
    try {
      const res = await api.join_live({
        joinCode: room.joinCode,
        nickName: userStore.userInfo.userName
      });
      if (res.data.code !== 1000) {
        ElMessage.error(res.data.msg || '加入失败');
        return;
      }
    } catch {
      ElMessage.error('加入失败');
      return;
    }
  }

  router.push({
    path: `/classroom/${type}${role}`,
    query: {
      roomId: room.roomId,
      code: joinCode.value || '',
      identity: role,
      nickName: userStore.userInfo.userName
    }
  });
}

async function deleteRoom(room: RoomItem) {
  try {
    await ElMessageBox.confirm('确定要删除该直播间吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });

    const res = await api.batch_leave([room.roomId]);
    if (res.data.code === 1000) {
      ElMessage.success('删除成功');
      await loadRooms();
    }
  } catch {
    // 取消操作
  }
}

onMounted(() => {
  loadRooms();
});
</script>

<style lang="less" scoped>
@import '~@/assets/styles/common/mixin.less';

.student-rooms {
  padding: 20px;
  min-height: 100vh;
  background: @color-bg;
}

.rooms-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 20px;

  .user-info {
    display: flex;
    list-style: none;
    align-items: center;
    margin: 0;
    font-size: @fs12;
    color: @color-333333;

    .login-name {
      margin-right: 10px;
      font-weight: bold;
    }

    li:nth-child(2) {
      margin-right: 20px;
    }
  }
}

.rooms-list {
  background: @color-FFF;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.rooms-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;

  .toolbar-right {
    display: flex;
    gap: 10px;
  }
}

.el-empty {
  margin-top: 8px;
}

.empty-hint {
  margin: 0;
  font-size: @fs12;
  color: #999;
}
</style>
