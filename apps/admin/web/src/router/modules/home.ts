import { $t } from '@/plugins/i18n';
const Layout = () => import('@/layout/index.vue');

export default {
  path: '/',
  name: 'Home',
  component: Layout,
  redirect: '/admin/dashboard/overview',
  meta: {
    title: $t('menus.pureHome'),
    showLink: false,
    rank: 0
  },
  children: []
} satisfies RouteConfigsTable;
