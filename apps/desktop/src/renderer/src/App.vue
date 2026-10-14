<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useUserStore } from '@/store/user';
import { useUpdater } from '@/composables/useUpdater';

const userStore = useUserStore();
const {
  status,
  manual,
  latestVersion,
  currentVersion,
  progress,
  errorMessage,
  bindUpdateEvents,
  loadCurrentVersion,
  check,
  download,
  install
} = useUpdater();

const dismissed = ref(false);
const timeOut = ref<number | null>(null);

// 弹窗只展示「可操作节点」：发现新版本 / 下载中 / 下载完成。
// manual=true（设置页手动检查触发）时由设置页承载交互，不重复弹窗。
const dialogVisible = computed({
  get: () =>
    !manual.value &&
    !dismissed.value &&
    (status.value === 'available' ||
      status.value === 'downloading' ||
      status.value === 'downloaded'),
  set: value => {
    if (!value) dismissed.value = true;
  }
});

watch(status, (next, prev) => {
  if (next === 'downloaded') {
    // 下载完成后强制重新提示（即使用户下载途中关闭过弹窗）
    dismissed.value = false;
  }
  // 后台流程（自动检查/确认后的下载）失败时 toast；手动检查的失败由设置页内联展示
  if (next === 'error' && prev !== 'error' && !manual.value) {
    ElMessage.error(errorMessage.value || '更新失败');
  }
});

const dialogTitle = computed(() => {
  if (status.value === 'downloaded') return '新版本已就绪';
  if (status.value === 'downloading') return '正在下载更新，请稍候 ···';
  return '发现新版本';
});

onMounted(() => {
  bindUpdateEvents();
  void loadCurrentVersion();
  timeOut.value = window.setTimeout(() => {
    check(false);
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
      :title="dialogTitle"
      width="60%"
      :close-on-click-modal="false"
      :close-on-press-escape="status !== 'downloading'"
      align-center
      @close="dismissed = true"
    >
      <template v-if="status === 'available'">
        <p class="update-hint">
          发现新版本
          <strong>v{{ latestVersion }}</strong>
          （当前版本 v{{ currentVersion || '—' }}），是否立即更新？
        </p>
      </template>
      <div v-else-if="status === 'downloading'" class="percentages">
        <el-progress
          status="success"
          :text-inside="true"
          :stroke-width="20"
          :percentage="progress"
          :width="200"
          :show-text="true"
        />
      </div>
      <template v-else-if="status === 'downloaded'">
        <p class="update-hint">
          新版本 <strong>v{{ latestVersion }}</strong> 已下载完成，重启应用后完成安装。
        </p>
      </template>
      <template #footer>
        <template v-if="status === 'available'">
          <el-button @click="dismissed = true">稍后</el-button>
          <el-button type="primary" @click="download()">立即更新</el-button>
        </template>
        <el-button v-else-if="status === 'downloaded'" type="primary" @click="install()">
          立即重启安装
        </el-button>
      </template>
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
.update-hint {
  margin: 4px 0;
  line-height: 1.8;
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
