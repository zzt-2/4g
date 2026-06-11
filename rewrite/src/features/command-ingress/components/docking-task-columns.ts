import type { QTableColumn } from 'quasar';

export const dockingTaskColumns: QTableColumn[] = [
  {
    name: 'testCaseId',
    label: '用例ID',
    field: 'testCaseId',
    align: 'left',
    sortable: true,
  },
  {
    name: 'name',
    label: '任务名称',
    field: 'name',
    align: 'left',
    sortable: true,
  },
  {
    name: 'lifecycle',
    label: '状态',
    field: 'lifecycle',
    align: 'center',
    sortable: true,
    style: 'width: 100px',
    headerStyle: 'width: 100px',
  },
  {
    name: 'progress',
    label: '进度',
    field: 'progress',
    align: 'center',
    sortable: false,
    style: 'width: 80px',
    headerStyle: 'width: 80px',
  },
  {
    name: 'startedAt',
    label: '开始时间',
    field: 'startedAt',
    align: 'left',
    sortable: true,
    style: 'width: 160px',
    headerStyle: 'width: 160px',
  },
  {
    name: 'actions',
    label: '操作',
    field: 'actions',
    align: 'center',
    sortable: false,
    style: 'width: 80px',
    headerStyle: 'width: 80px',
  },
];
