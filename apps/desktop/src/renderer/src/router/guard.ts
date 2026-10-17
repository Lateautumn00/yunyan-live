import type { Router } from 'vue-router';

export function setupRouterGuard(router: Router) {
  router.beforeEach((to, _from) => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : '';

    // 未登录 → 跳转到登录页并记住原始目标（分享链接 /join 直达场景）
    if (!token && to.path !== '/login') {
      return { path: '/login', query: { redirect: to.fullPath } };
    }

    // 已登录访问登录页 → 有 redirect 回原目标，否则按角色跳转
    if (token && to.path === '/login') {
      if (redirect) {
        return redirect;
      }
      if (role === '1') {
        return '/teacher/mylive';
      } else {
        return '/student/rooms';
      }
    }

    // 未登录访问登录页 → 放行
    if (!token && to.path === '/login') {
      return;
    }

    // 角色权限检查
    if (role === '1' && to.path.startsWith('/student')) {
      return '/teacher/mylive';
    }

    if (role === '2' && to.path.startsWith('/teacher')) {
      return '/student/rooms';
    }
  });
}
