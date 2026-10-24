import { $t } from '@/plugins/i18n';
const Layout = () => import('@/layout/index.vue');

/** 用户管理模块（封禁 + 角色复核） */
export default {
  path: '/admin/users',
  component: Layout,
  name: 'AdminUserMgmt',
  meta: {
    icon: 'ri:user-3-line',
    title: $t('menus.adminUserMgmt'),
    showLink: true
  },
  children: [
    {
      path: 'list',
      name: 'AdminUserList',
      component: () => import('@/views/admin/users/index.vue'),
      meta: {
        title: $t('menus.adminUserList'),
        showLink: true
      }
    },
    {
      path: 'banned',
      name: 'AdminUserBanned',
      component: () => import('@/views/admin/users/banned.vue'),
      meta: {
        title: $t('menus.adminUserBanned'),
        showLink: true
      }
    }
  ]
} satisfies RouteConfigsTable;
