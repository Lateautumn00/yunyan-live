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
          @keyup.enter="getLiveList"
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
          @click="getLiveList"
        >
          搜索
        </el-button>
        <el-button @click="resetFilters">
          重置
        </el-button>
      </div>
      <div style="overflow-x: auto">
        <el-table
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
                @click="goplayback(scope.row as LiveRoom)"
              >回放</span>
            </template>
          </el-table-column>
          <el-table-column
            label="操作"
            min-width="60"
            align="center"
          >
            <template #default="scope">
              <el-dropdown
                @command="
                  option => {
                    handleOptionChange(option, scope.row as LiveRoom);
                  }
                "
              >
                <span class="el-dropdown-link">
                  <el-icon><MoreFilled /></el-icon>
                </span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="gotoroom">
                      进入房间
                    </el-dropdown-item>
                    <el-dropdown-item command="share">
                      分享
                    </el-dropdown-item>
                    <el-dropdown-item command="watchlist">
                      时长列表
                    </el-dropdown-item>
                    <el-dropdown-item
                      v-if="scope.row.status === 1"
                      command="transfer"
                    >
                      转移
                    </el-dropdown-item>
                    <el-dropdown-item
                      v-if="scope.row.status === 1"
                      command="edit"
                    >
                      编辑
                    </el-dropdown-item>
                    <el-dropdown-item command="delete">
                      删除
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
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
    <el-dialog
      v-model="deleteDialogVisible"
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
          <el-button @click="deleteDialogVisible = false">取 消</el-button>
          <el-button
            type="primary"
            @click="submitDelete"
          >确 定</el-button>
        </span>
      </template>
    </el-dialog>
    <el-dialog
      v-model="roomDialogVisible"
      title="请选择进入直播间身份"
      width="min(480px, 90vw)"
    >
      <div class="room-entrance">
        <div
          class="go-live-room"
          @click="[goLiveRoom(0)]"
        >
          <div :class="isHostRoom ? 'guest' : 'guest-chosen'">
            <p>以听众身份进入</p>
            <p>我爱知识与自由</p>
          </div>
        </div>
        <div
          class="go-live-room"
          @click="[goLiveRoom(1)]"
        >
          <div :class="!isHostRoom ? 'host' : 'host-chosen'">
            <p>以老师身份进入</p>
            <p>争做新时代的好讲师</p>
          </div>
        </div>
      </div>
    </el-dialog>
    <el-dialog
      v-model="shareDialogVisible"
      title="分享"
      class="share-dialog"
      width="min(480px, 90vw)"
      align-center
    >
      <div class="share-row">
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
      <div class="share-row">
        <div class="copy-line">
          <label for="">客户端进入</label>
          <el-input value="https://500px.com" />
        </div>
        <span
          class="copy"
          @click="copyLink('https://500px.com')"
        >复制</span>
      </div>
    </el-dialog>
    <el-dialog
      v-model="transferDialogVisible"
      title="转移直播间"
      width="min(480px, 90vw)"
      align-center
    >
      <div class="transfer-form">
        <div class="form-row">
          <label>直播间：</label>
          <span>{{ operateRoom.title }}</span>
        </div>
        <div class="form-row">
          <label>转移码：</label>
          <el-input
            v-model="transferCode"
            placeholder="请输入对方提供的转移码"
            style="width: 260px"
          />
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="transferDialogVisible = false">取 消</el-button>
          <el-button
            type="primary"
            :disabled="!transferCode"
            @click="submitTransfer"
          >确 定</el-button>
        </span>
      </template>
    </el-dialog>
    <el-dialog
      v-model="editDialogVisible"
      title="编辑直播间"
      width="min(600px, 90vw)"
      align-center
    >
      <el-form
        ref="editFormRef"
        :model="editForm"
        :rules="editRules"
        label-width="100px"
      >
        <el-form-item
          label="直播名称"
          prop="title"
        >
          <el-input v-model="editForm.title" />
        </el-form-item>
        <el-form-item
          label="直播类型"
          prop="type"
        >
          <div class="live-type">
            <div
              class="type-option"
              :class="editForm.type === 0 ? 'checked' : ''"
              @click="editForm.type = 0"
            >
              小班教学
            </div>
            <div
              class="type-option"
              :class="editForm.type === 1 ? 'checked' : ''"
              @click="editForm.type = 1"
            >
              大班教学
            </div>
          </div>
        </el-form-item>
        <el-form-item
          label="开始时间"
          prop="startTime"
        >
          <el-date-picker
            v-model="editForm.startTime"
            type="datetime"
            format="YYYY-MM-DD HH:mm"
            placeholder="选择日期时间"
          />
        </el-form-item>
        <el-form-item
          label="直播时长"
          prop="duration"
        >
          <el-input-number
            v-model="editForm.duration"
            :min="10"
            :max="1000"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="editDialogVisible = false">取 消</el-button>
          <el-button
            type="primary"
            @click="submitEdit"
          >确认修改</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type DatePickerProps, type FormInstance, type FormRules } from 'element-plus';
