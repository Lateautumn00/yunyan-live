<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';

defineOptions({ name: 'AdminDashboard' });

/**
 * 数据看板（批次 7c）
 * 当前 7a 阶段：静态占位卡片，7c 接入 gateway /admin/dashboard/stats 后动态填充。
 */
const loading = ref(false);
const stats = ref({
  totalUsers: 0,
  bannedUsers: 0,
  totalLiveRooms: 0,
  activeLiveRooms: 0,
  totalRecords: 0,
  todayNewUsers: 0
});

async function fetchStats() {
  loading.value = true;
  try {
    // 7c：接入 gateway /admin/dashboard/stats API
    // const res = await getDashboardStats();
    // stats.value = res;
  } catch (e: any) {
    ElMessage.error(e?.message || '加载统计数据失败');
  } finally {
    loading.value = false;
  }
}

function formatNum(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString();
}

onMounted(fetchStats);
</script>

<template>
  <div v-loading="loading" class="admin-dashboard">
    <el-alert
      title="数据看板（7c 待接入）"
      description="展示全平台核心运营指标。当前为占位卡片，API 接入后自动刷新。"
      type="warning"
      show-icon
      :closable="false"
      style="margin-bottom: 24px"
    />

    <el-row :gutter="16">
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="总用户数" :value="stats.totalUsers" :formatter="formatNum" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="今日新增用户" :value="stats.todayNewUsers" :formatter="formatNum" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="已封禁用户" :value="stats.bannedUsers" :formatter="formatNum" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="直播间总数" :value="stats.totalLiveRooms" :formatter="formatNum" />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="12">
        <el-card shadow="hover">
          <el-statistic title="进行中直播" :value="stats.activeLiveRooms" :formatter="formatNum" />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover">
          <el-statistic title="录像总数" :value="stats.totalRecords" :formatter="formatNum" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.admin-dashboard {
  padding: 16px;
}

.el-statistic {
  padding: 12px 0;
}
</style>
