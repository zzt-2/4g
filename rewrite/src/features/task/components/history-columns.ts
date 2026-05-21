import type { QTableColumn } from 'quasar';
import type { ReadonlyTaskInstanceState } from '../core';

export interface HistoryTableRow {
  readonly instanceId: string;
  readonly name: string;
  readonly scheduleKind: string;
  readonly scheduleKindDisplay: { readonly color: string; readonly label: string };
  readonly lifecycle: string;
  readonly elapsedMs: number;
  readonly finishedAt: string;
  readonly _original: ReadonlyTaskInstanceState;
}

export const historyColumns: QTableColumn[] = [
  {
    name: 'name',
    label: '名称',
    field: 'name',
    align: 'left',
    sortable: true,
  },
  {
    name: 'scheduleKind',
    label: '调度类型',
    field: 'scheduleKind',
    align: 'center',
    sortable: true,
    style: 'width: 100px',
  },
  {
    name: 'result',
    label: '结果',
    field: 'lifecycle',
    align: 'center',
    style: 'width: 80px',
  },
  {
    name: 'elapsed',
    label: '耗时',
    field: 'elapsedMs',
    align: 'center',
    style: 'width: 100px',
  },
  {
    name: 'finishedAt',
    label: '完成时间',
    field: 'finishedAt',
    align: 'center',
    sortable: true,
    style: 'width: 140px',
  },
  {
    name: '_actions',
    label: '操作',
    field: '_actions',
    align: 'center',
    style: 'width: 120px',
  },
];
