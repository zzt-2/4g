import type { QTableColumn } from 'quasar';

export const commandLogColumns: QTableColumn[] = [
  {
    name: 'timestamp',
    label: '时间',
    field: 'timestamp',
    align: 'left',
    sortable: true,
    style: 'width: 140px',
    headerStyle: 'width: 140px',
  },
  {
    name: 'commandCode',
    label: '功能码',
    field: 'commandCode',
    align: 'left',
    sortable: true,
    style: 'width: 80px',
    headerStyle: 'width: 80px',
  },
  {
    name: 'result',
    label: '结果',
    field: 'result',
    align: 'center',
    sortable: true,
    style: 'width: 80px',
    headerStyle: 'width: 80px',
  },
  {
    name: 'durationMs',
    label: '耗时',
    field: 'durationMs',
    align: 'right',
    sortable: true,
    style: 'width: 80px',
    headerStyle: 'width: 80px',
  },
];
