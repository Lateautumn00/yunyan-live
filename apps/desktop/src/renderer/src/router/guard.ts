import type { Router } from 'vue-router';

export function setupRouterGuard(router: Router) {
  router.beforeEach((to, _from) => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');

    // 未登录 → 跳转到登录页
    if (!token && to.path !== '/login') {
      return '/login';
    }

    // 已登录访问登录页 → 按角色跳转
    if (token && to.path === '/login') {
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
