import type { QTableColumn } from 'quasar';

interface InstanceTableRow {
  readonly instanceId: string;
  readonly name: string;
  readonly fieldCount: number;
  readonly sendCount: number;
  readonly lastSendAt?: string;
  readonly description?: string;
  readonly _index: number;
}

export type { InstanceTableRow };

// Module-level constant (O4) — column definitions for send instance table
export const instanceColumns: QTableColumn[] = [
  {
    name: '_index',
    label: '#',
    field: '_index',
    align: 'center',
    sortable: false,
    style: 'width: 60px',
    headerStyle: 'width: 60px',
  },
  {
    name: 'name',
    label: '名称',
    field: 'name',
    align: 'left',
    sortable: true,
  },
  {
    name: 'fieldCount',
    label: '参数数',
    field: 'fieldCount',
    align: 'center',
    sortable: true,
    style: 'width: 80px',
    headerStyle: 'width: 80px',
  },
  {
    name: 'sendCount',
    label: '发送次数',
    field: 'sendCount',
    align: 'center',
    sortable: true,
    style: 'width: 80px',
    headerStyle: 'width: 80px',
  },
  {
    name: 'lastSendAt',
    label: '上次发送',
    field: 'lastSendAt',
    align: 'center',
    sortable: true,
    style: 'width: 140px',
    headerStyle: 'width: 140px',
  },
  {
    name: 'description',
    label: '备注',
    field: 'description',
    align: 'left',
    sortable: false,
  },
  {
    name: '_actions',
    label: '操作',
    field: '_actions',
    align: 'center',
    sortable: false,
    style: 'width: 80px',
    headerStyle: 'width: 80px',
  },
];
