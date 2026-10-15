<template>
  <div>
    <sidebar-menu :active-key="activeKey" />
    <div class="backstage-center my-live">
      <el-breadcrumb separator-icon="ArrowRight">
        <el-breadcrumb-item :to="{ path: '/teacher/mylive' }">
          <el-icon><ArrowLeft /></el-icon>
          {{ roomTitle }}
        </el-breadcrumb-item>
      </el-breadcrumb>

      <div style="overflow-x: auto">
        <el-table v-loading="loading" :data="tableData" style="width: 100%" border stripe>
          <el-table-column type="expand">
            <template #default="scope">
              <div class="checkin-detail">
                <el-table :data="detailRows(scope.row.sessionId)" size="small" border>
                  <el-table-column prop="nickName" label="昵称" min-width="160" />
                  <el-table-column label="名单" min-width="90">
                    <template #default="record">
                      {{ record.row.inDenominator ? '应到' : '名单外' }}
                    </template>
                  </el-table-column>
                  <el-table-column label="签到状态" min-width="110">
                    <template #default="record">
                      <span
                        :class="{
                          'outside-sign': !record.row.inDenominator && record.row.signed
                        }"
                      >
                        {{ statusText(record.row as CheckinRecordItem) }}
                      </span>
                    </template>
                  </el-table-column>
                  <el-table-column label="方式" min-width="90">
                    <template #default="record">
                      {{ record.row.method === 2 ? '补签' : '正常' }}
                    </template>
                  </el-table-column>
                  <el-table-column label="签到时间" min-width="170">
                    <template #default="record">
                      {{ formatTime(record.row.respondedAt) }}
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="发起时间" min-width="170">
            <template #default="scope">
              {{ formatTime(scope.row.startedAt) }}
            </template>
          </el-table-column>
          <el-table-column label="状态" min-width="90">
            <template #default="scope">
              {{ scope.row.endedAt ? '已结束' : '进行中' }}
            </template>
          </el-table-column>
          <el-table-column prop="attendeeCount" label="应到" min-width="80" />
          <el-table-column prop="signedCount" label="已签" min-width="80" />
          <el-table-column label="出勤率" min-width="90">
            <template #default="scope">
              {{ rateText(scope.row as CheckinSession) }}
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div v-show="total !== 0" class="tc-page">
        <el-pagination
          background
          :current-page="params.pageNum"
          :page-size="params.pageSize"
          layout="prev, pager, next, jumper"
          :total="total"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import SidebarMenu from '@/layouts/sidebar.vue';
import api from '@/api';
import { usePagedList } from '@/composables/usePagedList';

interface CheckinSession {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  attendeeCount: number;
  signedCount: number;
}

interface CheckinRecordItem {
  userId: string;
  nickName: string;
  inDenominator: boolean;
  signed: boolean;
  method: number;
  respondedAt: string;
}

interface SessionDetail {
  rows: CheckinRecordItem[];
  attendedCount: number | null;
}

const route = useRoute();

const activeKey = '2';
const roomTitle = ref('');
const details = ref<Record<string, SessionDetail>>({});

const {
  params,
  list: tableData,
  total,
  loading,
  load: loadSessions,
  handleSizeChange,
  handleCurrentChange
} = usePagedList<CheckinSession>({
  pageSize: 6,
  fetchPage: async query => {
    const res = await api.checkin_sessions({
      roomId: route.query.roomId as string,
      page: query.pageNum,
      pageSize: query.pageSize
    });
    const data = res.data as { items: CheckinSession[]; total: number };
    await Promise.all(
      data.items.map(async session => {
        try {
          const rec = await api.checkin_records(session.sessionId);
          const recData = rec.data as { items: CheckinRecordItem[]; attendedCount: number };
          details.value[session.sessionId] = {
            rows: recData.items,
            attendedCount: recData.attendedCount
          };
        } catch {
          details.value[session.sessionId] = { rows: [], attendedCount: null };
        }
      })
    );
    return { list: data.items, total: data.total };
  }
});

function detailRows(sessionId: string): CheckinRecordItem[] {
  return details.value[sessionId]?.rows ?? [];
}

function rateText(session: CheckinSession): string {
  if (session.attendeeCount === 0) return '—';
  const attended = details.value[session.sessionId]?.attendedCount;
  if (attended === null || attended === undefined) return '-';
  return `${Math.round((attended / session.attendeeCount) * 100)}%`;
}

function statusText(row: CheckinRecordItem): string {
  if (!row.signed) return '未签';
  if (!row.inDenominator) return '名单外签到';
  return row.method === 2 ? '补签' : '已签';
}

function formatTime(ts: string): string {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', { hour12: false });
}

onMounted(() => {
  roomTitle.value = (route.query.name as string) ?? '';
  void loadSessions();
});
</script>

<style lang="less" scoped>
@import '~@/assets/styles/common/mixin.less';

.my-live {
  background: #f8f8f8;
  box-shadow: none;
}
.el-icon-arrow-left {
  cursor: pointer;
}
.el-table {
  margin-top: 17px;
}
.checkin-detail {
  padding: 8px 48px;
  .el-table {
    margin-top: 0;
  }
}
.outside-sign {
  color: #e6a23c;
}
</style>
