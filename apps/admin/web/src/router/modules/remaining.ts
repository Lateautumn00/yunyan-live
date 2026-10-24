import { $t } from '@/plugins/i18n';
const Layout = () => import('@/layout/index.vue');

export default [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: {
      title: $t('menus.pureLogin'),
      showLink: false
    }
  },
  {
    path: '/redirect',
    component: Layout,
    meta: {
      title: $t('status.pureLoad'),
      showLink: false
    },
    children: [
      {
        path: '/redirect/:path(.*)',
        name: 'Redirect',
        component: () => import('@/layout/redirect.vue')
      }
    ]
  }
] satisfies Array<RouteConfigsTable>;
