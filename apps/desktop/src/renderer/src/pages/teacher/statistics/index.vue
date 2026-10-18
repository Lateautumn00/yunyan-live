<template>
  <div>
    <sidebar-menu :active-key="activeKey" />
    <div class="backstage-center statistics">
      <h3>直播概况</h3>
      <div class="grid-container">
        <div class="card">
          <div class="label">总观看人数</div>
          <div class="value">{{ hasData ? totalViewers : '—' }}</div>
        </div>
        <div class="card">
          <div class="label">直播场次</div>
          <div class="value">{{ hasData ? totalRooms : '—' }}</div>
        </div>
        <div class="card">
          <div class="label">总直播时长</div>
          <div class="value">{{ hasData ? durationText : '—' }}</div>
        </div>
      </div>
      <h3>整体数据</h3>
      <div class="charts">
        <el-radio-group v-model="type">
          <el-radio-button value="分钟概括"> 分钟概括 </el-radio-button>
          <el-radio-button value="人次概括"> 人次概括 </el-radio-button>
          <el-date-picker
            v-model="timerange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            @change="fetchData"
          />
        </el-radio-group>
        <div v-if="hasData" ref="chartEl" class="chart" />
        <div v-else class="empty">该时间范围暂无数据</div>
      </div>
      <h3>地域分布</h3>
      <div class="area">
        <p class="pending">待埋点：无 IP 数据源（user_watch_times 无 IP 列），有数据前不做图表</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import dayjs from 'dayjs';
import SidebarMenu from '@/layouts/sidebar.vue';
import Live from '@/api/backstage';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

type DayPoint = { date: string; seconds: number; personTimes: number; viewers: number };

const activeKey = '5';
const type = ref('');
const timerange = ref<[Date, Date] | null>(null);

const totalViewers = ref(0);
const totalRooms = ref(0);
const totalSeconds = ref(0);
const hasData = ref(false);
const series = ref<DayPoint[]>([]);

const durationText = computed(() => {
  const s = totalSeconds.value;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}小时${m}分钟`;
  if (m > 0) return `${m}分钟`;
  return `${s}秒`;
});

const chartEl = ref<HTMLElement | null>(null);
let chart: ReturnType<typeof echarts.init> | null = null;

function renderChart() {
  if (!chartEl.value || !hasData.value) return;
  if (!chart) chart = echarts.init(chartEl.value);
  // 分钟概括 = 每日观看分钟；人次概括 = 每日进出人次（口径随卡片同源，见台账 GAP-F1）
  const useMinutes = type.value !== '人次概括';
  const values = series.value.map(p => (useMinutes ? Math.round(p.seconds / 60) : p.personTimes));
  chart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 56, right: 24, top: 36, bottom: 48 },
    xAxis: { type: 'category', data: series.value.map(p => p.date), boundaryGap: false },
    yAxis: { type: 'value', name: useMinutes ? '分钟' : '人次', minInterval: 1 },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'circle',
        areaStyle: { opacity: 0.12 },
        data: values
      }
    ]
  });
}

async function fetchData() {
  const [start, end] = timerange.value ?? [dayjs().subtract(7, 'day').toDate(), dayjs().toDate()];
  try {
    const res = await Live.statistics({
      startTime: String(new Date(start).getTime()),
      endTime: String(new Date(end).getTime())
    });
    const d = res.data ?? {};
    totalViewers.value = Number(d.totalViewers ?? 0);
    totalRooms.value = Number(d.totalRooms ?? 0);
    totalSeconds.value = Number(d.totalSeconds ?? 0);
    hasData.value = Boolean(d.hasData);
    series.value = (d.series ?? []) as DayPoint[];
    if (!hasData.value) {
      // 空态销毁 v-if 图表节点，须同步释放实例避免后续绑到已卸载 DOM
      chart?.dispose();
      chart = null;
    }
    // v-if 的 chartEl 要等 DOM 提交后才存在，否则 init 拿到 null 直接 return
    await nextTick();
    renderChart();
  } catch {
    // 失败提示由 http 拦截器统一 toast，此处保持现状不置空态
  }
}

watch(type, () => renderChart());

onMounted(() => {
  void fetchData();
});

onBeforeUnmount(() => {
  chart?.dispose();
  chart = null;
});
</script>

<style lang="less" scoped>
.statistics {
  background: #f8f8f8;
  box-shadow: none;
}
.grid-container {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: 1fr;
  gap: 20px 20px;
  grid-template-areas: '. . .';

  .card {
    min-width: 245px;
    height: 140px;
    background: #ffffff;
    box-shadow: 0px 2px 12px 0px rgba(0, 0, 0, 0.03);
    border-radius: 9px;
    padding: 24px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;

    .label {
      color: #909399;
      font-size: 14px;
    }

    .value {
      color: #303133;
      font-size: 30px;
      font-weight: 600;
    }
  }
}
.charts,
.area {
  min-width: 776px;
  min-height: 272px;
  background: #ffffff;
  box-shadow: 0px 2px 12px 0px rgba(0, 0, 0, 0.03);
  border-radius: 8px;
  padding: 16px 20px;
  box-sizing: border-box;
}
.chart {
  min-height: 240px;
}
.empty {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
}
.pending {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c0c4cc;
  font-size: 14px;
}
</style>
