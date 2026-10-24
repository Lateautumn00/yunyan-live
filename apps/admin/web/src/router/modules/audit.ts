import { $t } from '@/plugins/i18n';
const Layout = () => import('@/layout/index.vue');

/** 审计日志查看模块（只读） */
export default {
  path: '/admin/audit',
  component: Layout,
  name: 'AdminAudit',
  meta: {
    icon: 'ri:file-list-3-line',
    title: $t('menus.adminAudit'),
    showLink: true
  },
  children: [
    {
      path: 'logs',
      name: 'AdminAuditLogs',
      component: () => import('@/views/admin/audit/index.vue'),
      meta: {
        title: $t('menus.adminAuditLogs'),
        showLink: true
      }
    }
  ]
} satisfies RouteConfigsTable;
