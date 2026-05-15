import type { QTableColumn } from 'quasar';

export const dockingTaskColumns: QTableColumn[] = [
  {
    name: 'taskId',
    label: '任务ID',
    field: 'taskId',
    align: 'left',
    sortable: true,
  },
  {
    name: 'caseCount',
    label: '用例数',
    field: 'caseCount',
    align: 'right',
    sortable: true,
    style: 'width: 80px',
    headerStyle: 'width: 80px',
  },
  {
    name: 'status',
    label: '状态',
    field: 'status',
    align: 'center',
    sortable: true,
    style: 'width: 100px',
    headerStyle: 'width: 100px',
  },
  {
    name: 'issuedAt',
    label: '下发时间',
    field: 'issuedAt',
    align: 'left',
    sortable: true,
    style: 'width: 140px',
    headerStyle: 'width: 140px',
  },
  {
    name: 'actions',
    label: '操作',
    field: 'actions',
    align: 'center',
    sortable: false,
    style: 'width: 100px',
    headerStyle: 'width: 100px',
  },
];
