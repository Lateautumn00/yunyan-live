import { $t } from '@/plugins/i18n';

/** 数据看板模块 */
export default {
  path: '/admin/dashboard',
  name: 'AdminDashboard',
  redirect: '/admin/dashboard/overview',
  meta: {
    icon: 'ri:bar-chart-2-line',
    title: $t('menus.adminDashboard'),
    showLink: true,
    rank: 1
  },
  children: [
    {
      path: '/admin/dashboard/overview',
      name: 'AdminDashboardOverview',
      component: () => import('@/views/admin/dashboard/index.vue'),
      meta: {
        title: $t('menus.adminDashboard'),
        showLink: true
      }
    }
  ]
} satisfies RouteConfigsTable;
