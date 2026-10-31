import { $t } from '@/plugins/i18n';

/** 审计日志查看模块（只读） */
export default {
  path: '/admin/audit',
  name: 'AdminAudit',
  redirect: '/admin/audit/logs',
  meta: {
    icon: 'ri:file-list-3-line',
    title: $t('menus.adminAudit'),
    showLink: true,
    rank: 4
  },
  children: [
    {
      path: '/admin/audit/logs',
      name: 'AdminAuditLogs',
      component: () => import('@/views/admin/audit/index.vue'),
      meta: {
        title: $t('menus.adminAuditLogs'),
        showLink: true
      }
    }
  ]
} satisfies RouteConfigsTable;
