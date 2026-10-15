<template>
  <div v-if="showPill" class="checkin-pill" @click="reopen">
    <el-icon :size="14"><Checked /></el-icon>
    <span>签到</span>
    <span v-if="session && !closed" class="checkin-pill-count">
      {{ session.signedCount }}/{{ attendeeLabel }}
    </span>
  </div>
  <el-dialog
    v-model="dialogVisible"
    title="课堂签到"
    width="min(360px, 90vw)"
    center
    :close-on-click-modal="false"
    class="checkin-dialog"
    @closed="onClosed"
  >
    <div class="checkin-body">
      <div v-if="loading && !session" class="checkin-tip">加载中…</div>
      <template v-else-if="error && !session">
        <div class="checkin-tip">加载失败</div>
        <el-button size="small" @click="onRetry">重试</el-button>
      </template>
      <template v-else-if="!session">
        <div class="checkin-tip">暂无进行中的签到</div>
      </template>
      <template v-else-if="!closed">
        <div class="checkin-desc">老师发起了签到，请在倒计时结束前完成签到</div>
        <div class="checkin-countdown">{{ remaining }}<span class="checkin-unit">秒</span></div>
        <div class="checkin-stat">
          已签 <b>{{ session.signedCount }}</b> 人 · 应到 <b>{{ attendeeLabel }}</b> 人
        </div>
        <div v-if="session.mySigned" class="checkin-ok">你已签到 ✓</div>
      </template>
      <template v-else-if="session.mySigned">
        <div class="checkin-ok">你已签到 ✓</div>
        <div v-if="session.myMethod === 2" class="checkin-tip">（补签）</div>
      </template>
      <template v-else>
        <div class="checkin-tip">签到已结束</div>
        <div v-if="session.makeupOpen" class="checkin-warn">老师开启了补签，可补签到</div>
        <div v-else class="checkin-tip">本轮不支持补签</div>
      </template>
    </div>
    <template #footer>
      <el-button @click="minimize">最小化</el-button>
      <el-button v-if="canRespond" type="primary" :loading="submitting" @click="onRespond(false)">
        我已到
      </el-button>
      <el-button v-if="canMakeup" type="primary" :loading="submitting" @click="onRespond(true)">
        补签
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useClassroomCheckin } from '@/composables/useClassroomCheckin';

const props = defineProps<{ roomId: string }>();

const {
  session,
  hasSession,
  isOwner,
  dialogVisible,
  minimized,
  loading,
  error,
  submitting,
  remaining,
  closed,
  attendeeLabel,
  hydrate,
  respond
} = useClassroomCheckin();

/** 入场水合（验收 #10）：进房即拉初态；进行中未签 → 自动弹窗，已开补签未签 → pill 兜底 */
onMounted(async () => {
  await hydrate(props.roomId);
  if (isOwner.value || !session.value) return;
  if (!closed.value && !session.value.mySigned) {
    dialogVisible.value = true;
    minimized.value = false;
  } else if (closed.value && !session.value.mySigned && session.value.makeupOpen) {
    minimized.value = true;
  }
});

const showPill = computed(
  () => minimized.value && hasSession.value && Boolean(session.value) && !session.value?.mySigned
);

const canRespond = computed(
  () => Boolean(session.value) && !closed.value && !session.value?.mySigned
);

const canMakeup = computed(
  () =>
    Boolean(session.value) &&
    closed.value &&
    !session.value?.mySigned &&
    Boolean(session.value?.makeupOpen)
);

function reopen(): void {
  minimized.value = false;
  dialogVisible.value = true;
}

async function onRetry(): Promise<void> {
  await hydrate(props.roomId);
}

/** 最小化 → 浮层 pill（不丢状态，可重开） */
function minimize(): void {
  dialogVisible.value = false;
}

/** 关闭动画结束：未签到 → 显示 pill（补签/重开兜底），已签到 → 什么都不做 */
function onClosed(): void {
  if (session.value && !session.value.mySigned) minimized.value = true;
}

async function onRespond(makeup: boolean): Promise<void> {
  try {
    await respond(props.roomId, makeup);
    ElMessage.success(makeup ? '补签成功' : '签到成功');
  } catch (err) {
    console.error(err);
    ElMessage.error(makeup ? '补签失败，请重试' : '签到失败，请重试');
  }
}
</script>

<style lang="less" scoped>
.checkin-pill {
  position: fixed;
  right: 24px;
  bottom: 88px;
  z-index: 3000;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  border-radius: 999px;
  background: #e0383e;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(224, 56, 62, 0.35);
}
.checkin-pill-count {
  opacity: 0.85;
}
.checkin-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}
.checkin-desc {
  font-size: 14px;
  color: #303133;
}
.checkin-countdown {
  font-size: 40px;
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
.checkin-ok {
  font-size: 15px;
  font-weight: 600;
  color: #67c23a;
}
.checkin-tip {
  font-size: 13px;
  color: #909399;
}
.checkin-warn {
  font-size: 13px;
  color: #e6a23c;
}
</style>
