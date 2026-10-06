<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useUserStore } from '@/store/user';

interface UpdatePayload {
  type: string;
  message?: unknown;
}

const userStore = useUserStore();

const dialogVisible = ref(false);
const closeOnClickModal = false;
const closeOnPressEscape = false;
const showClose = false;
const percentage = ref(0);
const strokeWidth = 200;
const timeOut = ref<number | null>(null);

onMounted(() => {
  window.electronAPI?.onMessage(payload => {
    const { type, message } = payload as unknown as UpdatePayload;
    if (type === 'update-available') {
      dialogVisible.value = true;
    } else if (type === 'download-progress') {
      percentage.value = Math.round(Number(message ?? 0));
    } else if (type === 'error') {
      dialogVisible.value = false;
      ElMessage.error(typeof message === 'string' ? message : '更新失败');
    } else if (type === 'update-not-available') {
      // 无需提示
    }
  });
  timeOut.value = window.setTimeout(() => {
    window.electronAPI?.checkForUpdate();
  }, 500);
  if (!userStore.token && !userStore.guid) {
    void userStore.user_msg();
  }
});

onUnmounted(() => {
  if (timeOut.value !== null) {
    clearTimeout(timeOut.value);
  }
});
</script>

<template>
  <div id="app">
    <router-view />
    <el-dialog
      v-model="dialogVisible"
      title="正在更新版本,请稍后 ···"
      width="60%"
      :close-on-click-modal="closeOnClickModal"
      :close-on-press-escape="closeOnPressEscape"
      :show-close="showClose"
      align-center
    >
      <div class="percentages">
        <el-progress
          status="success"
          :text-inside="true"
          :stroke-width="20"
          :percentage="percentage"
          :width="strokeWidth"
          :show-text="true"
        />
      </div>
    </el-dialog>
  </div>
</template>

<style lang="less">
#app {
  background: #f8f8f8;
}
.percentages {
  width: 100%;
  height: 5vh;
  line-height: 5vh;
  text-align: center;
}
body {
  margin: 0px;
}

.el-tooltip {
  display: flex;
  align-items: center;
}
</style>
<style lang="less" scoped>
.tableList {
  widows: 150px;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.el-tooltip__popper {
  font-size: 14px;
  max-width: 300px !important;
  text-align: justify;
  text-justify: newspaper;
  word-break: break-all;
  line-height: 20px;
}
</style>
