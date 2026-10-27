<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { getDashboardStats, type DashboardStats } from '@/api/admin';

defineOptions({ name: 'AdminDashboard' });

/**
 * 数据看板（批次 7c）
 * 数据源：admin-service /admin/dashboard/stats → admin-service 直查共享库。
 * 口径：activeLiveRooms = status 2（直播中）且未软删；"今日" 以数据库本地日为准。
 */
const loading = ref(false);
const stats = ref<DashboardStats>({
  totalUsers: 0,
  bannedUsers: 0,
  totalLiveRooms: 0,
  activeLiveRooms: 0,
  totalRecords: 0,
  todayNewUsers: 0,
  totalCoursewares: 0,
  todayNewRooms: 0
});

async function fetchStats() {
  loading.value = true;
  try {
    stats.value = await getDashboardStats();
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
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="进行中直播" :value="stats.activeLiveRooms" :formatter="formatNum" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic
            title="今日新建直播间"
            :value="stats.todayNewRooms"
            :formatter="formatNum"
          />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="录像总数" :value="stats.totalRecords" :formatter="formatNum" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="课件总数" :value="stats.totalCoursewares" :formatter="formatNum" />
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
