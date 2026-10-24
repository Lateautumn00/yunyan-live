<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { listUsers, unbanUser, type UserItem } from '@/api/admin';

defineOptions({ name: 'AdminUserBanned' });

const loading = ref(false);
const tableData = ref<UserItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

async function fetchBanned() {
  loading.value = true;
  try {
    const res = await listUsers({
      page: page.value,
      pageSize: pageSize.value,
      status: 'banned'
    });
    if (res?.items) {
      tableData.value = res.items;
      total.value = res.total ?? 0;
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载已封禁用户失败');
  } finally {
    loading.value = false;
  }
}

async function handleUnban(user: UserItem) {
  await ElMessageBox.confirm(`确认解封用户「${user.username}」？`, '提示', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  });
  await unbanUser(user.id);
  ElMessage.success('已解除封禁');
  fetchBanned();
}

onMounted(fetchBanned);
</script>

<template>
  <div class="admin-user-banned">
    <el-alert
      title="以下用户已被封禁，无法登录系统（进行中直播不受影响）"
      type="info"
      show-icon
      :closable="false"
      style="margin-bottom: 16px"
    />

    <el-table v-loading="loading" :data="tableData" stripe border>
      <el-table-column prop="id" label="ID" width="280" show-overflow-tooltip />
      <el-table-column prop="username" label="用户名" min-width="120" />
      <el-table-column prop="email" label="邮箱" min-width="180" />
      <el-table-column prop="role" label="角色" width="80">
        <template #default="{ row }">
          <el-tag :type="row.role === 1 ? 'warning' : 'info'">
            {{ row.role === 1 ? '教师' : '学生' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="bannedAt" label="封禁时间" width="180" />
      <el-table-column prop="bannedBy" label="封禁操作者" width="160" />
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button size="small" type="success" @click="handleUnban(row as UserItem)">
            解封
          </el-button>
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
      @current-change="fetchBanned"
      @size-change="fetchBanned"
    />
  </div>
</template>

<style scoped>
.admin-user-banned {
  padding: 16px;
}
</style>
