import { $t } from '@/plugins/i18n';
const Layout = () => import('@/layout/index.vue');

/** 直播间全局管理模块 */
export default {
  path: '/admin/live',
  component: Layout,
  name: 'AdminLiveMgmt',
  meta: {
    icon: 'ri:live-line',
    title: $t('menus.adminLiveMgmt'),
    showLink: true
  },
  children: [
    {
      path: 'list',
      name: 'AdminLiveList',
      component: () => import('@/views/admin/live/index.vue'),
      meta: {
        title: $t('menus.adminLiveList'),
        showLink: true
      }
    }
  ]
} satisfies RouteConfigsTable;
