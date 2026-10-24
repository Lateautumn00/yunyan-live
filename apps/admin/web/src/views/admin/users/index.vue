<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { listUsers, banUser, unbanUser, setUserRole, type UserItem } from '@/api/admin';
import { useUserStoreHook } from '@/store/modules/user';

defineOptions({ name: 'AdminUserList' });

const userStore = useUserStoreHook();
const isSuperAdmin = computed(() => userStore.roles.includes('admin'));

const loading = ref(false);
const tableData = ref<UserItem[]>([]);
const total = ref(0);
const keyword = ref('');
const roleFilter = ref<number | undefined>();
const statusFilter = ref<string>('');
const page = ref(1);
const pageSize = ref(20);

async function fetchUsers() {
  loading.value = true;
  try {
    const res = await listUsers({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value,
      role: roleFilter.value,
      status: statusFilter.value || undefined
    });
    if (res && res.items) {
      tableData.value = res.items;
      total.value = res.total ?? 0;
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载用户列表失败');
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  page.value = 1;
  fetchUsers();
}

function handlePageChange() {
  fetchUsers();
}

async function handleBan(user: UserItem) {
  try {
    const { value: reason } = await ElMessageBox.prompt('封禁原因（可选）', '封禁用户', {
      confirmButtonText: '确认封禁',
      cancelButtonText: '取消',
      inputPlaceholder: '违规、骚扰等'
    });
    await banUser(user.id, reason);
    ElMessage.success('封禁成功');
    fetchUsers();
  } catch {
    // 用户取消
  }
}

async function handleUnban(user: UserItem) {
  await ElMessageBox.confirm('确认解除该用户的封禁？', '提示', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  });
  await unbanUser(user.id);
  ElMessage.success('已解除封禁');
  fetchUsers();
}

async function handleRoleChange(user: UserItem, role: number) {
  await setUserRole(user.id, role);
  ElMessage.success('角色已更新');
  fetchUsers();
}

function roleLabel(role: number) {
  return role === 1 ? '教师' : '学生';
}

function roleColor(role: number) {
  return role === 1 ? 'warning' : 'info';
}

onMounted(fetchUsers);
</script>

<template>
  <div class="admin-user-list">
    <!-- 搜索栏 -->
    <div class="search-bar">
      <el-input
        v-model="keyword"
        placeholder="搜索用户名 / 邮箱"
        clearable
        style="width: 240px"
        @keyup.enter="handleSearch"
      />
      <el-select v-model="roleFilter" placeholder="角色" clearable style="width: 120px">
        <el-option label="教师" :value="1" />
        <el-option label="学生" :value="2" />
      </el-select>
      <el-select v-model="statusFilter" placeholder="状态" clearable style="width: 120px">
        <el-option label="正常" value="active" />
        <el-option label="已封禁" value="banned" />
      </el-select>
      <el-button type="primary" @click="handleSearch"> 搜索 </el-button>
      <el-button @click="fetchUsers"> 刷新 </el-button>
    </div>

    <!-- 用户表格 -->
    <el-table v-loading="loading" :data="tableData" stripe border>
      <el-table-column prop="id" label="ID" width="280" show-overflow-tooltip />
      <el-table-column prop="username" label="用户名" min-width="120" />
      <el-table-column prop="email" label="邮箱" min-width="180" />
      <el-table-column label="角色" width="100">
        <template #default="{ row }">
          <el-tag :type="roleColor(row.role)">
            {{ roleLabel(row.role) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'banned' ? 'danger' : 'success'">
            {{ row.status === 'banned' ? '已封禁' : '正常' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="注册时间" width="180" />
      <el-table-column v-if="isSuperAdmin" label="操作" width="200">
        <template #default="{ row }">
          <template v-if="row.status !== 'banned'">
            <el-button size="small" type="danger" @click="handleBan(row as UserItem)">
              封禁
            </el-button>
          </template>
          <template v-else>
            <el-button size="small" type="success" @click="handleUnban(row as UserItem)">
              解封
            </el-button>
          </template>
          <el-dropdown @command="(cmd: unknown) => handleRoleChange(row as UserItem, Number(cmd))">
            <el-button size="small" type="primary">
              切换角色<el-icon class="el-icon--right">
                <arrow-down />
              </el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item :command="1"> 教师 </el-dropdown-item>
                <el-dropdown-item :command="2"> 学生 </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      style="margin-top: 16px; justify-content: flex-end"
      @current-change="handlePageChange"
      @size-change="handlePageChange"
    />
  </div>
</template>

<style scoped>
.admin-user-list {
  padding: 16px;
}

.search-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
</style>
