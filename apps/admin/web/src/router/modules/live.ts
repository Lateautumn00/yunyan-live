import { $t } from '@/plugins/i18n';

/** 直播间全局管理模块 */
export default {
  path: '/admin/live',
  name: 'AdminLiveMgmt',
  redirect: '/admin/live/list',
  meta: {
    icon: 'ri:live-line',
    title: $t('menus.adminLiveMgmt'),
    showLink: true,
    rank: 3
  },
  children: [
    {
      path: '/admin/live/list',
      name: 'AdminLiveList',
      component: () => import('@/views/admin/live/index.vue'),
      meta: {
        title: $t('menus.adminLiveList'),
        showLink: true
      }
    }
  ]
} satisfies RouteConfigsTable;
