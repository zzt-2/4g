import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('../app/AppShell.vue'),
    children: [{ path: '', component: () => import('../pages/HomePage.vue') }],
  },
];

export default routes;
