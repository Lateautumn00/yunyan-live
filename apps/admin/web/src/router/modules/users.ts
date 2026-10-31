import { $t } from '@/plugins/i18n';

/** 用户管理模块（封禁 + 角色复核） */
export default {
  path: '/admin/users',
  name: 'AdminUserMgmt',
  redirect: '/admin/users/list',
  meta: {
    icon: 'ri:user-3-line',
    title: $t('menus.adminUserMgmt'),
    showLink: true,
    rank: 2
  },
  children: [
    {
      path: '/admin/users/list',
      name: 'AdminUserList',
      component: () => import('@/views/admin/users/index.vue'),
      meta: {
        title: $t('menus.adminUserList'),
        showLink: true
      }
    },
    {
      path: '/admin/users/banned',
      name: 'AdminUserBanned',
      component: () => import('@/views/admin/users/banned.vue'),
      meta: {
        title: $t('menus.adminUserBanned'),
        showLink: true
      }
    }
  ]
} satisfies RouteConfigsTable;
