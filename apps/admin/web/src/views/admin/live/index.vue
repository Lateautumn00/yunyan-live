<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';

defineOptions({ name: 'AdminLiveList' });

/**
 * 直播间全局管理（批次 7c）
 * 当前 7a 阶段：占位页面，API 端点 /admin/live/list 随 7c 一起加入 gateway。
 * 届时此处接入 `listLiveRooms()` 替换演示数据。
 */
const loading = ref(false);
const tableData = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const statusFilter = ref<number | undefined>();
const keyword = ref('');

async function fetchLiveRooms() {
  loading.value = true;
  try {
    // 7c：接入 gateway /admin/live/list API
    // const res = await listLiveRooms({ page, pageSize, status: statusFilter.value, keyword });
    // tableData.value = res.list;
    // total.value = res.total;
    tableData.value = [];
    total.value = 0;
  } catch (e: any) {
    ElMessage.error(e?.message || '加载直播间列表失败');
  } finally {
    loading.value = false;
  }
}

onMounted(fetchLiveRooms);
</script>

<template>
  <div class="admin-live-list">
    <el-alert
      title="直播间全局管理（7c 待接入）"
      description="此模块将展示全平台直播间列表，支持搜索、状态筛选与删除操作。当前为占位页面，API 接入后自动填充数据。"
      type="warning"
      show-icon
      :closable="false"
      style="margin-bottom: 16px"
    />

    <div class="search-bar">
      <el-input
        v-model="keyword"
        placeholder="搜索房间名 / 主讲人"
        clearable
        style="width: 240px"
      />
      <el-select v-model="statusFilter" placeholder="状态" clearable style="width: 120px">
        <el-option label="全部" :value="undefined" />
        <el-option label="进行中" :value="1" />
        <el-option label="已结束" :value="2" />
      </el-select>
      <el-button type="primary" @click="fetchLiveRooms"> 搜索 </el-button>
    </div>

    <el-table v-loading="loading" :data="tableData" stripe border>
      <el-table-column prop="roomId" label="房间 ID" width="280" show-overflow-tooltip />
      <el-table-column prop="title" label="房间名称" min-width="160" />
      <el-table-column prop="speakerName" label="主讲人" min-width="120" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'">
            {{ row.status === 1 ? '进行中' : '已结束' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="startTime" label="开始时间" width="180" />
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button size="small" type="danger" disabled> 删除 </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      style="margin-top: 16px; justify-content: flex-end"
      @current-change="fetchLiveRooms"
      @size-change="fetchLiveRooms"
    />
  </div>
</template>

<style scoped>
.admin-live-list {
  padding: 16px;
}

.search-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
</style>
