import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import type { ElectronApi } from '@yunyan-live/ipc';
import { mountPage as mountSharedPage } from '@/testing/utils';
import Statistics from '@/pages/teacher/statistics/index.vue';

const statisticsMock = vi.hoisted(() => vi.fn());
const chartMock = vi.hoisted(() => ({
  setOption: vi.fn(),
  dispose: vi.fn(),
  resize: vi.fn()
}));
const chartInitMock = vi.hoisted(() => vi.fn(() => chartMock));

vi.mock('echarts/core', () => ({
  use: vi.fn(),
  init: chartInitMock
}));

vi.mock('@/api/backstage', () => ({
  default: {
    statistics: (p: unknown) => statisticsMock(p),
    track_tool_usage: vi.fn(() => Promise.resolve({}))
  }
}));

vi.mock('@/layouts/sidebar.vue', () => ({
  default: {
    name: 'SidebarMenuStub',
    template: '<nav class="sidebar-stub" />'
  }
}));

const OK_DATA = {
  totalViewers: 5,
  totalRooms: 2,
  totalSeconds: 7200,
  hasData: true,
  series: [
    { date: '2026-10-12', seconds: 3600, personTimes: 4, viewers: 3 },
    { date: '2026-10-13', seconds: 3600, personTimes: 6, viewers: 4 }
  ]
};

const EMPTY_DATA = {
  totalViewers: 0,
  totalSeconds: 0,
  totalRooms: 0,
  hasData: false,
  series: []
};

interface StatisticsVm {
  type: string;
}

function vm(wrapper: VueWrapper): StatisticsVm {
  return wrapper.vm as unknown as StatisticsVm;
}

async function mountPage() {
  const { wrapper } = await mountSharedPage(Statistics, {
    routes: [{ path: '/teacher/statistics', component: { template: '<div />' } }],
    initialRoute: '/teacher/statistics'
  });
  return wrapper;
}

beforeEach(() => {
  statisticsMock.mockReset().mockResolvedValue({ data: OK_DATA });
  chartMock.setOption.mockClear();
  chartInitMock.mockClear();
  Object.assign(window, {
    electronAPI: {
      onMessage: vi.fn(() => () => undefined)
    } as unknown as ElectronApi
  });
});

describe('直播概况 statistics/index.vue', () => {
  it('渲染概况与整体数据标题（三卡 + 地域待埋点占位）', async () => {
    const wrapper = await mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain('直播概况');
    expect(wrapper.text()).toContain('整体数据');
    expect(wrapper.text()).toContain('地域分布');
    expect(wrapper.text()).toContain('总观看人数');
    expect(wrapper.text()).toContain('直播场次');
    expect(wrapper.text()).toContain('总直播时长');
    expect(wrapper.text()).toContain('待埋点');
    expect(wrapper.text()).not.toContain('用户量');
  });

  it('切换统计维度', async () => {
    const wrapper = await mountPage();
    await flushPromises();
    expect(vm(wrapper).type).toBe('');
    vm(wrapper).type = '人次概括';
    await flushPromises();
    const active = wrapper.findAll('.el-radio-button.is-active');
    expect(active.length).toBe(1);
    expect(active[0]!.text()).toContain('人次概括');
  });

  it('有数据：卡片回填真实口径，时间范围缺省为近 7 天', async () => {
    const wrapper = await mountPage();
    await flushPromises();
    expect(statisticsMock).toHaveBeenCalledTimes(1);
    expect(statisticsMock).toHaveBeenCalledWith({
      startTime: expect.stringMatching(/^\d+$/),
      endTime: expect.stringMatching(/^\d+$/)
    });
    const values = wrapper.findAll('.card .value').map(n => n.text());
    expect(values).toEqual(['5', '2', '2小时0分钟']);
    expect(wrapper.text()).not.toContain('该时间范围暂无数据');
  });

  it('空态（has_data=false）：三卡显 — 非 0，不初始化图表', async () => {
    statisticsMock.mockResolvedValue({ data: EMPTY_DATA });
    const wrapper = await mountPage();
    await flushPromises();
    const values = wrapper.findAll('.card .value').map(n => n.text());
    expect(values).toEqual(['—', '—', '—']);
    expect(wrapper.text()).toContain('该时间范围暂无数据');
    expect(chartInitMock).not.toHaveBeenCalled();
  });

  it('图表按日序列渲染，人次概括切换重算口径', async () => {
    const wrapper = await mountPage();
    await flushPromises();
    expect(chartInitMock).toHaveBeenCalledTimes(1);
    expect(chartMock.setOption).toHaveBeenCalledTimes(1);
    const first = chartMock.setOption.mock.calls[0]![0] as {
      xAxis: { data: string[] };
      yAxis: { name: string };
      series: Array<{ data: number[] }>;
    };
    expect(first.xAxis.data).toEqual(['2026-10-12', '2026-10-13']);
    expect(first.yAxis.name).toBe('分钟');
    expect(first.series[0]!.data).toEqual([60, 60]);

    vm(wrapper).type = '人次概括';
    await flushPromises();
    const second = chartMock.setOption.mock.calls[1]![0] as {
      yAxis: { name: string };
      series: Array<{ data: number[] }>;
    };
    expect(second.yAxis.name).toBe('人次');
    expect(second.series[0]!.data).toEqual([4, 6]);
  });
});
