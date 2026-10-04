<template>
  <div class="room-actions">
    <el-dropdown
      v-if="isDropdown"
      @command="onCommand"
    >
      <span class="el-dropdown-link">
        <el-icon><MoreFilled /></el-icon>
      </span>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="item in menuItems"
            :key="item.command"
            :command="item.command"
          >
            {{ item.label }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <div
      v-else
      class="action-buttons"
    >
      <el-button
        type="primary"
        @click="roomDialogVisible = true"
      >
        进入房间
      </el-button>
      <el-button
        v-if="(room.status ?? 0) > 2"
        @click="nav.goplayback(room)"
      >
        回放
      </el-button>
      <el-dropdown @command="onCommand">
        <el-button>
          更多
          <el-icon class="el-icon--right">
            <MoreFilled />
          </el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="item in menuItems"
              :key="item.command"
              :command="item.command"
            >
              {{ item.label }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <el-dialog
      v-model="deleteDialogVisible"
      append-to-body
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
            :loading="deleting"
            @click="submitDelete"
          >确 定</el-button>
        </span>
      </template>
    </el-dialog>

    <el-dialog
      v-model="roomDialogVisible"
      append-to-body
      title="请选择进入直播间身份"
      width="min(480px, 90vw)"
    >
      <div class="room-entrance">
        <div
          class="go-live-room"
          @click="goLiveRoom(0)"
        >
          <div :class="isHostRoom ? 'guest' : 'guest-chosen'">
            <p>以听众身份进入</p>
            <p>我爱知识与自由</p>
          </div>
        </div>
        <div
          class="go-live-room"
          @click="goLiveRoom(1)"
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
      append-to-body
      title="分享"
      class="share-dialog"
      width="min(480px, 90vw)"
      align-center
    >
      <ShareLinks
        :room-id="room.roomId ?? ''"
        :join-code="room.joinCode"
      />
    </el-dialog>

    <el-dialog
      v-model="transferDialogVisible"
      append-to-body
      title="转移直播间"
      width="min(480px, 90vw)"
      align-center
    >
      <div class="transfer-form">
        <div class="form-row">
          <label>直播间：</label>
          <span>{{ room.title }}</span>
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
            :loading="transferring"
            @click="submitTransfer"
          >确 定</el-button>
        </span>
      </template>
    </el-dialog>

    <el-dialog
      v-model="editDialogVisible"
      append-to-body
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
            :loading="editing"
            @click="submitEdit"
          >确认修改</el-button>
        </span>
      </template>
    </el-dialog>

    <CoursewareUpload
      v-model="coursewareDialogVisible"
      :room-id="room.roomId ?? ''"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import dayjs from 'dayjs';
import Live from '@/api/backstage';
import ShareLinks from '@/components/teacher/ShareLinks.vue';
import CoursewareUpload from '@/components/teacher/CoursewareUpload.vue';
import { useRoomNavigation } from '@/composables/useRoomNavigation';
import { useAsyncAction } from '@/composables/useAsyncAction';
import type { LiveRoom } from '@/types/pages/teacher/live';
import { RoomStatus } from '@/constants/room';

const props = withDefaults(
  defineProps<{
    room: LiveRoom;
    variant?: 'dropdown' | 'buttons';
  }>(),
  { variant: 'dropdown' }
);

const emit = defineEmits<{
  updated: [];
  deleted: [];
  transferred: [];
  share: [];
}>();

const nav = useRoomNavigation();

const isDropdown = computed(() => props.variant === 'dropdown');

const menuItems = computed(() => {
  const items = [
    { command: 'gotoroom', label: '进入房间' },
    { command: 'share', label: '分享' },
    { command: 'watchlist', label: '时长列表' }
  ];
  // 上传课件仅 dropdown 变体（直播列表）提供；直播概况页用独立按钮入口
  if (isDropdown.value) {
    items.push({ command: 'upload', label: '上传课件' });
  }
  if (props.room.status === RoomStatus.NOT_STARTED) {
    items.push({ command: 'transfer', label: '转移' }, { command: 'edit', label: '编辑' });
  }
  items.push({ command: 'delete', label: '删除' });
  return items;
});

const roomDialogVisible = ref(false);
const deleteDialogVisible = ref(false);
const shareDialogVisible = ref(false);
const transferDialogVisible = ref(false);
const editDialogVisible = ref(false);
const coursewareDialogVisible = ref(false);
const transferCode = ref('');
const isHostRoom = ref(false);
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
const editFormRef = ref<FormInstance>();
const editRules = ref<FormRules>({
  title: [{ required: true, message: '请输入直播名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择直播类型', trigger: 'change' }],
  startTime: [{ required: true, message: '请选择开始时间', trigger: 'change' }],
  duration: [{ required: true, message: '请输入直播时长', trigger: 'blur' }]
});

function onCommand(command: string) {
  if (command === 'gotoroom') {
    roomDialogVisible.value = true;
  } else if (command === 'share') {
    if (isDropdown.value) {
      shareDialogVisible.value = true;
    } else {
      emit('share');
    }
  } else if (command === 'watchlist') {
    nav.gowatchlist(props.room);
  } else if (command === 'upload') {
    coursewareDialogVisible.value = true;
  } else if (command === 'transfer') {
    transferCode.value = '';
    transferDialogVisible.value = true;
  } else if (command === 'edit') {
    editForm.value = {
      roomId: props.room.roomId ?? '',
      title: props.room.title,
      type: props.room.type,
      startTime: props.room.startTime ? new Date(Number(props.room.startTime)) : '',
      duration: props.room.duration ?? 60
    };
    editDialogVisible.value = true;
  } else if (command === 'delete') {
    deleteDialogVisible.value = true;
  }
}

function goLiveRoom(identity: number) {
  isHostRoom.value = identity === 1;
  nav.goLiveRoom(props.room, identity);
}

const { loading: deleting, run: submitDelete } = useAsyncAction(
  async () => {
    deleteDialogVisible.value = false;
    const res = await Live.live_delete({ roomId: props.room.roomId });
    ElMessage.success(res.msg ?? '删除成功');
    emit('deleted');
  },
  { onError: (e) => console.error(e) }
);

const { loading: transferring, run: submitTransfer } = useAsyncAction(
  async () => {
    const res = await Live.execute_transfer({
      roomId: props.room.roomId,
      transferCode: transferCode.value
    });
    ElMessage.success(res.msg ?? '转移成功');
    transferDialogVisible.value = false;
    emit('transferred');
  },
  { fallbackMessage: '转移失败' }
);

const { loading: editing, run: submitEdit } = useAsyncAction(
  async () => {
    const valid = await editFormRef.value?.validate().catch(() => false);
    if (!valid) return;

    await Live.update_live({
      roomId: editForm.value.roomId,
      title: editForm.value.title,
      type: editForm.value.type,
      startTime: dayjs(editForm.value.startTime).valueOf().toString(),
      duration: editForm.value.duration
    });
    ElMessage.success('修改成功');
    editDialogVisible.value = false;
    emit('updated');
  },
  { fallbackMessage: '修改失败' }
);
</script>

<style lang="less" scoped>
@import '~@/assets/styles/common/mixin.less';

.room-actions {
  display: inline-flex;
  align-items: center;
}

.action-buttons {
  display: inline-flex;
  align-items: center;
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
.share-dialog {
  .el-dialog__body {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
  }
}
</style>
