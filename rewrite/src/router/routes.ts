import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('../app/AppShell.vue'),
    children: [
      { path: '', component: () => import('../pages/HomePage.vue') },
      { path: 'connection', component: () => import('../pages/ConnectionPage.vue') },
      { path: 'frames', component: () => import('../pages/FrameListPage.vue') },
      { path: 'frames/editor/:frameId?', component: () => import('../pages/FrameEditorPage.vue') },
      { path: 'send', component: () => import('../pages/SendPage.vue') },
      { path: 'tasks', component: () => import('../pages/TaskManagePage.vue') },
      { path: 'command-ingress', component: () => import('../pages/CommandIngressPage.vue') },
    ],
  },
];

export default routes;
