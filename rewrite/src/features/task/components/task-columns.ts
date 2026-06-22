import type { QTableColumn } from 'quasar';
import type { ReadonlyTaskInstanceState } from '../core';

export interface TaskTableRow {
  readonly instanceId: string;
  readonly name: string;
  readonly templateId?: string;
  readonly scheduleKind: string;
  readonly scheduleKindDisplay: { readonly color: string; readonly label: string };
  readonly defaultTargetId?: string;
  readonly lifecycle: string;
  readonly displayStatus: string;
  readonly progressPercent: number;
  readonly progressLabel: string;
  readonly _original: ReadonlyTaskInstanceState;
}

export const taskColumns: QTableColumn[] = [
  {
    name: 'name',
    label: '名称',
    field: 'name',
    align: 'left',
    sortable: true,
  },
  {
    name: 'templateId',
    label: '来源模板',
    field: 'templateId',
    align: 'left',
    style: 'width: 120px',
    headerStyle: 'width: 120px',
  },
  {
    name: 'scheduleKind',
    label: '调度类型',
    field: 'scheduleKind',
    align: 'center',
    sortable: true,
    style: 'width: 120px',
    headerStyle: 'width: 120px',
  },
  {
    name: 'defaultTargetId',
    label: '默认发送目标',
    field: 'defaultTargetId',
    align: 'left',
    style: 'width: 160px',
    headerStyle: 'width: 160px',
  },
  {
    name: 'status',
    label: '状态',
    field: 'displayStatus',
    align: 'center',
    sortable: true,
    style: 'width: 100px',
    headerStyle: 'width: 100px',
  },
  {
    name: 'progress',
    label: '进度',
    field: 'progressPercent',
    align: 'center',
    style: 'width: 120px',
    headerStyle: 'width: 120px',
  },
  {
    name: '_actions',
    label: '操作',
    field: '_actions',
    align: 'center',
    style: 'width: 140px',
    headerStyle: 'width: 140px',
  },
];