import { formatDate } from '@yunyan-live/utils';
import SidebarMenu from '@/layouts/sidebar.vue';
import type { LiveRoom } from '@/types/pages/teacher/live';
import Live from '@/api/backstage';
import { useUserStore } from '@/store/user';
import { copyText } from '@/utils/webBridge';
import dayjs from 'dayjs';

interface LiveListResult {
  list: LiveRoom[];
  total: number;
}

const router = useRouter();
const userStore = useUserStore();

const activeKey = '2';
const params = ref({ pageNum: 1, pageSize: 10 });
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
const tableData = ref<LiveRoom[]>([]);
const total = ref(0);
const deleteDialogVisible = ref(false);
const roomDialogVisible = ref(false);
const shareDialogVisible = ref(false);
const transferDialogVisible = ref(false);
const transferCode = ref('');
const editDialogVisible = ref(false);
const editForm = ref<{
  roomId: string;
  title: string;
  type: number;
  startTime: string | Date;
  duration: number;
}>({
  roomId: '',
  title: '',
  type: 0,
  startTime: '',
  duration: 60
});
const deleteId = ref('');
const operateRoom = ref<LiveRoom>({
  title: '',
  speakerName: '',
  startTime: '',
  type: 0,
  joinCode: ''
});
const roomDetail = ref<LiveRoom>({
  title: '',
  speakerName: '',
  startTime: '',
  type: 0
});
const isHostRoom = ref(false);
const editFormRef = ref<FormInstance>();
const editRules = ref<FormRules>({
  title: [{ required: true, message: '请输入直播名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择直播类型', trigger: 'change' }],
  startTime: [{ required: true, message: '请选择开始时间', trigger: 'change' }],
  duration: [{ required: true, message: '请输入直播时长', trigger: 'blur' }]
});

function handleSizeChange(size: number) {
  params.value.pageSize = size;
  params.value.pageNum = 1;
  void getLiveList();
}

function handleCurrentChange(current: number) {
  params.value.pageNum = current;
  void getLiveList();
}

function resetFilters() {
  searchName.value = '';
  timerange.value = [];
  status.value = null;
  type.value = '';
  params.value.pageNum = 1;
  void getLiveList();
}

async function handleOptionChange(option: string, scoped: LiveRoom) {
  if (option === 'watchlist') {
    void router.push({
      path: '/teacher/mylive/watchlist',
      query: {
        roomId: scoped.roomId,
        name: scoped.title
      }
    });
  } else if (option === 'delete') {
    deleteId.value = scoped.roomId ?? '';
    deleteDialogVisible.value = true;
  } else if (option === 'gotoroom') {
    operateRoom.value = scoped;
    roomDialogVisible.value = true;
  } else if (option === 'share') {
    try {
      const res = await Live.room_detail(scoped.roomId ?? '');
      roomDetail.value = res.data.data as LiveRoom;
    } catch {
      roomDetail.value = scoped;
    }
    shareDialogVisible.value = true;
  } else if (option === 'transfer') {
    operateRoom.value = scoped;
    transferCode.value = '';
    transferDialogVisible.value = true;
  } else if (option === 'edit') {
    editForm.value = {
      roomId: scoped.roomId ?? '',
      title: scoped.title,
      type: scoped.type,
      startTime: scoped.startTime ? new Date(Number(scoped.startTime)) : '',
      duration: scoped.duration ?? 60
    };
    editDialogVisible.value = true;
  }
}

async function getLiveList() {
  let startTime = '';
  let endTime = '';
  const toTimestamp = (value?: string | Date) =>
    value === undefined ? '' : String(value instanceof Date ? value.getTime() : new Date(value).getTime());
  const range = timerange.value as Array<string | Date> | null;
  if (range && range.length > 0) {
    startTime = toTimestamp(range[0]);
    endTime = toTimestamp(range[1]);
  }
  try {
    const res = await Live.live_list({
      page: params.value.pageNum,
      pageSize: params.value.pageSize,
      startTime,
      endTime,
      status: status.value ? status.value : null,
      type: type.value === '' ? null : type.value,
      searchName: searchName.value
    });
    const data = res.data.data as LiveListResult;
    tableData.value = data.list;
    total.value = data.total;
  } catch (e) {
    console.error('[mylive] getLiveList error:', e);
  }
}

async function submitDelete() {
  deleteDialogVisible.value = false;
  try {
    const res = await Live.live_delete({ roomId: deleteId.value });
    ElMessage.success(res.data.msg ?? '删除成功');
    void getLiveList();
  } catch (e) {
    console.error(e);
  }
}

function dateFormatter(row: LiveRoom): string {
  return formatDate(Number(row.startTime));
}

function goToDetail(row: LiveRoom, _column: unknown, event: Event) {
  const target = event.target as HTMLElement;
  if (target.closest('.el-dropdown') || target.closest('.has-video') || target.closest('.no-row-click')) return;
  void router.push({
    path: '/teacher/createlive/detail',
    query: {
      roomId: row.roomId
    }
  });
}

