import { $t } from '@/plugins/i18n';
const Layout = () => import('@/layout/index.vue');

/** 数据看板模块 */
export default {
  path: '/admin/dashboard',
  component: Layout,
  name: 'AdminDashboard',
  meta: {
    icon: 'ri:bar-chart-2-line',
    title: $t('menus.adminDashboard'),
    showLink: true
  },
  children: [
    {
      path: 'overview',
      name: 'AdminDashboardOverview',
      component: () => import('@/views/admin/dashboard/index.vue'),
      meta: {
        title: $t('menus.adminDashboard'),
        showLink: true
      }
    }
  ]
} satisfies RouteConfigsTable;
