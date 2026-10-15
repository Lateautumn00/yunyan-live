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
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useClassroomCheckin } from '@/composables/useClassroomCheckin';

const props = defineProps<{ roomId: string }>();

const {
  session,
  loading,
  submitting,
  duration,
  remaining,
  closed,
  attendeeLabel,
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
</style>
