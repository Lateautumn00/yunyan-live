<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';

defineOptions({ name: 'AdminAuditLogs' });

/**
 * 审计日志查看（批次 7c）
 * 当前 7a 阶段：占位页面，7c 接入 gateway /admin/audit/logs 后动态填充。
 */
const loading = ref(false);
const tableData = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(50);
const actionFilter = ref('');
const actorFilter = ref('');

/** 12 + 7 = 19 类审计动作（S12 原 12 类 + 批次 7 新增 7 类） */
const actionOptions = [
  { label: '全部', value: '' },
  // 批次 7 新增
  { label: '管理员登录成功', value: 'admin.login.ok' },
  { label: '管理员登录失败', value: 'admin.login.failed' },
  { label: '封禁用户', value: 'admin.ban_user' },
  { label: '解封用户', value: 'admin.unban_user' },
  { label: '角色变更', value: 'admin.role_change' },
  { label: '创建管理员', value: 'admin.admin_create' },
  { label: '管理员状态变更', value: 'admin.status_change' },
  // 原有 S12
  { label: '用户登录成功', value: 'auth.login.ok' },
  { label: '用户登录失败', value: 'auth.login.failed' },
  { label: '会话踢出', value: 'session.kick' },
  { label: '修改密码', value: 'user.change_password' },
  { label: '重置密码', value: 'user.reset_password' },
  { label: '删除直播', value: 'live.delete' },
  { label: '删除录像（按房间）', value: 'video.delete_rooms' },
  { label: '删除录像（按 ID）', value: 'video.delete_ids' },
  { label: '删除课件', value: 'courseware.delete' },
  { label: '导出录像', value: 'recording.export' },
  { label: '禁言', value: 'moderation.mute' },
  { label: '踢出房间', value: 'moderation.kick' },
  { label: '解除禁言', value: 'moderation.release' },
  { label: '消息撤回', value: 'message.recall' }
];

async function fetchLogs() {
  loading.value = true;
  try {
    // 7c：接入 gateway /admin/audit/logs API
    // const res = await listAuditLogs({ page, pageSize, action: actionFilter.value, actor: actorFilter.value });
    // tableData.value = res.items;
    // total.value = res.total;
    tableData.value = [];
    total.value = 0;
  } catch (e: any) {
    ElMessage.error(e?.message || '加载审计日志失败');
  } finally {
    loading.value = false;
  }
}

function formatTime(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-CN');
}

onMounted(fetchLogs);
</script>

<template>
  <div class="admin-audit-logs">
    <el-alert
      title="审计日志（7c 待接入）"
      description="只读展示所有审计事件，支持按动作类型和操作者过滤。数据源为 audit_logs 分区表，追加即不可变。"
      type="info"
      show-icon
      :closable="false"
      style="margin-bottom: 16px"
    />

    <!-- 搜索栏 -->
    <div class="search-bar">
      <el-select v-model="actionFilter" placeholder="审计动作" clearable style="width: 200px">
        <el-option
          v-for="opt in actionOptions"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
      <el-input
        v-model="actorFilter"
        placeholder="操作者（guid / username）"
        clearable
        style="width: 220px"
        @keyup.enter="fetchLogs"
      />
      <el-button type="primary" @click="fetchLogs"> 查询 </el-button>
    </div>

    <!-- 日志表格 -->
    <el-table v-loading="loading" :data="tableData" stripe border size="small">
      <el-table-column prop="occurredAt" label="时间" width="180">
        <template #default="{ row }">
          {{ formatTime(row.occurredAt) }}
        </template>
      </el-table-column>
      <el-table-column prop="actor" label="操作者" width="200" show-overflow-tooltip />
      <el-table-column prop="action" label="动作" width="160">
        <template #default="{ row }">
          <el-tag size="small" type="info">
            {{ row.action }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="targetType" label="对象类型" width="100" />
      <el-table-column prop="targetId" label="对象 ID" width="200" show-overflow-tooltip />
      <el-table-column prop="ip" label="IP" width="140" />
      <el-table-column prop="requestId" label="Request ID" width="200" show-overflow-tooltip />
      <el-table-column label="详情" min-width="200">
        <template #default="{ row }">
          <span v-if="row.detail" class="detail">{{ JSON.stringify(row.detail) }}</span>
          <span v-else>—</span>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[50, 100, 200]"
      layout="total, sizes, prev, pager, next, jumper"
      style="margin-top: 16px; justify-content: flex-end"
      @current-change="fetchLogs"
      @size-change="fetchLogs"
    />
  </div>
</template>

<style scoped>
.admin-audit-logs {
  padding: 16px;
}

.search-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.detail {
  font-family: monospace;
  font-size: 12px;
  color: #666;
}
</style>
