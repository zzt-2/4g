import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      { path: '', component: () => import('../pages/home/HomePage.vue') },
      {
        path: '/serial/config',
        component: () => import('../pages/SerialConfigPage.vue'),
      },
      {
        path: '/frames/list',
        component: () => import('../pages/frames/FrameList.vue'),
      },
      {
        path: '/frames/editor',
        component: () => import('../pages/frames/FrameEditor.vue'),
      },
      {
        path: '/frames/send',
        component: () => import('../pages/FrameSendPage.vue'),
      },
      {
        path: '/settings',
        component: () => import('../pages/settings/Index.vue'),
      },
    ],
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;
