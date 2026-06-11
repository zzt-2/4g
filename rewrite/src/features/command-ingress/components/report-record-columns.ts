import type { QTableColumn } from 'quasar';

export const reportRecordColumns: QTableColumn[] = [
  {
    name: 'testCaseId',
    label: '用例ID',
    field: 'testCaseId',
    align: 'left',
    sortable: true,
  },
  {
    name: 'verdict',
    label: '结果',
    field: 'verdict',
    align: 'center',
    sortable: true,
    style: 'width: 100px',
    headerStyle: 'width: 100px',
  },
  {
    name: 'reportedAt',
    label: '上报时间',
    field: 'reportedAt',
    align: 'left',
    sortable: true,
    style: 'width: 160px',
    headerStyle: 'width: 160px',
  },
];
