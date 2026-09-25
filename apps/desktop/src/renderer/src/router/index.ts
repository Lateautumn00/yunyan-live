import { createRouter, createWebHashHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: () => {
      const role = localStorage.getItem('role');
      return role === '1' ? '/teacher/mylive' : '/student/rooms';
    }
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/login/index.vue')
  },
  {
    path: '/teacher',
    name: 'teacher',
    component: () => import('@/pages/teacher/index.vue')
  },
  {
    path: '/teacher/mylive',
    name: 'teacher.mylive',
    component: () => import('@/pages/teacher/mylive/index.vue')
  },
  {
    path: '/teacher/mylive/watchlist',
    name: 'teacher.mylive.watchlist',
    component: () => import('@/pages/teacher/mylive/watchlist/index.vue')
  },
  {
    path: '/teacher/playback',
    name: 'teacher.playback',
    component: () => import('@/pages/teacher/playback/index.vue')
  },
  {
    path: '/teacher/playback/detail',
    name: 'teacher.playback.detail',
    component: () => import('@/pages/teacher/playback/detail/index.vue')
  },
  {
    path: '/teacher/playback/detail/playback',
    name: 'teacher.playback.detail.playback',
    component: () => import('@/pages/teacher/playback/detail/playback.vue')
  },
  {
    path: '/teacher/statistics',
    name: 'teacher.statistics',
    component: () => import('@/pages/teacher/statistics/index.vue')
  },
  {
    path: '/teacher/transfer',
    name: 'teacher.transfer',
    component: () => import('@/pages/teacher/transfer/index.vue')
  },
  {
    path: '/teacher/createlive',
    name: 'teacher.createlive',
    component: () => import('@/pages/teacher/createlive/index.vue')
  },
  {
    path: '/teacher/createlive/detail',
    name: 'teacher.createlive.detail',
    component: () => import('@/pages/teacher/createlive/detail/index.vue')
  },
  {
    path: '/student/rooms',
    name: 'student.rooms',
    component: () => import('@/pages/student/rooms/index.vue')
  },
  {
    path: '/classroom/largeteacher',
    name: 'classroom.large-teacher',
    component: () => import('@/pages/classroom/largeteacher.vue')
  },
  {
    path: '/classroom/largestudent',
    name: 'classroom.large-student',
    component: () => import('@/pages/classroom/largestudent.vue')
  },
  {
    path: '/classroom/smallteacher',
    name: 'classroom.small-teacher',
    component: () => import('@/pages/classroom/smallteacher.vue')
  },
  {
    path: '/classroom/smallstudent',
    name: 'classroom.small-student',
    component: () => import('@/pages/classroom/smallstudent.vue')
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

export default router;
