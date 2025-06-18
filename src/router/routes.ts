import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      { path: '', component: () => import('../pages/home/HomePage.vue') },
      {
        path: '/connect',
        component: () => import('../pages/ConnectConfigPage.vue'),
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
        path: '/frames/receive',
        component: () => import('../pages/ReceiveFramePage.vue'),
      },
      {
        path: '/settings',
        component: () => import('../pages/settings/Index.vue'),
      },
      {
        path: '/storage',
        component: () => import('../pages/storage/HighSpeedStoragePage.vue'),
      },
      {
        path: '/history',
        component: () => import('../pages/HistoryAnalysisPage.vue'),
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
