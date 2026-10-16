<template>
  <div class="checkin-panel">
    <div v-if="loading" class="checkin-state">加载中…</div>
    <template v-else>
      <div v-if="session && !closed" class="checkin-block">
        <div class="checkin-title">签到进行中</div>
        <div class="checkin-countdown">{{ remaining }}<span class="checkin-unit">秒</span></div>
        <div class="checkin-stat">
          已签 <b>{{ session.signedCount }}</b> 人 · 应到 <b>{{ attendeeLabel }}</b> 人
        </div>
        <el-button class="checkin-action" type="danger" plain :loading="submitting" @click="onEnd">
          结束本轮
        </el-button>
      </div>
      <div v-else-if="session" class="checkin-block">
        <div class="checkin-title">本轮已结束</div>
        <div class="checkin-stat">
          已签 <b>{{ session.signedCount }}</b> 人 · 应到 <b>{{ attendeeLabel }}</b> 人
        </div>
        <el-checkbox
          class="checkin-makeup"
          :model-value="session.makeupOpen"
          :disabled="submitting"
          @change="onOpenMakeup"
        >
          开启补签（迟到学生可补签）
        </el-checkbox>
        <el-divider class="checkin-divider" />
        <el-radio-group v-model="duration" size="small">
          <el-radio-button :value="30">30秒</el-radio-button>
          <el-radio-button :value="60">60秒</el-radio-button>
          <el-radio-button :value="120">120秒</el-radio-button>
        </el-radio-group>
        <el-button class="checkin-action" type="primary" :loading="submitting" @click="onStart">
          发起新一轮
        </el-button>
      </div>
      <div v-else class="checkin-block">
        <div class="checkin-title">发起签到</div>
        <el-radio-group v-model="duration" size="small">
          <el-radio-button :value="30">30秒</el-radio-button>
          <el-radio-button :value="60">60秒</el-radio-button>
          <el-radio-button :value="120">120秒</el-radio-button>
        </el-radio-group>
        <el-button class="checkin-action" type="primary" :loading="submitting" @click="onStart">
          发起签到
        </el-button>
      </div>
      <div v-if="session" class="checkin-roster">
        <div class="roster-title">签到名单</div>
        <div v-if="recordsLoading && records.length === 0" class="roster-empty">加载中…</div>
        <div v-else-if="records.length === 0" class="roster-empty">暂无签到记录</div>
        <div v-else class="roster-list">
          <div v-for="row in records" :key="row.userId" class="roster-row">
            <span class="roster-status" :class="statusClass(row)">{{ statusText(row) }}</span>
            <span class="roster-name" :title="row.nickName">{{ row.nickName }}</span>
            <span v-if="!row.inDenominator" class="roster-tag">名单外</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useClassroomCheckin, type CheckinRecordItem } from '@/composables/useClassroomCheckin';

const props = defineProps<{ roomId: string }>();

const {
  session,
  loading,
  submitting,
  duration,
  remaining,
  closed,
  attendeeLabel,
  records,
  recordsLoading,
  hydrate,
  start,
  end,
  openMakeup
} = useClassroomCheckin();

/** 面板即开即水合：挂载时机 = 教师点开签到面板（v-if 由 Top.vue 控制） */
onMounted(() => {
  void hydrate(props.roomId);
});

const makeupChecked = computed(() => Boolean(session.value?.makeupOpen));

function statusText(row: CheckinRecordItem): string {
  if (!row.signed) return '未签';
  if (row.method === 2) return '补签';
  return '已签';
}

function statusClass(row: CheckinRecordItem): string {
  if (!row.signed) return 'is-pending';
  return row.method === 2 ? 'is-makeup' : 'is-signed';
}

async function onStart(): Promise<void> {
  try {
    await start(props.roomId, duration.value);
    ElMessage.success('签到已发起');
  } catch (err) {
    console.error(err);
    ElMessage.error('发起签到失败');
  }
}

async function onEnd(): Promise<void> {
  try {
    await end(props.roomId);
    ElMessage.success('本轮已结束');
  } catch (err) {
    console.error(err);
    ElMessage.error('结束签到失败');
  }
}

async function onOpenMakeup(): Promise<void> {
  if (makeupChecked.value) return;
  try {
    await openMakeup(props.roomId);
    ElMessage.success('补签已开启');
  } catch (err) {
    console.error(err);
    ElMessage.error('开启补签失败');
  }
}
</script>

<style lang="less" scoped>
.checkin-panel {
  width: 100%;
  color: #303133;
}
.checkin-state {
  padding: 12px 0;
  text-align: center;
  color: #909399;
}
.checkin-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.checkin-title {
  font-size: 15px;
  font-weight: 600;
}
.checkin-countdown {
  font-size: 32px;
  font-weight: 700;
  color: #e0383e;
  line-height: 1;
}
.checkin-unit {
  margin-left: 4px;
  font-size: 13px;
  font-weight: 400;
  color: #909399;
}
.checkin-stat {
  font-size: 13px;
  color: #606266;
  b {
    color: #303133;
  }
}
.checkin-makeup {
  align-self: flex-start;
}
.checkin-divider {
  margin: 2px 0;
}
.checkin-duration {
  display: flex;
  gap: 8px;
}
.checkin-action {
  align-self: stretch;
}
.checkin-roster {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.roster-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}
.roster-empty {
  font-size: 12px;
  color: #909399;
  text-align: center;
  padding: 8px 0;
}
.roster-list {
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid #ebeef5;
  border-radius: 4px;
}
.roster-row {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  font-size: 12px;
  border-bottom: 1px solid #f5f7fa;
  &:last-child {
    border-bottom: none;
  }
}
.roster-status {
  flex: none;
  width: 3em;
  &.is-signed {
    color: #67c23a;
  }
  &.is-pending {
    color: #909399;
  }
  &.is-makeup {
    color: #e6a23c;
  }
}
.roster-name {
  flex: 1;
  min-width: 0;
  margin-left: 8px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.roster-tag {
  flex: none;
  margin-left: 6px;
  font-size: 11px;
  color: #e6a23c;
  border: 1px solid #e6a23c;
  border-radius: 2px;
  padding: 0 4px;
  line-height: 16px;
}
</style>