function goLiveRoom(identity: number) {
  if (identity === 0) {
    isHostRoom.value = false;
  } else {
    isHostRoom.value = true;
  }
  const type = operateRoom.value.type === 0 ? 'small' : 'large';
  const role = identity === 1 ? 'teacher' : 'student';
  setTimeout(() => {
    void router.push({
      path: `/classroom/${type}${role}`,
      query: {
        roomId: operateRoom.value.roomId,
        code: operateRoom.value.joinCode,
        identity: role,
        nickName: userStore.userInfo.userName
      }
    });
  }, 500);
}

async function updateCode() {
  try {
    const res = await Live.update_code({
      roomId: roomDetail.value.roomId
    });
    const data = res.data.data as string;
    roomDetail.value.joinCode = data;
    ElMessage.success(res.data.msg ?? '更新成功');
  } catch (e) {
    console.error(e);
  }
}

function copyLink(content: string | undefined) {
  if (content) void copyText(content);
  ElMessage.success('复制成功');
}

async function submitTransfer() {
  try {
    const res = await Live.execute_transfer({
      roomId: operateRoom.value.roomId,
      transferCode: transferCode.value,
    });
    ElMessage.success(res.data.msg ?? '转移成功');
    transferDialogVisible.value = false;
    void getLiveList();
  } catch (e) {
    const msg = (e as { msg?: string })?.msg ?? '转移失败';
    ElMessage.error(msg);
  }
}

async function submitEdit() {
  const valid = await editFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  try {
    await Live.update_live({
      roomId: editForm.value.roomId,
      title: editForm.value.title,
      type: editForm.value.type,
      startTime: dayjs(editForm.value.startTime).valueOf().toString(),
      duration: editForm.value.duration
    });
    ElMessage.success('修改成功');
    editDialogVisible.value = false;
    void getLiveList();
  } catch (e) {
    const msg = (e as { msg?: string })?.msg ?? '修改失败';
    ElMessage.error(msg);
  }
}

function goplayback(row: LiveRoom) {
  void router.push({
    path: '/teacher/playback/detail',
    query: {
      roomId: row.roomId,
      name: row.title
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

.code {
  display: flex;
  align-items: center;
  .copy {
    font-size: 14px;
    margin-left: 4px;
    cursor: pointer;
  }
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

.el-table {
  margin-top: 17px;
  .has-video {
    cursor: pointer;
  }
}
.room-entrance {
  display: flex;
  flex-direction: column;
  img {
    margin-bottom: 20px;
  }

  > div {
    width: 302px;
    height: 92px;
    margin-bottom: 25px;
  }

  > div > div {
    height: 92px;
    cursor: pointer;

    p {
      margin: 0;
      padding-left: 16px;
    }

    > p:first-of-type {
      font-size: 16px;
      color: #2c2c34;
      padding-top: 25px;
    }
    > p:last-of-type {
      margin-top: 5px;
      font-size: 10px;
      color: #999999;
    }
  }
  .go-live-room {
    cursor: pointer;
  }
  .guest {
    background: url('~@/assets/imgs/backstage/audience.png') no-repeat;
  }
  .guest-chosen {
    background: url('~@/assets/imgs/backstage/audience-chosen.png') no-repeat;
    p:first-of-type {
      color: #286bff;
    }
    p:last-of-type {
      color: #2c2c34;
    }
  }

  .host {
    background: url('~@/assets/imgs/backstage/host.png') no-repeat;
  }
  .host-chosen {
    background: url('~@/assets/imgs/backstage/host-chosen.png') no-repeat;
    p:first-of-type {
      color: #286bff;
    }
    p:last-of-type {
      color: #2c2c34;
    }
  }
}

.transfer-form {
  .form-row {
    display: flex;
    align-items: center;
    margin-bottom: 16px;

    > label {
      flex-shrink: 0;
      font-size: @fs14;
      font-weight: bold;
      color: @color-2c2c34;
      width: 70px;
    }
  }
}

.live-type {
  display: flex;
  gap: 12px;
}

.type-option {
  padding: 8px 20px;
  border: 1px solid #dcdcdc;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: @color-1989fa;
  }

  &.checked {
    border-color: @color-1989fa;
    color: @color-1989fa;
    background: rgba(25, 137, 250, 0.05);
  }
}
</style>

<style lang="less">
@import '~@/assets/styles/pages/noscope.less';

.search-row1 .el-date-editor .el-range-separator {
  line-height: 32px;
}

.share-dialog {
  .el-dialog__body {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
  }
  .share-row {
    display: flex;
    align-items: center;
    justify-content: space-between;

    &:first-child {
      margin-bottom: 16px;
    }
  }
  .code {
    display: flex;
    align-items: center;
    gap: 8px;
    .copy {
      font-size: 14px;
      cursor: pointer;
    }
  }
  .copy-line {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    label {
      width: 93px;
      flex-shrink: 0;
    }
    .el-input {
      flex: 1;
      min-width: 0;
    }
  }
  .copy {
    cursor: pointer;
    color: #286bff;
    margin-left: 12px;
    flex-shrink: 0;
  }
}

.el-date-range-picker__time-header .el-input.el-input--small .el-input__inner {
  min-width: auto;
}
</style>
